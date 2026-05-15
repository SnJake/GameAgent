from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from html import unescape
from typing import Any

import httpx

from .config import settings
from .db import get_db, init_db
from .text import clean_text, truncate


USER_AGENT = "GameAgent/0.1 (local Arknights assistant)"
WIKI_SITES = {
    "arknights.wiki.gg": {
        "source": "arknights.wiki.gg",
        "api": "https://arknights.wiki.gg/api.php",
        "page": "https://arknights.wiki.gg/wiki/{title}",
    },
    "prts.wiki": {
        "source": "prts.wiki",
        "api": "https://prts.wiki/api.php",
        "page": "https://prts.wiki/w/{title}",
    },
}
ENDFIELD_WIKI_SITE = {
    "source": "endfield.wiki.gg",
    "api": "https://endfield.wiki.gg/api.php",
    "page": "https://endfield.wiki.gg/wiki/{title}",
}


def _cache_key(provider: str, query: str, limit: int) -> str:
    raw = f"{provider}:{limit}:{query.strip().lower()}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _cache_get(key: str, ttl_minutes: int) -> list[dict[str, Any]] | None:
    init_db()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=ttl_minutes)
    with get_db() as conn:
        row = conn.execute("SELECT payload_json, updated_at FROM web_cache WHERE cache_key = ?", (key,)).fetchone()
    if not row:
        return None
    updated = datetime.fromisoformat(str(row["updated_at"]).replace("Z", "+00:00"))
    if updated.tzinfo is None:
        updated = updated.replace(tzinfo=timezone.utc)
    if updated < cutoff:
        return None
    try:
        payload = json.loads(row["payload_json"])
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, list) else None


def _cache_set(key: str, payload: list[dict[str, Any]]) -> None:
    init_db()
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO web_cache(cache_key, payload_json, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(cache_key) DO UPDATE
            SET payload_json=excluded.payload_json, updated_at=CURRENT_TIMESTAMP
            """,
            (key, json.dumps(payload, ensure_ascii=False)),
        )


def _wiki_url(site: dict[str, str], title: str) -> str:
    return site["page"].format(title=title.replace(" ", "_"))


async def _search_mediawiki_sites(
    query: str,
    sites: list[dict[str, str]],
    *,
    limit: int,
    cache_provider: str,
) -> list[dict[str, Any]]:
    query = query.strip()
    if not query:
        return []
    max_results = max(1, min(limit, 10))
    key = _cache_key(cache_provider, query, max_results)
    cached = _cache_get(key, ttl_minutes=1440)
    if cached is not None:
        return cached

    results: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=25, headers={"User-Agent": USER_AGENT}) as client:
        for site in sites:
            search_response = await client.get(
                site["api"],
                params={
                    "action": "query",
                    "list": "search",
                    "srsearch": query,
                    "srlimit": max_results,
                    "format": "json",
                    "formatversion": 2,
                },
            )
            search_response.raise_for_status()
            pages = search_response.json().get("query", {}).get("search", [])
            page_ids = [str(page.get("pageid")) for page in pages if page.get("pageid")]
            extracts: dict[int, str] = {}
            if page_ids:
                extract_response = await client.get(
                    site["api"],
                    params={
                        "action": "query",
                        "prop": "extracts",
                        "pageids": "|".join(page_ids),
                        "explaintext": 1,
                        "exintro": 1,
                        "format": "json",
                        "formatversion": 2,
                    },
                )
                extract_response.raise_for_status()
                for page in extract_response.json().get("query", {}).get("pages", []):
                    extracts[int(page.get("pageid", 0))] = clean_text(page.get("extract", ""))
            for page in pages:
                title = clean_text(page.get("title", ""))
                page_id = int(page.get("pageid", 0))
                snippet = clean_text(unescape(page.get("snippet", "")))
                body = extracts.get(page_id) or snippet
                results.append(
                    {
                        "id": f"{site['source']}:{page_id}",
                        "source": site["source"],
                        "category": "wiki",
                        "title": title,
                        "url": _wiki_url(site, title),
                        "snippet": truncate(body, 900),
                        "body": truncate(body, 1600),
                    }
                )
    results = results[: max_results * len(sites)]
    _cache_set(key, results)
    return results


async def search_wikis(query: str, limit: int | None = None) -> list[dict[str, Any]]:
    if not settings.wiki_search_enabled:
        return []
    max_results = max(1, min(limit or settings.wiki_search_max_results, 10))
    return await _search_mediawiki_sites(
        query,
        list(WIKI_SITES.values()),
        limit=max_results,
        cache_provider="wiki",
    )


async def search_endfield_wiki(query: str, limit: int | None = None) -> list[dict[str, Any]]:
    if not settings.endfield_wiki_search_enabled:
        return []
    max_results = max(1, min(limit or settings.wiki_search_max_results, 10))
    return await _search_mediawiki_sites(
        query,
        [ENDFIELD_WIKI_SITE],
        limit=max_results,
        cache_provider="endfield_wiki",
    )


async def search_brave(query: str, limit: int | None = None, *, strict: bool = False) -> list[dict[str, Any]]:
    if not settings.web_search_enabled:
        if strict:
            raise RuntimeError("WEB_SEARCH_ENABLED=false. Enable it in .env to use Brave search.")
        return []
    if not settings.brave_search_api_key:
        if strict:
            raise RuntimeError("BRAVE_SEARCH_API_KEY is empty. Fill .env to use Brave search.")
        return []
    query = query.strip()
    if not query:
        return []
    max_results = max(1, min(limit or settings.web_search_max_results, 10))
    key = _cache_key("brave", query, max_results)
    cached = _cache_get(key, ttl_minutes=180)
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.get(
            "https://api.search.brave.com/res/v1/web/search",
            params={"q": query, "count": max_results, "text_decorations": 0},
            headers={
                "Accept": "application/json",
                "X-Subscription-Token": settings.brave_search_api_key,
                "User-Agent": USER_AGENT,
            },
        )
        response.raise_for_status()
        data = response.json()
    results = []
    for item in (data.get("web") or {}).get("results", [])[:max_results]:
        title = clean_text(item.get("title", ""))
        description = clean_text(item.get("description", ""))
        url = item.get("url", "")
        results.append(
            {
                "id": url,
                "source": "brave",
                "category": "web",
                "title": title or url,
                "url": url,
                "snippet": truncate(description, 900),
                "body": truncate(description, 1200),
            }
        )
    _cache_set(key, results)
    return results


async def search_external(
    query: str,
    *,
    use_wiki: bool = True,
    use_endfield_wiki: bool = False,
    use_web: bool = False,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    if use_wiki:
        results.extend(await search_wikis(query))
    if use_endfield_wiki:
        results.extend(await search_endfield_wiki(query))
    if use_web:
        results.extend(await search_brave(query))
    return results


def build_external_context(results: list[dict[str, Any]], start_index: int = 1, max_chars: int = 6000) -> str:
    chunks: list[str] = []
    used = 0
    for offset, item in enumerate(results, start=start_index):
        entry = (
            f"[W{offset}] {item['category']} | {item['title']} | {item['source']}\n"
            f"URL: {item.get('url', '')}\n"
            f"{truncate(item.get('body') or item.get('snippet') or '', 1100)}"
        )
        if used + len(entry) > max_chars:
            break
        chunks.append(entry)
        used += len(entry)
    return "\n\n".join(chunks)
