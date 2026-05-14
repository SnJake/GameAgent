from __future__ import annotations

import re
from typing import Any, Iterable


TAG_RE = re.compile(r"<[^>]+>|\[[^\]]+\]")
SPACE_RE = re.compile(r"\s+")
TOKEN_RE = re.compile(r"[\wА-Яа-яЁё一-龥]+", re.UNICODE)


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    text = TAG_RE.sub(" ", text)
    text = text.replace("\\n", " ").replace("\n", " ").replace("\r", " ")
    return SPACE_RE.sub(" ", text).strip()


def compact_join(parts: Iterable[Any], sep: str = "\n") -> str:
    cleaned = [clean_text(part) for part in parts if clean_text(part)]
    return sep.join(cleaned)


def truncate(text: str, limit: int) -> str:
    text = clean_text(text)
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "..."


def chunk_text(text: str, max_chars: int = 1800, overlap: int = 180) -> list[str]:
    text = clean_text(text)
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + max_chars)
        if end < len(text):
            pivot = max(text.rfind(". ", start, end), text.rfind("。", start, end), text.rfind("! ", start, end))
            if pivot > start + max_chars // 2:
                end = pivot + 1
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(0, end - overlap)
    return chunks


def fts_query(query: str) -> str:
    tokens = TOKEN_RE.findall(query.lower())
    tokens = [token for token in tokens if len(token) > 1]
    if not tokens:
        return '""'
    return " OR ".join(f'"{token}"' for token in tokens[:10])
