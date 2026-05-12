import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════
// ─── Constants ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

const COIN_SHARDS = 8;
const COIN_RADIUS = 2;
const COIN_DEPTH = 0.18;
const SCATTER_DISTANCE = 14;

// --- Solana S-bar layout ---
const SOL_BAR_W = 2.0;
const SOL_BAR_H = 0.36;
const SOL_BAR_SKEW = 0.38;
const SOL_CHUNKS_PER_BAR = 4;
const SOL_BAR_CONFIGS = [
  { x: 0.20, y: 0.64, rotZ: 0.06 },
  { x: 0, y: 0, rotZ: 0 },
  { x: -0.20, y: -0.64, rotZ: -0.06 },
];

// --- Colosseum logo layout ---
// 12 chunks: bar1 (3 wide) + bar2 (3 shorter) + 3 pillars (2 each)
// Bar1 spans ±1.005, bar2 spans ±0.84 — increasing gap between them
const COL_CHUNKS: { x: number; y: number; w: number; h: number; type: 'beam' | 'pillar' }[] = [
  // Top bar 1 — 3 wide horizontal segments (idx 0-2)
  { x: -0.67, y: 0.70, w: 0.67, h: 0.17, type: 'beam' },
  { x: 0, y: 0.70, w: 0.67, h: 0.17, type: 'beam' },
  { x: 0.67, y: 0.70, w: 0.67, h: 0.17, type: 'beam' },
  // Top bar 2 — 3 shorter horizontal segments (idx 3-5)
  { x: -0.56, y: 0.35, w: 0.56, h: 0.17, type: 'beam' },
  { x: 0, y: 0.35, w: 0.56, h: 0.17, type: 'beam' },
  { x: 0.56, y: 0.35, w: 0.56, h: 0.17, type: 'beam' },
  // Left pillar — 2 vertical chunks (idx 6-7)
  { x: -0.67, y: -0.165, w: 0.40, h: 0.50, type: 'pillar' },
  { x: -0.67, y: -0.665, w: 0.40, h: 0.50, type: 'pillar' },
  // Center pillar — 2 vertical chunks (idx 8-9)
  { x: 0, y: -0.165, w: 0.40, h: 0.50, type: 'pillar' },
  { x: 0, y: -0.665, w: 0.40, h: 0.50, type: 'pillar' },
  // Right pillar — 2 vertical chunks (idx 10-11)
  { x: 0.67, y: -0.165, w: 0.40, h: 0.50, type: 'pillar' },
  { x: 0.67, y: -0.665, w: 0.40, h: 0.50, type: 'pillar' },
];

// --- Animation timing ---
const CYCLE_DURATION = 22;
const PORTAL_DURATION = 3;
const SCROLL_DECAY = 0.96;
const ZOOM_FACTOR = 0.002;
const ZOOM_MIN = 0.01;
const ZOOM_MAX = 2.0;

// ═══════════════════════════════════════════════════════════
// ─── Types ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

interface LogoCoin3DProps {
  isDark: boolean;
  dragVelocity: React.RefObject<{ x: number; y: number }>;
  isDragging: React.RefObject<boolean>;
  scrollDelta: React.RefObject<number>;
}

type LogoId = 'solana' | 'colosseum';
type TransitionPhase = 'idle' | 'portal_out' | 'portal_in';

interface ScatterDatum {
  homePos: THREE.Vector3;
  homeRot: THREE.Euler;
  crackPos: THREE.Vector3;  // homePos + 4%  toward scatterPos — shows hairline seams
  breakPos: THREE.Vector3;  // homePos + 22% toward scatterPos — clearly separated
  scatterPos: THREE.Vector3;
  scatterRot: THREE.Euler;
}

// ═══════════════════════════════════════════════════════════
// ─── Helper Functions ───────────────────────────────────────
// ═══════════════════════════════════════════════════════════

/** Deterministic pseudo-random [0,1) from integer seed */
function prand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Bar scatter curve: slow separation → fast scatter → reassemble → snap to 0
 */
function barScatterCurve(t: number): number {
  if (t < 0.20) { const p = t / 0.20; return p * p * 0.12; }
  if (t < 0.30) { const p = (t - 0.20) / 0.10; return 0.12 + p * p * 0.88; }
  if (t < 0.38) return 1.0;
  const p = Math.min((t - 0.38) / 0.50, 1.0);
  const v = (1 - p) ** 4;
  return v < 0.001 ? 0 : v;
}

/**
 * Single master progress value (0→1) for Phase 2 coin + bar animation.
 * Encodes the full path without gaps or reversals:
 *
 *   masterP 0.00       → resting (solid coin, no shards)
 *   masterP 0.00–0.10  → shards at homePos (crack seams visible, no movement)
 *   masterP 0.10–0.25  → homePos → crackPos (pieces break apart)
 *   masterP 0.25–1.00  → crackPos → scatterPos (scatter out)
 *   masterP 1.00–0.25  → scatterPos → crackPos (reassembly arc, tracing path back)
 *   masterP 0.25–0.10  → crackPos → homePos (cracks close)
 *   masterP 0.00       → solid coin reappears
 *
 * Timing in the 7s Phase 2 window (t=0→1):
 *   Crack trigger:  0–0.42s    Break apart: 0.98–1.75s
 *   Break hold:     1.75–2.24s  Scatter:    2.24–3.08s
 *   Scatter hold:   3.08–3.50s  Reassembly: 3.50–7.00s
 */
function coinMasterCurve(t: number): number {
  if (t < 0.06) return (t / 0.06) * 0.10;          // crack trigger: 0→0.10
  if (t < 0.14) return 0.10;                        // hold: crack seams visible
  if (t < 0.25) {                                     // break apart: 0.10→0.25
    const p = (t - 0.14) / 0.11;
    return 0.10 + p * p * 0.15;
  }
  if (t < 0.32) return 0.25;                        // hold: break apart visible
  if (t < 0.44) {                                     // scatter: 0.25→1.00
    const p = (t - 0.32) / 0.12;
    return 0.25 + p * p * 0.75;
  }
  if (t < 0.50) return 1.0;                         // hold: full scatter (logo swap here)
  const p = Math.min((t - 0.50) / 0.50, 1.0);       // reassembly: 1.00→0
  const v = (1 - p) ** 3;
  return v < 0.001 ? 0 : v;
}

/** Create a left→right gradient canvas texture */
function createGradientTexture(c1: string, c2: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 4;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, c1); grad.addColorStop(0.5, c2); grad.addColorStop(1, c1);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** Create a rectangular ExtrudeGeometry (used for Colosseum chunks) */
function createRectExtrude(w: number, h: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, h / 2);
  shape.lineTo(w / 2, h / 2);
  shape.lineTo(w / 2, -h / 2);
  shape.lineTo(-w / 2, -h / 2);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 3,
  });
}

/**
 * Generate irregular coin shard geometries with jagged crack edges.
 * Break paths wobble randomly to simulate natural fracture lines.
 */
function generateCoinShards(numShards: number, radius: number) {
  const breakPaths: THREE.Vector2[][] = [];

  for (let i = 0; i < numShards; i++) {
    const baseAngle = (i / numShards) * Math.PI * 2;
    const path: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
    const steps = 7;
    for (let s = 1; s <= steps; s++) {
      const r = (s / steps) * radius;
      const wobble = (prand(i * 137 + s * 31) - 0.5) * 0.22 * (s / steps);
      const angle = baseAngle + wobble;
      path.push(new THREE.Vector2(Math.cos(angle) * r, Math.sin(angle) * r));
    }
    breakPaths.push(path);
  }

  const geos: THREE.ExtrudeGeometry[] = [];
  const centroids: THREE.Vector2[] = [];

  for (let i = 0; i < numShards; i++) {
    const nextI = (i + 1) % numShards;
    const pathA = breakPaths[i];
    const pathB = breakPaths[nextI];

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (let j = 1; j < pathA.length; j++) shape.lineTo(pathA[j].x, pathA[j].y);

    const endA = pathA[pathA.length - 1];
    const endB = pathB[pathB.length - 1];
    let angA = Math.atan2(endA.y, endA.x);
    let angB = Math.atan2(endB.y, endB.x);
    if (angB <= angA) angB += Math.PI * 2;

    const arcSteps = 5;
    for (let a = 1; a <= arcSteps; a++) {
      const ang = angA + (a / arcSteps) * (angB - angA);
      shape.lineTo(Math.cos(ang) * radius, Math.sin(ang) * radius);
    }

    for (let j = pathB.length - 2; j >= 1; j--) shape.lineTo(pathB[j].x, pathB[j].y);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: COIN_DEPTH, bevelEnabled: false });
    geo.translate(0, 0, -COIN_DEPTH / 2);
    geos.push(geo);

    const midAngle = (angA + angB) / 2;
    centroids.push(new THREE.Vector2(Math.cos(midAngle) * radius * 0.55, Math.sin(midAngle) * radius * 0.55));
  }

  return { geos, centroids };
}

/** Generate scatter data for coin shards */
function generateCoinScatterData(centroids: THREE.Vector2[]): ScatterDatum[] {
  return centroids.map((centroid, i) => {
    const angle = Math.atan2(centroid.y, centroid.x);
    const dist = SCATTER_DISTANCE * (0.6 + prand(i * 51) * 0.8);
    const zComp = (prand(i * 33) - 0.5) * dist * 0.3;
    return {
      homePos: new THREE.Vector3(0, 0, 0),
      homeRot: new THREE.Euler(0, 0, 0),
      crackPos: new THREE.Vector3(Math.cos(angle) * dist * 0.04, Math.sin(angle) * dist * 0.04, zComp * 0.04),
      breakPos: new THREE.Vector3(Math.cos(angle) * dist * 0.22, Math.sin(angle) * dist * 0.22, zComp * 0.22),
      scatterPos: new THREE.Vector3(Math.cos(angle) * dist, Math.sin(angle) * dist, zComp),
      scatterRot: new THREE.Euler(
        (prand(i * 13) - 0.5) * Math.PI * 4,
        (prand(i * 17) - 0.5) * Math.PI * 4,
        (prand(i * 23) - 0.5) * Math.PI * 4
      ),
    };
  });
}

/** Generate scatter data for Solana bar chunks (12 front + 12 back) */
function generateSolanaScatter(): ScatterDatum[] {
  const chunkW = SOL_BAR_W / SOL_CHUNKS_PER_BAR;
  const data: ScatterDatum[] = [];

  for (let face = 0; face < 2; face++) {
    const isFront = face === 0;
    const zHome = isFront ? 0.11 : -0.12;

    for (let bar = 0; bar < 3; bar++) {
      const cfg = SOL_BAR_CONFIGS[bar];
      const cosR = Math.cos(cfg.rotZ);
      const sinR = Math.sin(cfg.rotZ);

      for (let chunk = 0; chunk < SOL_CHUNKS_PER_BAR; chunk++) {
        const localX = -SOL_BAR_W / 2 + chunk * chunkW + chunkW / 2;
        const gx = cfg.x + localX * cosR;
        const gy = cfg.y + localX * sinR;

        const seed = face * 1000 + bar * 100 + chunk * 10;
        const ang = (prand(seed + 7) - 0.5) * Math.PI * 2;
        const dist = SCATTER_DISTANCE * (0.7 + prand(seed + 11) * 0.6);

        const homePos = new THREE.Vector3(gx, gy, zHome);
        const scatterPos = new THREE.Vector3(
          Math.cos(ang) * dist,
          Math.sin(ang) * dist,
          (isFront ? 1 : -1) * (2 + prand(seed + 3) * dist * 0.3)
        );

        data.push({
          homePos,
          homeRot: new THREE.Euler(0, isFront ? 0 : Math.PI, cfg.rotZ),
          crackPos: homePos.clone().lerp(scatterPos, 0.04),
          breakPos: homePos.clone().lerp(scatterPos, 0.22),
          scatterPos,
          scatterRot: new THREE.Euler(
            (prand(seed + 13) - 0.5) * Math.PI * 5,
            (prand(seed + 17) - 0.5) * Math.PI * 5,
            (prand(seed + 23) - 0.5) * Math.PI * 5
          ),
        });
      }
    }
  }
  return data;
}

/** Generate scatter data for Colosseum chunks (12 front + 12 back) */
function generateColosseumScatter(): ScatterDatum[] {
  const data: ScatterDatum[] = [];

  for (let face = 0; face < 2; face++) {
    const isFront = face === 0;
    const zHome = isFront ? 0.11 : -0.12;

    for (let i = 0; i < 12; i++) {
      const chunk = COL_CHUNKS[i];
      const seed = face * 2000 + i * 100;
      const ang = (prand(seed + 7) - 0.5) * Math.PI * 2;
      const dist = SCATTER_DISTANCE * (0.7 + prand(seed + 11) * 0.6);

      const homePos = new THREE.Vector3(chunk.x, chunk.y, zHome);
      const scatterPos = new THREE.Vector3(
        Math.cos(ang) * dist,
        Math.sin(ang) * dist,
        (isFront ? 1 : -1) * (2 + prand(seed + 3) * dist * 0.3)
      );

      data.push({
        homePos,
        homeRot: new THREE.Euler(0, isFront ? 0 : Math.PI, 0),
        crackPos: homePos.clone().lerp(scatterPos, 0.04),
        breakPos: homePos.clone().lerp(scatterPos, 0.22),
        scatterPos,
        scatterRot: new THREE.Euler(
          (prand(seed + 13) - 0.5) * Math.PI * 5,
          (prand(seed + 17) - 0.5) * Math.PI * 5,
          (prand(seed + 23) - 0.5) * Math.PI * 5
        ),
      });
    }
  }
  return data;
}

// ═══════════════════════════════════════════════════════════
// ─── Component ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

export default function LogoCoin3D({ isDark, dragVelocity, isDragging, scrollDelta }: LogoCoin3DProps) {
  // ── Mesh refs ──
  const groupRef = useRef<THREE.Group>(null!);
  const solidCoinRef = useRef<THREE.Mesh>(null!);
  const coinShardRefs = useRef<THREE.Mesh[]>([]);
  const solanaFrontRefs = useRef<THREE.Mesh[]>([]);
  const solanaBackRefs = useRef<THREE.Mesh[]>([]);
  const solanaFrontSolidRefs = useRef<THREE.Mesh[]>([]);
  const solanaBackSolidRefs = useRef<THREE.Mesh[]>([]);
  const colosseumFrontRefs = useRef<THREE.Mesh[]>([]);
  const colosseumBackRefs = useRef<THREE.Mesh[]>([]);
  const portalRingRef = useRef<THREE.Mesh>(null!);

  // ── Animation state refs ──
  const currentVel = useRef({ x: 0.0004, y: 0.0012 });
  const distortionTime = useRef(0);
  const activeLogo = useRef<LogoId>('solana');
  const transitionPhase = useRef<TransitionPhase>('idle');
  const transitionTime = useRef(0);
  const scrollAccum = useRef(0);
  const zoomFactor = useRef(1);
  const autoSwitchDone = useRef(false);
  const atBoundary = useRef(false); // true once zoom is clamped at a limit

  const IDLE_VEL = { x: 0.0004, y: 0.0012 };
  const DAMPING = 0.95;
  const LERP_BACK = 0.015;

  // ═══ Geometries ═══

  // Solid coin disc (seamless when intact)
  const solidCoinGeo = useMemo(
    () => new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_DEPTH, 64),
    []
  );

  // Coin shards (visible only during crack animation)
  const { geos: coinGeos, centroids: coinCentroids } = useMemo(
    () => generateCoinShards(COIN_SHARDS, COIN_RADIUS), []
  );

  const coinScatterData = useMemo(
    () => generateCoinScatterData(coinCentroids), [coinCentroids]
  );

  // Solana solid bar geometry (full-width, visible when intact / barProgress === 0)
  const solBarSolidGeo = useMemo(() => {
    const hw = SOL_BAR_W / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-hw + SOL_BAR_SKEW, SOL_BAR_H / 2);
    shape.lineTo(hw + SOL_BAR_SKEW, SOL_BAR_H / 2);
    shape.lineTo(hw - SOL_BAR_SKEW, -SOL_BAR_H / 2);
    shape.lineTo(-hw - SOL_BAR_SKEW, -SOL_BAR_H / 2);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 3,
    });
  }, []);

  // Solana bar chunk geometry (shared for all 12 chunks per face)
  const solBarChunkGeo = useMemo(() => {
    const cw = SOL_BAR_W / SOL_CHUNKS_PER_BAR;
    const shape = new THREE.Shape();
    shape.moveTo(-cw / 2 + SOL_BAR_SKEW, SOL_BAR_H / 2);
    shape.lineTo(cw / 2 + SOL_BAR_SKEW, SOL_BAR_H / 2);
    shape.lineTo(cw / 2 - SOL_BAR_SKEW, -SOL_BAR_H / 2);
    shape.lineTo(-cw / 2 - SOL_BAR_SKEW, -SOL_BAR_H / 2);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 3,
    });
  }, []);

  const solanaScatter = useMemo(() => generateSolanaScatter(), []);

  // Colosseum geometries (bar1 wide, bar2 shorter, pillar)
  const colBeamGeo = useMemo(() => createRectExtrude(0.67, 0.17), []);
  const colBar2Geo = useMemo(() => createRectExtrude(0.56, 0.17), []);
  const colPillarGeo = useMemo(() => createRectExtrude(0.40, 0.50), []);

  const colosseumScatter = useMemo(() => generateColosseumScatter(), []);

  // Portal ring geometry
  const portalGeo = useMemo(
    () => new THREE.TorusGeometry(COIN_RADIUS * 1.2, 0.1, 16, 64),
    []
  );

  // ═══ Materials ═══

  const coinMat = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#1a1a2e'),
      metalness: 0.88,
      roughness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      reflectivity: 0.95,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    mat.iridescence = 0.4;
    mat.iridescenceIOR = 1.3;
    mat.iridescenceThicknessRange = [100, 400];
    return mat;
  }, []);

  const solBarMats = useMemo(() => {
    const gradients = [
      createGradientTexture('#14F195', '#9945FF'),
      createGradientTexture('#00C2FF', '#14F195'),
      createGradientTexture('#9945FF', '#FF6B9D'),
    ];
    return gradients.map(tex => {
      const mat = new THREE.MeshPhysicalMaterial({
        map: tex,
        color: new THREE.Color('#ffffff'),
        metalness: 0.72,
        roughness: 0.12,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        emissive: new THREE.Color('#4a1d96'),
        emissiveIntensity: 0.3,
        side: THREE.DoubleSide,
      });
      mat.iridescence = 0.25;
      mat.iridescenceIOR = 1.4;
      mat.iridescenceThicknessRange = [100, 300];
      return mat;
    });
  }, []);

  const colMats = useMemo(() => {
    return [0, 1].map(() => {
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#ffffff'),
        metalness: 0.45,
        roughness: 0.15,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0.08,
        side: THREE.DoubleSide,
      });
      return mat;
    });
  }, []);

  const portalMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color('#9945FF'),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), []);

  // ═══ Helper: get Colosseum geometry by chunk index ═══
  const getColGeo = (idx: number) => {
    if (idx < 3) return colBeamGeo;  // bar1 wide chunks (0-2)
    if (idx < 6) return colBar2Geo;  // bar2 shorter chunks (3-5)
    return colPillarGeo;              // pillar chunks (6-11)
  };

  /** Map Colosseum chunk index → material index */
  const getColMatIdx = (idx: number): number => {
    if (idx < 6) return 0;  // beam/bar
    return 1;               // pillar
  };

  // ═══ Apply 3-phase scatter to a set of 12-chunk logo refs ═══
  // Priority: scatterP > breakP > crackP. Rotation only applied during scatter (pulse 3).
  function applyChunkScatter3(
    frontRefs: THREE.Mesh[],
    backRefs: THREE.Mesh[],
    scatter: ScatterDatum[],
    breakP: number,
    scatterP: number,
    visible: boolean,
  ) {
    for (let idx = 0; idx < 12; idx++) {
      const front = frontRefs[idx];
      if (front) {
        front.visible = visible;
        if (visible) {
          const fd = scatter[idx];
          if (scatterP > 0) {
            front.position.lerpVectors(fd.homePos, fd.scatterPos, scatterP);
            front.rotation.x = THREE.MathUtils.lerp(fd.homeRot.x, fd.scatterRot.x, scatterP);
            front.rotation.y = THREE.MathUtils.lerp(fd.homeRot.y, fd.scatterRot.y, scatterP);
            front.rotation.z = THREE.MathUtils.lerp(fd.homeRot.z, fd.scatterRot.z, scatterP);
          } else if (breakP > 0) {
            // Pulse 2: small separation (uses crackPos ~4% of full scatter)
            front.position.lerpVectors(fd.homePos, fd.crackPos, breakP);
            front.rotation.x = fd.homeRot.x;
            front.rotation.y = fd.homeRot.y;
            front.rotation.z = fd.homeRot.z;
          } else {
            // Pulse 1: pieces stay at homePos — seam/fracture lines visible, no movement
            front.position.copy(fd.homePos);
            front.rotation.x = fd.homeRot.x;
            front.rotation.y = fd.homeRot.y;
            front.rotation.z = fd.homeRot.z;
          }
        }
      }
      const back = backRefs[idx];
      if (back) {
        back.visible = visible;
        if (visible) {
          const bd = scatter[idx + 12];
          if (scatterP > 0) {
            back.position.lerpVectors(bd.homePos, bd.scatterPos, scatterP);
            back.rotation.x = THREE.MathUtils.lerp(bd.homeRot.x, bd.scatterRot.x, scatterP);
            back.rotation.y = THREE.MathUtils.lerp(bd.homeRot.y, bd.scatterRot.y, scatterP);
            back.rotation.z = THREE.MathUtils.lerp(bd.homeRot.z, bd.scatterRot.z, scatterP);
          } else if (breakP > 0) {
            back.position.lerpVectors(bd.homePos, bd.crackPos, breakP);
            back.rotation.x = bd.homeRot.x;
            back.rotation.y = bd.homeRot.y;
            back.rotation.z = bd.homeRot.z;
          } else {
            back.position.copy(bd.homePos);
            back.rotation.x = bd.homeRot.x;
            back.rotation.y = bd.homeRot.y;
            back.rotation.z = bd.homeRot.z;
          }
        }
      }
    }
  }

  // ═══ Apply master-curve scatter to a 12-chunk logo (Phase 2 + portal) ═══
  // masterP in [0,1] drives the full homePos→crackPos→scatterPos path continuously.
  function applyChunkScatterMaster(
    frontRefs: THREE.Mesh[],
    backRefs: THREE.Mesh[],
    scatter: ScatterDatum[],
    masterP: number,
    visible: boolean,
  ) {
    // Pre-compute position fractions once for all chunks
    const breakFrac = masterP < 0.10 ? 0 : masterP < 0.25 ? (masterP - 0.10) / 0.15 : 1.0;
    const scatterFrac = masterP < 0.25 ? 0 : Math.min((masterP - 0.25) / 0.75, 1.0);
    const rotFrac = scatterFrac;  // pieces only spin during scatter phase

    for (let idx = 0; idx < 12; idx++) {
      const front = frontRefs[idx];
      if (front) {
        front.visible = visible;
        if (visible) {
          const fd = scatter[idx];
          if (scatterFrac > 0) {
            front.position.lerpVectors(fd.crackPos, fd.scatterPos, scatterFrac);
          } else if (breakFrac > 0) {
            front.position.lerpVectors(fd.homePos, fd.crackPos, breakFrac);
          } else {
            front.position.copy(fd.homePos);
          }
          front.rotation.x = THREE.MathUtils.lerp(fd.homeRot.x, fd.scatterRot.x, rotFrac);
          front.rotation.y = THREE.MathUtils.lerp(fd.homeRot.y, fd.scatterRot.y, rotFrac);
          front.rotation.z = THREE.MathUtils.lerp(fd.homeRot.z, fd.scatterRot.z, rotFrac);
        }
      }
      const back = backRefs[idx];
      if (back) {
        back.visible = visible;
        if (visible) {
          const bd = scatter[idx + 12];
          if (scatterFrac > 0) {
            back.position.lerpVectors(bd.crackPos, bd.scatterPos, scatterFrac);
          } else if (breakFrac > 0) {
            back.position.lerpVectors(bd.homePos, bd.crackPos, breakFrac);
          } else {
            back.position.copy(bd.homePos);
          }
          back.rotation.x = THREE.MathUtils.lerp(bd.homeRot.x, bd.scatterRot.x, rotFrac);
          back.rotation.y = THREE.MathUtils.lerp(bd.homeRot.y, bd.scatterRot.y, rotFrac);
          back.rotation.z = THREE.MathUtils.lerp(bd.homeRot.z, bd.scatterRot.z, rotFrac);
        }
      }
    }
  }

  // ═══ Animation Loop ═══
  useFrame((_state, delta) => {
    if (!groupRef.current) return;
    const dt = Math.min(delta, 0.05);

    // ── Rotation ──
    if (isDragging.current) {
      currentVel.current.x = THREE.MathUtils.lerp(
        currentVel.current.x, dragVelocity.current.y * 0.008, 0.12
      );
      currentVel.current.y = THREE.MathUtils.lerp(
        currentVel.current.y, dragVelocity.current.x * 0.008, 0.12
      );
    } else {
      const hasSig =
        Math.abs(currentVel.current.x) > Math.abs(IDLE_VEL.x) * 2 ||
        Math.abs(currentVel.current.y) > Math.abs(IDLE_VEL.y) * 2;
      if (hasSig) {
        currentVel.current.x *= DAMPING;
        currentVel.current.y *= DAMPING;
        if (
          Math.abs(currentVel.current.x) < Math.abs(IDLE_VEL.x) * 1.3 &&
          Math.abs(currentVel.current.y) < Math.abs(IDLE_VEL.y) * 1.3
        ) {
          currentVel.current.x = IDLE_VEL.x;
          currentVel.current.y = IDLE_VEL.y;
        }
      } else {
        currentVel.current.x = THREE.MathUtils.lerp(currentVel.current.x, IDLE_VEL.x, LERP_BACK);
        currentVel.current.y = THREE.MathUtils.lerp(currentVel.current.y, IDLE_VEL.y, LERP_BACK);
      }
    }

    groupRef.current.rotation.x += currentVel.current.x * dt * 60;
    groupRef.current.rotation.y += currentVel.current.y * dt * 60;

    // Clamp X tilt to keep logo face visible
    if (!isDragging.current) {
      const maxTilt = Math.PI / 7;
      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        THREE.MathUtils.clamp(groupRef.current.rotation.x, -maxTilt, maxTilt),
        0.01
      );
    }

    // ── Scroll zoom & portal trigger ──
    const rawDelta = scrollDelta.current;
    scrollDelta.current = 0; // consume

    if (transitionPhase.current === 'idle') {
      // Accumulate scroll for zoom
      scrollAccum.current = scrollAccum.current * SCROLL_DECAY + rawDelta;

      // Apply zoom (clamped)
      const rawZoom = 1.0 + scrollAccum.current * ZOOM_FACTOR;
      const targetZoom = THREE.MathUtils.clamp(rawZoom, ZOOM_MIN, ZOOM_MAX);
      zoomFactor.current = THREE.MathUtils.lerp(zoomFactor.current, targetZoom, 0.1);

      // Instant portal trigger: if zoom is at a limit and user scrolls again past it,
      // fire the portal immediately — no hold timer needed.
      const isAtLimit = targetZoom >= ZOOM_MAX - 0.01 || targetZoom <= ZOOM_MIN + 0.01;

      if (isAtLimit && Math.abs(rawDelta) > 1) {
        // User is scrolling while zoom is clamped → fire portal now
        if (atBoundary.current) {
          transitionPhase.current = 'portal_out';
          transitionTime.current = 0;
          scrollAccum.current = 0;
          atBoundary.current = false;
        } else {
          // First frame at limit — mark it, fire on the next scroll event
          atBoundary.current = true;
        }
      } else if (!isAtLimit) {
        atBoundary.current = false;
      }
    } else {
      // During portal: ignore new scroll, ease zoom back to 1.0
      zoomFactor.current = THREE.MathUtils.lerp(zoomFactor.current, 1.0, 0.05);
      scrollAccum.current *= 0.92;
    }

    groupRef.current.scale.setScalar(1.8 * zoomFactor.current);

    // ── Determine animation progress ──
    // barScatterP  — Phase 1 simple scatter for logo bars
    // coinMasterP  — [0,1] master curve for coin (drives crack→break→scatter→reassemble)
    // barMasterP   — [0,1] master curve for bars during Phase 2 and portal
    let barScatterP = 0;
    let coinMasterP = 0;
    let barMasterP = 0;
    let portalRingOpacity = 0;
    let portalRingScale = 1;

    const currentLogo = activeLogo.current;
    let solanaVisible = currentLogo === 'solana';
    let colosseumVisible = currentLogo === 'colosseum';

    if (transitionPhase.current !== 'idle') {
      // ─── Portal transition: jumps straight into scatter territory (masterP ≥ 0.25)
      // so it never shows crack/break phases — just instant full scatter then reassemble.
      transitionTime.current += dt;
      const tp = Math.min(transitionTime.current / PORTAL_DURATION, 1.0);

      if (tp < 0.45) {
        // Portal OUT: scatter outward from crackPos→scatterPos range
        const outP = tp / 0.45;
        const m = 0.25 + outP * outP * 0.75;
        coinMasterP = m;
        barMasterP = m;
        portalRingOpacity = outP * 0.9;
        portalRingScale = 0.5 + outP * 0.8;
        solanaVisible = currentLogo === 'solana';
        colosseumVisible = currentLogo === 'colosseum';
      } else if (tp < 0.55) {
        // Peak flash — switch logo at midpoint
        if (transitionPhase.current === 'portal_out') {
          transitionPhase.current = 'portal_in';
          activeLogo.current = currentLogo === 'solana' ? 'colosseum' : 'solana';
        }
        coinMasterP = 1.0;
        barMasterP = 1.0;
        portalRingOpacity = 0.9;
        portalRingScale = 1.3;
        solanaVisible = false;
        colosseumVisible = false;
      } else {
        // Portal IN: reassemble new logo (masterP falls from 1→0, pieces trace path back)
        const inP = (tp - 0.55) / 0.45;
        const v = (1 - inP) ** 3;
        coinMasterP = v < 0.001 ? 0 : v;
        barMasterP = v < 0.001 ? 0 : v;
        portalRingOpacity = Math.max(0, 0.9 - inP * 1.2);
        portalRingScale = 1.3 - inP * 0.5;
        solanaVisible = activeLogo.current === 'solana';
        colosseumVisible = activeLogo.current === 'colosseum';
      }

      // Complete transition
      if (tp >= 1.0) {
        transitionPhase.current = 'idle';
        transitionTime.current = 0;
        distortionTime.current = 0;
        scrollAccum.current = 0; // reset zoom so new logo starts at 1.0
        coinMasterP = 0;
        barMasterP = 0;
        portalRingOpacity = 0;
      }
    } else {
      // ─── Normal idle animation cycle ───
      const prevT = distortionTime.current;
      distortionTime.current = (distortionTime.current + dt) % CYCLE_DURATION;
      const t = distortionTime.current;

      // Reset switch flag at start of each new cycle
      if (prevT > distortionTime.current || t < 0.05) {
        autoSwitchDone.current = false;
      }

      if (t < 7) {
        // Phase 1: bar chunks scatter only (coin untouched); no masterP used here
        barScatterP = barScatterCurve(t / 7);
      } else if (t >= 10 && t < 17) {
        // Phase 2: continuous master curve drives crack→break→scatter→reassemble
        const p = (t - 10) / 7;
        const masterP = coinMasterCurve(p);
        coinMasterP = masterP;
        barMasterP = masterP;

        // At peak scatter (masterP ≈ 1), silently swap logo so reassembly shows the new one
        if (!autoSwitchDone.current && masterP >= 0.999) {
          activeLogo.current = activeLogo.current === 'solana' ? 'colosseum' : 'solana';
          autoSwitchDone.current = true;
          solanaVisible = activeLogo.current === 'solana';
          colosseumVisible = activeLogo.current === 'colosseum';
        }
      }
    }

    // ── Apply coin animation (solid mesh vs shards driven by masterP) ──
    // masterP=0 → solid disc; masterP>0 → shards showing seams/cracks/scatter continuously
    const coinAnyActive = coinMasterP > 0;
    if (solidCoinRef.current) {
      solidCoinRef.current.visible = !coinAnyActive;
      solidCoinRef.current.scale.setScalar(1.0);
    }
    // Coin shards use the same breakFrac/scatterFrac logic as applyChunkScatterMaster
    {
      const breakFrac = coinMasterP < 0.10 ? 0 : coinMasterP < 0.25 ? (coinMasterP - 0.10) / 0.15 : 1.0;
      const scatterFrac = coinMasterP < 0.25 ? 0 : Math.min((coinMasterP - 0.25) / 0.75, 1.0);
      for (let i = 0; i < COIN_SHARDS; i++) {
        const mesh = coinShardRefs.current[i];
        if (!mesh) continue;
        mesh.visible = coinAnyActive;
        if (coinAnyActive) {
          const d = coinScatterData[i];
          if (scatterFrac > 0) {
            mesh.position.lerpVectors(d.crackPos, d.scatterPos, scatterFrac);
            mesh.rotation.x = THREE.MathUtils.lerp(d.homeRot.x, d.scatterRot.x, scatterFrac);
            mesh.rotation.y = THREE.MathUtils.lerp(d.homeRot.y, d.scatterRot.y, scatterFrac);
            mesh.rotation.z = THREE.MathUtils.lerp(d.homeRot.z, d.scatterRot.z, scatterFrac);
          } else if (breakFrac > 0) {
            mesh.position.lerpVectors(d.homePos, d.crackPos, breakFrac);
            mesh.rotation.x = d.homeRot.x;
            mesh.rotation.y = d.homeRot.y;
            mesh.rotation.z = d.homeRot.z;
          } else {
            // masterP in [0,0.10): seam lines visible, pieces at homePos
            mesh.position.copy(d.homePos);
            mesh.rotation.x = d.homeRot.x;
            mesh.rotation.y = d.homeRot.y;
            mesh.rotation.z = d.homeRot.z;
          }
        }
      }
    }

    // ── Solana solid bars (single beam, visible only when no bar animation active) ──
    const barAnyActive = barMasterP > 0 || barScatterP > 0;
    for (let bar = 0; bar < 3; bar++) {
      const showSolid = solanaVisible && !barAnyActive;
      const fs = solanaFrontSolidRefs.current[bar];
      const bs = solanaBackSolidRefs.current[bar];
      if (fs) fs.visible = showSolid;
      if (bs) bs.visible = showSolid;
    }

    // ── Apply logo chunk animations ──
    if (barMasterP > 0) {
      // Phase 2 / portal: master-curve drives crack→break→scatter path
      applyChunkScatterMaster(
        solanaFrontRefs.current, solanaBackRefs.current,
        solanaScatter, barMasterP, solanaVisible
      );
      applyChunkScatterMaster(
        colosseumFrontRefs.current, colosseumBackRefs.current,
        colosseumScatter, barMasterP, colosseumVisible
      );
    } else {
      // Phase 1: simple scatter (no crack/break phases)
      applyChunkScatter3(
        solanaFrontRefs.current, solanaBackRefs.current,
        solanaScatter, 0, barScatterP,
        solanaVisible && barScatterP > 0
      );
      applyChunkScatter3(
        colosseumFrontRefs.current, colosseumBackRefs.current,
        colosseumScatter, 0, barScatterP,
        colosseumVisible   // no barScatterP guard — Colosseum has no solid mesh
      );
    }

    // ── Portal ring ──
    if (portalRingRef.current) {
      portalRingRef.current.visible = portalRingOpacity > 0.01;
      portalMat.opacity = portalRingOpacity;
      portalRingRef.current.scale.setScalar(portalRingScale);
      portalRingRef.current.rotation.z += dt * 3;
    }

    // ── Theme material lerp ──
    const lerpSpeed = dt * 2;

    // Coin material
    const targetCoinColor = isDark ? new THREE.Color('#1a1a2e') : new THREE.Color('#d5dbe3');
    coinMat.color.lerp(targetCoinColor, lerpSpeed);
    coinMat.opacity = THREE.MathUtils.lerp(coinMat.opacity, isDark ? 0.92 : 0.82, lerpSpeed);
    coinMat.iridescence = THREE.MathUtils.lerp(coinMat.iridescence, isDark ? 0.4 : 0.6, lerpSpeed);

    // Solana bar materials
    const solTint = isDark ? new THREE.Color('#c0c0c0') : new THREE.Color('#ffffff');
    const solEmissive = isDark ? new THREE.Color('#6b3fa0') : new THREE.Color('#c4b5fd');
    const solEmInt = isDark ? 0.35 : 0.1;
    solBarMats.forEach(mat => {
      mat.color.lerp(solTint, lerpSpeed);
      (mat.emissive as THREE.Color).lerp(solEmissive, lerpSpeed);
      mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, solEmInt, lerpSpeed);
    });

    // Colosseum materials (white)
    const colEmissive = new THREE.Color('#ffffff');
    const colEmInt = isDark ? 0.12 : 0.04;
    colMats.forEach(mat => {
      mat.color.lerp(new THREE.Color('#ffffff'), lerpSpeed);
      (mat.emissive as THREE.Color).lerp(colEmissive, lerpSpeed);
      mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, colEmInt, lerpSpeed);
    });

    // Portal ring color (theme-aware)
    const portalColor = isDark ? new THREE.Color('#9945FF') : new THREE.Color('#3b82f6');
    (portalMat.color as THREE.Color).lerp(portalColor, lerpSpeed);
  });

  // ═══ JSX ═══
  return (
    <group ref={groupRef} scale={1.8}>
      {/* ── Solid coin disc (seamless, visible when no cracks) ── */}
      <mesh
        ref={solidCoinRef}
        geometry={solidCoinGeo}
        material={coinMat}
        rotation={[Math.PI / 2, 0, 0]}
        receiveShadow
      />

      {/* ── Coin shards (visible only during crack/scatter animation) ── */}
      {coinGeos.map((geo, i) => (
        <mesh
          key={`shard-${i}`}
          ref={el => { if (el) coinShardRefs.current[i] = el; }}
          geometry={geo}
          material={coinMat}
          visible={false}
          receiveShadow
        />
      ))}

      {/* ── Solana solid front bars (3, intact — visible when barProgress === 0) ── */}
      {SOL_BAR_CONFIGS.map((cfg, bar) => (
        <mesh
          key={`sf-solid-${bar}`}
          ref={el => { if (el) solanaFrontSolidRefs.current[bar] = el; }}
          geometry={solBarSolidGeo}
          material={solBarMats[bar]}
          position={[cfg.x, cfg.y, 0.11]}
          rotation={[0, 0, cfg.rotZ]}
          castShadow
        />
      ))}

      {/* ── Solana solid back bars (3, intact — visible when barProgress === 0) ── */}
      {SOL_BAR_CONFIGS.map((cfg, bar) => (
        <mesh
          key={`sb-solid-${bar}`}
          ref={el => { if (el) solanaBackSolidRefs.current[bar] = el; }}
          geometry={solBarSolidGeo}
          material={solBarMats[bar]}
          position={[cfg.x, cfg.y, -0.12]}
          rotation={[0, Math.PI, cfg.rotZ]}
          castShadow
        />
      ))}

      {/* ── Solana front bar chunks (3 bars × 4 chunks = 12) ── */}
      {Array.from({ length: 12 }, (_, idx) => {
        const barIdx = Math.floor(idx / SOL_CHUNKS_PER_BAR);
        const sd = solanaScatter[idx];
        return (
          <mesh
            key={`sf-${idx}`}
            ref={el => { if (el) solanaFrontRefs.current[idx] = el; }}
            geometry={solBarChunkGeo}
            material={solBarMats[barIdx]}
            position={[sd.homePos.x, sd.homePos.y, sd.homePos.z]}
            rotation={[0, 0, SOL_BAR_CONFIGS[barIdx].rotZ]}
            visible={false}
            castShadow
          />
        );
      })}

      {/* ── Solana back bar chunks (mirrored) ── */}
      {Array.from({ length: 12 }, (_, idx) => {
        const barIdx = Math.floor(idx / SOL_CHUNKS_PER_BAR);
        const sd = solanaScatter[idx + 12];
        return (
          <mesh
            key={`sb-${idx}`}
            ref={el => { if (el) solanaBackRefs.current[idx] = el; }}
            geometry={solBarChunkGeo}
            material={solBarMats[barIdx]}
            position={[sd.homePos.x, sd.homePos.y, sd.homePos.z]}
            rotation={[0, Math.PI, SOL_BAR_CONFIGS[barIdx].rotZ]}
            visible={false}
            castShadow
          />
        );
      })}

      {/* ── Colosseum front chunks (beam + pillars + base = 12) ── */}
      {COL_CHUNKS.map((_, idx) => {
        const sd = colosseumScatter[idx];
        const matIdx = getColMatIdx(idx);
        return (
          <mesh
            key={`cf-${idx}`}
            ref={el => { if (el) colosseumFrontRefs.current[idx] = el; }}
            geometry={getColGeo(idx)}
            material={colMats[matIdx]}
            position={[sd.homePos.x, sd.homePos.y, sd.homePos.z]}
            visible={false}
            castShadow
          />
        );
      })}

      {/* ── Colosseum back chunks (mirrored) ── */}
      {COL_CHUNKS.map((_, idx) => {
        const sd = colosseumScatter[idx + 12];
        const matIdx = getColMatIdx(idx);
        return (
          <mesh
            key={`cb-${idx}`}
            ref={el => { if (el) colosseumBackRefs.current[idx] = el; }}
            geometry={getColGeo(idx)}
            material={colMats[matIdx]}
            position={[sd.homePos.x, sd.homePos.y, sd.homePos.z]}
            rotation={[0, Math.PI, 0]}
            visible={false}
            castShadow
          />
        );
      })}

      {/* ── Portal ring (additive glow, visible during transitions) ── */}
      <mesh
        ref={portalRingRef}
        geometry={portalGeo}
        material={portalMat}
        visible={false}
      />
    </group>
  );
}
