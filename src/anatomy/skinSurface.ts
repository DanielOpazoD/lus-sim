import type { Vec3 } from '../core/vec3';
import { torsoDepth, torsoDepthGradient, type Torso } from './primitives';

/** Contacto en reposo físico. La superficie axial sigue fuera del paciente productivo. */
export interface SkinSurface {
  depth(p: Vec3): number;
  gradient(p: Vec3): Vec3;
  /** Aproximación del primer r de [r0,r1] dentro de la piel; r0 si ya empieza dentro, null si no la toca. */
  entry(E: Vec3, dir: Vec3, r0: number, r1: number): number | null;
}

export function ellipticSkinEntry(E: Vec3, dir: Vec3, t: Pick<Torso, 'a' | 'b'>, r0: number, r1: number): number | null {
  const ia = 1 / (t.a * t.a);
  const ib = 1 / (t.b * t.b);
  const A = dir[0] * dir[0] * ia + dir[1] * dir[1] * ib;
  const B = 2 * (E[0] * dir[0] * ia + E[1] * dir[1] * ib);
  const C = E[0] * E[0] * ia + E[1] * E[1] * ib - 1;
  if (A < 1e-12) return C <= 0 ? r0 : null;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const q = Math.sqrt(disc);
  const enter = (-B - q) / (2 * A);
  const exit = (-B + q) / (2 * A);
  if (exit < r0 || enter > r1) return null;
  return Math.max(enter, r0);
}

/** La cuadrática productiva anterior, sin cambios en operaciones ni guardas. */
export function torsoSkinSurface(t: Torso): SkinSurface {
  return {
    depth: (p) => torsoDepth(p, t),
    gradient: (p) => torsoDepthGradient(p, t),
    entry: (E, dir, r0, r1) => ellipticSkinEntry(E, dir, t, r0, r1),
  };
}
