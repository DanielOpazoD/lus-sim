import { defineParameters } from '../core/evidence';

/**
 * Las manos del avatar (lus-sim, decisión 42): las del paciente, que la regla de las manos de Lichtenstein pone sobre su tórax para
 * situar los puntos BLUE (`app/blueHands.ts`; `docs/knowledge/clinical.md` §3.1). El adulto promedio de la base es un varón de
 * IMC ≈ 23 (`docs/knowledge/anatomy.md` §2.1).
 */
export const HANDS = defineParameters('anatomy.hands', {
  middleFingerLengthMm: {
    value: 83.8,
    unit: 'mm',
    range: [78.4, 89.2],
    evidence: 'documentado',
    sources: ['greiner-mano-1991'],
    note:
      'Largo del dedo medio, del pliegue basal (la inserción palmar del dedo) a la punta: 83,8 ± 5,4 mm en 1003 varones (Greiner, ' +
      'muestra de ANSUR 1988; sin subgrupo por IMC). El rango, ± 1 DE. En la regla, la distancia de la línea media al punto BLUE ' +
      'superior (la inserción palmar de los dedos 3.º y 4.º)',
  },
  palmLengthMm: {
    value: 110.5,
    unit: 'mm',
    range: [104.5, 116.5],
    evidence: 'documentado',
    sources: ['greiner-mano-1991'],
    note:
      'Largo de la palma, del pliegue de la muñeca a la base del dedo medio: 110,5 ± 6,0 mm en 1003 varones (Greiner). El rango, ± 1 ' +
      'DE. En ANSUR II la palma se mide desde la estiloides radial (115,5 ± 6,2 con IMC 18,5–25): otro reparo, más largo. En la ' +
      'regla, el centro de la palma de la mano de abajo (el punto BLUE inferior) a medio largo de ella',
  },
  handBreadthMm: {
    value: 86.3,
    unit: 'mm',
    range: [82.2, 90.4],
    evidence: 'derivado',
    sources: ['gordon-ansur-2014', 'greiner-mano-1991'],
    note:
      'Ancho de la mano sin el pulgar, entre las articulaciones metacarpofalángicas 2.ª y 5.ª: 86,3 ± 4,1 mm en los varones de ANSUR ' +
      'II con IMC 18,5–25 (n 1061, IMC medio 22,9, el del avatar) [DERIVADO: de los datos públicos de la encuesta, ' +
      '`tools/anatomy/ansurSubgroup.ts`]; 88,3 ± 4,4 en ' +
      'todos (n 4082, el informe). Greiner, en ANSUR 1988: 90,4 ± 4,2. El rango, ± 1 DE. En la regla, la altura de cada mano: el ' +
      'punto superior a medio ancho bajo la clavícula, el inferior a uno y medio y la línea frénica a dos',
  },
});
