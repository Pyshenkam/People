export interface AvatarPreset {
  rotation: [number, number, number];
  positionOffset: [number, number, number];
  scaleMultiplier: number;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  cameraFov: number;
  floatIntensity: number;
  floatSpeed: number;
}

const defaultPreset: AvatarPreset = {
  rotation: [0, 0, 0],
  positionOffset: [0, 0, 0],
  scaleMultiplier: 1,
  cameraPosition: [0, 0.5, 6.2],
  cameraTarget: [0, 0.7, 0],
  cameraFov: 23,
  floatIntensity: 0.05,
  floatSpeed: 0.85,
};

const pandaAstronautPreset: AvatarPreset = {
  rotation: [0, 0, 0],
  positionOffset: [0, -0.08, 0.22],
  scaleMultiplier: 1.14,
  cameraPosition: [4.85, 0.86, 0.8],
  cameraTarget: [0, 1.02, 0.1],
  cameraFov: 22,
  floatIntensity: 0.03,
  floatSpeed: 0.62,
};

export function resolveAvatarPreset(avatarUrl?: string | null): AvatarPreset {
  const normalized = decodeURIComponent((avatarUrl ?? "").toLowerCase());
  if (normalized.includes("default-avatar.glb") || normalized.includes("熊猫") || normalized.includes("panda")) {
    return pandaAstronautPreset;
  }
  return defaultPreset;
}
