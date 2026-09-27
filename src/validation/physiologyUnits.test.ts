import { describe, expect, it } from 'vitest';
import { clonePatient, defaultPatient, validatePatient, type PatientState } from '../physiology/patientState';
import { RespiratoryModel } from '../physiology/respiratory';
import { RhythmGenerator, type Beat } from '../physiology/rhythm';

/**
 * Unidades fisiológicas en el nivel rápido (sin motor completo): contrato
 * temporal del ritmo, respiración, conservación de masa de la red venosa y las
 * ventanas de medida. Complementa a `physiology.test.ts` (lento, emergente).
 *
 * lus-sim (decisión 10): el ritmo y la respiración, idénticos a los de VExUS, con su mismo paciente (el
 * núcleo de su adulto sano, `defaultPatient`); sin la red venosa ni las ventanas del Doppler venoso.
 */
const NORMAL_ADULT = defaultPatient();
/**
 * El núcleo del caso «FA · congestión moderada» de VExUS (`AF_MODERATE_CONGESTION`,
 * vexus-sim@52354d5:src/cases/index.ts): FC 96, dispersión RR 0,22, sin contracción auricular.
 */
const AF_MODERATE: PatientState = {
  ...defaultPatient(),
  id: 'af-moderate',
  seed: 20260923,
  heartRateBpm: 96,
  rhythm: 'atrial-fibrillation',
  rrVariability: 0.22,
  atrialFunction: 0,
  intraAbdominalPressureMmHg: 6,
  respiratoryRateMin: 18,
};

describe('Ritmo', () => {
  it('rr es el intervalo hasta la SIGUIENTE R: tR(i+1) − tR(i) = rr(i)', () => {
    const r = new RhythmGenerator(NORMAL_ADULT, NORMAL_ADULT.seed ^ 0x51a7);
    const seen = new Map<number, Beat>();
    for (let t = 0; t <= 180; t += 0.25) for (const b of r.beatsAround(t)) seen.set(b.index, b);
    const bs = [...seen.values()].sort((a, b) => a.index - b.index);
    expect(bs.length).toBeGreaterThan(150);
    for (let i = 0; i + 1 < bs.length; i++) {
      expect(bs[i + 1].tR - bs[i].tR).toBeCloseTo(bs[i].rr, 9);
      expect(bs[i + 1].tR).toBeGreaterThan(bs[i].tR);
      expect(bs[i].rr).toBeGreaterThan(0.6 * r.nominalRR());
    }
    const rrs = bs.map((b) => b.rr);
    const mean = rrs.reduce((a, b) => a + b, 0) / rrs.length;
    const sd = Math.sqrt(rrs.reduce((a, b) => a + (b - mean) ** 2, 0) / rrs.length);
    // 70 lpm y variabilidad 0,03 del paciente: media a < 1 % del RR nominal y CV alrededor de 0,03
    expect(Math.abs(mean / (60 / 70) - 1)).toBeLessThan(0.01);
    expect(sd / mean).toBeGreaterThan(0.02);
    expect(sd / mean).toBeLessThan(0.045);
    // determinismo bit a bit (generadores frescos: el historial antiguo se olvida)
    const ra = new RhythmGenerator(NORMAL_ADULT, NORMAL_ADULT.seed ^ 0x51a7);
    const rb = new RhythmGenerator(clonePatient(NORMAL_ADULT), NORMAL_ADULT.seed ^ 0x51a7);
    expect(rb.beatsAround(30).map((b) => b.rr)).toEqual(ra.beatsAround(30).map((b) => b.rr));
    expect(ra.beatsAround(30).length).toBeGreaterThan(0);
  });

  it('el ECG tiene el pico R en tR, la T tras ella y la P antes; sin función auricular no hay P', () => {
    const r = new RhythmGenerator(NORMAL_ADULT, 3);
    const b = r.beatsAround(10).find((x) => x.tR > 9)!;
    let tMax = b.tR - 0.3;
    for (let t = b.tR - 0.3; t <= b.tR + 0.6; t += 0.0002) if (r.ecg(t) > r.ecg(tMax)) tMax = t;
    expect(Math.abs(tMax - b.tR)).toBeLessThan(0.003);
    expect(r.ecg(b.tR)).toBeGreaterThan(0.9);
    let tT = b.tR + 0.2;
    for (let t = b.tR + 0.2; t <= b.tR + 0.45; t += 0.0005) if (r.ecg(t) > r.ecg(tT)) tT = t;
    expect(r.ecg(tT)).toBeGreaterThan(0.2);
    expect(r.ecg(tT)).toBeLessThan(0.4);
    let pMax = 0;
    for (let t = b.tP - 0.05; t <= b.tP + 0.09; t += 0.0005) pMax = Math.max(pMax, r.ecg(t));
    expect(pMax).toBeGreaterThan(0.08);
    const noAtrium = new RhythmGenerator({ ...clonePatient(NORMAL_ADULT), atrialFunction: 0 }, 3);
    const b2 = noAtrium.beatsAround(10).find((x) => x.tR > 9)!;
    let p2 = 0;
    for (let t = b2.tP - 0.05; t <= b2.tP + 0.09; t += 0.0005) p2 = Math.max(p2, Math.abs(noAtrium.ecg(t)));
    expect(p2).toBeLessThan(0.01);
  });
});

describe('Motor fisiológico: el reloj único', () => {
  it('advanceRealTime integra los pasos enteros del reloj y el historial se recorta a su ventana', async () => {
    const { PhysiologyEngine } = await import('../physiology/engine');
    const e = new PhysiologyEngine(defaultPatient(), { historySeconds: 1 });
    expect(e.samples).toHaveLength(1);
    expect(e.advanceRealTime(0.01)).toBe(2); // 10 ms = 2 pasos de 4 ms (+ 2 ms pendientes)
    expect(e.sample.t).toBeCloseTo(0.008, 12);
    expect(e.advanceRealTime(0.002)).toBe(1);
    expect(e.clock.step).toBe(3);
    // cada muestra es la del instante del reloj
    expect(e.sample.t).toBe(e.clock.t);
    for (let i = 0; i < 1000; i++) e.step();
    // 1 s de historial: ~250 muestras de 4 ms, ordenadas
    expect(e.samples.length).toBeLessThanOrEqual(252);
    expect(e.samples[0].t).toBeGreaterThanOrEqual(e.sample.t - 1 - 0.004);
    for (let i = 1; i < e.samples.length; i++) expect(e.samples[i].t).toBeGreaterThan(e.samples[i - 1].t);
  });

  it('beatsBetween da los latidos completos de la ventana, en orden y sin cortar ninguno', () => {
    const r = new RhythmGenerator(NORMAL_ADULT, NORMAL_ADULT.seed ^ 0x51a7);
    const beats = r.beatsBetween(10, 20);
    // ~70 lpm en 10 s: 10–12 latidos enteros
    expect(beats.length).toBeGreaterThanOrEqual(10);
    expect(beats.length).toBeLessThanOrEqual(12);
    for (const b of beats) {
      expect(b.tR).toBeGreaterThanOrEqual(10);
      expect(b.tR + b.rr).toBeLessThanOrEqual(20);
    }
    for (let i = 1; i < beats.length; i++) expect(beats[i].index).toBe(beats[i - 1].index + 1);
  });
});

describe('Fibrilación auricular', () => {
  it('RR irregular (CV ≈ 22 %), sin P ni contracción auricular, ondas f en la línea de base', () => {
    const r = new RhythmGenerator(AF_MODERATE, 11);
    const seen = new Map<number, Beat>();
    for (let t = 0; t <= 120; t += 0.25) for (const b of r.beatsAround(t)) seen.set(b.index, b);
    const bs = [...seen.values()].sort((a, b) => a.index - b.index);
    const rrs = bs.map((b) => b.rr);
    const mean = rrs.reduce((a, b) => a + b, 0) / rrs.length;
    const sd = Math.sqrt(rrs.reduce((a, b) => a + (b - mean) ** 2, 0) / rrs.length);
    expect(Math.abs(mean / (60 / 96) - 1)).toBeLessThan(0.06);
    expect(sd / mean).toBeGreaterThan(0.15);
    expect(sd / mean).toBeLessThan(0.3);
    expect(Math.min(...rrs)).toBeGreaterThanOrEqual(0.3); // refractariedad del nodo AV
    for (const b of bs) {
      expect(Number.isNaN(b.tP)).toBe(true);
      expect(Number.isNaN(b.tAtrialContraction)).toBe(true);
      expect(b.atrialAmplitude).toBe(0);
      expect(b.rr).toBeGreaterThan(0);
    }
    // ondas f: la línea de base entre T y el siguiente QRS no es plana pero es pequeña
    const b = bs.find((x) => x.tR > 10 && x.rr > 0.7)!;
    let fMax = 0;
    for (let t = b.tR + 0.5; t < b.tR + b.rr - 0.06; t += 0.001) fMax = Math.max(fMax, Math.abs(r.ecg(t)));
    expect(fMax).toBeGreaterThan(0.02);
    expect(fMax).toBeLessThan(0.1);
  });
});

describe('Respiración', () => {
  it('es C¹, recorre 40/50/10 % del ciclo y las apneas congelan volumen, diafragma y pleura', () => {
    const m = new RespiratoryModel(clonePatient(NORMAL_ADULT));
    const T = 60 / NORMAL_ADULT.respiratoryRateMin;
    expect(m.sample(0).volume).toBe(0);
    expect(m.sample(0.4 * T).volume).toBeCloseTo(1, 9);
    expect(m.sample(0.95 * T).volume).toBe(0);
    expect(m.sample(0.95 * T).volumeRate).toBe(0);
    for (let i = 0; i < 400; i++) {
      const t = -10 + (20 * i) / 399;
      const s = m.sample(t);
      expect(s.volume).toBeGreaterThanOrEqual(0);
      expect(s.volume).toBeLessThanOrEqual(1);
      expect(s.phase).toBeGreaterThanOrEqual(0);
      expect(s.phase).toBeLessThan(1);
      expect(s.diaphragmCaudalMm).toBeCloseTo(m.excursionMm() * s.volume, 9);
      // derivada numérica ≈ volumeRate (continuidad C¹)
      const dv = (m.sample(t + 1e-4).volume - m.sample(t - 1e-4).volume) / 2e-4;
      expect(Math.abs(dv - s.volumeRate)).toBeLessThan(1e-3);
    }
    expect(m.sample(0.2 * T).volumeRate).toBeCloseTo((0.5 * Math.PI) / (0.4 * T), 6);
    // lus-sim (decisión 22): la excursión de la base en supino, 16 mm tranquila y 53 profunda (en VExUS, 10 y 30)
    expect(m.excursionMm()).toBe(16);
    expect(new RespiratoryModel({ ...clonePatient(NORMAL_ADULT), respiratoryPattern: 'deep' }).excursionMm()).toBe(53);
    const apE = new RespiratoryModel({ ...clonePatient(NORMAL_ADULT), respiratoryPattern: 'apnea-expiratory' });
    const apI = new RespiratoryModel({ ...clonePatient(NORMAL_ADULT), respiratoryPattern: 'apnea-inspiratory' });
    for (let t = 0; t < 10; t += 0.2) {
      const e = apE.sample(t);
      expect(e.volume).toBe(0);
      expect(e.volumeRate).toBe(0);
      expect(e.diaphragmCaudalMm).toBe(0);
      expect(e.pleuralMmHg).toBeCloseTo(apE.pleuralAtEndExpiration(), 12);
      const i = apI.sample(t);
      expect(i.volume).toBe(1);
      expect(i.diaphragmCaudalMm).toBe(53);
      expect(i.diaphragmVelocityMmS).toBe(0);
    }
    // PEEP: 40 % a la pleura en los dos modos; con respiración espontánea es una CPAP (decisión 79 de VExUS;
    // antes la respiración espontánea la ignoraba)
    const pp = new RespiratoryModel({ ...clonePatient(NORMAL_ADULT), ventilation: 'positive-pressure', peepCmH2O: 10 });
    expect(pp.pleuralAtEndExpiration() - m.pleuralAtEndExpiration()).toBeCloseTo(10 * 0.73556 * 0.4, 6);
    const cpap = new RespiratoryModel({ ...clonePatient(NORMAL_ADULT), peepCmH2O: 10 });
    expect(cpap.pleuralAtEndExpiration() - m.pleuralAtEndExpiration()).toBeCloseTo(10 * 0.73556 * 0.4, 6);
    // la inspiración espontánea sigue bajando la pleural (la oscilación no cambia con la CPAP)
    for (const t of [0.3 * T, 0.5 * T, 0.8 * T]) {
      expect(cpap.sample(t).pleuralMmHg - m.sample(t).pleuralMmHg).toBeCloseTo(10 * 0.73556 * 0.4, 9);
    }
    // la PEEP vigente del modelo puede cambiar en marcha (en VExUS la cambia la intervención de su motor; el de
    // lus-sim aún no interviene): la pleural la sigue
    cpap.peepCmH2O = 0;
    expect(cpap.pleuralAtEndExpiration()).toBe(m.pleuralAtEndExpiration());
    // la presión abdominal parte de la intraabdominal del paciente (5 mmHg por omisión) y sube al inspirar
    expect(m.sample(0).abdominalMmHg).toBe(NORMAL_ADULT.intraAbdominalPressureMmHg);
    expect(m.sample(0.4 * T).abdominalMmHg).toBeGreaterThan(NORMAL_ADULT.intraAbdominalPressureMmHg);
  });

  it('el motor lleva a la pleura la PEEP del paciente en cada paso, también si cambia en marcha (lus-sim, decisión 11)', async () => {
    // en VExUS lo hace su lazo cerrado, que no se porta: sin esta lectura la PEEP quedaba fija desde la construcción
    const { PhysiologyEngine } = await import('../physiology/engine');
    const live = new PhysiologyEngine(clonePatient(NORMAL_ADULT));
    const peep10 = new PhysiologyEngine({ ...clonePatient(NORMAL_ADULT), peepCmH2O: 10 });
    const shift = 10 * 0.73556 * 0.4; // 40 % de 10 cmH₂O en mmHg (`respiratory.ts`)
    for (let i = 0; i < 200; i++) expect(peep10.step().resp.pleuralMmHg - live.step().resp.pleuralMmHg).toBeCloseTo(shift, 9);
    live.patient.peepCmH2O = 10;
    for (let i = 0; i < 1000; i++) expect(live.step().resp.pleuralMmHg).toBe(peep10.step().resp.pleuralMmHg);
  });
});

describe('Paciente núcleo (decisión 10)', () => {
  it('el PatientState no contiene ningún campo que sea un puntaje o un patrón LUS (guía §5: nada se asigna)', () => {
    // adaptada de vexus-sim@52354d5:src/validation/physiology.test.ts («ningún campo es un grado VExUS»)
    const keys = JSON.stringify(defaultPatient()).toLowerCase();
    for (const banned of ['vexus', 'grade', 'score', 'puntaje', 'bline', 'blue', 'lus']) expect(keys.includes(banned), banned).toBe(false);
  });

  it('el paciente por omisión es válido, con la presión intraabdominal de 5 mmHg y un objeto nuevo en cada llamada', () => {
    const p = defaultPatient();
    expect(() => validatePatient(p)).not.toThrow();
    expect(p.intraAbdominalPressureMmHg).toBe(5);
    p.habitus.subcutaneousFatMm = 99;
    expect(defaultPatient().habitus.subcutaneousFatMm).toBe(14);
    expect(clonePatient(p)).toEqual(p);
    expect(clonePatient(p)).not.toBe(p);
  });

  it.each<[keyof PatientState, number]>([
    ['heartRateBpm', 20],
    ['heartRateBpm', 300],
    ['atrialFunction', 1.5],
    ['intraAbdominalPressureMmHg', -1],
    ['peepCmH2O', 31],
    ['respiratoryRateMin', 2],
    ['respiratoryRateMin', Number.NaN],
  ])('validatePatient rechaza %s = %s', (key, value) => {
    expect(() => validatePatient({ ...defaultPatient(), [key]: value })).toThrow(new RegExp(`PatientState\\.${key}`));
  });
});

describe('Guardia de estado no finito (Fase 0)', () => {
  it('nonFiniteFields nombra los campos culpables y el motor se detiene con NonFiniteStateError', async () => {
    const { PhysiologyEngine, NonFiniteStateError, nonFiniteFields } = await import('../physiology/engine');
    const p = clonePatient(NORMAL_ADULT);
    const e = new PhysiologyEngine(p);
    const s = e.step();
    expect(nonFiniteFields(s)).toEqual([]);
    expect(nonFiniteFields({ ...s, ecgMv: Number.NaN, resp: { ...s.resp, pleuralMmHg: Infinity } })).toEqual(['ecgMv', 'resp.pleuralMmHg']);
    // envenenar la respiración: el siguiente paso debe lanzar, no propagar NaN
    const resp = e.respiratory as unknown as { sample: (t: number) => Record<string, number> };
    const original = resp.sample.bind(resp);
    resp.sample = (t: number) => ({ ...original(t), diaphragmCaudalMm: Number.NaN });
    let caught: unknown = null;
    try {
      e.step();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(NonFiniteStateError);
    expect((caught as InstanceType<typeof NonFiniteStateError>).fields).toEqual(['resp.diaphragmCaudalMm']);
    // la muestra envenenada no entra en el historial: la última sigue siendo finita
    expect(nonFiniteFields(e.sample)).toEqual([]);
  });
});
