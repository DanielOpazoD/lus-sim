import { defineParameters } from '../../core/evidence';
import { add, normalize, scale, sub, type Vec3 } from '../../core/vec3';
import { Interface } from '../interfaces';
import type { Spine, Torso, Tube } from '../primitives';
import { BOWEL_BD_CAP_MM, Tissue } from '../tissues';
import { kidneyWorld, type Kidney } from './kidney';
import { LUNG_BORDER_BASE, LUNG_BORDER_TEXELS } from './lungBorder';
import { SUPRACLAVICULAR, wallPoint, type FossaClavicle } from './supraclavicular';

/**
 * Los vasos del hilio del bazo y de los riñones (lus-sim, decisión 46; VExUS tiene los renales y una arteria esplénica desde el
 * tronco celíaco, `vesselTree.ts`, que no se porta: aquí van desde el hilio del bazo): la arteria y
 * la vena esplénicas desde el hilio del bazo hacia la línea media, y la arteria y la vena renales de cada lado desde el seno del
 * riñón. Tubos de VExUS (`Tube`, la cadena de cápsulas de `tubeQuery`) con su pared, anecoicos en el modo B; sin Doppler (la
 * unión con VExUS, decisión 1, lo traerá).
 *
 * Calibres: los de adultos sanos por ecografía donde los hay (la vena esplénica: Strohm y cols., Huang y cols., Stella y cols.) y
 * por TC donde no (la arteria esplénica: Brinkman y cols., Moraes y cols.; la renal: Turba y cols.; las venas renales: Durur
 * Karakaya y cols.). Los caminos se anclan a la anatomía de la escena (el hilio del bazo, el de cada riñón y la columna) para que
 * sigan al hábito; su trazado medial es [SUPUESTO] con la anatomía de manual (Gray): la vena esplénica corre medial por detrás del
 * páncreas y por delante del riñón izquierdo; la arteria, craneal a ella y sinuosa; la vena renal izquierda cruza por delante
 * de la aorta, la arteria renal derecha pasa por detrás de la cava. El modelo no tiene la aorta, la cava ni la porta: los vasos
 * acaban ciegos a 0–2,8 cm de la línea media (`hilum-vessels-blind-ends`), y no tiene el páncreas (el «resto»).
 */
export const HILUM_VESSELS = defineParameters('anatomy.hilumVessels', {
  splenicVeinRadiusMm: {
    value: 3.3,
    unit: 'mm',
    range: [2.5, 4],
    evidence: 'documentado',
    sources: ['strohm-venas-1983', 'huang-esplenica-2018', 'stella-esplenica-1993'],
    note:
      'Ecografía en adultos sanos: Strohm y cols., 6,6 ± 2,3 mm (26 sanos); Huang y cols., 6,2 ± 0,2 (30 voluntarios); Stella y ' +
      'cols., < 8 mm en el hilio en el 98 % de 1200. El radio, la mitad de 6,6 mm. La TC (≈ 9 mm, Durur Karakaya y cols.) y la RM ' +
      '4D (≈ 12 mm) dan más',
  },
  splenicArteryRadiusHilumMm: {
    value: 2,
    unit: 'mm',
    range: [1.5, 2.8],
    evidence: 'documentado',
    sources: ['brinkman-esplenica-2021', 'huang-esplenica-2018'],
    note:
      'Brinkman y cols. (TC, 80 adultos): se estrecha del origen al hilio; al 75 % del trayecto, 3,5–6,0 mm. Huang y cols. ' +
      '(Doppler, 30 sanos): 3,5 ± 0,6 mm. El radio junto al hilio, 2 mm (4 mm de diámetro)',
  },
  splenicArteryRadiusMedialMm: {
    value: 2.6,
    unit: 'mm',
    range: [2, 3.6],
    evidence: 'documentado',
    sources: ['brinkman-esplenica-2021', 'moraes-esplenica-2022'],
    note:
      'Brinkman y cols.: al 50 % del trayecto, 4,0–6,0 mm según edad y sexo; Moraes y cols. (TC, 1235 pacientes): 5,9 ± 1,2 mm en ' +
      'el origen. El extremo medial del modelo, a ≈ 2,5 cm de la línea media, va a 5,2 mm',
  },
  renalArteryRadiusMm: {
    value: 2.45,
    unit: 'mm',
    range: [2, 3],
    evidence: 'documentado',
    sources: ['turba-renal-2009'],
    note: 'Turba y cols. (angio-TC, 399 adultos): en el ostium, 4,6–5,1 mm según lado y sexo. El radio, la mitad de 4,9',
  },
  renalVeinLeftRadiusMm: {
    value: 4.7,
    unit: 'mm',
    range: [3.5, 5.5],
    evidence: 'documentado',
    sources: ['durur-esplenica-2025'],
    note: 'Durur Karakaya y cols. (angio-TC, 47 de sus 50 controles sanos con la vena renal izquierda medida): 9,47 ± 1,12 mm a 2 cm de la cava. La ecografía, NO ENCONTRADA',
  },
  renalVeinRightRadiusMm: {
    value: 5,
    unit: 'mm',
    range: [3.8, 5.8],
    evidence: 'documentado',
    sources: ['durur-esplenica-2025'],
    note: 'Durur Karakaya y cols.: 10,08 ± 1,23 mm a 1 cm de la cava',
  },
  veinWallMm: {
    value: 0.6,
    unit: 'mm',
    range: [0.4, 1],
    evidence: 'estimado',
    sources: [],
    note: 'La pared de las venas finas de VExUS (`VesselWallThin`, la de sus venas renales) [SUPUESTO]',
  },
  arteryWallMm: {
    value: 0.6,
    unit: 'mm',
    range: [0.4, 1.2],
    evidence: 'estimado',
    sources: [],
    note: 'La pared de las arterias de VExUS (`ArteryWall`, la de sus arterias renales) [SUPUESTO]',
  },
});

export type HilumVesselId =
  | 'splenicVein'
  | 'splenicArtery'
  | 'renalVeinRight'
  | 'renalArteryRight'
  | 'renalVeinLeft'
  | 'renalArteryLeft'
  // lus-sim (decisión 50): los vasos subclavios, en la misma tabla (`organs/supraclavicular.ts`)
  | 'subclavianArteryRight'
  | 'subclavianVeinRight'
  | 'subclavianArteryLeft'
  | 'subclavianVeinLeft';

/** Un vaso del hilio: su tubo, el tejido y el grosor de su pared y la cara de su luz. */
export interface HilumVessel {
  id: HilumVesselId;
  tube: Tube;
  wallTissue: Tissue;
  wallMm: number;
  lumenInterface: Interface;
}

/** Cuánto entra cada vaso en el bazo desde el hilio (mm) [SUPUESTO]: el tronco que se divide en él (Moraes y cols.: 95 % en dos). */
export const SPLENIC_INTRA_MM = 5;
/** Cuánto se arquea hacia delante el camino de los vasos esplénicos (mm) [SUPUESTO]: por delante del riñón izquierdo. */
export const SPLENIC_BOW_MM = 10;
/** La arteria esplénica va craneal a la vena (mm) [SUPUESTO; Gray: por el borde superior del páncreas]. */
export const SPLENIC_ARTERY_CRANIAL_MM = 10;
/** Su sinuosidad (mm en z, dos ondas hacia arriba, sin acercarse a la vena) [SUPUESTO; Brinkman y cols.: asas en el 86 %]. */
export const SPLENIC_ARTERY_WAVE_MM = 3;
/** Fracción del camino de los esplénicos donde acaba su calibre medial; lo que sigue es el muñón ciego. */
export const SPLENIC_FULL_T = 0.93;
/** El extremo ciego se estrecha a esta fracción del radio en su último tramo (el vaso sale del modelo) [SUPUESTO]. */
export const BLIND_END_TAPER = 0.6;

const tube = (nodes: Array<[Vec3, number]>): Tube => ({ kind: 'tube', nodes: nodes.map(([p, r]) => ({ p, r })), apScale: 1 });

/**
 * Los vasos del hilio. `spleenHilum`: el punto de la cara visceral del bazo en su parte gástrica (`AnatomyScene` lo busca);
 * `spleenInward`: la dirección hacia dentro del bazo en él. Los extremos mediales, respecto a la columna (en VExUS, la aorta va
 * 24 mm por delante del centro del cuerpo vertebral y 17 a la izquierda; la cava, 30 por delante y 21 a la derecha).
 */
export function buildHilumVessels(spleenHilum: Vec3, spleenInward: Vec3, kidneys: readonly [Kidney, Kidney], spine: Spine): HilumVessel[] {
  const P = HILUM_VESSELS.params;
  const vein = (id: HilumVesselId, nodes: Array<[Vec3, number]>): HilumVessel => ({
    id,
    tube: tube(nodes),
    wallTissue: Tissue.VesselWallThin,
    wallMm: P.veinWallMm.value,
    lumenInterface: Interface.VeinLumen,
  });
  const artery = (id: HilumVesselId, nodes: Array<[Vec3, number]>): HilumVessel => ({
    id,
    tube: tube(nodes),
    wallTissue: Tissue.ArteryWall,
    wallMm: P.arteryWallMm.value,
    lumenInterface: Interface.ArteryLumen,
  });
  const at = (dx: number, dy: number, z: number): Vec3 => [spine.x0 + dx, spine.y0 + dy, z];

  // los esplénicos: del hilio hacia la línea media, arqueados hacia delante (por delante del riñón izquierdo)
  const inward = normalize(spleenInward);
  const splenic = (cranial: number, rHilum: number, rMedial: number, wave: number): Array<[Vec3, number]> => {
    const h = add(spleenHilum, [0, 0, cranial]);
    const start = add(h, scale(inward, SPLENIC_INTRA_MM));
    const end = at(25, 56, spleenHilum[2] - 2 + cranial);
    const out: Array<[Vec3, number]> = [[start, rHilum]];
    // el calibre medial se alcanza en `SPLENIC_FULL_T`; el último tramo, de ≈ 6 mm, es el muñón ciego que se estrecha
    const ts = [0, 0.2, 0.45, 0.72, SPLENIC_FULL_T, 1];
    for (const t of ts) {
      const base = add(h, scale(sub(end, h), t));
      const p: Vec3 = add(base, [0, SPLENIC_BOW_MM * Math.sin(Math.PI * t), 0.5 * wave * (1 - Math.cos(4 * Math.PI * t))]);
      const r = t === 1 ? rMedial * BLIND_END_TAPER : rHilum + (rMedial - rHilum) * Math.min(1, t / SPLENIC_FULL_T);
      out.push([p, r]);
    }
    return out;
  };
  const sv = P.splenicVeinRadiusMm.value;
  const out: HilumVessel[] = [
    vein('splenicVein', splenic(0, sv, sv, 0)),
    artery(
      'splenicArtery',
      splenic(SPLENIC_ARTERY_CRANIAL_MM, P.splenicArteryRadiusHilumMm.value, P.splenicArteryRadiusMedialMm.value, SPLENIC_ARTERY_WAVE_MM),
    ),
  ];

  // los renales (los nodos del seno y del hilio, los de VExUS en el marco del riñón): la vena por delante, la arteria detrás
  const ra = P.renalArteryRadiusMm.value;
  for (const k of [0, 1] as const) {
    const kid = kidneys[k];
    const ant = k === 0 ? 1 : -1; // el w del riñón izquierdo apunta atrás (su base es especular)
    const kw = (q: Vec3) => kidneyWorld(q, kid);
    // VExUS los separa 9 mm en w; con la vena derecha de 10 mm de Durur Karakaya y cols. se tocaban: 10,5 en w y la arteria 3 mm
    // hacia el polo superior (Gray: la vena delante, la arteria en medio, la pelvis detrás) [SUPUESTO]
    const hv = kw([0, kid.radii[1] - 2, 6 * ant]);
    const ha = kw([3, kid.radii[1] - 2, -4.5 * ant]);
    const rv = k === 0 ? P.renalVeinRightRadiusMm.value : P.renalVeinLeftRadiusMm.value;
    if (k === 0) {
      // derecha: la vena, corta, hacia la cava; la arteria, por detrás de donde va la cava, desde la aorta
      out.push(
        vein('renalVeinRight', [
          [kw([0, 8, 6 * ant]), 0.85 * rv],
          [hv, rv],
          [at(-30, 37, hv[2] + 1), rv],
          [at(-23, 34, hv[2] + 2), rv * BLIND_END_TAPER],
        ]),
        artery('renalArteryRight', [
          [kw([3, 6, -4.5 * ant]), 0.9 * ra],
          [ha, ra],
          [at(-28, 15, ha[2] + 1), ra],
          [at(-12, 18, ha[2] + 3), ra],
          [at(0, 22, ha[2] + 4), ra * BLIND_END_TAPER],
        ]),
      );
    } else {
      // izquierda: la vena, larga, por delante de donde va la aorta; la arteria, corta, hacia la aorta
      out.push(
        vein('renalVeinLeft', [
          [kw([0, 8, 6 * ant]), 0.85 * rv],
          [hv, rv],
          [at(30, 40, hv[2] - 0.5), rv],
          [at(15, 44, hv[2] - 1.5), rv * BLIND_END_TAPER],
        ]),
        artery('renalArteryLeft', [
          [kw([3, 6, -4.5 * ant]), 0.9 * ra],
          [ha, ra],
          [at(28, 27, ha[2]), ra * BLIND_END_TAPER],
        ]),
      );
    }
  }
  return out;
}

/** Los vasos subclavios de la escena: la arteria y la vena de cada lado (derecho, izquierdo). */
export type SubclavianVesselId = 'subclavianArteryRight' | 'subclavianVeinRight' | 'subclavianArteryLeft' | 'subclavianVeinLeft';

/**
 * La arteria y la vena subclavias de cada lado (lus-sim, decisión 50), tubos como los vasos del hilio (decisión 46), anecoicos y
 * sin Doppler, en la pared sobre la clavícula. `totalAt(u, z)`: el grosor de la pared (la cara interna, la pleura de la cúpula, ya con
 * la depresión de la fosa).
 *  - La arteria, la tercera porción y la cima de su arco: sobre la pleura de la cúpula (a `subclavianArteryPleuraGapMm` de ella), de
 *    detrás del esternocleidomastoideo a la fosa mayor, subiendo `subclavianArteryArchMm` sobre el borde de la clavícula en la mitad;
 *    sus extremos acaban ciegos (el modelo no tiene el tronco braquiocefálico ni la arteria axilar, `subclavian-vessels-short`).
 *  - La vena, sobre el tercio medial: por detrás del borde superior de la clavícula, a la hondura de Berk y cols., sin tocar el hueso.
 */
export function buildSubclavianVessels(
  t: Pick<Torso, 'a' | 'b'>,
  c: FossaClavicle,
  totalAt: (u: number, z: number) => number,
  skinAt: (u: number, z: number) => number,
): Array<HilumVessel & { id: SubclavianVesselId }> {
  const P = SUPRACLAVICULAR.params;
  const H = HILUM_VESSELS.params;
  const third = (c.u1 - c.u0) / 3;
  const top = (au: number) => c.z0 + c.rise * Math.min(1, Math.max(0, (au - c.u0) / (c.u1 - c.u0))) + c.radius;
  const ra = P.subclavianArteryRadiusMm.value;
  const rv = P.subclavianVeinRadiusMm.value;
  const out: Array<HilumVessel & { id: SubclavianVesselId }> = [];
  for (const side of [-1, 1] as const) {
    // la arteria: del final del tercio medial a la mitad de la clavícula (Gray), en arco sobre ella
    const aNodes: Array<{ p: Vec3; r: number }> = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const au = c.u0 + third * (0.75 + 0.75 * f);
      let r = i === 0 || i === n - 1 ? 0.6 * ra : ra;
      const wall = H.arteryWallMm.value;
      // entera sobre el borde superior de la clavícula (la cruza por detrás: el modelo no tiene sitio entre ella y la pleura)
      const z = top(au) + r + wall + 1 + P.subclavianArteryArchMm.value * Math.sin(Math.PI * f);
      // sobre la pleura: la menor hondura de su cara interna alrededor del nodo (la cúpula y la depresión la inclinan)
      const reach = r + wall + 2;
      let floor = Infinity;
      for (let du = -reach; du <= reach; du += 1)
        for (let dz = -reach; dz <= reach; dz += 1) floor = Math.min(floor, totalAt(side * (au + du), z + dz));
      // entre la piel y la pleura (con la grasa fina del hábito delgado, la fosa tiene 12 mm: la arteria se estrecha lo que falte)
      const skin = skinAt(side * au, z) + 1.2;
      r = Math.max(1.5, Math.min(r, 0.5 * (floor - P.subclavianArteryPleuraGapMm.value - skin) - wall));
      // por fuera de la cúpula (sobre su techo, donde la pared es el cuello entero), a la hondura de la cara profunda del plexo
      const d = Math.max(skin + r + wall, Math.min(floor - r - wall - P.subclavianArteryPleuraGapMm.value, P.plexusDepthMm.value));
      aNodes.push({ p: wallPoint(side * au, z, d, t), r });
    }
    // la vena: sobre el tercio medial, su cara de delante a la hondura de Berk y por detrás del borde de la clavícula
    const vNodes: Array<{ p: Vec3; r: number }> = [];
    for (let i = 0; i < 4; i++) {
      const f = i / 3;
      const au = c.u0 + third * (0.15 + 0.3 * f);
      // por encima del borde de la clavícula lo justo para no tocarla (su eje está 10 mm bajo la piel y la vena 15 bajo ella)
      const z = top(au) + rv + 2.5;
      const r = i === 0 || i === 3 ? 0.6 * rv : rv;
      vNodes.push({ p: wallPoint(side * au, z, P.subclavianVeinDepthMm.value + rv, t), r });
    }
    const tube = (nodes: Array<{ p: Vec3; r: number }>): Tube => ({ kind: 'tube', nodes, apScale: 1 });
    out.push(
      {
        id: side < 0 ? 'subclavianArteryRight' : 'subclavianArteryLeft',
        tube: tube(aNodes),
        wallTissue: Tissue.ArteryWall,
        wallMm: H.arteryWallMm.value,
        lumenInterface: Interface.ArteryLumen,
      },
      {
        id: side < 0 ? 'subclavianVeinRight' : 'subclavianVeinLeft',
        tube: tube(vNodes),
        wallTissue: Tissue.VesselWallThin,
        wallMm: H.veinWallMm.value,
        lumenInterface: Interface.VeinLumen,
      },
    );
  }
  return out;
}

/**
 * lus-sim (decisión 50): la pared mira los vasos subclavios desde este tanto bajo el borde superior de la clavícula más bajo
 * (`ChestWall.fossaMinZ`): la vena baja por detrás del borde de la clavícula su radio y su pared, y la esfera envolvente su margen.
 */
export const SUBCLAVIAN_GATE_MM = 20;

/** Margen de la esfera envolvente sobre la pared (mm): más que el tope de la distancia del «resto» (`BOWEL_BD_CAP_MM`, 5). */
export const VESSEL_BOUND_MARGIN_MM = BOWEL_BD_CAP_MM + 1;

/** Esfera envolvente de un tubo (para descartes rápidos en CPU y GPU; la de VExUS, `tubeBoundingSphere`). */
export function tubeBoundingSphere(t: Tube, marginMm: number): { center: Vec3; r: number } {
  const c: Vec3 = [0, 0, 0];
  for (const n of t.nodes) {
    c[0] += n.p[0] / t.nodes.length;
    c[1] += n.p[1] / t.nodes.length;
    c[2] += n.p[2] / t.nodes.length;
  }
  let r = 0;
  for (const n of t.nodes) r = Math.max(r, Math.hypot(n.p[0] - c[0], n.p[1] - c[1], n.p[2] - c[2]) + n.r * 1.6);
  return { center: c, r: r + marginMm };
}

/** Cuántos vasos del hilio tiene la escena (los primeros de la tabla; la GPU los recorre bajo el diafragma) y cuántos nodos admite cada uno. */
export const HILUM_VESSEL_COUNT = 6;
/** lus-sim (decisión 50): los vasos subclavios, tras los del hilio en la misma tabla (la GPU los recorre en la pared, sobre la clavícula). */
export const SUBCLAVIAN_VESSEL_COUNT = 4;
/** Todos los vasos de la tabla. */
export const VESSEL_TABLE_COUNT = HILUM_VESSEL_COUNT + SUBCLAVIAN_VESSEL_COUNT;
export const HILUM_VESSEL_MAX_NODES = 8;
/** Téxeles por vaso en la textura de escena: la cabecera, la esfera envolvente y sus nodos. */
export const HILUM_VESSEL_STRIDE = 2 + HILUM_VESSEL_MAX_NODES;
/** Primer téxel de la tabla de los vasos (tras la de los bordes del pulmón). */
export const HILUM_VESSEL_BASE = LUNG_BORDER_BASE + LUNG_BORDER_TEXELS;
export const HILUM_VESSEL_TEXELS = VESSEL_TABLE_COUNT * HILUM_VESSEL_STRIDE;

/**
 * La tabla de los vasos para la textura de escena (float32, como en la GPU): por vaso, (n.º de nodos, grosor de la pared, tejido de
 * la pared, cara de la luz), (centro y radio de la esfera envolvente) y sus nodos (x, y, z, r).
 */
export function hilumVesselTable(vessels: readonly HilumVessel[], bounds: ReadonlyArray<{ center: Vec3; r: number }>): Float32Array {
  if (vessels.length !== VESSEL_TABLE_COUNT)
    throw new Error(`hilumVesselTable: ${vessels.length} vasos, la GPU espera ${VESSEL_TABLE_COUNT}`);
  const out = new Float32Array(HILUM_VESSEL_TEXELS * 4);
  vessels.forEach((v, t) => {
    const n = v.tube.nodes.length;
    if (n > HILUM_VESSEL_MAX_NODES) throw new Error(`hilumVesselTable: ${v.id} tiene ${n} nodos (máximo ${HILUM_VESSEL_MAX_NODES})`);
    const o = t * HILUM_VESSEL_STRIDE * 4;
    out.set([n, v.wallMm, v.wallTissue, v.lumenInterface], o);
    out.set([bounds[t].center[0], bounds[t].center[1], bounds[t].center[2], bounds[t].r], o + 4);
    v.tube.nodes.forEach((nd, i) => out.set([nd.p[0], nd.p[1], nd.p[2], nd.r], o + 8 + 4 * i));
  });
  return out;
}

/**
 * Gemelo GLSL: `hvTubeQuery` (la `tubeQuery` de VExUS para la sección circular, con el gradiente de su distancia sin normalizar y la
 * curvatura circunferencial de su cara, 1/r) y `classifyTubes` (la de `AnatomyScene`, sin los conductos ni el Doppler: `c.vessel`
 * queda en −1).
 */
export const HILUM_VESSELS_GLSL = /* glsl */ `
#define HV_BASE ${HILUM_VESSEL_BASE}
#define HV_COUNT ${HILUM_VESSEL_COUNT}
#define HV_SUBCLAVIAN ${SUBCLAVIAN_VESSEL_COUNT}
#define HV_SUBCLAVIAN_GATE ${SUBCLAVIAN_GATE_MM.toFixed(4)}
#define HV_BOUND_MARGIN ${VESSEL_BOUND_MARGIN_MM.toFixed(4)}
#define HV_STRIDE ${HILUM_VESSEL_STRIDE}
#define HV_MAX_NODES ${HILUM_VESSEL_MAX_NODES}
float hvTubeQuery(vec3 p, int t, int count, out float rho, out vec3 tangent, out float rLoc, out vec3 n, out float kc) {
  float best = 1e9;
  rho = 10.0; tangent = vec3(0.0, 0.0, 1.0); rLoc = 1.0; n = vec3(0.0, 1.0, 0.0); kc = 1.0;
  int base = HV_BASE + t * HV_STRIDE + 2;
  for (int i = 0; i < HV_MAX_NODES - 1; i++) {
    if (i >= count - 1) break;
    vec4 a = sceneTexel(base + i);
    vec4 b = sceneTexel(base + i + 1);
    vec3 ab = b.xyz - a.xyz;
    float len2 = dot(ab, ab);
    float s = len2 > 0.0 ? clamp(dot(p - a.xyz, ab) / len2, 0.0, 1.0) : 0.0;
    vec3 d = p - (a.xyz + ab * s);
    float dist = length(d);
    float r = a.w + (b.w - a.w) * s;
    float sd = dist - r;
    if (sd < best) {
      best = sd;
      rho = dist / max(1e-6, r);
      vec3 tg = normalize(ab);
      tangent = tg;
      rLoc = r;
      // dentro del segmento el radio crece con s: el gradiente resta su crecimiento a lo largo del eje
      float taper = s > 0.0 && s < 1.0 ? (b.w - a.w) * inversesqrt(len2) : 0.0;
      vec3 gn = d / max(dist, 1e-6) - tg * taper;
      n = dist > 0.0 && dot(gn, gn) > 0.0 ? gn : vec3(0.0, 1.0, 0.0);
      kc = 1.0 / r;
    }
  }
  return best;
}
// t0, t1: el tramo de la tabla (los del hilio, 0 a HV_COUNT; los subclavios, decisión 50, de HV_COUNT a HV_COUNT + HV_SUBCLAVIAN)
bool classifyTubes(vec3 m, inout Cls c, out float dOut, int t0, int t1) {
  dOut = 1e3;
  int bestT = -1; float bestD = 1e9; float bRho = 0.0; vec3 bTan = vec3(0.0); float bR = 1.0; vec3 bN = vec3(0.0, 1.0, 0.0); float bKc = 1.0;
  for (int t = 0; t < HV_COUNT + HV_SUBCLAVIAN; t++) {
    if (t < t0 || t >= t1) continue;
    vec4 bs = sceneTexel(HV_BASE + t * HV_STRIDE + 1);
    // fuera de la esfera, su pared queda al menos a lo que la esfera tiene de margen sobre ella (decisión 50: en la pared, cuyas
    // capas no tienen tope en su distancia)
    float ds = distance(m, bs.xyz);
    if (ds > bs.w) { dOut = min(dOut, ds - bs.w + HV_BOUND_MARGIN); continue; }
    vec4 h0 = sceneTexel(HV_BASE + t * HV_STRIDE);
    float rho; vec3 tg; float rl; vec3 nn; float kk;
    float sd = hvTubeQuery(m, t, int(h0.x + 0.5), rho, tg, rl, nn, kk);
    dOut = min(dOut, sd - h0.y);
    if (sd < h0.y && sd < bestD) { bestD = sd; bestT = t; bRho = rho; bTan = tg; bR = rl; bN = nn; bKc = kk; }
  }
  if (bestT < 0) return false;
  vec4 h0 = sceneTexel(HV_BASE + bestT * HV_STRIDE);
  c.n = bN; c.rho = bRho; c.tangent = bTan; c.kc = bKc;
  c.iface = int(h0.w + 0.5); c.ifd = abs(bestD);
  if (bestD < 0.0) { c.tissue = T_BLOOD; c.bd = -bestD; return true; }
  c.tissue = int(h0.z + 0.5); c.bd = min(bestD, h0.y - bestD);
  return true;
}
`;
