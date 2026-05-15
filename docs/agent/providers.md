# LLM Providers

The active provider is selected with:

```env
LLM_PROVIDER=bothub
```

Supported values:

- `bothub`
- `openrouter`
- `xai`
- `openai`
- `gemini`

BotHub, OpenRouter, x.ai, and OpenAI use the shared OpenAI-compatible adapter. Gemini uses the native REST API.

Example:

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=openai/gpt-oss-120b
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

The UI can override the provider per chat request. If no override is selected, the backend uses `LLM_PROVIDER`.

Tool calls are attempted only for providers that support OpenAI-compatible tools. Gemini currently uses retrieval-first context without model tool calls.
