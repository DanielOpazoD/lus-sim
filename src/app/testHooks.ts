import type { EquipmentCommand } from './equipment';
import {
  equivalenceSweep,
  interfaceShellEquivalence,
  pleuraEquivalence,
  volumeEquivalence,
  type EquivalencePoseReport,
  type InterfaceShellReport,
  type PleuraEquivalenceReport,
  type VolumeEquivalenceReport,
} from './equivalenceSweep';
import { contactCoupling } from '../probe/contact';
import { pointOnLine, type ProbePose } from '../probe/probe';
import { Interface, isRibInterface, isWallLayerInterface } from '../anatomy/interfaces';
import { TISSUES, Tissue } from '../anatomy/tissues';
import type { Vec3 } from '../core/vec3';
import { FRAME_PASSES, type PassId } from '../ultrasound/passGraph';
import { pleuraCrossingLine, rayAttenuationDb } from '../ultrasound/transmission';
import { type ApertureGeometry } from '../ultrasound/aperture';
import { compareSteeredTransmission } from './steeredParity';
import { compoundActive } from '../ultrasound/compound';
import { COARSE_DEPTH, type CompoundState } from '../ultrasound/renderer';
import type { RespiratoryPattern } from '../physiology/patientState';
import { speckleStats, type SpeckleOptions, type SpeckleStats } from './speckle';
import type { RenderMeasureOptions, Simulator } from './simulator';
import { START_POINTS, type StartPoint } from './startPoints';

/**
 * Ganchos de prueba estables (e2e). Se cargan con `import()` dinámico solo en desarrollo o
 * con `?e2e`: el barrido de equivalencia no viaja en el bundle que abre el alumno.
 *
 * lus-sim (decisión 12): el subconjunto del tórax — equivalencia (tejido en los planos de partida, volumen,
 * cáscara de las caras y, propia, la pleura parietal de A0), moteado, líneas A (propia: meta F-T01 en la
 * envolvente de la GPU), pared (normales de sus caras), coste del cuadro, paridad de la pasada A y poses. Sin los
 * del banco de fidelidad del hígado, el color, el PW, las tríadas portales ni el lazo cerrado de VExUS.
 */
export interface TestHooks {
  equivalenceSweep: () => EquivalencePoseReport[];
  /** Equivalencia TS ↔ GLSL en `n` puntos aleatorios de todo el tórax. */
  volumeEquivalence: (n?: number) => VolumeEquivalenceReport;
  /** Equivalencia de la cara de interfaz y su distancia a 0,01–0,6 mm de cada cara, en los planos de partida. */
  interfaceShell: () => InterfaceShellReport;
  /** La pleura parietal de A0 frente a su gemelo de TS, línea a línea, en los puntos de partida. */
  pleuraEquivalence: () => PleuraEquivalenceReport;
  /**
   * Estadística del speckle en el músculo de la pared (guarda de imagen). Con `startPoint` o `pose` (lus-sim: la guarda
   * mide en poses paraesternales, donde el músculo es una sola capa), coloca antes la sonda y avanza lo justo para que
   * el marco la siga. `compound` (obligatorio, decisión 58): con `false`, la imagen de una mirada de siempre; con
   * `true`, llena el anillo de miradas y mide la envolvente compuesta. El conmutador vuelve a como estaba al terminar.
   */
  speckle: (opts: SpeckleOptions & { startPoint?: StartPoint['id']; pose?: ProbePose; compound: boolean }) => SpeckleStats;
  /**
   * Líneas A en la envolvente de la GPU (meta F-T01, `docs/knowledge/physics.md` §3.3): en `startPoint` con la
   * respiración `respiration`; con `compound` (lus-sim, decisión 15), en la envolvente compuesta de la pasada K con el
   * anillo de miradas lleno, y si no, en la mirada 0. Ver `ALineStats`.
   */
  aLines: (opts: { startPoint: StartPoint['id']; respiration: RespiratoryPattern; compound?: boolean }) => ALineStats;
  /**
   * Caras de la pared y de las costillas (decisión 62): la cara, la normal y la norma del gradiente de la GPU
   * (`faceGradient`: `wallFaceSd`, `ribSd`) frente a las de TS (`AnatomyScene.faceGradient`) en los puntos del
   * plano a 0,02–0,4 mm de la cara que dibujan según la CPU. Ver `WallNormalStats`.
   */
  wallNormals: (opts: { startPoint: StartPoint['id'] }) => WallNormalStats;
  /**
   * Coste medio de `n` cuadros de imagen en tiempo de pared (ms), sincronizado con la GPU al
   * principio y al final: compara versiones del renderizador en la misma máquina. Lanza (en vez de devolver
   * ≈ 0 ms) con la imagen congelada o con `n` que no sea un entero ≥ 1. Ver `FrameCostOptions`.
   */
  frameCostMs: (n: number, opts?: FrameCostOptions) => number;
  /**
   * Paridad de la pasada A (un solo rayo) con el modelo de CPU `rayAttenuationDb` en los mismos
   * puntos de muestra, cada `every` líneas y en todas las profundidades gruesas; se saltan las líneas
   * con espejo (la CPU no sigue el rayo reflejado) y las transmisiones por debajo de −60 dB. Con `look` ≥ 1
   * (exige `compound`, decisión 58) compara la mirada dirigida de la GPU (el prefijo de A2 y la
   * transmisión con apertura de A) con sus gemelos de TS (`steeredPrefixDb`, `steeredApertureTransmission`)
   * sobre los mismos segmentos de A0/A1 de la GPU; las muestras en un empate de redondeo se cuentan aparte.
   */
  transmissionParity: (opts: { compound: boolean; look?: number; startPoint?: StartPoint['id']; every?: number; ambiguityMm?: number }) => {
    lines: number;
    samples: number;
    maxDiffDb: number;
    /** Solo miradas dirigidas: el peor desacuerdo de la transmisión con apertura (dB) y las muestras en empate. */
    apertureMaxDiffDb?: number;
    ambiguous?: number;
    /** Líneas cortadas en su primer segmento de tejido ambiguo (otro tejido a ±`ambiguityMm` del centro). */
    truncatedLines: number;
    /** Dónde está el peor desacuerdo (diagnóstico del mensaje de la e2e). */
    worst: { line: number; depthMm: number; cpuDb: number; gpuDb: number; tissue: string } | null;
  };
  /** Coloca la sonda en un punto de partida (sin animación) y avanza lo justo para que el marco la siga. */
  goToStartPoint: (id: StartPoint['id']) => void;
  /** Lleva la sonda a una pose cualquiera (capturas y búsqueda de ventanas). */
  setPose: (pose: ProbePose) => void;
  /** Separa la sonda de la piel `mm` (0 = contacto) sin tocar el resto de la pose. */
  liftProbe: (mm: number) => void;
  /** Avanza la simulación `seconds` sin renderizar: SwiftShader es lento. */
  advance: (seconds: number) => void;
  /** Enciende o apaga la composición espacial con el comando del equipo (decisión 58). */
  setCompound: (on: boolean) => void;
  /** Enciende o apaga la armónica tisular con el comando del equipo (decisión 77). */
  setHarmonic: (on: boolean) => void;
  /** Estado del anillo de miradas tras el último cuadro (decisión 58). */
  compoundState: () => CompoundState;
  /**
   * La guarda de `readEnvelope` (decisión 58): con el compuesto, tras un cuadro de mirada dirigida, leer la
   * mirada 0 lanza; devuelve si lanzó, el mensaje y la mirada del último cuadro.
   */
  envelopeGuard: (opts: { startPoint: StartPoint['id'] }) => { threw: boolean; message: string; look: number };
  /** El simulador vivo. */
  sim: () => Simulator;
}

/** Opciones de `frameCostMs`. */
export interface FrameCostOptions {
  /**
   * Repite esa pasada `repeatCount` veces más (1 por defecto) dentro de cada cuadro, sin cambiar la
   * imagen: su coste es la diferencia con la medida sin repetir dividida por `repeatCount`. Metal no
   * separa el tiempo de las pasadas (decisión 47).
   */
  repeatPass?: PassId;
  repeatCount?: number;
  /** Coloca antes la sonda en ese punto de partida, para comparar medidas en la misma pose. */
  startPoint?: StartPoint['id'];
}

/** Valida las opciones de `frameCostMs` (nada de ignorarlas en silencio) y las traduce a las de `render`. */
export function frameMeasureOptions(opts: FrameCostOptions = {}): RenderMeasureOptions {
  const { repeatPass, repeatCount } = opts;
  if (repeatPass === undefined) {
    if (repeatCount !== undefined) throw new RangeError('frameCostMs: repeatCount sin repeatPass');
    return {};
  }
  const spec = FRAME_PASSES.find((p) => p.id === repeatPass);
  if (!spec) throw new RangeError(`frameCostMs: «${String(repeatPass)}» no es una pasada de FRAME_PASSES`);
  const times = repeatCount ?? 1;
  if (!Number.isInteger(times) || times < 1) throw new RangeError(`frameCostMs: repeatCount ${times} (entero ≥ 1)`);
  return { repeat: { pass: repeatPass, times } };
}

/**
 * Líneas A medidas en la envolvente de la GPU (lus-sim, decisión 12; meta F-T01 de la base, `docs/knowledge/physics.md`
 * §3.3). Las líneas medidas son las que tienen la pleura registrada en la CPU (`pleuraCrossingLine`, el gemelo de A0)
 * y en la GPU, con contacto y sin costilla ni cartílago en el camino. Como la métrica A1 del banco de referencia
 * (`docs/knowledge/reference-images.md`), el perfil axial se promedia lateralmente: en grupos de `A_LINE_GROUP_LINES`
 * líneas contiguas, la envolvente de cada línea se alinea en su k·D (D, la profundidad de su pleura) y se promedia; el
 * pico del promedio en ±`A_LINE_WINDOW_MM`, con interpolación parabólica, da el error r_k − k·D del grupo (k = 1 es la
 * línea pleural). Un pico cuenta si es un máximo local y sobresale `A_LINE_MIN_PROMINENCE_DB` sobre la mediana del
 * promedio en ±`A_LINE_BACKGROUND_MM` (la neblina). D es la de la CPU: la prueba ata la imagen de la GPU a la
 * geometría de TS. La separación entre órdenes consecutivos (r_k − r_{k−1} − D) es la invariante de la guía (§18).
 * F-T01 se mide como la define la base, frente a la línea pleural MOSTRADA: r_k − k·r_1 en cada grupo donde se
 * detectan la línea pleural y el orden k (lo añadió la revisión del paso B2a: frente a D la prueba era casi circular,
 * porque el shader pone las réplicas en k·D con la misma D).
 */
export interface ALineStats {
  /** Líneas medidas (con pleura, contacto y sin costilla) y grupos en que se promedian. */
  lines: number;
  groups: number;
  /** Profundidad mediana de la pleura en ellas (mm). */
  pleuraMm: number;
  /**
   * Por orden k (1 la línea pleural, 2, 3…): grupos donde cabe, grupos donde se detecta, error con signo mínimo y
   * máximo de su posición frente a k·D (mm), error máximo de la separación con el orden anterior (mm, desde k = 2),
   * error con signo mínimo y máximo frente a k veces la línea pleural mostrada (mm, desde k = 2: F-T01) y prominencia
   * mediana (dB).
   */
  orders: {
    k: number;
    groups: number;
    peaks: number;
    minErrMm: number;
    maxErrMm: number;
    maxSpacingErrMm: number;
    minShownErrMm: number;
    maxShownErrMm: number;
    medianProminenceDb: number;
  }[];
  /** Tamaño de una muestra de la envolvente (mm) y de un píxel de la imagen mostrada (mm). */
  sampleMm: number;
  pixelMm: number;
  /** Descenso del diafragma del cuadro (mm). */
  caudalMm: number;
}

/** Líneas contiguas que se promedian en cada grupo (≈ 4 mm de pleura a 2,5 cm con 192 líneas). */
export const A_LINE_GROUP_LINES = 8;
/** Semiventana de búsqueda del pico de una línea A alrededor de k·D (mm): el triple de la tolerancia de F-T01. */
export const A_LINE_WINDOW_MM = 1.5;
/** Semiventana del fondo (la neblina) sobre el que se mide la prominencia del pico (mm). */
export const A_LINE_BACKGROUND_MM = 4;
/** Prominencia mínima (dB sobre la mediana del fondo) de un pico para contar como línea A. */
export const A_LINE_MIN_PROMINENCE_DB = 6;

export function createTestHooks(getSim: () => Simulator, dispatch: (cmd: EquipmentCommand) => void): TestHooks {
  const hooks: TestHooks = {
    equivalenceSweep: () => equivalenceSweep(getSim()),
    volumeEquivalence: (n) => volumeEquivalence(getSim(), n),
    interfaceShell: () => interfaceShellEquivalence(getSim()),
    pleuraEquivalence: () => withCompound(getSim(), dispatch, false, () => pleuraEquivalence(getSim())),
    speckle: (opts) => {
      const sim = getSim();
      return withCompound(sim, dispatch, opts.compound, () => {
        if (opts.startPoint) goTo(sim, opts.startPoint);
        if (opts.pose) {
          sim.setPose(opts.pose);
          sim.advance(0.05);
        }
        if (opts.compound) {
          fillRing(sim);
          return speckleStats(sim, sim.renderer.readEnvelope({ source: 'compound' }), opts);
        }
        sim.render();
        return speckleStats(sim, sim.renderer.readEnvelope(), opts);
      });
    },
    aLines: (opts) => {
      const sim = getSim();
      const pattern = sim.patient.respiratoryPattern;
      try {
        sim.patient.respiratoryPattern = opts.respiration;
        const compound = opts.compound ?? false;
        return withCompound(sim, dispatch, compound, () => {
          goTo(sim, opts.startPoint);
          if (compound) {
            fillRing(sim);
            return aLineStats(sim, 'compound');
          }
          sim.render();
          return aLineStats(sim);
        });
      } finally {
        sim.patient.respiratoryPattern = pattern;
      }
    },
    wallNormals: (opts) => {
      const sim = getSim();
      goTo(sim, opts.startPoint);
      return wallNormalStats(sim);
    },
    frameCostMs: (n, opts) => {
      const measure = frameMeasureOptions(opts);
      if (!Number.isInteger(n) || n < 1) throw new RangeError(`frameCostMs: n ${n} (entero ≥ 1)`);
      const sim = getSim();
      // sin cuadros dibujados la media sería ≈ 0 ms: un número sin sentido, no una medida
      if (sim.frozen) throw new RangeError('frameCostMs: con la imagen congelada no se dibuja ningún cuadro');
      if (opts?.startPoint) goTo(sim, opts.startPoint);
      sim.render(measure);
      sim.renderer.finishForTiming();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) sim.render(measure);
      sim.renderer.finishForTiming();
      return (performance.now() - t0) / n;
    },
    transmissionParity: (opts) =>
      withCompound(getSim(), dispatch, opts.compound, () => {
        const sim = getSim();
        if (opts.startPoint) goTo(sim, opts.startPoint);
        const look = opts.look ?? 0;
        if (look !== 0) return steeredParity(sim, look, Math.max(1, opts.every ?? 8));
        sim.render();
        const gpu = sim.renderer.readTransmission();
        const tr = sim.transducer;
        const depth = sim.bmode.depthMm;
        const step = depth / gpu.samples;
        const every = Math.max(1, opts.every ?? 8);
        // Un segmento cuyo centro está a menos de ε de una interfaz puede caer de un lado en float32 y del
        // otro en float64: la suma de A2 difiere entonces en un segmento de ahí en adelante. La clasificación
        // ya la comprueba la equivalencia; aquí se compara la suma hasta ese segmento.
        const eps = opts.ambiguityMm ?? 0.02;
        const classifyAt = (theta: number, r: number): Tissue =>
          sim.anatomy.classifyWorld(pointOnLine(sim.frame, tr, theta, r), sim.sample).tissue;
        let lines = 0;
        let samples = 0;
        let maxDiffDb = 0;
        let truncatedLines = 0;
        let worst: { line: number; depthMm: number; cpuDb: number; gpuDb: number; tissue: string } | null = null;
        for (let u = 0; u < gpu.lines; u += every) {
          if (gpu.mirrorHit[(gpu.samples - 1) * gpu.lines + u] >= 0) continue;
          const theta = -tr.halfSector + (2 * tr.halfSector * (u + 0.5)) / gpu.lines;
          const tissues: Tissue[] = [];
          lines++;
          for (let k = 0; k < gpu.samples; k++) {
            const r = (k + 0.5) * step;
            const t = classifyAt(theta, r);
            if (eps > 0 && (classifyAt(theta, r - eps) !== t || classifyAt(theta, r + eps) !== t)) {
              truncatedLines++;
              break;
            }
            tissues.push(t);
            const cpuDb = rayAttenuationDb(tissues, step, sim.profile.bEffectiveMHz);
            const gpuDb = -20 * Math.log10(Math.max(gpu.single[k * gpu.lines + u], 1e-12));
            if (cpuDb > 60 && gpuDb > 60) continue;
            samples++;
            const diff = Math.abs(cpuDb - gpuDb);
            if (diff > maxDiffDb) {
              maxDiffDb = diff;
              worst = { line: u, depthMm: r, cpuDb, gpuDb, tissue: TISSUES[t].name };
            }
          }
        }
        return { lines, samples, maxDiffDb, truncatedLines, worst };
      }),
    goToStartPoint: (id) => goTo(getSim(), id),
    setPose: (pose) => {
      const sim = getSim();
      sim.setPose(pose);
      sim.advance(0.05);
    },
    liftProbe: (mm) => {
      const sim = getSim();
      sim.setPose({ ...sim.pose, lift: mm });
      sim.advance(0.05);
    },
    advance: (seconds) => {
      const sim = getSim();
      for (let t = 0; t < seconds; t += 1 / 60) sim.advance(1 / 60);
    },
    setCompound: (on) => dispatch({ type: 'compound', enabled: on }),
    setHarmonic: (on) => dispatch({ type: 'harmonic', enabled: on }),
    compoundState: () => getSim().renderer.compoundState(),
    envelopeGuard: (opts) => {
      const sim = getSim();
      return withCompound(sim, dispatch, true, () => {
        goTo(sim, opts.startPoint);
        fillRing(sim);
        // un cuadro de mirada dirigida al final: leer la mirada 0 debe lanzar
        for (let i = 0; i < sim.profile.compound.order.length && sim.renderer.compoundState().look === 0; i++) sim.render();
        const look = sim.renderer.compoundState().look;
        try {
          sim.renderer.readEnvelope();
          return { threw: false, message: '', look };
        } catch (e) {
          return { threw: true, message: e instanceof Error ? e.message : String(e), look };
        }
      });
    },
    sim: getSim,
  };
  return hooks;
}

/**
 * Pone el conmutador del compuesto en `on` con el comando del equipo mientras dura `fn` y lo deja como
 * estaba al terminar, aunque falle (decisión 58: los ganchos dicen siempre con qué imagen miden).
 */
function withCompound<T>(sim: Simulator, dispatch: (cmd: EquipmentCommand) => void, on: boolean, fn: () => T): T {
  const was = sim.bmode.compound;
  if (was !== on) dispatch({ type: 'compound', enabled: on });
  try {
    return fn();
  } finally {
    if (was !== on) dispatch({ type: 'compound', enabled: was });
  }
}

/**
 * Dibuja N cuadros (una mirada cada uno, en el orden del anillo): las N ranuras quedan escritas en el
 * instante y la pose de ahora, tanto si el primer cuadro reinicia el anillo (salto de pose) como si no (las
 * de antes serían de otro instante). Lanza si el compuesto no se forma, si la imagen está congelada o si el
 * anillo no queda lleno: medir «el compuesto» sobre una sola mirada sería un número sin sentido.
 */
function fillRing(sim: Simulator): void {
  if (!compoundActive(sim.bmode, { enabled: false })) throw new Error('el compuesto no se forma: conmutador apagado (compoundActive)');
  if (sim.frozen) throw new Error('con la imagen congelada no se dibuja ningún cuadro');
  const n = sim.profile.compound.order.length;
  for (let i = 0; i < n; i++) sim.render();
  if (sim.renderer.compoundState().validCount !== n)
    throw new Error(`el anillo no se llena en ${n} cuadros: ${JSON.stringify(sim.renderer.compoundState())}`);
}

/**
 * Paridad de la mirada dirigida `look` (decisión 58, G8): dibuja hasta que el último cuadro sea esa mirada,
 * lee los segmentos de A0/A1 de la GPU y compara, cada `every` líneas y en todas las filas, el prefijo de A2
 * (dB) y la transmisión con apertura de A con sus gemelos de TS sobre esos segmentos
 * (`compareSteeredTransmission`): una muestra en un empate de redondeo (la GPU calcula en float32) cuenta
 * como ambigua y no entra en el máximo.
 */
function steeredParity(sim: Simulator, look: number, every: number): ReturnType<TestHooks['transmissionParity']> {
  const n = sim.profile.compound.order.length;
  if (!Number.isInteger(look) || look < 0 || look >= n) throw new RangeError(`transmissionParity: mirada ${look} fuera del anillo (${n})`);
  if (!compoundActive(sim.bmode, { enabled: false })) throw new Error('transmissionParity: una mirada dirigida exige el compuesto activo');
  // al menos un cuadro en la pose pedida; luego, hasta que el último sea la mirada `look`
  for (let i = 0; i < 2 * n; i++) {
    sim.render();
    if (sim.renderer.compoundState().look === look) break;
  }
  const gpu = sim.renderer.readTransmission({ look });
  const depth = sim.bmode.depthMm;
  const grid = sim.renderer.readSegments(depth);
  const tr = sim.transducer;
  const beam = sim.profile.beam;
  const ap: ApertureGeometry = {
    lines: gpu.lines,
    halfSector: tr.halfSector,
    curvatureRadius: tr.curvatureRadius,
    apertureTxMm: beam.apertureTxMm,
    apertureRxMaxMm: beam.apertureRxMaxMm,
    fNumberRxMin: beam.fNumberRxMin,
  };
  const parity = compareSteeredTransmission(
    grid,
    ap,
    gpu.theta,
    { lines: gpu.lines, samples: gpu.samples, prefixDb: gpu.prefixDb!, aperture: gpu.aperture },
    every,
  );
  return { ...parity, truncatedLines: 0 };
}

/** Caras de la pared y de las costillas en un plano: la GPU frente a TS (ver `TestHooks.wallNormals`). */
export interface WallNormalStats {
  points: number;
  /** Puntos por cara (nombre de `Interface`), para ver que la prueba tiene dientes. */
  byFace: Record<string, number>;
  /** Puntos con otra cara en la GPU (el reparto de dueños de la pared es una comparación real). */
  mismatched: number;
  /** |n_GPU·n_TS|: percentil 5 y mínimo, en los puntos con la misma cara. */
  p05: number;
  min: number;
  /** |g_GPU/g_TS − 1| de la norma del gradiente: percentil 95. */
  normErrP95: number;
  worst: string;
}

/** Como mucho, tantos puntos de pared por plano (la GPU los consulta de una vez). */
const WALL_POINTS_MAX = 3000;
/** Banda de distancia a la cara (mm) de los puntos de la e2e de normales. */
const FACE_BAND_MM = [0.02, 0.4] as const;

export function wallNormalStats(sim: Simulator): WallNormalStats {
  const tr = sim.transducer;
  const scene = sim.scene;
  const instant = sim.anatomy.instantFor(sim.sample);
  const toMaterial = (p: Vec3): Vec3 => sim.anatomy.deformation.toMaterial(p, sim.sample.resp);
  const reach = scene.wallThickness() + 12;
  const cand: { p: Vec3; face: Interface; normal: Vec3; norm: number }[] = [];
  for (let u = 0; u < tr.lines; u += 2) {
    const theta = -tr.halfSector + (2 * tr.halfSector * (u + 0.5)) / tr.lines;
    for (let r = 0.025; r < reach; r += 0.05) {
      const p = pointOnLine(sim.frame, tr, theta, r);
      const m = toMaterial(p);
      const c = scene.classify(m, instant);
      if (!isWallLayerInterface(c.interface) && !isRibInterface(c.interface)) continue;
      if (c.interfaceDistance < FACE_BAND_MM[0] || c.interfaceDistance > FACE_BAND_MM[1]) continue;
      const g = scene.faceGradient(m, instant);
      if (g) cand.push({ p, face: c.interface, normal: g.normal, norm: g.norm });
    }
  }
  const step = Math.max(1, cand.length / WALL_POINTS_MAX);
  const chosen = Array.from({ length: Math.min(cand.length, WALL_POINTS_MAX) }, (_, j) => cand[Math.floor(j * step)]);
  const pts = new Float32Array(chosen.length * 3);
  chosen.forEach((c, i) => pts.set(c.p, i * 3));
  const gpu = sim.gpuQuery(pts, sim.frame, false, { normals: true });
  const byFace: Record<string, number> = {};
  const dots: { dot: number; i: number }[] = [];
  const errs: number[] = [];
  let mismatched = 0;
  chosen.forEach((c, i) => {
    byFace[Interface[c.face]] = (byFace[Interface[c.face]] ?? 0) + 1;
    const cpuFace: number = c.face;
    if (gpu.iface[i] !== cpuFace) {
      mismatched++;
      return;
    }
    const n = gpu.normal!;
    dots.push({ dot: Math.abs(n[i * 3] * c.normal[0] + n[i * 3 + 1] * c.normal[1] + n[i * 3 + 2] * c.normal[2]), i });
    if (gpu.gradNorm) errs.push(Math.abs(gpu.gradNorm[i] / c.norm - 1));
  });
  dots.sort((a, b) => a.dot - b.dot);
  errs.sort((a, b) => a - b);
  const w = dots[0];
  return {
    points: dots.length,
    byFace,
    mismatched,
    p05: dots.length ? dots[Math.floor(0.05 * dots.length)].dot : Number.NaN,
    min: w ? w.dot : Number.NaN,
    normErrP95: errs.length ? errs[Math.min(errs.length - 1, Math.floor(0.95 * errs.length))] : Number.NaN,
    worst: w ? `${Interface[chosen[w.i].face]} en (${chosen[w.i].p.map((x) => x.toFixed(2)).join(', ')}): ${w.dot.toFixed(4)}` : '',
  };
}

/** Acoplamiento mínimo de una línea medida (el del banco de VExUS). */
const A_LINE_MIN_COUPLING = 0.95;

/** Mediana de una lista (NaN vacía). */
function median(v: number[]): number {
  if (!v.length) return Number.NaN;
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1];
}

/** Estadística de las líneas A del último cuadro (ver `ALineStats`). */
export function aLineStats(sim: Simulator, source: 'look0' | 'compound' = 'look0'): ALineStats {
  const tr = sim.transducer;
  const depth = sim.bmode.depthMm;
  const env = sim.renderer.readEnvelope({ source });
  const h2 = sim.renderer.readPleuraHits();
  const dz = depth / env.samples;
  const scene = sim.scene;
  const instant = sim.anatomy.instantFor(sim.sample);
  const toMaterial = (p: readonly number[]) => sim.anatomy.deformation.toMaterial([p[0], p[1], p[2]], sim.sample.resp);
  // las líneas medibles, con su pleura (CPU)
  const measured: { l: number; D: number }[] = [];
  for (let l = 0; l < env.lines; l++) {
    if (h2[l * 4] < 0) continue;
    const theta = -tr.halfSector + (2 * tr.halfSector * (l + 0.5)) / env.lines;
    if (contactCoupling(sim.contact, theta) < A_LINE_MIN_COUPLING) continue;
    const origin = pointOnLine(sim.frame, tr, theta, 0);
    const end = pointOnLine(sim.frame, tr, theta, 1);
    const dir: [number, number, number] = [end[0] - origin[0], end[1] - origin[1], end[2] - origin[2]];
    const cpu = pleuraCrossingLine(
      (p) => scene.insideWallMm(toMaterial(p)),
      (p) => scene.lungEdgeMm(toMaterial(p), instant),
      origin,
      dir,
      depth,
      COARSE_DEPTH,
    );
    if (!cpu) continue;
    // sin costilla ni cartílago en el camino hasta la pleura (su sombra no tiene líneas A)
    let rib = false;
    for (let r = 0.25; r < cpu.D && !rib; r += 0.25) {
      const t = sim.anatomy.classifyWorld(pointOnLine(sim.frame, tr, theta, r), sim.sample).tissue;
      if (t === Tissue.Bone || t === Tissue.Cartilage) rib = true;
    }
    if (!rib) measured.push({ l, D: cpu.D });
  }
  // grupos de líneas contiguas (una sombra o una línea sin contacto cortan el grupo)
  const groups: { l: number; D: number }[][] = [];
  let cur: { l: number; D: number }[] = [];
  for (const m of measured) {
    if (cur.length && m.l !== cur[cur.length - 1].l + 1) cur = [];
    if (!cur.length) groups.push(cur);
    cur.push(m);
    if (cur.length === A_LINE_GROUP_LINES) cur = [];
  }
  const full = groups.filter((g) => g.length === A_LINE_GROUP_LINES);
  // la envolvente de la línea l a la profundidad r (mm), interpolada entre muestras (la muestra s está en (s + ½)·dz)
  const at = (l: number, r: number) => {
    const x = Math.min(env.samples - 1, Math.max(0, r / dz - 0.5));
    const s0 = Math.floor(x);
    const s1 = Math.min(env.samples - 1, s0 + 1);
    return env.data[s0 * env.lines + l] + (env.data[s1 * env.lines + l] - env.data[s0 * env.lines + l]) * (x - s0);
  };
  const w = Math.round(A_LINE_WINDOW_MM / dz);
  const half = Math.ceil(A_LINE_BACKGROUND_MM / dz);
  const found = new Map<number, { groups: number; err: number[]; spacing: number[]; shown: number[]; prom: number[] }>();
  for (const g of full) {
    const Dg = g.reduce((s, m) => s + m.D, 0) / g.length;
    const errOf = new Map<number, number>();
    for (let k = 1; k * Dg + A_LINE_BACKGROUND_MM + 1 <= depth; k++) {
      const entry = found.get(k) ?? { groups: 0, err: [], spacing: [], shown: [], prom: [] };
      found.set(k, entry);
      entry.groups++;
      // el promedio de las líneas del grupo, cada una alineada en su k·D: j muestras respecto a k·D
      const avg = (j: number) => g.reduce((s, m) => s + at(m.l, k * m.D + j * dz), 0) / g.length;
      let best = -w;
      for (let j = -w; j <= w; j++) if (avg(j) > avg(best)) best = j;
      if (best === -w || best === w) continue;
      const background: number[] = [];
      for (let j = -half; j <= half; j++) background.push(avg(j));
      const prominence = 20 * Math.log10(avg(best) / Math.max(1e-12, median(background)));
      if (prominence < A_LINE_MIN_PROMINENCE_DB) continue;
      const a = avg(best - 1);
      const b = avg(best);
      const c = avg(best + 1);
      const den = a - 2 * b + c;
      const err = (best + (den < 0 ? (0.5 * (a - c)) / den : 0)) * dz;
      entry.err.push(err);
      entry.prom.push(prominence);
      errOf.set(k, err);
      const prev = errOf.get(k - 1);
      if (prev !== undefined) entry.spacing.push(err - prev);
      // F-T01 frente a la línea pleural mostrada de cada línea (D + e₁): r_k − k·r_1 = e_k − k·e₁
      const e1 = errOf.get(1);
      if (k >= 2 && e1 !== undefined) entry.shown.push(err - k * e1);
    }
  }
  const orders = [...found.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([k, e]) => ({
      k,
      groups: e.groups,
      peaks: e.err.length,
      minErrMm: e.err.length ? Math.min(...e.err) : Number.NaN,
      maxErrMm: e.err.length ? Math.max(...e.err) : Number.NaN,
      maxSpacingErrMm: e.spacing.length ? Math.max(...e.spacing.map(Math.abs)) : Number.NaN,
      minShownErrMm: e.shown.length ? Math.min(...e.shown) : Number.NaN,
      maxShownErrMm: e.shown.length ? Math.max(...e.shown) : Number.NaN,
      medianProminenceDb: median(e.prom),
    }));
  return {
    lines: measured.length,
    groups: full.length,
    pleuraMm: median(measured.map((m) => m.D)),
    orders,
    sampleMm: dz,
    pixelMm: 1 / sim.renderer.display.scale,
    caudalMm: sim.sample.resp.diaphragmCaudalMm,
  };
}

/** Coloca la sonda en un punto de partida (sin animación) y avanza lo justo para que el marco la siga. */
function goTo(sim: Simulator, id: StartPoint['id']): void {
  const sp = START_POINTS.find((p) => p.id === id)!;
  sim.setPose({ phi: sp.phi, z: sp.z, lift: 0, yaw: sp.yaw, rock: sp.rock ?? 0, tilt: sp.tilt ?? 0 });
  sim.advance(0.05);
}
