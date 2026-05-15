from __future__ import annotations

from .base import ProviderInfo
from .gemini import GeminiProvider
from .openai_compatible import OpenAICompatibleProvider
from ..config import settings


def _providers() -> dict[str, object]:
    return {
        "bothub": OpenAICompatibleProvider(
            provider_id="bothub",
            label="BotHub",
            api_key=settings.bothub_api_key,
            model=settings.bothub_model,
            base_url=settings.bothub_base_url,
        ),
        "openrouter": OpenAICompatibleProvider(
            provider_id="openrouter",
            label="OpenRouter",
            api_key=settings.openrouter_api_key,
            model=settings.openrouter_model,
            base_url=settings.openrouter_base_url,
            extra_headers={
                "HTTP-Referer": settings.openrouter_http_referer,
                "X-Title": settings.openrouter_x_title,
            },
        ),
        "xai": OpenAICompatibleProvider(
            provider_id="xai",
            label="x.ai",
            api_key=settings.xai_api_key,
            model=settings.xai_model,
            base_url=settings.xai_base_url,
        ),
        "openai": OpenAICompatibleProvider(
            provider_id="openai",
            label="OpenAI",
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            base_url=settings.openai_base_url,
        ),
        "gemini": GeminiProvider(api_key=settings.gemini_api_key, model=settings.gemini_model),
        "local": OpenAICompatibleProvider(
            provider_id="local",
            label="Local OpenAI-compatible",
            api_key=settings.local_api_key,
            model=settings.local_model,
            base_url=settings.local_base_url,
            require_api_key=False,
        ),
    }


def get_provider(provider_id: str | None = None):
    providers = _providers()
    selected = (provider_id or settings.llm_provider or "bothub").lower()
    if selected not in providers:
        raise RuntimeError(f"Unknown LLM_PROVIDER '{selected}'. Available: {', '.join(providers)}")
    return providers[selected]


def list_providers() -> list[ProviderInfo]:
    active = (settings.llm_provider or "bothub").lower()
    result: list[ProviderInfo] = []
    for provider_id, provider in _providers().items():
        result.append(
            ProviderInfo(
                id=provider_id,
                label=provider.label,
                configured=provider.configured,
                model=provider.model,
                supports_tools=provider.supports_tools,
                active=provider_id == active,
            )
        )
    return result
