from __future__ import annotations

import json
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field

from .config import settings
from .prompts import read_prompt
from .search import build_context, load_memory, save_memory, search_documents, search_images
from .text import truncate


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(default_factory=list)
    use_memory: bool = True
    use_tool_calls: bool | None = None
    top_k: int = Field(default=8, ge=1, le=20)


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict[str, Any]] = Field(default_factory=list)
    images: list[dict[str, Any]] = Field(default_factory=list)
    used_tool_calls: bool = False
    model: str = ""


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


def _headers() -> dict[str, str]:
    if not settings.bothub_api_key:
        raise RuntimeError("BOTHUB_API_KEY is empty. Fill .env before chatting with the model.")
    return {
        "Authorization": f"Bearer {settings.bothub_api_key}",
        "Content-Type": "application/json",
    }


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


def _prepare_messages(request: ChatRequest, context: str) -> list[dict[str, Any]]:
    system_prompt = read_prompt("system.md")
    memory = _memory_block(request.use_memory)
    system_parts = [system_prompt]
    if memory:
        system_parts.append(memory)
    if context:
        system_parts.append("Retrieved context. Use only what is relevant and cite source numbers when helpful:\n" + context)
    history = request.messages[-settings.max_history_messages :]
    return [{"role": "system", "content": "\n\n".join(system_parts)}] + [
        {"role": message.role, "content": message.content} for message in history if message.role != "system"
    ]


def _execute_tool(name: str, arguments: str) -> str:
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
    if name == "save_user_memory":
        save_memory(str(args.get("key", "")), str(args.get("value", "")))
        return json.dumps({"ok": True}, ensure_ascii=False)
    return json.dumps({"error": f"Unknown tool {name}"}, ensure_ascii=False)


async def _post_chat(payload: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(settings.chat_completions_url, headers=_headers(), json=payload)
        response.raise_for_status()
        return response.json()


def _extract_text(data: dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(part.get("text", "") for part in content if isinstance(part, dict))
    return ""


async def answer(request: ChatRequest) -> ChatResponse:
    if not settings.bothub_model:
        raise RuntimeError("BOTHUB_MODEL is empty. Fill .env with the model id you want to use.")
    query = _latest_user_text(request.messages)
    context, sources = build_context(query, limit=request.top_k)
    images = search_images(query, limit=6)
    messages = _prepare_messages(request, context)
    use_tools = settings.enable_model_tools if request.use_tool_calls is None else request.use_tool_calls
    payload: dict[str, Any] = {
        "model": settings.bothub_model,
        "messages": messages,
        "temperature": 0.2,
    }
    if use_tools:
        payload["tools"] = TOOLS
        payload["tool_choice"] = "auto"
    try:
        data = await _post_chat(payload)
    except httpx.HTTPStatusError:
        if not use_tools:
            raise
        payload.pop("tools", None)
        payload.pop("tool_choice", None)
        data = await _post_chat(payload)
        return ChatResponse(answer=_extract_text(data), sources=sources, images=images, used_tool_calls=False, model=settings.bothub_model)
    choice = (data.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    tool_calls = message.get("tool_calls") or []
    if use_tools and tool_calls:
        messages.append(message)
        for call in tool_calls:
            function = call.get("function") or {}
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.get("id"),
                    "name": function.get("name"),
                    "content": _execute_tool(function.get("name", ""), function.get("arguments", "{}")),
                }
            )
        final_payload = {
            "model": settings.bothub_model,
            "messages": messages,
            "temperature": 0.2,
        }
        final_data = await _post_chat(final_payload)
        return ChatResponse(
            answer=_extract_text(final_data),
            sources=sources,
            images=images,
            used_tool_calls=True,
            model=settings.bothub_model,
        )
    return ChatResponse(answer=_extract_text(data), sources=sources, images=images, used_tool_calls=False, model=settings.bothub_model)
