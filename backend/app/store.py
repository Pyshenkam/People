from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterator

from .schemas import ConfigHistoryItem, ConfigSnapshot, DraftSnapshot, MuseumConfig

def utcnow() -> datetime:
    return datetime.now(UTC)

class ConfigStore:
    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.database_path, detect_types=sqlite3.PARSE_DECLTYPES)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def initialize(self, default_config: MuseumConfig, password_hash: str) -> None:
        now = utcnow().isoformat()
        payload = json.dumps(default_config.model_dump(mode="json"), ensure_ascii=False)
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS admin_users (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    password_hash TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS draft_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    payload_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    updated_by TEXT
                );

                CREATE TABLE IF NOT EXISTS config_versions (
                    version INTEGER PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    published_at TEXT NOT NULL,
                    published_by TEXT
                );

                CREATE TABLE IF NOT EXISTS session_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    client_id TEXT,
                    config_version INTEGER,
                    event_type TEXT NOT NULL,
                    event_ts TEXT NOT NULL,
                    payload_json TEXT
                );
                """
            )

            admin_row = conn.execute("SELECT id FROM admin_users WHERE id = 1").fetchone()
            if admin_row is None:
                conn.execute(
                    """
                    INSERT INTO admin_users (id, password_hash, updated_at)
                    VALUES (1, ?, ?)
                    """,
                    (password_hash, now),
                )

            draft_row = conn.execute("SELECT id FROM draft_config WHERE id = 1").fetchone()
            if draft_row is None:
                conn.execute(
                    """
                    INSERT INTO draft_config (id, payload_json, updated_at, updated_by)
                    VALUES (1, ?, ?, ?)
                    """,
                    (payload, now, "system"),
                )

            published_row = conn.execute(
                "SELECT version FROM config_versions ORDER BY version DESC LIMIT 1"
            ).fetchone()
            if published_row is None:
                conn.execute(
                    """
                    INSERT INTO config_versions (version, payload_json, published_at, published_by)
                    VALUES (1, ?, ?, ?)
                    """,
                    (payload, now, "system"),
                )

    def get_admin_password_hash(self) -> str:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT password_hash FROM admin_users WHERE id = 1"
            ).fetchone()
        if row is None:
            raise RuntimeError("admin user is not initialized")
        return str(row["password_hash"])

    def get_draft(self) -> DraftSnapshot:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT payload_json, updated_at, updated_by FROM draft_config WHERE id = 1"
            ).fetchone()
        if row is None:
            raise RuntimeError("draft config is not initialized")
        return DraftSnapshot(
            config=MuseumConfig.model_validate_json(row["payload_json"]),
            updated_at=datetime.fromisoformat(str(row["updated_at"])),
            updated_by=row["updated_by"],
        )

    def save_draft(self, config: MuseumConfig, updated_by: str) -> DraftSnapshot:
        snapshot = DraftSnapshot(config=config, updated_at=utcnow(), updated_by=updated_by)
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE draft_config
                SET payload_json = ?, updated_at = ?, updated_by = ?
                WHERE id = 1
                """,
                (
                    json.dumps(config.model_dump(mode="json"), ensure_ascii=False),
                    snapshot.updated_at.isoformat(),
                    updated_by,
                ),
            )
        return snapshot

    def get_published(self) -> ConfigSnapshot:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT version, payload_json, published_at, published_by
                FROM config_versions
                ORDER BY version DESC
                LIMIT 1
                """
            ).fetchone()
        if row is None:
            raise RuntimeError("published config is not initialized")
        return ConfigSnapshot(
            version=int(row["version"]),
            config=MuseumConfig.model_validate_json(row["payload_json"]),
            timestamp=datetime.fromisoformat(str(row["published_at"])),
            actor=row["published_by"],
        )

    def publish_draft(self, published_by: str) -> ConfigSnapshot:
        with self.connect() as conn:
            draft_row = conn.execute(
                "SELECT payload_json FROM draft_config WHERE id = 1"
            ).fetchone()
            if draft_row is None:
                raise RuntimeError("draft config is not initialized")
            next_version = conn.execute(
                "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM config_versions"
            ).fetchone()["next_version"]
            published_at = utcnow()
            conn.execute(
                """
                INSERT INTO config_versions (version, payload_json, published_at, published_by)
                VALUES (?, ?, ?, ?)
                """,
                (next_version, draft_row["payload_json"], published_at.isoformat(), published_by),
            )
        return ConfigSnapshot(
            version=int(next_version),
            config=MuseumConfig.model_validate_json(draft_row["payload_json"]),
            timestamp=published_at,
            actor=published_by,
        )

    def list_published(self, limit: int = 20) -> list[ConfigHistoryItem]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT version, payload_json, published_at, published_by
                FROM config_versions
                ORDER BY version DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [
            ConfigHistoryItem(
                version=int(row["version"]),
                config=MuseumConfig.model_validate_json(row["payload_json"]),
                published_at=datetime.fromisoformat(str(row["published_at"])),
                published_by=row["published_by"],
            )
            for row in rows
        ]

    def log_session_event(
        self,
        session_id: str,
        client_id: str | None,
        config_version: int | None,
        event_type: str,
        payload: dict | None = None,
    ) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO session_events (
                    session_id,
                    client_id,
                    config_version,
                    event_type,
                    event_ts,
                    payload_json
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    client_id,
                    config_version,
                    event_type,
                    utcnow().isoformat(),
                    json.dumps(payload, ensure_ascii=False) if payload is not None else None,
                ),
            )
