import type { Beat } from './rhythm';
import { ventricularEjection } from './ventricle';

/**
 * El latido que mueve el corazón y el pulmón de alrededor (fase 2 del corazón). Antes de que llegue el corazón de EchoTwin (en su
 * chunk, `app/cardiacRuntime.ts`), el de la decisión 32 (`ventricle.ts`: la eyección y el llenado rápido sobre los eventos del
 * reloj); con él, el de su curva de volumen (`echoTwinBeat.ts`), que la aplicación registra al cargarlo (`registerBeatModel`) y las
 * pruebas al arrancar. Con el corazón, el pulmón late con la misma curva que el corazón.
 */
export interface BeatModel {
  /** Telesístole y RR del latido de referencia (s). */
  readonly endSystoleS: number;
  readonly rrS: number;
  /** Fracción del volumen latido expulsada en la fase de referencia `phase` (0 en la telediástole, 1 en la telesístole). */
  ejectedFraction(phase: number): number;
}

let model: BeatModel | null = null;

/** Registra el latido de EchoTwin (o lo quita, con null). */
export function registerBeatModel(m: BeatModel | null): void {
  model = m;
}

/**
 * La fase del latido de referencia (en [0, 1)) del instante `t` del latido `beat` del reloj, por tramos: su sístole (de la R a la
 * telesístole del reloj, el centro de la onda v `tV`) sobre la de referencia, y su diástole sobre la de referencia; el reloj ya
 * acorta la sístole con √RR (`rhythm.ts`), y dentro de cada tramo la correspondencia es lineal [SUPUESTO]. Sin el latido de EchoTwin,
 * la fracción del RR.
 */
export function referencePhase(beat: Beat, t: number): number {
  const tau = Math.min(Math.max(t - beat.tR, 0), beat.rr);
  if (!model) return tau >= beat.rr ? 0 : tau / beat.rr;
  const es = Math.min(beat.tV - beat.tR, beat.rr);
  const esRef = model.endSystoleS;
  let tRef: number;
  if (tau <= es) tRef = es > 0 ? (tau * esRef) / es : esRef;
  else tRef = esRef + ((tau - es) * (model.rrS - esRef)) / (beat.rr - es);
  const p = tRef / model.rrS;
  return p >= 1 ? 0 : p;
}

/** La fracción expulsada del instante: la del latido de EchoTwin en su fase, o la de la decisión 32 sin él. */
export function cardiacEjection(beat: Beat, t: number, phase: number): number {
  return model ? model.ejectedFraction(phase) : ventricularEjection(beat, t);
}
