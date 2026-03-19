import time
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


def test_realtime_session_closes_on_idle_timeout(tmp_path: Path) -> None:
    settings = build_settings(tmp_path)
    settings.default_config = settings.default_config.model_copy(
        update={"idle_timeout_sec": 7, "auto_end_mode": "silence_timeout"}
    )
    app = create_app(settings)
    with TestClient(app) as client:
        with client.websocket_connect("/api/realtime") as websocket:
            websocket.send_json({"type": "hello", "clientId": "visitor-idle"})
            websocket.send_json({"type": "start_session", "clientId": "visitor-idle"})

            ready_event = websocket.receive_json()
            assert ready_event["type"] == "session_ready"
            assert ready_event["autoEndMode"] == "silence_timeout"

            while True:
                payload = websocket.receive_json()
                if payload["type"] == "state_changed" and payload["state"] == "listening":
                    break

            handle = app.state.sessions._active
            assert handle is not None
            handle.last_activity_at -= handle.config.idle_timeout_sec + 1

            websocket.send_json({"type": "heartbeat"})

            while True:
                payload = websocket.receive_json()
                if payload["type"] == "session_closed":
                    assert payload["reason"] == "idle_timeout"
                    break


def test_realtime_session_skips_idle_timeout_when_disconnect_only(tmp_path: Path) -> None:
    settings = build_settings(tmp_path)
    settings.default_config = settings.default_config.model_copy(
        update={"idle_timeout_sec": 7, "auto_end_mode": "disconnect_only"}
    )
    app = create_app(settings)
    with TestClient(app) as client:
        with client.websocket_connect("/api/realtime") as websocket:
            websocket.send_json({"type": "hello", "clientId": "visitor-disconnect"})
            websocket.send_json({"type": "start_session", "clientId": "visitor-disconnect"})

            ready_event = websocket.receive_json()
            assert ready_event["type"] == "session_ready"
            assert ready_event["autoEndMode"] == "disconnect_only"

            while True:
                payload = websocket.receive_json()
                if payload["type"] == "state_changed" and payload["state"] == "listening":
                    break

            handle = app.state.sessions._active
            assert handle is not None
            handle.last_activity_at -= handle.config.idle_timeout_sec + 1

            websocket.send_json({"type": "heartbeat"})
            time.sleep(0.05)

            active = app.state.sessions._active
            assert active is not None
            assert not active.closed

            websocket.send_json({"type": "end_session", "reason": "manual_end"})

            while True:
                payload = websocket.receive_json()
                if payload["type"] == "session_closed":
                    assert payload["reason"] == "manual_end"
                    break
