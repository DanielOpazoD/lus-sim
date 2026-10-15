import { describe, expect, it } from 'vitest';
import { cupolaMm, cupolaRoofDepthMm } from '../anatomy/organs/lungApex';
import { CHEST_WALL_DU_MM, wallCupolaSection } from '../anatomy/organs/chestWall';
import { wallPoint } from '../anatomy/organs/supraclavicular';
import { wallArc, wallArcGradient, wallInnerNormal, wallPerimeter, wallSideTotalAt } from '../anatomy/organs/wall';
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
          for (let i = 0; i < 3; i++) {
            const lo: Vec3 = [...p],
              hi: Vec3 = [...p];
            lo[i] -= 0.001;
            hi[i] += 0.001;
            expect(wallArcGradient(p, { a, b })[i]).toBeCloseTo((wallArc(hi, { a, b }) - wallArc(lo, { a, b })) / 0.002, 6);
          }
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
        cupolaSection: () => [150, 190, 0],
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

  it('el techo sigue su segmento a ambos lados de cada nodo, sin promediar pendientes vecinas', () => {
    const t = scene.torso;
    for (let node = CHEST_WALL_DU_MM; node < wallPerimeter(t) / 2 - 1; node += CHEST_WALL_DU_MM)
      for (const delta of [-0.4, -0.1, 0.1, 0.4])
        for (const side of [-1, 1]) {
          const u = side * (node + delta);
          const [, zt] = wallCupolaSection(scene.chestWall, u);
          const p = wallPoint(u, zt, wallSideTotalAt(t, u, zt) + 2, t);
          const expected = gradient((q) => q[2] - wallCupolaSection(scene.chestWall, wallArc(q, t))[1], p);
          expect(dot(wallInnerNormal(p, t), expected), `u=${u}`).toBeGreaterThan(0.9999);
        }
  });

  it('compara distancias normalizadas para elegir la cara próxima a la arista', () => {
    const t: Torso = {
      ...scene.torso,
      a: 100,
      b: 100,
      chestWall: {
        ...scene.chestWall,
        total: (_u, z) => 15 + cupolaMm(150, 190, z),
        cupolaSection: () => [150, 190, 0],
      },
    };
    const z = 189;
    const w = wallSideTotalAt(t, 80, z);
    const p = wallPoint(80, z, w + 1.3, t);
    // Sin normalizar: -1 (techo) > -1,3 (ladera). Distancia local de ladera: -1,3/√(1+1,4625²) ≈ -0,734.
    const expected = gradient((q) => torsoDepth(q, t) + wallSideTotalAt(t, wallArc(q, t), q[2]), p);
    expect(dot(wallInnerNormal(p, t), expected)).toBeGreaterThan(0.9999);
    expect(dot(wallInnerNormal(p, t), [0, 0, 1])).toBeLessThan(0.9);
  });

  it('en el nodo elige el segmento hacia mayor |u|; eje y tabla saturada tienen pendiente cero', () => {
    const cw = scene.chestWall;
    for (const side of [-1, 1]) {
      const u = side * 40;
      const a = wallCupolaSection(cw, u);
      const b = wallCupolaSection(cw, u + side * 0.1);
      expect(a[2]).toBeCloseTo((b[1] - a[1]) / (side * 0.1), 9);
      expect(wallCupolaSection(cw, side * 1e5)[2]).toBe(0);
    }
    expect(wallCupolaSection(cw, 0)[2]).toBe(0);
  });

  it('conserva la normal de la pared sin cúpula y es finita en el eje', () => {
    const t: Torso = { ...scene.torso, chestWall: undefined };
    const p: Vec3 = [70, 80, 50];
    expect(wallInnerNormal(p, t)).toEqual(normalize(torsoDepthGradient(p, t)));
    for (const z of [0, 180, 220]) expect(wallInnerNormal([0, 0, z], scene.torso).every(Number.isFinite)).toBe(true);
  });
});
