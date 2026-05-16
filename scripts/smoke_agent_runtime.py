from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.agent import _execute_tool  # noqa: E402


async def main() -> int:
    trace: list[dict[str, object]] = []
    cases = [
        ("search_arknights", "{bad", "invalid_arguments"),
        ("search_arknights", '{"query":"Amiya","extra":1}', "invalid_arguments"),
        ("search_web", '{"query":"latest arknights"}', "permission_denied"),
        ("unknown_tool", '{"query":"Amiya"}', "unknown_tool"),
    ]

    failures: list[str] = []
    for index, (tool, args, expected_type) in enumerate(cases, start=1):
        raw = await _execute_tool(tool, args, trace, call_id=f"smoke_{index}")
        payload = json.loads(raw)
        actual_type = payload.get("type")
        if payload.get("status") != "error" or actual_type != expected_type:
            failures.append(f"{tool}: expected {expected_type}, got {payload}")

    if failures:
        for failure in failures:
            print(failure)
        return 1

    print(f"ok: {len(cases)} invariant checks, {len(trace)} trace events")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
