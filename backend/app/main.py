from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .agent import ChatRequest, ChatResponse, answer
from .config import ROOT_DIR, settings
from .db import init_db
from .indexer import git_pull_allowed_repo, rebuild_index
from .llm import list_providers
from .search import get_stats, image_path_by_id, load_memory, save_memory, search_documents, search_images
from .web_search import search_brave, search_endfield_wiki, search_wikis


app = FastAPI(title="Arknights DB Agent", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict[str, object]:
    stats = get_stats()
    providers = list_providers()
    active_provider = next((provider for provider in providers if provider.active), providers[0])
    return {
        "ok": True,
        "model_configured": active_provider.configured,
        "base_url": settings.bothub_base_url,
        "llm_provider": active_provider.id,
        "llm_model": active_provider.model,
        "providers": [provider.__dict__ for provider in providers],
        "wiki_search_enabled": settings.wiki_search_enabled,
        "endfield_wiki_search_enabled": settings.endfield_wiki_search_enabled,
        "web_search_enabled": settings.web_search_enabled,
        "brave_configured": bool(settings.brave_search_api_key),
        **stats,
    }


@app.get("/api/providers")
def providers() -> dict[str, object]:
    return {
        "active": settings.llm_provider,
        "providers": [provider.__dict__ for provider in list_providers()],
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    try:
        return await answer(request)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/search")
def search(q: str = Query(..., min_length=1), category: str | None = None, limit: int = 8) -> dict[str, object]:
    return {"results": search_documents(q, category=category, limit=limit)}


@app.get("/api/images")
def images(q: str = Query(..., min_length=1), limit: int = 12) -> dict[str, object]:
    return {"results": search_images(q, limit=limit)}


@app.get("/api/web/wiki")
async def wiki_search(q: str = Query(..., min_length=1), limit: int = 6) -> dict[str, object]:
    try:
        return {"results": await search_wikis(q, limit=limit)}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/web/endfield")
async def endfield_wiki_search(q: str = Query(..., min_length=1), limit: int = 6) -> dict[str, object]:
    try:
        return {"results": await search_endfield_wiki(q, limit=limit)}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/web/brave")
async def brave_search(q: str = Query(..., min_length=1), limit: int = 5) -> dict[str, object]:
    try:
        return {"results": await search_brave(q, limit=limit, strict=True)}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/images/{image_id}/file")
def image_file(image_id: int) -> FileResponse:
    path = image_path_by_id(image_id)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path)


@app.get("/api/memory")
def memory_get() -> dict[str, object]:
    return {"memory": load_memory()}


@app.put("/api/memory")
def memory_put(payload: dict[str, str]) -> dict[str, object]:
    try:
        save_memory(payload.get("key", ""), payload.get("value", ""))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "memory": load_memory()}


@app.post("/api/index/rebuild")
async def index_rebuild() -> dict[str, object]:
    try:
        return await asyncio.to_thread(rebuild_index)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/admin/git-pull")
async def git_pull(repo: str = Query(...)) -> dict[str, object]:
    try:
        output = await asyncio.to_thread(git_pull_allowed_repo, repo)
        return {"ok": True, "output": output}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


ui_dist = ROOT_DIR / "frontend" / "dist"
if (ui_dist / "assets").exists():
    app.mount("/assets", StaticFiles(directory=ui_dist / "assets"), name="assets")


@app.get("/")
def root() -> FileResponse:
    index = ui_dist / "index.html"
    if not index.exists():
        raise HTTPException(status_code=404, detail="Frontend is not built yet. Run npm install && npm run build in frontend.")
    return FileResponse(index)
