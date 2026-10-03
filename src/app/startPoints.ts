import { defineParameters } from '../core/evidence';
import { TORSO } from '../anatomy/scene';
import { THORAX_LINES } from '../anatomy/thoraxLines';
import type { PatientPosition } from '../probe/probe';

/**
 * «Puntos de partida» (decisión 17 de VExUS): posiciones cutáneas con ángulos casi neutros hacia las que la sonda
 * se DESLIZA; la ventana hay que afinarla (guía §7: dejan la sonda cerca, no en la imagen perfecta). Los consumen la
 * consola (botones), los ganchos de prueba y el barrido de equivalencia.
 * φ en el marco anatómico (0 = izquierda del paciente, π/2 = anterior, π = derecha), z en mm (0 en la unión xifoesternal).
 *
 * lus-sim (decisión 12): los puntos del protocolo BLUE [@lichtenstein-bluepoints-2011] en lugar de las ventanas abdominales de
 * VExUS; desde la decisión 42, situados con la regla de las manos de Lichtenstein sobre el avatar (`app/blueHands.ts`, las manos de
 * `anatomy/hands.ts`): el superior, el inferior, el frénico y el PLAPS, en los dos hemitórax, y las tres áreas paravertebrales de
 * la espalda (decisión 33), también en los dos. Ninguna fuente mide en qué espacio intercostal caen (`docs/knowledge/anatomy.md`
 * §4, NO ENCONTRADO): lo da la parrilla del modelo bajo las manos. Marcador craneal (yaw 0): corte longitudinal, el del signo del
 * murciélago. Son los puntos clínicos (las tarjetas): el banco y las metas físicas miden en otras poses, las vistas de medida
 * (`app/measurementViews.ts`), que conservan los puntos de antes de la regla.
 */
type RightId = 'blueUpper' | 'blueLower' | 'phrenic' | 'plaps' | 'posteriorUpper' | 'posteriorMiddle' | 'posteriorBasal';
/** Los ids: los del hemitórax derecho (los de siempre) y sus simétricos izquierdos, con el sufijo `Left` (decisión 42). */
export type StartPointId = RightId | `${RightId}Left`;

export interface StartPoint {
  id: StartPointId;
  label: string;
  /** El hemitórax (decisión 42): las tarjetas se agrupan por lado. */
  side: 'right' | 'left';
  /**
   * La posición del paciente en la que se explora (lus-sim, decisión 33): los de la espalda, sentado (ir a ellos sienta al
   * paciente); los demás, en cualquiera (sin el campo).
   */
  position?: PatientPosition;
  phi: number;
  z: number;
  yaw: number;
  /** Basculación dentro del plano (talón-punta), + = haz hacia la cabeza. */
  rock?: number;
  /** Inclinación fuera del plano (abanicar). */
  tilt?: number;
  hint: string;
}

/**
 * Los puntos BLUE del hemitórax derecho con la regla de las manos sobre el avatar (lus-sim, decisión 42): los valores de
 * `blueHandPoints` (`app/blueHands.ts`) con las manos de `anatomy.hands`, la clavícula y el tronco del avatar, redondeados;
 * `startPoints.test.ts` los vuelve a construir. Los rangos, con las manos a ± 1 DE (el largo del dedo, el de la palma y el ancho,
 * en todas sus combinaciones). Los del izquierdo son sus simétricos (φ → π − φ).
 */
const HANDS_SOURCES = ['lichtenstein-bluepoints-2011', 'lichtenstein-libro-2016', 'greiner-mano-1991', 'gordon-ansur-2014'];
export const START_POINT_POSES = defineParameters('app.startPointPoses', {
  blueUpperPhi: {
    value: 0.6706 * Math.PI,
    unit: 'rad',
    range: [0.6592 * Math.PI, 0.6822 * Math.PI],
    evidence: 'derivado',
    sources: HANDS_SOURCES,
    note:
      'La inserción palmar de los dedos medio y anular de la mano de arriba (Lichtenstein 2011 y 2016): a un largo de dedo medio ' +
      '(83,8 mm, Greiner) de la línea media por la piel, entre la paraesternal y la medioclavicular. Antes (decisión 10), la ' +
      'medioclavicular (0,702π) [SUPUESTO]',
  },
  blueUpperZ: {
    value: 122.3,
    unit: 'mm',
    range: [119.7, 124.9],
    evidence: 'derivado',
    sources: HANDS_SOURCES,
    note:
      'A medio ancho de la mano (86,3 mm, ANSUR II con IMC 18,5–25) bajo su borde de arriba, la recta del borde inferior de la ' +
      'clavícula (que sube 15 mm en sus 156, `anatomy.clavicle`): en el EIC1 de la parrilla del modelo (la 1.ª costilla a 147,8 mm y ' +
      'la 2.ª a 99,3 en esa línea; centro 123,6). [DISCREPANCIA] con los reparos sin medida de Yuriditsky y cols. y otros (2.º–3.er ' +
      'EIC en la medioclavicular). Antes, el centro del EIC2 de la medioclavicular, 83,7 [SUPUESTO]',
  },
  blueLowerPhi: {
    value: 0.7955 * Math.PI,
    unit: 'rad',
    range: [0.7755 * Math.PI, 0.8161 * Math.PI],
    evidence: 'derivado',
    sources: HANDS_SOURCES,
    note:
      'El centro de la palma de la mano de abajo: un largo de dedo más media palma (83,8 + 110,5/2 = 139,1 mm, Greiner) de la ' +
      'línea media por la piel, entre la medioclavicular y la axilar anterior («cerca del pezón», Lichtenstein 2016; el pezón a 9–10 ' +
      'cm de la línea media, Gray). Antes, la axilar anterior (0,875π, los reparos de Yuriditsky y cols.)',
  },
  blueLowerZ: {
    value: 28.0,
    unit: 'mm',
    range: [21.8, 34.1],
    evidence: 'derivado',
    sources: HANDS_SOURCES,
    note:
      'A uno y medio anchos de mano bajo el borde de arriba de la mano superior en la línea media (la mano de abajo, horizontal, ' +
      'toca la de arriba en las puntas de los dedos [SUPUESTO]): en el EIC4 de la parrilla, 5 mm sobre la 5.ª costilla (la 4.ª a ' +
      '51,4 mm y la 5.ª a 22,8 en esa línea). Antes (decisión 36), el centro del EIC4 de la axilar anterior, 49,5, por los reparos ' +
      'de Yuriditsky y cols. («justo por encima del pezón»)',
  },
  phrenicZ: {
    value: -15.2,
    unit: 'mm',
    range: [-23.4, -7.0],
    evidence: 'derivado',
    sources: HANDS_SOURCES,
    note:
      'La línea frénica, el borde inferior de la mano de abajo (dos anchos de mano bajo el borde de arriba de la superior), en la ' +
      'axilar media (el punto frénico, Lichtenstein 2011 y 2016): en el EIC7 de la parrilla (la 7.ª costilla a −3,2 mm y la 8.ª a ' +
      '−34,2), 19 mm sobre el borde del pulmón en espiración (A-T13, −34): la sonda ve el pulmón y, en su lado caudal, el borde. ' +
      'Que la línea frénica marque el fin del pulmón no siempre se cumple (Ding y cols. 2015, solo el resumen: difería del ' +
      'diafragma en el 47,5 % de los hemitórax)',
  },
  plapsPhi: {
    value: 1.15 * Math.PI,
    unit: 'rad',
    range: [1.125 * Math.PI, 1.2 * Math.PI],
    evidence: 'estimado',
    sources: ['lichtenstein-bluepoints-2011', 'lichtenstein-breathe-2017'],
    note:
      'Por detrás de la axilar posterior, «tan posterior como se pueda» en supino (2011, 2017); su altura, la del BLUE inferior: la axilar posterior se toma simétrica ' +
      'de la anterior respecto de la media (1,125π) y el límite es el de `clampPose` (1,2π, el apoyo en la cama)',
  },
});

/**
 * Los puntos de partida de la espalda (lus-sim, decisión 33): las tres áreas paravertebrales derechas del esquema de 14 de
 * Soldati y cols. (paciente sentado; «basal, por encima del signo de la cortina; media, el ángulo inferior de la escápula;
 * superior, la espina de la escápula», `docs/knowledge/clinical.md` §3.5), en el centro del espacio intercostal de la paravertebral
 * (a 60 mm de la línea media, `anatomy.thoraxLines.paravertebralXMm`) que cae a esa altura en la parrilla del adulto promedio.
 */
export const POSTERIOR_START_POSES = defineParameters('app.posteriorStartPoses', {
  upperZ: {
    value: 138.5,
    unit: 'mm',
    range: [126.6, 150.3],
    evidence: 'derivado',
    sources: ['soldati-covid-2020', 'gray-anatomia-1918'],
    note:
      'Área superior de Soldati, a la altura de la espina de la escápula: su raíz, a la de la punta de la apófisis de T3 (Gray; ' +
      '`anatomy.scapula.spineRootSpinous`, z 151,7), que en la paravertebral cae sobre la 3.ª costilla; el espacio de debajo, el ' +
      'EIC3 (su centro, 138,5 en la parrilla; el de arriba, el EIC2, se acerca al vértice). El rango, entre los centros de la 3.ª y ' +
      'la 4.ª costilla',
  },
  middleZ: {
    value: 18.4,
    unit: 'mm',
    range: [6.1, 30.7],
    evidence: 'derivado',
    sources: ['soldati-covid-2020', 'cooperstein-escapula-2015'],
    note:
      'Área media de Soldati, a la altura del ángulo inferior de la escápula: la punta de la apófisis de T8 (Cooperstein; ' +
      '`anatomy.scapula.inferiorAngleSpinous`, z 11,7), que en la paravertebral cae sobre el borde superior de la 9.ª costilla; ' +
      'el espacio más próximo, el EIC8 (su centro, 18,4). El rango, entre los centros de la 8.ª y la 9.ª costilla',
  },
  basalZ: {
    value: -30.8,
    unit: 'mm',
    range: [-43.1, -18.5],
    evidence: 'derivado',
    sources: ['soldati-covid-2020', 'gray-anatomia-1918'],
    note:
      'Área basal de Soldati, «por encima del signo de la cortina»: el borde posterior del pulmón en espiración, la punta de la ' +
      'apófisis de T10 (Gray; `anatomy.lungBorder.borderPosteriorVertebra`, z −35), y el espacio que lo tiene debajo, el EIC10 (su ' +
      'centro, −30,8): al inspirar, la cortina baja por el lado caudal del sector. El rango, entre los centros de la 10.ª y ' +
      'la 11.ª costilla',
  },
});

/** φ de la paravertebral derecha (la de `thoraxLinePhi`, con el tronco del modelo). */
const PARAVERTEBRAL_RIGHT_PHI = Math.PI + Math.acos(THORAX_LINES.params.paravertebralXMm.value / TORSO.params.semiWidthMm.value);

const P = START_POINT_POSES.params;
const PP = POSTERIOR_START_POSES.params;

/** Los puntos del hemitórax derecho, en el orden de las tarjetas. */
const RIGHT: readonly Omit<StartPoint, 'side'>[] = [
  {
    id: 'blueUpper',
    label: 'BLUE superior',
    phi: P.blueUpperPhi.value,
    z: P.blueUpperZ.value,
    yaw: 0,
    hint:
      'Punto BLUE superior: con las dos manos del paciente sin los pulgares, la de arriba con el meñique bajo la clavícula y las ' +
      'puntas de los dedos en la línea media, la raíz de los dedos medio y anular. Marcador craneal: corte longitudinal que cruza ' +
      'dos costillas y el espacio intercostal entre ellas.',
  },
  {
    id: 'blueLower',
    label: 'BLUE inferior',
    phi: P.blueLowerPhi.value,
    z: P.blueLowerZ.value,
    yaw: 0,
    hint:
      'Punto BLUE inferior: el centro de la palma de la mano de abajo, justo bajo la de arriba (cerca del pezón). Marcador ' +
      'craneal: corte longitudinal que cruza dos costillas y el espacio intercostal entre ellas.',
  },
  {
    id: 'phrenic',
    label: 'Frénico',
    phi: THORAX_LINES.params.midaxillaryPhi.value,
    z: P.phrenicZ.value,
    yaw: 0,
    hint:
      'Punto frénico: la línea frénica (el borde inferior de la mano de abajo, donde suele acabar el pulmón) en la línea axilar ' +
      'media. Marcador craneal: el pulmón en el lado craneal y, en el caudal, su borde, que baja como una cortina al inspirar.',
  },
  {
    id: 'plaps',
    label: 'PLAPS',
    phi: P.plapsPhi.value,
    z: P.blueLowerZ.value,
    yaw: 0,
    hint:
      'Punto PLAPS: la horizontal del BLUE inferior, tan posterior como se pueda por detrás de la línea axilar posterior en ' +
      'supino; es donde se buscan las consolidaciones y los derrames posteriores.',
  },
  {
    id: 'posteriorUpper',
    label: 'Paravertebral superior',
    position: 'sitting',
    phi: PARAVERTEBRAL_RIGHT_PHI,
    z: PP.upperZ.value,
    yaw: 0,
    hint:
      'Paciente sentado. Línea paravertebral a la altura de la espina de la escápula (3.er espacio intercostal), marcador ' +
      'craneal: entre la columna y el borde medial de la escápula.',
  },
  {
    id: 'posteriorMiddle',
    label: 'Paravertebral media',
    position: 'sitting',
    phi: PARAVERTEBRAL_RIGHT_PHI,
    z: PP.middleZ.value,
    yaw: 0,
    hint:
      'Paciente sentado. Línea paravertebral a la altura del ángulo inferior de la escápula (el 8.º espacio intercostal, el ' +
      'más próximo), marcador craneal.',
  },
  {
    id: 'posteriorBasal',
    label: 'Paravertebral basal',
    position: 'sitting',
    phi: PARAVERTEBRAL_RIGHT_PHI,
    z: PP.basalZ.value,
    yaw: 0,
    hint:
      'Paciente sentado. Línea paravertebral sobre la base del pulmón (10.º espacio intercostal), marcador craneal: al ' +
      'inspirar, el pulmón baja como una cortina por el lado caudal de la imagen (el opuesto al marcador).',
  },
];

/**
 * Poses de los puntos de partida pulmonares: los del hemitórax derecho y, desde la decisión 42, sus simétricos izquierdos
 * (φ → π − φ; en la espalda, sentado, la paravertebral izquierda). La anatomía no es simétrica (el corazón, la língula, la cúpula
 * izquierda más baja): lo que se ve en cada punto lo dice la prueba de cada lado.
 */
export const START_POINTS: readonly StartPoint[] = [
  ...RIGHT.map((sp) => ({ ...sp, side: 'right' as const })),
  ...RIGHT.map((sp) => ({
    ...sp,
    id: `${sp.id}Left` as StartPointId,
    side: 'left' as const,
    phi: Math.PI - sp.phi,
    hint: `Hemitórax izquierdo. ${sp.hint}`,
  })),
];
