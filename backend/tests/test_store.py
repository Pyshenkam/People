from pathlib import Path

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
