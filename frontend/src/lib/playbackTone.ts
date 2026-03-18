export type PlaybackTone = "panda_warm";

export interface PlaybackToneOption {
  value: PlaybackTone;
  label: string;
  description: string;
}

export const playbackToneOptions: PlaybackToneOption[] = [
  {
    value: "panda_warm",
    label: "默认憨厚化",
    description: "访客端固定增强低频并柔化高频，让熊猫讲解更厚实、更憨一点。",
  },
];

export function getPlaybackToneMeta(value: PlaybackTone | string | null | undefined) {
  if (!value) {
    return undefined;
  }
  return playbackToneOptions.find((item) => item.value === value);
}

export function formatPlaybackTone(value: PlaybackTone | string | null | undefined): string {
  return getPlaybackToneMeta(value ?? "panda_warm")?.label ?? "默认憨厚化";
}
