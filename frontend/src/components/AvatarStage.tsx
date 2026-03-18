import { ContactShadows, Environment, Float, Lightformer, Sparkles, Stars, useAnimations, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
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

function FallbackAvatar({ level, phase }: { level: number; phase: VisitorPhase }) {
  const headRef = useRef<THREE.Mesh>(null);
  const jawRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(elapsed * 0.28) * 0.09;
      headRef.current.rotation.x = Math.sin(elapsed * 0.18) * 0.03;
    }
    if (jawRef.current) {
      jawRef.current.scale.y = 0.7 + level * 0.4;
      jawRef.current.position.y = -1.15 - level * 0.08;
    }
  });

  return (
    <group position={[0, -1.7, 0.06]} scale={1.34}>
      <mesh ref={headRef} castShadow receiveShadow>
        <sphereGeometry args={[1.15, 48, 48]} />
        <meshStandardMaterial color={phase === "listening" ? "#f7efe3" : "#d8ecff"} metalness={0.18} roughness={0.28} />
      </mesh>
      <mesh ref={jawRef} position={[0, -1.15, 0.45]} castShadow>
        <boxGeometry args={[1.15, 0.36, 0.9]} />
        <meshStandardMaterial color="#0f1729" metalness={0.05} roughness={0.45} />
      </mesh>
      <mesh position={[0, -2.45, 0]} castShadow>
        <cylinderGeometry args={[1.35, 1.85, 2.1, 48]} />
        <meshStandardMaterial color="#1b3353" metalness={0.35} roughness={0.42} />
      </mesh>
    </group>
  );
}

function LoadedAvatar({ avatarUrl, level, preset }: { avatarUrl: string; level: number; preset: AvatarPreset }) {
  const root = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(avatarUrl);
  const fitted = useMemo(() => {
    const clone = scene.clone(true);
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
    preset.scaleMultiplier,
    scene,
  ]);
  const bindings = useMemo(() => inspectAvatar(fitted.clone, animations), [animations, fitted.clone]);
  const { actions } = useAnimations(animations, root);

  useEffect(() => {
    if (bindings.idleClipName) {
      actions[bindings.idleClipName]?.reset().fadeIn(0.3).play();
    }
  }, [actions, bindings.idleClipName]);

  useFrame(({ clock }) => {
    driveAvatar(bindings, level, clock.getElapsedTime());
  });

  return (
    <group
      ref={root}
      position={[fitted.position.x + preset.positionOffset[0], fitted.position.y, fitted.position.z]}
      rotation={[0, preset.modelYaw, 0]}
      scale={fitted.scale}
    >
      <primitive object={fitted.clone} />
    </group>
  );
}

function StageEnvironment({ accent }: { accent: string }) {
  return (
    <Environment
      files={stageEnvironmentFile}
      background={false}
      blur={0.86}
      backgroundBlurriness={0.42}
      environmentIntensity={0.28}
    >
      <Lightformer
        form="ring"
        color={accent}
        intensity={0.48}
        scale={2.2}
        position={[0, 1.1, -6.8]}
        target={[0, 0.72, 0]}
      />
      <Lightformer
        form="rect"
        color="#a9dfff"
        intensity={0.36}
        scale={[1.1, 4.8, 1]}
        position={[-3.8, 1.05, -6]}
        rotation={[0, Math.PI / 8, 0]}
      />
      <Lightformer
        form="rect"
        color="#a9dfff"
        intensity={0.36}
        scale={[1.1, 4.8, 1]}
        position={[3.8, 1.05, -6]}
        rotation={[0, -Math.PI / 8, 0]}
      />
      <Lightformer
        form="rect"
        color="#5da5ff"
        intensity={0.28}
        scale={[5.2, 1.3, 1]}
        position={[0, 3.2, -8.2]}
        rotation={[Math.PI / 2.9, 0, 0]}
      />
    </Environment>
  );
}

function SpaceStageBackdrop({ phase, floorY }: { phase: VisitorPhase; floorY: number }) {
  const accent = phase === "listening" || phase === "user_speaking" ? "#8dfff0" : "#74d9ff";
  const haloAccent = phase === "speaking" ? "#b7dcff" : "#91f0ff";

  return (
    <group>
      <mesh position={[0, 1.05, -10.6]}>
        <circleGeometry args={[8.1, 96]} />
        <meshBasicMaterial color="#020714" />
      </mesh>

      <Stars radius={58} depth={24} count={340} factor={2.3} saturation={0} fade speed={0.12} />
      <Sparkles count={6} scale={[4.8, 3, 4.4]} size={1.35} speed={0.05} color={accent} />

      <mesh position={[0, 2.2, -7.2]} rotation={[Math.PI / 2.95, 0, 0]}>
        <circleGeometry args={[2.6, 72]} />
        <meshBasicMaterial color="#9edfff" transparent opacity={0.055} depthWrite={false} />
      </mesh>

      <mesh position={[0, 0.94, -8.2]}>
        <circleGeometry args={[3.6, 96]} />
        <meshStandardMaterial color="#06111f" metalness={0.22} roughness={0.84} emissive="#081422" emissiveIntensity={0.22} />
      </mesh>

      <mesh position={[0, 0.96, -8.05]}>
        <ringGeometry args={[2.72, 3.02, 96]} />
        <meshStandardMaterial color="#17334f" metalness={0.62} roughness={0.34} emissive={accent} emissiveIntensity={0.2} />
      </mesh>

      <mesh position={[0, 0.98, -7.92]} rotation={[0, 0, Math.PI * 0.06]}>
        <ringGeometry args={[3.28, 3.4, 96, 1, Math.PI * 0.12, Math.PI * 0.76]} />
        <meshStandardMaterial color="#1a2940" metalness={0.64} roughness={0.36} emissive={haloAccent} emissiveIntensity={0.12} />
      </mesh>

      <mesh position={[-2.6, 0.3, -5.2]} rotation={[0, 0.04, 0]}>
        <boxGeometry args={[0.08, 2.8, 0.08]} />
        <meshStandardMaterial color="#94ebff" emissive="#94ebff" emissiveIntensity={0.55} toneMapped={false} />
      </mesh>

      <mesh position={[2.6, 0.3, -5.2]} rotation={[0, -0.04, 0]}>
        <boxGeometry args={[0.08, 2.8, 0.08]} />
        <meshStandardMaterial color="#94ebff" emissive="#94ebff" emissiveIntensity={0.55} toneMapped={false} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, -0.1]} receiveShadow>
        <circleGeometry args={[3.3, 96]} />
        <meshStandardMaterial color="#08111f" roughness={0.94} metalness={0.14} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY + 0.02, -0.04]} receiveShadow>
        <ringGeometry args={[0.96, 1.92, 96]} />
        <meshStandardMaterial
          color="#16314b"
          emissive={accent}
          emissiveIntensity={0.26}
          metalness={0.56}
          roughness={0.28}
          transparent
          opacity={0.76}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY + 0.04, 0.02]}>
        <circleGeometry args={[0.84, 72]} />
        <meshBasicMaterial color="#040b15" transparent opacity={0.98} />
      </mesh>
    </group>
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
  const accent = phase === "listening" || phase === "user_speaking" ? "#8dfff0" : "#6fd7ff";
  const preset = useMemo(() => resolveAvatarPreset(avatarUrl), [avatarUrl]);

  useEffect(() => {
    if (avatarUrl) {
      useGLTF.preload(avatarUrl);
    }
  }, [avatarUrl]);

  return (
    <div className="avatar-stage">
      <Canvas camera={{ position: preset.cameraPosition, fov: preset.cameraFov }} shadows dpr={[1, 2]}>
        <color attach="background" args={["#020713"]} />
        <fog attach="fog" args={["#020713", 6.2, 14.5]} />
        <CameraRig target={preset.cameraTarget} />
        <ambientLight intensity={0.48} />
        <hemisphereLight intensity={0.5} groundColor="#01050d" color="#9fdcff" />
        <directionalLight position={[0.1, 3.2, 4]} intensity={1.46} castShadow color="#eef8ff" />
        <spotLight position={[0, 5.2, 2.8]} intensity={22} angle={0.34} penumbra={0.96} color="#edf7ff" />
        <spotLight position={[-2.4, 2.6, 2.1]} intensity={5.6} angle={0.38} penumbra={0.94} color={accent} />
        <spotLight position={[2.2, 2.4, 1.9]} intensity={4.2} angle={0.42} penumbra={0.98} color="#8bb8ff" />
        <pointLight position={[0, 0.1, 1.15]} intensity={2.4} distance={5.4} color="#5ebeff" />
        <Suspense fallback={null}>
          <StageEnvironment accent={accent} />
        </Suspense>
        <SpaceStageBackdrop phase={phase} floorY={preset.floorY} />
        <Float speed={preset.floatSpeed} rotationIntensity={0.001} floatIntensity={preset.floatIntensity}>
          <Suspense fallback={<FallbackAvatar level={level} phase={phase} />}>
            {avatarUrl ? (
              <LoadedAvatar avatarUrl={avatarUrl} level={level} preset={preset} />
            ) : (
              <FallbackAvatar level={level} phase={phase} />
            )}
          </Suspense>
        </Float>
        <ContactShadows position={[0, preset.floorY + 0.01, 0.02]} opacity={0.5} scale={3.8} blur={2.1} far={3.5} />
      </Canvas>
    </div>
  );
}
