from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .config import settings


SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    language TEXT NOT NULL,
    category TEXT NOT NULL,
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    path TEXT,
    extra_json TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_unique
ON documents(source, language, category, external_id);

CREATE INDEX IF NOT EXISTS idx_documents_category
ON documents(category);

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts
USING fts5(
    title,
    body,
    category UNINDEXED,
    source UNINDEXED,
    language UNINDEXED,
    path UNINDEXED,
    content='documents',
    content_rowid='id',
    tokenize='unicode61'
);

CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    rel_path TEXT NOT NULL UNIQUE,
    search_text TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE IF NOT EXISTS images_fts
USING fts5(
    name,
    search_text,
    category UNINDEXED,
    rel_path UNINDEXED,
    content='images',
    content_rowid='id',
    tokenize='unicode61'
);

CREATE TABLE IF NOT EXISTS memory (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS index_runs (
    id INTEGER PRIMARY KEY,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    status TEXT NOT NULL,
    message TEXT,
    documents_count INTEGER DEFAULT 0,
    images_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS web_cache (
    cache_key TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


def connect() -> sqlite3.Connection:
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
        conn.commit()


def reset_index_tables(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM documents_fts")
    conn.execute("DELETE FROM documents")
    conn.execute("DELETE FROM images_fts")
    conn.execute("DELETE FROM images")


def db_exists(path: Path | None = None) -> bool:
    db_path = path or settings.database_path
    return db_path.exists() and db_path.stat().st_size > 0
