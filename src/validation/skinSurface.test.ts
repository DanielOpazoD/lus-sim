import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAxialRestSurface } from '../anatomy/axialRestSurface';
import * as surfaces from '../anatomy/skinSurface';
import { torsoSkinSurface } from '../anatomy/skinSurface';
import { axialSkinSurface } from '../anatomy/axialSkinSurface';
import { axialSurfaceSection, axialSurfaceSkinPoint, axialSurfaceDepthGradient } from '../anatomy/axialRestSurface';
import { AnatomyScene } from '../anatomy/scene';
import { defaultPatient } from '../physiology/patientState';
import { torsoDepth, torsoDepthGradient, type Torso } from '../anatomy/primitives';
import { SeededRandom } from '../core/random';
import type { Vec3 } from '../core/vec3';
import { probeContact } from '../probe/contact';
import { defaultPose, CONVEX_C35 } from '../probe/probe';

const torso = new AnatomyScene(defaultPatient()).torso;
afterEach(() => vi.restoreAllMocks());

// Oráculo congelado: la cuadrática de contact.ts anterior a la extracción (8fd24f2).
function legacyEntry(E: Vec3, dir: Vec3, t: Torso, r0: number, r1: number): number | null {
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

describe('compatibilidad exacta y consumo del proveedor de piel', () => {
  it('conserva la cuadrática legada en 100 000 rayos, también para el perfil axial identidad', () => {
    const rng = new SeededRandom(5901);
    for (const [a, b] of [
      [160, 113],
      [32, 256],
      [256, 32],
      [100, 100],
    ]) {
      const t = { ...torso, a, b };
      const skin = torsoSkinSurface(t);
      const axial = axialSkinSurface(createAxialRestSurface(a, b, { zStart: 0, zEnd: 128, scaleX: 1, scaleY: 1, shiftX: 0, shiftY: 0 }));
      for (let i = 0; i < 25000; i++) {
        const E: Vec3 = [a * (4 * rng.float() - 2), b * (4 * rng.float() - 2), 0];
        const dir: Vec3 = i % 100 === 0 ? [0, 0, 1] : [rng.float() - 0.5, rng.float() - 0.5, rng.float() - 0.5];
        const r0 = -60 * rng.float(),
          r1 = 200 * rng.float();
        const expected = legacyEntry(E, dir, t, r0, r1);
        expect(skin.entry(E, dir, r0, r1)).toBe(expected);
        expect(axial.entry(E, dir, r0, r1)).toBe(expected);
      }
      for (const p of [
        [0, 0, 0],
        [a, 0, 0],
        [a, b, 120],
      ] as Vec3[]) {
        expect(skin.depth(p)).toBe(torsoDepth(p, t));
        expect(skin.gradient(p)).toEqual(torsoDepthGradient(p, t));
      }
    }
  });

  it('contacto usa una sola superficie para entrada, hueco y profundidad de pared', () => {
    const original = torsoSkinSurface(torso);
    const skin = {
      depth: vi.fn(original.depth.bind(original)),
      gradient: vi.fn(original.gradient.bind(original)),
      entry: vi.fn(original.entry.bind(original)),
    };
    const factory = vi.spyOn(surfaces, 'torsoSkinSurface').mockReturnValue(skin);
    probeContact(defaultPose(), CONVEX_C35, torso);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(skin.entry).toHaveBeenCalled();
    expect(skin.gradient).toHaveBeenCalled();
    expect(skin.depth.mock.calls.length).toBeGreaterThan(skin.gradient.mock.calls.length);
  });

  it('no mantiene una cuadrática oculta si el proveedor informa ausencia de entrada', () => {
    vi.spyOn(surfaces, 'torsoSkinSurface').mockReturnValue({ ...torsoSkinSurface(torso), entry: () => null });
    const result = probeContact(defaultPose(), CONVEX_C35, torso);
    expect(result.summary.skinAlongMm.every(Number.isNaN)).toBe(true);
    expect(result.contact.every((v) => v === 0)).toBe(true);
  });
});

const surface = createAxialRestSurface(160, 113, {
  zStart: -100,
  zEnd: 100,
  scaleX: 1,
  scaleY: 1,
  shiftX: 0,
  shiftY: 0,
});

describe('primer cruce de la superficie de piel', () => {
  it('devuelve el inicio cuando ya está dentro, incluido el eje', () => {
    expect(axialSkinSurface(surface).entry([0, 0, 0], [1, 0, 0], 0, 200)).toBe(0);
  });

  it('no pierde una cuerda casi tangente ni devuelve su mínimo en lugar de la entrada', () => {
    const y = 113 - 1e-6;
    const expected = 10 - 160 * Math.sqrt(1 - (y / 113) ** 2);
    const hit = axialSkinSurface(surface).entry([-10, y, 0], [1, 0, 0], 0, 20);
    expect(hit).not.toBeNull();
    expect(hit!).toBeCloseTo(expected, 5);
  });

  it('no convierte un rayo exterior en contacto por una tolerancia de profundidad', () => {
    expect(axialSkinSurface(surface).entry([-10, 113 + 1e-5, 0], [1, 0, 0], 0, 20)).toBeNull();
  });
});

const translated = createAxialRestSurface(32, 32, {
  zStart: 0,
  zEnd: 128,
  scaleX: 1,
  scaleY: 1,
  shiftX: 128,
  shiftY: 0,
});

describe('entrada axial variable sin pasos mínimos ni tolerancia de tangencia', () => {
  const skin = axialSkinSurface(translated);

  it('encuentra una tangencia interior aunque ambos extremos estén fuera', () => {
    expect(skin.entry([68, 0, 32], [1.125, 0, 1], 0, 96)).toBeCloseTo(64, 5);
    expect(skin.entry([176, 0, 128], [-1.125, 0, -1], 0, 96)).toBeCloseTo(32, 5);
    expect(torsoSkinSurface({ ...torso, a: 32, b: 32 }).entry([68, 0, 32], [1.125, 0, 1], 0, 96)).toBeNull();
  });

  it('distingue una tangencia exacta de un mínimo positivo de 10⁻¹⁰ mm', () => {
    expect(skin.entry([68 + 1e-10, 0, 32], [1.125, 0, 1], 0, 96)).toBeNull();
  });

  it('encuentra la entrada anterior a una salida a menos de 0,001 mm', () => {
    const x = 68 - 1e-10;
    const delta = x - 68;
    // En esta sección, x(r)−a(z)−centro(z) = delta + (r+32)(r−64)²/8192.
    let lo = 0,
      hi = 64;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (delta + ((mid + 32) * (mid - 64) ** 2) / 8192 > 0) lo = mid;
      else hi = mid;
    }
    const hit = skin.entry([x, 0, 32], [1.125, 0, 1], 0, 96);
    expect(hit).not.toBeNull();
    expect(hit!).toBeCloseTo((lo + hi) / 2, 5);
    expect(hit!).toBeLessThan(64 - 1e-5);
  });

  it('clasifica el núcleo y los rayos estacionarios sin consultar el chart regular', () => {
    expect(skin.entry([64, 0, 64], [0, 0, 0], 0, 100)).toBe(0);
    expect(skin.entry([200, 0, 64], [0, 0, 0], 0, 100)).toBeNull();
    expect(skin.entry([64, 0, 64], [1, 0, 0], 0, 100)).toBe(0);
    expect(() => skin.depth([64, 0, 64])).toThrow(/chart/);
  });

  it('conserva los cruces en ambas uniones y en ambos sentidos axiales', () => {
    const taper = axialSkinSurface(
      createAxialRestSurface(160, 113, {
        zStart: 0,
        zEnd: 128,
        scaleX: 0.5,
        scaleY: 0.5,
        shiftX: 0,
        shiftY: 0,
      }),
    );
    expect(taper.entry([192, 0, -32], [-1, 0, 1], 0, 100)).toBeCloseTo(32, 5);
    expect(taper.entry([112, 0, 160], [-1, 0, -1], 0, 100)).toBeCloseTo(32, 5);
  });

  it('resuelve un perfil con radios y centro variables en una sección horizontal', () => {
    const geometry = createAxialRestSurface(160, 113, {
      zStart: 0,
      zEnd: 128,
      scaleX: 0.5,
      scaleY: 0.8,
      shiftX: 5,
      shiftY: -8,
    });
    const s = axialSurfaceSection(64, geometry);
    const expected = 200 - (s.x + s.a * Math.sqrt(1 - (s.y / s.b) ** 2));
    expect(axialSkinSurface(geometry).entry([200, 0, 64], [-1, 0, 0], 0, 400)).toBeCloseTo(expected, 5);
  });

  it('rechaza NaN, infinito, búsqueda invertida y extremos axiales fuera del dominio', () => {
    expect(() => skin.entry([NaN, 0, 0], [1, 0, 0], 0, 10)).toThrow();
    expect(() => skin.entry([0, 0, 0], [Infinity, 0, 0], 0, 10)).toThrow();
    expect(() => skin.entry([0, 0, 0], [1, 0, 0], 10, 0)).toThrow();
    expect(() => skin.entry([0, 0, 500], [0, 0, 1], 0, 20)).toThrow();
  });

  it('interseca los perfiles con escala y desplazamiento simultáneos y dirección axial no nula', () => {
    const geometry = createAxialRestSurface(160, 113, {
      zStart: 0,
      zEnd: 128,
      scaleX: 0.5,
      scaleY: 0.8,
      shiftX: 5,
      shiftY: -8,
    });
    const provider = axialSkinSurface(geometry);
    for (let i = 0; i < 16; i++) {
      const p = axialSurfaceSkinPoint(-Math.PI + (6.1 * i) / 15, 30 + (60 * i) / 15, geometry);
      const g = axialSurfaceDepthGradient(p, geometry);
      const magnitude = Math.hypot(...g);
      const dir = g.map((v) => -v / magnitude) as Vec3;
      const E = p.map((v, k) => v - 30 * dir[k]) as Vec3;
      const hit = provider.entry(E, dir, 0, 60);
      expect(hit).not.toBeNull();
      expect(hit!).toBeCloseTo(30, 5);
      expect(Math.abs(provider.depth(E.map((v, k) => v + hit! * dir[k]) as Vec3))).toBeLessThan(2e-6);
    }
  });
});
