import { ContactShadows, Float, Sparkles, Stars, useAnimations, useGLTF } from "@react-three/drei";
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

function FallbackAvatar({ level, phase }: { level: number; phase: VisitorPhase }) {
  const headRef = useRef<THREE.Mesh>(null);
  const jawRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(elapsed * 0.4) * 0.18;
      headRef.current.rotation.x = Math.sin(elapsed * 0.2) * 0.06;
    }
    if (jawRef.current) {
      jawRef.current.scale.y = 0.7 + level * 0.4;
      jawRef.current.position.y = -1.15 - level * 0.08;
    }
  });

  return (
    <group position={[0, -2.4, 0]} scale={1.7}>
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
    clone.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(clone);
    if (box.isEmpty()) {
      return {
        clone,
        scale: 2.35 * preset.scaleMultiplier,
        position: new THREE.Vector3(...preset.positionOffset),
      };
    }
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const height = Number.isFinite(size.y) && size.y > 0.001 ? size.y : 2.6;
    const scale = (7.2 / height) * preset.scaleMultiplier;
    const floorY = -3.18;

    return {
      clone,
      scale,
      position: new THREE.Vector3(
        -center.x * scale,
        floorY - box.min.y * scale + preset.positionOffset[1],
        -center.z * scale + preset.positionOffset[2],
      ),
    };
  }, [preset.positionOffset, preset.scaleMultiplier, scene]);
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
      rotation={preset.rotation}
      scale={fitted.scale}
    >
      <primitive object={fitted.clone} />
    </group>
  );
}

function CockpitBackdrop({ phase }: { phase: VisitorPhase }) {
  const accent = phase === "listening" || phase === "user_speaking" ? "#8dfff0" : "#74d9ff";
  const alertAccent = phase === "speaking" ? "#8fd7ff" : "#5fe5ff";

  return (
    <group>
      <mesh position={[0, 1.1, -10.8]}>
        <circleGeometry args={[3.6, 96]} />
        <meshBasicMaterial color="#10213a" transparent opacity={0.78} />
      </mesh>

      <mesh position={[0, 1.08, -10.55]}>
        <ringGeometry args={[3.9, 4.8, 128]} />
        <meshStandardMaterial color="#29466f" metalness={0.32} roughness={0.42} emissive={accent} emissiveIntensity={0.42} />
      </mesh>

      <mesh position={[0, 1.15, -17.8]}>
        <circleGeometry args={[8.8, 128]} />
        <meshBasicMaterial color="#040b17" />
      </mesh>
      <Stars radius={120} depth={55} count={900} factor={3.2} saturation={0} fade speed={0.18} />
      <Sparkles count={18} scale={[9, 5.4, 7]} size={1.9} speed={0.1} color={accent} />

      <mesh position={[0, 1.15, -17.3]}>
        <ringGeometry args={[6.55, 8.25, 128]} />
        <meshStandardMaterial color="#1e314a" metalness={0.72} roughness={0.34} emissive="#0b1528" emissiveIntensity={0.9} />
      </mesh>

      <mesh position={[0, 1.15, -17.15]}>
        <ringGeometry args={[6.18, 6.5, 128]} />
        <meshStandardMaterial color="#35547d" metalness={0.48} roughness={0.25} emissive={accent} emissiveIntensity={0.42} />
      </mesh>

      <mesh position={[0, 1.15, -17.05]}>
        <ringGeometry args={[7.9, 8.9, 128, 1, Math.PI * 0.13, Math.PI * 0.74]} />
        <meshStandardMaterial color="#22314a" metalness={0.7} roughness={0.4} emissive={alertAccent} emissiveIntensity={0.24} />
      </mesh>

      <mesh position={[-6.55, 0.68, -6.1]} rotation={[0, 0.18, 0]}>
        <boxGeometry args={[3.1, 8.6, 0.45]} />
        <meshStandardMaterial color="#0b1628" metalness={0.56} roughness={0.42} emissive="#09101d" emissiveIntensity={0.6} />
      </mesh>

      <mesh position={[6.55, 0.68, -6.1]} rotation={[0, -0.18, 0]}>
        <boxGeometry args={[3.1, 8.6, 0.45]} />
        <meshStandardMaterial color="#0b1628" metalness={0.56} roughness={0.42} emissive="#09101d" emissiveIntensity={0.6} />
      </mesh>

      <mesh position={[-5.15, 0.52, -5.75]} rotation={[0, 0.18, 0]}>
        <boxGeometry args={[0.16, 6.7, 0.14]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.8} toneMapped={false} />
      </mesh>

      <mesh position={[5.15, 0.52, -5.75]} rotation={[0, -0.18, 0]}>
        <boxGeometry args={[0.16, 6.7, 0.14]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.8} toneMapped={false} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.16, -0.45]} receiveShadow>
        <circleGeometry args={[7.35, 96]} />
        <meshStandardMaterial color="#08111f" roughness={0.9} metalness={0.18} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.14, -0.2]} receiveShadow>
        <ringGeometry args={[1.95, 4.75, 128]} />
        <meshStandardMaterial
          color="#16243a"
          emissive={accent}
          emissiveIntensity={0.8}
          metalness={0.58}
          roughness={0.24}
          transparent
          opacity={0.88}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.12, -0.16]}>
        <circleGeometry args={[1.7, 96]} />
        <meshBasicMaterial color="#040d19" transparent opacity={0.96} />
      </mesh>

      <mesh position={[0, -2.22, -5.8]}>
        <torusGeometry args={[5.95, 0.12, 16, 128, Math.PI]} />
        <meshStandardMaterial color="#1a2d45" emissive="#18385d" emissiveIntensity={0.5} metalness={0.72} roughness={0.34} />
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
        <color attach="background" args={["#030814"]} />
        <fog attach="fog" args={["#030814", 8, 24]} />
        <CameraRig target={preset.cameraTarget} />
        <ambientLight intensity={1.1} />
        <hemisphereLight intensity={0.82} groundColor="#02060f" color="#8acfff" />
        <directionalLight position={[2.2, 5.6, 4.8]} intensity={2.15} castShadow color="#eef8ff" />
        <spotLight position={[-4.8, 5.6, 3.2]} intensity={38} angle={0.28} penumbra={0.9} color={accent} />
        <spotLight position={[4.6, 4.8, 1.6]} intensity={18} angle={0.42} penumbra={0.95} color="#8fb7ff" />
        <pointLight position={[0, 1.55, 4.2]} intensity={14} distance={12} color="#72d7ff" />
        <pointLight position={[0, -1.4, 2.2]} intensity={8} distance={8} color="#2f6dff" />
        <CockpitBackdrop phase={phase} />
        <Float speed={preset.floatSpeed} rotationIntensity={0.015} floatIntensity={preset.floatIntensity}>
          <Suspense fallback={<FallbackAvatar level={level} phase={phase} />}>
            {avatarUrl ? (
              <LoadedAvatar avatarUrl={avatarUrl} level={level} preset={preset} />
            ) : (
              <FallbackAvatar level={level} phase={phase} />
            )}
          </Suspense>
        </Float>
        <ContactShadows position={[0, -3.15, 0]} opacity={0.52} scale={8.4} blur={2.6} far={5.2} />
      </Canvas>
    </div>
  );
}
