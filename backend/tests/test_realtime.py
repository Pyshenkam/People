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


def test_realtime_session_lifecycle(tmp_path: Path) -> None:
    app = create_app(build_settings(tmp_path))
    with TestClient(app) as client:
        with client.websocket_connect("/api/realtime") as websocket:
            websocket.send_json({"type": "hello", "clientId": "visitor-1"})
            websocket.send_json({"type": "start_session", "clientId": "visitor-1"})

            ready_event = websocket.receive_json()
            assert ready_event["type"] == "session_ready"
            assert ready_event["state"] == "greeting"
            assert ready_event["upstreamMode"] == "mock"
            assert ready_event["upstreamClient"] == "MockRealtimeClient"

            websocket.send_json({"type": "end_session", "reason": "manual_end"})

            while True:
                payload = websocket.receive_json()
                if payload["type"] == "session_closed":
                    assert payload["reason"] == "manual_end"
                    break


def test_realtime_greeting_subtitles_are_accumulated(tmp_path: Path) -> None:
    app = create_app(build_settings(tmp_path))
    with TestClient(app) as client:
        with client.websocket_connect("/api/realtime") as websocket:
            websocket.send_json({"type": "hello", "clientId": "visitor-2"})
            websocket.send_json({"type": "start_session", "clientId": "visitor-2"})

            ready_event = websocket.receive_json()
            assert ready_event["type"] == "session_ready"

            subtitle_payloads: list[dict] = []
            while True:
                payload = websocket.receive_json()
                if payload["type"] == "assistant_text":
                    subtitle_payloads.append(payload)
                if payload["type"] == "tts_end":
                    break

            assert subtitle_payloads
            final_payload = subtitle_payloads[-1]
            assert final_payload["replyId"] == "mock-welcome"
            assert final_payload["text"] == "你好，欢迎来到科技馆。点击开始对话后，我会实时听你说话。"

            texts = [item["text"] for item in subtitle_payloads]
            assert all(texts[index + 1].startswith(texts[index]) for index in range(len(texts) - 1))
