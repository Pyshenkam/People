from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from typing import Any

import websockets

from ..logging_utils import get_logger
from ..schemas import MuseumConfig
from ..settings import Settings
from .protocol import build_audio_frame, build_json_frame, parse_response

logger = get_logger("upstream")


def chunk_text(text: str, chunk_size: int = 6) -> list[str]:
    cleaned = text.strip()
    if not cleaned:
        return []
    return [cleaned[index : index + chunk_size] for index in range(0, len(cleaned), chunk_size)]


@dataclass(slots=True)
class UpstreamEvent:
    event: int | None
    message_type: str
    payload: Any


class MockRealtimeClient:
    def __init__(self) -> None:
        self.queue: asyncio.Queue[UpstreamEvent] = asyncio.Queue()
        self.closed = False
        self._responding = False

    async def connect(self) -> None:
        logger.info("upstream_connect mode=mock")
        return

    async def start_session(self, _: MuseumConfig, session_id: str) -> None:
        logger.info("upstream_start_session mode=mock session_id=%s", session_id)
        await self.queue.put(
            UpstreamEvent(
                event=100,
                message_type="SERVER_FULL_RESPONSE",
                payload={"session_id": session_id},
            )
        )

    async def _stream_text(self, text: str, reply_id: str) -> None:
        await self.queue.put(
            UpstreamEvent(
                event=550,
                message_type="SERVER_FULL_RESPONSE",
                payload={"content": "", "reply_id": reply_id},
            )
        )
        for chunk in chunk_text(text):
            await self.queue.put(
                UpstreamEvent(
                    event=550,
                    message_type="SERVER_FULL_RESPONSE",
                    payload={"content": chunk, "reply_id": reply_id},
                )
            )
            await asyncio.sleep(0.02)

    async def say_hello(self, text: str) -> None:
        logger.info("upstream_say_hello mode=mock text_len=%s", len(text))
        await self._stream_text(text, "mock-welcome")
        await self.queue.put(UpstreamEvent(event=359, message_type="SERVER_FULL_RESPONSE", payload={}))

    async def send_audio(self, _: bytes) -> None:
        if self._responding:
            return
        self._responding = True
        logger.info("upstream_send_audio mode=mock")
        await self.queue.put(UpstreamEvent(event=450, message_type="SERVER_FULL_RESPONSE", payload={}))
        await asyncio.sleep(0.05)
        await self.queue.put(
            UpstreamEvent(
                event=451,
                message_type="SERVER_FULL_RESPONSE",
                payload={"results": [{"text": "这是模拟识别文本。", "is_interim": False}]},
            )
        )
        await asyncio.sleep(0.05)
        await self.queue.put(UpstreamEvent(event=459, message_type="SERVER_FULL_RESPONSE", payload={}))
        await asyncio.sleep(0.15)
        await self._stream_text(
            "当前运行在模拟模式。配置好上游密钥后，这里会切换成真实实时语音。",
            str(uuid.uuid4()),
        )
        await asyncio.sleep(0.05)
        await self.queue.put(UpstreamEvent(event=352, message_type="SERVER_ACK", payload=b"\x00" * 960))
        await asyncio.sleep(0.05)
        await self.queue.put(UpstreamEvent(event=359, message_type="SERVER_FULL_RESPONSE", payload={}))
        self._responding = False

    async def receive(self) -> UpstreamEvent:
        event = await self.queue.get()
        logger.info(
            "upstream_receive mode=mock event=%s message_type=%s payload=%s",
            event.event,
            event.message_type,
            summarize_payload(event.payload),
        )
        return event

    async def finish_session(self) -> None:
        return

    async def finish_connection(self) -> None:
        return

    async def close(self) -> None:
        self.closed = True


class VolcengineRealtimeClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.ws = None

    async def connect(self) -> None:
        headers = {
            "X-Api-App-ID": self.settings.upstream_app_id,
            "X-Api-Access-Key": self.settings.upstream_access_key,
            "X-Api-Resource-Id": self.settings.upstream_resource_id,
            "X-Api-App-Key": self.settings.upstream_app_key,
            "X-Api-Connect-Id": str(uuid.uuid4()),
        }
        logger.info(
            "upstream_connect mode=volcengine url=%s app_id=%s access_key_suffix=%s resource_id=%s",
            self.settings.upstream_base_url,
            mask_value(self.settings.upstream_app_id),
            suffix_value(self.settings.upstream_access_key),
            self.settings.upstream_resource_id,
        )
        self.ws = await websockets.connect(
            self.settings.upstream_base_url,
            additional_headers=headers,
            ping_interval=None,
        )
        await self.ws.send(build_json_frame(1, {}))
        ack = parse_response(await self.ws.recv())
        logger.info(
            "upstream_connect_ack mode=volcengine event=%s message_type=%s payload=%s",
            ack.get("event"),
            ack.get("message_type"),
            summarize_payload(ack.get("payload_msg")),
        )

    async def start_session(self, config: MuseumConfig, session_id: str) -> None:
        if self.ws is None:
            raise RuntimeError("websocket is not connected")
        logger.info(
            "upstream_start_session mode=volcengine session_id=%s model_family=%s speaker=%s",
            session_id,
            config.model_family,
            config.speaker,
        )
        await self.ws.send(build_json_frame(100, config.to_upstream_payload(), session_id=session_id))
        ack = parse_response(await self.ws.recv())
        logger.info(
            "upstream_start_session_ack mode=volcengine session_id=%s event=%s message_type=%s payload=%s",
            session_id,
            ack.get("event"),
            ack.get("message_type"),
            summarize_payload(ack.get("payload_msg")),
        )

    async def say_hello(self, text: str, session_id: str) -> None:
        if self.ws is None:
            raise RuntimeError("websocket is not connected")
        logger.info(
            "upstream_say_hello mode=volcengine session_id=%s text_len=%s",
            session_id,
            len(text),
        )
        await self.ws.send(build_json_frame(300, {"content": text}, session_id=session_id))

    async def send_audio(self, session_id: str, audio_chunk: bytes) -> None:
        if self.ws is None:
            raise RuntimeError("websocket is not connected")
        logger.debug(
            "upstream_send_audio mode=volcengine session_id=%s bytes=%s",
            session_id,
            len(audio_chunk),
        )
        await self.ws.send(build_audio_frame(200, audio_chunk, session_id=session_id))

    async def receive(self) -> UpstreamEvent:
        if self.ws is None:
            raise RuntimeError("websocket is not connected")
        response = await self.ws.recv()
        parsed = parse_response(response)
        logger.info(
            "upstream_receive mode=volcengine event=%s message_type=%s session_id=%s payload=%s",
            parsed.get("event"),
            parsed.get("message_type"),
            parsed.get("session_id"),
            summarize_payload(parsed.get("payload_msg")),
        )
        return UpstreamEvent(
            event=parsed.get("event"),
            message_type=parsed.get("message_type", "UNKNOWN"),
            payload=parsed.get("payload_msg"),
        )

    async def finish_session(self, session_id: str) -> None:
        if self.ws is None:
            return
        await self.ws.send(build_json_frame(102, {}, session_id=session_id))

    async def finish_connection(self) -> None:
        if self.ws is None:
            return
        await self.ws.send(build_json_frame(2, {}))

    async def close(self) -> None:
        if self.ws is not None:
            await self.ws.close()
            self.ws = None

def create_upstream_client(settings: Settings) -> MockRealtimeClient | VolcengineRealtimeClient:
    if settings.upstream_mode == "mock":
        return MockRealtimeClient()
    return VolcengineRealtimeClient(settings)


def mask_value(value: str) -> str:
    if not value:
        return "<empty>"
    if len(value) <= 4:
        return "*" * len(value)
    return f"{value[:2]}***{value[-2:]}"


def suffix_value(value: str) -> str:
    if not value:
        return "<empty>"
    if len(value) <= 6:
        return value
    return value[-6:]


def summarize_payload(payload: Any) -> str:
    if payload is None:
        return "null"
    if isinstance(payload, bytes):
        return f"bytes:{len(payload)}"
    if isinstance(payload, dict):
        summary: dict[str, Any] = {}
        for key, value in payload.items():
            if isinstance(value, bytes):
                summary[key] = f"bytes:{len(value)}"
            elif isinstance(value, str) and len(value) > 120:
                summary[key] = f"{value[:117]}..."
            elif isinstance(value, list) and len(value) > 4:
                summary[key] = f"list:{len(value)}"
            else:
                summary[key] = value
        return str(summary)
    if isinstance(payload, list):
        return f"list:{len(payload)}"
    return str(payload)
