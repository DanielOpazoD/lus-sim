import { defineParameters } from '../../core/evidence';
import type { Vec3 } from '../../core/vec3';
import type { Torso } from '../primitives';
import { wallArc } from './wall';

/**
 * La fosa supraclavicular (lus-sim, decisión 50): por encima de la clavícula, la piel del tronco cilíndrico (`thorax-cylindrical-cage`)
 * no es la del paciente. La fosa es una depresión, y bajo su piel no están el pectoral y los intercostales del tórax sino las
 * partes blandas del cuello. Antes, la pleura de la cúpula quedaba a 27–31 mm de la piel por la fosa y a 44,5 mm desde encima del
 * vértice, cuando Yadav y cols. la miden a 1,7 ± 0,8 cm.
 *
 * Modelo, por columna de |u| de la pared (la tabla de `organs/chestWall.ts`), sobre la piel fija del cilindro:
 *  - **La depresión** (`fossaDepthMm`): la pared se adelgaza F(u, z) por encima del borde superior de la clavícula, de 0 en él a su
 *    hondura entera `fossaRiseMm` más arriba, sobre la fosa supraclavicular mayor (el tercio medio de la clavícula, Gray). La cara
 *    interna de la pared, la pleura de la cúpula, sube hacia la piel lo que la piel real está más honda que la del cilindro: la
 *    sonda apoyada en la fosa ve la cúpula a la hondura de la fosa real. Lo que ocupa la depresión no existe: la anatomía honda
 *    (la cúpula, la 1.ª costilla, la clavícula) no se mueve respecto de la clavícula.
 *  - **Las capas del cuello** (`neckLayers`): sobre la clavícula, el músculo de la pared ya no es el pectoral sino, por dentro del
 *    tercio medial, el esternocleidomastoideo (`scmMm`, con su cabeza clavicular, Gray) y bajo él el escaleno, separados por un
 *    plano de fascia; por fuera, en la fosa mayor, grasa (el triángulo posterior, con el plexo y los vasos) sobre un suelo de
 *    músculo (`floorMm`, el escaleno medio) y la fascia de Sibson (el complejo pleural de la pared), sin pasar de la hondura del
 *    plexo braquial (`plexusDepthMm`). Sobre el tercio lateral (el trapecio y el deltoides), la pared del tórax.
 */
export const SUPRACLAVICULAR = defineParameters('anatomy.supraclavicular', {
  fossaDepthMm: {
    value: 15,
    unit: 'mm',
    range: [8, 18],
    evidence: 'estimado',
    sources: ['yadav-supraclavicular-2016'],
    note:
      'Lo que la piel de la fosa supraclavicular mayor está más honda que la del tronco cilíndrico [SUPUESTO: la hondura de la ' +
      'fosa, NO ENCONTRADO]: se elige para que la sonda en la fosa (sobre el tercio medio de la clavícula, transversal e inclinada ' +
      'hacia los pies) vea la cúpula a la hondura media de Yadav y cols. (1,7 ± 0,8 cm, 100 voluntarios de IMC 22,7). Con ello, A-T24 ' +
      'es una calibración, no una validación independiente',
  },
  fossaRiseMm: {
    value: 8,
    unit: 'mm',
    range: [5, 15],
    evidence: 'estimado',
    sources: [],
    note: 'Altura sobre el borde superior de la clavícula en la que la depresión llega a su hondura [SUPUESTO]',
  },
  fossaBlendMm: {
    value: 15,
    unit: 'mm',
    range: [8, 25],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Ancho (mm de piel) del paso de la depresión a sus lados: la fosa mayor está sobre el tercio medio de la clavícula y la ' +
      'cabeza clavicular del esternocleidomastoideo nace del tercio medial (Gray); el paso, [SUPUESTO]',
  },
  scmMm: {
    value: 3.93,
    unit: 'mm',
    range: [1.63, 6.23],
    evidence: 'documentado',
    sources: ['berk-subclavia-2026', 'pirri-ecm-2021', 'sidiropoulos-ecm-2025'],
    note:
      'Grosor del esternocleidomastoideo por la fosa, sobre el tercio medial de la clavícula: 3,93 ± 2,30 mm (Berk y cols., 20 adultos; ' +
      'Tabla 2; 7,05 ± 3,94 sobre la unión de la subclavia con el tronco braquiocefálico). A media altura del cuello es más grueso: ' +
      '8,1 ± 2,0 mm (Pirri y cols.) y 9,8 ± 1,8 en C3–C4 (Sidiropoulos y cols.)',
  },
  subclavianArteryRadiusMm: {
    value: 3.5,
    unit: 'mm',
    range: [2.5, 5.45],
    evidence: 'estimado',
    sources: ['hosseinzadeh-subclavia-2024'],
    note:
      'Radio de la arteria subclavia en la fosa [SUPUESTO: 7 mm de diámetro]: en su origen mide 10,9 ± 2,5 mm (la izquierda, angio-TC ' +
      'de 164 adultos de 57 años, Hosseinzadeh y cols.) y se estrecha al dar sus ramas; en su tercera porción, NO ENCONTRADO',
  },
  subclavianArteryArchMm: {
    value: 6,
    unit: 'mm',
    range: [4.9, 24.9],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Lo que sube la cima del arco de la arteria subclavia sobre la arteria apoyada en el borde superior de la clavícula (su eje ' +
      'a radio + pared + 1 mm sobre él): la cima del eje queda a 11,1 mm sobre el borde, dentro de los 1–3 cm de Gray (la línea de la ' +
      'subclavia, convexa hacia arriba, de la articulación esternoclavicular a la mitad de la clavícula, «Surface Markings of ' +
      'Special Regions of the Head and Neck») [SUPUESTO: el valor dentro del rango]',
  },
  subclavianArteryPleuraGapMm: {
    value: 1,
    unit: 'mm',
    range: [0.5, 3],
    evidence: 'estimado',
    sources: ['yadav-supraclavicular-2016'],
    note:
      'Lo que separa la pared de la arteria de la pleura de la cúpula [SUPUESTO]: el «corner pocket» de Yadav y cols. es la unión ' +
      'de la 1.ª costilla, la pleura y la arteria subclavia',
  },
  plexusDepthMm: {
    value: 13.4,
    unit: 'mm',
    range: [9.5, 17.3],
    evidence: 'documentado',
    sources: ['mistry-plexo-2016'],
    note:
      'Piel → el elemento más hondo del plexo braquial por la fosa supraclavicular: 1,34 ± 0,39 cm (Mistry y cols., 87 adultos de ' +
      'IMC 22,9). En el modelo, lo más hondo que llega la grasa del triángulo posterior y el eje de la arteria donde no hay cúpula ' +
      'debajo (el plexo va junto a ella) [SUPUESTO: los dos a esa hondura]',
  },
  subclavianVeinRadiusMm: {
    value: 4.73,
    unit: 'mm',
    range: [3.85, 5.6],
    evidence: 'documentado',
    sources: ['berk-subclavia-2026'],
    note: 'La vena subclavia por la fosa, sobre el tercio medial de la clavícula: 9,47 ± 1,78 mm (Berk y cols., 20 adultos; Tabla 2); el radio, la mitad',
  },
  subclavianVeinDepthMm: {
    value: 10.55,
    unit: 'mm',
    range: [8.5, 12.6],
    evidence: 'documentado',
    sources: ['berk-subclavia-2026'],
    note:
      'Piel → vena subclavia por la fosa, sobre el tercio medial de la clavícula: 10,55 ± 2,01 mm (Berk y cols.; no dicen a qué ' +
      'pared miden: se toma la de delante)',
  },
  floorMm: {
    value: 3,
    unit: 'mm',
    range: [2, 6],
    evidence: 'estimado',
    sources: ['chen-plexo-pleura-2021'],
    note:
      'El suelo muscular de la fosa mayor sobre la cúpula (el escaleno medio y la fascia prevertebral) [SUPUESTO]: entre el tronco ' +
      'inferior del plexo y la pleura hay 4,2 ± 0,6 mm en supino (Chen y cols.), de los que este suelo es una parte',
  },
});

/** La clavícula que mira la fosa (la de `RibCage.clavicle`): su arco de piel (u0 → u1), la altura de su eje y su radio. */
export interface FossaClavicle {
  u0: number;
  u1: number;
  z0: number;
  rise: number;
  radius: number;
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * El téxel de la fosa de la columna |u| para la tabla de la pared: (z del borde superior de la clavícula, hondura de la depresión,
 * peso del esternocleidomastoideo, peso del cuello). La depresión, sobre el tercio medio de la clavícula con un paso de
 * `fossaBlendMm` a cada lado (por dentro, hasta un paso antes del fin del tercio medial: la fosa mayor llega al borde posterior del
 * esternocleidomastoideo); el esternocleidomastoideo, sobre el tercio medial; el cuello (las capas del cuello en lugar de las del
 * tórax sobre la clavícula), de la línea media al final del tercio medio y un paso más.
 */
export function fossaColumn(au: number, c: FossaClavicle): [number, number, number, number] {
  const P = SUPRACLAVICULAR.params;
  const b = P.fossaBlendMm.value;
  const third = (c.u1 - c.u0) / 3;
  const f = Math.min(1, Math.max(0, (au - c.u0) / (c.u1 - c.u0)));
  const zTop = c.z0 + c.rise * f + c.radius;
  const m1 = c.u0 + third;
  const m2 = c.u0 + 2 * third;
  const depression = P.fossaDepthMm.value * smooth(m1 - 2 * b, m1 - b, au) * (1 - smooth(m2, m2 + b, au));
  const scm = 1 - smooth(m1 - b, m1, au);
  // sobre el tercio lateral (el trapecio y el deltoides), la pared del tórax: el cuello va de la línea media al final del tercio medio
  const neck = 1 - smooth(m2, m2 + b, au);
  return [zTop, depression, scm, neck];
}

/** Peso en altura de la fosa en la columna con el téxel `col` (0 bajo el borde superior de la clavícula, 1 a `fossaRiseMm` sobre él). */
export function fossaHeight(col: readonly [number, number, number, number], z: number): number {
  return smooth(col[0], col[0] + SUPRACLAVICULAR.params.fossaRiseMm.value, z);
}

/**
 * Las capas de la pared sobre la clavícula (gemelo GLSL `neckLayers`): con las de la pared del tórax (`skin`, `fat`, `pre`, `band`) y el
 * grosor W ya adelgazado por la depresión, la grasa y la banda de la columna `col` a la altura de peso `h`. Por fuera del
 * esternocleidomastoideo, lo que hay entre la grasa subcutánea y el suelo muscular es grasa (el triángulo posterior); por dentro, bajo
 * la grasa, el esternocleidomastoideo (`scmMm`) y el escaleno, con un plano entre los dos (el plano músculo–intercostal de la pared,
 * `band` desde la fascia endotorácica). Devuelve [grasa, banda].
 */
export function neckLayers(
  col: readonly [number, number, number, number],
  h: number,
  W: number,
  skin: number,
  fat: number,
  pre: number,
  band: number,
): [number, number] {
  const P = SUPRACLAVICULAR.params;
  const w = col[3] * h;
  const s = col[2];
  const room = Math.max(0, W - skin - fat - pre);
  // la grasa del triángulo posterior, hasta el suelo y nunca más honda que el plexo (sobre el techo de la cúpula, la pared es el
  // cuello entero: sin el tope, la grasa saltaba a cientos de milímetros)
  const fatN = fat + (1 - s) * Math.min(Math.max(0, room - P.floorMm.value), Math.max(0, P.plexusDepthMm.value - skin - fat));
  const muscle = Math.max(0, W - skin - fatN - pre);
  const bandN = Math.max(0, muscle - s * P.scmMm.value);
  return [fat + w * (fatN - fat), band + w * (bandN - band)];
}

const f4 = (x: number): string => x.toFixed(4);

/** Gemelo GLSL de `fossaHeight` y `neckLayers`. */
export const SUPRACLAVICULAR_GLSL = /* glsl */ `
#define FOSSA_RISE ${f4(SUPRACLAVICULAR.params.fossaRiseMm.value)}
#define FOSSA_FLOOR ${f4(SUPRACLAVICULAR.params.floorMm.value)}
#define FOSSA_SCM ${f4(SUPRACLAVICULAR.params.scmMm.value)}
#define FOSSA_PLEXUS ${f4(SUPRACLAVICULAR.params.plexusDepthMm.value)}
float fossaHeight(vec4 col, float z) { return smoothstep(col.x, col.x + FOSSA_RISE, z); }
vec2 neckLayers(vec4 col, float h, float W, float skin, float fat, float pre, float band) {
  float w = col.w * h;
  float s = col.z;
  float room = max(0.0, W - skin - fat - pre);
  float fatN = fat + (1.0 - s) * min(max(0.0, room - FOSSA_FLOOR), max(0.0, FOSSA_PLEXUS - skin - fat));
  float muscle = max(0.0, W - skin - fatN - pre);
  float bandN = max(0.0, muscle - s * FOSSA_SCM);
  return vec2(fat + w * (fatN - fat), band + w * (bandN - band));
}
`;

/**
 * El punto de la pared en (u, z) a la profundidad d bajo la piel por la radial del tronco (la métrica de las capas: `torsoDepth`),
 * en coordenadas del paciente. u con signo (+x, izquierda del paciente).
 */
export function wallPoint(u: number, z: number, d: number, t: Pick<Torso, 'a' | 'b'>): Vec3 {
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
