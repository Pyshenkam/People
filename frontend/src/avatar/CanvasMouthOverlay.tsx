import { createPortal, useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { VisitorPhase } from "../types/api";

interface PandaCanvasMouthOverlayProps {
  headBone?: THREE.Bone;
  level: number;
  phase: VisitorPhase;
}

interface MouthPose {
  active: boolean;
  open: number;
  round: number;
  smile: number;
}

const canvasWidth = 512;
const canvasHeight = 320;
// Tuned from a Blender probe around panda-V2.glb's muzzle center in Head local space.
const pandaMouthAnchor = {
  position: [0.0046, -0.064, -0.198] as const,
  rotation: [0, Math.PI, 0] as const,
  size: [0.14, 0.088] as const,
};

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function resolveMouthPose(level: number, phase: VisitorPhase, elapsed: number): MouthPose {
  const active = phase === "greeting" || phase === "speaking" || level > 0.028;
  if (!active) {
    return {
      active: false,
      open: 0,
      round: 0,
      smile: 0.62,
    };
  }

  const pulse = 0.5 + 0.5 * Math.sin(elapsed * (6.8 + level * 5.4));
  const open = clamp01(0.12 + level * 0.9 + pulse * (0.16 + level * 0.12));
  const round = clamp01((0.45 + level * 0.4) * (0.5 + 0.5 * Math.sin(elapsed * 5.1 + 0.7)));

  return {
    active: true,
    open,
    round,
    smile: 0.28,
  };
}

function drawPatch(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
): void {
  context.save();

  const glow = context.createRadialGradient(centerX, centerY - height * 0.06, width * 0.1, centerX, centerY, width * 0.72);
  glow.addColorStop(0, "rgba(251, 253, 255, 0.98)");
  glow.addColorStop(0.62, "rgba(246, 249, 252, 0.95)");
  glow.addColorStop(1, "rgba(246, 249, 252, 0)");

  context.fillStyle = glow;
  context.beginPath();
  context.ellipse(centerX, centerY, width * 0.5, height * 0.5, 0, 0, Math.PI * 2);
  context.fill();

  context.globalAlpha = 0.2;
  context.fillStyle = "#d6e1ef";
  context.beginPath();
  context.ellipse(centerX, centerY + height * 0.14, width * 0.3, height * 0.18, 0, 0, Math.PI * 2);
  context.fill();

  context.restore();
}

function drawPhiltrum(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  open: number,
): void {
  context.save();
  context.lineCap = "round";
  context.strokeStyle = "rgba(52, 58, 69, 0.92)";
  context.lineWidth = 8;
  context.beginPath();
  context.moveTo(centerX, centerY - 38);
  context.lineTo(centerX, centerY - 4 - open * 6);
  context.stroke();
  context.restore();
}

function drawClosedSmile(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  smile: number,
): void {
  const width = 126;
  const baseY = centerY + 8;
  const cornerLift = 18 + smile * 8;
  const centerDip = 12 - smile * 4;

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#333944";
  context.lineWidth = 10;
  context.beginPath();
  context.moveTo(centerX - width * 0.5, baseY - cornerLift * 0.12);
  context.quadraticCurveTo(centerX - width * 0.25, baseY + centerDip, centerX, baseY + centerDip * 0.7);
  context.quadraticCurveTo(centerX + width * 0.25, baseY + centerDip, centerX + width * 0.5, baseY - cornerLift * 0.12);
  context.stroke();

  context.strokeStyle = "rgba(80, 90, 108, 0.45)";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(centerX - width * 0.42, baseY + 3);
  context.quadraticCurveTo(centerX, baseY + centerDip + 6, centerX + width * 0.42, baseY + 3);
  context.stroke();
  context.restore();
}

function drawOpenSmile(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  open: number,
  round: number,
): void {
  const width = 48 + open * 42 - round * 8;
  const height = 16 + open * 44 + round * 8;
  const mouthY = centerY + 20;

  context.save();

  const mouthGradient = context.createLinearGradient(centerX, mouthY - height * 0.7, centerX, mouthY + height * 0.8);
  mouthGradient.addColorStop(0, "#5c2034");
  mouthGradient.addColorStop(0.46, "#28121d");
  mouthGradient.addColorStop(1, "#11141c");

  context.fillStyle = mouthGradient;
  context.beginPath();
  context.ellipse(centerX, mouthY, width * 0.5, height * 0.5, 0, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "#2d323d";
  context.lineWidth = 8;
  context.beginPath();
  context.ellipse(centerX, mouthY, width * 0.5, height * 0.5, 0, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = "rgba(255, 255, 255, 0.26)";
  context.lineWidth = 3;
  context.beginPath();
  context.ellipse(centerX, mouthY - height * 0.18, width * 0.28, height * 0.12, 0, Math.PI, 0);
  context.stroke();

  context.restore();
}

function redrawMouth(
  context: CanvasRenderingContext2D,
  texture: THREE.CanvasTexture,
  pose: MouthPose,
): void {
  context.clearRect(0, 0, canvasWidth, canvasHeight);

  const centerX = canvasWidth * 0.5;
  const centerY = canvasHeight * 0.56;
  const patchWidth = 210 + pose.open * 36;
  const patchHeight = 112 + pose.open * 18;

  drawPatch(context, centerX, centerY, patchWidth, patchHeight);
  drawPhiltrum(context, centerX, centerY, pose.open);

  if (!pose.active || pose.open < 0.16) {
    drawClosedSmile(context, centerX, centerY, pose.smile);
  } else {
    drawOpenSmile(context, centerX, centerY, pose.open, pose.round);
  }

  texture.needsUpdate = true;
}

export function PandaCanvasMouthOverlay({
  headBone,
  level,
  phase,
}: PandaCanvasMouthOverlayProps) {
  const mouthSurface = useMemo(() => {
    if (!headBone || typeof document === "undefined") {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    return { canvas, context, texture };
  }, [headBone]);

  useEffect(() => {
    return () => {
      mouthSurface?.texture.dispose();
    };
  }, [mouthSurface]);

  useFrame(({ clock }) => {
    if (!mouthSurface) {
      return;
    }
    const pose = resolveMouthPose(level, phase, clock.getElapsedTime());
    redrawMouth(mouthSurface.context, mouthSurface.texture, pose);
  });

  if (!headBone || !mouthSurface) {
    return null;
  }

  return createPortal(
    <mesh
      position={pandaMouthAnchor.position}
      rotation={pandaMouthAnchor.rotation}
      renderOrder={12}
      frustumCulled={false}
    >
      <planeGeometry args={pandaMouthAnchor.size} />
      <meshStandardMaterial
        map={mouthSurface.texture}
        transparent
        alphaTest={0.08}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        roughness={1}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>,
    headBone,
  );
}
