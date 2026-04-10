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
    settings.upstream_app_id = ""
    settings.upstream_access_key = ""
    return settings


def login_admin(client: TestClient, csrf_token: str) -> None:
    response = client.post(
        "/api/admin/login",
        json={"password": "MuseumAdmin123!"},
        headers={"x-csrf-token": csrf_token},
    )
    assert response.status_code == 200


def test_admin_login_and_config(tmp_path: Path) -> None:
    app = create_app(build_settings(tmp_path))
    with TestClient(app) as client:
        session_response = client.get("/api/admin/session")
        csrf_token = session_response.json()["csrf_token"]
        login_admin(client, csrf_token)

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
        login_admin(client, csrf_token)

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
        login_admin(client, csrf_token)

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


def test_admin_can_update_upstream_config(tmp_path: Path) -> None:
    app = create_app(build_settings(tmp_path))
    with TestClient(app) as client:
        session_response = client.get("/api/admin/session")
        csrf_token = session_response.json()["csrf_token"]
        login_admin(client, csrf_token)

        upstream_config = client.get("/api/admin/upstream-config")
        assert upstream_config.status_code == 200
        assert upstream_config.json()["mode"] == "mock"
        assert upstream_config.json()["access_key_configured"] is False

        update = client.put(
            "/api/admin/upstream-config",
            json={
                "mode": "volcengine",
                "base_url": "wss://openspeech.bytedance.com/api/v3/realtime/dialogue",
                "app_id": "app-live-001",
                "access_key": "access-key-live-001",
                "resource_id": "volc.speech.dialog",
                "app_key": "PlgvMymc7f3tQnJ6",
            },
            headers={"x-csrf-token": csrf_token},
        )
        assert update.status_code == 200

        refreshed = client.get("/api/admin/upstream-config")
        assert refreshed.status_code == 200
        payload = refreshed.json()
        assert payload["mode"] == "volcengine"
        assert payload["app_id"] == "app-live-001"
        assert payload["access_key_configured"] is True
        assert payload["access_key_masked"] != "access-key-live-001"

        assert app.state.settings.upstream_mode == "volcengine"
        assert app.state.settings.upstream_app_id == "app-live-001"
        assert app.state.settings.upstream_access_key == "access-key-live-001"
        assert client.get("/api/health").json()["upstreamMode"] == "volcengine"


def test_admin_upstream_update_keeps_existing_access_key_when_left_blank(tmp_path: Path) -> None:
    settings = build_settings(tmp_path)
    settings.upstream_mode = "volcengine"
    settings.upstream_app_id = "app-initial"
    settings.upstream_access_key = "access-key-initial"
    app = create_app(settings)
    with TestClient(app) as client:
        session_response = client.get("/api/admin/session")
        csrf_token = session_response.json()["csrf_token"]
        login_admin(client, csrf_token)

        update = client.put(
            "/api/admin/upstream-config",
            json={
                "mode": "volcengine",
                "base_url": "wss://openspeech.bytedance.com/api/v3/realtime/dialogue",
                "app_id": "app-rotated",
                "access_key": "",
                "resource_id": "volc.speech.dialog",
                "app_key": "PlgvMymc7f3tQnJ6",
            },
            headers={"x-csrf-token": csrf_token},
        )
        assert update.status_code == 200

        assert app.state.settings.upstream_app_id == "app-rotated"
        assert app.state.settings.upstream_access_key == "access-key-initial"


def test_admin_upstream_update_rejects_missing_access_key_in_volcengine_mode(tmp_path: Path) -> None:
    app = create_app(build_settings(tmp_path))
    with TestClient(app, raise_server_exceptions=False) as client:
        session_response = client.get("/api/admin/session")
        csrf_token = session_response.json()["csrf_token"]
        login_admin(client, csrf_token)

        update = client.put(
            "/api/admin/upstream-config",
            json={
                "mode": "volcengine",
                "base_url": "wss://openspeech.bytedance.com/api/v3/realtime/dialogue",
                "app_id": "app-live-002",
                "access_key": "",
                "resource_id": "volc.speech.dialog",
                "app_key": "PlgvMymc7f3tQnJ6",
            },
            headers={"x-csrf-token": csrf_token},
        )
        assert update.status_code == 422

        detail = update.json()["detail"]
        assert detail["message"] == "发布失败，请先检查标红字段。"
        assert detail["fieldErrors"]["access_key"] == ["Access Key 不能为空。"]
