import { defineParameters } from '../../core/evidence';
import type { Vec3 } from '../../core/vec3';
import { torsoDepth, torsoSkinPoint, type Torso } from '../primitives';
import { ribTableZ, type RibCage } from './ribcage';
import { wallArc, wallInnerNormal, wallTotalMm } from './wall';

/**
 * Corazón y ventana cardiaca (lus-sim, decisión 18, paso C3). En la zona paraesternal izquierda no hay pulmón: el corazón
 * toca la pared en un disco de ≈ 5 cm centrado ≈ 4,5–5 cm a la izquierda de la línea media, en el 5.º EIC (regla de Latham,
 * Gray: la matidez cardiaca superficial; `docs/knowledge/anatomy.md` §1.6 y meta A-T16). Allí la imagen no tiene línea
 * pleural, ni deslizamiento, ni líneas A: tiene corazón.
 *
 * Modelo: un elipsoide (miocardio) con una cavidad (sangre) y un tapón que lo une a la pared en el disco de la ventana.
 *  - El elipsoide: su ápex en el del adulto (5.º EIC, 9 cm a la izquierda de la línea media, Gray), `apexCoverMm` por
 *    dentro de la pared (la língula lo tapa), su eje largo hacia delante, abajo y a la izquierda (`axisLeftDeg`,
 *    `axisDownDeg`), y su cara esternocostal (el eje corto) hacia la pared de la ventana. Largo, ancho y grosor son
 *    [SUPUESTO] (la base no los da).
 *  - La cavidad: el mismo elipsoide menos las paredes (`anteriorWallMm` delante, `posteriorWallMm` detrás, `sideWallMm` a
 *    los lados): un solo ventrículo de sangre.
 *  - El tapón: en el disco de la ventana (sobre la piel: el arco u de la pared y la altura z), del pleura parietal hasta
 *    la cara del elipsoide (la más honda bajo el disco, más 1 mm): miocardio, sin pulmón. Un elipsoide que tocara la pared
 *    dejaría una ventana alargada de lado a lado (la cara del corazón casi sigue la curva de la pared) y llegaría a la LMC.
 *  - Sobre la cúpula: por debajo del diafragma no hay corazón (se apoya en él).
 * Sin latido ni pulso pulmonar (`heart-static`): el corazón es estático y su pericardio no tiene cara propia.
 *
 * TS y GLSL (uniforms `uHeart*` del esquema único) viven aquí juntos.
 */
export const HEART = defineParameters('anatomy.heart', {
  windowOffsetMm: {
    value: 47.5,
    unit: 'mm',
    range: [45, 50],
    evidence: 'derivado',
    sources: ['gray-anatomia-1918'],
    note:
      'Regla de Latham (Gray, «Surface Markings»): el centro del círculo de la matidez superficial, a medio camino entre el ' +
      'pezón (9–10 cm de la línea media) y el extremo inferior del esternón: (95 + 0)/2 = 47,5 mm a la izquierda',
  },
  windowIcs: {
    value: 5,
    unit: 'EIC',
    range: [4, 5],
    evidence: 'derivado',
    sources: ['gray-anatomia-1918'],
    note: 'La ventana, en el 5.º EIC (anatomy.md §2, «Ventana cardiaca sin pulmón»): el centro del EIC5 en su arco',
  },
  windowDiameterMm: {
    value: 50,
    unit: 'mm',
    range: [45, 55],
    evidence: 'derivado',
    sources: ['gray-anatomia-1918'],
    note: 'Regla de Latham: un círculo de 2 pulgadas (≈ 5 cm) sobre la piel',
  },
  apexOffsetMm: {
    value: 90,
    unit: 'mm',
    range: [80, 100],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Ápex cardiaco: 5.º EIC, 9 cm a la izquierda de la línea media (Gray; anatomy.md §1.6)',
  },
  apexCoverMm: {
    value: 10,
    unit: 'mm',
    range: [5, 15],
    evidence: 'estimado',
    sources: [],
    note:
      'El ápex queda por dentro de la pleura parietal [SUPUESTO]: la língula lo tapa, y el borde del pulmón izquierdo sigue en ' +
      'la 6.ª costilla de la LMC (Gray)',
  },
  lengthMm: {
    value: 120,
    unit: 'mm',
    range: [110, 130],
    evidence: 'estimado',
    sources: [],
    note: 'Del ápex a la base [SUPUESTO: NO ENCONTRADO en la base]',
  },
  widthMm: {
    value: 90,
    unit: 'mm',
    range: [80, 100],
    evidence: 'estimado',
    sources: [],
    note: 'Ancho [SUPUESTO: NO ENCONTRADO en la base]',
  },
  depthMm: {
    value: 65,
    unit: 'mm',
    range: [55, 70],
    evidence: 'estimado',
    sources: [],
    note: 'Grosor de delante atrás, el eje de la cara esternocostal [SUPUESTO: NO ENCONTRADO en la base]',
  },
  axisLeftDeg: {
    value: 60,
    unit: '°',
    range: [45, 70],
    evidence: 'estimado',
    sources: [],
    note:
      'El eje largo, de la base al ápex, hacia la izquierda: el ángulo con el plano sagital [SUPUESTO]; con 60° y 30° el ' +
      'corazón queda ≥ 4 mm por dentro de la pleura fuera de la ventana y el tapón no pasa de 20 mm',
  },
  axisDownDeg: {
    value: 30,
    unit: '°',
    range: [20, 40],
    evidence: 'estimado',
    sources: [],
    note: 'El eje largo, hacia abajo: el ángulo con el plano transversal [SUPUESTO]',
  },
  anteriorWallMm: {
    value: 5,
    unit: 'mm',
    range: [3, 6],
    evidence: 'estimado',
    sources: [],
    note: 'Pared libre del ventrículo derecho con el pericardio, la que da a la ventana [SUPUESTO]',
  },
  posteriorWallMm: { value: 11, unit: 'mm', range: [9, 13], evidence: 'estimado', sources: [], note: 'Pared de detrás [SUPUESTO]' },
  sideWallMm: {
    value: 10,
    unit: 'mm',
    range: [8, 15],
    evidence: 'estimado',
    sources: [],
    note: 'Paredes de los lados y del ápex [SUPUESTO]',
  },
});

export interface Heart {
  center: Vec3;
  /** Ejes del elipsoide (unitarios): largo (hacia el ápex), ancho y corto (hacia la pared de la ventana). */
  e1: Vec3;
  e2: Vec3;
  e3: Vec3;
  radii: Vec3;
  /** Desplazamiento de la cavidad por e3 (mm) y sus semiejes. */
  cavityOffset: number;
  cavityRadii: Vec3;
  /** Ventana sobre la piel: arco u con signo (+ a la izquierda), altura z y radio (mm). */
  window: { u: number; z: number; r: number };
  /** Profundidad bajo la pleura parietal del tapón de la ventana (mm). */
  plugDepthMm: number;
  /** Punta del elipsoide (el ápex), para las pruebas. */
  apex: Vec3;
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Centro del EIC k (entre las costillas k y k + 1) en |u|. */
function icsZ(cage: RibCage, k: number, au: number): number {
  return 0.5 * (ribTableZ(cage, k - 1, au) + ribTableZ(cage, k, au));
}

/** Profundidad bajo la pleura parietal (mm, radial) del punto m. */
function insideWall(m: Vec3, t: Torso): number {
  return -torsoDepth(m, t) - wallTotalMm(m, t);
}

/** Punto de la pleura parietal bajo la piel de abscisa X > 0 (lado izquierdo, delante), a la altura z. */
function pleuraUnderSkin(X: number, z: number, t: Torso): { p: Vec3; u: number } {
  const phi = Math.acos(Math.min(1, X / t.a));
  const s = torsoSkinPoint(phi, z, t);
  const nx = s[0] / (t.a * t.a);
  const ny = s[1] / (t.b * t.b);
  const l = Math.hypot(nx, ny);
  let lo = 0;
  let hi = 80;
  for (let i = 0; i < 50; i++) {
    const mid = 0.5 * (lo + hi);
    if (insideWall([s[0] - (nx / l) * mid, s[1] - (ny / l) * mid, z], t) < 0) lo = mid;
    else hi = mid;
  }
  const d = 0.5 * (lo + hi);
  return { p: [s[0] - (nx / l) * d, s[1] - (ny / l) * d, z], u: wallArc(s, t) };
}

/**
 * El corazón del avatar sobre la parrilla y la pared construidas (la torso con su pared torácica): el ápex donde lo pone
 * Gray, los ejes de los ángulos del eje largo, la ventana en su disco y la profundidad del tapón.
 */
export function buildHeart(t: Torso, cage: RibCage): Heart {
  const P = HEART.params;
  // el ápex: la pleura bajo la piel de abscisa apexOffsetMm en el centro de su EIC, apexCoverMm hacia dentro
  const apexU = Math.abs(wallArc(torsoSkinPoint(Math.acos(P.apexOffsetMm.value / t.a), 0, t), t));
  const aw = pleuraUnderSkin(P.apexOffsetMm.value, icsZ(cage, 5, apexU), t).p;
  const na = wallInnerNormal(aw, t);
  const apex: Vec3 = [aw[0] - na[0] * P.apexCoverMm.value, aw[1] - na[1] * P.apexCoverMm.value, aw[2] - na[2] * P.apexCoverMm.value];
  // la ventana
  const winU = wallArc(torsoSkinPoint(Math.acos(P.windowOffsetMm.value / t.a), 0, t), t);
  const winZ = icsZ(cage, P.windowIcs.value, Math.abs(winU));
  const wc = pleuraUnderSkin(P.windowOffsetMm.value, winZ, t).p;
  const nw = wallInnerNormal(wc, t);
  // ejes: el largo por sus ángulos; el corto, la normal de la pared de la ventana sin su parte por el largo
  const g = (P.axisLeftDeg.value * Math.PI) / 180;
  const dl = (P.axisDownDeg.value * Math.PI) / 180;
  const e1: Vec3 = [Math.sin(g) * Math.cos(dl), Math.cos(g) * Math.cos(dl), -Math.sin(dl)];
  const k = dot(nw, e1);
  const e3raw: Vec3 = [nw[0] - k * e1[0], nw[1] - k * e1[1], nw[2] - k * e1[2]];
  const l3 = Math.hypot(e3raw[0], e3raw[1], e3raw[2]);
  const e3: Vec3 = [e3raw[0] / l3, e3raw[1] / l3, e3raw[2] / l3];
  const e2: Vec3 = [e3[1] * e1[2] - e3[2] * e1[1], e3[2] * e1[0] - e3[0] * e1[2], e3[0] * e1[1] - e3[1] * e1[0]];
  const radii: Vec3 = [0.5 * P.lengthMm.value, 0.5 * P.widthMm.value, 0.5 * P.depthMm.value];
  const center: Vec3 = [apex[0] - radii[0] * e1[0], apex[1] - radii[0] * e1[1], apex[2] - radii[0] * e1[2]];
  const wallFront = P.anteriorWallMm.value;
  const wallBack = P.posteriorWallMm.value;
  const side = P.sideWallMm.value;
  const h: Heart = {
    center,
    e1,
    e2,
    e3,
    radii,
    cavityOffset: 0.5 * (wallBack - wallFront),
    cavityRadii: [radii[0] - side, radii[1] - side, radii[2] - 0.5 * (wallFront + wallBack)],
    window: { u: winU, z: winZ, r: 0.5 * P.windowDiameterMm.value },
    plugDepthMm: 0,
    apex,
  };
  // el tapón: hasta la cara del elipsoide más honda bajo el disco (por la normal de la pleura), más 1 mm
  let deepest = 0;
  const X0 = P.windowOffsetMm.value;
  for (let dx = -h.window.r; dx <= h.window.r; dx += 1)
    for (let dz = -h.window.r; dz <= h.window.r; dz += 1) {
      const pw = pleuraUnderSkin(X0 + dx, winZ + dz, t);
      if (heartWindowDistance(h, pw.u, winZ + dz) > 0) continue;
      const n = wallInnerNormal(pw.p, t);
      let gap = 0;
      while (gap < 80 && heartSd(h, [pw.p[0] - n[0] * gap, pw.p[1] - n[1] * gap, pw.p[2] - n[2] * gap]) >= 0) gap += 0.25;
      deepest = Math.max(deepest, gap);
    }
  h.plugDepthMm = deepest + 1;
  return h;
}

/** Distancia (aproximada, la de VExUS) a un elipsoide centrado de semiejes r, en su marco (gemelo GLSL). */
export function heartEllipsoidSd(q: Vec3, r: Vec3): number {
  const kx = q[0] / r[0];
  const ky = q[1] / r[1];
  const kz = q[2] / r[2];
  const k1 = Math.sqrt(kx * kx + ky * ky + kz * kz);
  const k2 = Math.sqrt((kx * kx) / (r[0] * r[0]) + (ky * ky) / (r[1] * r[1]) + (kz * kz) / (r[2] * r[2]));
  return k2 > 0 ? (k1 * (k1 - 1)) / k2 : -Math.min(r[0], r[1], r[2]);
}

/** El punto en el marco del corazón (ejes e1, e2, e3). */
export function heartLocal(h: Heart, m: Vec3): Vec3 {
  const d: Vec3 = [m[0] - h.center[0], m[1] - h.center[1], m[2] - h.center[2]];
  return [dot(d, h.e1), dot(d, h.e2), dot(d, h.e3)];
}

/** Distancia con signo al elipsoide del corazón (negativa dentro). */
export function heartSd(h: Heart, m: Vec3): number {
  return heartEllipsoidSd(heartLocal(h, m), h.radii);
}

/** Distancia con signo a la cavidad (sangre). */
export function heartCavitySd(h: Heart, m: Vec3): number {
  const q = heartLocal(h, m);
  return heartEllipsoidSd([q[0], q[1], q[2] - h.cavityOffset], h.cavityRadii);
}

/** Distancia con signo (mm, sobre la piel) al borde del disco de la ventana en (u, z): negativa dentro. */
export function heartWindowDistance(h: Heart, u: number, z: number): number {
  return Math.hypot(u - h.window.u, z - h.window.z) - h.window.r;
}

/**
 * Distancia a la frontera (≥ 0) si el punto (con su profundidad bajo la pleura `insideWallMm` y su arco `u`) es corazón —
 * el elipsoide o el tapón de la ventana—, y si es sangre; `null` si no. No mira la cúpula: la escena solo lo acepta sobre
 * ella.
 */
export function heartDistance(h: Heart, m: Vec3, insideWallMm: number, u: number): { d: number; blood: boolean } | null {
  const sd = heartSd(h, m);
  // el tapón y la pleura solo cuentan a menos de su fondo (más hondo, el arco no hace falta: la GPU no lo calcula ahí)
  const nearWall = insideWallMm < h.plugDepthMm;
  const win = nearWall ? heartWindowDistance(h, u, m[2]) : 1e3;
  const inPlug = nearWall && insideWallMm >= 0 && win < 0;
  if (sd >= 0 && !inPlug) return null;
  const cav = heartCavitySd(h, m);
  if (cav < 0) return { d: -cav, blood: true };
  // del miocardio, cota de la distancia a cualquiera de sus caras: la cavidad, el elipsoide y, junto a la pared, la pleura y
  // los bordes del tapón (el disco y su fondo, que queda dentro del elipsoide)
  let d = Math.min(cav, Math.abs(sd));
  if (nearWall) d = Math.min(d, Math.abs(insideWallMm), Math.abs(win), h.plugDepthMm - insideWallMm);
  return { d, blood: false };
}

/**
 * Cota (≥ 0) de la distancia de un punto de fuera del corazón a su cara (el elipsoide o el tapón de la ventana): la
 * distancia a la frontera de los tejidos que lo rodean la cuenta (gemelo GLSL).
 */
export function heartClearance(h: Heart, m: Vec3, insideWallMm: number, u: number): number {
  // más hondo que el tapón solo cuenta el elipsoide (el fondo del tapón queda dentro de él; y el arco no hace falta)
  const plug = insideWallMm < h.plugDepthMm ? heartWindowDistance(h, u, m[2]) : 1e3;
  return Math.max(0, Math.min(heartSd(h, m), plug));
}

/** La pleura parietal en m (el cruce de una línea) no toca pulmón: es la ventana (el tapón) o el elipsoide. */
export function heartAtWall(h: Heart, m: Vec3, t: Torso): boolean {
  return heartSd(h, m) < 0 || heartWindowDistance(h, wallArc(m, t), m[2]) < 0;
}

/**
 * Gemelo GLSL: uHeartC = (centro, profundidad del tapón), uHeartE1–3 = (eje, semieje), uHeartCav = (desplazamiento por e3,
 * semiejes de la cavidad), uHeartWin = (u, z, radio de la ventana, 0).
 */
export const HEART_GLSL = /* glsl */ `
float heartEllipsoidSd(vec3 q, vec3 r) {
  vec3 k = q / r;
  float k1 = length(k);
  float k2 = length(k / r);
  return k2 > 0.0 ? k1 * (k1 - 1.0) / k2 : -min(r.x, min(r.y, r.z));
}
vec3 heartLocal(vec3 m) { vec3 d = m - uHeartC.xyz; return vec3(dot(d, uHeartE1.xyz), dot(d, uHeartE2.xyz), dot(d, uHeartE3.xyz)); }
float heartSd(vec3 m) { return heartEllipsoidSd(heartLocal(m), vec3(uHeartE1.w, uHeartE2.w, uHeartE3.w)); }
float heartCavitySd(vec3 m) { return heartEllipsoidSd(heartLocal(m) - vec3(0.0, 0.0, uHeartCav.x), uHeartCav.yzw); }
float heartWindowDistance(float u, float z) { return length(vec2(u - uHeartWin.x, z - uHeartWin.y)) - uHeartWin.z; }
// distancia a la frontera (≥ 0) del corazón, −1 fuera; blood: sangre de la cavidad
float heartDistance(vec3 m, float insideWall, float u, out bool blood) {
  blood = false;
  float sd = heartSd(m);
  bool nearWall = insideWall < uHeartC.w;
  float win = nearWall ? heartWindowDistance(u, m.z) : 1e3;
  bool inPlug = nearWall && insideWall >= 0.0 && win < 0.0;
  if (sd >= 0.0 && !inPlug) return -1.0;
  float cav = heartCavitySd(m);
  if (cav < 0.0) { blood = true; return -cav; }
  float d = min(cav, abs(sd));
  if (nearWall) d = min(min(d, abs(insideWall)), min(abs(win), uHeartC.w - insideWall));
  return d;
}
float heartClearance(vec3 m, float insideWall, float u) {
  float plug = insideWall < uHeartC.w ? heartWindowDistance(u, m.z) : 1e3;
  return max(0.0, min(heartSd(m), plug));
}
bool heartAtWall(vec3 m) { return heartSd(m) < 0.0 || heartWindowDistance(wallArc(m), m.z) < 0.0; }
`;
