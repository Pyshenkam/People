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
