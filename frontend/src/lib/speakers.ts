import type { ModelFamily } from "../types/api";

export interface SpeakerOption {
  value: string;
  shortLabel: string;
  description: string;
}

const oSpeakerOptions: SpeakerOption[] = [
  {
    value: "zh_female_vv_jupiter_bigtts",
    shortLabel: "vv · 活泼灵动女声",
    description: "适用于 O / O2.0。活泼灵动的女声，有很强的分享欲。",
  },
  {
    value: "zh_female_xiaohe_jupiter_bigtts",
    shortLabel: "小何 · 甜美活泼女声",
    description: "适用于 O / O2.0。甜美活泼的女声，带明显台湾口音。",
  },
  {
    value: "zh_male_yunzhou_jupiter_bigtts",
    shortLabel: "云舟 · 清爽沉稳男声",
    description: "适用于 O / O2.0。清爽沉稳的男声。",
  },
  {
    value: "zh_male_xiaotian_jupiter_bigtts",
    shortLabel: "小天 · 清爽磁性男声",
    description: "适用于 O / O2.0。清爽磁性的男声。",
  },
];

const scSpeakerOptions: SpeakerOption[] = [
  { value: "ICL_zh_female_aojiaonvyou_tob", shortLabel: "傲娇女友", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_female_bingjiaojiejie_tob", shortLabel: "病娇姐姐", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_female_chengshujiejie_tob", shortLabel: "成熟姐姐", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_female_keainvsheng_tob", shortLabel: "可爱女生", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_female_nuanxinxuejie_tob", shortLabel: "暖心学姐", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_female_tiexinnvyou_tob", shortLabel: "贴心女友", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_female_wenrouwenya_tob", shortLabel: "温柔文雅", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_female_wumeiyujie_tob", shortLabel: "妩媚御姐", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_female_xingganyujie_tob", shortLabel: "性感御姐", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_male_aiqilingren_tob", shortLabel: "傲气凌人", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_male_aojiaogongzi_tob", shortLabel: "傲娇公子", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_male_aojiaojingying_tob", shortLabel: "傲娇精英", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_male_aomanshaoye_tob", shortLabel: "傲慢少爷", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_male_badaoshaoye_tob", shortLabel: "霸道少爷", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_male_bingjiaobailian_tob", shortLabel: "病娇白脸", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_male_bujiqingnian_tob", shortLabel: "不羁青年", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_male_chengshuzongcai_tob", shortLabel: "成熟总裁", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_male_cixingnansang_tob", shortLabel: "磁性男嗓", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_male_cujingnanyou_tob", shortLabel: "粗犷男友", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_male_fengfashaonian_tob", shortLabel: "风发少年", description: "适用于 SC 官方克隆音色。" },
  { value: "ICL_zh_male_fuheigongzi_tob", shortLabel: "腹黑公子", description: "适用于 SC 官方克隆音色。" },
];

const sc2SpeakerOptions: SpeakerOption[] = [
  { value: "saturn_zh_female_aojiaonvyou_tob", shortLabel: "傲娇女友", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_female_bingjiaojiejie_tob", shortLabel: "病娇姐姐", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_female_chengshujiejie_tob", shortLabel: "成熟姐姐", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_female_keainvsheng_tob", shortLabel: "可爱女生", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_female_nuanxinxuejie_tob", shortLabel: "暖心学姐", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_female_tiexinnvyou_tob", shortLabel: "贴心女友", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_female_wenrouwenya_tob", shortLabel: "温柔文雅", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_female_wumeiyujie_tob", shortLabel: "妩媚御姐", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_female_xingganyujie_tob", shortLabel: "性感御姐", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_male_aiqilingren_tob", shortLabel: "傲气凌人", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_male_aojiaogongzi_tob", shortLabel: "傲娇公子", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_male_aojiaojingying_tob", shortLabel: "傲娇精英", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_male_aomanshaoye_tob", shortLabel: "傲慢少爷", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_male_badaoshaoye_tob", shortLabel: "霸道少爷", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_male_bingjiaobailian_tob", shortLabel: "病娇白脸", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_male_bujiqingnian_tob", shortLabel: "不羁青年", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_male_chengshuzongcai_tob", shortLabel: "成熟总裁", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_male_cixingnansang_tob", shortLabel: "磁性男嗓", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_male_cujingnanyou_tob", shortLabel: "粗犷男友", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_male_fengfashaonian_tob", shortLabel: "风发少年", description: "适用于 SC2.0 官方克隆音色。" },
  { value: "saturn_zh_male_fuheigongzi_tob", shortLabel: "腹黑公子", description: "适用于 SC2.0 官方克隆音色。" },
];

const speakerOptionsByFamily: Record<ModelFamily, SpeakerOption[]> = {
  O: oSpeakerOptions,
  "O2.0": oSpeakerOptions,
  SC: scSpeakerOptions,
  "SC2.0": sc2SpeakerOptions,
};

const defaultSpeakerByFamily: Record<ModelFamily, string> = {
  O: "zh_male_xiaotian_jupiter_bigtts",
  "O2.0": "zh_male_xiaotian_jupiter_bigtts",
  SC: "ICL_zh_female_wenrouwenya_tob",
  "SC2.0": "saturn_zh_female_wenrouwenya_tob",
};

const speakerLookup = new Map(
  [...oSpeakerOptions, ...scSpeakerOptions, ...sc2SpeakerOptions].map((item) => [item.value, item]),
);

export function getSpeakerOptionsForFamily(family: ModelFamily): SpeakerOption[] {
  return speakerOptionsByFamily[family];
}

export function getDefaultSpeakerForFamily(family: ModelFamily): string {
  return defaultSpeakerByFamily[family];
}

export function isSpeakerSupportedByFamily(
  speaker: string | null | undefined,
  family: ModelFamily,
): boolean {
  if (!speaker) {
    return false;
  }
  return speakerOptionsByFamily[family].some((item) => item.value === speaker);
}

export function getSpeakerMeta(speaker: string | null | undefined): SpeakerOption | undefined {
  if (!speaker) {
    return undefined;
  }
  return speakerLookup.get(speaker);
}

export function formatSpeakerDisplay(speaker: string | null | undefined): string {
  const meta = getSpeakerMeta(speaker);
  if (!speaker) {
    return "-";
  }
  if (!meta) {
    return speaker;
  }
  return `${meta.shortLabel} (${meta.value})`;
}
