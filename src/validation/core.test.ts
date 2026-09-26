import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SimulationClock } from '../core/clock';
import { SeededRandom, hash3, hashString } from '../core/random';
import {
  cmH2OToMmHg,
  cmToMm,
  cmsToMms,
  dopplerShiftHz,
  mmHgToCmH2O,
  mmToCm,
  mmsToCms,
  nyquistVelocityCms,
  prfFromNyquistCms,
  velocityFromShiftMmS,
  wrapToNyquist,
} from '../core/units';
import { add, clamp, cross, dist, dot, length, mix, normalize, rotateAxis, scale, smoothstep, sub, v3, type Vec3 } from '../core/vec3';

/**
 * Núcleo portado de VExUS (docs/PROVENANCE.md). Estas pruebas fijan lo que el resto del motor supone:
 * un solo reloj de paso fijo, azar reproducible por semilla y unidades con el signo físico correcto.
 */
describe('SimulationClock: un solo reloj de paso fijo (guía §4)', () => {
  it('convierte tiempo real en pasos enteros y arrastra el resto', () => {
    const c = new SimulationClock(0.004);
    expect(c.requestSteps(0.01)).toBe(2); // 10 ms = 2 pasos de 4 ms + 2 ms pendientes
    expect(c.requestSteps(0.002)).toBe(1); // los 2 ms pendientes completan un paso
    for (let i = 0; i < 3; i++) c.advance();
    expect(c.step).toBe(3);
    expect(c.t).toBeCloseTo(0.012, 12);
  });

  it('limita la deuda de una pestaña en segundo plano y no avanza en pausa', () => {
    const c = new SimulationClock(0.004);
    expect(c.requestSteps(60, 125)).toBe(125); // un minuto fuera: 125 pasos, el resto se descarta
    expect(c.requestSteps(0.004)).toBe(1);
    c.pause();
    expect(c.paused).toBe(true);
    expect(c.requestSteps(1)).toBe(0);
    c.resume();
    expect(c.requestSteps(0.004)).toBe(1);
  });

  it('reset vuelve al instante cero y rechaza pasos absurdos', () => {
    const c = new SimulationClock();
    c.advance();
    c.reset();
    expect([c.t, c.step]).toEqual([0, 0]);
    expect(() => new SimulationClock(0)).toThrow();
    expect(() => new SimulationClock(0.1)).toThrow();
  });
});

describe('SeededRandom: misma semilla, misma simulación (guía §20)', () => {
  it('reproduce la secuencia con la misma semilla y la cambia con otra', () => {
    const seq = (s: number | string) => {
      const r = new SeededRandom(s);
      return Array.from({ length: 8 }, () => r.uint32());
    };
    expect(seq(42)).toEqual(seq(42));
    expect(seq('caso-normal')).toEqual(seq('caso-normal'));
    expect(seq(42)).not.toEqual(seq(43));
  });

  it('float, range y fork se mantienen en sus intervalos y son reproducibles', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const r = new SeededRandom(seed);
        for (let i = 0; i < 20; i++) {
          const f = r.float();
          expect(f).toBeGreaterThanOrEqual(0);
          expect(f).toBeLessThan(1);
          const x = r.range(-3, 5);
          expect(x).toBeGreaterThanOrEqual(-3);
          expect(x).toBeLessThan(5);
        }
        expect(new SeededRandom(seed).fork('pleura').float()).toBe(new SeededRandom(seed).fork('pleura').float());
      }),
      { seed: 20260926, numRuns: 200 },
    );
  });

  it('gaussian tiene media ≈ 0 y varianza ≈ 1', () => {
    const r = new SeededRandom(7);
    const n = 20_000;
    let s = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const g = r.gaussian();
      s += g;
      s2 += g * g;
    }
    // Error estándar de la media 1/√n ≈ 0,007: 0,03 son > 4 errores estándar
    expect(Math.abs(s / n)).toBeLessThan(0.03);
    expect(Math.abs(s2 / n - 1)).toBeLessThan(0.05);
  });

  it('hashString y hash3 son deterministas y hash3 cae en [0, 1)', () => {
    expect(hashString('lus')).toBe(hashString('lus'));
    expect(hashString('lus')).not.toBe(hashString('sul'));
    fc.assert(
      fc.property(
        fc.integer({ min: -1e6, max: 1e6 }),
        fc.integer({ min: -1e6, max: 1e6 }),
        fc.integer({ min: -1e6, max: 1e6 }),
        (x, y, z) => {
          const h = hash3(x, y, z);
          expect(h).toBeGreaterThanOrEqual(0);
          expect(h).toBeLessThan(1);
          expect(hash3(x, y, z)).toBe(h);
        },
      ),
      { seed: 20260926, numRuns: 300 },
    );
  });
});

describe('Unidades: conversiones y signo físico', () => {
  it('cmH2O ↔ mmHg, mm ↔ cm y cm/s ↔ mm/s ida y vuelta', () => {
    expect(cmH2OToMmHg(10)).toBeCloseTo(7.3556, 4);
    expect(mmHgToCmH2O(cmH2OToMmHg(12.5))).toBeCloseTo(12.5, 12);
    expect(cmToMm(2.5)).toBe(25);
    expect(mmToCm(cmToMm(3.7))).toBeCloseTo(3.7, 12);
    expect(cmsToMms(12)).toBe(120);
    expect(mmsToCms(cmsToMms(-4.2))).toBeCloseTo(-4.2, 12);
  });

  it('el desplazamiento Doppler es positivo si el dispersor se acerca y la corrección angular no lo altera', () => {
    const f0 = 3e6;
    const fd = dopplerShiftHz(100, f0); // 10 cm/s hacia la sonda
    expect(fd).toBeGreaterThan(0);
    expect(dopplerShiftHz(-100, f0)).toBeCloseTo(-fd, 12);
    expect(velocityFromShiftMmS(fd, f0, 0)).toBeCloseTo(100, 9);
    expect(velocityFromShiftMmS(fd, f0, Math.PI / 3)).toBeCloseTo(200, 9); // a 60° la velocidad rotulada es el doble
    expect(Number.isNaN(velocityFromShiftMmS(fd, f0, Math.PI / 2))).toBe(true);
  });

  it('el plegado de Nyquist cae en [−PRF/2, PRF/2) y la PRF de una escala es su inversa', () => {
    expect(wrapToNyquist(1200, 2000)).toBeCloseTo(-800, 9);
    expect(wrapToNyquist(-1200, 2000)).toBeCloseTo(800, 9);
    const prf = prfFromNyquistCms(20, 3e6);
    expect(nyquistVelocityCms(prf, 3e6)).toBeCloseTo(20, 9);
  });
});

describe('vec3', () => {
  it('suma, resta, escala y distancia', () => {
    const a = v3(1, 2, 3);
    expect(add(a, [1, 1, 1])).toEqual([2, 3, 4]);
    expect(sub(a, [1, 1, 1])).toEqual([0, 1, 2]);
    expect(scale(a, 2)).toEqual([2, 4, 6]);
    expect(dist([0, 0, 0], [3, 4, 0])).toBe(5);
  });

  it('producto vectorial, normalización y rotación de Rodrigues', () => {
    const x: Vec3 = [1, 0, 0];
    const y: Vec3 = [0, 1, 0];
    expect(cross(x, y)).toEqual([0, 0, 1]);
    expect(dot(x, y)).toBe(0);
    expect(length(normalize([3, 4, 0]))).toBeCloseTo(1, 12);
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
    const r = rotateAxis(x, [0, 0, 1], Math.PI / 2);
    expect(r[0]).toBeCloseTo(0, 12);
    expect(r[1]).toBeCloseTo(1, 12);
  });

  it('clamp, smoothstep y mix', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 12);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(mix(2, 4, 0.25)).toBe(2.5);
  });
});
