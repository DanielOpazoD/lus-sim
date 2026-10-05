import type { Vec3 } from '../../core/vec3';
import { torsoDepth, type Torso } from '../primitives';
import { TISSUE_GLSL_NAME } from '../tissues';
import { HEART, echoTwinOrigin, type CardiacRuntime, type Heart } from '../organs/heart';
import type { RibCage } from '../organs/ribcage';
import { wallArc, wallInnerNormal, wallTotalMm } from '../organs/wall';
import {
  CARDIAC_BASE_SPHERE_CM,
  CARDIAC_BOX_CM,
  CARDIAC_GLSL,
  CARDIAC_TEX_TEXELS,
  ET_TO_LUS_TISSUE,
  buildCardiac,
  cardiacPoint,
  cardiacSample,
  type Cardiac,
} from './cardiac';
import { classifyHeart } from './heartModel';
import { normalExcellentCase } from './normal-excellent';
import { makeSample } from './tissue';

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

/** Lo que el clasificador dice en el centro del vóxel (i, j, k): código (tejido de lus-sim + 1, o 0) y décimas de mm, `code | dq << 8`. */
export function voxelCode(c: Cardiac, i: number, j: number, k: number): number {
  const min = CARDIAC_BOX_CM.min;
  const s = scratch;
  const hit = classifyHeart(c.model, c.pose, min[0] + (i + 0.5) * VOXEL_CM, min[1] + (j + 0.5) * VOXEL_CM, min[2] + (k + 0.5) * VOXEL_CM, s);
  const d = hit ? Math.max(0, -s.sdf) * 100 : Math.max(0, s.sdf * 100);
  const dq = Math.min(255, Math.floor(d + 0.5));
  return (hit ? ET_TO_LUS_TISSUE[s.tissue] + 1 : 0) | (dq << 8);
}
const scratch = makeSample();

/** El programa que hornea el volumen: un téxel por vóxel de la capa `uLayer` (RG8UI: código y décimas de mm). */
function bakeFragment(): string {
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
void main() {
  vec3 q = CARDIAC_BOX_MIN + (vec3(ivec3(int(gl_FragCoord.x), int(gl_FragCoord.y), uLayer)) + 0.5) * ${VOXEL_CM.toFixed(4)};
  et_Sample s;
  bool hit = et_classifyHeart(q, s);
  float d = hit ? max(0.0, -s.sdf) * 100.0 : max(0.0, s.sdf * 100.0);
  oVoxel = uvec4(hit ? uint(ET_TO_LUS_TISSUE[s.tissue] + 1) : 0u, uint(min(255.0, floor(d + 0.5))), 0u, 0u);
}
`;
}

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
      voxel: (i, j, k) => voxelCode(cardiac, i, j, k),
    },
    params: cardiac.params,
    paramTexels: CARDIAC_TEX_TEXELS,
    noise: cardiac.noise,
    bakeFragment: bakeFragment(),
    apexMm: cardiacPoint(cardiac, [0, 0, tip]),
  };
  runtimes.set(cardiac, runtime);
  return runtime;
}
