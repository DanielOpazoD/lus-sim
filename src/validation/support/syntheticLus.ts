import type { GreyFrame, SectorGeometry } from '../../measure/fidelity/sector';
import { rng } from '../syntheticSpeckle';

/**
 * Cuadros sintéticos del patrón normal con respuesta conocida, para probar el banco de fidelidad sin WebGL ni clips
 * reales (decisión 21): un sector convexo, sectorial o lineal; la pared, la línea pleural (gaussiana axial) y sus réplicas
 * a k·d_pl con una razón constante entre órdenes sobre la neblina, el campo profundo y, bajo cada costilla, el eco de su
 * superficie y el suelo de la sombra; ruido gaussiano correlacionado (caja 3 × 3) para que haya moteado que medir. En
 * una pila, lo que está bajo la pleura se desliza lateralmente y cada cuadro lleva además un ruido propio.
 */
export interface SyntheticLusOptions {
  kind: 'convex' | 'sector' | 'linear';
  width: number;
  height: number;
  /** px por mm. */
  scale: number;
  depthMm: number;
  /** Convexa y sectorial: ápice (px), radio de curvatura (mm) y semiángulo (rad). */
  apexX: number;
  apexY: number;
  radiusMm: number;
  halfSector: number;
  /** Lineal: bordes (px) y fila de la piel. */
  xLeft: number;
  xRight: number;
  yTop: number;
  /** Distancia piel–pleura (mm) a lo largo del haz. */
  dPlMm: number;
  /** Costillas: su tramo lateral (rad en convexa, px en lineal) y la profundidad de su superficie (mm). */
  ribs: { from: number; to: number; topMm: number }[];
  /** Niveles de gris (0–1) de cada estructura. */
  wall: number;
  pleura: number;
  haze: number;
  deep: number;
  floor: number;
  rib: number;
  /** Hasta dónde llega la neblina (mm); más hondo, el campo profundo. */
  hazeUntilMm: number;
  /** Razón de amplitud entre órdenes consecutivos de la serie pleural (r_k = decay^(k−1)). */
  decay: number;
  /** σ axial de cada eco de la serie y de la costilla (mm). */
  echoSigmaMm: number;
  /** σ del ruido correlacionado (gris) y semilla. */
  noise: number;
  seed: number;
  /** Gris fuera del sector. */
  outside: number;
}

export const SYNTHETIC_CONVEX: SyntheticLusOptions = {
  kind: 'convex',
  width: 480,
  height: 420,
  scale: 3,
  depthMm: 120,
  apexX: 240,
  apexY: -120,
  radiusMm: 45,
  halfSector: 0.55,
  xLeft: 0,
  xRight: 0,
  yTop: 0,
  dPlMm: 18,
  ribs: [
    { from: -0.4, to: -0.22, topMm: 12 },
    { from: 0.12, to: 0.3, topMm: 12 },
  ],
  wall: 0.3,
  pleura: 0.9,
  haze: 0.18,
  deep: 0.12,
  floor: 0.06,
  rib: 0.8,
  hazeUntilMm: 50,
  decay: 0.5,
  echoSigmaMm: 0.5,
  noise: 0.02,
  seed: 7,
  outside: 0,
};

/** La geometría verdadera de un sintético (la que `detectSector` debería encontrar). */
export function syntheticGeometry(o: SyntheticLusOptions): SectorGeometry {
  if (o.kind === 'linear') return { kind: 'linear', xLeft: o.xLeft, xRight: o.xRight, yTop: o.yTop, yBottom: o.yTop + o.depthMm * o.scale };
  return {
    kind: o.kind,
    apexX: o.apexX,
    apexY: o.apexY,
    thetaLeft: -o.halfSector,
    thetaRight: o.halfSector,
    rhoMin: o.radiusMm * o.scale,
    rhoMax: (o.radiusMm + o.depthMm) * o.scale,
  };
}

/** Campo de ruido gaussiano (σ 1) suavizado con una caja 3 × 3, de w × h. */
function noiseField(w: number, h: number, seed: number): Float64Array {
  const rnd = rng(seed);
  const white = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) white[i] = Math.sqrt(-2 * Math.log(Math.max(1e-12, rnd()))) * Math.cos(2 * Math.PI * rnd());
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) s += white[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))];
      out[y * w + x] = s / 3; // 9 muestras: σ = 3/3
    }
  return out;
}

/** Posición lateral (rad o px) y profundidad (mm) de un píxel; null fuera del sector. */
function locate(o: SyntheticLusOptions, x: number, y: number): { lat: number; r: number } | null {
  if (o.kind === 'linear') {
    const r = (y - o.yTop) / o.scale;
    return x >= o.xLeft && x <= o.xRight && r >= 0 && r <= o.depthMm ? { lat: x, r } : null;
  }
  const th = Math.atan2(x - o.apexX, y - o.apexY);
  const r = Math.hypot(x - o.apexX, y - o.apexY) / o.scale - o.radiusMm;
  return Math.abs(th) <= o.halfSector && r >= 0 && r <= o.depthMm ? { lat: th, r } : null;
}

/**
 * Una pila de `frames` cuadros (1 por omisión): lo que está bajo la pleura se desliza `slidePx` px por cuadro y cada
 * cuadro suma un ruido propio de σ `frameNoise`.
 */
export function syntheticLus(o: SyntheticLusOptions, frames = 1, slidePx = 0, frameNoise = 0): GreyFrame[] {
  const W = o.width;
  const H = o.height;
  const pad = Math.ceil(Math.abs(slidePx) * frames) + 2;
  const field = noiseField(W + pad, H, o.seed);
  const g = (d: number) => Math.exp(-(d * d) / (2 * o.echoSigmaMm * o.echoSigmaMm));
  const out: GreyFrame[] = [];
  for (let t = 0; t < frames; t++) {
    const own = frameNoise > 0 ? noiseField(W, H, o.seed + 1000 + t) : null;
    const data = new Float64Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const p = locate(o, x, y);
        if (!p) {
          data[y * W + x] = o.outside;
          continue;
        }
        const rib = o.ribs.find((b) => p.lat >= b.from && p.lat <= b.to);
        let v: number;
        let under = false;
        if (rib) {
          const base = p.r < rib.topMm ? o.wall : o.floor;
          v = base + (o.rib - base) * g(p.r - rib.topMm);
        } else {
          under = p.r >= o.dPlMm;
          v = p.r < o.dPlMm ? o.wall : p.r < o.hazeUntilMm ? o.haze : o.deep;
          const a1 = o.pleura - o.haze;
          for (let k = 1; k * o.dPlMm < o.depthMm + 3 * o.echoSigmaMm; k++) v += a1 * o.decay ** (k - 1) * g(p.r - k * o.dPlMm);
        }
        const xs = under ? Math.min(W + pad - 1, x + Math.round(slidePx * t)) : x;
        v += o.noise * field[y * (W + pad) + xs];
        if (own) v += frameNoise * own[y * W + x];
        data[y * W + x] = v;
      }
    out.push({ width: W, height: H, data });
  }
  return out;
}

/** El mismo cuadro con g → a·g + b dentro del sector (fuera, sin tocar: el marco de la pantalla no es señal). */
export function affineInside(o: SyntheticLusOptions, f: GreyFrame, a: number, b: number): GreyFrame {
  const data = new Float64Array(f.width * f.height);
  for (let y = 0; y < f.height; y++)
    for (let x = 0; x < f.width; x++) {
      const i = y * f.width + x;
      data[i] = locate(o, x, y) ? a * f.data[i] + b : f.data[i];
    }
  return { width: f.width, height: f.height, data };
}

/** Cuantiza un cuadro 0–1 a 8 bits (0–255), recortando. */
export function to8bit(f: GreyFrame): GreyFrame {
  const data = new Uint8Array(f.width * f.height);
  for (let i = 0; i < data.length; i++) data[i] = Math.min(255, Math.max(0, Math.round(f.data[i] * 255)));
  return { width: f.width, height: f.height, data };
}
