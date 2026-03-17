import * as THREE from "three";

export interface AvatarBindings {
  mouthMorph?: { mesh: THREE.Mesh; index: number };
  blinkMorphs: Array<{ mesh: THREE.Mesh; index: number }>;
  jawBone?: THREE.Bone;
  headBone?: THREE.Bone;
  idleClipName?: string;
}

const mouthCandidates = ["viseme_aa", "mouthopen", "jawopen", "a", "ah"];
const blinkCandidates = ["blink", "eyeBlinkLeft", "eyeBlinkRight"];

function findMorph(
  dictionary: Record<string, number>,
  names: string[],
): number | undefined {
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

export function inspectAvatar(root: THREE.Object3D, animations: THREE.AnimationClip[]): AvatarBindings {
  const bindings: AvatarBindings = {
    blinkMorphs: [],
  };

  root.traverse((node) => {
    if (node instanceof THREE.Bone) {
      const name = node.name.toLowerCase();
      if (!bindings.jawBone && name.includes("jaw")) {
        bindings.jawBone = node;
      }
      if (!bindings.headBone && name.includes("head")) {
        bindings.headBone = node;
      }
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

export function driveAvatar(bindings: AvatarBindings, level: number, elapsed: number): void {
  if (bindings.mouthMorph) {
    const influence = 0.08 + level * 0.92;
    bindings.mouthMorph.mesh.morphTargetInfluences![bindings.mouthMorph.index] = influence;
  }

  const blinkWave = (Math.sin(elapsed * 0.6) + 1) * 0.5;
  for (const blink of bindings.blinkMorphs) {
    blink.mesh.morphTargetInfluences![blink.index] = blinkWave > 0.98 ? 0.8 : 0;
  }

  if (bindings.jawBone) {
    bindings.jawBone.rotation.x = level * 0.18;
  }
  if (bindings.headBone) {
    bindings.headBone.rotation.y = Math.sin(elapsed * 0.45) * 0.028;
    bindings.headBone.rotation.x = Math.sin(elapsed * 0.3) * 0.014;
  }
}
