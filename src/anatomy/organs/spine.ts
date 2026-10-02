import { defineParameters } from '../../core/evidence';
import type { Vec3 } from '../../core/vec3';
import type { Spine } from '../primitives';
import { RIBCAGE, spinousTipZ, vertebraZ } from './ribcage';

/**
 * La columna torácica por detrás (lus-sim, decisión 29: la cara posterior se explora sentado). La de VExUS es un cilindro (el
 * cuerpo vertebral) y una caja continua (el arco posterior, de las láminas a las puntas de las apófisis transversas, a 40 mm de
 * la línea media). Aquí las transversas acaban donde las pone la TAC (`transverseTipMm`) y, en la línea media, las apófisis
 * espinosas de T1–T12: una barra de la cara posterior del arco a su punta bajo la piel, que baja de la altura de su cuerpo a la
 * de su punta por la regla de los tres (`spinousTipZ`). Sin las transversas por nivel ni las láminas por separado
 * (`spine-arch-slab`).
 */
export const SPINE = defineParameters('anatomy.spine', {
  transverseTipMm: {
    value: 29.3,
    unit: 'mm',
    range: [26.8, 31.9],
    evidence: 'documentado',
    sources: ['li-intertransversa-2022'],
    note:
      'Punta de la apófisis transversa a la línea media: la distancia entre las dos puntas en T8, 58,65 ± 5,05 mm en la TAC 3D de ' +
      '20 voluntarios sanos de 25–55 años (Li y cols. 2022, texto completo; T9 57,55, T10 55,20), la mitad; el rango, ± 1 DE. ' +
      'Las costillas acaban 6 mm por fuera (`buildRibCage`). En VExUS, 40 [SUPUESTO]',
  },
  spinousTipDepthMm: {
    value: 11,
    unit: 'mm',
    range: [8, 15],
    evidence: 'derivado',
    sources: ['grunwald-columna-2024'],
    note:
      'De la piel a la punta de la apófisis espinosa en T5–T8: 15, 12, 10 y 8 mm (del centro del cuerpo a la piel, menos a la punta: ' +
      '71 − 56, 67 − 55, 65 − 55 y 66 − 58; TAC en supino de 20 pacientes de 54–88 años con escoliosis, el grupo leve; Grünwald y ' +
      'cols. 2024, tabla 1): la media. Una población lejos del avatar [débil]',
  },
  spinousRadiusMm: {
    value: 3,
    unit: 'mm',
    range: [2, 5],
    evidence: 'estimado',
    sources: [],
    note: 'Semigrosor de la apófisis espinosa [SUPUESTO: NO ENCONTRADO]: una barra de 6 mm',
  },
});

/** Las apófisis espinosas del tronco: la y de su punta (la piel de la espalda más `spinousTipDepthMm`) y su radio. */
export interface SpinousSpec {
  /** y (mm) de la punta: por detrás de la cara posterior del arco (`Spine.archY0`). */
  tipY: number;
  radius: number;
}

/** Margen (mm) desde el que la distancia a las apófisis espinosas es la cota de su franja (sin buscar el nivel). */
const SPINOUS_SEARCH_MM = 10;

/**
 * Distancia con signo (mm, euclídea) a las apófisis espinosas de T1–T12 (gemelo GLSL con el mismo nombre): barras de radio
 * `radius` de (x0, archY0, z del cuerpo) a (x0, tipY, z de la punta). Lejos, la distancia a la franja que las contiene (una cota
 * por debajo).
 */
export function spinousSd(m: Vec3, sp: Pick<Spine, 'x0' | 'archY0'>, s: SpinousSpec): number {
  const dx = m[0] - sp.x0;
  const oy = Math.max(s.tipY - m[1], m[1] - sp.archY0, 0);
  const band = Math.hypot(dx, oy) - s.radius;
  if (band > SPINOUS_SEARCH_MM) return band;
  let d = 1e3;
  for (let n = 1; n <= 12; n++) {
    const az = vertebraZ(n);
    const by = s.tipY - sp.archY0;
    const bz = spinousTipZ(n) - az;
    const py = m[1] - sp.archY0;
    const pz = m[2] - az;
    const h = Math.min(1, Math.max(0, (py * by + pz * bz) / (by * by + bz * bz)));
    d = Math.min(d, Math.hypot(dx, py - by * h, pz - bz * h));
  }
  return d - s.radius;
}

const f4 = (x: number): string => x.toFixed(4);

/**
 * Gemelo GLSL. uSpineArch.w lleva la y de la punta de las apófisis espinosas; la altura de los cuerpos, la de la parrilla
 * (`anatomy.ribcage.thoracicSegmentMm`, z = 0 en el disco T9–T10).
 */
export const SPINE_GLSL = /* glsl */ `
#define SPINE_SEG_MM ${f4(RIBCAGE.params.thoracicSegmentMm.value)}
#define SPINOUS_RADIUS_MM ${f4(SPINE.params.spinousRadiusMm.value)}
#define SPINOUS_SEARCH_MM ${f4(SPINOUS_SEARCH_MM)}
float spinousSd(vec3 m) {
  float dx = m.x - uSpine.x;
  float oy = max(max(uSpineArch.w - m.y, m.y - uSpineArch.y), 0.0);
  float band = length(vec2(dx, oy)) - SPINOUS_RADIUS_MM;
  if (band > SPINOUS_SEARCH_MM) return band;
  float d = 1e3;
  for (int n = 1; n <= 12; n++) {
    float fn = float(n);
    float drop = n <= 3 ? 0.0 : (n <= 6 ? 0.5 : (n <= 10 ? 1.0 : (n == 11 ? 0.5 : 0.0)));
    float az = (9.5 - fn) * SPINE_SEG_MM;
    float by = uSpineArch.w - uSpineArch.y;
    float bz = (9.5 - fn - drop) * SPINE_SEG_MM - az;
    float py = m.y - uSpineArch.y;
    float pz = m.z - az;
    float h = clamp((py * by + pz * bz) / (by * by + bz * bz), 0.0, 1.0);
    d = min(d, length(vec3(dx, py - by * h, pz - bz * h)));
  }
  return d - SPINOUS_RADIUS_MM;
}
`;
