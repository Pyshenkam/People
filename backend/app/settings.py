from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from pathlib import Path

from .schemas import MuseumConfig

@dataclass(slots=True)
class Settings:
    app_name: str
    data_dir: Path
    database_path: Path
    log_file_path: Path
    log_level: str
    frontend_dist_dir: Path
    session_secret: str
    admin_password: str
    session_cookie_name: str
    csrf_cookie_name: str
    session_idle_seconds: int
    login_rate_limit_attempts: int
    login_rate_limit_window_seconds: int
    session_resume_window_seconds: int
    upstream_connect_timeout_seconds: int
    upstream_mode: str
    upstream_base_url: str
    upstream_app_id: str
    upstream_access_key: str
    upstream_resource_id: str
    upstream_app_key: str
    default_config: MuseumConfig

    @classmethod
    def from_env(cls) -> "Settings":
        root_dir = Path(__file__).resolve().parents[2]
        data_dir = Path(os.getenv("MUSEUM_DATA_DIR", root_dir / "data"))
        frontend_dist = root_dir / "frontend" / "dist"
        upstream_app_id = os.getenv("UPSTREAM_APP_ID", "")
        upstream_access_key = os.getenv("UPSTREAM_ACCESS_KEY", "")
        upstream_mode = os.getenv("UPSTREAM_MODE", "")
        default_avatar_url = os.getenv("DEFAULT_AVATAR_URL") or None
        if not upstream_mode:
            upstream_mode = "volcengine" if upstream_app_id and upstream_access_key else "mock"

        default_config = MuseumConfig(
            display_title=os.getenv("DEFAULT_DISPLAY_TITLE", "科技馆数字人"),
            display_subtitle=os.getenv("DEFAULT_DISPLAY_SUBTITLE", "点击开始对话，进入实时语音讲解"),
            avatar_url=default_avatar_url,
            idle_timeout_sec=int(os.getenv("DEFAULT_IDLE_TIMEOUT_SEC", "60")),
            welcome_text=os.getenv(
                "DEFAULT_WELCOME_TEXT",
                "你好，欢迎来到科技馆。点击开始对话后，我会实时听你说话。",
            ),
            model_family=os.getenv("DEFAULT_MODEL_FAMILY", "O2.0"),  # type: ignore[arg-type]
            model=os.getenv("DEFAULT_MODEL") or None,
            speaker=os.getenv("DEFAULT_SPEAKER", "zh_male_yunzhou_jupiter_bigtts"),
            bot_name=os.getenv("DEFAULT_BOT_NAME", "星馆助手"),
            system_role=os.getenv(
                "DEFAULT_SYSTEM_ROLE",
                "你是科技馆展厅里的数字讲解员，擅长用亲切、准确、口语化的方式介绍科技展品。",
            ),
            speaking_style=os.getenv(
                "DEFAULT_SPEAKING_STYLE",
                "回答简洁自然，适合面对面讲解，优先使用中文。",
            ),
            character_manifest=os.getenv("DEFAULT_CHARACTER_MANIFEST") or None,
            strict_audit=os.getenv("DEFAULT_STRICT_AUDIT", "false").lower() == "true",
            enable_user_query_exit=os.getenv("DEFAULT_ENABLE_USER_QUERY_EXIT", "false").lower() == "true",
        )

        return cls(
            app_name=os.getenv("APP_NAME", "Science Museum Digital Human"),
            data_dir=data_dir,
            database_path=data_dir / "museum.db",
            log_file_path=Path(os.getenv("APP_LOG_PATH", data_dir / "runtime.log")),
            log_level=os.getenv("APP_LOG_LEVEL", "INFO"),
            frontend_dist_dir=frontend_dist,
            session_secret=os.getenv("SESSION_SECRET", secrets.token_urlsafe(32)),
            admin_password=os.getenv("ADMIN_PASSWORD", "MuseumAdmin123!"),
            session_cookie_name=os.getenv("SESSION_COOKIE_NAME", "museum_admin_session"),
            csrf_cookie_name=os.getenv("CSRF_COOKIE_NAME", "museum_csrf"),
            session_idle_seconds=int(os.getenv("SESSION_IDLE_SECONDS", "900")),
            login_rate_limit_attempts=int(os.getenv("LOGIN_RATE_LIMIT_ATTEMPTS", "5")),
            login_rate_limit_window_seconds=int(os.getenv("LOGIN_RATE_LIMIT_WINDOW_SECONDS", "900")),
            session_resume_window_seconds=int(os.getenv("SESSION_RESUME_WINDOW_SECONDS", "8")),
            upstream_connect_timeout_seconds=int(os.getenv("UPSTREAM_CONNECT_TIMEOUT_SECONDS", "12")),
            upstream_mode=upstream_mode,
            upstream_base_url=os.getenv(
                "UPSTREAM_BASE_URL",
                "wss://openspeech.bytedance.com/api/v3/realtime/dialogue",
            ),
            upstream_app_id=upstream_app_id,
            upstream_access_key=upstream_access_key,
            upstream_resource_id=os.getenv("UPSTREAM_RESOURCE_ID", "volc.speech.dialog"),
            upstream_app_key=os.getenv("UPSTREAM_APP_KEY", "PlgvMymc7f3tQnJ6"),
            default_config=default_config,
        )
