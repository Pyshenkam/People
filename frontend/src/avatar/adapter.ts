import * as THREE from "three";
import type { VisitorPhase } from "../types/api";

interface BoneBinding {
  bone: THREE.Bone;
  restQuaternion: THREE.Quaternion;
  restPosition: THREE.Vector3;
}

export interface AvatarBindings {
  mouthMorph?: { mesh: THREE.Mesh; index: number };
  blinkMorphs: Array<{ mesh: THREE.Mesh; index: number }>;
  jawBone?: BoneBinding;
  headBone?: BoneBinding;
  neckBone?: BoneBinding;
  hipBone?: BoneBinding;
  lowerSpineBone?: BoneBinding;
  upperSpineBone?: BoneBinding;
  leftClavicleBone?: BoneBinding;
  rightClavicleBone?: BoneBinding;
  leftUpperArmBone?: BoneBinding;
  rightUpperArmBone?: BoneBinding;
  leftForearmBone?: BoneBinding;
  rightForearmBone?: BoneBinding;
  leftHandBone?: BoneBinding;
  rightHandBone?: BoneBinding;
  idleClipName?: string;
}

export interface AvatarDriveState {
  level: number;
  delta: number;
  elapsed: number;
  phase: VisitorPhase;
  phaseElapsed: number;
  previousPhase?: VisitorPhase | null;
  previousPhaseElapsed?: number;
  transitionProgress?: number;
}

export interface AvatarRigOffset {
  position: [number, number, number];
  rotation: [number, number, number];
}

const mouthCandidates = ["viseme_aa", "mouthopen", "jawopen", "a", "ah"];
const blinkCandidates = ["blink", "eyeBlinkLeft", "eyeBlinkRight"];
const scratchEuler = new THREE.Euler();
const scratchQuaternion = new THREE.Quaternion();
const scratchTargetQuaternion = new THREE.Quaternion();
const scratchTargetPosition = new THREE.Vector3();
const neutralRigOffset: AvatarRigOffset = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
};

function dampAlpha(delta: number, speed: number): number {
  return 1 - Math.exp(-Math.max(delta, 1 / 120) * speed);
}

function phaseWeight(isActive: boolean, phaseElapsed: number, fadeIn = 0.24): number {
  if (!isActive) {
    return 0;
  }
  return THREE.MathUtils.smoothstep(Math.min(phaseElapsed, fadeIn), 0, fadeIn);
}

function blendOut(progress: number): number {
  return 1 - THREE.MathUtils.smootherstep(THREE.MathUtils.clamp(progress, 0, 1), 0, 1);
}

function steadyPhaseWeight(state: AvatarDriveState, phaseName: VisitorPhase, fadeIn = 0.24): number {
  const current = state.phase === phaseName ? phaseWeight(true, state.phaseElapsed, fadeIn) : 0;
  const previous =
    state.previousPhase === phaseName ? blendOut(state.transitionProgress ?? 1) : 0;
  return THREE.MathUtils.clamp(current + previous, 0, 1);
}

function pulsePhaseWeight(state: AvatarDriveState, phaseName: VisitorPhase, duration: number): number {
  const current = state.phase === phaseName ? phasePulse(duration, state.phaseElapsed) : 0;
  const previous =
    state.previousPhase === phaseName
      ? phasePulse(duration, state.previousPhaseElapsed ?? 0) * blendOut(state.transitionProgress ?? 1)
      : 0;
  return THREE.MathUtils.clamp(current + previous, 0, 1);
}

function findMorph(dictionary: Record<string, number>, names: string[]): number | undefined {
  const normalized = Object.entries(dictionary).map(([name, index]) => ({
    name: name.toLowerCase(),
    index,
  }));
  for (const candidate of names) {
    const match = normalized.find((entry) => entry.name.includes(candidate.toLowerCase()));
    if (match) {
      return match.index;
    }
  }
  return undefined;
}

function createBoneBinding(node: THREE.Bone): BoneBinding {
  return {
    bone: node,
    restQuaternion: node.quaternion.clone(),
    restPosition: node.position.clone(),
  };
}

function captureBone(bindings: AvatarBindings, node: THREE.Bone): void {
  const name = node.name.toLowerCase().replace(/[\s._-]/g, "");
  if (!bindings.jawBone && name.includes("jaw")) {
    bindings.jawBone = createBoneBinding(node);
    return;
  }
  if (!bindings.headBone && name === "head") {
    bindings.headBone = createBoneBinding(node);
    return;
  }
  if (!bindings.neckBone && name.includes("neck")) {
    bindings.neckBone = createBoneBinding(node);
    return;
  }
  if (!bindings.upperSpineBone && (name.includes("spine02") || name.includes("chest"))) {
    bindings.upperSpineBone = createBoneBinding(node);
    return;
  }
  if (!bindings.lowerSpineBone && (name.includes("spine01") || name.includes("waist"))) {
    bindings.lowerSpineBone = createBoneBinding(node);
    return;
  }
  if (!bindings.hipBone && (name === "hip" || name.includes("pelvis"))) {
    bindings.hipBone = createBoneBinding(node);
    return;
  }
  if (!bindings.leftClavicleBone && (name.includes("lclavicle") || name.includes("leftclavicle"))) {
    bindings.leftClavicleBone = createBoneBinding(node);
    return;
  }
  if (!bindings.rightClavicleBone && (name.includes("rclavicle") || name.includes("rightclavicle"))) {
    bindings.rightClavicleBone = createBoneBinding(node);
    return;
  }
  if (!bindings.leftUpperArmBone && (name.includes("lupperarm") || name.includes("leftupperarm"))) {
    bindings.leftUpperArmBone = createBoneBinding(node);
    return;
  }
  if (!bindings.rightUpperArmBone && (name.includes("rupperarm") || name.includes("rightupperarm"))) {
    bindings.rightUpperArmBone = createBoneBinding(node);
    return;
  }
  if (!bindings.leftForearmBone && (name.includes("lforearm") || name.includes("leftforearm"))) {
    bindings.leftForearmBone = createBoneBinding(node);
    return;
  }
  if (!bindings.rightForearmBone && (name.includes("rforearm") || name.includes("rightforearm"))) {
    bindings.rightForearmBone = createBoneBinding(node);
    return;
  }
  if (!bindings.leftHandBone && (name === "lhand" || name === "lefthand")) {
    bindings.leftHandBone = createBoneBinding(node);
    return;
  }
  if (!bindings.rightHandBone && (name === "rhand" || name === "righthand")) {
    bindings.rightHandBone = createBoneBinding(node);
  }
}

function applyRotation(binding: BoneBinding | undefined, delta: number, x = 0, y = 0, z = 0, speed = 10): void {
  if (!binding) {
    return;
  }
  scratchEuler.set(x, y, z, "XYZ");
  scratchTargetQuaternion.copy(binding.restQuaternion);
  scratchTargetQuaternion.multiply(scratchQuaternion.setFromEuler(scratchEuler));
  binding.bone.quaternion.slerp(scratchTargetQuaternion, dampAlpha(delta, speed));
}

function applyPositionY(binding: BoneBinding | undefined, delta: number, offsetY = 0, speed = 9): void {
  if (!binding) {
    return;
  }
  scratchTargetPosition.copy(binding.restPosition);
  scratchTargetPosition.y += offsetY;
  binding.bone.position.lerp(scratchTargetPosition, dampAlpha(delta, speed));
}

function phasePulse(duration: number, phaseElapsed: number): number {
  if (phaseElapsed <= 0 || phaseElapsed >= duration) {
    return 0;
  }
  return Math.sin((phaseElapsed / duration) * Math.PI);
}

export function inspectAvatar(root: THREE.Object3D, animations: THREE.AnimationClip[]): AvatarBindings {
  const bindings: AvatarBindings = {
    blinkMorphs: [],
  };

  root.traverse((node) => {
    if (node instanceof THREE.Bone) {
      captureBone(bindings, node);
    }

    const mesh = node as THREE.Mesh;
    const dictionary = mesh.morphTargetDictionary;
    if (!dictionary || !mesh.morphTargetInfluences) {
      return;
    }

    if (!bindings.mouthMorph) {
      const mouthIndex = findMorph(dictionary, mouthCandidates);
      if (mouthIndex !== undefined) {
        bindings.mouthMorph = { mesh, index: mouthIndex };
      }
    }

    if (bindings.blinkMorphs.length === 0) {
      for (const candidate of blinkCandidates) {
        const blinkIndex = findMorph(dictionary, [candidate]);
        if (blinkIndex !== undefined) {
          bindings.blinkMorphs.push({ mesh, index: blinkIndex });
        }
      }
    }
  });

  const idleClip = animations.find((clip) => clip.name.toLowerCase().includes("idle"));
  if (idleClip) {
    bindings.idleClipName = idleClip.name;
  }
  return bindings;
}

export function driveAvatar(bindings: AvatarBindings, state: AvatarDriveState): AvatarRigOffset {
  const level = THREE.MathUtils.clamp(state.level, 0, 1);
  const delta = state.delta;
  const breathe = Math.sin(state.elapsed * 1.3);
  const speakingBeat = Math.max(0, Math.sin(state.phaseElapsed * (2.6 + level * 0.35)));
  const greetingWeight = pulsePhaseWeight(state, "greeting", 0.95);
  const greetingRaise = greetingWeight * Math.max(0, Math.sin(Math.min(state.phaseElapsed, 0.95) * 3.5));
  const greetingWave = greetingWeight * Math.sin(Math.min(state.phaseElapsed, 0.95) * 7);
  const listeningWeight = steadyPhaseWeight(state, "listening", 0.18);
  const userSpeakingWeight = steadyPhaseWeight(state, "user_speaking", 0.18);
  const attentiveWeight = THREE.MathUtils.clamp(listeningWeight + userSpeakingWeight, 0, 1);
  const listeningNod = attentiveWeight * Math.pow(Math.max(0, Math.sin(state.phaseElapsed * 1.75)), 2);
  const thinkingWeight = steadyPhaseWeight(state, "thinking", 0.22);
  const speakingWeight = steadyPhaseWeight(state, "speaking", 0.18);
  const speakingEmphasis = speakingWeight * speakingBeat;
  const openingWeight = steadyPhaseWeight(state, "opening_session", 0.25);
  const closingWeight = pulsePhaseWeight(state, "closing_session", 0.7);
  const interruptedWeight = pulsePhaseWeight(state, "interrupted", 0.45);
  const errorWeight = steadyPhaseWeight(state, "error", 0.3);
  const settleWeight = interruptedWeight + closingWeight * 0.7;
  const speechShape = Math.max(speakingEmphasis, greetingWeight * 0.55);
  const listeningFold = 0.03 * attentiveWeight;
  const speakingOpen = 0.045 * speakingWeight + 0.09 * speakingEmphasis;
  const thinkingLift = 0.18 * thinkingWeight;
  const rightArmLift = 0.42 * greetingRaise + 0.18 * closingWeight;
  const rightWave = 0.12 * greetingWave + 0.07 * closingWeight * Math.sin(Math.min(state.phaseElapsed, 0.8) * 5.5);

  if (bindings.mouthMorph) {
    const influence =
      speechShape > 0.01
        ? 0.04 + (0.12 + level * 0.22) * (0.35 + speechShape * 0.65)
        : 0.015;
    bindings.mouthMorph.mesh.morphTargetInfluences![bindings.mouthMorph.index] = influence;
  }

  const blinkGate = Math.sin(state.elapsed * 0.58 + Math.sin(state.elapsed * 0.14) * 0.3);
  const blinkInfluence = blinkGate > 0.985 ? 0.85 : 0;
  for (const blink of bindings.blinkMorphs) {
    blink.mesh.morphTargetInfluences![blink.index] = blinkInfluence;
  }

  if (bindings.jawBone) {
    const jawOpen =
      speechShape > 0.01
        ? 0.012 + level * 0.05 * (0.35 + speechShape * 0.65)
        : 0.004;
    applyRotation(bindings.jawBone, delta, jawOpen, 0, 0, 14);
  }

  applyPositionY(bindings.hipBone, delta);
  applyPositionY(bindings.lowerSpineBone, delta);
  applyPositionY(bindings.upperSpineBone, delta);
  applyPositionY(bindings.neckBone, delta);
  applyPositionY(bindings.headBone, delta);

  applyRotation(
    bindings.hipBone,
    delta,
    0.004 * breathe +
      0.012 * attentiveWeight +
      0.008 * speakingEmphasis +
      0.008 * openingWeight -
      0.012 * settleWeight -
      0.014 * errorWeight,
    0,
    0,
    9,
  );
  applyRotation(
    bindings.lowerSpineBone,
    delta,
    0.008 * breathe +
      0.024 * attentiveWeight +
      0.012 * speakingEmphasis +
      0.012 * openingWeight -
      0.016 * settleWeight -
      0.018 * errorWeight,
    0,
    0,
    9,
  );
  applyRotation(
    bindings.upperSpineBone,
    delta,
    0.01 * breathe +
      0.045 * attentiveWeight +
      0.02 * speakingEmphasis +
      0.018 * greetingRaise +
      0.014 * openingWeight -
      0.018 * settleWeight -
      0.02 * errorWeight,
    0.006 * speakingEmphasis - 0.01 * thinkingWeight,
    -0.01 * attentiveWeight,
    10,
  );
  applyRotation(
    bindings.neckBone,
    delta,
    0.006 * breathe +
      0.018 * attentiveWeight +
      0.01 * speakingEmphasis +
      0.02 * listeningNod -
      0.012 * settleWeight -
      0.014 * errorWeight,
    0.004 * speakingEmphasis - 0.016 * thinkingWeight,
    -0.02 * listeningWeight - 0.05 * thinkingWeight,
    12,
  );
  applyRotation(
    bindings.headBone,
    delta,
    0.008 * breathe +
      0.026 * attentiveWeight +
      0.016 * speakingEmphasis +
      0.065 * listeningNod +
      0.02 * greetingRaise -
      0.012 * settleWeight -
      0.014 * errorWeight,
    0.008 * speakingEmphasis - 0.022 * thinkingWeight + 0.006 * greetingWave,
    -0.03 * listeningWeight + 0.035 * userSpeakingWeight - 0.08 * thinkingWeight,
    13,
  );

  applyRotation(
    bindings.leftClavicleBone,
    delta,
    0.015 * thinkingLift,
    -0.018 * listeningFold - 0.02 * speakingOpen + 0.02 * thinkingLift,
    0,
    10,
  );
  applyRotation(
    bindings.rightClavicleBone,
    delta,
    0.08 * greetingRaise + 0.02 * closingWeight,
    0.12 * greetingRaise + 0.02 * speakingOpen - 0.015 * listeningFold,
    0,
    10,
  );
  applyRotation(
    bindings.leftUpperArmBone,
    delta,
    0.04 * speakingOpen + 0.08 * thinkingLift,
    0,
    0.03 * listeningFold + 0.08 * thinkingLift,
    10,
  );
  applyRotation(
    bindings.rightUpperArmBone,
    delta,
    rightArmLift + 0.05 * speakingOpen,
    0.01 * speakingEmphasis,
    -0.03 * listeningFold - 0.04 * greetingRaise,
    10,
  );
  applyRotation(
    bindings.leftForearmBone,
    delta,
    -0.02 * listeningFold - 0.22 * thinkingLift,
    0,
    0.02 * speakingOpen + 0.05 * thinkingLift,
    11,
  );
  applyRotation(
    bindings.rightForearmBone,
    delta,
    0.2 * greetingRaise + 0.05 * greetingWave + 0.08 * closingWeight,
    0,
    rightWave,
    11,
  );
  applyRotation(bindings.leftHandBone, delta, 0.015 * thinkingLift, 0, 0.02 * thinkingLift, 12);
  applyRotation(bindings.rightHandBone, delta, 0, 0, 0.06 * greetingWave + 0.04 * closingWeight, 12);

  return {
    position: [
      0,
      0.006 * Math.max(0, breathe) +
        0.006 * speakingEmphasis +
        0.012 * greetingRaise -
        0.008 * settleWeight -
        0.008 * errorWeight,
      0.006 * attentiveWeight,
    ],
    rotation: [
      0.006 * attentiveWeight +
        0.008 * speakingEmphasis +
        0.012 * greetingRaise +
        0.008 * openingWeight -
        0.008 * settleWeight -
        0.01 * errorWeight,
      0,
      0,
    ],
  };
}

export const defaultRigOffset = neutralRigOffset;
