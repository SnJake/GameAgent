from __future__ import annotations

from pathlib import Path

from .config import ROOT_DIR


def read_prompt(name: str) -> str:
    path = ROOT_DIR / "prompts" / name
    return path.read_text(encoding="utf-8")
