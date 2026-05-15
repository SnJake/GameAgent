from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from .config import settings
from .db import get_db, init_db
from .text import TOKEN_RE, clean_text, fts_query, truncate


def _row_to_doc(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "source": row["source"],
        "language": row["language"],
        "category": row["category"],
        "external_id": row["external_id"],
        "title": row["title"],
        "body": row["body"],
        "path": row["path"],
        "snippet": row["snippet"] if "snippet" in row.keys() else truncate(row["body"], 360),
    }


def search_documents(query: str, category: str | None = None, limit: int = 8) -> list[dict[str, Any]]:
    init_db()
    match = fts_query(query)
    if match == '""':
        return []
    params: list[Any] = [match]
    where = "documents_fts MATCH ?"
    query_lower = query.lower()
    query_tokens = [token.lower() for token in TOKEN_RE.findall(query) if len(token) > 1]
    if category:
        where += " AND d.category = ?"
        params.append(category)
    fetch_limit = max(10, min(limit * 4, 80))
    params.append(fetch_limit)
    supplemental: list[dict[str, Any]] = []
    with get_db() as conn:
        rows = conn.execute(
            f"""
            SELECT
                d.id, d.source, d.language, d.category, d.external_id, d.title, d.body, d.path,
                snippet(documents_fts, 1, '[', ']', '...', 28) AS snippet,
                bm25(documents_fts) AS rank
            FROM documents_fts
            JOIN documents d ON d.id = documents_fts.rowid
            WHERE {where}
            ORDER BY rank
            LIMIT ?
            """,
            params,
        ).fetchall()
        if not category:
            operator_matches = conn.execute(
                """
                SELECT id, source, language, category, external_id, title, body, path
                FROM documents
                WHERE category = 'operator'
                  AND (
                    lower(title) IN ({})
                    OR lower(external_id) IN ({})
                  )
                LIMIT 8
                """.format(
                    ",".join("?" for _ in query_tokens) or "''",
                    ",".join("?" for _ in query_tokens) or "''",
                ),
                [*query_tokens, *query_tokens],
            ).fetchall() if query_tokens else []
            for operator in operator_matches:
                operator_doc = _row_to_doc(operator) | {"rank": -25}
                if "profession: token" in operator_doc["body"].lower():
                    operator_doc["rank"] = -10
                supplemental.append(operator_doc)
                related = conn.execute(
                    """
                    SELECT id, source, language, category, external_id, title, body, path
                    FROM documents
                    WHERE category IN ('skill', 'talent')
                      AND external_id LIKE ?
                    LIMIT 12
                    """,
                    (f"{operator['external_id']}:%",),
                ).fetchall()
                for row in related:
                    supplemental.append(_row_to_doc(row) | {"rank": -18})
    docs = [_row_to_doc(row) | {"rank": row["rank"]} for row in rows]
    docs.extend(supplemental)
    category_boost = {"operator": -7, "skill": -6, "talent": -5, "enemy": -3, "item": -2, "stage": -2, "lore": 2}

    def score(doc: dict[str, Any]) -> float:
        value = float(doc.get("rank") or 0)
        title = str(doc["title"]).lower()
        external_id = str(doc["external_id"]).lower()
        if query_lower == title or query_lower == external_id:
            value -= 20
        elif query_lower in title:
            value -= 10
        elif query_lower in external_id:
            value -= 8
        for token in query_tokens:
            if token == title:
                value -= 18
            elif token in title:
                value -= 10
            if token in external_id:
                value -= 6
        value += category_boost.get(str(doc["category"]), 0)
        if doc["source"] in {"gamedata_en", "story_en"}:
            value -= 1
        if doc["language"] == "en":
            value -= 0.5
        if str(doc["external_id"]).lower().startswith("token_"):
            value += 20
        if "profession: token" in str(doc["body"]).lower():
            value += 6
        return value

    deduped: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for doc in sorted(docs, key=score):
        key = (str(doc["category"]), str(doc["external_id"]))
        if key in seen:
            continue
        seen.add(key)
        doc.pop("rank", None)
        deduped.append(doc)
        if len(deduped) >= max(1, min(limit, 30)):
            break
    return deduped


def search_images(query: str, limit: int = 12) -> list[dict[str, Any]]:
    init_db()
    match = fts_query(query)
    if match == '""':
        return []
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT i.id, i.name, i.category, i.rel_path, i.search_text,
                   snippet(images_fts, 1, '[', ']', '...', 18) AS snippet,
                   bm25(images_fts) AS rank
            FROM images_fts
            JOIN images i ON i.id = images_fts.rowid
            WHERE images_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (match, max(1, min(limit, 30))),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "category": row["category"],
            "rel_path": row["rel_path"],
            "snippet": row["snippet"],
            "url": f"/api/images/{row['id']}/file",
        }
        for row in rows
    ]


def build_context(query: str, *, limit: int | None = None, max_chars: int | None = None) -> tuple[str, list[dict[str, Any]]]:
    docs = search_documents(query, limit=limit or settings.max_context_results)
    chunks: list[str] = []
    used = 0
    budget = max_chars or settings.max_context_chars
    for index, doc in enumerate(docs, start=1):
        per_doc_limit = {
            "operator": 2800,
            "skill": 4200,
            "talent": 2800,
            "enemy": 1800,
            "item": 1500,
            "stage": 1500,
            "lore": 1300,
        }.get(str(doc["category"]), 1600)
        body = truncate(doc["body"], per_doc_limit)
        entry = (
            f"[{index}] {doc['category']} | {doc['title']} | {doc['source']}:{doc['path'] or doc['external_id']}\n"
            f"{body}"
        )
        if used + len(entry) > budget:
            break
        chunks.append(entry)
        used += len(entry)
    return "\n\n".join(chunks), docs


def get_stats() -> dict[str, Any]:
    init_db()
    with get_db() as conn:
        docs = conn.execute("SELECT COUNT(*) AS count FROM documents").fetchone()["count"]
        images = conn.execute("SELECT COUNT(*) AS count FROM images").fetchone()["count"]
        by_category = conn.execute(
            "SELECT category, COUNT(*) AS count FROM documents GROUP BY category ORDER BY count DESC"
        ).fetchall()
        last_run = conn.execute("SELECT * FROM index_runs ORDER BY id DESC LIMIT 1").fetchone()
    return {
        "database": str(settings.database_path),
        "documents": docs,
        "images": images,
        "categories": [{"category": row["category"], "count": row["count"]} for row in by_category],
        "last_run": dict(last_run) if last_run else None,
    }


def image_path_by_id(image_id: int) -> Path | None:
    init_db()
    with get_db() as conn:
        row = conn.execute("SELECT rel_path FROM images WHERE id = ?", (image_id,)).fetchone()
    if not row:
        return None
    path = (settings.arknights_images / row["rel_path"]).resolve()
    root = settings.arknights_images.resolve()
    if root not in path.parents and path != root:
        return None
    return path


def load_memory() -> dict[str, str]:
    init_db()
    with get_db() as conn:
        rows = conn.execute("SELECT key, value FROM memory ORDER BY key").fetchall()
    return {row["key"]: row["value"] for row in rows}


def save_memory(key: str, value: str) -> None:
    init_db()
    key = clean_text(key)[:80]
    value = clean_text(value)[:1200]
    if not key or not value:
        raise ValueError("Memory key and value are required")
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO memory(key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
            """,
            (key, value),
        )
