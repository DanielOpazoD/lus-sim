import { defineParameters } from '../core/evidence';
import type { Vec3 } from '../core/vec3';
import { AnatomyQuery } from '../anatomy/query';
import { LUNG_BORDER } from '../anatomy/organs/lungBorder';
import { RIBCAGE, ribLineArc, ribTableZ } from '../anatomy/organs/ribcage';
import { wallArc } from '../anatomy/organs/wall';
import { torsoDepth } from '../anatomy/primitives';
import { BASELINE_INSTANT, type AnatomyScene, type SceneInstant } from '../anatomy/scene';
import { thoraxLinePhi, type ThoraxLine } from '../anatomy/thoraxLines';
import { Tissue } from '../anatomy/tissues';
import type { RespiratorySample } from '../physiology/respiratory';
import { probeContact } from '../probe/contact';
import { CONVEX_C35, clampPose, lineDirection, pointOnLine, type ProbePose, type Transducer } from '../probe/probe';
import { pleuraCrossingLine } from '../ultrasound/transmission';

/**
 * Cobertura de exploración (lus-sim, decisión 26; requisito de cobertura de `docs/MISSION.md`: el pulmón se explora
 * entero). Recorre, por hemitórax, los espacios intercostales 1.º–11.º en cada línea de referencia de la exploración
 * (paraesternal, medioclavicular, axilares anterior, media y posterior, escapular y paravertebral), el vértice y la fosa
 * supraclavicular, y en cada celda pregunta lo que pregunta el alumno con la sonda en la mano:
 *
 *  (i) ¿se puede apoyar ahí la sonda, en alguna posición del paciente admitida (hoy, el decúbito supino de `clampPose`)?
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
  clavicleAboveNotchMm: {
    value: 10,
    unit: 'mm',
    range: [5, 15],
    evidence: 'derivado',
    sources: ['gray-anatomia-1918', 'yang-clavicula-2017'],
    note:
      'Borde superior del tercio medial de la clavícula sobre la escotadura yugular: la clavícula se articula con el manubrio a ' +
      'los lados de la escotadura (Gray), con su eje a esa altura; su extremo esternal mide 2,5 ± 0,3 cm y su tercio medio 1,4 ' +
      '± 0,1 en varones (Yang, TAC de 50 varones, tabla 2): el tercio medial, ≈ 2 cm, su semialto 10 mm',
  },
  apexAboveClavicleMm: {
    value: 25,
    unit: 'mm',
    range: [25, 50],
    evidence: 'consenso',
    sources: ['gray-anatomia-1918'],
    note: 'El vértice del pulmón ≈ 2,5 cm sobre el tercio medial de la clavícula, a veces hasta 4–5 cm (anatomy.md §1.5)',
  },
  clavicleMedialEndXMm: {
    value: 20,
    unit: 'mm',
    range: [15, 27],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note:
      'Distancia a la línea media del extremo esternal de la clavícula, en la escotadura clavicular del manubrio, a los lados ' +
      'de la yugular (Gray, sin cifra) [SUPUESTO: dentro del semiancho del manubrio de la parrilla, 27 mm]',
  },
  clavicleLengthMm: {
    value: 156,
    unit: 'mm',
    range: [147, 165],
    evidence: 'documentado',
    sources: ['yang-clavicula-2017'],
    note: 'Largo de la clavícula del varón, 15,6 ± 0,9 cm (Yang, TAC de 50 varones de 34,8 años, tabla 2)',
  },
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
  scapulaInferiorAngleSpinous: {
    value: 8,
    unit: 'apófisis espinosa',
    range: [7, 9],
    evidence: 'documentado',
    sources: ['cooperstein-escapula-2015', 'gray-anatomia-1918'],
    note:
      'El ángulo inferior de la escápula, de pie y con los brazos a los lados, a la altura de la apófisis espinosa de T8 (nivel ' +
      'medio 8,01 en el metaanálisis de 5 estudios, 343 personas; el 85,4 % a un nivel o menos de T8; Cooperstein 2015, texto ' +
      'completo). Gray dice T7 [DISCREPANCIA]. Sentado, la base lo toma igual (A-T18). La punta de la apófisis de T8 está a la ' +
      'altura del cuerpo de T9 (la regla de los tres, como el borde posterior del pulmón en `anatomy.lungBorder`). La escápula ' +
      'cubre de la 2.ª a la 7.ª costilla (Gray)',
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

/** Decúbito supino: la sonda donde `clampPose` la deja (de −0,2π a 1,2π, por detrás de las axilares posteriores; z ±200). */
export const SUPINE_REACH: PositionReach = {
  id: 'supine',
  admit: (pose) => {
    // el ángulo puede darse en cualquier vuelta: se prueba la que cae en el dominio
    for (const k of [0, 1, -1]) {
      const p = { ...pose, phi: pose.phi + 2 * Math.PI * k };
      const c = clampPose(p);
      if (Math.abs(c.phi - p.phi) < 1e-9 && Math.abs(c.z - p.z) < 1e-9) return c;
    }
    return null;
  },
};

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
/** El órgano bajo el diafragma que la base pone en cada lado: el hígado a la derecha; a la izquierda, su lóbulo o el bazo. */
function organOk(side: CoverageSide, organ: Tissue | null): boolean {
  // el bazo, cuando exista su tejido, se admitirá a la izquierda (`side` > 0)
  void side;
  return organ === Tissue.Liver || organ === Tissue.LiverCapsule;
}

export interface CenterContent {
  content: CellContent;
  /** Bajo el diafragma, el primer tejido que no es diafragma. */
  organ: Tissue | null;
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
  const at = (r: number) => scene.classify(material(pointOnLine(contact.frame, tr, 0, r)), instant).tissue;
  for (let r = 0.25; r < depthMm; r += 0.25) {
    const t = at(r);
    if (PASS_TISSUES.has(t)) continue;
    if (t === Tissue.Lung) return { content: crossing ? 'lung' : 'none', organ: null, pleuraMm: crossing ? crossing.D : null };
    if (t === Tissue.Bone || t === Tissue.Vertebra) return { content: 'bone', organ: null, pleuraMm: null };
    if (t === Tissue.Myocardium || t === Tissue.Blood) return { content: 'heart', organ: null, pleuraMm: null };
    if (t === Tissue.Diaphragm) {
      // el órgano: lo primero bajo el diafragma
      let s = r;
      while (s < depthMm && at(s) === Tissue.Diaphragm) s += 0.25;
      return { content: 'below', organ: s < depthMm ? at(s) : null, pleuraMm: null };
    }
    if (t === Tissue.Bowel || t === Tissue.Liver || t === Tissue.LiverCapsule) return { content: 'below', organ: t, pleuraMm: null };
    return { content: 'none', organ: null, pleuraMm: null };
  }
  return { content: 'none', organ: null, pleuraMm: null };
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

/** z (mm) del cuerpo de la vértebra torácica n (z = 0 en el disco T9–T10, `anatomy.ribcage.thoracicSegmentMm`). */
export function vertebraZ(n: number): number {
  return (9.5 - n) * RIBCAGE.params.thoracicSegmentMm.value;
}

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
export function explorationCoverage(scene: AnatomyScene, positions: readonly PositionReach[] = [SUPINE_REACH]): CoverageReport {
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
          cell.pleuraMm = m.pleuraMm;
          cell.reason = judge(expected, side, m);
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
  // la línea escapular con los brazos a los lados pasa por el ángulo inferior de la escápula y sube por su borde medial: de
  // la 2.ª costilla (Gray) al ángulo inferior (T8, Cooperstein), el hueso o el pulmón junto a él
  if (line === 'scapular') {
    // la punta de la apófisis espinosa de T7–T10 queda a la altura del cuerpo de la vértebra de debajo (la regla de los tres)
    const angle = vertebraZ(COVERAGE.params.scapulaInferiorAngleSpinous.value + 1);
    if (z >= angle - BORDER_MARGIN_MM && z <= ribZ(scene, 2, phi, side)) return 'scapula';
  }
  if (z > bHi + BORDER_MARGIN_MM) return 'lung';
  if (z < bLo - BORDER_MARGIN_MM) return 'below';
  return 'border';
}

/** null si lo medido es lo esperado; si no, el motivo. */
function judge(expected: CellExpectation, side: CoverageSide, m: CenterContent): string | null {
  const below = (): string | null => {
    if (m.content !== 'below') return `se espera el diafragma y el órgano de debajo, hay ${m.content}`;
    if (organOk(side, m.organ)) return null;
    return `bajo el diafragma, ${m.organ === null ? 'nada' : Tissue[m.organ]}: sin ${side < 0 ? 'hígado' : 'hígado ni bazo'} (abdomen-generic-tissue)`;
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

/** z del borde superior del tercio medial de la clavícula (la escotadura yugular de la parrilla más su semialto). */
export function clavicleTopZ(scene: AnatomyScene): number {
  return scene.ribCage.sternum.zTop + COVERAGE.params.clavicleAboveNotchMm.value;
}

/** La z más alta (mm) a la que la base admite pulmón: el vértice, con el tope de su rango (4–5 cm sobre la clavícula). */
export function apexMaxZ(scene: AnatomyScene): number {
  return clavicleTopZ(scene) + COVERAGE.params.apexAboveClavicleMm.range![1];
}

/** |x| (mm) del final del tercio medial de la clavícula: el vértice está tras él (Gray). */
export function clavicleMedialThirdX(): number {
  const C = COVERAGE.params;
  return C.clavicleMedialEndXMm.value + C.clavicleLengthMm.value / 3;
}

/** Paso (mm) de la búsqueda del pulmón sobre el vértice: en z y hacia dentro. */
const APEX_SCAN_STEP_MM = 3;

/**
 * La z más alta que la base admite para el pulmón en el punto MATERIAL m: bajo el tercio medial de la clavícula (por delante,
 * |x| hasta su final), el vértice (`apexMaxZ`); en el resto, la 1.ª costilla de su columna más `BORDER_MARGIN_MM`.
 */
export function lungTopAllowedZ(scene: AnatomyScene, m: Vec3): number {
  if (m[1] > 0 && Math.abs(m[0]) <= clavicleMedialThirdX()) return apexMaxZ(scene);
  const side: CoverageSide = m[0] < 0 ? -1 : 1;
  const k = scene.ribs.findIndex((r) => r.number === 1 && r.side === side);
  return ribTableZ(scene.ribCage, k, Math.abs(wallArc(m, scene.torso))) + scene.ribs[k].halfWidth + BORDER_MARGIN_MM;
}

/**
 * «Sobre el vértice» (iii), en todo el corte del hemitórax: la anatomía, en una rejilla del corte (cada 5° del ángulo de la
 * elipse y cada `APEX_SCAN_STEP_MM` hacia dentro), no tiene pulmón más arriba que lo que admite la base (`lungTopAllowedZ`).
 * `medial`: los puntos bajo el tercio medial de la clavícula (la cúpula); `lateral`: el resto del hemitórax.
 */
function aboveApexCell(scene: AnatomyScene, side: CoverageSide, zone: 'medial' | 'lateral'): CoverageCell {
  const t = scene.torso;
  const xm = clavicleMedialThirdX();
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
  const z = clavicleTopZ(scene) + 0.5 * COVERAGE.params.apexAboveClavicleMm.value;
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
