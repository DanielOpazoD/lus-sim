import { defineParameters } from '../../core/evidence';
import type { Vec3 } from '../../core/vec3';
import type { Torso } from '../primitives';
import { ribTableZ, ribLineArc, type RibCage } from './ribcage';
import { wallArc } from './wall';

/**
 * El estómago bajo la cúpula izquierda (lus-sim, decisión 43; VExUS no lo tiene). Gray («Surface Markings of the Abdomen», para
 * un estómago moderadamente lleno y en supino): en la línea lateral izquierda el fondo llega al 5.º espacio intercostal o al 6.º
 * cartílago; la parte en contacto con la pared es un triángulo de vértice en el extremo del 8.º cartílago izquierdo y base del
 * 10.º izquierdo al 9.º derecho; el espacio de Traube, que lo cubre, lo limitan el borde inferior del pulmón izquierdo, el borde
 * anterior del bazo, el reborde costal y el lóbulo izquierdo del hígado.
 *
 * Modelo, como el bazo: medio elipsoide en las coordenadas de la pared (el arco `wallArc`, la altura z y la profundidad bajo el
 * diafragma), centrado en la cara abdominal del diafragma; su cara anterosuperior la sigue. Su contorno en la pared, el del espacio
 * de Traube: de la altura del 5.º espacio en la LMC (el fondo) al reborde costal en su centro (entre las puntas de los cartílagos
 * 10.º y 11.º), y del extremo del 8.º cartílago (el vértice del triángulo, junto al lóbulo izquierdo) al centro del bazo (que se
 * clasifica antes y lo recorta, como el hígado). Su grosor, el que da el volumen del estómago en ayunas (Fidler y cols.) a ese
 * contorno. La pared (Henry y cols.) es el tejido del «resto» (el intestino de VExUS), sin sus capas; la luz, líquido, con el gas
 * arriba: en supino, el de la parte más anterior (y alta) de la luz, hasta su volumen en ayunas (Fidler y cols.), por un nivel
 * horizontal. Sin antro, píloro ni cardias (`stomach-traube-lens`).
 *
 * TS y GLSL (uniforms del esquema único: `uStomach` y lo que cabe en las ranuras libres de otros) viven aquí juntos.
 */
export const STOMACH = defineParameters('anatomy.stomach', {
  fundusIcs: {
    value: 5,
    unit: 'espacio intercostal',
    range: [5, 6],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note:
      'Gray («Surface Markings of the Abdomen»): en la línea lateral izquierda el fondo llega al 5.º espacio o al 6.º cartílago, ' +
      'algo por debajo del ápex; el modelo toma el centro del 5.º espacio en la LMC (la línea lateral de Gray pasa por el punto ' +
      'medio del ligamento inguinal, cerca de ella)',
  },
  medialCartilage: {
    value: 8,
    unit: 'cartílago',
    range: [8, 8],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'Gray: el vértice del triángulo de contacto con la pared, en el extremo del 8.º cartílago izquierdo',
  },
  volumeMl: {
    value: 167,
    unit: 'mL',
    range: [122, 212],
    evidence: 'documentado',
    sources: ['fidler-estomago-2009', 'henry-estomago-2007'],
    note:
      'Fidler y cols. (RM en supino, 20 voluntarios sanos en ayunas, HASTE): el volumen gástrico en ayunas, 167 ± 10 mL (media ± ' +
      'EEM; la DE, ≈ 10·√20 = 45: el rango). Henry y cols. (TC de 19 adultos de IMC normal): 143 ± 97 cm³. Todo en el medio ' +
      'elipsoide (el modelo no tiene antro) [SUPUESTO]',
  },
  wallMm: {
    value: 3.61,
    unit: 'mm',
    range: [3.1, 4.12],
    evidence: 'documentado',
    sources: ['henry-estomago-2007'],
    note: 'Henry y cols. (TC, IMC normal): el grosor de la pared gástrica, 3,61 ± 0,51 mm; el rango, ± 1 DE',
  },
  gasMl: {
    value: 23,
    unit: 'mL',
    range: [10, 40],
    evidence: 'documentado',
    sources: ['fidler-estomago-2009'],
    note:
      'Fidler y cols.: el aire del estómago en ayunas, 21 ± 3 mL 20 min y 25 ± 5 mL 5 min antes de la comida (media ± EEM): la ' +
      'media de los dos; el rango, ≈ ± 1 DE (EEM·√20). Arriba en supino: el gas sube a lo más anterior de la luz',
  },
});

/** El estómago de la escena (sube a la GPU en `uStomach`, `uLiverS.zw` y `uLiverTip.w`). */
export interface StomachShape {
  /** Centro: arco de la pared (u > 0, a la izquierda) y z. */
  readonly u0: number;
  readonly z0: number;
  /** mm por unidad de arco en la cara interna de la pared, en el centro. */
  readonly arcScale: number;
  /** Semiejes (mm): a lo largo de la pared, en z y el grueso entero hacia dentro. */
  readonly radii: Vec3;
  /** Profundidad máxima bajo la piel (mm): la de la rampa de la cúpula (`rimFarMm`) más el grueso (como el bazo). */
  readonly maxSkinDepth: number;
  /** y del nivel del gas (supino: la gravedad va a −y); la luz por encima es gas. */
  readonly gasY: number;
}

/** Punto a la profundidad `d` (mm bajo la piel, por la dirección radial del tronco) bajo el arco u y la altura z. */
function pointAtArc(u: number, z: number, d: number, t: Torso): Vec3 {
  let lo = -Math.PI;
  let hi = Math.PI;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (wallArc([t.a * Math.sin(mid), t.b * Math.cos(mid), 0], t) < u) lo = mid;
    else hi = mid;
  }
  const tau = 0.5 * (lo + hi);
  const sx = t.a * Math.sin(tau);
  const sy = t.b * Math.cos(tau);
  const k = 1 - d / Math.hypot(sx, sy);
  return [sx * k, sy * k, z];
}

/** Distancia con signo (aprox.) al medio elipsoide en coordenadas locales: la de `sdEllipsoidLocal`. */
function ellipsoidSd(q: Vec3, r: Vec3): number {
  const kx = q[0] / r[0];
  const ky = q[1] / r[1];
  const kz = q[2] / r[2];
  const k1 = Math.hypot(kx, ky, kz);
  const k2 = Math.hypot(kx / r[0], ky / r[1], kz / r[2]);
  return k2 > 0 ? (k1 * (k1 - 1)) / k2 : -Math.min(r[0], r[1], r[2]);
}

/**
 * Construye el estómago: el contorno de Traube en la pared (el 5.º espacio en la LMC arriba, el reborde costal en el centro abajo,
 * el extremo del 8.º cartílago dentro y el centro del bazo, `spleenU`, fuera), el grosor del volumen de Fidler y el nivel del gas.
 * `wallMm(u, z)`: el grosor de la pared; `midclavicularPhi`: la LMC izquierda.
 */
export function buildStomach(
  t: Torso,
  cage: RibCage,
  midclavicularPhi: number,
  spleenU: number,
  wallMm: (u: number, z: number) => number,
  rimFarMm: number,
): StomachShape {
  const P = STOMACH.params;
  const rib = (n: number) => cage.ribs.findIndex((r) => r.number === n && r.side === 1);
  const tip = (n: number): [number, number] => {
    const k = rib(n);
    return [cage.ribs[k].uEnd, ribTableZ(cage, k, cage.ribs[k].uEnd)];
  };
  // arriba: el centro del 5.º espacio en la LMC
  const lmc = ribLineArc(midclavicularPhi, t, cage);
  const ics = P.fundusIcs.value;
  const zTop = 0.5 * (ribTableZ(cage, rib(ics), lmc) + ribTableZ(cage, rib(ics + 1), lmc));
  // dentro y fuera: el extremo del 8.º cartílago y el centro del bazo
  const uMed = tip(P.medialCartilage.value)[0];
  const u0 = 0.5 * (uMed + spleenU);
  // abajo: el reborde costal en el centro, entre las puntas del 10.º y el 11.º cartílagos
  const [u10, z10] = tip(10);
  const [u11, z11] = tip(11);
  const zBottom = z10 + ((z11 - z10) * (u0 - u10)) / (u11 - u10);
  const z0 = 0.5 * (zTop + zBottom);
  const depth0 = wallMm(u0, z0);
  const a = pointAtArc(u0 - 1, z0, depth0, t);
  const b = pointAtArc(u0 + 1, z0, depth0, t);
  const arcScale = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
  const A = 0.5 * (spleenU - uMed) * arcScale;
  const B = 0.5 * (zTop - zBottom);
  // el grosor del volumen de Fidler: (2/3)·π·A·B·T (medio elipsoide)
  const T = (3 * P.volumeMl.value * 1000) / (2 * Math.PI * A * B);
  const radii: Vec3 = [A, B, T];
  return { u0, z0, arcScale, radii, maxSkinDepth: rimFarMm + T, gasY: gasLevel(t, u0, z0, arcScale, radii, wallMm) };
}

/**
 * El nivel del gas: la y por encima de la cual la luz (la parte del medio elipsoide a más de `wallMm` de su borde) suma `gasMl`.
 * Integra la luz en las coordenadas locales (pasos de 2 × 2 × 0,5 mm, sin el recorte del hígado, el bazo ni la cúpula, y con la
 * profundidad bajo la pared en vez de bajo el diafragma) y pasa cada muestra al tronco por la dirección radial.
 */
function gasLevel(t: Torso, u0: number, z0: number, arcScale: number, r: Vec3, wallMm: (u: number, z: number) => number): number {
  const W = STOMACH.params.wallMm.value;
  const samples: number[] = [];
  const dv = 2 * 2 * 0.5;
  for (let a = -r[0] + 1; a < r[0]; a += 2) {
    const u = u0 + a / arcScale;
    for (let b = -r[1] + 1; b < r[1]; b += 2) {
      const z = z0 + b;
      const wall = wallMm(u, z);
      const skin = pointAtArc(u, z, 0, t);
      const rr = Math.hypot(skin[0], skin[1]);
      for (let c = 0.25; c < r[2]; c += 0.5) {
        const d = ellipsoidSd([a, b, c], r);
        // la luz: a más de W del borde del elipsoide y de su cara (la del diafragma, c = 0)
        if (Math.min(-d, c) < W) continue;
        samples.push(skin[1] * (1 - (wall + c) / rr));
      }
    }
  }
  samples.sort((x, y) => y - x);
  const n = Math.min(samples.length - 1, Math.round((STOMACH.params.gasMl.value * 1000) / dv));
  return samples[Math.max(0, n)];
}

/** Coordenadas locales del estómago (a lo largo de la pared, z, grueso; mm) en (u, z, below) (gemelo GLSL con el mismo nombre). */
export function stomachLocal(u: number, z: number, below: number, s: StomachShape): Vec3 {
  return [(u - s.u0) * s.arcScale, z - s.z0, below];
}

/**
 * Distancia con signo al estómago, negativa dentro, sin la cúpula ni la pared (las pone la clasificación; gemelo GLSL con el mismo
 * nombre). `u`: el arco de la columna del punto; `below`: su profundidad bajo el diafragma (como el bazo); `skinDepth`: bajo la
 * piel (`maxSkinDepth`).
 */
export function stomachSdf(m: Vec3, u: number, below: number, skinDepth: number, s: StomachShape): number {
  return Math.max(ellipsoidSd(stomachLocal(u, m[2], below, s), s.radii), skinDepth - s.maxSkinDepth);
}

/**
 * El estómago solo se evalúa cerca de donde puede estar (gemelo GLSL con el mismo nombre): a la izquierda de x `STOMACH_X_MIN_MM`,
 * delante de y `STOMACH_Y_MIN_MM` y a menos de `maxSkinDepth` más `STOMACH_NEAR_MARGIN_MM` bajo la piel. Fuera, su distancia pasa
 * de 2 × el tope del «resto» y la clasificación la toma por lejana (1e3); `organPrefilter.test.ts` lo comprueba.
 */
export function stomachCandidate(m: Vec3, skinDepth: number, s: StomachShape): boolean {
  return m[0] > STOMACH_X_MIN_MM && m[1] > STOMACH_Y_MIN_MM && skinDepth < s.maxSkinDepth + STOMACH_NEAR_MARGIN_MM;
}
export const STOMACH_X_MIN_MM = 30;
export const STOMACH_Y_MIN_MM = -60;
export const STOMACH_NEAR_MARGIN_MM = 25;

const g = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));

/**
 * Gemelo GLSL. Uniforms (decisión 43: las ranuras de la pasada B están en su tope, 130 en el programa dirigido): `uStomach` (u0,
 * z0 y los semiejes a lo largo de la pared y en z), el grueso en `uLiverTip.w`, los mm por unidad de arco en `uLiverS.z` y la
 * y del nivel del gas en `uLiverS.w`; `maxSkinDepth` es `uCurtain.z` (`rimFarMm`) más el grueso, como en el bazo; la pared,
 * constante.
 */
export const STOMACH_GLSL = /* glsl */ `
#define STOMACH_WALL ${g(STOMACH.params.wallMm.value)}
bool stomachCandidate(vec3 m, float skinDepth) {
  return m.x > ${g(STOMACH_X_MIN_MM)} && m.y > ${g(STOMACH_Y_MIN_MM)} && skinDepth < uCurtain.z + uLiverTip.w + ${g(STOMACH_NEAR_MARGIN_MM)};
}
vec3 stomachLocal(float u, float z, float below) {
  return vec3((u - uStomach.x) * uLiverS.z, z - uStomach.y, below);
}
float stomachSdf(vec3 m, float u, float below, float skinDepth) {
  vec3 r = vec3(uStomach.zw, uLiverTip.w);
  vec3 k = stomachLocal(u, m.z, below) / r;
  float k1 = length(k);
  float k2 = length(k / r);
  float d = k2 > 0.0 ? k1 * (k1 - 1.0) / k2 : -min(r.x, min(r.y, r.z));
  return max(d, skinDepth - (uCurtain.z + uLiverTip.w));
}
`;
