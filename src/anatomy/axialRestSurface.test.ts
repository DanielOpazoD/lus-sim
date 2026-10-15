import { describe, expect, it } from 'vitest';
import { cross, dot, normalize, type Vec3 } from '../core/vec3';
import { axialRestForward } from './axialRestMap';
import {
  axialSurfaceDepth,
  axialSurfaceDepthGradient,
  axialSurfacePhi,
  axialSurfacePhiGradient,
  axialSurfaceSection,
  axialSurfaceSkinPoint,
  axialSurfaceSkinTangents,
  createAxialRestSurface,
  type AxialRestSurface,
} from './axialRestSurface';
import { torsoDepth, torsoDepthGradient, torsoPhi, torsoSkinPoint, type Torso } from './primitives';

// Solo geometrías sintéticas; ninguna se activa en un paciente ni representa un cuello validado.
const identity = { zStart: 10, zEnd: 90, scaleX: 1, scaleY: 1, shiftX: 0, shiftY: 0 };
const surfaces = [
  createAxialRestSurface(160, 110, identity),
  createAxialRestSurface(160, 110, { ...identity, scaleX: 0.3, scaleY: 0.7, shiftX: 3, shiftY: -12 }),
  createAxialRestSurface(160, 110, { ...identity, scaleX: 1.4, scaleY: 2, shiftX: -5, shiftY: 6 }),
  createAxialRestSurface(160, 110, { ...identity, scaleX: 0.6, scaleY: 1.3, shiftX: 20, shiftY: 30 }),
];
const heights = [-80, 10, 10.001, 25, 50, 75, 89.999, 90, 150];
const angles = [-2.8, -2, -0.7, 0, 0.5, 1.9, 2.8];
const near = (a: Vec3, b: Vec3, digits = 8) => a.forEach((v, k) => expect(v).toBeCloseTo(b[k], digits));
const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function point(phi: number, rho: number, z: number, s: AxialRestSurface): Vec3 {
  return axialRestForward([s.a * rho * Math.cos(phi), s.b * rho * Math.sin(phi), z], s.map);
}

function derivative(fn: (p: Vec3) => number, p: Vec3, angular = false): Vec3 {
  const h = 1e-4;
  return [0, 1, 2].map((k) => {
    const a = [...p] as Vec3;
    const b = [...p] as Vec3;
    a[k] += h;
    b[k] -= h;
    return (angular ? angleDifference(fn(a), fn(b)) : fn(a) - fn(b)) / (2 * h);
  }) as Vec3;
}

describe('superficie axial de reposo físico (sin activar)', () => {
  it('valida radios, mapa, coordenadas, chart y ángulos; congela una copia del perfil', () => {
    for (const bad of [0, -1, 31.99, 256.01, NaN, Infinity]) {
      expect(() => createAxialRestSurface(bad, 110, identity)).toThrow('axialRestSurface');
      expect(() => createAxialRestSurface(160, bad, identity)).toThrow('axialRestSurface');
    }
    expect(() => createAxialRestSurface(160, 110, { ...identity, zEnd: 11 })).toThrow('axialRestMap');
    expect(() => createAxialRestSurface(256, 32, { ...identity, scaleX: 4, scaleY: 0.25 })).toThrow('excéntrica');
    expect(() => createAxialRestSurface(32, 256, { ...identity, scaleX: 0.25, scaleY: 4 })).toThrow('excéntrica');
    const input = { ...identity };
    const s = createAxialRestSurface(32, 256, input);
    input.scaleX = 2;
    expect(s.map.scaleX).toBe(1);
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.map)).toBe(true);
    for (const p of [
      [513, 0, 0],
      [0, 0, 513],
      [NaN, 0, 0],
      [0, Infinity, 0],
    ] as Vec3[]) {
      expect(() => axialSurfaceDepth(p, s)).toThrow('axialRestMap');
      expect(() => axialSurfaceDepthGradient(p, s)).toThrow('axialRestMap');
      expect(() => axialSurfacePhi(p, s)).toThrow('axialRestMap');
      expect(() => axialSurfacePhiGradient(p, s)).toThrow('axialRestMap');
    }
    for (const rho of [0, 0.24, 0.25 - 1e-10]) {
      const p: Vec3 = [rho * s.a, 0, 0];
      expect(() => axialSurfaceDepth(p, s)).toThrow('chart regular');
      expect(() => axialSurfaceDepthGradient(p, s)).toThrow('chart regular');
      expect(() => axialSurfacePhi(p, s)).toThrow('chart regular');
      expect(() => axialSurfacePhiGradient(p, s)).toThrow('chart regular');
    }
    expect(axialSurfaceDepthGradient([8, 0, 0], s)).toEqual([1, 0, 0]);
    for (const phi of [NaN, Infinity, -Infinity, 1e30, Math.PI + 1e-6, -Math.PI - 1e-6]) {
      expect(() => axialSurfaceSkinPoint(phi, 0, s)).toThrow('ángulo');
      expect(() => axialSurfaceSkinTangents(phi, 0, s)).toThrow('ángulo');
    }
    expect(() => axialSurfaceSkinPoint(0, 513, s)).toThrow('axialRestMap');
    expect(() => axialSurfaceSkinTangents(0, 513, s)).toThrow('axialRestMap');
    const wide = createAxialRestSurface(256, 256, { ...identity, scaleX: 4, scaleY: 4 });
    expect(axialSurfaceSkinPoint(0, 90, wide)).toEqual([1024, 0, 90]);
    expect(axialSurfaceDepth([1024, 0, 90], wide)).toBe(0);
  });

  it('recupera la elipse anterior en identidad y debajo de la transición', () => {
    const t: Torso = { a: 160, b: 110, zMin: -300, zMax: 300, skinMm: 2, fatMm: 14, muscleMm: 12, preperitonealMm: 2 };
    for (const s of surfaces)
      for (const z of s === surfaces[0] ? heights : [-80, 10])
        for (const phi of angles) {
          const p = point(phi, 0.7, z, s);
          expect(axialSurfaceDepth(p, s)).toBeCloseTo(torsoDepth(p, t), 11);
          near(axialSurfaceDepthGradient(p, s), torsoDepthGradient(p, t));
          expect(axialSurfacePhi(p, s)).toBeCloseTo(torsoPhi(p[0], p[1], t), 12);
          near(axialSurfaceSkinPoint(phi, z, s), torsoSkinPoint(phi, z, t));
        }
  });

  it('mide profundidad en mm físicos, no la antigua distancia evaluada en F⁻¹', () => {
    const s = createAxialRestSurface(160, 110, { ...identity, scaleX: 0.5, shiftX: 20 });
    expect(axialSurfaceDepth([110, 0, 90], s)).toBeCloseTo(10, 12);
    expect(axialSurfaceDepth([90, 0, 90], s)).toBeCloseTo(-10, 12);
    // Una magnitud de referencia de 20 mm se volvió 10: no basta con transportar su gradiente.
    expect(axialSurfaceDepth([180, 0, 90], surfaces[0])).toBeCloseTo(20, 12);
    const mid = axialSurfaceSection(50, surfaces[1]);
    expect(mid.da).not.toBe(0);
    expect(mid.dy).not.toBe(0);
    const p = axialSurfaceSkinPoint(0.5, 50, surfaces[1]);
    expect(Math.hypot(...axialSurfaceDepthGradient(p, surfaces[1]))).toBeGreaterThan(1.05);
  });

  it('deriva profundidad y etiqueta angular frente a diferencias independientes, también en las uniones C¹', () => {
    for (const s of surfaces)
      for (const z of heights)
        for (const phi of angles)
          for (const rho of [0.3, 0.8, 1, 1.3]) {
            const p = point(phi, rho, z, s);
            near(
              axialSurfaceDepthGradient(p, s),
              derivative((q) => axialSurfaceDepth(q, s), p),
              4,
            );
            near(
              axialSurfacePhiGradient(p, s),
              derivative((q) => axialSurfacePhi(q, s), p, true),
              6,
            );
            expect(angleDifference(axialSurfacePhi(p, s), phi)).toBeCloseTo(0, 12);
          }
  });

  it('la piel y sus dos tangentes son la misma superficie; su normal coincide con ∇d', () => {
    const h = 1e-5;
    for (const s of surfaces)
      for (const z of heights)
        for (const phi of angles) {
          const p = axialSurfaceSkinPoint(phi, z, s);
          near(p, point(phi, 1, z, s));
          expect(axialSurfaceDepth(p, s)).toBeCloseTo(0, 10);
          const t = axialSurfaceSkinTangents(phi, z, s);
          const pa = axialSurfaceSkinPoint(phi + h, z, s);
          const pb = axialSurfaceSkinPoint(phi - h, z, s);
          const za = axialSurfaceSkinPoint(phi, z + h, s);
          const zb = axialSurfaceSkinPoint(phi, z - h, s);
          near(t.phi, pa.map((v, k) => (v - pb[k]) / (2 * h)) as Vec3, 6);
          near(t.z, za.map((v, k) => (v - zb[k]) / (2 * h)) as Vec3, 5);
          const g = axialSurfaceDepthGradient(p, s);
          expect(dot(g, t.phi)).toBeCloseTo(0, 9);
          expect(dot(g, t.z)).toBeCloseTo(0, 9);
          expect(dot(normalize(g), normalize(cross(t.phi, t.z)))).toBeCloseTo(1, 12);
          const gp = axialSurfacePhiGradient(p, s);
          expect(dot(gp, t.phi)).toBeCloseTo(1, 12);
          expect(dot(gp, t.z)).toBeCloseTo(0, 12);
        }
  });

  it('expone un chart angular, no una coordenada de longitud que conserve arcos físicos', () => {
    const s = surfaces[1];
    const t = axialSurfaceSkinTangents(0, 90, s);
    expect(Math.hypot(...t.phi)).toBeCloseTo(s.b * s.map.scaleY, 12);
    expect(Math.hypot(...t.phi)).not.toBeCloseTo(s.b, 1);
    for (const phi of [-Math.PI, Math.PI]) {
      const p = axialSurfaceSkinPoint(phi, 50, s);
      near(
        axialSurfacePhiGradient(p, s),
        derivative((q) => axialSurfacePhi(q, s), p, true),
      );
    }
  });

  it('es C¹ pero no promete curvatura continua en las uniones', () => {
    const s = surfaces[1];
    const h = 1e-5;
    near(axialSurfaceSkinTangents(0, 10 - h, s).z, axialSurfaceSkinTangents(0, 10 + h, s).z, 5);
    // ∂²p.x/∂z² salta: el consumidor debe tratar las uniones por lados, no derivar curvatura suave.
    const right = (axialSurfaceSkinTangents(0, 10 + h, s).z[0] - axialSurfaceSkinTangents(0, 10, s).z[0]) / h;
    expect(Math.abs(right)).toBeGreaterThan(0.09);
    expect(axialSurfaceSkinTangents(0, 10 - h, s).z[0]).toBe(0);
  });
});
