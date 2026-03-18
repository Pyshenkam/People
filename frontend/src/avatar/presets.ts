export interface AvatarPreset {
  modelYaw: number;
  rigRootRotation: [number, number, number];
  positionOffset: [number, number, number];
  scaleMultiplier: number;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  cameraFov: number;
  heightFill: number;
  floorY: number;
  floatIntensity: number;
  floatSpeed: number;
  shadowScale: number;
  shadowOpacity: number;
}

const defaultPreset: AvatarPreset = {
  modelYaw: 0,
  rigRootRotation: [0, 0, 0],
  positionOffset: [0, 0, 0],
  scaleMultiplier: 1,
  cameraPosition: [0, 0.62, 4.9],
  cameraTarget: [0, 0.5, 0],
  cameraFov: 32,
  heightFill: 0.68,
  floorY: -0.22,
  floatIntensity: 0.012,
  floatSpeed: 0.24,
  shadowScale: 2.6,
  shadowOpacity: 0.42,
};

const pandaPreset: AvatarPreset = {
  // This GLB is authored with its visible "front" aligned near +X, so keep the
  // camera on that axis instead of drifting toward a 3/4 angle.
  modelYaw: 0,
  rigRootRotation: [0, 0, 0],
  positionOffset: [0, 0.02, 0],
  scaleMultiplier: 1.16,
  cameraPosition: [3.12, 0.9, 0.04],
  cameraTarget: [0.08, 0.62, 0],
  cameraFov: 27,
  heightFill: 0.7,
  floorY: -0.16,
  floatIntensity: 0.01,
  floatSpeed: 0.24,
  shadowScale: 3,
  shadowOpacity: 0.48,
};

export function resolveAvatarPreset(avatarUrl?: string | null): AvatarPreset {
  const normalized = decodeURIComponent((avatarUrl ?? "").toLowerCase());
  if (normalized.includes("default-avatar.glb") || normalized.includes("熊猫") || normalized.includes("panda")) {
    return pandaPreset;
  }
  return defaultPreset;
}
