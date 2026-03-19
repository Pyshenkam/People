from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings


def build_settings(tmp_path: Path) -> Settings:
    settings = Settings.from_env()
    settings.data_dir = tmp_path
    settings.database_path = tmp_path / "museum.db"
    settings.frontend_dist_dir = tmp_path / "dist"
    settings.admin_password = "MuseumAdmin123!"
    settings.session_secret = "test-secret"
    settings.upstream_mode = "mock"
    return settings


def test_admin_login_and_config(tmp_path: Path) -> None:
    app = create_app(build_settings(tmp_path))
    with TestClient(app) as client:
        session_response = client.get("/api/admin/session")
        csrf_token = session_response.json()["csrf_token"]
        login = client.post(
            "/api/admin/login",
            json={"password": "MuseumAdmin123!"},
            headers={"x-csrf-token": csrf_token},
        )
        assert login.status_code == 200

        config = client.get("/api/admin/config")
        assert config.status_code == 200
        assert config.json()["published"]["version"] == 1
        assert config.json()["published"]["config"]["playback_tone"] == "panda_warm"

        updated_config = config.json()["draft"]["config"]
        updated_config["playback_tone"] = "natural"

        publish = client.post(
            "/api/admin/config/publish",
            json=updated_config,
            headers={"x-csrf-token": csrf_token},
        )
        assert publish.status_code == 200

        refreshed_config = client.get("/api/admin/config")
        assert refreshed_config.status_code == 200
        assert refreshed_config.json()["published"]["version"] == 2
        assert refreshed_config.json()["published"]["config"]["playback_tone"] == "panda_warm"


def test_publish_persists_o20_prompt_fields(tmp_path: Path) -> None:
    app = create_app(build_settings(tmp_path))
    with TestClient(app) as client:
        session_response = client.get("/api/admin/session")
        csrf_token = session_response.json()["csrf_token"]
        client.post(
            "/api/admin/login",
            json={"password": "MuseumAdmin123!"},
            headers={"x-csrf-token": csrf_token},
        )

        config = client.get("/api/admin/config")
        payload = config.json()["published"]["config"]
        payload["model_family"] = "O2.0"
        payload["bot_name"] = "新讲解员"
        payload["welcome_text"] = "欢迎来到新展区。"
        payload["system_role"] = "你是一个更主动、更清晰的科技馆讲解员。"
        payload["speaking_style"] = "回答更口语化、更有层次。"

        publish = client.post(
            "/api/admin/config/publish",
            json=payload,
            headers={"x-csrf-token": csrf_token},
        )
        assert publish.status_code == 200

        refreshed_config = client.get("/api/admin/config").json()
        published = refreshed_config["published"]["config"]
        draft = refreshed_config["draft"]["config"]

        assert published["system_role"] == payload["system_role"]
        assert published["speaking_style"] == payload["speaking_style"]
        assert draft["system_role"] == payload["system_role"]
        assert draft["speaking_style"] == payload["speaking_style"]


def test_publish_rejects_blank_prompt_fields_with_chinese_errors(tmp_path: Path) -> None:
    app = create_app(build_settings(tmp_path))
    with TestClient(app, raise_server_exceptions=False) as client:
        session_response = client.get("/api/admin/session")
        csrf_token = session_response.json()["csrf_token"]
        client.post(
            "/api/admin/login",
            json={"password": "MuseumAdmin123!"},
            headers={"x-csrf-token": csrf_token},
        )

        config = client.get("/api/admin/config")
        payload = config.json()["published"]["config"]
        payload["model_family"] = "O2.0"
        payload["system_role"] = "   "
        payload["speaking_style"] = "   "

        publish = client.post(
            "/api/admin/config/publish",
            json=payload,
            headers={"x-csrf-token": csrf_token},
        )
        assert publish.status_code == 422

        detail = publish.json()["detail"]
        assert detail["message"] == "发布失败，请先检查标红字段。"
        assert detail["fieldErrors"]["system_role"] == ["讲解角色设定不能为空。"]
        assert detail["fieldErrors"]["speaking_style"] == ["回答风格不能为空。"]
