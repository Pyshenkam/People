export interface AvatarPreset {
  modelYaw: number;
  positionOffset: [number, number, number];
  scaleMultiplier: number;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  cameraFov: number;
  heightFill: number;
  floorY: number;
  floatIntensity: number;
  floatSpeed: number;
}

const defaultPreset: AvatarPreset = {
  modelYaw: 0,
  positionOffset: [0, 0, 0],
  scaleMultiplier: 1,
  cameraPosition: [0, 0.62, 4.9],
  cameraTarget: [0, 0.5, 0],
  cameraFov: 32,
  heightFill: 0.68,
  floorY: -1.72,
  floatIntensity: 0.018,
  floatSpeed: 0.42,
};

const pandaAstronautPreset: AvatarPreset = {
  modelYaw: Math.PI / 2,
  positionOffset: [0, -0.04, 0.02],
  scaleMultiplier: 1.18,
  cameraPosition: [0, 0.8, 3.75],
  cameraTarget: [0, 0.7, 0.04],
  cameraFov: 26,
  heightFill: 0.92,
  floorY: -1.72,
  floatIntensity: 0.006,
  floatSpeed: 0.16,
};

export function resolveAvatarPreset(avatarUrl?: string | null): AvatarPreset {
  const normalized = decodeURIComponent((avatarUrl ?? "").toLowerCase());
  if (normalized.includes("default-avatar.glb") || normalized.includes("熊猫") || normalized.includes("panda")) {
    return pandaAstronautPreset;
  }
  return defaultPreset;
}
