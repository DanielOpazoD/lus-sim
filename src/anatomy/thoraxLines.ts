import { defineParameters } from '../core/evidence';
import type { Torso } from './primitives';

/**
 * Líneas craneocaudales del tórax (lus-sim, decisión 16): dónde caen en la piel del tronco elíptico las líneas de
 * referencia de la exploración y de la anatomía de superficie (Gray: «Surface Markings of the Thorax»). Las usan la
 * parrilla costal (`organs/ribcage.ts`: los anchos de los espacios intercostales se dan por línea), los puntos de
 * partida y las pruebas de las metas A. Cada línea es un ángulo del tronco φ (0 = izquierda del paciente, π/2 =
 * anterior, π = derecha) en el hemitórax derecho; la del izquierdo es su simétrica (π − φ).
 */
export const THORAX_LINES = defineParameters('anatomy.thoraxLines', {
  midclavicularXMm: {
    value: 95,
    unit: 'mm',
    range: [90, 100],
    evidence: 'derivado',
    sources: ['gray-anatomia-1918'],
    note:
      'Distancia a la línea media de la línea medioclavicular en la piel: Gray la iguala a la mamaria («the mammary, or, better ' +
      'midclavicular») y pone el pezón del varón en el 4.º espacio intercostal «about 9 or 10 cm from the middle line» ' +
      '(«Surface Anatomy of the Thorax», «Surface Markings of the Thorax»): 9,5 cm',
  },
  parasternalXMm: {
    value: 54.5,
    unit: 'mm',
    range: [50, 60],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Línea paraesternal de Gray, «midway between the lateral sternal and the mammary» («Surface Markings of the Thorax»): ' +
      '(14 + 95)/2, con el semiancho del cuerpo del esternón (`anatomy.ribcage.sternumBodyHalfWidthMm`, estimado: hereda su ' +
      'evidencia) y la medioclavicular',
  },
  anteriorAxillaryPhi: {
    value: 0.875 * Math.PI,
    unit: 'rad',
    range: [0.83 * Math.PI, 0.92 * Math.PI],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Axilar anterior, desde el pliegue axilar anterior (Gray): ningún texto de la base la sitúa en un tronco elíptico. Se ' +
      'toma a 22,5° de la axilar media (≈ 42 mm de piel por delante), como los puntos de partida del paso B2a. Calibrar con ' +
      'antropometría del pliegue axilar',
  },
  midaxillaryPhi: {
    value: Math.PI,
    unit: 'rad',
    range: [0.95 * Math.PI, 1.05 * Math.PI],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Axilar media, «downward from the apex of the axilla» (Gray): el vértice de la axila en el plano coronal medio del ' +
      'tronco, su polo lateral',
  },
  posteriorAxillaryPhi: {
    value: 1.125 * Math.PI,
    unit: 'rad',
    range: [1.08 * Math.PI, 1.17 * Math.PI],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note: 'Axilar posterior, desde el pliegue axilar posterior (Gray): la simétrica de la anterior respecto de la media',
  },
  paravertebralXMm: {
    value: 60,
    unit: 'mm',
    range: [50, 60],
    evidence: 'estimado',
    sources: ['yoshida-intercostales-2019'],
    note:
      'Línea posterior de medida: a 50–60 mm de las apófisis espinosas, donde Yoshida y cols. midieron los intercostales ' +
      'posteriores (Tabla 2, documentado); el extremo lateral es una elección de diseño, para que la sonda, que mira por la ' +
      'normal de la piel, corte las costillas por fuera de su articulación con la apófisis transversa. Por ella pasan las 12: ' +
      'la línea de las cuentas por hemitórax',
  },
});

/**
 * La línea escapular (lus-sim, cobertura torácica): la vertical por el ángulo inferior de la escápula con los brazos a los
 * lados, entre la axilar posterior y la paravertebral. Es una línea de la exploración posterior (`docs/MISSION.md`, requisito
 * de cobertura); la parrilla y la pared no la usan como estación.
 */
export const SCAPULAR_LINE = defineParameters('anatomy.scapularLine', {
  scapularXMm: {
    value: 85,
    unit: 'mm',
    range: [77, 95],
    evidence: 'derivado',
    sources: ['moon-escapula-2026', 'pontin-escapula-2013', 'gray-anatomia-1918'],
    note:
      'La línea escapular pasa por el ángulo inferior de la escápula (Gray). Su distancia a la apófisis espinosa de T7 con los ' +
      'brazos a los lados (prueba de deslizamiento lateral, posición 1): 88,5 ± 6,1 mm del lado dominante y 82,5 ± 5,0 del no ' +
      'dominante en el grupo sin discinesia (Moon y Kim, 31 de 83 oficinistas con cervicalgia, tablas 4–5): la media, 85; el ' +
      'rango, ±1,5 DE. Coherente con el ángulo superior a 9,1 ± 1,1 cm de la línea media (Pontin, 30 sanos, tabla 5): el borde ' +
      'medial es casi vertical. La población no es la del avatar (sin datos de varones sanos con medias)',
  },
});

/** Una línea del tórax por nombre. */
export type ThoraxLine =
  'parasternal' | 'midclavicular' | 'anteriorAxillary' | 'midaxillary' | 'posteriorAxillary' | 'scapular' | 'paravertebral';

export const THORAX_LINE_NAMES: readonly ThoraxLine[] = [
  'parasternal',
  'midclavicular',
  'anteriorAxillary',
  'midaxillary',
  'posteriorAxillary',
  'scapular',
  'paravertebral',
];

/**
 * Ángulo del tronco φ de la línea en el hemitórax derecho (`side` = −1, x < 0) o izquierdo (+1). Las líneas dadas por su
 * distancia a la línea media (paraesternal, medioclavicular: por delante; paravertebral: por detrás) salen de la elipse
 * de la piel, x = a·cos φ.
 */
export function thoraxLinePhi(line: ThoraxLine, torso: Pick<Torso, 'a'>, side: -1 | 1 = -1): number {
  const P = THORAX_LINES.params;
  let right: number;
  switch (line) {
    case 'parasternal':
      right = Math.PI - Math.acos(P.parasternalXMm.value / torso.a);
      break;
    case 'midclavicular':
      right = Math.PI - Math.acos(P.midclavicularXMm.value / torso.a);
      break;
    case 'anteriorAxillary':
      right = P.anteriorAxillaryPhi.value;
      break;
    case 'midaxillary':
      right = P.midaxillaryPhi.value;
      break;
    case 'posteriorAxillary':
      right = P.posteriorAxillaryPhi.value;
      break;
    case 'scapular':
      right = Math.PI + Math.acos(SCAPULAR_LINE.params.scapularXMm.value / torso.a);
      break;
    case 'paravertebral':
      right = Math.PI + Math.acos(P.paravertebralXMm.value / torso.a);
      break;
  }
  return side < 0 ? right : Math.PI - right;
}
