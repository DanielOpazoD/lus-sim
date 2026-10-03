import { defineParameters } from '../core/evidence';
import type { Vec3 } from '../core/vec3';
import { AnatomyQuery } from '../anatomy/query';
import { LUNG_APEX } from '../anatomy/organs/lungApex';
import { LUNG_BORDER } from '../anatomy/organs/lungBorder';
import { KIDNEY } from '../anatomy/organs/kidney';
import { CLAVICLE, SCAPULA, ribLineArc, ribTableZ, spinousTipZ, vertebraZ } from '../anatomy/organs/ribcage';
import { wallArc } from '../anatomy/organs/wall';
import { torsoDepth, torsoSkinPoint } from '../anatomy/primitives';
import { BASELINE_INSTANT, type AnatomyScene, type SceneInstant } from '../anatomy/scene';
import { thoraxLinePhi, type ThoraxLine } from '../anatomy/thoraxLines';
import { Tissue } from '../anatomy/tissues';
import type { RespiratorySample } from '../physiology/respiratory';
import { probeContact } from '../probe/contact';
import { CONVEX_C35, clampPose, lineDirection, pointOnLine, type PatientPosition, type ProbePose, type Transducer } from '../probe/probe';
import { pleuraCrossingLine } from '../ultrasound/transmission';

/**
 * Cobertura de exploración (lus-sim, decisión 26; requisito de cobertura de `docs/MISSION.md`: el pulmón se explora
 * entero). Recorre, por hemitórax, los espacios intercostales 1.º–11.º en cada línea de referencia de la exploración
 * (paraesternal, medioclavicular, axilares anterior, media y posterior, escapular y paravertebral), el vértice y la fosa
 * supraclavicular, y en cada celda pregunta lo que pregunta el alumno con la sonda en la mano:
 *
 *  (i) ¿se puede apoyar ahí la sonda, en alguna posición del paciente admitida (el decúbito supino y, desde la decisión 29, el
 *       paciente sentado: `clampPose`)?
 *  (ii) ¿bajo la pared está lo que la base pone ahí? Pulmón con su pleura; la ventana cardiaca; bajo el borde del pulmón en
 *       FRC, el diafragma y el órgano de debajo (el hígado a la derecha; a la izquierda, el hígado o el bazo); o, en la línea
 *       escapular con los brazos a los lados, el borde medial de la escápula. El borde se toma de los anclajes de Gray en la
 *       base (`anatomy.lungBorder`: la 6.ª costilla de la LMC y la paraesternal, la 8.ª de la LAM, T11 detrás), no de la tabla
 *       que construye el modelo; entre anclajes, el intervalo de sus alturas, y el espacio cuyo centro cae a menos de
 *       `BORDER_MARGIN_MM` de él admite el pulmón y lo de debajo (la cortina);
 *  (iii) ¿hay pulmón donde la anatomía no lo pone? Sobre el vértice, en todo el corte del tronco: bajo el tercio medial de
 *       la clavícula, a más de 4–5 cm sobre ella (Gray); en el resto, más de `BORDER_MARGIN_MM` sobre la 1.ª costilla.
 *
 * Las celdas de los espacios se miden en fin de espiración con la sonda apoyada como en la ecografía (`probeContact`, presión
 * estándar), marcador craneal, en el centro del espacio de la línea, por su línea central (lo que el alumno pone en el
 * centro de la imagen). Un espacio que no existe en una línea (bajo el reborde costal) no es una celda. La GPU dibuja la
 * misma anatomía (equivalencia TS ↔ GLSL de la e2e): lo que se mide aquí es lo que se ve.
 */
export const COVERAGE = defineParameters('app.coverage', {
  supraclavicularXMm: {
    value: 70,
    unit: 'mm',
    range: [55, 90],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918', 'yang-clavicula-2017'],
    note:
      'Dónde se apoya la sonda en la fosa supraclavicular para buscar el vértice: sobre la unión de los tercios medial y medio ' +
      'de la clavícula (el vértice está tras el tercio medial, Gray): 2 + 15,6/3 ≈ 7 cm [SUPUESTO: la base no sitúa la fosa]',
  },
});

/** Contenido bajo la pared en la línea central. */
export type CellContent = 'lung' | 'heart' | 'below' | 'bone' | 'none';
/**
 * Lo que la base pone en la celda. `border`: el espacio del borde del pulmón (pulmón o lo de debajo); `heartOrBelow`: el borde
 * caudal de la ventana cardiaca; `scapula`: el borde medial de la escápula en la línea escapular con los brazos a los lados (el
 * hueso, o el pulmón junto a él).
 */
export type CellExpectation = 'lung' | 'heart' | 'below' | 'border' | 'heartOrBelow' | 'scapula';
export type CoverageRegion = 'anterior' | 'lateral' | 'posterior' | 'apex';
export type CoverageSide = -1 | 1;

export interface CoverageCell {
  /** Identificador estable: «D LMC EIC2», «I fosa supraclavicular», «D vértice, tercio medial». */
  id: string;
  side: CoverageSide;
  line: ThoraxLine | 'supraclavicular' | 'apex';
  /** Espacio intercostal (1–11); 0 en el vértice y en la fosa supraclavicular. */
  ics: number;
  region: CoverageRegion;
  kind: 'ics' | 'supraclavicular' | 'aboveApex';
  phi: number;
  z: number;
  expected: CellExpectation | 'noLung';
  /** Posición del paciente en la que la sonda se apoya ahí, o null si en ninguna. */
  position: string | null;
  /** Lo medido bajo la pared (null si no se alcanza). */
  content: CellContent | null;
  /** Bajo el diafragma, el tejido que sigue (el órgano), si `content` es `below`. */
  organ: Tissue | null;
  /** Si ese tejido es el del estómago (decisión 43: su pared es el tejido del «resto»). */
  stomach: boolean;
  /** Profundidad de la pleura en la línea central (mm), si se registra. */
  pleuraMm: number | null;
  /** «Sobre el vértice»: la z más alta con pulmón por encima de lo que admite la base, o null. */
  lungTopZ: number | null;
  met: boolean;
  /** Por qué no se cumple. */
  reason: string | null;
}

export interface CoverageReport {
  cells: CoverageCell[];
  met: number;
  total: number;
  byRegion: Record<CoverageRegion, { met: number; total: number }>;
}

/** Posiciones del paciente admitidas, con lo que dejan alcanzar a la sonda. */
export interface PositionReach {
  id: string;
  /** La pose, si la sonda se apoya en ella con el paciente así; null si no. */
  admit: (pose: ProbePose) => ProbePose | null;
}

/** La sonda en la pose, si `clampPose` la deja ahí con el paciente en la posición `position` (el ángulo, en cualquier vuelta). */
function reachIn(position: PatientPosition): PositionReach {
  return {
    id: position,
    admit: (pose) => {
      for (const k of [0, 1, -1]) {
        const p = { ...pose, phi: pose.phi + 2 * Math.PI * k };
        const c = clampPose(p, position);
        if (Math.abs(c.phi - p.phi) < 1e-9 && Math.abs(c.z - p.z) < 1e-9) return c;
      }
      return null;
    },
  };
}

/** Decúbito supino: la sonda donde `clampPose` la deja (de −0,2π a 1,2π, por detrás de las axilares posteriores; z ±200). */
export const SUPINE_REACH: PositionReach = reachIn('supine');
/** Sentado (decisión 29): la sonda da toda la vuelta al tronco; la cara posterior, como en la clínica. */
export const SITTING_REACH: PositionReach = reachIn('sitting');

const END_EXPIRATION: RespiratorySample = {
  phase: 0,
  volume: 0,
  volumeRate: 0,
  pleuralMmHg: 0,
  abdominalMmHg: 0,
  diaphragmCaudalMm: 0,
  diaphragmVelocityMmS: 0,
};

/** Líneas de la exploración, de delante atrás, con su región (las 12 zonas: esternón–LAA–LAP). */
const LINES: ReadonlyArray<{ line: ThoraxLine; label: string; region: CoverageRegion }> = [
  { line: 'parasternal', label: 'PE', region: 'anterior' },
  { line: 'midclavicular', label: 'LMC', region: 'anterior' },
  { line: 'anteriorAxillary', label: 'LAA', region: 'lateral' },
  { line: 'midaxillary', label: 'LAM', region: 'lateral' },
  { line: 'posteriorAxillary', label: 'LAP', region: 'lateral' },
  { line: 'scapular', label: 'LE', region: 'posterior' },
  { line: 'paravertebral', label: 'PV', region: 'posterior' },
];

/**
 * Lo que la línea atraviesa sin pararse: la pared blanda y el cartílago costal sin calcificar (deja pasar el haz, A-T17; el
 * calcificado se clasifica como hueso).
 */
const PASS_TISSUES = new Set<Tissue>([Tissue.Skin, Tissue.Fat, Tissue.Muscle, Tissue.Cartilage]);
/** Los tejidos del riñón con su grasa (decisión 43): bajo el diafragma, detrás, cuentan como el riñón. */
export const KIDNEY_TISSUES: ReadonlySet<Tissue> = new Set([
  Tissue.PerirenalFat,
  Tissue.RenalCapsule,
  Tissue.RenalCortex,
  Tissue.RenalMedulla,
  Tissue.RenalSinus,
  Tissue.RenalPelvis,
]);
/** Los tejidos del estómago (decisión 43): su pared, la del «resto», y su luz. */
const STOMACH_TISSUES: ReadonlySet<Tissue> = new Set([Tissue.Bowel, Tissue.Fluid, Tissue.BowelGas]);
/** Lo que la línea central toma por el órgano bajo el diafragma cuando lo encuentra sin cruzarlo. */
const ABDOMINAL_TISSUES: ReadonlySet<Tissue> = new Set([
  Tissue.Bowel,
  Tissue.Fluid,
  Tissue.BowelGas,
  Tissue.Liver,
  Tissue.LiverCapsule,
  Tissue.Spleen,
  ...KIDNEY_TISSUES,
]);
/**
 * El órgano bajo el diafragma que cuenta en cada lado: el hígado a la derecha; a la izquierda, su lóbulo o el bazo (decisión 37);
 * detrás, a los dos lados, el riñón con su grasa (decisión 43). Donde la base pone otro (el estómago, el colon) y el modelo tiene
 * el «resto», la celda no se cumple.
 */
export function organOk(side: CoverageSide, organ: Tissue | null, stomach = false): boolean {
  if (stomach) return side > 0;
  if (organ === Tissue.Liver || organ === Tissue.LiverCapsule) return true;
  if (organ !== null && KIDNEY_TISSUES.has(organ)) return true;
  return side > 0 && organ === Tissue.Spleen;
}

export interface CenterContent {
  content: CellContent;
  /** Bajo el diafragma, el primer tejido que no es diafragma. */
  organ: Tissue | null;
  /** Si ese tejido es el del estómago (`AnatomyScene.inStomach`; decisión 43: su pared es el tejido del «resto»). */
  stomach: boolean;
  pleuraMm: number | null;
}

/** Lo que encuentra la línea central de la sonda en la pose (fin de espiración, presión estándar). */
export function probeCenterContent(
  scene: AnatomyScene,
  pose: ProbePose,
  tr: Transducer = CONVEX_C35,
  instant: SceneInstant = BASELINE_INSTANT,
  resp: RespiratorySample = END_EXPIRATION,
  depthMm = 100,
): CenterContent {
  const contact = probeContact(pose, tr, scene.torso);
  const query = new AnatomyQuery(scene);
  query.setProbeCompression(contact);
  const material = (p: Vec3) => query.deformation.toMaterial(p, resp);
  const origin = pointOnLine(contact.frame, tr, 0, 0);
  const dir = lineDirection(contact.frame, 0);
  const crossing = pleuraCrossingLine(
    (p) => scene.insideWallMm(material(p)),
    (p) => scene.lungEdgeMm(material(p), instant),
    origin,
    dir,
    depthMm,
    2 * depthMm,
  );
  const pointAt = (r: number) => material(pointOnLine(contact.frame, tr, 0, r));
  const at = (r: number) => scene.classify(pointAt(r), instant).tissue;
  const none: CenterContent = { content: 'none', organ: null, stomach: false, pleuraMm: null };
  // el órgano en r: el tejido y si es el estómago (su pared y su luz)
  const below = (r: number): CenterContent => {
    const t = at(r);
    return { content: 'below', organ: t, stomach: STOMACH_TISSUES.has(t) && scene.inStomach(pointAt(r), instant), pleuraMm: null };
  };
  for (let r = 0.25; r < depthMm; r += 0.25) {
    const t = at(r);
    if (PASS_TISSUES.has(t)) continue;
    if (t === Tissue.Lung) return { ...none, content: crossing ? 'lung' : 'none', pleuraMm: crossing ? crossing.D : null };
    if (t === Tissue.Bone || t === Tissue.Vertebra) return { ...none, content: 'bone' };
    if (t === Tissue.Myocardium || t === Tissue.Blood) return { ...none, content: 'heart' };
    if (t === Tissue.Diaphragm || t === Tissue.RetroperitonealFat) {
      // el órgano: lo primero bajo el diafragma; la grasa retroperitoneal, solo si detrás está el riñón (lus-sim, decisión 43: la
      // grasa pararrenal posterior, entre el diafragma y la grasa del riñón, es una capa de grasa como la de la pared; delante de
      // cualquier otra cosa, la grasa es lo que hay)
      let s = r;
      while (s < depthMm && at(s) === Tissue.Diaphragm) s += 0.25;
      if (s < depthMm && at(s) === Tissue.RetroperitonealFat) {
        let f = s;
        while (f < depthMm && at(f) === Tissue.RetroperitonealFat) f += 0.25;
        if (f < depthMm && KIDNEY_TISSUES.has(at(f))) s = f;
      }
      return s < depthMm ? below(s) : { ...none, content: 'below' };
    }
    if (ABDOMINAL_TISSUES.has(t)) return below(r);
    return none;
  }
  return none;
}

/** z del centro de la costilla n (1–12) del lado `side` bajo la línea de piel φ. */
function ribZ(scene: AnatomyScene, n: number, phi: number, side: CoverageSide): number {
  const k = scene.ribs.findIndex((r) => r.number === n && r.side === side);
  return ribTableZ(scene.ribCage, k, ribLineArc(phi, scene.torso, scene.ribCage));
}

/** ¿Llega la costilla n a la línea φ? */
function ribReaches(scene: AnatomyScene, n: number, phi: number, side: CoverageSide): boolean {
  const r = scene.ribs.find((x) => x.number === n && x.side === side)!;
  const au = ribLineArc(phi, scene.torso, scene.ribCage);
  return au >= r.uEnd && au <= r.uPost;
}

/** z (mm) del cuerpo de la vértebra torácica n (lus-sim, decisión 29: la de la parrilla, `organs/ribcage.ts`). */
export { vertebraZ };

/**
 * El borde inferior del pulmón en FRC bajo la línea, según la base (los anclajes de Gray de `anatomy.lungBorder`, cada uno a
 * la altura que tiene en su propia línea): [zMin, zMax]. Una línea sin anclaje propio toma el intervalo entre las alturas de
 * las dos vecinas que lo tienen (no el mismo número de costilla en otra línea: detrás, las costillas suben hacia la columna).
 */
export function baseBorderZ(scene: AnatomyScene, line: ThoraxLine, side: CoverageSide): [number, number] {
  const P = LUNG_BORDER.params;
  const anchor = (l: ThoraxLine, n: number) => ribZ(scene, n, thoraxLinePhi(l, scene.torso, side), side);
  const ps = anchor('parasternal', P.borderParasternalRib.value);
  const mcl = anchor('midclavicular', P.borderMidclavicularRib.value);
  const lam = anchor('midaxillary', P.borderMidaxillaryRib.value);
  const post = vertebraZ(P.borderPosteriorVertebra.value);
  const span = (a: number, b: number): [number, number] => [Math.min(a, b), Math.max(a, b)];
  switch (line) {
    case 'parasternal':
      return [ps, ps];
    case 'midclavicular':
      return [mcl, mcl];
    case 'anteriorAxillary':
      return span(mcl, lam);
    case 'midaxillary':
      return [lam, lam];
    case 'posteriorAxillary':
    case 'scapular':
      return span(lam, post);
    case 'paravertebral':
      return [post, post];
  }
}

/**
 * Margen (mm) entre el centro de un espacio y el borde de la base para darlo por pulmón o por debajo: la mitad del ancho de un
 * espacio intercostal (14–20 mm en la base). En las líneas con anclaje propio el borde cae en una costilla y ningún espacio
 * queda a menos de él: ahí no hay espacio de borde.
 */
export const BORDER_MARGIN_MM = 8;

/**
 * La cobertura de exploración de la escena con las posiciones del paciente admitidas (`positions`). Fin de espiración.
 */
export function explorationCoverage(
  scene: AnatomyScene,
  positions: readonly PositionReach[] = [SUPINE_REACH, SITTING_REACH],
): CoverageReport {
  const cells: CoverageCell[] = [];
  const t = scene.torso;
  const C = COVERAGE.params;
  const reach = (pose: ProbePose): [string, ProbePose] | null => {
    for (const p of positions) {
      const a = p.admit(pose);
      if (a) return [p.id, a];
    }
    return null;
  };
  const sideLabel = (s: CoverageSide) => (s < 0 ? 'D' : 'I');
  for (const side of [-1, 1] as const) {
    for (const { line, label, region } of LINES) {
      const phi = thoraxLinePhi(line, t, side);
      const [bLo, bHi] = baseBorderZ(scene, line, side);
      for (let ics = 1; ics <= 11; ics++) {
        if (!ribReaches(scene, ics, phi, side) || !ribReaches(scene, ics + 1, phi, side)) continue;
        const z = 0.5 * (ribZ(scene, ics, phi, side) + ribZ(scene, ics + 1, phi, side));
        const expected = expectationOf(scene, line, side, ics, z, phi, bLo, bHi);
        const cell = blankCell(`${sideLabel(side)} ${label} EIC${ics}`, side, line, ics, region, 'ics', phi, z, expected);
        const r = reach({ phi, z, lift: 0, yaw: 0, rock: 0, tilt: 0 });
        if (!r) cell.reason = 'la sonda no se apoya ahí en ninguna posición admitida';
        else {
          cell.position = r[0];
          const m = probeCenterContent(scene, r[1]);
          cell.content = m.content;
          cell.organ = m.organ;
          cell.stomach = m.stomach;
          cell.pleuraMm = m.pleuraMm;
          cell.reason = judge(expected, side, m, line, z, ics);
          cell.met = cell.reason === null;
        }
        cells.push(cell);
      }
    }
    const medial = aboveApexCell(scene, side, 'medial');
    cells.push(medial, aboveApexCell(scene, side, 'lateral'));
    cells.push(supraclavicularCell(scene, side, reach, medial, C.supraclavicularXMm.value));
  }
  const byRegion: CoverageReport['byRegion'] = {
    anterior: { met: 0, total: 0 },
    lateral: { met: 0, total: 0 },
    posterior: { met: 0, total: 0 },
    apex: { met: 0, total: 0 },
  };
  for (const c of cells) {
    byRegion[c.region].total++;
    if (c.met) byRegion[c.region].met++;
  }
  return { cells, met: cells.filter((c) => c.met).length, total: cells.length, byRegion };
}

function blankCell(
  id: string,
  side: CoverageSide,
  line: CoverageCell['line'],
  ics: number,
  region: CoverageRegion,
  kind: CoverageCell['kind'],
  phi: number,
  z: number,
  expected: CoverageCell['expected'],
): CoverageCell {
  return {
    id,
    side,
    line,
    ics,
    region,
    kind,
    phi,
    z,
    expected,
    position: null,
    content: null,
    organ: null,
    stomach: false,
    pleuraMm: null,
    lungTopZ: null,
    met: false,
    reason: null,
  };
}

/** Lo que la base pone en el centro del espacio `ics` de la línea (a la altura z). */
function expectationOf(
  scene: AnatomyScene,
  line: ThoraxLine,
  side: CoverageSide,
  ics: number,
  z: number,
  phi: number,
  bLo: number,
  bHi: number,
): CellExpectation {
  // la ventana cardiaca de A-T16: la paraesternal izquierda en los EIC 4.º–5.º; el disco de Latham (5 cm centrado en el 5.º
  // EIC) llega al borde del 6.º
  if (side === 1 && line === 'parasternal') {
    if (ics === 4 || ics === 5) return 'heart';
    if (ics === 6) return 'heartOrBelow';
  }
  // la línea escapular con los brazos a los lados pasa por el ángulo inferior de la escápula y sube junto a su borde medial: del
  // ángulo inferior (la apófisis de T8, Cooperstein) a la altura del superior, su largo más arriba (Garzón-Alfaro), el hueso o el
  // pulmón junto a él (decisión 29: antes, hasta la 2.ª costilla, atribuido a Gray; no está en la edición de 1918)
  if (line === 'scapular') {
    const S = SCAPULA.params;
    const angle = spinousTipZ(S.inferiorAngleSpinous.value);
    const length = scene.chestWall.habitus.sex === 'female' ? S.lengthFemaleMm.value : S.lengthMm.value;
    if (z >= angle - BORDER_MARGIN_MM && z <= angle + length) return 'scapula';
  }
  if (z > bHi + BORDER_MARGIN_MM) return 'lung';
  if (z < bLo - BORDER_MARGIN_MM) return 'below';
  return 'border';
}

/**
 * Lo que pone la base bajo el diafragma donde el modelo pone otra cosa (decisiones 37 y 43), para el motivo de la celda: detrás
 * (la escapular y la paravertebral), por debajo de la punta de la apófisis de T11 (el riñón derecho, 1 cm más abajo), el riñón
 * (el paralelogramo de Morris, Gray); detrás y más arriba a la izquierda, el polo posterior del bazo de Gray, y en la axilar
 * posterior sobre la 10.ª costilla, el bazo de una parte de los adultos (los dos, más de lo que alcanza el bazo normal de la
 * decisión 43); a la izquierda en las
 * axilares, por debajo del borde inferior de la 11.ª costilla (el límite inferior del bazo de Gray), el ángulo esplénico del colon,
 * que sostiene el bazo (Gray: el ligamento frenocólico); delante y al lado a la izquierda, el estómago (el espacio de Traube); a la
 * derecha, el hígado. `below11`: si la celda está por debajo de la 11.ª costilla (el EIC11).
 */
function baseOrganBelow(side: CoverageSide, line: ThoraxLine, z: number, below11: boolean): string {
  const K = KIDNEY.params;
  const back = line === 'scapular' || line === 'paravertebral';
  const kidneyTop = spinousTipZ(K.topSpinous.value) - (side < 0 ? K.rightLowerMm.value : 0);
  if (back && z < kidneyTop) return 'la base pone ahí el riñón (Morris), que el modelo no llega a poner';
  if (side > 0 && back)
    return (
      'la base (Gray) pone ahí el polo posterior del bazo, a 4 cm de la línea media en T9; el bazo normal, del tamaño y en el sitio ' +
      'de la TC (decisión 43), no llega'
    );
  if (side > 0 && below11) return 'la base pone ahí, bajo el bazo, el ángulo esplénico del colon, que el modelo no tiene';
  if (side > 0 && line === 'posteriorAxillary')
    return (
      'la base pone ahí el bazo en 4 de cada 10 adultos (Shen y cols.: desde la 9.ª costilla); el bazo normal del modelo, entre ' +
      'la 10.ª y la 12.ª como en la mitad (decisión 43), empieza más abajo'
    );
  if (side > 0) return 'la base pone ahí el estómago (el espacio de Traube), que el modelo no llega a poner';
  return 'la base pone ahí el hígado, que el modelo no llega a poner';
}

/** null si lo medido es lo esperado; si no, el motivo. */
function judge(expected: CellExpectation, side: CoverageSide, m: CenterContent, line: ThoraxLine, z: number, ics: number): string | null {
  const below = (): string | null => {
    if (m.content !== 'below') return `se espera el diafragma y el órgano de debajo, hay ${m.content}`;
    if (organOk(side, m.organ, m.stomach)) return null;
    const what = m.organ === null ? 'nada' : Tissue[m.organ];
    return `bajo el diafragma, ${what}: ninguno de los órganos del modelo; ${baseOrganBelow(side, line, z, ics >= 11)} (abdomen-generic-tissue)`;
  };
  switch (expected) {
    case 'lung':
    case 'heart':
      return m.content === expected ? null : `se espera ${expected}, hay ${m.content}`;
    case 'below':
      return below();
    case 'border':
      return m.content === 'lung' ? null : below();
    case 'heartOrBelow':
      return m.content === 'heart' ? null : below();
    case 'scapula':
      return m.content === 'bone' || m.content === 'lung' ? null : `se espera la escápula o el pulmón junto a ella, hay ${m.content}`;
  }
}

/** z del borde superior del tercio medial de la clavícula según la base (`anatomy.clavicle`: sobre la escotadura yugular). */
export function clavicleTopZ(scene: AnatomyScene): number {
  return scene.ribCage.sternum.zTop + CLAVICLE.params.medialTopAboveNotchMm.value;
}

/** La z más alta (mm) a la que la base admite pulmón: el vértice, con el tope de su rango (4–5 cm sobre la clavícula). */
export function apexMaxZ(scene: AnatomyScene): number {
  return clavicleTopZ(scene) + LUNG_APEX.params.apexAboveClavicleMm.range![1];
}

/** |x| (mm) del final del tercio medial de la clavícula: el vértice está tras él (Gray). */
export function clavicleMedialThirdX(scene: AnatomyScene): number {
  return CLAVICLE.params.medialEndXMm.value + clavicleLengthMm(scene) / 3;
}

/** El largo de la clavícula según la base, por sexo (Yang). */
function clavicleLengthMm(scene: AnatomyScene): number {
  const C = CLAVICLE.params;
  return scene.chestWall.habitus.sex === 'female' ? C.lengthFemaleMm.value : C.lengthMm.value;
}

/** Paso (mm) de la búsqueda del pulmón sobre el vértice: en z y hacia dentro. */
const APEX_SCAN_STEP_MM = 3;

/**
 * La z más alta que la base admite para el pulmón en el punto MATERIAL m: bajo el tercio medial de la clavícula (por delante,
 * |x| hasta su final), el vértice (`apexMaxZ`); bajo el tercio medio, de él a la 1.ª costilla de su columna más
 * `BORDER_MARGIN_MM`, en recta; en el resto, la 1.ª costilla.
 */
export function lungTopAllowedZ(scene: AnatomyScene, m: Vec3): number {
  const side: CoverageSide = m[0] < 0 ? -1 : 1;
  const k = scene.ribs.findIndex((r) => r.number === 1 && r.side === side);
  const rib = ribTableZ(scene.ribCage, k, Math.abs(wallArc(m, scene.torso))) + scene.ribs[k].halfWidth + BORDER_MARGIN_MM;
  if (m[1] <= 0) return rib;
  const x = Math.abs(m[0]);
  // por delante de la articulación esternoclavicular, la tráquea: nada sobre la escotadura yugular (en la columna de la piel,
  // la radial del tronco: la de la escotadura clavicular del manubrio)
  const t = scene.torso;
  const uSc = Math.abs(wallArc(torsoSkinPoint(Math.acos(CLAVICLE.params.medialEndXMm.value / t.a), 0, t), t));
  if (Math.abs(wallArc(m, t)) < uSc) return scene.ribCage.sternum.zTop + BORDER_MARGIN_MM;
  const x1 = clavicleMedialThirdX(scene);
  const x2 = CLAVICLE.params.medialEndXMm.value + (2 * clavicleLengthMm(scene)) / 3;
  if (x <= x1) return apexMaxZ(scene);
  // bajo el tercio medio, la ladera de la cúpula baja hasta la 1.ª costilla [SUPUESTO: la base no da su forma; la pleura sobre
  // la 1.ª costilla se ve por la fosa, sobre el tercio medio: el «corner pocket» de Yadav, a 1,7 ± 0,8 cm de la piel]
  if (x < x2) return Math.max(rib, apexMaxZ(scene) + ((rib - apexMaxZ(scene)) * (x - x1)) / (x2 - x1));
  return rib;
}

/**
 * «Sobre el vértice» (iii), en todo el corte del hemitórax: la anatomía, en una rejilla del corte (cada 5° del ángulo de la
 * elipse y cada `APEX_SCAN_STEP_MM` hacia dentro), no tiene pulmón más arriba que lo que admite la base (`lungTopAllowedZ`).
 * `medial`: los puntos bajo el tercio medial de la clavícula (la cúpula); `lateral`: el resto del hemitórax.
 */
function aboveApexCell(scene: AnatomyScene, side: CoverageSide, zone: 'medial' | 'lateral'): CoverageCell {
  const t = scene.torso;
  const xm = clavicleMedialThirdX(scene);
  // por debajo, la 1.ª costilla y el vértice quedan siempre más arriba de lo que se busca
  const zFloor = scene.ribCage.sternum.zTop - 40;
  let top: number | null = null;
  let where = '';
  for (let deg = 0; deg <= 180 && top === null; deg += 5) {
    // ángulo de la elipse desde la línea media anterior hacia el lado `side`, hasta la posterior
    const tau = (deg * Math.PI) / 180;
    const sx = side * t.a * Math.sin(tau);
    const sy = t.b * Math.cos(tau);
    const R = Math.hypot(sx, sy);
    for (let z = t.zMax - 1; z > zFloor && top === null; z -= APEX_SCAN_STEP_MM) {
      for (let d = 1; d < R - 1; d += APEX_SCAN_STEP_MM) {
        const m: Vec3 = [sx * (1 - d / R), sy * (1 - d / R), z];
        const inMedial = m[1] > 0 && Math.abs(m[0]) <= xm;
        if (inMedial !== (zone === 'medial')) continue;
        if (-torsoDepth(m, t) < 0) continue;
        if (z <= lungTopAllowedZ(scene, m)) continue;
        if (scene.classify(m, BASELINE_INSTANT).tissue === Tissue.Lung) {
          top = z;
          where = `(${m[0].toFixed(0)}, ${m[1].toFixed(0)})`;
          break;
        }
      }
    }
  }
  const label = zone === 'medial' ? 'tercio medial' : 'fuera del tercio medial';
  const cell = blankCell(`${side < 0 ? 'D' : 'I'} vértice, ${label}`, side, 'apex', 0, 'apex', 'aboveApex', 0, zFloor, 'noLung');
  cell.lungTopZ = top;
  cell.met = top === null;
  cell.reason = top === null ? null : `pulmón en z ${top.toFixed(0)} en ${where}, sobre lo que admite la base`;
  return cell;
}

/**
 * La fosa supraclavicular (ii): por encima de la clavícula, la sonda de plano o inclinada hacia los pies (como en la clínica)
 * encuentra la cúpula pleural con el pulmón del vértice. Solo cuenta si el vértice existe (`medial` se cumple): con el pulmón
 * subiendo hasta el tope del tronco, la fosa vería pulmón sin que haya cúpula.
 */
function supraclavicularCell(
  scene: AnatomyScene,
  side: CoverageSide,
  reach: (pose: ProbePose) => [string, ProbePose] | null,
  medial: CoverageCell,
  x: number,
): CoverageCell {
  const t = scene.torso;
  const right = Math.PI - Math.acos(x / t.a);
  const phi = side < 0 ? right : Math.PI - right;
  const z = clavicleTopZ(scene) + 0.5 * LUNG_APEX.params.apexAboveClavicleMm.value;
  const cell = blankCell(
    `${side < 0 ? 'D' : 'I'} fosa supraclavicular`,
    side,
    'supraclavicular',
    0,
    'apex',
    'supraclavicular',
    phi,
    z,
    'lung',
  );
  for (const rock of [0, -0.35, -0.7]) {
    const r = reach({ phi, z, lift: 0, yaw: 0, rock, tilt: 0 });
    if (!r) continue;
    const m = probeCenterContent(scene, r[1]);
    cell.position = r[0];
    cell.content = m.content;
    cell.pleuraMm = m.pleuraMm;
    if (m.content === 'lung') break;
  }
  if (!cell.position) cell.reason = 'la sonda no se apoya ahí en ninguna posición admitida';
  else if (cell.content !== 'lung') cell.reason = `se espera la cúpula con el pulmón, hay ${cell.content}`;
  else if (!medial.met) cell.reason = 'se ve pulmón, pero sin vértice: el pulmón sigue sobre la cúpula de la base';
  cell.met = cell.reason === null;
  return cell;
}
