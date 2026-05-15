from __future__ import annotations

from typing import Any

import httpx

from ..config import settings


class GeminiProvider:
    id = "gemini"
    label = "Gemini"
    supports_tools = False

    def __init__(self, *, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.model)

    def _to_contents(self, messages: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
        system_parts: list[str] = []
        contents: list[dict[str, Any]] = []
        for message in messages:
            role = message.get("role")
            content = str(message.get("content", ""))
            if role == "system":
                system_parts.append(content)
                continue
            contents.append(
                {
                    "role": "model" if role == "assistant" else "user",
                    "parts": [{"text": content}],
                }
            )
        return "\n\n".join(system_parts), contents

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        model: str | None = None,
        temperature: float | None = None,
    ) -> dict[str, Any]:
        if not self.configured:
            raise RuntimeError("Gemini API key or model is empty. Fill .env before chatting with Gemini.")
        selected_model = model or self.model
        system_instruction, contents = self._to_contents(messages)
        payload: dict[str, Any] = {
            "contents": contents,
            "generationConfig": {"temperature": settings.llm_temperature if temperature is None else temperature},
        }
        if system_instruction:
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{selected_model}:generateContent"
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            response = await client.post(url, params={"key": self.api_key}, json=payload)
            response.raise_for_status()
            data = response.json()
        text_parts: list[str] = []
        for candidate in data.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                if "text" in part:
                    text_parts.append(part["text"])
        return {"choices": [{"message": {"content": "\n".join(text_parts)}}], "raw": data}

    async def list_models(self) -> list[str]:
        if not self.api_key:
            return []
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            response = await client.get(
                "https://generativelanguage.googleapis.com/v1beta/models",
                params={"key": self.api_key},
            )
            response.raise_for_status()
            data = response.json()
        result: list[str] = []
        for item in data.get("models", []):
            name = str(item.get("name", ""))
            if "generateContent" not in item.get("supportedGenerationMethods", []):
                continue
            result.append(name.removeprefix("models/"))
        return sorted(set(result), key=str.lower)
