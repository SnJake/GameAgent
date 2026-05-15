from __future__ import annotations

import json
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

from .config import settings
from .llm import get_provider
from .llm.base import extract_openai_text
from .prompts import read_prompt
from .search import build_context, load_memory, save_memory, search_documents, search_images
from .text import truncate
from .web_search import build_external_context, search_brave, search_endfield_wiki, search_external, search_wikis


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(default_factory=list)
    provider: str | None = None
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    use_memory: bool = True
    use_tool_calls: bool | None = None
    use_wiki_search: bool = True
    use_endfield_wiki_search: bool = False
    use_web_search: bool = False
    top_k: int = Field(default=8, ge=1, le=20)
    retrieval_limit: int | None = Field(default=None, ge=1, le=30)
    max_context_chars: int | None = Field(default=None, ge=1000, le=60000)
    max_history_messages: int | None = Field(default=None, ge=2, le=60)


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict[str, Any]] = Field(default_factory=list)
    images: list[dict[str, Any]] = Field(default_factory=list)
    used_tool_calls: bool = False
    model: str = ""
    provider: str = ""


TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_arknights",
            "description": "Search indexed Arknights game data, operators, enemies, items, stages, and lore.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "category": {
                        "type": "string",
                        "enum": ["operator", "enemy", "item", "stage", "lore"],
                    },
                    "limit": {"type": "integer", "minimum": 1, "maximum": 12},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_wikis",
            "description": "Search prts.wiki and arknights.wiki.gg through their MediaWiki APIs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 10},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_endfield_wiki",
            "description": "Search endfield.wiki.gg through its MediaWiki API. Use for Arknights: Endfield questions only.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 10},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Search the public web through Brave Search API. Use only when current external web results are needed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 10},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_images",
            "description": "Find local Arknights images, portraits, avatars, or sprites by name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 12},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_user_memory",
            "description": "Save a stable user preference for later answers. Only use after the user clearly states a preference.",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {"type": "string"},
                    "value": {"type": "string"},
                },
                "required": ["key", "value"],
            },
        },
    },
]


def _latest_user_text(messages: list[ChatMessage]) -> str:
    for message in reversed(messages):
        if message.role == "user":
            return message.content
    return ""


def _memory_block(enabled: bool) -> str:
    if not enabled:
        return ""
    memory = load_memory()
    if not memory:
        return ""
    lines = [f"- {key}: {value}" for key, value in memory.items()]
    return "User memory:\n" + "\n".join(lines)


def _prepare_messages(request: ChatRequest, context: str, external_context: str = "") -> list[dict[str, Any]]:
    system_prompt = read_prompt("system.md")
    memory = _memory_block(request.use_memory)
    system_parts = [system_prompt]
    if memory:
        system_parts.append(memory)
    if context:
        system_parts.append("Local database context. Use only what is relevant and cite source numbers when helpful:\n" + context)
    if external_context:
        system_parts.append(
            "External web/wiki context. Treat it as less authoritative than local game data unless the question asks for web/wiki info. Cite URLs when using it:\n"
            + external_context
        )
    history_limit = request.max_history_messages or settings.max_history_messages
    history = request.messages[-history_limit:]
    return [{"role": "system", "content": "\n\n".join(system_parts)}] + [
        {"role": message.role, "content": message.content} for message in history if message.role != "system"
    ]


async def _execute_tool(name: str, arguments: str) -> str:
    try:
        args = json.loads(arguments or "{}")
    except json.JSONDecodeError:
        args = {}
    if name == "search_arknights":
        result = search_documents(args.get("query", ""), args.get("category"), args.get("limit", 8))
        compact = [
            {
                "title": item["title"],
                "category": item["category"],
                "source": item["source"],
                "path": item["path"],
                "snippet": truncate(item["body"], 900),
            }
            for item in result
        ]
        return json.dumps(compact, ensure_ascii=False)
    if name == "find_images":
        return json.dumps(search_images(args.get("query", ""), args.get("limit", 8)), ensure_ascii=False)
    if name == "search_wikis":
        return json.dumps(await search_wikis(args.get("query", ""), args.get("limit", 6)), ensure_ascii=False)
    if name == "search_endfield_wiki":
        return json.dumps(await search_endfield_wiki(args.get("query", ""), args.get("limit", 6)), ensure_ascii=False)
    if name == "search_web":
        return json.dumps(await search_brave(args.get("query", ""), args.get("limit", 5)), ensure_ascii=False)
    if name == "save_user_memory":
        save_memory(str(args.get("key", "")), str(args.get("value", "")))
        return json.dumps({"ok": True}, ensure_ascii=False)
    return json.dumps({"error": f"Unknown tool {name}"}, ensure_ascii=False)


def _extract_text(data: dict[str, Any]) -> str:
    return extract_openai_text(data)


async def answer(request: ChatRequest) -> ChatResponse:
    provider = get_provider(request.provider)
    if not provider.configured:
        raise RuntimeError(f"{provider.label} is not configured. Fill .env API key and model for this provider.")
    query = _latest_user_text(request.messages)
    retrieval_limit = request.retrieval_limit or request.top_k
    context, sources = build_context(query, limit=retrieval_limit, max_chars=request.max_context_chars)
    external_sources = await search_external(
        query,
        use_wiki=request.use_wiki_search,
        use_endfield_wiki=request.use_endfield_wiki_search,
        use_web=request.use_web_search,
    )
    external_context = build_external_context(external_sources, start_index=len(sources) + 1)
    images = search_images(query, limit=6)
    messages = _prepare_messages(request, context, external_context)
    use_tools = settings.enable_model_tools if request.use_tool_calls is None else request.use_tool_calls
    model_tools = TOOLS if use_tools and provider.supports_tools else None
    try:
        data = await provider.chat(messages, tools=model_tools, model=request.model, temperature=request.temperature)
    except httpx.HTTPStatusError:
        if not model_tools:
            raise
        data = await provider.chat(messages, tools=None, model=request.model, temperature=request.temperature)
        return ChatResponse(
            answer=_extract_text(data),
            sources=sources + external_sources,
            images=images,
            used_tool_calls=False,
            model=request.model or provider.model,
            provider=provider.id,
        )
    choice = (data.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    tool_calls = message.get("tool_calls") or []
    if model_tools and tool_calls:
        messages.append(message)
        for call in tool_calls:
            function = call.get("function") or {}
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.get("id"),
                    "name": function.get("name"),
                    "content": await _execute_tool(function.get("name", ""), function.get("arguments", "{}")),
                }
            )
        final_data = await provider.chat(messages, tools=None, model=request.model, temperature=request.temperature)
        return ChatResponse(
            answer=_extract_text(final_data),
            sources=sources + external_sources,
            images=images,
            used_tool_calls=True,
            model=request.model or provider.model,
            provider=provider.id,
        )
    return ChatResponse(
        answer=_extract_text(data),
        sources=sources + external_sources,
        images=images,
        used_tool_calls=False,
        model=request.model or provider.model,
        provider=provider.id,
    )
