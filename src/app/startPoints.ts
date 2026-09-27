import { defineParameters } from '../core/evidence';
import { BLUE_UPPER_POSE } from '../probe/probe';

/**
 * «Puntos de partida» (decisión 17 de VExUS): posiciones cutáneas con ángulos casi neutros hacia las que la sonda
 * se DESLIZA; la ventana hay que afinarla (guía §7: dejan la sonda cerca, no en la imagen perfecta). Los consumen la
 * consola (botones), los ganchos de prueba y el barrido de equivalencia.
 * φ en el marco anatómico (0 = izquierda del paciente, π/2 = anterior, π = derecha), z en mm (0 en el xifoides).
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
  id: 'blueUpper' | 'blueLower' | 'plaps';
  label: string;
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
    value: 50.6,
    unit: 'mm',
    range: [21.2, 79.4],
    evidence: 'estimado',
    sources: ['lichtenstein-bluepoints-2011', 'yuriditsky-ecocardiografistas-2021', 'gray-anatomia-1918'],
    note:
      'Centro del EIC4 en la axilar anterior («justo por encima del pezón», Yuriditsky y cols.; el pezón en el 4.º EIC, Gray) ' +
      'con la parrilla del adulto promedio (decisión 16): la 4.ª costilla a 65,0 mm y la 5.ª a 36,1. El rango va del centro ' +
      'del EIC5 (21,2) al del EIC3 (79,4) en esa línea: sin antropometría de la mano no se sabe en qué espacio cae la palma ' +
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
];
