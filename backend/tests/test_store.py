from pathlib import Path

import bootstrap_defaults
from app.security import AdminSecurity
from app.settings import Settings
from app.schemas import MuseumConfig
from app.store import ConfigStore


def test_config_store_publish_flow(tmp_path: Path) -> None:
    store = ConfigStore(tmp_path / "museum.db")
    store.initialize(MuseumConfig(), "hash")
    original = store.get_published()
    draft = MuseumConfig(bot_name="新助手", welcome_text="欢迎开始体验")
    store.save_draft(draft, updated_by="tester")
    published = store.publish_draft("tester")

    assert published.version == original.version + 1
    assert published.config.bot_name == "新助手"
    history = store.list_published()
    assert history[0].version == published.version
    assert history[1].version == original.version


def test_config_store_migrates_legacy_avatar_url(tmp_path: Path) -> None:
    store = ConfigStore(tmp_path / "museum.db")
    store.initialize(MuseumConfig(avatar_url="/models/default-avatar.glb"), "hash")
    store.initialize(MuseumConfig(avatar_url="/models/panda-v2.glb"), "hash")

    assert store.get_draft().config.avatar_url == "/models/panda-v2.glb"
    assert store.get_published().config.avatar_url == "/models/panda-v2.glb"


def test_bootstrap_defaults_preserves_existing_config(tmp_path: Path, monkeypatch) -> None:
    settings = Settings.from_env()
    settings.data_dir = tmp_path
    settings.database_path = tmp_path / "museum.db"
    settings.frontend_dist_dir = tmp_path / "dist"
    settings.admin_password = "MuseumAdmin123!"
    settings.session_secret = "test-secret"
    settings.upstream_mode = "mock"

    security = AdminSecurity(settings)
    store = ConfigStore(settings.database_path)
    store.initialize(settings.default_config, security.hash_password(settings.admin_password))

    custom_config = settings.default_config.model_copy(
        update={
            "bot_name": "憨厚熊猫",
            "playback_tone": "panda_warm",
        }
    )
    store.save_draft(custom_config, updated_by="tester")
    published = store.publish_draft("tester")

    monkeypatch.setattr(bootstrap_defaults.Settings, "from_env", lambda: settings)
    bootstrap_defaults.main()

    draft = store.get_draft()
    current = store.get_published()
    assert draft.config.playback_tone == "panda_warm"
    assert current.version == published.version
    assert current.config.playback_tone == "panda_warm"
    assert current.actor == "tester"


def test_museum_config_defaults_use_shorter_idle_timeout() -> None:
    config = MuseumConfig()

    assert config.idle_timeout_sec == 7
    assert config.auto_end_mode == "silence_timeout"
