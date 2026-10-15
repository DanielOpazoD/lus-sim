import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '../core/vec3';
import { ellipticRadialDepth, ellipticRadialGradient, type EllipticMetric } from '../anatomy/ellipticMetric';
import * as primitives from '../anatomy/primitives';
import { AnatomyScene } from '../anatomy/scene';
import { defaultPatient } from '../physiology/patientState';
import { ribMetric } from '../anatomy/organs/ribcage';
import { wallArcGradient, wallInnerNormal } from '../anatomy/organs/wall';

const torso = new AnatomyScene(defaultPatient()).torso;
afterEach(() => vi.restoreAllMocks());

describe('métrica elíptica compartida, paciente todavía en identidad', () => {
  it('conserva exactamente la profundidad y el gradiente cilíndricos, incluido su núcleo legado', () => {
    for (const [a, b] of [
      [160, 113],
      [32, 256],
      [256, 32],
      [100, 100],
    ]) {
      const t = { ...torso, a, b };
      for (let j = 0; j < 40; j++) {
        const phi = -Math.PI + (2 * Math.PI * j) / 39;
        for (const rho0 of [0, 1e-12, 0.1, 0.25, 0.9, 1, 1.2]) {
          for (const z of [-200, 0, 225]) {
            const p: Vec3 = [a * rho0 * Math.cos(phi), b * rho0 * Math.sin(phi), z];
            const rho = Math.sqrt((p[0] / a) ** 2 + (p[1] / b) ** 2);
            const r = Math.hypot(p[0], p[1]);
            const depth = (rho - 1) * (rho > 0 ? r / rho : Math.min(a, b));
            expect(primitives.torsoDepth(p, t)).toBe(depth);
            const q = Math.hypot(p[0] / a, p[1] / b);
            const c = r / (q * q * q);
            const gradient =
              r < 1e-6 ? [0, 1, 0] : [(p[0] / r) * (1 - 1 / q) + (c * p[0]) / (a * a), (p[1] / r) * (1 - 1 / q) + (c * p[1]) / (b * b), 0];
            expect(primitives.torsoDepthGradient(p, t)).toEqual(gradient);
          }
        }
      }
    }
  });

  it('conserva la componente axial completa frente a diferencias independientes en espacio físico', () => {
    const h = 1e-3;
    for (const [a, b] of [
      [160, 113],
      [32, 256],
      [256, 32],
      [100, 100],
    ]) {
      for (const [da, db, dx, dy] of [
        [0, 0, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
        [0, 1, 0, 0],
        [-1.7, 0.6, 1.1, -0.9],
        [0.7, -0.5, -1.3, 1.7],
      ]) {
        const s: EllipticMetric = { a, b, da, db, dx, dy };
        // Sección lineal local independiente: aquí z = 0; no usa el mapa ni las fórmulas del kernel.
        const independentDepth = (p: Vec3) => {
          const x = p[0] - dx * p[2];
          const y = p[1] - dy * p[2];
          const rho = Math.hypot(x / (a + da * p[2]), y / (b + db * p[2]));
          return (Math.hypot(x, y) * (rho - 1)) / rho;
        };
        for (let j = 0; j < 40; j++) {
          const phi = -Math.PI + (2 * Math.PI * j) / 39;
          for (const rho of [0.25, 0.6, 1, 1.3]) {
            const p: Vec3 = [a * rho * Math.cos(phi), b * rho * Math.sin(phi), 0];
            const r = Math.hypot(p[0], p[1]);
            const q = Math.hypot(p[0] / a, p[1] / b);
            expect(ellipticRadialDepth(r, q)).toBeCloseTo(independentDepth(p), 10);
            const gradient = ellipticRadialGradient(p[0], p[1], r, q, s);
            for (let k = 0; k < 3; k++) {
              const l: Vec3 = [...p];
              const u: Vec3 = [...p];
              l[k] -= h;
              u[k] += h;
              const fd = (independentDepth(u) - independentDepth(l)) / (2 * h);
              // Truncamiento O(h²) de la diferencia central, no tolerancia anatómica ni GPU.
              expect(Math.abs(gradient[k] - fd)).toBeLessThan(1e-5);
            }
          }
        }
      }
    }
  });

  it('no convierte NaN en un punto interior ni añade una singularidad axial a la identidad', () => {
    for (const p of [
      [NaN, 1, 0],
      [1, NaN, 0],
    ] as Vec3[])
      expect(primitives.torsoDepth(p, torso)).toBeNaN();
    // El campo legado no acota coordenadas; esto no amplía el dominio del proveedor axial validado.
    const g = primitives.torsoDepthGradient([1e160, 1e160, 0], torso);
    expect(g.every(Number.isFinite)).toBe(true);
    expect(g[2]).toBe(0);
  });

  it('no pierde ∂d/∂z en la métrica costal ni en la normal de una pared uniforme', () => {
    const g: Vec3 = [0.6, -0.2, 0.7];
    vi.spyOn(primitives, 'torsoDepthGradient').mockReturnValue(g);
    const t = { ...torso };
    delete t.chestWall;
    const m: Vec3 = [80, 70, 60];
    const length = Math.hypot(...g);
    expect(ribMetric(m, t)).toBe(length);
    wallInnerNormal(m, t).forEach((v, k) => expect(v).toBeCloseTo(g[k] / length, 12));
  });

  it('suma el gradiente axial físico al de W(u,z), no lo sustituye por ∂W/∂z', () => {
    const g: Vec3 = [0.6, -0.2, 0.7];
    vi.spyOn(primitives, 'torsoDepthGradient').mockReturnValue(g);
    const t = {
      ...torso,
      chestWall: {
        layers: () => ({ skin: 1, fat: 1, muscle: 1, pre: 1, band: 0, abdomen: 0 }),
        total: (u: number, z: number) => 20 + 0.07 * u + 0.03 * z,
        inspiration: () => 0,
      },
    };
    const m: Vec3 = [80, 70, 60];
    const du = wallArcGradient(m, t);
    const expected: Vec3 = [g[0] + 0.07 * du[0], g[1] + 0.07 * du[1], g[2] + 0.07 * du[2] + 0.03];
    const length = Math.hypot(...expected);
    wallInnerNormal(m, t).forEach((v, k) => expect(v).toBeCloseTo(expected[k] / length, 12));
  });
});
