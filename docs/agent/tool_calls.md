# Tool Calls

The backend exposes a narrow OpenAI-compatible tool registry. Each tool has a local schema, risk class, side-effect class, permission policy, item limit, and structured result format. The model proposes a tool call; the backend validates and executes it.

Current tools:

- `search_arknights`: read-only search over the local SQLite/FTS Arknights index.
- `search_wikis`: external read from `prts.wiki` and `arknights.wiki.gg`, allowed only when wiki search is enabled.
- `search_endfield_wiki`: external read from `endfield.wiki.gg`, allowed only when Endfield wiki search is enabled.
- `search_web`: external read through Brave Search, allowed only when web search is enabled and Brave is configured.
- `find_images`: read-only search over local image assets.
- `save_user_memory`: local write for stable user preferences explicitly stated by the user.

Tool calls can be enabled in `.env` with:

```env
ENABLE_MODEL_TOOLS=true
AGENT_MAX_TOOL_CALLS=6
AGENT_MAX_TOOL_RESULT_CHARS=12000
```

They can also be toggled per chat request from the UI. If the selected model rejects tool definitions, the backend falls back to context-first retrieval.

Runtime invariants:

- Unknown tools always receive a structured `unknown_tool` result.
- Invalid JSON, missing required fields, unknown properties, enum mismatches, and limit violations return `invalid_arguments`.
- Disabled external search tools return `permission_denied` instead of being executed.
- The model receives one tool result for every requested tool call, including skipped calls after the per-run budget is exhausted.
- Large tool results are compacted before being returned to the model.
- The chat response includes an operational `trace_id`, `stop_reason`, and trace events for debugging without exposing hidden reasoning.

Smoke check:

```bat
.venv\Scripts\python.exe scripts\smoke_agent_runtime.py
```
