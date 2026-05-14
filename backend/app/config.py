from __future__ import annotations

from pathlib import Path
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    bothub_api_key: str = ""
    bothub_model: str = ""
    bothub_base_url: str = "https://bothub.chat/api/v2/openai/v1"

    host: str = "127.0.0.1"
    port: int = 8017
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"

    arknights_gamedata: Path = ROOT_DIR / "ArknightsGamedata"
    arknights_gamedata_zh: Path = ROOT_DIR / "ArknightsGameData_Zh_CN"
    arknights_story_json: Path = ROOT_DIR / "ArknightsStoryJson"
    arknights_images: Path = ROOT_DIR / "Arknight-Images"
    database_path: Path = ROOT_DIR / "data" / "arknights_agent.sqlite"

    max_context_results: int = Field(default=8, ge=1, le=30)
    max_context_chars: int = Field(default=9000, ge=1000, le=40000)
    max_history_messages: int = Field(default=8, ge=2, le=40)
    enable_model_tools: bool = False

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def chat_completions_url(self) -> str:
        return self.bothub_base_url.rstrip("/") + "/chat/completions"


settings = Settings()
