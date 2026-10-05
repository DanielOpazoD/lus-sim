import { defineParameters } from '../../core/evidence';
import type { Vec3 } from '../../core/vec3';
import type { EchoTwinOrigin } from '../../core/units';
import { Tissue } from '../tissues';
import { torsoDepth, torsoSkinPoint, type Torso } from '../primitives';
import { thoraxLinePhi } from '../thoraxLines';
import type { Cardiac } from '../heart/cardiac';
import { LUNG_CURTAIN } from './lungCurtain';
import { ribLineArc, ribTableZ, type RibCage } from './ribcage';
import { HILUM_VESSEL_BASE, HILUM_VESSEL_TEXELS } from './vessels';
import { wallArc, wallInnerNormal, wallTotalMm } from './wall';

/**
 * Corazón y ventana cardiaca (lus-sim, decisión 18, paso C3; decisión 49, el corazón de EchoTwin). En la zona paraesternal
 * izquierda no hay pulmón: el corazón toca la pared en un disco de ≈ 5 cm centrado ≈ 4,5–5 cm a la izquierda de la línea media,
 * en el 5.º EIC (regla de Latham, Gray: la matidez cardiaca superficial; `docs/knowledge/anatomy.md` §1.6 y meta A-T16). Allí la
 * imagen no tiene línea pleural, ni deslizamiento, ni líneas A: tiene corazón.
 *
 * Desde la decisión 49 el corazón es el de EchoTwin (`anatomy/heart/`, portado con procedencia): cuatro cavidades, paredes,
 * válvulas, raíz aórtica, tronco pulmonar, venas y pericardio, en telediástole (`heart/cardiac.ts`). Este módulo lo coloca en el
 * tórax de lus-sim y conserva lo que lo rodea:
 *  - El corazón de EchoTwin: su eje es el del caso normal (Engblom), y su posición se ajusta aquí: su ápex (el del saco
 *    pericárdico) en el del adulto (5.º EIC, 9 cm a la izquierda de la línea media, Gray, `apexCoverMm` por dentro de la pared),
 *    y después llevado por la normal de la pared de la ventana hasta que el pericardio toca la pleura en su centro
 *    (`windowContactMm`).
 *  - El elipsoide de la decisión 18 (su ápex el mismo, su eje largo hacia delante, abajo y a la izquierda, `axisLeftDeg`,
 *    `axisDownDeg`; largo, ancho y grosor [SUPUESTO]) ya no es tejido: es la envoltura de lo que lo rodea, la que mueve el pulso
 *    pulmonar (`lungPulse.ts`), la que no respira (`heartStillWeight`, con la esfera de la base del corazón de EchoTwin, que el
 *    elipsoide no cubre) y la que da el fondo de la franja.
 *  - El tapón: en el disco de la ventana (sobre la piel: el arco u de la pared y la altura z), de la pleura parietal hasta el
 *    pericardio (el más hondo bajo el disco, más 1 mm): grasa (la del pericardio y del mediastino anterior), sin pulmón. Un
 *    corazón que tocara la pared en todo el disco tendría que meterse en ella (su cara se curva lejos de la pared).
 *  - La franja: alrededor de la ventana, bajo la lámina de la cortina, grasa hasta el elipsoide (el borde fino del pulmón
 *    sobre el corazón).
 *  - Sobre la cúpula: por debajo del diafragma no hay corazón (se apoya en él).
 * El corazón no late (`heart-simplified`): su latido solo mueve el pulmón de alrededor (el pulso pulmonar, decisión 32,
 * `lungPulse.ts`). El pericardio y las válvulas no tienen cara propia (su eco es el de su tejido).
 *
 * TS y GLSL (uniforms `uHeart*` del esquema único y la textura del corazón de EchoTwin) viven aquí juntos.
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
      'la 6.ª costilla de la LMC (Gray). Desde la decisión 49, el de partida del ápex del corazón de EchoTwin, antes de llevarlo ' +
      'contra la pleura de la ventana',
  },
  lengthMm: {
    value: 120,
    unit: 'mm',
    range: [110, 130],
    evidence: 'estimado',
    sources: [],
    note: 'Del ápex a la base del elipsoide que envuelve los ventrículos [SUPUESTO: NO ENCONTRADO en la base]',
  },
  widthMm: {
    value: 90,
    unit: 'mm',
    range: [80, 100],
    evidence: 'estimado',
    sources: [],
    note: 'Ancho del elipsoide [SUPUESTO: NO ENCONTRADO en la base]',
  },
  depthMm: {
    value: 65,
    unit: 'mm',
    range: [55, 70],
    evidence: 'estimado',
    sources: [],
    note: 'Grosor de delante atrás del elipsoide, el eje de la cara esternocostal [SUPUESTO: NO ENCONTRADO en la base]',
  },
  axisLeftDeg: {
    value: 60,
    unit: '°',
    range: [45, 70],
    evidence: 'estimado',
    sources: [],
    note:
      'El eje largo del elipsoide, de la base al ápex, hacia la izquierda: el ángulo con el plano sagital [SUPUESTO]; con 60° y ' +
      '30° el elipsoide queda ≥ 3,4 mm por dentro de la pleura fuera de la ventana (cabe la lámina de la cortina)',
  },
  axisDownDeg: {
    value: 30,
    unit: '°',
    range: [20, 40],
    evidence: 'estimado',
    sources: [],
    note: 'El eje largo del elipsoide, hacia abajo: el ángulo con el plano transversal [SUPUESTO]',
  },
  windowContactMm: {
    value: 0,
    unit: 'mm',
    range: [0, 3],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'lus-sim (decisión 49): profundidad del pericardio bajo la pleura parietal en el centro de la ventana. En la zona desnuda el ' +
      'pericardio fibroso se apoya en la cara posterior del esternón y de los cartílagos (ligamentos esternopericárdicos, Gray), ' +
      'sin pulmón delante: el corazón de EchoTwin se coloca tocando la cara interna de la pared [SUPUESTO: 0 mm]',
  },
  skirtMm: {
    value: 25,
    unit: 'mm',
    range: [15, 35],
    evidence: 'estimado',
    sources: [],
    note:
      'Alrededor de la ventana, en esta franja sobre la piel, el pulmón que cubre el corazón es la lámina de la cortina (3 mm): ' +
      'el borde anterior del pulmón es fino sobre el corazón [SUPUESTO]. Sin ella el elipsoide queda hasta 25 mm por dentro de la ' +
      'pleura en el borde de la ventana y las líneas oblicuas salían del tapón a una bolsa de pulmón',
  },
  stillRampMm: {
    value: 50,
    unit: 'mm',
    range: [40, 80],
    evidence: 'estimado',
    sources: [],
    note:
      'El corazón, con el tapón y la franja de la ventana, no se mueve con la respiración (se apoya en el centro tendinoso, que ' +
      'baja poco); el campo respiratorio vuelve a su valor en esta distancia a su cara [SUPUESTO]. Con el corazón bajando con ' +
      'las vísceras y el tapón pegado a la pared, la cizalla dejaba bolsas de pulmón en la ventana al respirar (9 de 96 líneas ' +
      'en la respiración tranquila). El pulmón que baja encima de él no pliega el campo con la inspiración profunda de la base ' +
      '(53 mm) porque baja poco: la ley de altura del campo (decisión 22; sin ella, con 50 mm, el jacobiano llegaba a −0,53)',
  },
  baseStillRampMm: {
    value: 50,
    unit: 'mm',
    range: [40, 80],
    evidence: 'estimado',
    sources: [],
    note:
      'lus-sim (decisión 49): alrededor de la esfera que cubre la base del corazón de EchoTwin (aurículas, raíces de los grandes ' +
      'vasos; la que el elipsoide no cubre), el campo respiratorio vuelve a su valor en esta distancia a su superficie [SUPUESTO]: ' +
      'la del elipsoide, sin el margen del tapón (la base no está pegada a la pared). Con el margen (60,7 mm), la esfera, de 78 mm de ' +
      'radio, dejaba quieto el hígado a 9 cm a la derecha de la línea media (peso 0,96 en z 0; 19 mm de descenso en lugar de > 40 en ' +
      'la inspiración profunda); con 20 mm, el campo se plegaba sobre ella (el jacobiano, negativo con 75 mm de excursión)',
  },
});

/**
 * El volumen del corazón de EchoTwin (decisión 49, `heart/cardiacRuntime.ts`): una rejilla en el marco del corazón (origen en una
 * esquina, ejes y lado del vóxel en mm de lus-sim) con, en cada vóxel, lo que el clasificador de EchoTwin dice en su centro.
 */
export interface CardiacVolume {
  originMm: Vec3;
  ex: Vec3;
  ey: Vec3;
  ez: Vec3;
  voxelMm: number;
  dims: [number, number, number];
  /** Esfera que contiene la rejilla (mm): fuera de ella el volumen no se lee. */
  sphere: { c: Vec3; r: number };
  /** El vóxel (i, j, k): `código | décimas << 8` (código: el tejido de lus-sim + 1, o 0 fuera del corazón). */
  voxel(i: number, j: number, k: number): number;
}

/** El corazón de EchoTwin en su sitio, con lo que la GPU necesita para hornear su volumen (decisión 49). */
export interface CardiacRuntime {
  /** El modelo analítico de EchoTwin colocado (`heart/cardiac.ts`). */
  cardiac: Cardiac;
  vol: CardiacVolume;
  /** Textura de parámetros del modelo (RGBA32F, `paramTexels` téxeles) y retícula de ruido de su pared (R8, 128³). */
  params: Float32Array;
  paramTexels: number;
  noise: Uint8Array;
  /** El programa que hornea una capa del volumen (`uLayer`), con la GLSL de EchoTwin. */
  bakeFragment: string;
  /** Ápex del saco pericárdico en lus-sim (mm). */
  apexMm: Vec3;
}

export interface Heart {
  center: Vec3;
  /** Ejes del elipsoide (unitarios): largo (hacia el ápex), ancho y corto (hacia la pared de la ventana). */
  e1: Vec3;
  e2: Vec3;
  e3: Vec3;
  radii: Vec3;
  /** Ventana sobre la piel: arco u con signo (+ a la izquierda), altura z y radio (mm). */
  window: { u: number; z: number; r: number };
  /** Profundidad bajo la pleura parietal del tapón de la ventana (mm); 0 sin el corazón de EchoTwin. */
  plugDepthMm: number;
  /** Ancho de la franja alrededor de la ventana donde la grasa llega a la lámina de la cortina (mm sobre la piel). */
  skirtMm: number;
  /** Punta del elipsoide (el ápex de Gray). */
  apex: Vec3;
  /** El corazón de EchoTwin en su sitio (decisión 49): null hasta que se carga (`attachCardiac`). */
  cardiac: CardiacRuntime | null;
  /** Esfera de la base del corazón de EchoTwin (centro y radio, mm): con el elipsoide, lo que no respira (`heartStillWeight`). */
  base: { c: Vec3; r: number };
}

/** Lo que coloca el corazón de EchoTwin en el de la escena (`heart/cardiacRuntime.ts`, `attachEchoTwinHeart`). */
export type CardiacAttach = (h: Heart, t: Torso, cage: RibCage) => void;

let registered: CardiacAttach | null = null;

/**
 * Registra el corazón de EchoTwin para las escenas que se construyan desde ahora (decisión 49): la aplicación, cuando su chunk
 * llega; las pruebas, al arrancar. Las escenas ya construidas lo reciben con `attachCardiac`.
 */
export function registerCardiac(attach: CardiacAttach | null): void {
  registered = attach;
}

/** Coloca el corazón de EchoTwin en el corazón `h` de una escena ya construida (no el que no se pudo hornear: `failCardiac`). */
export function attachCardiac(h: Heart, t: Torso, cage: RibCage, attach: CardiacAttach): void {
  attach(h, t, cage);
  if (h.cardiac && failed.has(h.cardiac)) detachCardiac(h);
}

/** Corazones cuyo volumen no se pudo hornear: no vuelven a ninguna escena ni se reintentan. */
const failed = new WeakSet<CardiacRuntime>();

/** El horneado de `c` falló (decisión 49): sale de `h` (la CPU ve lo mismo que la GPU, sin corazón) y no vuelve a ninguna escena. */
export function failCardiac(h: Heart, c: CardiacRuntime): void {
  failed.add(c);
  if (h.cardiac === c) detachCardiac(h);
}

/** ¿Falló ya el horneado de `c`? */
export function cardiacFailed(c: CardiacRuntime): boolean {
  return failed.has(c);
}

/** El corazón `h` sin el de EchoTwin: la escena de antes de que llegue su chunk. */
function detachCardiac(h: Heart): void {
  h.cardiac = null;
  h.plugDepthMm = 0;
  h.base = { c: h.center, r: 0 };
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
 * El origen del tórax de EchoTwin en el de lus-sim (`core/units.ts`): la piel de la línea media anterior y la altura del 4.º EIC
 * en la línea paraesternal.
 */
export function echoTwinOrigin(t: Torso, cage: RibCage): EchoTwinOrigin {
  return { zIcs4Mm: icsZ(cage, 4, ribLineArc(thoraxLinePhi('parasternal', t), t, cage)), skinYMm: t.b };
}

/**
 * El corazón del avatar sobre la parrilla y la pared construidas (la torso con su pared torácica): el elipsoide con el ápex donde
 * lo pone Gray y la ventana en su disco; y, si está registrado (`registerCardiac`), el corazón de EchoTwin en su sitio.
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
  const h: Heart = {
    center,
    e1,
    e2,
    e3,
    radii,
    window: { u: winU, z: winZ, r: 0.5 * P.windowDiameterMm.value },
    plugDepthMm: 0,
    skirtMm: P.skirtMm.value,
    apex,
    cardiac: null,
    base: { c: center, r: 0 },
  };
  if (registered) attachCardiac(h, t, cage, registered);
  return h;
}

/**
 * Lo que el volumen del corazón de EchoTwin dice de un punto (gemelo GLSL `heartVoxel`): el tejido del vóxel que lo contiene, o
 * −1, y una distancia a la frontera (mm). En la rejilla, la que da EchoTwin en el centro del vóxel (la de su estructura, o la del saco
 * fuera de él) menos dos semidiagonales (el punto y la frontera, que es la de los vóxeles), y como mucho `HEART_VOXEL_BD_CAP_MM`:
 * la de EchoTwin no es una cota (la de la sangre no cuenta las valvas ni las cuerdas que flotan en ella, y la del saco no ve los
 * vasos de fuera: su exceso llega a 19 mm). Fuera de la rejilla, la de la rejilla; fuera de su esfera, la de la esfera. Sin el
 * corazón, nada a 1 m.
 */
export function heartVoxel(h: Heart, m: Vec3): { tissue: Tissue | -1; d: number } {
  const v = h.cardiac?.vol;
  if (!v) return { tissue: -1, d: 1e3 };
  const ds = Math.hypot(m[0] - v.sphere.c[0], m[1] - v.sphere.c[1], m[2] - v.sphere.c[2]) - v.sphere.r;
  if (ds > 0) return { tissue: -1, d: ds };
  const r: Vec3 = [m[0] - v.originMm[0], m[1] - v.originMm[1], m[2] - v.originMm[2]];
  const q: Vec3 = [dot(r, v.ex) / v.voxelMm, dot(r, v.ey) / v.voxelMm, dot(r, v.ez) / v.voxelMm];
  const e = [0, 1, 2].map((a) => Math.max(-q[a], q[a] - v.dims[a]));
  if (Math.max(e[0], e[1], e[2]) >= 0)
    return { tissue: -1, d: Math.hypot(Math.max(e[0], 0), Math.max(e[1], 0), Math.max(e[2], 0)) * v.voxelMm };
  const w = v.voxel(Math.floor(q[0]), Math.floor(q[1]), Math.floor(q[2]));
  const code = w & 255;
  const d = Math.min(HEART_VOXEL_BD_CAP_MM, Math.max(0, (w >> 8) * 0.1 - 2 * VOXEL_HALF_DIAGONAL * v.voxelMm));
  return code > 0 ? { tissue: code - 1, d } : { tissue: -1, d };
}
/** Semidiagonal del vóxel en lados: la distancia del centro a una esquina. */
const VOXEL_HALF_DIAGONAL = Math.sqrt(3) / 2;
/**
 * Tope (mm) de la distancia a la frontera dentro de la rejilla del corazón: lo que tarda en cambiar de tejido en el peor caso que
 * no ve la sdf de EchoTwin (una valva o una cuerda de ≈ 1 mm, un vaso fuera del saco). Las muestras de elevación de la pasada B se
 * reclasifican donde la distancia no pasa de su desplazamiento (`sampleSide`): con el tope lo hacen en todo el corazón.
 */
export const HEART_VOXEL_BD_CAP_MM = 2;

/**
 * Los tejidos de lus-sim que en el tórax solo da el corazón (la sangre de sus cavidades y vasos, el miocardio, la pared arterial
 * de valvas, cuerdas y vasos, y el ligamento venoso del pericardio y los anillos, decisión 49): lo que una medida reconoce como
 * corazón. La grasa epicárdica y la del tapón no (también es la de la pared).
 */
export const CARDIAC_TISSUES: ReadonlySet<Tissue> = new Set([Tissue.Blood, Tissue.Myocardium, Tissue.ArteryWall, Tissue.LigamentumVenosum]);

/** Primer téxel del volumen del corazón en la textura de escena (cinco: esfera, origen y lado, y los tres ejes). */
export const HEART_VOL_BASE = HILUM_VESSEL_BASE + HILUM_VESSEL_TEXELS;
export const HEART_VOL_TEXELS = 5;

/** Los téxeles del volumen en la textura de escena (ceros sin el corazón: la esfera de radio 0 no contiene nada). */
export function heartVolumeTable(h: Heart): Float32Array {
  const out = new Float32Array(HEART_VOL_TEXELS * 4);
  const v = h.cardiac?.vol;
  if (!v) return out;
  out.set([...v.sphere.c, v.sphere.r, ...v.originMm, v.voxelMm, ...v.ex, 0, ...v.ey, 0, ...v.ez, 0]);
  return out;
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

/** El punto en el marco del elipsoide (ejes e1, e2, e3). */
export function heartLocal(h: Heart, m: Vec3): Vec3 {
  const d: Vec3 = [m[0] - h.center[0], m[1] - h.center[1], m[2] - h.center[2]];
  return [dot(d, h.e1), dot(d, h.e2), dot(d, h.e3)];
}

/** Distancia con signo al elipsoide (negativa dentro). */
export function heartSd(h: Heart, m: Vec3): number {
  return heartEllipsoidSd(heartLocal(h, m), h.radii);
}

/** Distancia con signo (mm, sobre la piel) al borde del disco de la ventana en (u, z): negativa dentro. */
export function heartWindowDistance(h: Heart, u: number, z: number): number {
  return Math.hypot(u - h.window.u, z - h.window.z) - h.window.r;
}

/** Lo que el corazón y su ventana dicen de un punto bajo la pared (`heartQuery`). */
export interface HeartQuery {
  /** Tejido del corazón (el de EchoTwin o la grasa del tapón y de la franja), o −1 si el punto no es suyo. */
  tissue: Tissue | -1;
  /** Dentro: la distancia (mm) a la frontera; fuera, 0. */
  d: number;
  /** Fuera: cota (≥ 0) de la distancia al corazón, que cuenta la de los tejidos que lo rodean; dentro, 0. */
  clear: number;
}

/**
 * El corazón en un punto bajo la pared (gemelo GLSL), con su profundidad bajo la pleura `insideWallMm` y su arco `u`: primero el
 * de EchoTwin (su volumen, `heartVoxel`); si no, el tapón de la ventana y la franja, de grasa. No mira la cúpula: la escena solo lo
 * acepta sobre ella.
 */
export function heartQuery(h: Heart, m: Vec3, insideWallMm: number, u: number): HeartQuery {
  const c = heartVoxel(h, m);
  if (c.tissue !== -1) return { tissue: c.tissue, d: c.d, clear: 0 };
  // el tapón, su franja y la pleura solo cuentan a menos de su fondo (más hondo, el arco no hace falta: la GPU no lo calcula)
  if (insideWallMm >= h.plugDepthMm) return { tissue: -1, d: 0, clear: c.d };
  const win = heartWindowDistance(h, u, m[2]);
  const inPlug = insideWallMm >= 0 && win < 0;
  const skirt = inPlug ? 1e3 : heartSkirtDepth(h, m, insideWallMm, win);
  if (inPlug || skirt < 0) {
    const d = Math.min(Math.abs(insideWallMm), Math.abs(win), h.plugDepthMm - insideWallMm, Math.abs(skirt), c.d);
    return { tissue: Tissue.Fat, d, clear: 0 };
  }
  return { tissue: -1, d: 0, clear: Math.max(0, Math.min(c.d, win, Math.abs(skirt))) };
}

/** Espesor de la lámina de la cortina sobre la franja del corazón (mm): la de `organs/lungCurtain.ts`. */
const SKIRT_TOP_MM = LUNG_CURTAIN.thicknessMm;

/**
 * La franja alrededor de la ventana (gemelo GLSL): a menos de `skirtMm` del disco, entre la lámina de la cortina y el fondo
 * del tapón, es grasa si el elipsoide está en el mismo rayo radial a esa profundidad (el punto llevado al fondo del tapón).
 * Devuelve una cota con signo, negativa dentro: la del corte con la lámina, con el borde de la franja y con el elipsoide en el
 * fondo.
 */
export function heartSkirtDepth(h: Heart, m: Vec3, insideWallMm: number, win: number): number {
  const r = Math.hypot(m[0], m[1]);
  const k = r > 0 ? 1 - (h.plugDepthMm - insideWallMm) / r : 0;
  const bottom = heartSd(h, [m[0] * k, m[1] * k, m[2]]);
  // junto al disco la lámina se afila (el borde del pulmón es una cuña que nace en el borde de la ventana): la franja llega
  // hasta el tapón bajo la pleura, sin anillo de pulmón entre los dos
  return Math.max(Math.min(SKIRT_TOP_MM, win) - insideWallMm, win - h.skirtMm, bottom);
}

/**
 * Peso del campo respiratorio junto al corazón (gemelo GLSL): 0 hasta el fondo del tapón del elipsoide (el tapón y la franja
 * quedan dentro) y dentro de la esfera de la base (el corazón de EchoTwin queda dentro de los dos), 1 a `stillRampMm` del primero y
 * a `baseStillRampMm` de la segunda. Solo el elipsoide y la esfera,
 * baratos: el peso se evalúa en cada paso de `toMaterial`.
 */
export function heartStillWeight(h: Heart, m: Vec3): number {
  const step = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const dBase = Math.hypot(m[0] - h.base.c[0], m[1] - h.base.c[1], m[2] - h.base.c[2]) - h.base.r;
  const P = HEART.params;
  return Math.min(step(h.plugDepthMm, h.plugDepthMm + P.stillRampMm.value, heartSd(h, m)), step(0, P.baseStillRampMm.value, dBase));
}

/** La pleura parietal en m (el cruce de una línea) no toca pulmón: es la ventana (el tapón) o el elipsoide (la franja
 * empieza bajo la lámina de la cortina). */
export function heartAtWall(h: Heart, m: Vec3, t: Torso): boolean {
  return heartSd(h, m) < 0 || heartWindowDistance(h, wallArc(m, t), m[2]) < 0;
}

/**
 * Gemelo GLSL: uHeartC = (centro, profundidad del tapón), uHeartE1–3 = (eje, semieje), uHeartBase = (centro y radio de la
 * esfera de la base), uHeartWin = (u, z, radio de la ventana, ancho de la franja); el volumen del corazón de EchoTwin en `uHeartVol`
 * (RG8UI 3D) con su rejilla en la textura de escena (`HEART_VOL_BASE`).
 */
const SKIRT_TOP_GLSL = SKIRT_TOP_MM.toFixed(4);
export const HEART_GLSL = /* glsl */ `
#define HEART_FAT ${Tissue.Fat}
#define HEART_VOL_BASE ${HEART_VOL_BASE}
#define HEART_VOXEL_HALF_DIAG ${VOXEL_HALF_DIAGONAL.toFixed(8)}
#define HEART_VOXEL_BD_CAP ${HEART_VOXEL_BD_CAP_MM.toFixed(4)}
float heartEllipsoidSd(vec3 q, vec3 r) {
  vec3 k = q / r;
  float k1 = length(k);
  float k2 = length(k / r);
  return k2 > 0.0 ? k1 * (k1 - 1.0) / k2 : -min(r.x, min(r.y, r.z));
}
vec3 heartLocal(vec3 m) { vec3 d = m - uHeartC.xyz; return vec3(dot(d, uHeartE1.xyz), dot(d, uHeartE2.xyz), dot(d, uHeartE3.xyz)); }
float heartSd(vec3 m) { return heartEllipsoidSd(heartLocal(m), vec3(uHeartE1.w, uHeartE2.w, uHeartE3.w)); }
float heartWindowDistance(float u, float z) { return length(vec2(u - uHeartWin.x, z - uHeartWin.y)) - uHeartWin.z; }
float heartSkirtDepth(vec3 m, float insideWall, float win) {
  float r = length(m.xy);
  float k = r > 0.0 ? 1.0 - (uHeartC.w - insideWall) / r : 0.0;
  float bottom = heartSd(vec3(m.xy * k, m.z));
  return max(max(min(${SKIRT_TOP_GLSL}, win) - insideWall, win - uHeartWin.w), bottom);
}
// tejido del vóxel del corazón de EchoTwin que contiene m, o −1; d, su distancia (mm)
int heartVoxel(vec3 m, out float d) {
  vec4 sph = sceneTexel(HEART_VOL_BASE);
  float ds = length(m - sph.xyz) - sph.w;
  if (sph.w <= 0.0) { d = 1e3; return -1; }
  if (ds > 0.0) { d = ds; return -1; }
  vec4 o = sceneTexel(HEART_VOL_BASE + 1);
  vec3 r = m - o.xyz;
  vec3 q = vec3(dot(r, sceneTexel(HEART_VOL_BASE + 2).xyz), dot(r, sceneTexel(HEART_VOL_BASE + 3).xyz), dot(r, sceneTexel(HEART_VOL_BASE + 4).xyz)) / o.w;
  vec3 dims = vec3(textureSize(uHeartVol, 0));
  vec3 e = max(-q, q - dims);
  if (max(e.x, max(e.y, e.z)) >= 0.0) { d = length(max(e, 0.0)) * o.w; return -1; }
  uvec4 w = texelFetch(uHeartVol, ivec3(floor(q)), 0);
  d = min(HEART_VOXEL_BD_CAP, max(0.0, float(w.g) * 0.1 - 2.0 * HEART_VOXEL_HALF_DIAG * o.w));
  return int(w.r) - 1;
}
// tejido del corazón (el de EchoTwin o la grasa del tapón y de la franja) o −1; dentro, d (mm); fuera, clear (mm)
int heartQuery(vec3 m, float insideWall, float u, out float d, out float clear) {
  float dv;
  int t = heartVoxel(m, dv);
  if (t >= 0) { d = dv; clear = 0.0; return t; }
  d = 0.0;
  clear = dv;
  if (insideWall >= uHeartC.w) return -1;
  float win = heartWindowDistance(u, m.z);
  bool inPlug = insideWall >= 0.0 && win < 0.0;
  float skirt = inPlug ? 1e3 : heartSkirtDepth(m, insideWall, win);
  if (inPlug || skirt < 0.0) {
    d = min(min(min(abs(insideWall), abs(win)), min(uHeartC.w - insideWall, abs(skirt))), dv);
    clear = 0.0;
    return HEART_FAT;
  }
  clear = max(0.0, min(min(dv, win), abs(skirt)));
  return -1;
}
float heartStillWeight(vec3 m) {
  float dBase = length(m - uHeartBase.xyz) - uHeartBase.w;
  return min(smoothstep(uHeartC.w, uHeartC.w + ${HEART.params.stillRampMm.value.toFixed(4)}, heartSd(m)), smoothstep(0.0, ${HEART.params.baseStillRampMm.value.toFixed(4)}, dBase));
}
bool heartAtWall(vec3 m) { return heartSd(m) < 0.0 || heartWindowDistance(wallArc(m), m.z) < 0.0; }
`;
