from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class ProviderInfo:
    id: str
    label: str
    configured: bool
    model: str
    supports_tools: bool
    active: bool = False


@dataclass
class ChatResult:
    text: str
    raw: dict[str, Any] = field(default_factory=dict)


class LLMProvider(Protocol):
    id: str
    label: str
    model: str
    supports_tools: bool

    @property
    def configured(self) -> bool:
        ...

    async def chat(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        ...


def extract_openai_text(data: dict[str, Any]) -> str:
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
