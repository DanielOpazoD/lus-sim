// @tier slow
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PhysiologyEngine, nonFiniteFields } from '../physiology/engine';
import { defaultPatient, validatePatient, type PatientState } from '../physiology/patientState';

/**
 * Propiedades del motor fisiológico sobre TODO el dominio que acepta `validatePatient`
 * (Fase 0): la arquitectura promete «un caso nuevo = un PatientState», así que el motor
 * debe ser estable para cualquier combinación válida, no solo para los 3 casos.
 * Semilla fija: los fallos son reproducibles (fast-check imprime el contraejemplo).
 *
 * lus-sim (decisión 10): el motor recortado (reloj, ritmo y respiración) sobre el dominio del paciente
 * núcleo; las cotas son las del modelo respiratorio (volumen 0–1, excursión ≤ 30 mm) y del ritmo.
 */
const SEED = 20260922;

const patientArb: fc.Arbitrary<PatientState> = fc
  .record({
    heartRateBpm: fc.integer({ min: 30, max: 220 }),
    rhythm: fc.constantFrom('sinus' as const, 'atrial-fibrillation' as const),
    rrVariability: fc.double({ min: 0, max: 0.3, noNaN: true }),
    atrialFunction: fc.double({ min: 0, max: 1, noNaN: true }),
    intraAbdominalPressureMmHg: fc.double({ min: 0, max: 40, noNaN: true }),
    ventilation: fc.constantFrom('spontaneous' as const, 'positive-pressure' as const),
    peepCmH2O: fc.double({ min: 0, max: 30, noNaN: true }),
    respiratoryRateMin: fc.integer({ min: 4, max: 50 }),
    respiratoryPattern: fc.constantFrom('quiet' as const, 'deep' as const, 'apnea-expiratory' as const, 'apnea-inspiratory' as const),
    seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  })
  .map((r) => ({ ...defaultPatient(), ...r }));

function run(p: PatientState, seconds: number) {
  const engine = new PhysiologyEngine(p, { historySeconds: seconds + 1 });
  const n = Math.round(seconds / engine.clock.dt);
  for (let i = 0; i < n; i++) engine.step(); // lanza NonFiniteStateError si algo deja de ser finito
  return engine.samples;
}

describe('Propiedades del motor fisiológico (fast-check)', () => {
  it('cualquier paciente válido da un estado finito y físicamente acotado durante 3 s', () => {
    fc.assert(
      fc.property(patientArb, (p) => {
        validatePatient(p);
        const samples = run(p, 3);
        let prev = -Infinity;
        for (const s of samples) {
          expect(nonFiniteFields(s)).toEqual([]);
          // el reloj único avanza y la fase cardíaca y el volumen quedan en su dominio
          expect(s.t).toBeGreaterThan(prev);
          prev = s.t;
          expect(s.cardiacPhase).toBeGreaterThanOrEqual(0);
          expect(s.cardiacPhase).toBeLessThanOrEqual(1);
          expect(s.rr).toBeGreaterThan(0);
          expect(s.resp.volume).toBeGreaterThanOrEqual(0);
          expect(s.resp.volume).toBeLessThanOrEqual(1);
          // la excursión del diafragma es 10 mm (tranquila) o 30 mm (profunda o apnea inspiratoria)
          expect(s.resp.diaphragmCaudalMm).toBeGreaterThanOrEqual(0);
          expect(s.resp.diaphragmCaudalMm).toBeLessThanOrEqual(30);
        }
      }),
      { seed: SEED, numRuns: 40 },
    );
  });

  it('misma semilla y mismo paciente → la misma historia, bit a bit (guía §17)', () => {
    fc.assert(
      fc.property(patientArb, (p) => {
        const a = run(p, 2);
        const b = run(structuredClone(p), 2);
        expect(b).toEqual(a);
      }),
      { seed: SEED, numRuns: 12 },
    );
  });
});
