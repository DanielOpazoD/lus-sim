import type { Vec3 } from '../../core/vec3';
import { torsoDepth, type Torso } from '../primitives';
import { TISSUE_GLSL_NAME, Tissue } from '../tissues';
import {
  HEART,
  HEART_PALETTE,
  HEART_PHASES,
  HEART_TRANSITIONS,
  echoTwinOrigin,
  packHeartVoxel,
  type CardiacRuntime,
  type Heart,
  type HeartVoxelWords,
} from '../organs/heart';
import type { RibCage } from '../organs/ribcage';
import { wallArc, wallInnerNormal, wallTotalMm } from '../organs/wall';
import {
  CARDIAC_BASE_SPHERE_CM,
  CARDIAC_BOX_CM,
  CARDIAC_GLSL,
  CARDIAC_TEX_TEXELS,
  ET_TO_PALETTE,
  buildCardiac,
  cardiacParamsAt,
  cardiacPoseAt,
  cardiacPoint,
  cardiacSample,
  type Cardiac,
} from './cardiac';
import { classifyHeart } from './heartModel';
import { normalExcellentCase } from '../../physiology/heart/normal-excellent';
import { makeSample, type TissueSample } from './tissue';

/**
 * El corazón de EchoTwin que se carga tarde (lus-sim, decisión 49): todo lo que necesita el modelo de EchoTwin —colocarlo en el
 * tórax, su volumen y el programa que lo hornea en la GPU— va en este módulo, que la aplicación importa después del primer cuadro
 * (`import()`, su propio chunk) y las pruebas al arrancar (`validation/support/setupHeart.ts`). La escena y las pasadas solo leen
 * el volumen (`organs/heart.ts`, `heartVoxel`), así que el corazón no está en la entrada del bundle ni inlineado en los programas
 * de la imagen.
 *
 * El volumen: una rejilla de `VOXEL_MM` en el marco del corazón sobre su caja (`CARDIAC_BOX_CM`); cada vóxel guarda lo que el
 * clasificador de EchoTwin dice en su centro (el tejido de lus-sim, o nada) y la distancia de su `sdf` en décimas de mm. La GPU lo
 * hornea una vez con la GLSL de EchoTwin (`bakeFragment`, en una textura RG8UI 3D); la gemela TS lo evalúa en el mismo centro
 * (`voxel`): el mismo clasificador, el mismo punto.
 */

/** Lado del vóxel del corazón horneado (mm): ≈ la mitad de la resolución axial del preajuste pulmonar en el campo cercano. */
export const VOXEL_MM = 0.7;
const VOXEL_CM = VOXEL_MM / 10;

/** Profundidad bajo la pleura parietal (mm, radial) del punto m. */
function insideWall(m: Vec3, t: Torso): number {
  return -torsoDepth(m, t) - wallTotalMm(m, t);
}

/** Punto de la piel de arco u (con signo, + a la izquierda) a la altura z. */
function skinAtArc(u: number, z: number, t: Torso): Vec3 {
  let lo = -Math.PI;
  let hi = Math.PI;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (wallArc([t.a * Math.sin(mid), t.b * Math.cos(mid), 0], t) < u) lo = mid;
    else hi = mid;
  }
  const tau = 0.5 * (lo + hi);
  return [t.a * Math.sin(tau), t.b * Math.cos(tau), z];
}

/** La pleura parietal bajo la piel s, por el rayo radial de su columna. */
function pleuraUnder(s: Vec3, t: Torso): { p: Vec3; radial: Vec3 } {
  const R = Math.hypot(s[0], s[1]);
  const radial: Vec3 = [s[0] / R, s[1] / R, 0];
  let lo = 0;
  let hi = 80;
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    if (insideWall([s[0] - radial[0] * mid, s[1] - radial[1] * mid, s[2]], t) < 0) lo = mid;
    else hi = mid;
  }
  return { p: [s[0] - radial[0] * hi, s[1] - radial[1] * hi, s[2]], radial };
}

/**
 * Profundidad (mm, a lo largo de −dir desde p) del primer punto cardiaco (`isCardiac`), buscado de `step` en `step` mm hasta
 * `maxMm` y afinado por bisección; −1 si no hay.
 */
export function firstCardiacDepth(isCardiac: (p: Vec3) => boolean, p: Vec3, dir: Vec3, maxMm: number, step = 0.5): number {
  const at = (d: number): Vec3 => [p[0] - dir[0] * d, p[1] - dir[1] * d, p[2] - dir[2] * d];
  if (isCardiac(p)) return 0;
  for (let d = step; d <= maxMm; d += step) {
    if (!isCardiac(at(d))) continue;
    let lo = d - step;
    let hi = d;
    for (let i = 0; i < 12; i++) {
      const mid = 0.5 * (lo + hi);
      if (isCardiac(at(mid))) hi = mid;
      else lo = mid;
    }
    return hi;
  }
  return -1;
}

/**
 * Profundidad radial bajo la pleura (mm, la métrica de la clasificación) del primer punto cardiaco de cada columna del disco de
 * la ventana, de `step` en `step` mm sobre la piel; las columnas cuyo rayo no da con el corazón no cuentan.
 */
export function windowDepths(h: Pick<Heart, 'window'>, t: Torso, isCardiac: (p: Vec3) => boolean, step = 2.5): number[] {
  const out: number[] = [];
  const r = h.window.r;
  for (let du = -r; du <= r; du += step)
    for (let dz = -r; dz <= r; dz += step) {
      if (Math.hypot(du, dz) >= r) continue;
      const { p, radial } = pleuraUnder(skinAtArc(h.window.u + du, h.window.z + dz, t), t);
      const d = firstCardiacDepth(isCardiac, p, radial, 60);
      if (d >= 0) out.push(insideWall([p[0] - radial[0] * d, p[1] - radial[1] * d, p[2]], t));
    }
  return out;
}

/** Punta del saco pericárdico de EchoTwin en su eje largo (marco del corazón, cm): donde el eje sale del corazón. */
export function cardiacApexCm(c: Cardiac): number {
  const L = c.model.lv.lengthCm;
  const inside = (z: number): boolean => cardiacSample(c, cardiacPoint(c, [0, 0, z])).tissue !== -1;
  let z = L;
  while (inside(z) && z < L + 3) z += 0.05;
  let lo = z - 0.05;
  let hi = z;
  for (let i = 0; i < 20; i++) {
    const mid = 0.5 * (lo + hi);
    if (inside(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Muestras gruesas de la línea de tiempo: la fase fina cada `HEART_PHASES / BEAT_COARSE` (16). */
export const BEAT_COARSE = 16;
/** Pasos de la bisección de cada cambio entre dos muestras gruesas: de 16 fases finas a 1. */
export const BEAT_BISECT = 4;
const STRIDE = HEART_PHASES / BEAT_COARSE;
/**
 * El índice de lo que el corazón deja al latir: grasa (la del mediastino y el pericardio). Sin él, el vóxel que el corazón deja
 * vacío caía en el pulmón: bajo la ventana, en la telesístole, ≈ 6 mm de pulmón entre el tapón y el pericardio.
 */
const VACATED_IDX = HEART_PALETTE.indexOf(Tissue.Fat) + 1;

/** El índice del tejido (`ET_TO_PALETTE`, 0 = nada) en q (marco del corazón, cm) en la fase fina f; `s` queda con la muestra. */
function paletteAt(c: Cardiac, q: Vec3, f: number, s: TissueSample): number {
  return classifyHeart(c.model, cardiacPoseAt(c, f), q[0], q[1], q[2], s) ? ET_TO_PALETTE[s.tissue] : 0;
}

/**
 * Funde los tramos más cortos hasta dejar `HEART_TRANSITIONS` cambios (gemelo GLSL en `bakeFragment`): el tramo j (que empieza en
 * el cambio j − 1) se suma al anterior, el más corto primero (y de dos iguales, el primero); si al fundirlo quedan seguidos dos tramos
 * del mismo tejido, también se funden.
 */
export function reduceChanges(changes: readonly (readonly [number, number])[], base: number): [number, number][] {
  const ch = changes.map((c) => [c[0], c[1]] as [number, number]);
  while (ch.length > HEART_TRANSITIONS) {
    const n = ch.length;
    let jmin = 1;
    let lmin = Infinity;
    for (let j = 1; j <= n; j++) {
      const len = (j < n ? ch[j][0] : HEART_PHASES) - ch[j - 1][0];
      if (len < lmin) {
        lmin = len;
        jmin = j;
      }
    }
    ch.splice(jmin - 1, 1);
    const prev = jmin - 1 >= 1 ? ch[jmin - 2][1] : base;
    if (jmin - 1 < ch.length && ch[jmin - 1][1] === prev) ch.splice(jmin - 1, 1);
  }
  return ch;
}

/**
 * Las palabras del vóxel (i, j, k) (`packHeartVoxel`; gemelo GLSL en `bakeFragment`): lo que el clasificador de EchoTwin dice en su
 * centro en telediástole (el índice del tejido y la distancia de su `sdf` en medios mm, hasta 3,5) y, con `beat`, la línea de
 * tiempo de su latido: el tejido en 16 fases gruesas (una cada 16 finas) y, entre dos distintas, la fase fina del cambio por
 * bisección (4 pasos); hasta `HEART_TRANSITIONS` cambios (`reduceChanges`). Con cambios, la distancia es 0 (su frontera se mueve).
 */
export function voxelWords(c: Cardiac, i: number, j: number, k: number, beat: boolean): HeartVoxelWords {
  const min = CARDIAC_BOX_CM.min;
  const q: Vec3 = [min[0] + (i + 0.5) * VOXEL_CM, min[1] + (j + 0.5) * VOXEL_CM, min[2] + (k + 0.5) * VOXEL_CM];
  const s = scratch;
  const base = paletteAt(c, q, 0, s);
  const d = base > 0 ? Math.max(0, -s.sdf) * 20 : Math.max(0, s.sdf * 20);
  const dq = Math.min(7, Math.floor(d + 0.5));
  if (!beat) return packHeartVoxel(base, dq, []);
  const coarse = [base];
  for (let kk = 1; kk < BEAT_COARSE; kk++) coarse.push(paletteAt(c, q, kk * STRIDE, s));
  // lo que el corazón deja al latir (en alguna fase es corazón y en otra nada) es grasa del mediastino, no pulmón
  const fill = coarse.some((x) => x > 0) ? (x: number) => (x === 0 ? VACATED_IDX : x) : (x: number) => x;
  const changes: [number, number][] = [];
  for (let kk = 1; kk <= BEAT_COARSE; kk++) {
    const from = fill(coarse[kk - 1]);
    const to = fill(kk < BEAT_COARSE ? coarse[kk] : base);
    if (from === to) continue;
    let lo = (kk - 1) * STRIDE;
    let hi = kk * STRIDE;
    for (let st = 0; st < BEAT_BISECT; st++) {
      const mid = (lo + hi) >> 1;
      if (fill(paletteAt(c, q, mid, s)) === from) lo = mid;
      else hi = mid;
    }
    if (hi < HEART_PHASES) changes.push([hi, to]);
  }
  const ch = reduceChanges(changes, fill(base));
  return packHeartVoxel(fill(base), ch.length > 0 ? 0 : dq, ch);
}
const scratch = makeSample();

/** Hasta cuántos vóxeles guarda la gemela TS (cada uno con latido son 16–80 evaluaciones del clasificador): luego empieza de nuevo. */
const VOXEL_CACHE_MAX = 400_000;

/** Las palabras de cada vóxel de `c`, calculadas al pedirlas y guardadas (por vóxel y con o sin latido). */
function voxelCache(c: Cardiac): (i: number, j: number, k: number, beat: boolean) => HeartVoxelWords {
  const memo = new Map<number, HeartVoxelWords>();
  return (i, j, k, beat) => {
    const key = ((k * 1024 + j) * 1024 + i) * 2 + (beat ? 1 : 0);
    let w = memo.get(key);
    if (!w) {
      if (memo.size >= VOXEL_CACHE_MAX) memo.clear();
      memo.set(key, (w = voxelWords(c, i, j, k, beat)));
    }
    return w;
  };
}

/**
 * Los programas que hornean el volumen: un téxel por vóxel de la capa `uLayer` (RGBA16UI, `packHeartVoxel`). Sin `beat`, solo
 * telediástole (una evaluación por vóxel, sin bucle: SwiftShader desenrolla los bucles y con el del latido su JIT no acababa); con
 * `beat`, la línea de tiempo del latido (gemela de `voxelWords`: 16 fases gruesas, 4 pasos de bisección por cambio,
 * `reduceChanges`), con un solo sitio que llama al clasificador, dentro de un bucle: cada llamada más se inlinea entera. La fila de
 * la textura de parámetros (`et_row`) es la fase fina que se evalúa.
 */
function bakeFragment(beat: boolean): string {
  const defs = Object.entries(TISSUE_GLSL_NAME)
    .map(([i, n]) => `#define ${n} ${i}`)
    .join('\n');
  return /* glsl */ `#version 300 es
precision highp float;
precision highp int;
${defs}
uniform highp sampler2D uHeartTex;
uniform highp sampler3D uHeartNoise;
uniform int uLayer;
layout(location = 0) out uvec4 oVoxel;
${CARDIAC_GLSL}
${beat ? BEAT_MAIN : STATIC_MAIN}
`;
}

const STATIC_MAIN = /* glsl */ `
void main() {
  vec3 q = CARDIAC_BOX_MIN + (vec3(ivec3(int(gl_FragCoord.x), int(gl_FragCoord.y), uLayer)) + 0.5) * ${VOXEL_CM.toFixed(4)};
  et_Sample s;
  int base = et_classifyHeart(q, s) ? ET_TO_PALETTE[s.tissue] : 0;
  float d = base > 0 ? max(0.0, -s.sdf) * 20.0 : max(0.0, s.sdf * 20.0);
  oVoxel = uvec4(uint(base) | (uint(min(7.0, floor(d + 0.5))) << 3), 0u, 0u, 0u);
}`;

const BEAT_MAIN = /* glsl */ `
#define PHASES ${HEART_PHASES}
#define COARSE ${BEAT_COARSE}
#define STRIDE ${STRIDE}
#define BISECT ${BEAT_BISECT}
#define MAXT ${HEART_TRANSITIONS}
#define VACATED ${VACATED_IDX}
void main() {
  vec3 q = CARDIAC_BOX_MIN + (vec3(ivec3(int(gl_FragCoord.x), int(gl_FragCoord.y), uLayer)) + 0.5) * ${VOXEL_CM.toFixed(4)};
  int cc[COARSE];
  int chF[COARSE];
  int chC[COARSE];
  int n = 0;
  int base = 0;
  float sdf0 = 0.0;
  int stage = 0;
  int k = 0;
  int lo = 0;
  int hi = 0;
  int from = 0;
  int to = 0;
  int st = 0;
  int nCoarse = COARSE;
  bool any = false;
  for (int it = 0; it < COARSE + COARSE * BISECT; it++) {
    int f = stage == 0 ? STRIDE * k : (lo + hi) / 2;
    et_row = f;
    et_Sample s;
    int c = et_classifyHeart(q, s) ? ET_TO_PALETTE[s.tissue] : 0;
    if (stage == 0) {
      if (k == 0) { base = c; sdf0 = s.sdf; }
      cc[k] = c;
      any = any || c > 0;
      k++;
      if (k < nCoarse) continue;
      k = 1;
      // lo que el corazón deja al latir es grasa (VACATED), no nada
      if (any) {
        for (int kk = 0; kk < COARSE; kk++) if (cc[kk] == 0) cc[kk] = VACATED;
        if (base == 0) base = VACATED;
      }
    } else {
      if (any && c == 0) c = VACATED;
      if (c == from) lo = f; else hi = f;
      st++;
      if (st < BISECT) continue;
      if (hi < PHASES) { chF[n] = hi; chC[n] = to; n++; }
      k++;
    }
    // el siguiente cambio entre dos muestras gruesas (la última vuelve a la primera), o fin
    stage = 2;
    {
      for (int kk = 1; kk <= COARSE; kk++) {
        if (kk < k) continue;
        int a = cc[kk - 1];
        int b = kk < COARSE ? cc[kk] : base;
        if (a != b) { k = kk; from = a; to = b; lo = STRIDE * (kk - 1); hi = STRIDE * kk; st = 0; stage = 1; break; }
      }
    }
    if (stage == 2) break;
  }
  // los tramos más cortos se funden hasta dejar MAXT cambios (reduceChanges)
  for (int guard = 0; guard < COARSE; guard++) {
    if (n <= MAXT) break;
    int jmin = 1;
    int lmin = 100000;
    for (int j = 1; j <= COARSE; j++) {
      if (j > n) break;
      int e = j < n ? chF[j] : PHASES;
      int len = e - chF[j - 1];
      if (len < lmin) { lmin = len; jmin = j; }
    }
    for (int i = 0; i < COARSE - 1; i++) {
      if (i < jmin - 1 || i >= n - 1) continue;
      chF[i] = chF[i + 1];
      chC[i] = chC[i + 1];
    }
    n--;
    int prev = jmin - 1 >= 1 ? chC[jmin - 2] : base;
    if (jmin - 1 < n && chC[jmin - 1] == prev) {
      for (int i = 0; i < COARSE - 1; i++) {
        if (i < jmin - 1 || i >= n - 1) continue;
        chF[i] = chF[i + 1];
        chC[i] = chC[i + 1];
      }
      n--;
    }
  }
  float d = base > 0 ? max(0.0, -sdf0) * 20.0 : max(0.0, sdf0 * 20.0);
  uint dq = n > 0 ? 0u : uint(min(7.0, floor(d + 0.5)));
  uint t[MAXT];
  for (int i = 0; i < MAXT; i++) t[i] = i < n ? (uint(chF[i]) | (uint(chC[i]) << 8)) : 0u;
  oVoxel = uvec4(
    (uint(base) | (dq << 3) | (uint(n) << 6) | ((t[0] & 127u) << 9)) & 65535u,
    ((t[0] >> 7) | (t[1] << 4) | ((t[2] & 1u) << 15)) & 65535u,
    ((t[2] >> 1) | ((t[3] & 63u) << 10)) & 65535u,
    ((t[3] >> 6) | (t[4] << 5)) & 65535u
  );
}`;

/**
 * Coloca el corazón de EchoTwin en el corazón `h` de la escena (sobre la torso con su pared y la parrilla `cage`): su eje, el del
 * caso; su ápex (el del saco) en el del elipsoide de la decisión 18; después, llevado por la normal de la ventana hasta que su punto
 * más cercano a la pleura bajo el disco queda a `windowContactMm`. Las traslaciones se miden con el corazón de partida trasladado
 * (su geometría en su marco apenas depende de dónde está: solo la columna posterior, de la que queda lejos), y el corazón se
 * construye una vez en su sitio. Llena `h.cardiac`, el tapón (`plugDepthMm`, hasta el pericardio más hondo bajo el disco, más 1 mm)
 * y la esfera de la base que no respira (`h.base`).
 */
export function attachEchoTwinHeart(h: Heart, t: Torso, cage: RibCage): void {
  const P = HEART.params;
  const o = echoTwinOrigin(t, cage);
  const base0 = normalExcellentCase.anatomy.heartPosition.baseCm;
  const probe = buildCardiac(base0, o);
  const tip = cardiacApexCm(probe);
  const tipMm = cardiacPoint(probe, [0, 0, tip]);
  const toApex: Vec3 = [h.apex[0] - tipMm[0], h.apex[1] - tipMm[1], h.apex[2] - tipMm[2]];
  const near = windowDepths(h, t, (p) => cardiacSample(probe, [p[0] - toApex[0], p[1] - toApex[1], p[2] - toApex[2]]).tissue !== -1);
  // la normal de la pared en el centro de la ventana
  const wc = pleuraUnder(skinAtArc(h.window.u, h.window.z, t), t).p;
  const nw = wallInnerNormal(wc, t);
  const shift = near.length > 0 ? Math.min(...near) - P.windowContactMm.value : 0;
  const move: Vec3 = [toApex[0] + nw[0] * shift, toApex[1] + nw[1] * shift, toApex[2] + nw[2] * shift];
  // el origen movido, en el tórax de EchoTwin (las direcciones cambian el nombre de y y z, en cm)
  const cardiac = buildCardiac({ x: base0.x + move[0] / 10, y: base0.y + move[2] / 10, z: base0.z + move[1] / 10 }, o);
  h.cardiac = cardiacRuntime(cardiac, tip);
  // el tapón: hasta el pericardio más hondo bajo el disco, más 1 mm
  h.plugDepthMm = Math.max(0, ...windowDepths(h, t, (p) => cardiacSample(cardiac, p).tissue !== -1)) + 1;
  const B = CARDIAC_BASE_SPHERE_CM;
  h.base = { c: cardiacPoint(cardiac, B.c), r: 10 * B.r };
}

/**
 * Lo que la GPU hornea de un corazón colocado, uno por corazón (`buildCardiac` los recuerda por su sitio): una escena nueva con el
 * mismo paciente (otra respiración, «Restablecer paciente») trae el mismo, y el renderizador no lo vuelve a hornear (≈ 0,5 s con
 * GPU, ≈ 46 s con SwiftShader).
 */
const runtimes = new WeakMap<Cardiac, CardiacRuntime>();
function cardiacRuntime(cardiac: Cardiac, tip: number): CardiacRuntime {
  const known = runtimes.get(cardiac);
  if (known) return known;
  const { min, max } = CARDIAC_BOX_CM;
  const dims: [number, number, number] = [0, 1, 2].map((a) => Math.ceil((max[a] - min[a]) / VOXEL_CM)) as [number, number, number];
  const originMm = cardiacPoint(cardiac, min);
  const half: Vec3 = [0, 1, 2].map((a) => (dims[a] * VOXEL_MM) / 2) as Vec3;
  const centre = cardiacPoint(cardiac, [min[0] + half[0] / 10, min[1] + half[1] / 10, min[2] + half[2] / 10]);
  const runtime: CardiacRuntime = {
    cardiac,
    vol: {
      originMm,
      ex: cardiac.ex,
      ey: cardiac.ey,
      ez: cardiac.ez,
      voxelMm: VOXEL_MM,
      dims,
      sphere: { c: centre, r: Math.hypot(half[0], half[1], half[2]) + 1 },
      voxel: voxelCache(cardiac),
    },
    params: cardiac.params,
    paramsAt: (f) => cardiacParamsAt(cardiac, f),
    paramTexels: CARDIAC_TEX_TEXELS,
    noise: cardiac.noise,
    bakeFragment: bakeFragment(false),
    beatFragment: bakeFragment(true),
    apexMm: cardiacPoint(cardiac, [0, 0, tip]),
  };
  runtimes.set(cardiac, runtime);
  return runtime;
}
