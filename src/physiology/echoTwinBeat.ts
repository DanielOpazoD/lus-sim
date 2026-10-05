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

/** El latido de EchoTwin para el reloj (`registerBeatModel`). */
export function echoTwinBeatModel(): BeatModel {
  const ref = referenceBeat();
  return { endSystoleS: ref.endSystoleS, rrS: ref.rrS, ejectedFraction };
}
