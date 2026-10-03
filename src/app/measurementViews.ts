import { defineParameters } from '../core/evidence';
import type { ProbePose } from '../probe/probe';

/**
 * Las vistas de medida (lus-sim, decisión 42): las poses donde miden el banco de fidelidad (decisión 21), la calibración del
 * contraste (decisiones 24 y 35), la sombra costal en la envolvente (F-T08), las líneas A (F-T01), el mapa de grises (decisión 31),
 * el pulso pulmonar y las paridades de la GPU. **No son los puntos clínicos** (`START_POINTS`, las tarjetas): coinciden con los
 * puntos BLUE superior, inferior y PLAPS derechos de antes de la regla de las manos (decisiones 10, 12, 16 y 36) y se conservan
 * así porque sobre ellas están medidos el historial del banco (21), la calibración del contraste (24 y 35) y el detector del
 * sector (36): moverlas con los puntos clínicos cambiaría lo que esas decisiones midieron. Marcador craneal (corte longitudinal),
 * el del signo del murciélago.
 */
export type MeasurementViewId = 'blueUpper' | 'blueLower' | 'plaps';

export interface MeasurementView {
  id: MeasurementViewId;
  phi: number;
  z: number;
  yaw: number;
}

export const MEASUREMENT_VIEW_POSES = defineParameters('app.measurementViews', {
  blueUpperPhi: {
    value: Math.PI - Math.acos(95 / 160),
    unit: 'rad',
    range: [0.65 * Math.PI, 0.8 * Math.PI],
    evidence: 'estimado',
    sources: ['lichtenstein-bluepoints-2011', 'gray-anatomia-1918'],
    note:
      'La vista de medida del BLUE superior (decisión 42): la línea medioclavicular derecha (decisión 16, ' +
      '`anatomy.thoraxLines.midclavicularXMm`), 95 mm de la línea media en la piel del tronco de 160 mm de semiancho, φ = π − ' +
      'acos(95/160) = 0,702π; la pose por omisión de la sonda de las decisiones 10–41, y el sitio de la meta A-T1',
  },
  blueUpperZ: {
    value: 83.7,
    unit: 'mm',
    range: [53.7, 124.7],
    evidence: 'estimado',
    sources: ['lichtenstein-bluepoints-2011', 'seong-espaciosic-2020'],
    note:
      'El centro del EIC2 de la medioclavicular con la parrilla del adulto promedio (decisión 16): la 2.ª costilla a 99,7 mm y la ' +
      '3.ª a 67,7 (el EIC2 de 18 mm de la base). El rango va del centro del EIC3 (53,7) al del EIC1 (124,7)',
  },
  blueLowerPhi: {
    value: 0.875 * Math.PI,
    unit: 'rad',
    range: [0.83 * Math.PI, 0.92 * Math.PI],
    evidence: 'estimado',
    sources: ['lichtenstein-bluepoints-2011', 'yuriditsky-ecocardiografistas-2021'],
    note:
      'La línea axilar anterior (`anatomy.thoraxLines.anteriorAxillaryPhi`, decisión 16): el punto BLUE inferior de los reparos de ' +
      'Yuriditsky y cols. («en la axilar anterior, justo por encima del pezón»), el de antes de la regla de las manos (decisión 42)',
  },
  blueLowerZ: {
    value: 49.5,
    unit: 'mm',
    range: [20.1, 78.3],
    evidence: 'estimado',
    sources: ['lichtenstein-bluepoints-2011', 'yuriditsky-ecocardiografistas-2021', 'gray-anatomia-1918'],
    note:
      'El centro del EIC4 de la axilar anterior (el pezón en el 4.º EIC, Gray) en la parrilla del adulto promedio: la 4.ª costilla a ' +
      '63,9 mm y la 5.ª a 35,0 (centro 49,46; decisión 36). El rango, del centro del EIC5 (20,1) al del EIC3 (78,3) en esa línea',
  },
  plapsPhi: {
    value: 1.15 * Math.PI,
    unit: 'rad',
    range: [1.125 * Math.PI, 1.2 * Math.PI],
    evidence: 'estimado',
    sources: ['lichtenstein-bluepoints-2011', 'yuriditsky-ecocardiografistas-2021'],
    note:
      'Por detrás de la axilar posterior, «tan posterior como se pueda» en supino: la axilar posterior simétrica de la anterior ' +
      'respecto de la media (1,125π) y el tope de `clampPose` (1,2π); su altura, la del BLUE inferior de la vista',
  },
});

const V = MEASUREMENT_VIEW_POSES.params;

/** Las tres vistas de medida, en el orden de siempre. */
export const MEASUREMENT_VIEWS: readonly MeasurementView[] = [
  { id: 'blueUpper', phi: V.blueUpperPhi.value, z: V.blueUpperZ.value, yaw: 0 },
  { id: 'blueLower', phi: V.blueLowerPhi.value, z: V.blueLowerZ.value, yaw: 0 },
  { id: 'plaps', phi: V.plapsPhi.value, z: V.blueLowerZ.value, yaw: 0 },
];

/** La pose de la vista de medida `id` (sin despegar ni bascular). */
export function measurementViewPose(id: MeasurementViewId): ProbePose {
  const v = MEASUREMENT_VIEWS.find((x) => x.id === id);
  if (!v) throw new RangeError(`measurementViewPose: no hay vista de medida «${id}»`);
  return { phi: v.phi, z: v.z, lift: 0, yaw: v.yaw, rock: 0, tilt: 0 };
}
