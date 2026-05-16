# Arknights DB Agent Architecture

## Decisions

- Database: SQLite with FTS5. This is the right first version because the app is local, single-user, easy to rebuild, and does not need a Postgres service.
- RAG: yes for lore and story text, but implemented as SQLite FTS first. Embeddings can be added later if keyword search is not enough.
- Tool calls: supported through OpenAI-compatible `tools`, but the backend also does deterministic retrieval before each model call. This keeps the app usable when a model/provider has weak tool-call support.
- User memory: small SQLite key/value memory. It is opt-in through UI and should store preferences, not game facts.
- Token economy: the model receives compact retrieved snippets, not raw JSON files.
- Agent runtime: tool calls are schema-validated, permission-checked, size-bounded, and traced by the backend. Risky external reads can be disabled by config, and local memory writes are separated into a dedicated narrow tool.

## Main Flow

1. User sends a chat message from the UI.
2. Backend searches the SQLite index with FTS5.
3. Backend optionally searches `prts.wiki`, `arknights.wiki.gg`, and `endfield.wiki.gg` through MediaWiki API.
4. Backend optionally searches Brave Search API when web search is enabled.
5. Backend builds compact local and external context blocks.
6. Backend calls BotHub via OpenAI-compatible Chat Completions.
7. Optional tool calls can run additional searches or save memory. Every proposed call receives a structured tool result, including validation errors, permission denials, and budget stops.
8. Backend records an operational trace with provider/model, visible tools, permission decisions, result summaries, token usage when available, and stop reason.
9. UI renders answer, sources, and matching images.

## Future Providers

The current provider is configured with:

- `BOTHUB_BASE_URL`
- `BOTHUB_API_KEY`
- `BOTHUB_MODEL`

OpenRouter can use the same OpenAI-compatible client later. Gemini should be added behind a provider interface because its native API differs.
