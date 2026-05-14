from __future__ import annotations

import json
import os
import sqlite3
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from .config import settings
from .db import connect, init_db, reset_index_tables
from .text import chunk_text, clean_text, compact_join, truncate


@dataclass(frozen=True)
class SourceRoot:
    name: str
    language: str
    path: Path
    excel_path: Path


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def _rel(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root)).replace("\\", "/")
    except ValueError:
        return str(path)


def _insert_document(
    conn: sqlite3.Connection,
    *,
    source: str,
    language: str,
    category: str,
    external_id: str,
    title: str,
    body: str,
    path: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    body = clean_text(body)
    title = clean_text(title) or external_id
    if not body:
        return
    cursor = conn.execute(
        """
        INSERT INTO documents(source, language, category, external_id, title, body, path, extra_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (source, language, category, external_id, title, body, path, json.dumps(extra or {}, ensure_ascii=False)),
    )
    rowid = cursor.lastrowid
    conn.execute(
        "INSERT INTO documents_fts(rowid, title, body, category, source, language, path) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (rowid, title, body, category, source, language, path),
    )


def _iter_sources() -> Iterable[SourceRoot]:
    candidates = [
        SourceRoot("gamedata_en", "en", settings.arknights_gamedata, settings.arknights_gamedata / "en" / "gamedata" / "excel"),
        SourceRoot("gamedata_cn", "zh_CN", settings.arknights_gamedata, settings.arknights_gamedata / "cn" / "gamedata" / "excel"),
        SourceRoot("zh_cn_extra", "zh_CN", settings.arknights_gamedata_zh, settings.arknights_gamedata_zh / "zh_CN" / "gamedata" / "excel"),
        SourceRoot("story_en", "en", settings.arknights_story_json, settings.arknights_story_json / "en_US" / "gamedata" / "excel"),
    ]
    for source in candidates:
        if source.excel_path.exists():
            yield source


def _skill_summary(skill_id: str, skill_table: dict[str, Any]) -> str:
    skill = skill_table.get(skill_id) or {}
    levels = skill.get("levels") or []
    if not levels:
        return skill_id
    first = levels[0] or {}
    last = levels[-1] or first
    name = clean_text(first.get("name") or last.get("name") or skill_id)
    desc = clean_text(last.get("description") or first.get("description") or "")
    return compact_join([name, desc], ": ")


def _index_characters(conn: sqlite3.Connection, source: SourceRoot) -> int:
    char_path = source.excel_path / "character_table.json"
    skill_path = source.excel_path / "skill_table.json"
    if not char_path.exists():
        return 0
    characters = _load_json(char_path)
    skill_table = _load_json(skill_path) if skill_path.exists() else {}
    count = 0
    for char_id, char in characters.items():
        if not isinstance(char, dict):
            continue
        name = char.get("name") or char_id
        skills = []
        for entry in char.get("skills") or []:
            skill_id = entry.get("skillId") if isinstance(entry, dict) else None
            if skill_id:
                skills.append(_skill_summary(skill_id, skill_table))
        phases = char.get("phases") or []
        costs = []
        for phase in phases:
            if not isinstance(phase, dict):
                continue
            attrs = phase.get("attributesKeyFrames") or []
            if attrs:
                last_attrs = attrs[-1].get("data") or {}
                costs.append(
                    compact_join(
                        [
                            f"HP {last_attrs.get('maxHp')}",
                            f"ATK {last_attrs.get('atk')}",
                            f"DEF {last_attrs.get('def')}",
                            f"RES {last_attrs.get('magicResistance')}",
                            f"Cost {last_attrs.get('cost')}",
                        ],
                        ", ",
                    )
                )
        body = compact_join(
            [
                f"Operator: {name}",
                f"ID: {char_id}",
                f"Profession: {char.get('profession')}",
                f"Position: {char.get('position')}",
                f"Rarity: {char.get('rarity')}",
                f"Tags: {', '.join(char.get('tagList') or [])}",
                f"Description: {char.get('description')}",
                f"Usage: {char.get('itemUsage')}",
                f"Profile: {char.get('itemDesc')}",
                "Skills: " + " | ".join(skills[:4]) if skills else "",
                "Stats: " + " | ".join(costs[-2:]) if costs else "",
            ]
        )
        _insert_document(
            conn,
            source=source.name,
            language=source.language,
            category="operator",
            external_id=char_id,
            title=name,
            body=body,
            path=_rel(char_path, source.path),
            extra={"profession": char.get("profession"), "rarity": char.get("rarity")},
        )
        count += 1
    return count


def _index_items(conn: sqlite3.Connection, source: SourceRoot) -> int:
    path = source.excel_path / "item_table.json"
    if not path.exists():
        return 0
    data = _load_json(path)
    items = data.get("items") if isinstance(data, dict) else {}
    count = 0
    for item_id, item in (items or {}).items():
        if not isinstance(item, dict):
            continue
        name = item.get("name") or item_id
        body = compact_join(
            [
                f"Item: {name}",
                f"ID: {item_id}",
                f"Type: {item.get('itemType')}",
                f"Rarity: {item.get('rarity')}",
                f"Description: {item.get('description')}",
                f"Usage: {item.get('usage')}",
                f"Obtain: {item.get('obtainApproach')}",
            ]
        )
        _insert_document(
            conn,
            source=source.name,
            language=source.language,
            category="item",
            external_id=item_id,
            title=name,
            body=body,
            path=_rel(path, source.path),
        )
        count += 1
    return count


def _index_enemies(conn: sqlite3.Connection, source: SourceRoot) -> int:
    path = source.excel_path / "enemy_handbook_table.json"
    if not path.exists():
        return 0
    data = _load_json(path)
    enemies = data.get("enemyData") if isinstance(data, dict) else {}
    count = 0
    for enemy_id, enemy in (enemies or {}).items():
        if not isinstance(enemy, dict):
            continue
        value = enemy.get("enemyData") if isinstance(enemy.get("enemyData"), dict) else enemy
        name = value.get("name") or enemy.get("name") or enemy_id
        body = compact_join(
            [
                f"Enemy: {name}",
                f"ID: {enemy_id}",
                f"Level type: {value.get('levelType')}",
                f"Enemy race: {value.get('enemyRace') or enemy.get('enemyRace')}",
                f"Attack type: {value.get('attackType')}",
                f"Description: {value.get('description') or enemy.get('description')}",
                f"Ability: {value.get('ability') or enemy.get('ability')}",
            ]
        )
        _insert_document(
            conn,
            source=source.name,
            language=source.language,
            category="enemy",
            external_id=enemy_id,
            title=name,
            body=body,
            path=_rel(path, source.path),
        )
        count += 1
    return count


def _index_stages(conn: sqlite3.Connection, source: SourceRoot) -> int:
    path = source.excel_path / "stage_table.json"
    if not path.exists():
        return 0
    data = _load_json(path)
    stages = data.get("stages") if isinstance(data, dict) else {}
    count = 0
    for stage_id, stage in (stages or {}).items():
        if not isinstance(stage, dict):
            continue
        name = stage.get("name") or stage_id
        body = compact_join(
            [
                f"Stage: {name}",
                f"ID: {stage_id}",
                f"Code: {stage.get('code')}",
                f"Type: {stage.get('stageType')}",
                f"Zone: {stage.get('zoneId')}",
                f"AP cost: {stage.get('apCost')}",
                f"Description: {stage.get('description')}",
                f"Unlock condition: {stage.get('unlockCondition')}",
            ]
        )
        _insert_document(
            conn,
            source=source.name,
            language=source.language,
            category="stage",
            external_id=stage_id,
            title=name,
            body=body,
            path=_rel(path, source.path),
        )
        count += 1
    return count


def _index_story_files(conn: sqlite3.Connection) -> int:
    story_root = settings.arknights_story_json / "en_US" / "gamedata" / "story"
    if not story_root.exists():
        return 0
    count = 0
    for path in story_root.rglob("*.json"):
        try:
            data = _load_json(path)
        except (json.JSONDecodeError, OSError):
            continue
        title = clean_text(data.get("storyName") or data.get("eventName") or path.stem) if isinstance(data, dict) else path.stem
        lines: list[str] = []
        if isinstance(data, dict):
            if data.get("storyInfo"):
                lines.append(str(data.get("storyInfo")))
            for item in data.get("storyList") or []:
                if not isinstance(item, dict):
                    continue
                attrs = item.get("attributes") or {}
                content = clean_text(attrs.get("content"))
                if not content:
                    continue
                speaker = clean_text(attrs.get("name"))
                lines.append(f"{speaker}: {content}" if speaker else content)
        else:
            lines.append(json.dumps(data, ensure_ascii=False))
        text = clean_text("\n".join(lines))
        for idx, chunk in enumerate(chunk_text(text, max_chars=1700, overlap=120)):
            _insert_document(
                conn,
                source="story_json",
                language="en",
                category="lore",
                external_id=f"{_rel(path, story_root)}#{idx}",
                title=f"{title} #{idx + 1}",
                body=chunk,
                path=_rel(path, settings.arknights_story_json),
            )
            count += 1
    return count


def _index_story_metadata(conn: sqlite3.Connection) -> int:
    count = 0
    for filename, category in [("charinfo.json", "lore"), ("chardict.json", "lore"), ("storyinfo.json", "lore")]:
        path = settings.arknights_story_json / "en_US" / filename
        if not path.exists():
            continue
        data = _load_json(path)
        if not isinstance(data, dict):
            continue
        for key, value in data.items():
            if isinstance(value, (dict, list)):
                body = json.dumps(value, ensure_ascii=False)
            else:
                body = str(value)
            for idx, chunk in enumerate(chunk_text(body, max_chars=1600, overlap=100)):
                _insert_document(
                    conn,
                    source="story_metadata",
                    language="en",
                    category=category,
                    external_id=f"{filename}:{key}#{idx}",
                    title=str(key),
                    body=chunk,
                    path=_rel(path, settings.arknights_story_json),
                )
                count += 1
    return count


def _index_images(conn: sqlite3.Connection) -> int:
    root = settings.arknights_images
    if not root.exists():
        return 0
    count = 0
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
            continue
        rel_path = _rel(path, root)
        category = rel_path.split("/")[0] if "/" in rel_path else "images"
        name = path.stem
        search_text = clean_text(rel_path.replace("_", " ").replace("-", " ").replace("#", " "))
        cursor = conn.execute(
            "INSERT INTO images(name, category, rel_path, search_text) VALUES (?, ?, ?, ?)",
            (name, category, rel_path, search_text),
        )
        rowid = cursor.lastrowid
        conn.execute(
            "INSERT INTO images_fts(rowid, name, search_text, category, rel_path) VALUES (?, ?, ?, ?, ?)",
            (rowid, name, search_text, category, rel_path),
        )
        count += 1
    return count


def rebuild_index() -> dict[str, int | str]:
    init_db()
    with connect() as conn:
        cursor = conn.execute("INSERT INTO index_runs(status, message) VALUES (?, ?)", ("running", "Index rebuild started"))
        run_id = cursor.lastrowid
        try:
            reset_index_tables(conn)
            documents_count = 0
            for source in _iter_sources():
                documents_count += _index_characters(conn, source)
                documents_count += _index_items(conn, source)
                documents_count += _index_enemies(conn, source)
                documents_count += _index_stages(conn, source)
            documents_count += _index_story_metadata(conn)
            documents_count += _index_story_files(conn)
            images_count = _index_images(conn)
            conn.execute(
                """
                UPDATE index_runs
                SET status='ok', message=?, finished_at=CURRENT_TIMESTAMP, documents_count=?, images_count=?
                WHERE id=?
                """,
                ("Index rebuild completed", documents_count, images_count, run_id),
            )
            conn.commit()
            return {"status": "ok", "documents": documents_count, "images": images_count}
        except Exception as exc:
            conn.execute(
                "UPDATE index_runs SET status='error', message=?, finished_at=CURRENT_TIMESTAMP WHERE id=?",
                (str(exc), run_id),
            )
            conn.commit()
            raise


def git_pull_allowed_repo(repo_name: str) -> str:
    allowed = {
        "ArknightsGamedata": settings.arknights_gamedata,
        "ArknightsGameData_Zh_CN": settings.arknights_gamedata_zh,
        "ArknightsStoryJson": settings.arknights_story_json,
        "Arknight-Images": settings.arknights_images,
    }
    repo = allowed.get(repo_name)
    if repo is None:
        raise ValueError(f"Unknown repo '{repo_name}'")
    if not (repo / ".git").exists():
        raise ValueError(f"{repo} is not a git repository")
    result = subprocess.run(
        ["git", "-C", str(repo), "pull", "--ff-only"],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    output = (result.stdout + "\n" + result.stderr).strip()
    if result.returncode != 0:
        raise RuntimeError(output or f"git pull failed with code {result.returncode}")
    return output
