from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import uuid
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import websockets


ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
OUTPUT_ROOT = ROOT_DIR / "output" / "tone-variants"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.realtime.protocol import build_json_frame, parse_response  # noqa: E402


DEFAULT_TEXT = "你好呀，我是熊猫讲解员，今天想带你看看有趣的科技世界。"
DEFAULT_MODEL_FAMILY = "O2.0"
DEFAULT_SPEAKER = "zh_female_vv_jupiter_bigtts"
DEFAULT_SAMPLE_RATE = 24000
RECV_TIMEOUT_SECONDS = 20


@dataclass(frozen=True)
class TonePreset:
    index: int
    slug: str
    label: str
    description: str
    filter_chain: str | None
    speaker: str | None = None


ROUND1_PRESETS: list[TonePreset] = [
    TonePreset(
        index=1,
        slug="reference",
        label="基准女声",
        description="不做后处理，直接保留豆包输出，方便和后面的方案对比。",
        filter_chain=None,
    ),
    TonePreset(
        index=2,
        slug="pitch_down_light",
        label="轻降调",
        description="小幅降音高，先去掉偏尖的女声感，不额外压暗。",
        filter_chain="rubberband=pitch=0.90:tempo=0.98:formant=preserved:transients=smooth,"
        "acompressor=threshold=0.090:ratio=2.4:attack=8:release=120:makeup=1.10",
    ),
    TonePreset(
        index=3,
        slug="round_soft",
        label="圆润柔和",
        description="轻降调，补一点中低频，削弱 3kHz 以上的清脆感。",
        filter_chain="rubberband=pitch=0.88:tempo=0.96:formant=preserved:transients=smooth,"
        "bass=f=160:g=2.5:w=0.7,"
        "equalizer=f=470:t=q:w=0.70:g=3.0,"
        "treble=f=3600:g=-4.0:w=0.8,"
        "lowpass=f=4700:p=2,"
        "acompressor=threshold=0.080:ratio=2.8:attack=6:release=140:makeup=1.15",
    ),
    TonePreset(
        index=4,
        slug="meaty_mid",
        label="肉感中频",
        description="重点抬 400-600Hz，让声音更有共鸣箱感。",
        filter_chain="rubberband=pitch=0.87:tempo=0.95:formant=preserved:transients=smooth,"
        "bass=f=180:g=3.0:w=0.8,"
        "equalizer=f=470:t=q:w=0.62:g=4.2,"
        "equalizer=f=620:t=q:w=0.90:g=1.5,"
        "treble=f=3400:g=-5.0:w=0.7,"
        "lowpass=f=4200:p=2,"
        "acompressor=threshold=0.075:ratio=3.0:attack=5:release=150:makeup=1.18",
    ),
    TonePreset(
        index=5,
        slug="plush_softclip",
        label="软糯厚实",
        description="在圆润化基础上加软饱和，听感更毛茸茸。",
        filter_chain="rubberband=pitch=0.87:tempo=0.95:formant=preserved:transients=smooth,"
        "bass=f=180:g=3.2:w=0.8,"
        "equalizer=f=500:t=q:w=0.65:g=4.0,"
        "treble=f=3200:g=-5.5:w=0.7,"
        "lowpass=f=3900:p=2,"
        "acompressor=threshold=0.070:ratio=3.2:attack=5:release=170:makeup=1.22,"
        "volume=1.25,asoftclip=type=tanh:threshold=0.88:output=0.94:param=0.90",
    ),
    TonePreset(
        index=6,
        slug="slow_panda",
        label="慢速憨厚",
        description="明显放慢一点，接近现在前端 0.80 的憨厚节奏。",
        filter_chain="rubberband=pitch=0.86:tempo=0.88:formant=preserved:transients=smooth,"
        "bass=f=170:g=3.5:w=0.8,"
        "equalizer=f=470:t=q:w=0.60:g=4.4,"
        "treble=f=3200:g=-6.0:w=0.8,"
        "lowpass=f=3600:p=2,"
        "acompressor=threshold=0.068:ratio=3.4:attack=4:release=190:makeup=1.24,"
        "volume=1.22,asoftclip=type=tanh:threshold=0.86:output=0.93:param=1.00",
    ),
    TonePreset(
        index=7,
        slug="panda_balanced",
        label="平衡熊猫感",
        description="我认为最值得先试听的一版，降调明显，但还不至于太老或太闷。",
        filter_chain="rubberband=pitch=0.84:tempo=0.90:formant=preserved:transients=smooth,"
        "bass=f=185:g=3.8:w=0.85,"
        "equalizer=f=470:t=q:w=0.58:g=4.6,"
        "treble=f=3300:g=-6.5:w=0.8,"
        "lowpass=f=3500:p=2,"
        "acompressor=threshold=0.065:ratio=3.6:attack=4:release=180:makeup=1.25,"
        "volume=1.24,asoftclip=type=atan:threshold=0.84:output=0.92:param=1.15",
    ),
    TonePreset(
        index=8,
        slug="sleepy_panda",
        label="呆萌偏慢",
        description="更慢、更闷一点，像慢半拍的熊猫。",
        filter_chain="rubberband=pitch=0.83:tempo=0.84:formant=preserved:transients=smooth,"
        "bass=f=180:g=4.0:w=0.9,"
        "equalizer=f=500:t=q:w=0.55:g=4.8,"
        "treble=f=3000:g=-7.2:w=0.9,"
        "lowpass=f=3200:p=2,"
        "acompressor=threshold=0.060:ratio=3.8:attack=4:release=210:makeup=1.28,"
        "volume=1.25,asoftclip=type=tanh:threshold=0.82:output=0.91:param=1.20",
    ),
    TonePreset(
        index=9,
        slug="warm_low",
        label="偏低沉但保女声",
        description="继续往下压音高，但保留女声底色，避免完全变成成年男声。",
        filter_chain="rubberband=pitch=0.80:tempo=0.92:formant=preserved:transients=smooth,"
        "bass=f=170:g=3.6:w=0.8,"
        "equalizer=f=430:t=q:w=0.68:g=4.0,"
        "treble=f=3400:g=-5.8:w=0.8,"
        "lowpass=f=3800:p=2,"
        "acompressor=threshold=0.070:ratio=3.1:attack=5:release=170:makeup=1.18,"
        "volume=1.18,asoftclip=type=cubic:threshold=0.86:output=0.93:param=0.80",
    ),
    TonePreset(
        index=10,
        slug="cartoon_panda",
        label="卡通熊猫",
        description="不追求真实人声，更偏卡通和笨拙感，方便看方向对不对。",
        filter_chain="rubberband=pitch=0.82:tempo=0.86:formant=shifted:transients=smooth,"
        "bass=f=190:g=4.2:w=0.9,"
        "equalizer=f=520:t=q:w=0.55:g=5.0,"
        "treble=f=2800:g=-7.8:w=0.9,"
        "lowpass=f=3000:p=2,"
        "acompressor=threshold=0.058:ratio=4.0:attack=4:release=220:makeup=1.30,"
        "volume=1.28,asoftclip=type=atan:threshold=0.80:output=0.90:param=1.30",
    ),
]

ROUND2_PRESETS: list[TonePreset] = [
    TonePreset(
        index=1,
        slug="xiaohe_reference",
        label="小何原声",
        description="直接听小何底音色，判断是不是底音色方向更接近你想要的熊猫。",
        filter_chain=None,
        speaker="zh_female_xiaohe_jupiter_bigtts",
    ),
    TonePreset(
        index=2,
        slug="xiaohe_soft_low",
        label="小何轻降调",
        description="小何做轻降调和轻柔化，看看甜妹底色往下压后会不会更像幼态熊猫。",
        filter_chain="rubberband=pitch=0.88:tempo=0.96:formant=preserved:transients=smooth,"
        "bass=f=170:g=2.4:w=0.7,"
        "equalizer=f=430:t=q:w=0.72:g=3.2,"
        "treble=f=3600:g=-4.8:w=0.8,"
        "lowpass=f=4300:p=2,"
        "acompressor=threshold=0.078:ratio=2.8:attack=6:release=150:makeup=1.16",
        speaker="zh_female_xiaohe_jupiter_bigtts",
    ),
    TonePreset(
        index=3,
        slug="xiaohe_sleepy",
        label="小何慢糯版",
        description="小何往慢和糯走，保留一点女生感，但尽量不那么尖。",
        filter_chain="rubberband=pitch=0.84:tempo=0.88:formant=preserved:transients=smooth,"
        "bass=f=180:g=3.6:w=0.8,"
        "equalizer=f=480:t=q:w=0.60:g=4.2,"
        "treble=f=3200:g=-6.3:w=0.8,"
        "lowpass=f=3500:p=2,"
        "acompressor=threshold=0.066:ratio=3.4:attack=4:release=185:makeup=1.22,"
        "volume=1.22,asoftclip=type=tanh:threshold=0.84:output=0.92:param=1.10",
        speaker="zh_female_xiaohe_jupiter_bigtts",
    ),
    TonePreset(
        index=4,
        slug="vv_formant_shift",
        label="vv 卡通化",
        description="vv 做轻度 formant shift，试试更卡通、更像动物角色的方向。",
        filter_chain="rubberband=pitch=0.86:tempo=0.92:formant=shifted:transients=smooth,"
        "bass=f=180:g=3.2:w=0.8,"
        "equalizer=f=500:t=q:w=0.62:g=4.0,"
        "treble=f=3000:g=-6.8:w=0.8,"
        "lowpass=f=3400:p=2,"
        "acompressor=threshold=0.064:ratio=3.4:attack=4:release=180:makeup=1.22,"
        "volume=1.20,asoftclip=type=atan:threshold=0.84:output=0.92:param=1.10",
        speaker="zh_female_vv_jupiter_bigtts",
    ),
    TonePreset(
        index=5,
        slug="vv_flat_plush",
        label="vv 扁平软厚",
        description="把 vv 的分享欲压平一些，尽量别那么‘兴奋’，改成软厚陪伴感。",
        filter_chain="rubberband=pitch=0.85:tempo=0.94:formant=preserved:transients=smooth,"
        "bass=f=185:g=3.4:w=0.8,"
        "equalizer=f=450:t=q:w=0.66:g=4.3,"
        "treble=f=3300:g=-5.8:w=0.8,"
        "lowpass=f=3700:p=2,"
        "acompressor=threshold=0.068:ratio=3.1:attack=5:release=170:makeup=1.20,"
        "volume=1.18,asoftclip=type=tanh:threshold=0.86:output=0.93:param=1.00",
        speaker="zh_female_vv_jupiter_bigtts",
    ),
    TonePreset(
        index=6,
        slug="xiaotian_young_cub",
        label="小天幼态版",
        description="小天本身更年轻，稍微抬一点音高和柔化，避免老男人感。",
        filter_chain="rubberband=pitch=1.05:tempo=0.96:formant=preserved:transients=smooth,"
        "bass=f=160:g=2.0:w=0.7,"
        "equalizer=f=380:t=q:w=0.80:g=2.8,"
        "treble=f=3500:g=-4.5:w=0.8,"
        "lowpass=f=4200:p=2,"
        "acompressor=threshold=0.082:ratio=2.6:attack=6:release=140:makeup=1.14,"
        "volume=1.10,asoftclip=type=tanh:threshold=0.90:output=0.95:param=0.80",
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
    TonePreset(
        index=7,
        slug="xiaotian_plush_cub",
        label="小天软萌版",
        description="小天再往圆和糯走一点，试试‘少年熊猫’的感觉。",
        filter_chain="rubberband=pitch=1.02:tempo=0.90:formant=preserved:transients=smooth,"
        "bass=f=175:g=3.0:w=0.8,"
        "equalizer=f=430:t=q:w=0.70:g=3.8,"
        "treble=f=3200:g=-5.6:w=0.8,"
        "lowpass=f=3600:p=2,"
        "acompressor=threshold=0.070:ratio=3.0:attack=5:release=175:makeup=1.18,"
        "volume=1.18,asoftclip=type=atan:threshold=0.86:output=0.93:param=0.95",
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
    TonePreset(
        index=8,
        slug="yunzhou_gentle_cub",
        label="云舟轻幼态",
        description="云舟比小天更稳，轻微抬高音高，看看是不是更像憨一点的小动物。",
        filter_chain="rubberband=pitch=1.04:tempo=0.95:formant=preserved:transients=smooth,"
        "bass=f=165:g=2.2:w=0.75,"
        "equalizer=f=400:t=q:w=0.78:g=3.0,"
        "treble=f=3400:g=-4.8:w=0.8,"
        "lowpass=f=4100:p=2,"
        "acompressor=threshold=0.080:ratio=2.7:attack=6:release=150:makeup=1.15",
        speaker="zh_male_yunzhou_jupiter_bigtts",
    ),
    TonePreset(
        index=9,
        slug="yunzhou_round_slow",
        label="云舟圆慢版",
        description="云舟做更圆的慢速版本，但不故意压成大叔腔。",
        filter_chain="rubberband=pitch=0.98:tempo=0.88:formant=preserved:transients=smooth,"
        "bass=f=180:g=3.2:w=0.8,"
        "equalizer=f=470:t=q:w=0.64:g=4.0,"
        "treble=f=3100:g=-5.8:w=0.8,"
        "lowpass=f=3500:p=2,"
        "acompressor=threshold=0.070:ratio=3.2:attack=5:release=190:makeup=1.20,"
        "volume=1.18,asoftclip=type=tanh:threshold=0.86:output=0.93:param=1.00",
        speaker="zh_male_yunzhou_jupiter_bigtts",
    ),
    TonePreset(
        index=10,
        slug="xiaohe_cartoon_cub",
        label="小何卡通幼崽",
        description="直接往动画角色靠，方便判断你要的是更真实还是更卡通的熊猫。",
        filter_chain="rubberband=pitch=0.80:tempo=0.90:formant=shifted:transients=smooth,"
        "bass=f=185:g=3.8:w=0.85,"
        "equalizer=f=520:t=q:w=0.56:g=4.8,"
        "treble=f=2800:g=-7.2:w=0.9,"
        "lowpass=f=3100:p=2,"
        "acompressor=threshold=0.060:ratio=3.8:attack=4:release=210:makeup=1.24,"
        "volume=1.24,asoftclip=type=atan:threshold=0.82:output=0.91:param=1.25",
        speaker="zh_female_xiaohe_jupiter_bigtts",
    ),
]

ROUND3_PRESETS: list[TonePreset] = [
    TonePreset(
        index=1,
        slug="xiaohe_reference",
        label="小何原声",
        description="保留小何原始底色，作为这轮对比基准。",
        filter_chain=None,
        speaker="zh_female_xiaohe_jupiter_bigtts",
    ),
    TonePreset(
        index=2,
        slug="xiaohe_cub_round",
        label="小何幼崽圆润",
        description="小何轻降调，增加一点 400-600Hz 肉感，削弱清脆感。",
        filter_chain="rubberband=pitch=0.86:tempo=0.93:formant=preserved:transients=smooth,"
        "bass=f=175:g=3.0:w=0.8,"
        "equalizer=f=470:t=q:w=0.66:g=4.0,"
        "treble=f=3300:g=-5.8:w=0.8,"
        "lowpass=f=3650:p=2,"
        "acompressor=threshold=0.068:ratio=3.2:attack=5:release=180:makeup=1.20,"
        "volume=1.18,asoftclip=type=tanh:threshold=0.85:output=0.93:param=1.00",
        speaker="zh_female_xiaohe_jupiter_bigtts",
    ),
    TonePreset(
        index=3,
        slug="xiaohe_cub_sleepy",
        label="小何慢糯幼崽",
        description="更慢一点，尽量靠近懒洋洋的小熊猫。",
        filter_chain="rubberband=pitch=0.83:tempo=0.86:formant=preserved:transients=smooth,"
        "bass=f=180:g=3.8:w=0.85,"
        "equalizer=f=500:t=q:w=0.60:g=4.6,"
        "treble=f=3100:g=-6.8:w=0.8,"
        "lowpass=f=3350:p=2,"
        "acompressor=threshold=0.062:ratio=3.8:attack=4:release=205:makeup=1.24,"
        "volume=1.22,asoftclip=type=atan:threshold=0.83:output=0.91:param=1.18",
        speaker="zh_female_xiaohe_jupiter_bigtts",
    ),
    TonePreset(
        index=4,
        slug="xiaohe_cub_cartoon",
        label="小何卡通幼崽",
        description="往动画角色走，不追求真实人类说话感。",
        filter_chain="rubberband=pitch=0.78:tempo=0.90:formant=shifted:transients=smooth,"
        "bass=f=190:g=4.0:w=0.9,"
        "equalizer=f=520:t=q:w=0.55:g=5.0,"
        "treble=f=2800:g=-7.5:w=0.9,"
        "lowpass=f=3050:p=2,"
        "acompressor=threshold=0.058:ratio=4.0:attack=4:release=220:makeup=1.26,"
        "volume=1.24,asoftclip=type=atan:threshold=0.81:output=0.90:param=1.28",
        speaker="zh_female_xiaohe_jupiter_bigtts",
    ),
    TonePreset(
        index=5,
        slug="xiaohe_flat_soft",
        label="小何压平软厚",
        description="压掉小何偏兴奋的感觉，改成更平、更软的陪伴感。",
        filter_chain="rubberband=pitch=0.88:tempo=0.95:formant=preserved:transients=smooth,"
        "bass=f=170:g=2.6:w=0.75,"
        "equalizer=f=430:t=q:w=0.72:g=3.4,"
        "treble=f=3450:g=-5.0:w=0.8,"
        "lowpass=f=3900:p=2,"
        "acompressor=threshold=0.074:ratio=2.9:attack=5:release=165:makeup=1.16,"
        "volume=1.14,asoftclip=type=tanh:threshold=0.87:output=0.94:param=0.92",
        speaker="zh_female_xiaohe_jupiter_bigtts",
    ),
    TonePreset(
        index=6,
        slug="xiaotian_reference",
        label="小天原声",
        description="保留小天原始底色，判断少年感源头本身是否更接近。",
        filter_chain=None,
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
    TonePreset(
        index=7,
        slug="xiaotian_young_round",
        label="小天少年圆润",
        description="小天轻微抬高音高，补一点中频肉感，减少成熟感。",
        filter_chain="rubberband=pitch=1.03:tempo=0.93:formant=preserved:transients=smooth,"
        "bass=f=170:g=2.8:w=0.8,"
        "equalizer=f=430:t=q:w=0.70:g=3.8,"
        "treble=f=3300:g=-5.2:w=0.8,"
        "lowpass=f=3800:p=2,"
        "acompressor=threshold=0.072:ratio=3.0:attack=5:release=175:makeup=1.18,"
        "volume=1.16,asoftclip=type=tanh:threshold=0.86:output=0.93:param=0.96",
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
    TonePreset(
        index=8,
        slug="xiaotian_soft_cub",
        label="小天软萌幼崽",
        description="小天往更软、更慢、更像少年熊猫的方向收。",
        filter_chain="rubberband=pitch=1.00:tempo=0.88:formant=preserved:transients=smooth,"
        "bass=f=180:g=3.4:w=0.82,"
        "equalizer=f=470:t=q:w=0.64:g=4.2,"
        "treble=f=3150:g=-6.0:w=0.8,"
        "lowpass=f=3500:p=2,"
        "acompressor=threshold=0.066:ratio=3.4:attack=4:release=195:makeup=1.22,"
        "volume=1.20,asoftclip=type=atan:threshold=0.84:output=0.92:param=1.08",
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
    TonePreset(
        index=9,
        slug="xiaotian_cub_bright",
        label="小天轻亮幼态",
        description="不走低沉，直接往更年轻、更轻巧的小动物感走。",
        filter_chain="rubberband=pitch=1.07:tempo=0.95:formant=preserved:transients=smooth,"
        "bass=f=155:g=2.0:w=0.7,"
        "equalizer=f=390:t=q:w=0.80:g=3.0,"
        "treble=f=3500:g=-4.0:w=0.8,"
        "lowpass=f=4300:p=2,"
        "acompressor=threshold=0.082:ratio=2.6:attack=6:release=150:makeup=1.14,"
        "volume=1.10,asoftclip=type=tanh:threshold=0.90:output=0.95:param=0.82",
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
    TonePreset(
        index=10,
        slug="xiaotian_cartoon_cub",
        label="小天卡通幼崽",
        description="小天做轻卡通化，看看男底色转卡通后会不会更像熊猫角色。",
        filter_chain="rubberband=pitch=0.96:tempo=0.90:formant=shifted:transients=smooth,"
        "bass=f=185:g=3.6:w=0.85,"
        "equalizer=f=500:t=q:w=0.58:g=4.6,"
        "treble=f=2950:g=-7.0:w=0.9,"
        "lowpass=f=3200:p=2,"
        "acompressor=threshold=0.060:ratio=3.9:attack=4:release=210:makeup=1.24,"
        "volume=1.22,asoftclip=type=atan:threshold=0.82:output=0.91:param=1.18",
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
]

ROUND4_PRESETS: list[TonePreset] = [
    TonePreset(
        index=1,
        slug="xiaotian_reference",
        label="小天原声",
        description="保留小天原始底色，作为这一轮 EQ 对比基准。",
        filter_chain=None,
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
    TonePreset(
        index=2,
        slug="xiaotian_eq_350_body",
        label="350Hz 肉感",
        description="把厚度更集中放在 300-400Hz，听是不是更像圆一点的小熊猫。",
        filter_chain="rubberband=pitch=1.01:tempo=0.94:formant=preserved:transients=smooth,"
        "bass=f=155:g=2.4:w=0.7,"
        "equalizer=f=350:t=q:w=0.82:g=3.8,"
        "treble=f=3500:g=-4.8:w=0.8,"
        "lowpass=f=4100:p=2,"
        "acompressor=threshold=0.076:ratio=3.0:attack=5:release=170:makeup=1.16",
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
    TonePreset(
        index=3,
        slug="xiaotian_eq_470_meaty",
        label="470Hz 肉感",
        description="厚度主峰放在 470Hz，比较接近我们之前说的熊猫肉感区间。",
        filter_chain="rubberband=pitch=1.00:tempo=0.92:formant=preserved:transients=smooth,"
        "bass=f=170:g=3.0:w=0.8,"
        "equalizer=f=470:t=q:w=0.66:g=4.4,"
        "treble=f=3300:g=-5.6:w=0.8,"
        "lowpass=f=3750:p=2,"
        "acompressor=threshold=0.070:ratio=3.3:attack=5:release=185:makeup=1.20,"
        "volume=1.16,asoftclip=type=tanh:threshold=0.86:output=0.93:param=0.98",
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
    TonePreset(
        index=4,
        slug="xiaotian_eq_620_chest",
        label="620Hz 胸腔感",
        description="把共鸣再往上推一点，看看会不会更像短胖的熊猫腔体。",
        filter_chain="rubberband=pitch=1.00:tempo=0.92:formant=preserved:transients=smooth,"
        "bass=f=175:g=2.8:w=0.8,"
        "equalizer=f=620:t=q:w=0.72:g=4.0,"
        "treble=f=3200:g=-5.2:w=0.8,"
        "lowpass=f=3850:p=2,"
        "acompressor=threshold=0.072:ratio=3.1:attack=5:release=180:makeup=1.18,"
        "volume=1.14,asoftclip=type=tanh:threshold=0.87:output=0.94:param=0.92",
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
    TonePreset(
        index=5,
        slug="xiaotian_eq_dual_body",
        label="320+500Hz 双峰",
        description="同时补一点低中频和中频，让身体感更宽、更厚。",
        filter_chain="rubberband=pitch=1.00:tempo=0.90:formant=preserved:transients=smooth,"
        "bass=f=180:g=3.2:w=0.82,"
        "equalizer=f=320:t=q:w=0.88:g=2.8,"
        "equalizer=f=500:t=q:w=0.62:g=4.0,"
        "treble=f=3200:g=-5.8:w=0.8,"
        "lowpass=f=3600:p=2,"
        "acompressor=threshold=0.068:ratio=3.4:attack=4:release=190:makeup=1.22,"
        "volume=1.18,asoftclip=type=atan:threshold=0.85:output=0.92:param=1.02",
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
    TonePreset(
        index=6,
        slug="xiaotian_eq_nasal_cut",
        label="去鼻音",
        description="切一点 900Hz 左右的鼻音，再补 430Hz，看看会不会更敦实。",
        filter_chain="rubberband=pitch=1.02:tempo=0.93:formant=preserved:transients=smooth,"
        "bass=f=165:g=2.8:w=0.8,"
        "equalizer=f=430:t=q:w=0.70:g=4.0,"
        "equalizer=f=950:t=q:w=1.10:g=-2.4,"
        "treble=f=3350:g=-5.0:w=0.8,"
        "lowpass=f=3900:p=2,"
        "acompressor=threshold=0.072:ratio=3.0:attack=5:release=175:makeup=1.18",
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
    TonePreset(
        index=7,
        slug="xiaotian_eq_presence_scoop",
        label="挖掉清脆感",
        description="重点挖 2.5k-4k 的存在感区，让声音显得更笨、更钝。",
        filter_chain="rubberband=pitch=1.00:tempo=0.90:formant=preserved:transients=smooth,"
        "bass=f=175:g=3.0:w=0.8,"
        "equalizer=f=470:t=q:w=0.64:g=4.2,"
        "equalizer=f=2900:t=q:w=1.20:g=-4.0,"
        "treble=f=3600:g=-7.0:w=0.9,"
        "lowpass=f=3400:p=2,"
        "acompressor=threshold=0.066:ratio=3.5:attack=4:release=200:makeup=1.22,"
        "volume=1.18,asoftclip=type=tanh:threshold=0.84:output=0.92:param=1.06",
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
    TonePreset(
        index=8,
        slug="xiaotian_eq_dark_lp",
        label="重暗化",
        description="更激进地收高频，用来判断是不是你要的其实是更闷更糯的方向。",
        filter_chain="rubberband=pitch=0.99:tempo=0.88:formant=preserved:transients=smooth,"
        "bass=f=185:g=3.6:w=0.84,"
        "equalizer=f=500:t=q:w=0.60:g=4.6,"
        "treble=f=3000:g=-7.4:w=0.9,"
        "lowpass=f=3150:p=2,"
        "acompressor=threshold=0.062:ratio=3.8:attack=4:release=210:makeup=1.24,"
        "volume=1.20,asoftclip=type=atan:threshold=0.83:output=0.91:param=1.12",
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
    TonePreset(
        index=9,
        slug="xiaotian_eq_bright_cub",
        label="轻亮幼态",
        description="相反方向，保留一点亮度和年轻感，看会不会更像熊猫幼崽。",
        filter_chain="rubberband=pitch=1.07:tempo=0.95:formant=preserved:transients=smooth,"
        "bass=f=150:g=2.0:w=0.7,"
        "equalizer=f=390:t=q:w=0.80:g=3.0,"
        "treble=f=3500:g=-3.6:w=0.8,"
        "lowpass=f=4550:p=2,"
        "acompressor=threshold=0.084:ratio=2.6:attack=6:release=150:makeup=1.14,"
        "volume=1.08,asoftclip=type=tanh:threshold=0.90:output=0.95:param=0.80",
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
    TonePreset(
        index=10,
        slug="xiaotian_eq_extreme_panda",
        label="极限熊猫 EQ",
        description="把低中频堆厚、高频收狠，专门试试夸张版会不会更接近你的脑海预期。",
        filter_chain="rubberband=pitch=0.98:tempo=0.88:formant=preserved:transients=smooth,"
        "bass=f=190:g=4.0:w=0.86,"
        "equalizer=f=340:t=q:w=0.90:g=2.6,"
        "equalizer=f=520:t=q:w=0.58:g=4.8,"
        "equalizer=f=3100:t=q:w=1.10:g=-4.4,"
        "treble=f=2900:g=-7.8:w=0.9,"
        "lowpass=f=3000:p=2,"
        "acompressor=threshold=0.058:ratio=4.0:attack=4:release=220:makeup=1.26,"
        "volume=1.22,asoftclip=type=atan:threshold=0.81:output=0.90:param=1.18",
        speaker="zh_male_xiaotian_jupiter_bigtts",
    ),
]

PRESET_SETS: dict[str, list[TonePreset]] = {
    "round1": ROUND1_PRESETS,
    "round2": ROUND2_PRESETS,
    "round3": ROUND3_PRESETS,
    "round4": ROUND4_PRESETS,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render 10 panda-voice tone variants for one sentence.")
    parser.add_argument("--text", default=DEFAULT_TEXT, help="Sentence to synthesize.")
    parser.add_argument("--speaker", default=DEFAULT_SPEAKER, help="Upstream speaker id.")
    parser.add_argument("--model-family", default=DEFAULT_MODEL_FAMILY, help="Realtime model family.")
    parser.add_argument(
        "--preset-set",
        choices=sorted(PRESET_SETS.keys()),
        default="round1",
        help="Preset collection to render.",
    )
    parser.add_argument("--sample-rate", type=int, default=DEFAULT_SAMPLE_RATE, help="PCM sample rate.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=OUTPUT_ROOT / uuid.uuid4().hex[:8],
        help="Directory used to store rendered wav files.",
    )
    parser.add_argument(
        "--base-only",
        action="store_true",
        help="Only synthesize the base wav and skip ffmpeg variants.",
    )
    return parser.parse_args()


def load_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def ensure_ffmpeg() -> None:
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        raise SystemExit("ffmpeg is required but was not found in PATH.") from exc


def build_headers() -> dict[str, str]:
    required_keys = [
        "UPSTREAM_APP_ID",
        "UPSTREAM_ACCESS_KEY",
        "UPSTREAM_RESOURCE_ID",
        "UPSTREAM_APP_KEY",
    ]
    missing = [key for key in required_keys if not os.getenv(key)]
    if missing:
        raise SystemExit(f"Missing upstream credentials: {', '.join(missing)}")

    return {
        "X-Api-App-ID": os.environ["UPSTREAM_APP_ID"],
        "X-Api-Access-Key": os.environ["UPSTREAM_ACCESS_KEY"],
        "X-Api-Resource-Id": os.environ["UPSTREAM_RESOURCE_ID"],
        "X-Api-App-Key": os.environ["UPSTREAM_APP_KEY"],
        "X-Api-Connect-Id": str(uuid.uuid4()),
    }


def build_start_session_payload(speaker: str, sample_rate: int) -> dict[str, Any]:
    return {
        "asr": {
            "extra": {
                "end_smooth_window_ms": 1500,
            }
        },
        "tts": {
            "speaker": speaker,
            "audio_config": {
                "channel": 1,
                "format": "pcm_s16le",
                "sample_rate": sample_rate,
            },
        },
        "dialog": {
            "bot_name": "熊猫讲解员",
            "system_role": "你是科技馆里的熊猫讲解员，说话温柔、亲切、口语化。",
            "speaking_style": "回答简洁自然，像现场陪伴式讲解。",
            "extra": {
                "input_mod": "text",
            },
        },
    }


async def synthesize_base_wav(
    *,
    text: str,
    speaker: str,
    model_family: str,
    sample_rate: int,
    output_path: Path,
) -> None:
    headers = build_headers()
    url = os.getenv("UPSTREAM_BASE_URL", "wss://openspeech.bytedance.com/api/v3/realtime/dialogue")
    session_id = str(uuid.uuid4())
    audio_chunks: list[bytes] = []
    tts_started = False
    tts_finished = False

    async with websockets.connect(
        url,
        additional_headers=headers,
        ping_interval=None,
        close_timeout=1,
        open_timeout=12,
    ) as websocket:
        await websocket.send(build_json_frame(1, {}))
        parse_response(await recv_message(websocket))

        start_payload = build_start_session_payload(speaker=speaker, sample_rate=sample_rate)
        await websocket.send(build_json_frame(100, start_payload, session_id=session_id))
        session_started = parse_response(await recv_message(websocket))
        print(f"StartSession ack event={session_started.get('event')} session_id={session_id}")

        await websocket.send(
            build_json_frame(
                300,
                {
                    "content": text,
                },
                session_id=session_id,
            )
        )

        while not tts_finished:
            parsed = parse_response(await recv_message(websocket))
            event = parsed.get("event")
            message_type = parsed.get("message_type")
            payload = parsed.get("payload_msg")

            if event == 350:
                tts_started = True
                print(f"TTS started event=350 payload={payload}")
            elif event == 352 and message_type == "SERVER_ACK" and isinstance(payload, bytes):
                audio_chunks.append(payload)
                if len(audio_chunks) == 1 or len(audio_chunks) % 5 == 0:
                    print(f"Received audio chunks={len(audio_chunks)} bytes_total={sum(len(chunk) for chunk in audio_chunks)}")
            elif event == 359 and tts_started:
                tts_finished = True
                print("TTS ended event=359")
            elif event == 153:
                raise RuntimeError(f"Session failed: {payload}")
            elif event is not None and event not in {154, 351, 553, 559}:
                print(f"Observed event={event} message_type={message_type}")

        if not audio_chunks:
            raise RuntimeError("No audio chunks were returned from upstream TTS.")

        pcm_audio = b"".join(audio_chunks)
        write_pcm_wav(output_path, pcm_audio, sample_rate=sample_rate)

        try:
            await websocket.send(build_json_frame(102, {}, session_id=session_id))
            await asyncio.wait_for(websocket.close(), timeout=3)
        except Exception:
            pass


async def recv_message(websocket: websockets.ClientConnection) -> str | bytes:
    try:
        return await asyncio.wait_for(websocket.recv(), timeout=RECV_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as exc:
        raise TimeoutError(f"Timed out waiting for upstream response after {RECV_TIMEOUT_SECONDS} seconds.") from exc


def write_pcm_wav(path: Path, pcm_audio: bytes, sample_rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_audio)


def render_variant(base_wav: Path, output_wav: Path, preset: TonePreset, sample_rate: int) -> None:
    if preset.filter_chain is None:
        output_wav.write_bytes(base_wav.read_bytes())
        return

    command = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(base_wav),
        "-af",
        preset.filter_chain,
        "-ar",
        str(sample_rate),
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        str(output_wav),
    ]
    subprocess.run(command, check=True)


def slugify_speaker(speaker: str) -> str:
    return speaker.replace(":", "_").replace("/", "_")


def write_manifest(
    *,
    output_dir: Path,
    text: str,
    speaker: str,
    model_family: str,
    sample_rate: int,
    base_wav: Path | None,
    presets: list[TonePreset],
    preset_set: str,
) -> None:
    manifest = {
        "preset_set": preset_set,
        "text": text,
        "speaker": speaker,
        "model_family": model_family,
        "sample_rate": sample_rate,
        "base_wav": base_wav.name if base_wav is not None else None,
        "variants": [
            {
                "index": preset.index,
                "filename": f"{preset.index:02d}_{preset.slug}.wav",
                "label": preset.label,
                "description": preset.description,
                "speaker": preset.speaker or speaker,
                "filter_chain": preset.filter_chain,
            }
            for preset in presets
        ],
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        f"试听文本: {text}",
        f"预设组: {preset_set}",
        f"模型家族: {model_family}",
        f"默认上游音色: {speaker}",
        f"采样率: {sample_rate}",
        f"基准文件: {base_wav.name if base_wav is not None else '按方案分别生成'}",
        "",
        "方案列表:",
    ]
    for preset in presets:
        lines.append(
            f"{preset.index:02d}_{preset.slug}.wav | {preset.label} | 源音色: {preset.speaker or speaker} | {preset.description}"
        )
    (output_dir / "README.txt").write_text("\n".join(lines), encoding="utf-8")


async def main() -> None:
    args = parse_args()
    load_env_file(BACKEND_DIR / ".env.local")
    ensure_ffmpeg()

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    presets = PRESET_SETS[args.preset_set]
    speaker_cache_dir = output_dir / "_sources"
    speaker_cache_dir.mkdir(parents=True, exist_ok=True)
    cached_sources: dict[str, Path] = {}

    unique_speakers = []
    for preset in presets:
        speaker = preset.speaker or args.speaker
        if speaker not in unique_speakers:
            unique_speakers.append(speaker)

    for speaker in unique_speakers:
        cached_path = speaker_cache_dir / f"{slugify_speaker(speaker)}.wav"
        print(f"Synthesizing source wav for speaker={speaker} -> {cached_path}")
        await synthesize_base_wav(
            text=args.text,
            speaker=speaker,
            model_family=args.model_family,
            sample_rate=args.sample_rate,
            output_path=cached_path,
        )
        cached_sources[speaker] = cached_path

    primary_base_wav = None
    if args.speaker in cached_sources:
        primary_base_wav = output_dir / "00_base_source.wav"
        primary_base_wav.write_bytes(cached_sources[args.speaker].read_bytes())

    if not args.base_only:
        for preset in presets:
            output_wav = output_dir / f"{preset.index:02d}_{preset.slug}.wav"
            speaker = preset.speaker or args.speaker
            print(f"Rendering {output_wav.name} - {preset.label} - source={speaker}")
            render_variant(
                base_wav=cached_sources[speaker],
                output_wav=output_wav,
                preset=preset,
                sample_rate=args.sample_rate,
            )

    write_manifest(
        output_dir=output_dir,
        text=args.text,
        speaker=args.speaker,
        model_family=args.model_family,
        sample_rate=args.sample_rate,
        base_wav=primary_base_wav,
        presets=presets,
        preset_set=args.preset_set,
    )

    print(f"Done. Files written to: {output_dir}")


if __name__ == "__main__":
    asyncio.run(main())
