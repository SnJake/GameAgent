# Tool Calls

The backend defines three OpenAI-compatible tools:

- `search_arknights`: search indexed operators, enemies, items, stages, and lore.
- `find_images`: search local image assets.
- `save_user_memory`: save a stable user preference.

Tool calls can be enabled in `.env` with:

```env
ENABLE_MODEL_TOOLS=true
```

They can also be toggled per chat request from the UI. If the selected model rejects tool definitions, the backend falls back to context-first retrieval.
