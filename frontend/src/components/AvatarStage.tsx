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
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { driveAvatar, inspectAvatar } from "../avatar/adapter";
import { resolveAvatarPreset, type AvatarPreset } from "../avatar/presets";
import type { VisitorPhase } from "../types/api";

interface AvatarStageProps {
  avatarUrl?: string | null;
  level: number;
  phase: VisitorPhase;
}

const stageEnvironmentFile = "/environments/rogland_clear_night_1k.hdr";

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
  const phaseRef = useRef({ phase, startedAt: 0 });

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (phaseRef.current.phase !== phase) {
      phaseRef.current = { phase, startedAt: elapsed };
    }
    const phaseElapsed = elapsed - phaseRef.current.startedAt;
    const breathe = Math.sin(elapsed * 1.6);
    const greetingWeight = phase === "greeting" ? phasePulse(1.15, phaseElapsed) : 0;
    const speakingWeight = phase === "speaking" ? 1 : 0;
    const listeningWeight = phase === "listening" || phase === "user_speaking" ? 1 : 0;
    const thinkingWeight = phase === "thinking" ? 1 : 0;
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
  const phaseRef = useRef({ phase, startedAt: 0 });
  const { scene, animations } = useGLTF(avatarUrl);
  const fitted = useMemo(() => {
    const clone = scene.clone(true);
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
      actions[bindings.idleClipName]?.reset().fadeIn(0.3).play();
    }
  }, [actions, bindings.idleClipName]);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (phaseRef.current.phase !== phase) {
      phaseRef.current = { phase, startedAt: elapsed };
    }
    const rigOffset = driveAvatar(bindings, {
      level,
      elapsed,
      phase,
      phaseElapsed: elapsed - phaseRef.current.startedAt,
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

function StageEnvironment({ accent, warmAccent }: { accent: string; warmAccent: string }) {
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
        color={accent}
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
        color={warmAccent}
        intensity={0.34}
        scale={[2.4, 0.5, 1]}
        position={[0, 2.9, -3.6]}
        rotation={[Math.PI / 3.2, 0, 0]}
      />
    </Environment>
  );
}

function ObservationConsole({ side, accent, floorY }: { side: -1 | 1; accent: string; floorY: number }) {
  return (
    <group position={[side * 3.7, floorY + 0.9, -1.4]} rotation={[0, -side * 0.4, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.82, 2.05, 1.06]} />
        <meshStandardMaterial color="#0b1323" metalness={0.52} roughness={0.42} emissive="#091220" emissiveIntensity={0.28} />
      </mesh>
      <mesh position={[0, 0.1, 0.54]}>
        <planeGeometry args={[0.52, 1.36]} />
        <meshBasicMaterial color="#07101e" />
      </mesh>
      <mesh position={[0, 0.18, 0.55]}>
        <planeGeometry args={[0.12, 1.2]} />
        <meshBasicMaterial color={accent} transparent opacity={0.65} />
      </mesh>
      <mesh position={[0, -0.78, 0.56]}>
        <planeGeometry args={[0.4, 0.12]} />
        <meshBasicMaterial color="#ffd39f" transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

function ObservationWindowBackdrop({ phase, floorY }: { phase: VisitorPhase; floorY: number }) {
  const accent = phase === "listening" || phase === "user_speaking" ? "#99fff1" : "#7ad7ff";
  const glassAccent = phase === "speaking" ? "#ffd3a2" : "#7ecfff";
  const windowCenterY = floorY + 1.16;

  return (
    <group>
      <mesh position={[0, windowCenterY + 0.08, -11.8]}>
        <planeGeometry args={[18, 9]} />
        <meshBasicMaterial color="#02050d" />
      </mesh>

      <Stars radius={46} depth={18} count={520} factor={2.2} saturation={0} fade speed={0.18} />
      <Sparkles count={16} scale={[7.4, 2.8, 5.4]} size={1.55} speed={0.12} color={accent} />

      <Cloud
        position={[0, windowCenterY + 0.22, -10.2]}
        scale={[3.8, 1.2, 1]}
        bounds={[5.4, 0.85, 2]}
        segments={24}
        opacity={0.2}
        speed={0.08}
        color="#203759"
      />
      <Cloud
        position={[1.8, windowCenterY - 0.06, -9.4]}
        scale={[2.5, 0.9, 1]}
        bounds={[3.2, 0.7, 2]}
        segments={22}
        opacity={0.26}
        speed={0.05}
        color="#345a89"
      />
      <Cloud
        position={[-2.1, windowCenterY + 0.24, -9.1]}
        scale={[2.8, 1.1, 1]}
        bounds={[3.4, 0.8, 2]}
        segments={20}
        opacity={0.18}
        speed={0.04}
        color="#162846"
      />

      <mesh position={[0, windowCenterY, -6.7]}>
        <planeGeometry args={[6.05, 3.05]} />
        <meshPhysicalMaterial color="#3ba9d6" roughness={0.08} metalness={0.1} transparent opacity={0.08} />
      </mesh>

      <mesh position={[0, windowCenterY + 1.62, -5.95]} castShadow>
        <boxGeometry args={[7.24, 0.3, 0.52]} />
        <meshStandardMaterial color="#09111f" metalness={0.74} roughness={0.24} emissive="#13233a" emissiveIntensity={0.42} />
      </mesh>
      <mesh position={[0, floorY + 0.08, -5.5]} castShadow>
        <boxGeometry args={[7.6, 0.42, 0.9]} />
        <meshStandardMaterial color="#0a1321" metalness={0.72} roughness={0.22} emissive="#0c1c31" emissiveIntensity={0.34} />
      </mesh>
      <mesh position={[-3.48, windowCenterY, -5.8]} castShadow>
        <boxGeometry args={[0.34, 3.48, 0.48]} />
        <meshStandardMaterial color="#0b1322" metalness={0.68} roughness={0.28} emissive="#102034" emissiveIntensity={0.42} />
      </mesh>
      <mesh position={[3.48, windowCenterY, -5.8]} castShadow>
        <boxGeometry args={[0.34, 3.48, 0.48]} />
        <meshStandardMaterial color="#0b1322" metalness={0.68} roughness={0.28} emissive="#102034" emissiveIntensity={0.42} />
      </mesh>

      <mesh position={[-3.08, windowCenterY + 0.02, -5.48]}>
        <boxGeometry args={[0.08, 2.74, 0.06]} />
        <meshBasicMaterial color={accent} transparent opacity={0.72} />
      </mesh>
      <mesh position={[3.08, windowCenterY + 0.02, -5.48]}>
        <boxGeometry args={[0.08, 2.74, 0.06]} />
        <meshBasicMaterial color={accent} transparent opacity={0.72} />
      </mesh>
      <mesh position={[0, windowCenterY + 1.32, -5.44]}>
        <boxGeometry args={[5.72, 0.08, 0.04]} />
        <meshBasicMaterial color={glassAccent} transparent opacity={0.54} />
      </mesh>
      <mesh position={[0, floorY + 0.33, -5.42]}>
        <boxGeometry args={[5.66, 0.06, 0.04]} />
        <meshBasicMaterial color={accent} transparent opacity={0.38} />
      </mesh>

      <ObservationConsole side={-1} accent={accent} floorY={floorY} />
      <ObservationConsole side={1} accent={accent} floorY={floorY} />

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
        <meshBasicMaterial color={accent} transparent opacity={0.45} />
      </mesh>
    </group>
  );
}

function ScenePostFx() {
  return (
    <EffectComposer>
      <Bloom mipmapBlur intensity={0.72} luminanceThreshold={0.12} luminanceSmoothing={0.42} />
      <Noise opacity={0.028} />
      <Vignette eskil={false} offset={0.16} darkness={0.88} />
    </EffectComposer>
  );
}

function CameraRig({ target }: { target: [number, number, number] }) {
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
}

export function AvatarStage({ avatarUrl, level, phase }: AvatarStageProps) {
  const accent = phase === "listening" || phase === "user_speaking" ? "#8effef" : "#6fd7ff";
  const warmAccent = phase === "speaking" ? "#ffc18a" : "#9bd2ff";
  const preset = useMemo(() => resolveAvatarPreset(avatarUrl), [avatarUrl]);

  useEffect(() => {
    if (avatarUrl) {
      useGLTF.preload(avatarUrl);
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
        <color attach="background" args={["#030813"]} />
        <fog attach="fog" args={["#030813", 7.5, 15.2]} />
        <CameraRig target={preset.cameraTarget} />
        <ambientLight intensity={0.42} />
        <hemisphereLight intensity={0.56} groundColor="#010409" color="#b4e3ff" />
        <directionalLight position={[0.3, 3.8, 3.5]} intensity={1.6} castShadow color="#eef6ff" />
        <spotLight position={[0, 4.8, 2.2]} intensity={24} angle={0.36} penumbra={0.92} color="#f1f8ff" />
        <spotLight position={[-2.8, 2.8, 1.9]} intensity={6.4} angle={0.42} penumbra={0.95} color={accent} />
        <spotLight position={[2.8, 2.4, 1.5]} intensity={4.8} angle={0.44} penumbra={0.98} color={warmAccent} />
        <pointLight position={[0, 0.55, 1.3]} intensity={2.8} distance={6.2} color="#6cc4ff" />
        <Suspense fallback={null}>
          <StageEnvironment accent={accent} warmAccent={warmAccent} />
        </Suspense>
        <ObservationWindowBackdrop phase={phase} floorY={preset.floorY} />
        <Suspense fallback={<FallbackAvatar level={level} phase={phase} />}>
          {avatarUrl ? (
            <LoadedAvatar avatarUrl={avatarUrl} level={level} phase={phase} preset={preset} />
          ) : (
            <FallbackAvatar level={level} phase={phase} />
          )}
        </Suspense>
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
}
