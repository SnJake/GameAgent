# DB GameAgent

DB GameAgent is a local game-database assistant. The current implementation targets Arknights data, story JSON, and image assets, then answers through a cloud or local LLM provider.

The app includes:

- FastAPI backend
- SQLite + FTS5 index
- React/Vite web UI
- chat history in browser localStorage
- local image lookup
- small user memory
- external wiki/web search
- configurable LLM providers

# Examples

<img width="2560" height="1271" alt="Example 2" src="https://github.com/user-attachments/assets/08b46dbd-a0a3-403e-ac87-f8beb0bd2897" />
<img width="2560" height="1271" alt="Example 1" src="https://github.com/user-attachments/assets/7285d47b-eab9-4bd7-95da-3e133f8f4dc7" />

## Supported LLM Providers

Configured from `.env`, selectable in the UI:

- BotHub
- OpenRouter
- x.ai
- OpenAI
- Gemini
- Local OpenAI-compatible API

The local provider can point to KoboldCPP, llama.cpp server, Text Generation WebUI, vLLM, LM Studio, or another server that exposes OpenAI-compatible `/v1/chat/completions` and optionally `/v1/models`.

## Requirements

Install these first:

- Python 3.10+
- Node.js 20+ or 22+
- Git

Node.js is required because the UI is a Vite/React app.

## Quick Start

1. Clone this repository.
2. Copy `.env.example` to `.env`.
3. Fill at least one model provider in `.env`.
4. Clone the Arknights data repositories:

```bat
clone_data_repos.bat
```

5. Build the SQLite index:

```bat
rebuild_index.bat
```

6. Start backend and UI:

```bat
start.bat
```

7. Open:

```text
http://127.0.0.1:5173
```

To stop background processes:

```bat
stop.bat
```

## Data Repositories

The large Arknights data folders are intentionally not committed. They are external repositories:

- `ArknightsGamedata` from `https://github.com/ArknightsAssets/ArknightsGamedata`
- `ArknightsGameData_Zh_CN` from `https://github.com/Kengxxiao/ArknightsGameData.git`
- `ArknightsStoryJson` from `https://github.com/050644zf/ArknightsStoryJson`
- `Arknight-Images` from `https://github.com/Aceship/Arknight-Images`

Use `clone_data_repos.bat` to clone them into the expected paths.

## Environment

Core settings:

```env
LLM_PROVIDER=bothub
LLM_TEMPERATURE=0.2
LLM_TIMEOUT_SECONDS=120
ENABLE_MODEL_TOOLS=true
AGENT_MAX_TOOL_CALLS=6
AGENT_MAX_TOOL_RESULT_CHARS=12000

BOTHUB_API_KEY=
BOTHUB_MODEL=
BOTHUB_BASE_URL=https://bothub.chat/api/v2/openai/v1
```

OpenRouter:

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

x.ai:

```env
LLM_PROVIDER=xai
XAI_API_KEY=
XAI_MODEL=
XAI_BASE_URL=https://api.x.ai/v1
```

OpenAI:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_BASE_URL=https://api.openai.com/v1
```

Gemini:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=
```

Local OpenAI-compatible server:

```env
LLM_PROVIDER=local
LOCAL_BASE_URL=http://127.0.0.1:8080/v1
LOCAL_MODEL=
LOCAL_API_KEY=
```

For local servers without auth, leave `LOCAL_API_KEY` empty.

## UI Controls

The UI supports:

- Russian / English / Chinese / Japanese / Korean language switch
- provider dropdown
- model dropdown loaded from provider `/models`
- model search
- manual model override
- temperature
- source count
- context character limit
- chat history message limit
- model tool call toggle
- Arknights wiki search toggle
- Endfield wiki search toggle
- Brave web search toggle

The "Sources" slider controls retrieval results, not LLM sampler `top_k`.

## External Search

Wiki search:

- `prts.wiki`
- `arknights.wiki.gg`
- optional `endfield.wiki.gg`

Brave Search API can be enabled with:

```env
WEB_SEARCH_ENABLED=true
BRAVE_SEARCH_API_KEY=
```

Endfield wiki search is off by default to avoid mixing Arknights and Arknights: Endfield context:

```env
ENDFIELD_WIKI_SEARCH_ENABLED=true
```

## Indexing

Run:

```bat
rebuild_index.bat
```

The index is stored in:

```text
data/arknights_agent.sqlite
```

SQLite is used because this is a local, single-user app. Postgres can be added later for multi-user hosting or vector search.

## Development

Backend:

```bat
.venv\Scripts\activate.bat
uvicorn backend.app.main:app --host 127.0.0.1 --port 8017
```

Frontend:

```bat
cd frontend
npm install
npm run dev
```

Production-style frontend build:

```bat
cd frontend
npm run build
```

## Notes

- `.env`, data folders, SQLite files, `node_modules`, and local llama.cpp builds are ignored by git.
- Model keys are never stored in the UI.
- Gemini currently uses retrieval-first prompting without model tool calls.
- OpenAI-compatible providers can use model tool calls when enabled. Tool calls are locally schema-validated, permission-checked, bounded by a per-run tool-call budget, and returned to the model as structured observations.
