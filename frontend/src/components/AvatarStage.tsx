import {
  Cloud,
  ContactShadows,
  Environment,
  Lightformer,
  MeshReflectorMaterial,
  Sparkles,
  Stars,
  useAnimations,
  useGLTF,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { driveAvatar, inspectAvatar } from "../avatar/adapter";
import { resolveAvatarPreset, type AvatarPreset } from "../avatar/presets";
import type { VisitorPhase } from "../types/api";

interface AvatarStageProps {
  avatarUrl?: string | null;
  level: number;
  phase: VisitorPhase;
}

const stageEnvironmentFile = "/environments/rogland_clear_night_1k.hdr";
const stageCoolAccent = "#78dcff";
const stageWarmAccent = "#9fd7ff";
const stageGlassAccent = "#8ad6ff";

type StageVisualMode = "idle" | "engaged" | "narrating";

function resolveStableStageVisualMode(
  phase: VisitorPhase,
  previousMode: StageVisualMode,
): StageVisualMode {
  switch (phase) {
    case "boot":
    case "idle":
    case "error":
      return "idle";
    case "listening":
    case "user_speaking":
    case "thinking":
      return "engaged";
    case "speaking":
      return "narrating";
    case "opening_session":
    case "greeting":
    case "interrupted":
    case "closing_session":
    default:
      return previousMode;
  }
}

function resolveMotionPhase(phase: VisitorPhase): VisitorPhase {
  if (phase === "user_speaking") {
    return "listening";
  }
  return phase;
}

function phasePulse(duration: number, elapsed: number): number {
  if (elapsed <= 0 || elapsed >= duration) {
    return 0;
  }
  return Math.sin((elapsed / duration) * Math.PI);
}

function FallbackAvatar({ level, phase }: { level: number; phase: VisitorPhase }) {
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const torsoRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const motionPhase = resolveMotionPhase(phase);
  const phaseRef = useRef({ phase: motionPhase, startedAt: 0 });

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (phaseRef.current.phase !== motionPhase) {
      phaseRef.current = { phase: motionPhase, startedAt: elapsed };
    }
    const phaseElapsed = elapsed - phaseRef.current.startedAt;
    const breathe = Math.sin(elapsed * 1.6);
    const greetingWeight = motionPhase === "greeting" ? phasePulse(1.15, phaseElapsed) : 0;
    const speakingWeight = motionPhase === "speaking" ? 1 : 0;
    const listeningWeight = motionPhase === "listening" ? 1 : 0;
    const thinkingWeight = motionPhase === "thinking" ? 1 : 0;
    const wave = greetingWeight * Math.sin(phaseElapsed * 16);

    if (groupRef.current) {
      groupRef.current.position.y = -0.16 + Math.max(0, breathe) * 0.02 + greetingWeight * 0.02;
      groupRef.current.rotation.y = Math.sin(elapsed * 0.85) * 0.025 + thinkingWeight * 0.03;
      groupRef.current.rotation.x = listeningWeight * 0.03 + speakingWeight * Math.max(0, Math.sin(elapsed * 6)) * 0.015;
    }
    if (torsoRef.current) {
      torsoRef.current.rotation.z = Math.sin(elapsed * 0.9) * 0.03;
      torsoRef.current.scale.y = 1 + Math.max(0, breathe) * 0.025;
    }
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(elapsed * 0.75) * 0.06 + thinkingWeight * 0.08;
      headRef.current.rotation.x =
        Math.max(0, breathe) * 0.04 + listeningWeight * 0.08 + speakingWeight * Math.max(0, Math.sin(elapsed * 6.8)) * 0.06;
      headRef.current.rotation.z = phase === "user_speaking" ? 0.08 : phase === "listening" ? -0.05 : 0;
    }
    if (leftArmRef.current) {
      leftArmRef.current.rotation.z = 0.16 + speakingWeight * Math.sin(elapsed * 4.2) * 0.1;
      leftArmRef.current.rotation.x = speakingWeight * 0.16;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.z = -0.16 - greetingWeight * 0.8 - wave * 0.16 + speakingWeight * Math.sin(elapsed * 4.2) * 0.1;
      rightArmRef.current.rotation.x = greetingWeight * 0.4 + speakingWeight * 0.18;
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.16, 0]} scale={1.08}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <capsuleGeometry args={[0.42, 0.9, 10, 24]} />
        <meshStandardMaterial color="#f4f9ff" metalness={0.18} roughness={0.28} />
      </mesh>
      <mesh ref={torsoRef} position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.48, 0.58, 1.05, 40]} />
        <meshStandardMaterial color="#0e2140" metalness={0.44} roughness={0.36} emissive="#133256" emissiveIntensity={0.2} />
      </mesh>
      <mesh ref={headRef} position={[0, 1.18, 0.04]} castShadow receiveShadow>
        <sphereGeometry args={[0.56, 40, 40]} />
        <meshStandardMaterial color="#f7fbff" metalness={0.12} roughness={0.24} />
      </mesh>
      <mesh position={[-0.2, 1.18, 0.48]}>
        <sphereGeometry args={[0.12, 20, 20]} />
        <meshBasicMaterial color="#0e1624" />
      </mesh>
      <mesh position={[0.2, 1.18, 0.48]}>
        <sphereGeometry args={[0.12, 20, 20]} />
        <meshBasicMaterial color="#0e1624" />
      </mesh>
      <mesh position={[0, 1.02, 0.52]}>
        <coneGeometry args={[0.08, 0.14, 18]} />
        <meshStandardMaterial color="#111923" metalness={0.18} roughness={0.55} />
      </mesh>
      <mesh ref={leftArmRef} position={[-0.58, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.12, 0.62, 8, 20]} />
        <meshStandardMaterial color="#173667" metalness={0.3} roughness={0.38} />
      </mesh>
      <mesh ref={rightArmRef} position={[0.58, 0.55, 0]} castShadow>
        <capsuleGeometry args={[0.12, 0.62, 8, 20]} />
        <meshStandardMaterial color="#173667" metalness={0.3} roughness={0.38} />
      </mesh>
    </group>
  );
}

function LoadedAvatar({
  avatarUrl,
  level,
  phase,
  preset,
}: {
  avatarUrl: string;
  level: number;
  phase: VisitorPhase;
  preset: AvatarPreset;
}) {
  const root = useRef<THREE.Group>(null);
  const motionPhase = resolveMotionPhase(phase);
  const phaseRef = useRef({
    phase: motionPhase,
    startedAt: 0,
    previousPhase: null as VisitorPhase | null,
    previousPhaseElapsed: 0,
    transitionStartedAt: 0,
  });
  const { scene, animations } = useGLTF(avatarUrl, true);
  const fitted = useMemo(() => {
    // Skinned meshes need SkeletonUtils.clone(); a plain scene.clone(true)
    // keeps the outer hierarchy but can leave bone-driven deformation inert.
    const clone = cloneSkinned(scene);
    const rootCorrection = preset.rigRootRotation;
    if (rootCorrection[0] !== 0 || rootCorrection[1] !== 0 || rootCorrection[2] !== 0) {
      const rigRoot = clone.getObjectByName("Root");
      if (rigRoot) {
        const correctionEuler = new THREE.Euler(rootCorrection[0], rootCorrection[1], rootCorrection[2], "XYZ");
        rigRoot.quaternion.multiply(new THREE.Quaternion().setFromEuler(correctionEuler));
      }
    }
    const fitRoot = new THREE.Group();
    fitRoot.rotation.y = preset.modelYaw;
    fitRoot.add(clone);
    fitRoot.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(fitRoot);
    if (box.isEmpty()) {
      return {
        clone,
        scale: preset.scaleMultiplier,
        position: new THREE.Vector3(...preset.positionOffset),
      };
    }

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const height = Number.isFinite(size.y) && size.y > 0.001 ? size.y : 2.6;
    const camera = new THREE.Vector3(...preset.cameraPosition);
    const target = new THREE.Vector3(...preset.cameraTarget);
    const distance = camera.distanceTo(target);
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(preset.cameraFov / 2)) * distance;
    const desiredHeight = visibleHeight * preset.heightFill;
    const scale = (desiredHeight / height) * preset.scaleMultiplier;

    return {
      clone,
      scale,
      position: new THREE.Vector3(
        -center.x * scale,
        preset.floorY - box.min.y * scale + preset.positionOffset[1],
        -center.z * scale + preset.positionOffset[2],
      ),
    };
  }, [
    preset.cameraFov,
    preset.cameraPosition,
    preset.cameraTarget,
    preset.floorY,
    preset.heightFill,
    preset.modelYaw,
    preset.positionOffset,
    preset.rigRootRotation,
    preset.scaleMultiplier,
    scene,
  ]);
  const bindings = useMemo(() => inspectAvatar(fitted.clone, animations), [animations, fitted.clone]);
  const { actions } = useAnimations(animations, root);
  const basePosition = useMemo(
    () => [fitted.position.x + preset.positionOffset[0], fitted.position.y, fitted.position.z] as const,
    [fitted.position.x, fitted.position.y, fitted.position.z, preset.positionOffset],
  );

  useEffect(() => {
    if (bindings.idleClipName) {
      // The model's authored idle clip fights the procedural phase poses and
      // reads as constant random swaying, so keep it disabled here.
      actions[bindings.idleClipName]?.stop();
    }
  }, [actions, bindings.idleClipName]);

  useFrame(({ clock }, delta) => {
    const elapsed = clock.getElapsedTime();
    if (phaseRef.current.phase !== motionPhase) {
      phaseRef.current = {
        phase: motionPhase,
        startedAt: elapsed,
        previousPhase: phaseRef.current.phase,
        previousPhaseElapsed: elapsed - phaseRef.current.startedAt,
        transitionStartedAt: elapsed,
      };
    }
    const transitionElapsed = elapsed - phaseRef.current.transitionStartedAt;
    const transitionProgress = THREE.MathUtils.clamp(transitionElapsed / 0.32, 0, 1);
    if (phaseRef.current.previousPhase && transitionProgress >= 1) {
      phaseRef.current.previousPhase = null;
      phaseRef.current.previousPhaseElapsed = 0;
    }
    const rigOffset = driveAvatar(bindings, {
      delta,
      level,
      elapsed,
      phase: motionPhase,
      phaseElapsed: elapsed - phaseRef.current.startedAt,
      previousPhase: phaseRef.current.previousPhase,
      previousPhaseElapsed: phaseRef.current.previousPhase
        ? phaseRef.current.previousPhaseElapsed + transitionElapsed
        : 0,
      transitionProgress,
    });

    if (root.current) {
      root.current.position.set(
        basePosition[0] + rigOffset.position[0],
        basePosition[1] + rigOffset.position[1],
        basePosition[2] + rigOffset.position[2],
      );
      root.current.rotation.set(
        rigOffset.rotation[0],
        preset.modelYaw + rigOffset.rotation[1],
        rigOffset.rotation[2],
      );
    }
  });

  return (
    <group ref={root} position={basePosition} rotation={[0, preset.modelYaw, 0]} scale={fitted.scale}>
      <primitive object={fitted.clone} />
    </group>
  );
}

const StaticStageEnvironment = memo(function StaticStageEnvironment() {
  return (
    <Environment
      files={stageEnvironmentFile}
      background={false}
      blur={0.82}
      backgroundBlurriness={0.5}
      environmentIntensity={0.32}
    >
      <Lightformer
        form="ring"
        color={stageCoolAccent}
        intensity={0.7}
        scale={2.1}
        position={[0, 1.45, -5.6]}
        target={[0, 0.72, 0]}
      />
      <Lightformer
        form="rect"
        color="#7fd8ff"
        intensity={0.58}
        scale={[0.8, 5.6, 1]}
        position={[-4.2, 1.1, -2.1]}
        rotation={[0, Math.PI / 5, 0]}
      />
      <Lightformer
        form="rect"
        color="#7fd8ff"
        intensity={0.58}
        scale={[0.8, 5.6, 1]}
        position={[4.2, 1.1, -2.1]}
        rotation={[0, -Math.PI / 5, 0]}
      />
      <Lightformer
        form="rect"
        color={stageWarmAccent}
        intensity={0.34}
        scale={[2.4, 0.5, 1]}
        position={[0, 2.9, -3.6]}
        rotation={[Math.PI / 3.2, 0, 0]}
      />
    </Environment>
  );
});

function useRadialGlowTexture() {
  const texture = useMemo(() => {
    if (typeof document === "undefined") {
      return null;
    }

    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.22, "rgba(255, 255, 255, 0.78)");
    gradient.addColorStop(0.58, "rgba(255, 255, 255, 0.18)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const glowTexture = new THREE.CanvasTexture(canvas);
    glowTexture.colorSpace = THREE.SRGBColorSpace;
    glowTexture.needsUpdate = true;
    return glowTexture;
  }, []);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  return texture;
}

function useStarSpriteTexture() {
  const texture = useMemo(() => {
    if (typeof document === "undefined") {
      return null;
    }

    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.14, "rgba(255, 255, 255, 0.98)");
    gradient.addColorStop(0.34, "rgba(255, 255, 255, 0.82)");
    gradient.addColorStop(0.62, "rgba(255, 255, 255, 0.18)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const starTexture = new THREE.CanvasTexture(canvas);
    starTexture.colorSpace = THREE.SRGBColorSpace;
    starTexture.needsUpdate = true;
    return starTexture;
  }, []);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  return texture;
}

interface NebulaGlowProps {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  opacity: number;
  rotation?: number;
}

function NebulaGlow({ position, scale, color, opacity, rotation = 0 }: NebulaGlowProps) {
  const texture = useRadialGlowTexture();

  if (!texture) {
    return null;
  }

  return (
    <sprite position={position} scale={scale}>
      <spriteMaterial
        map={texture}
        color={color}
        transparent
        opacity={opacity}
        rotation={rotation}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </sprite>
  );
}

interface ParallaxStarLayerProps {
  center: [number, number, number];
  span: [number, number, number];
  count: number;
  color: string;
  size: number;
  opacity: number;
  drift?: number;
  twinkle?: number;
  rotationZ?: number;
}

function ParallaxStarLayer({
  center,
  span,
  count,
  color,
  size,
  opacity,
  drift = 0.12,
  twinkle = 0.4,
  rotationZ = 0,
}: ParallaxStarLayerProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const texture = useStarSpriteTexture();
  const [spanX, spanY, spanZ] = span;

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = THREE.MathUtils.randFloatSpread(spanX);
      positions[index * 3 + 1] = THREE.MathUtils.randFloatSpread(spanY);
      positions[index * 3 + 2] = -Math.random() * spanZ;
    }

    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return starGeometry;
  }, [count, spanX, spanY, spanZ]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) {
      return;
    }

    const elapsed = clock.getElapsedTime();
    pointsRef.current.position.set(
      center[0] + Math.sin(elapsed * drift * 0.32) * 0.08,
      center[1] + Math.cos(elapsed * drift * 0.24) * 0.04,
      center[2],
    );
    pointsRef.current.rotation.z = rotationZ + Math.sin(elapsed * drift) * 0.01;

    const material = pointsRef.current.material;
    if (material instanceof THREE.PointsMaterial) {
      const shimmer = (Math.sin(elapsed * (1.4 + drift) + size * 18) + 1) * 0.5;
      material.opacity = opacity * (1 - twinkle * 0.12 + shimmer * twinkle * 0.24);
    }
  });

  if (!texture) {
    return null;
  }

  return (
    <points ref={pointsRef} geometry={geometry} position={center} frustumCulled={false}>
      <pointsMaterial
        color={color}
        map={texture}
        alphaMap={texture}
        size={size}
        sizeAttenuation
        transparent
        opacity={opacity}
        alphaTest={0.02}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

interface ReactiveStageTargets {
  leftSpotIntensity: number;
  rightSpotIntensity: number;
  footLightIntensity: number;
  topFrameEmissive: number;
  baseFrameEmissive: number;
  pillarEmissive: number;
  accentOpacity: number;
  glassOpacity: number;
  floorAccentOpacity: number;
  ringOpacity: number;
}

function getReactiveStageTargets(mode: StageVisualMode): ReactiveStageTargets {
  switch (mode) {
    case "engaged":
      return {
        leftSpotIntensity: 5.2,
        rightSpotIntensity: 4.1,
        footLightIntensity: 2.9,
        topFrameEmissive: 0.46,
        baseFrameEmissive: 0.38,
        pillarEmissive: 0.46,
        accentOpacity: 0.78,
        glassOpacity: 0.62,
        floorAccentOpacity: 0.46,
        ringOpacity: 0.38,
      };
    case "narrating":
      return {
        leftSpotIntensity: 6.1,
        rightSpotIntensity: 4.9,
        footLightIntensity: 3.35,
        topFrameEmissive: 0.56,
        baseFrameEmissive: 0.44,
        pillarEmissive: 0.54,
        accentOpacity: 0.88,
        glassOpacity: 0.72,
        floorAccentOpacity: 0.56,
        ringOpacity: 0.48,
      };
    case "idle":
    default:
      return {
        leftSpotIntensity: 4.2,
        rightSpotIntensity: 3.4,
        footLightIntensity: 2.4,
        topFrameEmissive: 0.38,
        baseFrameEmissive: 0.32,
        pillarEmissive: 0.4,
        accentOpacity: 0.62,
        glassOpacity: 0.5,
        floorAccentOpacity: 0.34,
        ringOpacity: 0.28,
      };
  }
}

const StaticCosmosBackdrop = memo(function StaticCosmosBackdrop({
  cameraPosition,
  cameraTarget,
}: {
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
}) {
  const backdropTransform = useMemo(() => {
    const cameraPositionVector = new THREE.Vector3(...cameraPosition);
    const cameraTargetVector = new THREE.Vector3(...cameraTarget);
    const forward = cameraTargetVector.clone().sub(cameraPositionVector).normalize();
    const position = cameraTargetVector.clone().addScaledVector(forward, 12.15);
    const anchor = new THREE.Object3D();
    anchor.position.copy(position);
    anchor.lookAt(cameraPositionVector);
    anchor.updateMatrixWorld(true);

    return {
      position: [position.x, position.y, position.z] as [number, number, number],
      quaternion: anchor.quaternion.clone(),
    };
  }, [
    cameraPosition[0],
    cameraPosition[1],
    cameraPosition[2],
    cameraTarget[0],
    cameraTarget[1],
    cameraTarget[2],
  ]);

  return (
    <group position={backdropTransform.position} quaternion={backdropTransform.quaternion}>
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[34, 18]} />
        <meshBasicMaterial color="#01040c" side={THREE.DoubleSide} />
      </mesh>

      <NebulaGlow position={[0.16, 0.28, 0.24]} scale={[28, 11.4, 1]} color="#06101d" opacity={0.18} />
      <NebulaGlow
        position={[-5.2, 2.3, 0.62]}
        scale={[11.4, 2.9, 1]}
        color="#163157"
        opacity={0.24}
        rotation={-0.3}
      />
      <NebulaGlow
        position={[-1.46, 1.26, 1.08]}
        scale={[12.4, 2.24, 1]}
        color="#2b548f"
        opacity={0.26}
        rotation={-0.24}
      />
      <NebulaGlow
        position={[2.04, 0.18, 1.72]}
        scale={[10.6, 1.96, 1]}
        color="#d7f5ff"
        opacity={0.18}
        rotation={-0.18}
      />
      <NebulaGlow
        position={[5.6, -0.78, 2.22]}
        scale={[9.4, 1.82, 1]}
        color="#81d8ff"
        opacity={0.14}
        rotation={-0.14}
      />
      <NebulaGlow
        position={[-6.2, -1.48, 1.96]}
        scale={[8.6, 2.7, 1]}
        color="#0f2344"
        opacity={0.12}
        rotation={0.08}
      />
      <NebulaGlow
        position={[0.82, 2.74, 1.76]}
        scale={[8.2, 2.6, 1]}
        color="#1e3b68"
        opacity={0.12}
        rotation={-0.08}
      />
      <NebulaGlow
        position={[4.9, 1.58, 1.54]}
        scale={[6.4, 2.2, 1]}
        color="#7bd8ff"
        opacity={0.08}
        rotation={-0.22}
      />
      <NebulaGlow
        position={[-0.9, -2.42, 2.72]}
        scale={[9.2, 3.1, 1]}
        color="#0d1730"
        opacity={0.11}
        rotation={0.12}
      />

      <ParallaxStarLayer
        center={[0.12, 0.2, 0.42]}
        span={[28, 14.8, 3.8]}
        count={3000}
        color="#95a8c7"
        size={0.022}
        opacity={0.16}
        drift={0.026}
        twinkle={0.08}
      />
      <ParallaxStarLayer
        center={[0.32, 0.06, 1.08]}
        span={[24.6, 12.8, 2.7]}
        count={1700}
        color="#c2d5ee"
        size={0.028}
        opacity={0.22}
        drift={0.03}
        twinkle={0.12}
      />
      <ParallaxStarLayer
        center={[-0.46, 0.96, 1.46]}
        span={[25.8, 3.9, 1.9]}
        count={1250}
        color="#dbe9ff"
        size={0.032}
        opacity={0.3}
        drift={0.042}
        twinkle={0.18}
        rotationZ={-0.22}
      />
      <ParallaxStarLayer
        center={[0.92, 0.28, 2.12]}
        span={[20.8, 2.7, 1.1]}
        count={460}
        color="#f4f9ff"
        size={0.062}
        opacity={0.46}
        drift={0.06}
        twinkle={0.22}
        rotationZ={-0.22}
      />
      <ParallaxStarLayer
        center={[1.82, -0.18, 2.96]}
        span={[17.4, 2.1, 0.82]}
        count={128}
        color="#fff6de"
        size={0.106}
        opacity={0.68}
        drift={0.096}
        twinkle={0.34}
        rotationZ={-0.2}
      />
      <ParallaxStarLayer
        center={[-1.1, 2.52, 1.84]}
        span={[21.2, 3.6, 1.4]}
        count={420}
        color={stageGlassAccent}
        size={0.034}
        opacity={0.18}
        drift={0.048}
        twinkle={0.16}
      />
      <ParallaxStarLayer
        center={[1.42, -2.46, 2.46]}
        span={[20.8, 3.3, 1.5]}
        count={340}
        color="#c0d2eb"
        size={0.034}
        opacity={0.16}
        drift={0.038}
        twinkle={0.12}
      />
      <NebulaGlow position={[-7, 2.72, 3.42]} scale={[0.34, 0.34, 1]} color="#fff0d9" opacity={0.9} />
      <NebulaGlow position={[-3.2, 1.72, 3.56]} scale={[0.4, 0.4, 1]} color="#8fe7ff" opacity={0.86} />
      <NebulaGlow position={[1.3, 0.72, 3.7]} scale={[0.44, 0.44, 1]} color="#ffffff" opacity={0.9} />
      <NebulaGlow position={[5.8, -0.68, 3.62]} scale={[0.38, 0.38, 1]} color="#fff7e8" opacity={0.84} />
      <NebulaGlow position={[8.2, 2.12, 3.36]} scale={[0.28, 0.28, 1]} color="#8ecfff" opacity={0.8} />
      <Stars radius={84} depth={24} count={4200} factor={1.72} saturation={0} fade speed={0.12} />
      <Sparkles count={12} scale={[19.2, 10.2, 10.4]} size={1.48} speed={0.04} color="#dceeff" />
      <Sparkles count={6} scale={[16.8, 8.2, 8.2]} size={2.02} speed={0.03} color={stageGlassAccent} />

      <Cloud
        position={[-4.2, 1.82, 1.76]}
        scale={[4.6, 0.9, 1]}
        bounds={[5.2, 0.78, 2]}
        segments={26}
        opacity={0.14}
        speed={0.04}
        color="#29446d"
      />
      <Cloud
        position={[-0.12, 0.82, 2.18]}
        scale={[5.4, 1, 1]}
        bounds={[6.2, 0.86, 2]}
        segments={24}
        opacity={0.16}
        speed={0.03}
        color="#4a73ae"
      />
      <Cloud
        position={[3.6, -0.08, 2.72]}
        scale={[4.2, 0.92, 1]}
        bounds={[4.8, 0.74, 2]}
        segments={24}
        opacity={0.13}
        speed={0.03}
        color="#7cbcf0"
      />
      <Cloud
        position={[6.8, -1.24, 3.04]}
        scale={[3.4, 0.84, 1]}
        bounds={[4, 0.66, 2]}
        segments={20}
        opacity={0.1}
        speed={0.025}
        color="#d8efff"
      />
      <Cloud
        position={[-1.2, -2.38, 3.28]}
        scale={[5.2, 1.16, 1]}
        bounds={[6, 0.9, 2]}
        segments={20}
        opacity={0.08}
        speed={0.03}
        color="#101b34"
      />
    </group>
  );
});

const ReactiveStageLayer = memo(function ReactiveStageLayer({
  floorY,
  mode,
}: {
  floorY: number;
  mode: StageVisualMode;
}) {
  const windowCenterY = floorY + 1.16;
  const leftSpotRef = useRef<THREE.SpotLight>(null);
  const rightSpotRef = useRef<THREE.SpotLight>(null);
  const footLightRef = useRef<THREE.PointLight>(null);
  const topFrameMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const baseFrameMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const leftPillarMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const rightPillarMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const leftAccentMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const rightAccentMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const topGlassMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const floorAccentMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const currentTargetsRef = useRef(getReactiveStageTargets(mode));
  const targetTargetsRef = useRef(getReactiveStageTargets(mode));

  useEffect(() => {
    targetTargetsRef.current = getReactiveStageTargets(mode);
  }, [mode]);

  useFrame((_, delta) => {
    const current = currentTargetsRef.current;
    const target = targetTargetsRef.current;
    const damping = 1 - Math.exp(-delta * 4.6);

    current.leftSpotIntensity = THREE.MathUtils.lerp(current.leftSpotIntensity, target.leftSpotIntensity, damping);
    current.rightSpotIntensity = THREE.MathUtils.lerp(current.rightSpotIntensity, target.rightSpotIntensity, damping);
    current.footLightIntensity = THREE.MathUtils.lerp(current.footLightIntensity, target.footLightIntensity, damping);
    current.topFrameEmissive = THREE.MathUtils.lerp(current.topFrameEmissive, target.topFrameEmissive, damping);
    current.baseFrameEmissive = THREE.MathUtils.lerp(current.baseFrameEmissive, target.baseFrameEmissive, damping);
    current.pillarEmissive = THREE.MathUtils.lerp(current.pillarEmissive, target.pillarEmissive, damping);
    current.accentOpacity = THREE.MathUtils.lerp(current.accentOpacity, target.accentOpacity, damping);
    current.glassOpacity = THREE.MathUtils.lerp(current.glassOpacity, target.glassOpacity, damping);
    current.floorAccentOpacity = THREE.MathUtils.lerp(current.floorAccentOpacity, target.floorAccentOpacity, damping);
    current.ringOpacity = THREE.MathUtils.lerp(current.ringOpacity, target.ringOpacity, damping);

    if (leftSpotRef.current) {
      leftSpotRef.current.intensity = current.leftSpotIntensity;
    }
    if (rightSpotRef.current) {
      rightSpotRef.current.intensity = current.rightSpotIntensity;
    }
    if (footLightRef.current) {
      footLightRef.current.intensity = current.footLightIntensity;
    }
    if (topFrameMaterialRef.current) {
      topFrameMaterialRef.current.emissiveIntensity = current.topFrameEmissive;
    }
    if (baseFrameMaterialRef.current) {
      baseFrameMaterialRef.current.emissiveIntensity = current.baseFrameEmissive;
    }
    if (leftPillarMaterialRef.current) {
      leftPillarMaterialRef.current.emissiveIntensity = current.pillarEmissive;
    }
    if (rightPillarMaterialRef.current) {
      rightPillarMaterialRef.current.emissiveIntensity = current.pillarEmissive;
    }
    if (leftAccentMaterialRef.current) {
      leftAccentMaterialRef.current.opacity = current.accentOpacity;
    }
    if (rightAccentMaterialRef.current) {
      rightAccentMaterialRef.current.opacity = current.accentOpacity;
    }
    if (topGlassMaterialRef.current) {
      topGlassMaterialRef.current.opacity = current.glassOpacity;
    }
    if (floorAccentMaterialRef.current) {
      floorAccentMaterialRef.current.opacity = current.floorAccentOpacity;
    }
    if (ringMaterialRef.current) {
      ringMaterialRef.current.opacity = current.ringOpacity;
    }
  });

  const initialTargets = currentTargetsRef.current;

  return (
    <>
      <spotLight
        ref={leftSpotRef}
        position={[-2.8, 2.8, 1.9]}
        intensity={initialTargets.leftSpotIntensity}
        angle={0.42}
        penumbra={0.95}
        color={stageCoolAccent}
      />
      <spotLight
        ref={rightSpotRef}
        position={[2.8, 2.4, 1.5]}
        intensity={initialTargets.rightSpotIntensity}
        angle={0.44}
        penumbra={0.98}
        color={stageWarmAccent}
      />
      <pointLight
        ref={footLightRef}
        position={[0, 0.55, 1.3]}
        intensity={initialTargets.footLightIntensity}
        distance={6.2}
        color="#6cc4ff"
      />

      <mesh position={[0, windowCenterY + 1.62, -5.95]} castShadow>
        <boxGeometry args={[7.24, 0.3, 0.52]} />
        <meshStandardMaterial
          ref={topFrameMaterialRef}
          color="#09111f"
          metalness={0.74}
          roughness={0.24}
          emissive="#13233a"
          emissiveIntensity={initialTargets.topFrameEmissive}
        />
      </mesh>
      <mesh position={[0, floorY + 0.08, -5.5]} castShadow>
        <boxGeometry args={[7.6, 0.42, 0.9]} />
        <meshStandardMaterial
          ref={baseFrameMaterialRef}
          color="#0a1321"
          metalness={0.72}
          roughness={0.22}
          emissive="#0c1c31"
          emissiveIntensity={initialTargets.baseFrameEmissive}
        />
      </mesh>
      <mesh position={[-3.48, windowCenterY, -5.8]} castShadow>
        <boxGeometry args={[0.34, 3.48, 0.48]} />
        <meshStandardMaterial
          ref={leftPillarMaterialRef}
          color="#0b1322"
          metalness={0.68}
          roughness={0.28}
          emissive="#102034"
          emissiveIntensity={initialTargets.pillarEmissive}
        />
      </mesh>
      <mesh position={[3.48, windowCenterY, -5.8]} castShadow>
        <boxGeometry args={[0.34, 3.48, 0.48]} />
        <meshStandardMaterial
          ref={rightPillarMaterialRef}
          color="#0b1322"
          metalness={0.68}
          roughness={0.28}
          emissive="#102034"
          emissiveIntensity={initialTargets.pillarEmissive}
        />
      </mesh>

      <mesh position={[-3.08, windowCenterY + 0.02, -5.48]}>
        <boxGeometry args={[0.08, 2.74, 0.06]} />
        <meshBasicMaterial
          ref={leftAccentMaterialRef}
          color={stageCoolAccent}
          transparent
          opacity={initialTargets.accentOpacity}
        />
      </mesh>
      <mesh position={[3.08, windowCenterY + 0.02, -5.48]}>
        <boxGeometry args={[0.08, 2.74, 0.06]} />
        <meshBasicMaterial
          ref={rightAccentMaterialRef}
          color={stageCoolAccent}
          transparent
          opacity={initialTargets.accentOpacity}
        />
      </mesh>
      <mesh position={[0, windowCenterY + 1.32, -5.44]}>
        <boxGeometry args={[5.72, 0.08, 0.04]} />
        <meshBasicMaterial
          ref={topGlassMaterialRef}
          color={stageGlassAccent}
          transparent
          opacity={initialTargets.glassOpacity}
        />
      </mesh>
      <mesh position={[0, floorY + 0.33, -5.42]}>
        <boxGeometry args={[5.66, 0.06, 0.04]} />
        <meshBasicMaterial
          ref={floorAccentMaterialRef}
          color={stageCoolAccent}
          transparent
          opacity={initialTargets.floorAccentOpacity}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, -0.02]} receiveShadow>
        <circleGeometry args={[3.12, 72]} />
        <MeshReflectorMaterial
          resolution={512}
          blur={[420, 90]}
          mixBlur={0.9}
          mixStrength={1.6}
          mirror={0.18}
          roughness={0.42}
          metalness={0.64}
          color="#08131f"
          depthScale={0.35}
          minDepthThreshold={0.78}
          maxDepthThreshold={1.35}
          reflectorOffset={0.02}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY + 0.012, 0.02]}>
        <ringGeometry args={[0.88, 1.7, 72]} />
        <meshBasicMaterial
          ref={ringMaterialRef}
          color={stageCoolAccent}
          transparent
          opacity={initialTargets.ringOpacity}
        />
      </mesh>
    </>
  );
});

const ScenePostFx = memo(function ScenePostFx() {
  return (
    <EffectComposer>
      <Bloom mipmapBlur intensity={0.68} luminanceThreshold={0.18} luminanceSmoothing={0.46} />
      <Noise opacity={0.018} />
      <Vignette eskil={false} offset={0.18} darkness={0.84} />
    </EffectComposer>
  );
});

const CameraRig = memo(function CameraRig({ target }: { target: [number, number, number] }) {
  const { camera } = useThree();
  const targetVector = useMemo(() => new THREE.Vector3(...target), [target]);

  useEffect(() => {
    camera.lookAt(targetVector);
    camera.updateProjectionMatrix();
  }, [camera, targetVector]);

  useFrame(() => {
    camera.lookAt(targetVector);
  });

  return null;
});

function AvatarActor({
  avatarUrl,
  level,
  phase,
  preset,
}: {
  avatarUrl?: string | null;
  level: number;
  phase: VisitorPhase;
  preset: AvatarPreset;
}) {
  return (
    <Suspense fallback={<FallbackAvatar level={level} phase={phase} />}>
      {avatarUrl ? (
        <LoadedAvatar avatarUrl={avatarUrl} level={level} phase={phase} preset={preset} />
      ) : (
        <FallbackAvatar level={level} phase={phase} />
      )}
    </Suspense>
  );
}

function useStableStageVisualMode(phase: VisitorPhase): StageVisualMode {
  const [visualMode, setVisualMode] = useState<StageVisualMode>(() =>
    resolveStableStageVisualMode(phase, "idle"),
  );
  const stableModeRef = useRef<StageVisualMode>(visualMode);

  useEffect(() => {
    const nextMode = resolveStableStageVisualMode(phase, stableModeRef.current);
    if (nextMode === stableModeRef.current) {
      return;
    }
    stableModeRef.current = nextMode;
    setVisualMode(nextMode);
  }, [phase]);

  return visualMode;
}

export const AvatarStage = memo(function AvatarStage({
  avatarUrl,
  level,
  phase,
}: AvatarStageProps) {
  const preset = useMemo(() => resolveAvatarPreset(avatarUrl), [avatarUrl]);
  const stageVisualMode = useStableStageVisualMode(phase);

  useEffect(() => {
    if (avatarUrl) {
      useGLTF.preload(avatarUrl, true);
    }
  }, [avatarUrl]);

  useEffect(() => {
    const renderToText = () =>
      JSON.stringify({
        mode: phase,
        avatar: avatarUrl ?? "fallback",
        preset: avatarUrl?.toLowerCase().includes("panda-v2.glb") ? "panda-v2" : "default",
        note: "centered portrait camera; origin at scene center; +y up; camera looks toward -z",
      });

    const runtimeWindow = window as Window & { render_game_to_text?: () => string };
    runtimeWindow.render_game_to_text = renderToText;
    return () => {
      delete runtimeWindow.render_game_to_text;
    };
  }, [avatarUrl, phase]);

  return (
    <div className="avatar-stage">
      <Canvas camera={{ position: preset.cameraPosition, fov: preset.cameraFov }} shadows dpr={[1, 2]}>
        <color attach="background" args={["#01040c"]} />
        <fog attach="fog" args={["#01040c", 15.4, 36]} />
        <CameraRig target={preset.cameraTarget} />
        <ambientLight intensity={0.38} />
        <hemisphereLight intensity={0.5} groundColor="#010409" color="#b4e3ff" />
        <directionalLight position={[0.3, 3.8, 3.5]} intensity={1.6} castShadow color="#eef6ff" />
        <spotLight position={[0, 4.8, 2.2]} intensity={18} angle={0.33} penumbra={0.92} color="#f1f8ff" />
        <Suspense fallback={null}>
          <StaticStageEnvironment />
        </Suspense>
        <StaticCosmosBackdrop cameraPosition={preset.cameraPosition} cameraTarget={preset.cameraTarget} />
        <ReactiveStageLayer floorY={preset.floorY} mode={stageVisualMode} />
        <AvatarActor avatarUrl={avatarUrl} level={level} phase={phase} preset={preset} />
        <ContactShadows
          position={[0, preset.floorY + 0.02, 0.05]}
          opacity={preset.shadowOpacity}
          scale={preset.shadowScale}
          blur={2.1}
          far={3.4}
        />
        <ScenePostFx />
      </Canvas>
    </div>
  );
});
