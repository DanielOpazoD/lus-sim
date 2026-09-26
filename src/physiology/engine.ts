import { SimulationClock } from '../core/clock';
import type { PatientState } from './patientState';
import { validatePatient } from './patientState';
import { RespiratoryModel, type RespiratorySample } from './respiratory';
import { RhythmGenerator } from './rhythm';

/**
 * Muestra del estado fisiológico en un instante del reloj. Es la única
 * interfaz entre fisiología y el resto del motor (anatomía, Doppler, UI).
 *
 * lus-sim (decisión 10): el núcleo de la muestra de VExUS (reloj, ECG, latido y respiración), sin las
 * presiones, caudales, calibres ni velocidades por vaso de su red venosa. VExUS la extiende.
 */
export interface PhysiologySample {
  t: number;
  ecgMv: number;
  cardiacPhase: number;
  beatIndex: number;
  lastR: number;
  rr: number;
  resp: RespiratorySample;
}

/** El estado fisiológico dejó de ser finito: nada aguas abajo (GPU, espectro, medición) puede confiar en él. */
export class NonFiniteStateError extends Error {
  constructor(
    readonly fields: string[],
    readonly t: number,
  ) {
    super(`estado fisiológico no finito en t = ${t.toFixed(3)} s: ${fields.join(', ')}`);
    this.name = 'NonFiniteStateError';
  }
}

/** Campos numéricos no finitos de una muestra (vacío si todo es finito). */
export function nonFiniteFields(s: PhysiologySample): string[] {
  const bad: string[] = [];
  const check = (name: string, v: number) => {
    if (!Number.isFinite(v)) bad.push(name);
  };
  for (const [k, v] of Object.entries(s)) if (typeof v === 'number') check(k, v);
  for (const [k, v] of Object.entries(s.resp)) if (typeof v === 'number') check(`resp.${k}`, v);
  return bad;
}

export class PhysiologyEngine {
  readonly clock: SimulationClock;
  readonly patient: PatientState;
  readonly rhythm: RhythmGenerator;
  readonly respiratory: RespiratoryModel;
  /** Historial reciente (para ECG, mediciones y clasificación). */
  private history: PhysiologySample[] = [];
  private historySeconds: number;
  private current: PhysiologySample;

  constructor(patient: PatientState, opts: { dt?: number; historySeconds?: number } = {}) {
    validatePatient(patient);
    this.patient = patient;
    this.clock = new SimulationClock(opts.dt ?? 0.004);
    this.historySeconds = opts.historySeconds ?? 12;
    this.rhythm = new RhythmGenerator(patient, patient.seed ^ 0x51a7);
    this.respiratory = new RespiratoryModel(patient);
    this.current = this.sampleFrom(0);
    this.history.push(this.current);
  }

  get sample(): PhysiologySample {
    return this.current;
  }

  /** Historial ordenado por tiempo (referencia, no copia). */
  get samples(): readonly PhysiologySample[] {
    return this.history;
  }

  /** Ejecuta un paso de integración y devuelve la muestra nueva. */
  step(): PhysiologySample {
    this.clock.advance();
    const t = this.clock.t;
    // la PEEP vigente es la del paciente en cada paso, como la lee el lazo cerrado de VExUS sin intervenciones
    // (decisión 11: el lazo no se porta; el modelo respiratorio la copia al construirse)
    this.respiratory.peepCmH2O = this.patient.peepCmH2O;
    const next = this.sampleFrom(t, this.respiratory.sample(t));
    // Guardia NaN: un estado no finito se detiene aquí, con los campos culpables, en vez
    // de viajar en silencio a la GPU, al espectro y a la medición.
    const bad = nonFiniteFields(next);
    if (bad.length > 0) throw new NonFiniteStateError(bad, t);
    this.current = next;
    this.history.push(this.current);
    const tMin = t - this.historySeconds;
    while (this.history.length > 2 && this.history[0].t < tMin) this.history.shift();
    return this.current;
  }

  /** Avanza el número de pasos que corresponde a un intervalo de tiempo real. */
  advanceRealTime(elapsedSeconds: number): number {
    const n = this.clock.requestSteps(elapsedSeconds);
    for (let i = 0; i < n; i++) this.step();
    return n;
  }

  private sampleFrom(t: number, resp?: RespiratorySample): PhysiologySample {
    const r = resp ?? this.respiratory.sample(t);
    const beat = this.rhythm.currentBeat(t);
    return {
      t,
      ecgMv: this.rhythm.ecg(t),
      cardiacPhase: this.rhythm.cardiacPhase(t),
      beatIndex: beat.index,
      lastR: beat.tR,
      rr: beat.rr,
      resp: r,
    };
  }
}
