from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, ValidationInfo, field_validator, model_validator

ModelFamily = Literal["O", "O2.0", "SC", "SC2.0"]
PlaybackTone = Literal["natural", "panda_warm"]
AutoEndMode = Literal["silence_timeout", "disconnect_only"]

DEFAULT_SPEAKER_BY_FAMILY: dict[ModelFamily, str] = {
    "O": "zh_male_xiaotian_jupiter_bigtts",
    "O2.0": "zh_male_xiaotian_jupiter_bigtts",
    "SC": "ICL_zh_female_wenrouwenya_tob",
    "SC2.0": "saturn_zh_female_wenrouwenya_tob",
}


def _strip_text(value: str | None) -> str:
    return value.strip() if isinstance(value, str) else ""


class LocationConfig(BaseModel):
    city: str = "北京"
    province: str | None = None
    country: str = "中国"
    country_code: str = "CN"
    district: str | None = None
    address: str | None = None

class MuseumConfig(BaseModel):
    display_title: str = "科技馆数字人"
    display_subtitle: str = "点击开始对话，进入实时语音讲解"
    avatar_url: str | None = None
    idle_timeout_sec: int = 7
    auto_end_mode: AutoEndMode = "silence_timeout"
    welcome_text: str = "你好，欢迎来到科技馆。点击开始对话后，我会实时听你说话。"
    model_family: ModelFamily = "O2.0"
    model: str | None = None
    speaker: str = "zh_male_xiaotian_jupiter_bigtts"
    playback_tone: PlaybackTone = "panda_warm"
    bot_name: str = "星馆助手"
    system_role: str = "你是科技馆展厅里的数字讲解员，擅长用亲切、准确、口语化的方式介绍科技展品。"
    speaking_style: str = "回答简洁自然，适合面对面讲解，优先使用中文。"
    character_manifest: str | None = None
    strict_audit: bool = False
    enable_user_query_exit: bool = False
    location: LocationConfig = Field(default_factory=LocationConfig)

    @field_validator("display_title")
    @classmethod
    def ensure_display_title(cls, value: str) -> str:
        value = _strip_text(value)
        if not value:
            raise ValueError("展示标题不能为空。")
        return value

    @field_validator("display_subtitle")
    @classmethod
    def ensure_display_subtitle(cls, value: str) -> str:
        value = _strip_text(value)
        if not value:
            raise ValueError("展示副标题不能为空。")
        return value

    @field_validator("welcome_text")
    @classmethod
    def ensure_welcome_text(cls, value: str) -> str:
        value = _strip_text(value)
        if not value:
            raise ValueError("欢迎语不能为空。")
        return value

    @field_validator("bot_name")
    @classmethod
    def ensure_bot_name(cls, value: str) -> str:
        value = _strip_text(value)
        if not value:
            raise ValueError("角色名称不能为空。")
        if len(value) > 20:
            raise ValueError("角色名称不能超过 20 个字。")
        return value

    @field_validator("idle_timeout_sec")
    @classmethod
    def ensure_idle_timeout_sec(cls, value: int) -> int:
        if value < 5 or value > 600:
            raise ValueError("静默超时需在 5 到 600 秒之间。")
        return value

    @field_validator("system_role")
    @classmethod
    def ensure_system_role(cls, value: str, info: ValidationInfo) -> str:
        value = _strip_text(value)
        family = info.data.get("model_family")
        if family in {"O", "O2.0"} and not value:
            raise ValueError("讲解角色设定不能为空。")
        return value

    @field_validator("speaking_style")
    @classmethod
    def ensure_speaking_style(cls, value: str, info: ValidationInfo) -> str:
        value = _strip_text(value)
        family = info.data.get("model_family")
        if family in {"O", "O2.0"} and not value:
            raise ValueError("回答风格不能为空。")
        return value

    @field_validator("character_manifest")
    @classmethod
    def ensure_character_manifest(
        cls,
        value: str | None,
        info: ValidationInfo,
    ) -> str | None:
        normalized = _strip_text(value) or None
        family = info.data.get("model_family")
        if family in {"SC", "SC2.0"} and not normalized:
            raise ValueError("角色设定不能为空。")
        return normalized

    @field_validator("playback_tone", mode="before")
    @classmethod
    def force_panda_warm(cls, _: str | None) -> PlaybackTone:
        return "panda_warm"

    @model_validator(mode="after")
    def apply_voice_defaults(self) -> "MuseumConfig":
        self.speaker = DEFAULT_SPEAKER_BY_FAMILY[self.model_family]
        return self

    def to_upstream_payload(self) -> dict:
        dialog_payload: dict = {
            "location": self.location.model_dump(exclude_none=True),
            "extra": {
                "strict_audit": self.strict_audit,
                "audit_response": "当前问题我不方便继续回答，我们可以换个科技馆相关的话题。",
                "input_mod": "audio",
                "enable_user_query_exit": self.enable_user_query_exit,
            },
        }
        if self.model:
            dialog_payload["extra"]["model"] = self.model

        if self.model_family.startswith("SC"):
            dialog_payload["character_manifest"] = (
                self.character_manifest
                or "你是科技馆数字人讲解员，语气自然、专业、热情，擅长用展品故事引导用户继续发问。"
            )
        else:
            dialog_payload["bot_name"] = self.bot_name
            dialog_payload["system_role"] = self.system_role
            dialog_payload["speaking_style"] = self.speaking_style

        return {
            "asr": {
                "extra": {
                    "end_smooth_window_ms": 1500,
                }
            },
            "tts": {
                "speaker": self.speaker,
                "audio_config": {
                    "channel": 1,
                    "format": "pcm_s16le",
                    "sample_rate": 24000,
                },
            },
            "dialog": dialog_payload,
        }

class ConfigSnapshot(BaseModel):
    version: int
    config: MuseumConfig
    timestamp: datetime
    actor: str | None = None

class DraftSnapshot(BaseModel):
    config: MuseumConfig
    updated_at: datetime
    updated_by: str | None = None

class ConfigBundle(BaseModel):
    draft: DraftSnapshot
    published: ConfigSnapshot

class PublicConfigResponse(BaseModel):
    version: int
    config: MuseumConfig

class ConfigHistoryItem(BaseModel):
    version: int
    config: MuseumConfig
    published_at: datetime
    published_by: str | None = None

class AdminLoginRequest(BaseModel):
    password: str = Field(min_length=8, max_length=256)

class AdminSessionStatus(BaseModel):
    authenticated: bool
    csrf_token: str
