import { buildBeatTables, sampleTable, type BeatTables } from './heart/cycleModel';
import { caseOutflow } from './heart/outflow';
import { normalExcellentCase } from './heart/normal-excellent';
import type { CardiacCase } from './heart/schema';
import type { BeatModel } from './cardiacBeat';

/**
 * El latido del corazón de EchoTwin en el reloj único de lus-sim (fase 2 del corazón; decisión 49 para la fase 1). Las tablas del
 * latido de EchoTwin (`heart/cycleModel.ts`, portado) dan el volumen del VI, las válvulas y los anillos de un latido de referencia:
 * el del caso (65 lpm). Cada latido del reloj se lleva a él por tramos (`referencePhase` de `cardiacBeat.ts`); con la fase de
 * referencia se mueven el corazón (su pose, `computeHeartPose`) y el pulmón de alrededor (la fracción expulsada): laten juntos. Va
 * en el chunk del corazón (`app/cardiacRuntime.ts`): las tablas pesan ≈ 15 kB.
 */

/** El caso cuyo latido es la referencia. */
export const REFERENCE_CASE: CardiacCase = normalExcellentCase;

let reference: BeatTables | null = null;

/** Las tablas del latido de referencia (las del caso a su FC), construidas una vez. */
export function referenceBeat(): BeatTables {
  reference ??= buildBeatTables(
    60 / REFERENCE_CASE.rhythm.heartRateBpm,
    REFERENCE_CASE.physiology,
    REFERENCE_CASE.rhythm,
    REFERENCE_CASE.hemodynamics,
    { outflow: caseOutflow(REFERENCE_CASE) },
  );
  return reference;
}

/**
 * La fracción del volumen latido que el VI ha expulsado en la fase `phase` del latido de referencia: (VTD − V) / (VTD − VTS), 0 en
 * la telediástole y 1 en la telesístole (la `contraction` del estado de EchoTwin). La curva de volumen es la de EchoTwin: la
 * eyección, la relajación isovolumétrica, el llenado rápido (onda E), la diástasis y la contracción auricular (onda A).
 */
export function ejectedFraction(phase: number): number {
  const ref = referenceBeat();
  const v = sampleTable(ref.lvVolumeMl, phase);
  return (ref.edvMl - v) / Math.max(ref.edvMl - ref.esvMl, 1e-6);
}

/** Las fases de referencia que acotan la onda A y la eyección: su inicio, el inicio de la eyección, y la telesístole. */
interface AtrialWindow {
  /** Inicio de la onda A (fase): hasta aquí el llenado es el mismo con o sin contracción auricular. */
  readonly aStart: number;
  /** Inicio de la eyección (fase). */
  readonly ejectionStart: number;
  /** Telesístole (fase). */
  readonly endSystole: number;
  /** Primera fase de la eyección en que la fracción expulsada alcanza la del inicio de la onda A. */
  readonly matched: number;
}

let cachedWindow: AtrialWindow | null = null;

function atrialWindow(): AtrialWindow {
  if (cachedWindow) return cachedWindow;
  const ref = referenceBeat();
  const tm = ref.timings;
  const aStart = tm.aStartS / ref.rrS;
  const ejectionStart = tm.ejectionStartS / ref.rrS;
  const endSystole = ref.endSystoleS / ref.rrS;
  const target = ejectedFraction(aStart);
  // la fracción expulsada sube sin bajar de la apertura aórtica a la telesístole: la fase en que alcanza `target`, por bisección
  let lo = ejectionStart;
  let hi = endSystole;
  for (let i = 0; i < 50; i++) {
    const mid = 0.5 * (lo + hi);
    if (ejectedFraction(mid) < target) lo = mid;
    else hi = mid;
  }
  return (cachedWindow = { aStart, ejectionStart, endSystole, matched: hi });
}

/**
 * La fase de referencia que lee un latido sin contracción auricular (decisión 53): la misma curva de EchoTwin sin la onda A.
 * Sin ella el ventrículo llega al final de la diástole con el volumen que tenía al empezar la onda A (la fracción expulsada de ese
 * instante, ≈ 0,26, en vez de 0) y expulsa desde ahí hasta el mismo volumen sistólico final: hasta el inicio de la onda A la fase
 * es la misma; de ahí hasta el inicio de la eyección (la onda A y la contracción isovolumétrica) se queda en el inicio de la onda
 * A (nada se llena, la válvula mitral no se reabre); y la eyección recorre la parte de la curva que va de esa fracción a la
 * telesístole en el mismo tiempo. Continua en la fracción expulsada (en el volumen del VI y en el pulso pulmonar), no en la
 * pose de las válvulas: la línea de tiempo horneada es la del latido sinusal, y al empezar la eyección salta de la pose del
 * inicio de la onda A a la de la fase en que esa fracción se alcanza, con la válvula aórtica ya abierta (un cuadro por latido).
 */
export function withoutAtrialKick(phase: number): number {
  const w = atrialWindow();
  if (phase >= w.endSystole && phase < w.aStart) return phase;
  if (phase >= w.aStart || phase < w.ejectionStart) return w.aStart;
  return w.matched + ((phase - w.ejectionStart) * (w.endSystole - w.matched)) / (w.endSystole - w.ejectionStart);
}

/** El latido de EchoTwin para el reloj (`registerBeatModel`). */
export function echoTwinBeatModel(): BeatModel {
  const ref = referenceBeat();
  return { endSystoleS: ref.endSystoleS, rrS: ref.rrS, ejectedFraction, withoutAtrialKick };
}
