# Arknights DB Agent

Local Arknights database agent with SQLite search, BotHub/OpenAI-compatible chat, image lookup, small user memory, and a Node.js UI.

It can also search `prts.wiki`, `arknights.wiki.gg`, optional `endfield.wiki.gg`, and optional Brave Search API results.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill `BOTHUB_API_KEY` and `BOTHUB_MODEL`.
3. Run `start.bat`.
4. Open `http://127.0.0.1:5173`.

## Rebuild Index

Run:

```bat
rebuild_index.bat
```

The first rebuild can take a while because story JSON is chunked into SQLite FTS.

## Why SQLite

SQLite is enough for the first local version and avoids running a database service. Postgres is useful later only if you need multi-user access, remote hosting, or pgvector embeddings.
