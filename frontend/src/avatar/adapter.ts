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
  elapsed: number;
  phase: VisitorPhase;
  phaseElapsed: number;
}

export interface AvatarRigOffset {
  position: [number, number, number];
  rotation: [number, number, number];
}

const mouthCandidates = ["viseme_aa", "mouthopen", "jawopen", "a", "ah"];
const blinkCandidates = ["blink", "eyeBlinkLeft", "eyeBlinkRight"];
const scratchEuler = new THREE.Euler();
const scratchQuaternion = new THREE.Quaternion();
const neutralRigOffset: AvatarRigOffset = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
};

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

function applyRotation(binding: BoneBinding | undefined, x = 0, y = 0, z = 0): void {
  if (!binding) {
    return;
  }
  binding.bone.quaternion.copy(binding.restQuaternion);
  if (x === 0 && y === 0 && z === 0) {
    return;
  }
  scratchEuler.set(x, y, z, "XYZ");
  binding.bone.quaternion.multiply(scratchQuaternion.setFromEuler(scratchEuler));
}

function applyPositionY(binding: BoneBinding | undefined, offsetY = 0): void {
  if (!binding) {
    return;
  }
  binding.bone.position.copy(binding.restPosition);
  binding.bone.position.y += offsetY;
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
  const breathe = Math.sin(state.elapsed * 1.65);
  const idleSway = Math.sin(state.elapsed * 0.92);
  const curiousLook = Math.sin(state.elapsed * 0.72);
  const speechBeat = Math.sin(state.elapsed * (6.4 + level * 2.4));
  const speechLift = Math.max(0, speechBeat);
  const greetingWeight = state.phase === "greeting" ? phasePulse(1.2, state.phaseElapsed) : 0;
  const greetingWave = greetingWeight * Math.sin(state.phaseElapsed * 17);
  const listeningWeight = state.phase === "listening" ? 1 : 0;
  const userSpeakingWeight = state.phase === "user_speaking" ? 1 : 0;
  const thinkingWeight = state.phase === "thinking" ? 1 : 0;
  const speakingWeight = state.phase === "speaking" ? 1 : 0;
  const idleWeight = state.phase === "idle" || state.phase === "boot" || state.phase === "opening_session" ? 1 : 0;
  const settleWeight =
    state.phase === "interrupted" || state.phase === "closing_session" || state.phase === "error"
      ? phasePulse(0.55, state.phaseElapsed)
      : 0;

  if (bindings.mouthMorph) {
    const influence =
      state.phase === "speaking" || state.phase === "greeting"
        ? 0.08 + (0.16 + level * 0.72) * (0.35 + speechLift * 0.65)
        : 0.02;
    bindings.mouthMorph.mesh.morphTargetInfluences![bindings.mouthMorph.index] = influence;
  }

  const blinkGate = Math.sin(state.elapsed * 0.58 + Math.sin(state.elapsed * 0.14) * 0.3);
  const blinkInfluence = blinkGate > 0.985 ? 0.85 : 0;
  for (const blink of bindings.blinkMorphs) {
    blink.mesh.morphTargetInfluences![blink.index] = blinkInfluence;
  }

  if (bindings.jawBone) {
    const jawOpen =
      state.phase === "speaking" || state.phase === "greeting"
        ? 0.03 + level * 0.12 * (0.4 + speechLift * 0.6)
        : 0.01;
    applyRotation(bindings.jawBone, jawOpen, 0, 0);
  }

  applyPositionY(bindings.hipBone);
  applyPositionY(bindings.lowerSpineBone);
  applyPositionY(bindings.upperSpineBone);
  applyPositionY(bindings.neckBone);
  applyPositionY(bindings.headBone);

  applyRotation(
    bindings.hipBone,
    0.008 * breathe + 0.026 * listeningWeight + 0.022 * userSpeakingWeight + 0.01 * speechLift * speakingWeight - 0.02 * settleWeight,
    0.01 * idleSway,
    0,
  );
  applyRotation(
    bindings.lowerSpineBone,
    0.016 * breathe + 0.032 * listeningWeight + 0.038 * userSpeakingWeight + 0.018 * speechLift * speakingWeight + 0.05 * greetingWeight,
    0.02 * idleSway + 0.012 * curiousLook * thinkingWeight,
    0.01 * idleSway,
  );
  applyRotation(
    bindings.upperSpineBone,
    0.022 * breathe + 0.05 * listeningWeight + 0.056 * userSpeakingWeight + 0.028 * speechLift * speakingWeight + 0.065 * greetingWeight,
    0.014 * curiousLook * thinkingWeight + 0.012 * Math.sin(state.elapsed * 1.9) * speakingWeight,
    0.012 * idleSway,
  );
  applyRotation(
    bindings.neckBone,
    0.012 * breathe + 0.028 * listeningWeight + 0.034 * userSpeakingWeight + 0.012 * speechLift * speakingWeight + 0.04 * greetingWeight,
    0.012 * idleSway + 0.04 * curiousLook * thinkingWeight,
    -0.02 * listeningWeight + 0.028 * userSpeakingWeight,
  );
  applyRotation(
    bindings.headBone,
    0.016 * breathe + 0.045 * listeningWeight + 0.06 * userSpeakingWeight + 0.032 * speechLift * speakingWeight + 0.08 * greetingWeight - 0.016 * settleWeight,
    0.012 * idleSway + 0.052 * curiousLook * thinkingWeight + 0.02 * Math.sin(state.elapsed * 1.6) * speakingWeight,
    -0.03 * listeningWeight + 0.05 * userSpeakingWeight + 0.012 * greetingWave,
  );

  const speakingOpen = speakingWeight * (0.12 + level * 0.18) * (0.5 + 0.5 * Math.sin(state.elapsed * 4.8));
  const speakingSwing = speakingWeight * (0.16 + level * 0.14) * Math.sin(state.elapsed * 4.1);
  const listeningFold = 0.05 * listeningWeight + 0.07 * userSpeakingWeight;

  applyRotation(
    bindings.leftClavicleBone,
    -0.04 * speakingOpen,
    -0.045 * listeningFold - 0.04 * speakingOpen,
    -0.02 * speakingSwing,
  );
  applyRotation(
    bindings.rightClavicleBone,
    0.14 * greetingWeight + 0.02 * speechLift * speakingWeight,
    0.28 * greetingWeight + 0.05 * speakingOpen - 0.04 * listeningFold,
    -0.02 * speakingSwing - 0.05 * greetingWeight,
  );
  applyRotation(
    bindings.leftUpperArmBone,
    0.12 * speakingOpen,
    -0.02 * speakingSwing,
    0.06 * speakingSwing + 0.03 * listeningFold,
  );
  applyRotation(
    bindings.rightUpperArmBone,
    0.66 * greetingWeight + 0.14 * speakingOpen,
    0.03 * speakingSwing,
    -0.08 * speakingSwing - 0.06 * listeningFold,
  );
  applyRotation(
    bindings.leftForearmBone,
    -0.08 * speakingSwing - 0.06 * listeningFold,
    0,
    0.04 * speakingOpen,
  );
  applyRotation(
    bindings.rightForearmBone,
    0.4 * greetingWeight + 0.16 * greetingWave + 0.08 * speakingSwing - 0.04 * listeningFold,
    0,
    -0.02 * speakingOpen,
  );
  applyRotation(bindings.leftHandBone, 0, 0, -0.04 * speakingSwing);
  applyRotation(bindings.rightHandBone, 0, 0, 0.14 * greetingWave + 0.05 * speakingSwing);

  return {
    position: [
      0.02 * idleSway * (idleWeight * 0.8 + speakingWeight * 0.35),
      0.012 * Math.max(0, breathe) + 0.014 * speechLift * speakingWeight + 0.02 * greetingWeight - 0.008 * settleWeight,
      0,
    ],
    rotation: [
      0.008 * breathe + 0.022 * listeningWeight + 0.028 * userSpeakingWeight + 0.012 * speechLift * speakingWeight + 0.02 * greetingWeight - 0.02 * settleWeight,
      0,
      0.008 * idleSway,
    ],
  };
}

export const defaultRigOffset = neutralRigOffset;
