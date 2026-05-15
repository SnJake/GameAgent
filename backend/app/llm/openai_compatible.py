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
        require_api_key: bool = True,
    ) -> None:
        self.id = provider_id
        self.label = label
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.extra_headers = extra_headers or {}
        self.require_api_key = require_api_key

    @property
    def configured(self) -> bool:
        has_key = bool(self.api_key) or not self.require_api_key
        return bool(has_key and self.base_url)

    @property
    def chat_url(self) -> str:
        return self.base_url + "/chat/completions"

    def _headers(self) -> dict[str, str]:
        if self.require_api_key and not self.api_key:
            raise RuntimeError(f"{self.label} API key is empty. Fill .env before chatting with this provider.")
        headers = {"Content-Type": "application/json", **self.extra_headers}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        model: str | None = None,
        temperature: float | None = None,
    ) -> dict[str, Any]:
        selected_model = model or self.model
        if not selected_model:
            raise RuntimeError(f"{self.label} model is empty. Fill .env with a model id.")
        payload: dict[str, Any] = {
            "model": selected_model,
            "messages": messages,
            "temperature": settings.llm_temperature if temperature is None else temperature,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            response = await client.post(self.chat_url, headers=self._headers(), json=payload)
            response.raise_for_status()
            return response.json()

    async def list_models(self) -> list[str]:
        if not self.base_url:
            return []
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            response = await client.get(self.base_url + "/models", headers=self._headers())
            response.raise_for_status()
            data = response.json()
        models = data.get("data", data if isinstance(data, list) else [])
        result: list[str] = []
        for item in models:
            if isinstance(item, str):
                result.append(item)
            elif isinstance(item, dict):
                model_id = item.get("id") or item.get("name")
                if model_id:
                    result.append(str(model_id))
        return sorted(set(result), key=str.lower)
