import { describe, expect, it } from 'vitest';
import { cross, dot, length, normalize, type Vec3 } from '../core/vec3';
import {
  axialRestForward,
  axialRestGradient,
  axialRestInverse,
  axialRestInverseBound,
  axialRestSection,
  axialRestTangent,
  createAxialRestMap,
} from './axialRestMap';

// Geometrías sintéticas: no son dimensiones ni parámetros del paciente.
const identity = createAxialRestMap({ zStart: 10, zEnd: 90, scaleX: 1, scaleY: 1, shiftX: 0, shiftY: 0 });
const maps = [
  identity,
  createAxialRestMap({ ...identity, scaleX: 0.3, scaleY: 0.7, shiftX: 3, shiftY: -12 }),
  createAxialRestMap({ ...identity, scaleX: 1.4, scaleY: 2, shiftX: -5, shiftY: 6 }),
  createAxialRestMap({ ...identity, scaleX: 0.6, scaleY: 1.3, shiftX: 20, shiftY: 30 }),
];
const heights = [-80, 10, 10.001, 25, 50, 75, 89.999, 90, 150];
const near = (a: Vec3, b: Vec3, digits = 9) => a.forEach((v, k) => expect(v).toBeCloseTo(b[k], digits));

describe('mapa axial de reposo (contrato, todavía sin activar en el paciente)', () => {
  it('rechaza NaN, infinitos, secciones degeneradas y pérdidas de invertibilidad float32', () => {
    for (const field of Object.keys(identity)) {
      for (const bad of [NaN, Infinity, -Infinity]) expect(() => createAxialRestMap({ ...identity, [field]: bad })).toThrow('axialRestMap');
    }
    for (const scale of [0, -1, 1e-50, 1e50]) {
      expect(() => createAxialRestMap({ ...identity, scaleX: scale })).toThrow();
      expect(() => createAxialRestMap({ ...identity, scaleY: scale })).toThrow();
    }
    for (const zEnd of [9, 10, 10 + 1e-8]) expect(() => createAxialRestMap({ ...identity, zEnd })).toThrow();
    expect(() => createAxialRestMap({ ...identity, zStart: -3e38, zEnd: 3e38 })).toThrow();
    expect(() => createAxialRestMap({ ...identity, zStart: 0, zEnd: 1e-39 })).toThrow();
    expect(Object.isFrozen(identity)).toBe(true);
    const tiny = createAxialRestMap({ ...identity, scaleX: 1e-20 });
    expect(axialRestSection(90, tiny).scaleX).toBe(tiny.scaleX);
  });

  it('es identidad exacta abajo y afín arriba; invierte bilateralmente sin perder z', () => {
    for (const map of maps) {
      for (const z of heights) {
        for (const x of [-160, 0, 160]) {
          for (const y of [-110, 0, 110]) {
            const m: Vec3 = [x, y, z];
            const p = axialRestForward(m, map);
            near(axialRestInverse(p, map), m);
            near(axialRestForward(axialRestInverse(m, map), map), m);
            if (z <= map.zStart || map === identity) expect(p).toEqual(m);
            if (z >= map.zEnd) near(p, [map.scaleX * x + map.shiftX, map.scaleY * y + map.shiftY, z]);
            const s = axialRestSection(z, map);
            expect(s.scaleX * s.scaleY).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('transporta tangentes por J y gradientes por J⁻ᵀ, no por J ni por una normal unitaria', () => {
    const v: Vec3 = [0.2, -0.4, 0.7];
    const g: Vec3 = [2, -3, 4];
    const h = 1e-3;
    for (const map of maps) {
      for (const z of heights) {
        const m: Vec3 = [-137, 89, z];
        const p = axialRestForward(m, map);
        const t = axialRestTangent(m, v, map);
        const gradient = axialRestGradient(m, g, map);
        const derivative = (fn: (x: Vec3) => Vec3, at: Vec3, direction: Vec3): Vec3 => {
          const a = fn(at.map((x, k) => x + h * direction[k]) as Vec3);
          const b = fn(at.map((x, k) => x - h * direction[k]) as Vec3);
          return a.map((x, k) => (x - b[k]) / (2 * h)) as Vec3;
        };
        // Diferencias centrales de funciones independientes: error O(h) en la unión C¹, O(h²) dentro.
        near(
          t,
          derivative((q) => axialRestForward(q, map), m, v),
          4,
        );
        const numeric = [0, 1, 2].map((k) => {
          const e: Vec3 = [0, 0, 0];
          e[k] = 1;
          return dot(
            g,
            derivative((q) => axialRestInverse(q, map), p, e),
          );
        }) as Vec3;
        near(gradient, numeric, 3);
        expect(dot(gradient, t)).toBeCloseTo(dot(g, v), 10);
        const tangent = normalize(cross(g, [1, 0, 0]));
        expect(dot(gradient, axialRestTangent(m, tangent, map))).toBeCloseTo(0, 10);
      }
    }
    expect(length(axialRestGradient([100, 80, 90], [1, 0, 0], maps[1]))).toBeCloseTo(1 / 0.3, 12);
  });

  it('la cota domina la norma inversa, incluidas transiciones anisótropas, y no pretende ser global en XY', () => {
    expect(axialRestInverseBound(identity, 160, 110)).toBe(1);
    for (const map of maps) {
      const bound = axialRestInverseBound(map, 160, 110);
      for (const z of heights) {
        for (const x of [-160, 0, 160]) {
          for (const y of [-110, 0, 110]) {
            for (let i = 0; i < 32; i++) {
              const g = normalize([Math.cos(i), Math.sin(i), Math.cos(2 * i)]);
              // ||J⁻¹||₂ = ||J⁻ᵀ||₂. La desigualdad se prueba con vectores, no comparando dos cotas iguales.
              expect(length(axialRestGradient([x, y, z], g, map))).toBeLessThanOrEqual(bound + 1e-12);
            }
          }
        }
      }
    }
    for (const r of [-1, Infinity, NaN]) {
      expect(() => axialRestInverseBound(identity, r, 110)).toThrow();
      expect(() => axialRestInverseBound(identity, 160, r)).toThrow();
    }
  });

  it('las uniones tienen derivada identidad/afín, sin salto de normal', () => {
    for (const map of maps) {
      for (const z of [map.zStart, map.zEnd]) {
        const s = axialRestSection(z, map);
        expect([s.dScaleX, s.dScaleY, s.dShiftX, s.dShiftY].every((d) => d === 0)).toBe(true);
        const g: Vec3 = [1, 2, 3];
        near(axialRestGradient([30, -50, z - 1e-7], g, map), axialRestGradient([30, -50, z + 1e-7], g, map), 6);
      }
    }
  });
});
