from __future__ import annotations

from typing import Any

import httpx

from ..config import settings


class OpenAICompatibleProvider:
    supports_tools = True

    def __init__(
        self,
        *,
        provider_id: str,
        label: str,
        api_key: str,
        model: str,
        base_url: str,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        self.id = provider_id
        self.label = label
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.extra_headers = extra_headers or {}

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.model and self.base_url)

    @property
    def chat_url(self) -> str:
        return self.base_url + "/chat/completions"

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise RuntimeError(f"{self.label} API key is empty. Fill .env before chatting with this provider.")
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            **self.extra_headers,
        }

    async def chat(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        if not self.model:
            raise RuntimeError(f"{self.label} model is empty. Fill .env with a model id.")
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": settings.llm_temperature,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            response = await client.post(self.chat_url, headers=self._headers(), json=payload)
            response.raise_for_status()
            return response.json()
