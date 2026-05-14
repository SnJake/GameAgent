# Arknights DB Agent Architecture

## Decisions

- Database: SQLite with FTS5. This is the right first version because the app is local, single-user, easy to rebuild, and does not need a Postgres service.
- RAG: yes for lore and story text, but implemented as SQLite FTS first. Embeddings can be added later if keyword search is not enough.
- Tool calls: supported through OpenAI-compatible `tools`, but the backend also does deterministic retrieval before each model call. This keeps the app usable when a model/provider has weak tool-call support.
- User memory: small SQLite key/value memory. It is opt-in through UI and should store preferences, not game facts.
- Token economy: the model receives compact retrieved snippets, not raw JSON files.

## Main Flow

1. User sends a chat message from the UI.
2. Backend searches the SQLite index with FTS5.
3. Backend builds a compact context block.
4. Backend calls BotHub via OpenAI-compatible Chat Completions.
5. Optional tool calls can run additional searches or save memory.
6. UI renders answer, sources, and matching images.

## Future Providers

The current provider is configured with:

- `BOTHUB_BASE_URL`
- `BOTHUB_API_KEY`
- `BOTHUB_MODEL`

OpenRouter can use the same OpenAI-compatible client later. Gemini should be added behind a provider interface because its native API differs.
