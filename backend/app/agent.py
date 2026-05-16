from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
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
    trace_id: str = ""
    stop_reason: str = "final_answer"
    trace: list[dict[str, Any]] = Field(default_factory=list)


@dataclass(frozen=True)
class ToolPolicy:
    risk_class: str
    side_effect: str
    permission: str
    max_items: int
    default_limit: int


class ToolArgumentError(ValueError):
    pass


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
                    "enum": ["operator", "skill", "talent", "enemy", "item", "stage", "lore"],
                    },
                    "limit": {"type": "integer", "minimum": 1, "maximum": 12},
                },
                "required": ["query"],
                "additionalProperties": False,
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
                "additionalProperties": False,
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
                "additionalProperties": False,
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
                "additionalProperties": False,
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
                "additionalProperties": False,
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
                "additionalProperties": False,
            },
        },
    },
]


TOOL_POLICIES: dict[str, ToolPolicy] = {
    "search_arknights": ToolPolicy(
        risk_class="read_only",
        side_effect="none",
        permission="allow_local_index_read",
        max_items=12,
        default_limit=8,
    ),
    "search_wikis": ToolPolicy(
        risk_class="network_open_world",
        side_effect="external_read",
        permission="allow_when_wiki_search_enabled",
        max_items=10,
        default_limit=6,
    ),
    "search_endfield_wiki": ToolPolicy(
        risk_class="network_open_world",
        side_effect="external_read",
        permission="allow_when_endfield_wiki_search_enabled",
        max_items=10,
        default_limit=6,
    ),
    "search_web": ToolPolicy(
        risk_class="network_open_world",
        side_effect="external_read",
        permission="allow_when_web_search_enabled_and_brave_configured",
        max_items=10,
        default_limit=5,
    ),
    "find_images": ToolPolicy(
        risk_class="read_only",
        side_effect="none",
        permission="allow_local_image_index_read",
        max_items=12,
        default_limit=8,
    ),
    "save_user_memory": ToolPolicy(
        risk_class="write_local",
        side_effect="writes_user_memory",
        permission="allow_only_for_explicit_stable_user_preferences",
        max_items=1,
        default_limit=1,
    ),
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


def _tool_schema(name: str) -> dict[str, Any] | None:
    for tool in TOOLS:
        function = tool.get("function") or {}
        if function.get("name") == name:
            return function.get("parameters") or {}
    return None


def _validate_tool_args(name: str, raw_args: dict[str, Any]) -> dict[str, Any]:
    schema = _tool_schema(name)
    policy = TOOL_POLICIES.get(name)
    if not schema or not policy:
        raise ToolArgumentError(f"Unknown tool: {name}")

    properties = schema.get("properties") or {}
    required = set(schema.get("required") or [])
    unknown = sorted(set(raw_args) - set(properties))
    if unknown:
        raise ToolArgumentError(f"Unknown argument(s): {', '.join(unknown)}")

    missing = sorted(key for key in required if key not in raw_args)
    if missing:
        raise ToolArgumentError(f"Missing required argument(s): {', '.join(missing)}")

    args: dict[str, Any] = {}
    for key, spec in properties.items():
        if key not in raw_args:
            continue
        value = raw_args[key]
        expected_type = spec.get("type")
        if expected_type == "string":
            if not isinstance(value, str):
                raise ToolArgumentError(f"{key} must be a string")
            value = value.strip()
            if key in required and not value:
                raise ToolArgumentError(f"{key} cannot be empty")
        elif expected_type == "integer":
            if isinstance(value, bool) or not isinstance(value, int):
                raise ToolArgumentError(f"{key} must be an integer")
            minimum = spec.get("minimum")
            maximum = min(int(spec.get("maximum", policy.max_items)), policy.max_items)
            if minimum is not None and value < int(minimum):
                raise ToolArgumentError(f"{key} must be at least {minimum}")
            if value > maximum:
                raise ToolArgumentError(f"{key} must be at most {maximum}")
        enum_values = spec.get("enum")
        if enum_values and value not in enum_values:
            raise ToolArgumentError(f"{key} must be one of: {', '.join(enum_values)}")
        args[key] = value

    if "limit" in properties and "limit" not in args:
        args["limit"] = policy.default_limit
    return args


def _tool_result(
    *,
    status: Literal["success", "error"],
    summary: str,
    items: list[dict[str, Any]] | None = None,
    error_type: str | None = None,
    next_valid_actions: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "status": status,
        "summary": summary,
    }
    if error_type:
        payload["type"] = error_type
    if items is not None:
        payload["items"] = items
    if metadata:
        payload["metadata"] = metadata
    if next_valid_actions:
        payload["next_valid_actions"] = next_valid_actions
    return payload


def _bounded_tool_result(payload: dict[str, Any]) -> str:
    max_chars = settings.agent_max_tool_result_chars
    encoded = json.dumps(payload, ensure_ascii=False)
    if len(encoded) <= max_chars:
        return encoded

    compact = dict(payload)
    compact["truncated"] = True
    items = compact.get("items")
    if isinstance(items, list):
        total_items = len(items)
        for item_limit in (8, 5, 3, 1):
            for snippet_limit in (900, 480, 220, 80):
                next_items: list[dict[str, Any]] = []
                for item in items[:item_limit]:
                    if not isinstance(item, dict):
                        continue
                    next_item = dict(item)
                    for key in ("snippet", "body", "text", "extract"):
                        if key in next_item:
                            next_item[key] = truncate(str(next_item[key]), snippet_limit)
                    next_items.append(next_item)
                compact["items"] = next_items
                compact["metadata"] = {
                    **(compact.get("metadata") if isinstance(compact.get("metadata"), dict) else {}),
                    "returned_items": len(next_items),
                    "total_items_before_truncation": total_items,
                }
                encoded = json.dumps(compact, ensure_ascii=False)
                if len(encoded) <= max_chars:
                    return encoded

    fallback = {
        "status": compact.get("status", "error"),
        "summary": truncate(str(compact.get("summary", "Tool result exceeded the size budget.")), 600),
        "truncated": True,
    }
    if "type" in compact:
        fallback["type"] = compact["type"]
    return json.dumps(fallback, ensure_ascii=False)


def _trace_event(trace: list[dict[str, Any]], event_type: str, **fields: Any) -> None:
    trace.append({"type": event_type, **fields})


def _args_hash(args: dict[str, Any]) -> str:
    encoded = json.dumps(args, ensure_ascii=False, sort_keys=True)
    return str(uuid.uuid5(uuid.NAMESPACE_URL, encoded))[:12]


def _permission_decision(name: str) -> tuple[Literal["allow", "deny"], str]:
    if name == "search_wikis" and not settings.wiki_search_enabled:
        return "deny", "wiki_search_disabled"
    if name == "search_endfield_wiki" and not settings.endfield_wiki_search_enabled:
        return "deny", "endfield_wiki_search_disabled"
    if name == "search_web":
        if not settings.web_search_enabled:
            return "deny", "web_search_disabled"
        if not settings.brave_search_api_key:
            return "deny", "brave_search_not_configured"
    return "allow", TOOL_POLICIES[name].permission


async def _run_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
    if name == "search_arknights":
        result = search_documents(args["query"], args.get("category"), args.get("limit", 8))

        def snippet_limit(item: dict[str, Any]) -> int:
            return {
                "operator": 3600,
                "skill": 4200,
                "talent": 5200,
            }.get(str(item.get("category")), 1200)

        compact = [
            {
                "title": item["title"],
                "category": item["category"],
                "source": item["source"],
                "path": item["path"],
                "snippet": truncate(item["body"], snippet_limit(item)),
            }
            for item in result
        ]
        return _tool_result(status="success", summary=f"Found {len(compact)} local result(s).", items=compact)
    if name == "find_images":
        items = search_images(args["query"], args.get("limit", 8))
        return _tool_result(status="success", summary=f"Found {len(items)} image result(s).", items=items)
    if name == "search_wikis":
        items = await search_wikis(args["query"], args.get("limit", 6))
        return _tool_result(status="success", summary=f"Found {len(items)} wiki result(s).", items=items)
    if name == "search_endfield_wiki":
        items = await search_endfield_wiki(args["query"], args.get("limit", 6))
        return _tool_result(status="success", summary=f"Found {len(items)} Endfield wiki result(s).", items=items)
    if name == "search_web":
        items = await search_brave(args["query"], args.get("limit", 5))
        return _tool_result(status="success", summary=f"Found {len(items)} web result(s).", items=items)
    if name == "save_user_memory":
        save_memory(args["key"], args["value"])
        return _tool_result(
            status="success",
            summary="Saved one stable user preference.",
            metadata={"key": args["key"]},
            next_valid_actions=["answer_user"],
        )
    return _tool_result(
        status="error",
        error_type="unknown_tool",
        summary=f"Unknown tool {name}",
        next_valid_actions=["answer_user"],
    )


async def _execute_tool(name: str, arguments: str, trace: list[dict[str, Any]], *, call_id: str = "") -> str:
    policy = TOOL_POLICIES.get(name)
    if not policy or not _tool_schema(name):
        result = _tool_result(
            status="error",
            error_type="unknown_tool",
            summary=f"Unknown tool {name}",
            next_valid_actions=["answer_user"],
        )
        _trace_event(trace, "tool_result", tool=name, call_id=call_id, status="error", error_type="unknown_tool")
        return _bounded_tool_result(result)

    try:
        raw_args = json.loads(arguments or "{}")
    except json.JSONDecodeError as exc:
        result = _tool_result(
            status="error",
            error_type="invalid_arguments",
            summary=f"Tool arguments must be valid JSON: {exc.msg}",
            next_valid_actions=["retry_with_valid_arguments", "answer_user"],
        )
        _trace_event(trace, "tool_result", tool=name, call_id=call_id, status="error", error_type="invalid_arguments")
        return _bounded_tool_result(result)

    if not isinstance(raw_args, dict):
        result = _tool_result(
            status="error",
            error_type="invalid_arguments",
            summary="Tool arguments must be a JSON object.",
            next_valid_actions=["retry_with_valid_arguments", "answer_user"],
        )
        _trace_event(trace, "tool_result", tool=name, call_id=call_id, status="error", error_type="invalid_arguments")
        return _bounded_tool_result(result)

    try:
        args = _validate_tool_args(name, raw_args)
    except ToolArgumentError as exc:
        result = _tool_result(
            status="error",
            error_type="invalid_arguments",
            summary=str(exc),
            next_valid_actions=["retry_with_valid_arguments", "answer_user"],
        )
        _trace_event(trace, "tool_result", tool=name, call_id=call_id, status="error", error_type="invalid_arguments")
        return _bounded_tool_result(result)

    decision, rule = _permission_decision(name)
    _trace_event(
        trace,
        "permission_decision",
        tool=name,
        call_id=call_id,
        risk_class=policy.risk_class,
        side_effect=policy.side_effect,
        decision=decision,
        rule=rule,
        args_hash=_args_hash(args),
    )
    if decision == "deny":
        result = _tool_result(
            status="error",
            error_type="permission_denied",
            summary=f"Tool call denied by policy: {rule}.",
            next_valid_actions=["answer_user"],
        )
        _trace_event(trace, "tool_result", tool=name, call_id=call_id, status="error", error_type="permission_denied")
        return _bounded_tool_result(result)

    try:
        result = await _run_tool(name, args)
    except Exception as exc:
        result = _tool_result(
            status="error",
            error_type="internal_error",
            summary=f"Tool execution failed: {type(exc).__name__}: {exc}",
            next_valid_actions=["answer_user"],
        )
        _trace_event(trace, "tool_result", tool=name, call_id=call_id, status="error", error_type="internal_error")
        return _bounded_tool_result(result)

    _trace_event(
        trace,
        "tool_result",
        tool=name,
        call_id=call_id,
        status=str(result.get("status", "success")),
        summary=truncate(str(result.get("summary", "")), 180),
    )
    return _bounded_tool_result(result)


def _extract_text(data: dict[str, Any]) -> str:
    return extract_openai_text(data)


def _usage(data: dict[str, Any]) -> dict[str, Any]:
    usage = data.get("usage")
    return usage if isinstance(usage, dict) else {}


async def answer(request: ChatRequest) -> ChatResponse:
    trace_id = uuid.uuid4().hex[:12]
    trace: list[dict[str, Any]] = []
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
    _trace_event(
        trace,
        "run_started",
        trace_id=trace_id,
        provider=provider.id,
        model=request.model or provider.model,
        local_sources=len(sources),
        external_sources=len(external_sources),
        images=len(images),
        context_chars=len(context) + len(external_context),
        tools_visible=[(tool.get("function") or {}).get("name") for tool in model_tools or []],
        max_tool_calls=settings.agent_max_tool_calls,
        max_tool_result_chars=settings.agent_max_tool_result_chars,
    )
    try:
        data = await provider.chat(messages, tools=model_tools, model=request.model, temperature=request.temperature)
    except httpx.HTTPStatusError:
        if not model_tools:
            raise
        _trace_event(trace, "tool_mode_fallback", reason="provider_rejected_tool_definitions")
        data = await provider.chat(messages, tools=None, model=request.model, temperature=request.temperature)
        _trace_event(trace, "run_finished", stop_reason="provider_tool_fallback", usage=_usage(data))
        return ChatResponse(
            answer=_extract_text(data),
            sources=sources + external_sources,
            images=images,
            used_tool_calls=False,
            model=request.model or provider.model,
            provider=provider.id,
            trace_id=trace_id,
            stop_reason="provider_tool_fallback",
            trace=trace,
        )
    choice = (data.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    tool_calls = message.get("tool_calls") or []
    if model_tools and tool_calls:
        _trace_event(trace, "model_requested_tools", count=len(tool_calls))
        normalized_tool_calls: list[dict[str, Any]] = []
        for index, call in enumerate(tool_calls):
            normalized_call = dict(call)
            normalized_call["id"] = str(normalized_call.get("id") or f"tool_{index + 1}")
            normalized_tool_calls.append(normalized_call)
        messages.append({**message, "tool_calls": normalized_tool_calls})
        for index, call in enumerate(normalized_tool_calls):
            function = call.get("function") or {}
            call_id = str(call["id"])
            tool_name = str(function.get("name") or "")
            if index >= settings.agent_max_tool_calls:
                content = _bounded_tool_result(
                    _tool_result(
                        status="error",
                        error_type="budget_exceeded",
                        summary="Tool call skipped because the per-run tool-call budget was reached.",
                        next_valid_actions=["answer_user"],
                    )
                )
                _trace_event(
                    trace,
                    "tool_result",
                    tool=tool_name,
                    call_id=call_id,
                    status="error",
                    error_type="budget_exceeded",
                )
            else:
                content = await _execute_tool(
                    tool_name,
                    str(function.get("arguments") or "{}"),
                    trace,
                    call_id=call_id,
                )
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call_id,
                    "name": tool_name,
                    "content": content,
                }
            )
        final_data = await provider.chat(messages, tools=None, model=request.model, temperature=request.temperature)
        _trace_event(trace, "run_finished", stop_reason="final_answer_after_tools", usage=_usage(final_data))
        return ChatResponse(
            answer=_extract_text(final_data),
            sources=sources + external_sources,
            images=images,
            used_tool_calls=True,
            model=request.model or provider.model,
            provider=provider.id,
            trace_id=trace_id,
            stop_reason="final_answer_after_tools",
            trace=trace,
        )
    _trace_event(trace, "run_finished", stop_reason="final_answer", usage=_usage(data))
    return ChatResponse(
        answer=_extract_text(data),
        sources=sources + external_sources,
        images=images,
        used_tool_calls=False,
        model=request.model or provider.model,
        provider=provider.id,
        trace_id=trace_id,
        stop_reason="final_answer",
        trace=trace,
    )
