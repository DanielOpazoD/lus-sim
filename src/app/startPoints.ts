import { defineParameters } from '../core/evidence';
import { TORSO } from '../anatomy/scene';
import { THORAX_LINES } from '../anatomy/thoraxLines';
import { BLUE_UPPER_POSE, type PatientPosition } from '../probe/probe';

/**
 * «Puntos de partida» (decisión 17 de VExUS): posiciones cutáneas con ángulos casi neutros hacia las que la sonda
 * se DESLIZA; la ventana hay que afinarla (guía §7: dejan la sonda cerca, no en la imagen perfecta). Los consumen la
 * consola (botones), los ganchos de prueba y el barrido de equivalencia.
 * φ en el marco anatómico (0 = izquierda del paciente, π/2 = anterior, π = derecha), z en mm (0 en la unión xifoesternal).
 *
 * lus-sim (decisión 12): los puntos del protocolo BLUE del hemitórax derecho [@lichtenstein-bluepoints-2011] en
 * lugar de las ventanas abdominales de VExUS, aproximados sobre la escena heredada; desde la decisión 16, sobre la
 * parrilla del adulto promedio y las líneas de `anatomy/thoraxLines.ts`. Ninguna fuente mapea los puntos
 * BLUE a un espacio intercostal ni a una línea (`docs/knowledge/anatomy.md` §4, NO ENCONTRADO): el superior es la
 * pose del paso A (`BLUE_UPPER_POSE`) y el inferior y el PLAPS se estiman con los reparos simplificados de Yuriditsky
 * y cols. (`docs/knowledge/clinical.md` §3.1), con su rango en `docs/APPROXIMATIONS.md`. Marcador craneal (yaw 0):
 * corte longitudinal, el del signo del murciélago.
 */
export interface StartPoint {
  id: 'blueUpper' | 'blueLower' | 'plaps' | 'posteriorUpper' | 'posteriorMiddle' | 'posteriorBasal';
  label: string;
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
 * Poses estimadas del punto BLUE inferior y del PLAPS derechos (decisión 12). Números nuevos, con su evidencia.
 */
export const START_POINT_POSES = defineParameters('app.startPointPoses', {
  blueLowerPhi: {
    value: 0.875 * Math.PI,
    unit: 'rad',
    range: [0.83 * Math.PI, 0.92 * Math.PI],
    evidence: 'estimado',
    sources: ['lichtenstein-bluepoints-2011', 'yuriditsky-ecocardiografistas-2021'],
    note:
      'Línea axilar anterior (Yuriditsky y cols.: el punto inferior en la axilar anterior, justo por encima del pezón), la de ' +
      '`anatomy.thoraxLines.anteriorAxillaryPhi` (decisión 16). Calibrar con la regla de las manos',
  },
  blueLowerZ: {
    value: 49.5,
    unit: 'mm',
    range: [20.1, 78.3],
    evidence: 'estimado',
    sources: ['lichtenstein-bluepoints-2011', 'yuriditsky-ecocardiografistas-2021', 'gray-anatomia-1918'],
    note:
      'En el centro del EIC4 de la axilar anterior («justo por encima del pezón», Yuriditsky y cols.; el pezón en el 4.º EIC, ' +
      'Gray) con la parrilla del adulto promedio (decisión 16): con el tronco de la decisión 28 y la espalda de la 29, la 4.ª ' +
      'costilla a 63,9 mm y la 5.ª a 35,0 (`intercostalZ`: centro 49,46). Entre las decisiones 28 y 39 estuvo en 51,3, 1,8 mm ' +
      'por encima del centro, porque en el centro la sombra de una costilla tapaba el borde derecho del sector y el detector del ' +
      'banco de fidelidad la tomaba por él; con el detector de la decisión 36 vuelve al centro. El rango va del centro del EIC5 ' +
      '(20,1) al del EIC3 (78,3) en esa línea: sin antropometría de la mano no se sabe en qué espacio cae la palma ' +
      '(`docs/knowledge/anatomy.md` §4)',
  },
  plapsPhi: {
    value: 1.15 * Math.PI,
    unit: 'rad',
    range: [1.125 * Math.PI, 1.2 * Math.PI],
    evidence: 'estimado',
    sources: ['lichtenstein-bluepoints-2011', 'yuriditsky-ecocardiografistas-2021'],
    note:
      'Por detrás de la axilar posterior, «tan posterior como se pueda» en supino: la axilar posterior se toma simétrica ' +
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

/** Poses de los puntos de partida pulmonares. */
export const START_POINTS: readonly StartPoint[] = [
  {
    id: 'blueUpper',
    label: 'BLUE superior',
    phi: BLUE_UPPER_POSE.params.phi.value,
    z: BLUE_UPPER_POSE.params.z.value,
    yaw: 0,
    hint:
      'Punto BLUE superior derecho aproximado (línea medioclavicular, 2.º espacio intercostal), marcador craneal: corte ' +
      'longitudinal que cruza las costillas y el espacio intercostal entre ellas.',
  },
  {
    id: 'blueLower',
    label: 'BLUE inferior',
    phi: START_POINT_POSES.params.blueLowerPhi.value,
    z: START_POINT_POSES.params.blueLowerZ.value,
    yaw: 0,
    hint:
      'Punto BLUE inferior derecho aproximado (línea axilar anterior, justo por encima del pezón), marcador craneal: corte ' +
      'longitudinal que cruza las costillas y el espacio intercostal entre ellas.',
  },
  {
    id: 'plaps',
    label: 'PLAPS',
    phi: START_POINT_POSES.params.plapsPhi.value,
    z: START_POINT_POSES.params.blueLowerZ.value,
    yaw: 0,
    hint:
      'Punto PLAPS derecho aproximado: la continuación horizontal del punto BLUE inferior, tan posterior como se pueda por ' +
      'detrás de la línea axilar posterior en supino; es donde se buscan las consolidaciones y los derrames posteriores.',
  },
  {
    id: 'posteriorUpper',
    label: 'Paravertebral superior',
    position: 'sitting',
    phi: PARAVERTEBRAL_RIGHT_PHI,
    z: POSTERIOR_START_POSES.params.upperZ.value,
    yaw: 0,
    hint:
      'Paciente sentado. Línea paravertebral derecha a la altura de la espina de la escápula (3.er espacio intercostal), ' +
      'marcador craneal: entre la columna y el borde medial de la escápula.',
  },
  {
    id: 'posteriorMiddle',
    label: 'Paravertebral media',
    position: 'sitting',
    phi: PARAVERTEBRAL_RIGHT_PHI,
    z: POSTERIOR_START_POSES.params.middleZ.value,
    yaw: 0,
    hint:
      'Paciente sentado. Línea paravertebral derecha a la altura del ángulo inferior de la escápula (el 8.º espacio ' +
      'intercostal, el más próximo), marcador craneal.',
  },
  {
    id: 'posteriorBasal',
    label: 'Paravertebral basal',
    position: 'sitting',
    phi: PARAVERTEBRAL_RIGHT_PHI,
    z: POSTERIOR_START_POSES.params.basalZ.value,
    yaw: 0,
    hint:
      'Paciente sentado. Línea paravertebral derecha sobre la base del pulmón (10.º espacio intercostal), marcador craneal: al ' +
      'inspirar, el pulmón baja como una cortina por el lado caudal de la imagen (el opuesto al marcador).',
  },
];
