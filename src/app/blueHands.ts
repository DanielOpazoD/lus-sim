import { torsoSkinPoint, type Torso } from '../anatomy/primitives';
import { wallArc } from '../anatomy/organs/wall';
import type { ClavicleSpec } from '../anatomy/organs/ribcage';
import { thoraxLinePhi } from '../anatomy/thoraxLines';

/**
 * La regla de las manos de Lichtenstein (lus-sim, decisión 41; `docs/knowledge/clinical.md` §3.1) sobre la piel del avatar: dos
 * manos del tamaño de las del paciente (`anatomy/hands.ts`), sin los pulgares, una debajo de la otra, con las puntas de los dedos en
 * la línea media [@lichtenstein-bluepoints-2011]. Las manos se apoyan en la piel: lo que se mide a lo largo de la mano es longitud
 * de arco de la piel desde la línea media (`wallArc`), y su ancho, altura (z).
 *
 *  - **La mano de arriba** con el borde del meñique en el borde inferior de la clavícula y a lo largo de su eje («la mano queda
 *    oblicua», Lichtenstein 2016): su borde de arriba es la recta del borde inferior de la clavícula, que sube hacia fuera, alargada
 *    hasta la línea media.
 *  - **La mano de abajo**, justo debajo y horizontal: «las dos manos juntas, desde la clavícula oblicua, dan una línea frénica
 *    horizontal» (2011). [SUPUESTO] dónde se tocan: en las puntas de los dedos, donde la de arriba llega más abajo.
 *  - **BLUE superior**: la inserción palmar de los dedos medio y anular de la mano de arriba (a un largo de dedo medio de la línea
 *    media, a medio ancho bajo su borde de arriba).
 *  - **BLUE inferior**: el centro de la palma de la mano de abajo (un dedo más media palma; a medio ancho).
 *  - **Línea frénica**: el borde inferior de la mano de abajo; **punto frénico**, su cruce con la línea axilar media.
 *  - **PLAPS**: a la altura del BLUE inferior, por detrás de la axilar posterior (`plapsPhiRight`, lo que alcanza la sonda en
 *    supino).
 *
 * Aproximaciones: la mano es un rectángulo (sin el escalonado de los dedos) y la inclinación de la de arriba (≈ 5,5° con la
 * clavícula del modelo) no se descuenta en las distancias (el coseno, < 0,5 %).
 */
export interface HandSize {
  /** Largo del dedo medio (pliegue basal → punta), de la palma (pliegue de la muñeca → base del dedo medio) y ancho de la mano (mm). */
  fingerLengthMm: number;
  palmLengthMm: number;
  handBreadthMm: number;
}

export interface BlueHandPoints {
  /** z (mm) del borde de arriba de la mano superior en la línea media (la recta del borde inferior de la clavícula) y su pendiente. */
  handTopZ: number;
  handTopSlope: number;
  upper: { phi: number; z: number; arcMm: number };
  lower: { phi: number; z: number; arcMm: number };
  /** Línea frénica (z) y punto frénico (en la axilar media). */
  phrenicZ: number;
  phrenic: { phi: number; z: number };
  plaps: { phi: number; z: number };
}

/** |arco| (mm) de la piel desde la línea media anterior hasta el ángulo φ. */
export function skinArcOf(phi: number, t: Pick<Torso, 'a' | 'b'>): number {
  return Math.abs(wallArc(torsoSkinPoint(phi, 0, t as Torso), t));
}

/** φ del hemitórax `side` (−1 derecho, +1 izquierdo) a `arcMm` de la línea media anterior por la piel (bisección). */
export function phiAtSkinArc(arcMm: number, t: Pick<Torso, 'a' | 'b'>, side: -1 | 1 = -1): number {
  let lo = 0.5 * Math.PI;
  let hi = 1.5 * Math.PI;
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (lo + hi);
    if (skinArcOf(m, t) < arcMm) lo = m;
    else hi = m;
  }
  const right = 0.5 * (lo + hi);
  return side < 0 ? right : Math.PI - right;
}

/** z (mm) del borde inferior de la clavícula a |u| de la línea media por la piel (el eje sube `rise` del extremo esternal al acromial). */
export function clavicleLowerZ(c: ClavicleSpec, u: number): number {
  const s = Math.min(1, Math.max(0, (u - c.u0) / (c.u1 - c.u0)));
  return c.z0 + c.rise * s - c.radius;
}

export function blueHandPoints(t: Torso, clavicle: ClavicleSpec, hand: HandSize, plapsPhiRight: number, side: -1 | 1 = -1): BlueHandPoints {
  const breadth = hand.handBreadthMm;
  // el borde de arriba de la mano superior: la recta del borde inferior de la clavícula, alargada hasta la línea media
  const slope = clavicle.rise / (clavicle.u1 - clavicle.u0);
  const top = (u: number): number => clavicleLowerZ(clavicle, clavicle.u0) + slope * (u - clavicle.u0);
  const handTopZ = top(0);
  const upperArc = hand.fingerLengthMm;
  const lowerArc = hand.fingerLengthMm + 0.5 * hand.palmLengthMm;
  // la mano de abajo, horizontal, toca la de arriba en las puntas de los dedos (donde el borde de abajo de la de arriba es más bajo)
  const lowerTop = handTopZ - breadth;
  const lowerZ = lowerTop - 0.5 * breadth;
  const phrenicZ = lowerTop - breadth;
  const plapsPhi = side < 0 ? plapsPhiRight : Math.PI - plapsPhiRight;
  return {
    handTopZ,
    handTopSlope: slope,
    upper: { phi: phiAtSkinArc(upperArc, t, side), z: top(upperArc) - 0.5 * breadth, arcMm: upperArc },
    lower: { phi: phiAtSkinArc(lowerArc, t, side), z: lowerZ, arcMm: lowerArc },
    phrenicZ,
    phrenic: { phi: thoraxLinePhi('midaxillary', t, side), z: phrenicZ },
    plaps: { phi: plapsPhi, z: lowerZ },
  };
}
