import { describe, expect, it } from 'vitest';
import { cupolaMm, cupolaRoofDepthMm } from '../anatomy/organs/lungApex';
import { wallCupolaSection } from '../anatomy/organs/chestWall';
import { wallPoint } from '../anatomy/organs/supraclavicular';
import { wallArc, wallArcGradient, wallInnerNormal } from '../anatomy/organs/wall';
import { torsoDepth, torsoDepthGradient, type Torso } from '../anatomy/primitives';
import { AnatomyScene } from '../anatomy/scene';
import type { Vec3 } from '../core/vec3';
import { defaultPatient } from '../physiology/patientState';

const scene = new AnatomyScene(defaultPatient());
const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const gradient = (f: (p: Vec3) => number, p: Vec3): Vec3 =>
  normalize(
    [0, 1, 2].map((i) => {
      const lo: Vec3 = [...p],
        hi: Vec3 = [...p];
      lo[i] -= 0.001;
      hi[i] += 0.001;
      return (f(hi) - f(lo)) / 0.002;
    }) as Vec3,
  );
const dot = (a: Vec3, b: Vec3) => a.reduce((s, x, i) => s + x * b[i], 0);

describe('normal de la cúpula: techo y ladera, no el salto de cierre (55)', () => {
  it('el gradiente del arco sigue las columnas radiales también en una elipse, no su tangente', () => {
    for (const a of [140, 160, 190])
      for (const b of [95, 113, 140])
        for (const tau of [-2.7, -1.3, -0.4, 0.4, 1.3, 2.7]) {
          const p: Vec3 = [a * 0.8 * Math.sin(tau), b * 0.8 * Math.cos(tau), 0];
          expect(
            dot(
              normalize(wallArcGradient(p, { a, b })),
              gradient((q) => wallArc(q, { a, b }), p),
            ),
          ).toBeCloseTo(1, 9);
        }
  });

  it('la ladera sigue el gradiente de la frontera clasificada por debajo del techo', () => {
    const t = scene.torso;
    for (const side of [-1, 1])
      for (const u of [42, 65, 85, 105, 205, 235, 280]) {
        const [za, zt] = wallCupolaSection(scene.chestWall, side * u);
        const z = za + 0.4 * (zt - za);
        const p = wallPoint(side * u, z, scene.chestWall.total(side * u, z), t);
        const expected = gradient((q) => torsoDepth(q, t) + scene.chestWall.total(wallArc(q, t), q[2]), p);
        // < 0,81°: diferencias de tabla de 0,5 mm frente al gradiente con paso 0,001 mm.
        expect(dot(wallInnerNormal(p, t), expected), `u=${side * u}`).toBeGreaterThan(0.9999);
      }
  });

  it('el techo horizontal tiene normal vertical por los dos lados, incluso a más de un paso del salto', () => {
    const t: Torso = {
      ...scene.torso,
      chestWall: {
        ...scene.chestWall,
        total: (_u, z) => 15 + cupolaMm(150, 190, z),
        cupolaSection: () => [150, 190],
      },
    };
    for (const dz of [-1, -0.1, 0, 0.1, 1]) {
      const p = wallPoint(80, 190 + dz, 60, t);
      expect(dot(wallInnerNormal(p, t), [0, 0, 1])).toBe(1);
    }
  });

  it('el techo inclinado sigue el gradiente de z − zTop(u), no una vertical impuesta', () => {
    const t = scene.torso;
    for (const side of [-1, 1])
      for (const u of [42, 65, 85, 105, 205, 235, 280]) {
        const [za, zt] = wallCupolaSection(scene.chestWall, side * u);
        const z = zt - 1;
        const base = scene.chestWall.total(side * u, z) - cupolaMm(za, zt, z);
        const d = base + cupolaRoofDepthMm(za, zt) + 10;
        const p = wallPoint(side * u, z, d, t);
        const expected = gradient((q) => q[2] - wallCupolaSection(scene.chestWall, wallArc(q, t))[1], p);
        expect(dot(wallInnerNormal(p, t), expected), `u=${side * u}`).toBeGreaterThan(0.9999);
      }
  });

  it('conserva la normal de la pared sin cúpula y es finita en el eje', () => {
    const t: Torso = { ...scene.torso, chestWall: undefined };
    const p: Vec3 = [70, 80, 50];
    expect(wallInnerNormal(p, t)).toEqual(normalize(torsoDepthGradient(p, t)));
    for (const z of [0, 180, 220]) expect(wallInnerNormal([0, 0, z], scene.torso).every(Number.isFinite)).toBe(true);
  });
});
