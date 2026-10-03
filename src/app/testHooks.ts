import type { EquipmentCommand } from './equipment';
import {
  APEX_VOLUME_Z_MM,
  VOLUME_Z_MM,
  coveragePoses,
  equivalenceSweep,
  inspirationSweepPoses,
  interfaceShellEquivalence,
  capsuleEquivalence,
  pleuraEquivalence,
  ribEndsEquivalence,
  volumeEquivalence,
  type EquivalencePoseReport,
  type InterfaceShellReport,
  type CapsuleReport,
  type PleuraEquivalenceReport,
  type RibEndsReport,
  type VolumeEquivalenceReport,
} from './equivalenceSweep';
import { contactCoupling } from '../probe/contact';
import { defaultOperator, type OperatorState } from '../probe/operator';
import { pointOnLine, type ProbePose } from '../probe/probe';
import { Interface, isRibInterface, isWallLayerInterface } from '../anatomy/interfaces';
import { TISSUES, Tissue } from '../anatomy/tissues';
import type { Vec3 } from '../core/vec3';
import { FRAME_PASSES, type PassId } from '../ultrasound/passGraph';
import { MIRROR_BISECTION_STEPS, boneRunAlongLine, lineHits, pleuraCrossingLine, rayAttenuationDb } from '../ultrasound/transmission';
import { pleuraCapMm } from '../ultrasound/pleura';
import { APERTURE_TAPS, boneCoherence, type ApertureGeometry } from '../ultrasound/aperture';
import { lateralSigmaMm } from '../ultrasound/beamModel';
import { levelOfGrey } from '../ultrasound/greyMap';
import { bmodeBeam } from '../ultrasound/transducerProfile';
import { compareLook0Aperture, type Look0ApertureParity } from './apertureParity';
import { compareLateral, type LateralParity } from './lateralParity';
import { compareSteeredTransmission } from './steeredParity';
import { compoundActive } from '../ultrasound/compound';
import { COARSE_DEPTH, displayLevelDb, type CalibrationOverride, type CompoundState } from '../ultrasound/renderer';
import type { RespiratoryPattern } from '../physiology/patientState';
import { speckleStats, type SpeckleOptions, type SpeckleStats } from './speckle';
import { columnLevel, mirrorContrast, mirrorDepths, type ColumnStats, type MirrorStats } from './mirrorBench';
import { fidelityBench, type FidelityBenchOptions, type FidelityBenchReport } from './fidelityBench';
import {
  lungPulseEquivalence,
  lungPulseMMode,
  type LungPulseEquivalence,
  type LungPulseOptions,
  type LungPulseReport,
} from './lungPulseBench';
import type { RenderMeasureOptions, Simulator } from './simulator';
import { START_POINTS, type StartPoint } from './startPoints';

/**
 * Ganchos de prueba estables (e2e). Se cargan con `import()` dinámico solo en desarrollo o
 * con `?e2e`: el barrido de equivalencia no viaja en el bundle que abre el alumno.
 *
 * lus-sim (decisión 12): el subconjunto del tórax — equivalencia (tejido en los planos de partida, volumen,
 * cáscara de las caras y, propia, la pleura parietal de A0), moteado, líneas A (propia: meta F-T01 en la
 * envolvente de la GPU), sombra costal (propia: meta F-T08), banco de fidelidad (propio, decisión 21: la imagen mostrada
 * medida como un clip real), pared (normales de sus caras), coste del cuadro, paridad de la pasada A y poses. Sin los
 * del banco de fidelidad del hígado, el color, el PW, las tríadas portales ni el lazo cerrado de VExUS.
 */
export interface TestHooks {
  /**
   * Equivalencia de tejido en los planos de los puntos de partida; con `inspiration` (lus-sim, decisión 22), también en los
   * de `inspirationSweepPoses` (la ventana cardiaca, el borde de la LAM izquierda y la cortina de la derecha).
   */
  equivalenceSweep: (opts?: { inspiration?: boolean }) => EquivalencePoseReport[];
  /** Equivalencia TS ↔ GLSL en `n` puntos aleatorios de todo el tórax. */
  /** `apex`: el volumen del vértice (`APEX_VOLUME_Z_MM`, cobertura torácica) en lugar del del tórax. */
  volumeEquivalence: (n?: number, apex?: boolean) => VolumeEquivalenceReport;
  /** Equivalencia de la cara de interfaz y su distancia a 0,01–0,6 mm de cada cara, en los planos de partida. */
  interfaceShell: () => InterfaceShellReport;
  /** Las cápsulas del hígado y del bazo, TS ↔ GLSL: cara, distancia y normal en las bases (lus-sim, decisión 37). */
  capsules: () => CapsuleReport;
  /** La pleura parietal de A0 frente a su gemelo de TS, línea a línea, en los puntos de partida. */
  pleuraEquivalence: () => PleuraEquivalenceReport;
  /** Equivalencia TS ↔ GLSL en nubes alrededor de los extremos de las 24 costillas (tejido, cara y su normal). */
  ribEnds: () => RibEndsReport;
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
   * Sombra costal en la envolvente de la GPU (propia de lus-sim: meta F-T08, `docs/knowledge/physics.md` §3.3): en
   * `startPoint` con la respiración `respiration`, una mirada; ver `RibShadowStats`.
   */
  ribShadow: (opts: { startPoint: StartPoint['id']; respiration: RespiratoryPattern }) => RibShadowStats;
  /**
   * Banco de fidelidad (lus-sim, decisión 21): la imagen mostrada en `startPoint` con la respiración `respiration`, una pila
   * de `frames` cuadros cada `frameIntervalS` s, medida con las funciones del banco de referencia
   * (`src/measure/fidelity/`), su coherencia con la verdad del simulador y los niveles en dB. Una mirada. Ver
   * `FidelityBenchReport`.
   */
  fidelity: (opts: FidelityBenchOptions) => FidelityBenchReport;
  /** Barrido de calibración (lus-sim, ciclo 3b-2): K, σz de la pleura y R_t en la pasada B; `null` vuelve al registro. */
  calibrationOverride: (o: CalibrationOverride | null) => void;
  /**
   * La mano del operador (lus-sim, decisión 39): cambia campos de su estado (semilla, si está activa, lo que sigue de la pared,
   * su temblor) para el barrido de la exploración; `null` vuelve al del registro con la semilla del paciente.
   */
  operator: (o: Partial<OperatorState> | null) => OperatorState;
  /**
   * Pulso pulmonar (lus-sim, decisión 32): el modo M de la línea central en `site` con la respiración `respiration`, a
   * intervalos fijos del reloj, medido en la banda bajo la pleura (S3 y F-T11). Ver `LungPulseReport`.
   */
  lungPulse: (opts: LungPulseOptions) => LungPulseReport;
  /** Gemelo TS ↔ GLSL del pulso pulmonar en el pulmón junto al corazón, en la telesístole. */
  lungPulseEquivalence: () => LungPulseEquivalence;
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
   * El espejo del diafragma (lus-sim, decisión 37; meta F-T34): en la pose, en apnea espiratoria y con la profundidad `depthMm`,
   * el contraste entre el tejido real antes del espejo y el virtual detrás, en la envolvente de la mirada 0 (`mirrorBench.ts`).
   */
  mirror: (opts: { pose: ProbePose; depthMm: number }) => MirrorStats & { column: ColumnStats };
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
    /**
     * lus-sim (decisión 20), solo la mirada 0: la transmisión con apertura de A (con la fase del hueso de cada toma) y la
     * dibujada, frente a sus gemelos sobre los segmentos de la GPU (`compareLook0Aperture`), y la costilla de cada línea de
     * A0 (h3: su entrada y su salida exactas) frente a la bisección de TS sobre la clasificación de la CPU.
     */
    look0Aperture?: Look0ApertureParity;
    boneChord?: { lines: number; mismatched: number; maxErrMm: number; quantumMm: number };
  };
  /**
   * Paridad de la pasada D (lus-sim, decisión 20) en `startPoint`, en apnea espiratoria y en la mirada 0: la envolvente de la
   * GPU frente al gemelo (`compareLateral`) sobre el campo que C le dio, cada `every` líneas y `rowEvery` filas.
   */
  lateralParity: (opts: { startPoint: StartPoint['id']; every?: number; rowEvery?: number }) => LateralParity;
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
 * y en la GPU, con contacto, sin costilla ni cartílago en el camino y con pulmón detrás de la pleura (sobre el borde del
 * pulmón, dz > 0: en la banda bajo él, donde la cortina se desvanece, no hay reverberación que medir; decisión 16, con la
 * parrilla nueva el borde caudal del PLAPS cae en ella). Como la métrica A1 del banco de referencia
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
    /**
     * Por grupo donde se detecta: el error frente a k·D y, desde k = 2, el de la separación con el orden anterior y el
     * error frente a k veces la línea pleural mostrada (mm).
     */
    errMm: number[];
    spacingErrMm: number[];
    shownErrMm: number[];
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
    equivalenceSweep: (opts) => {
      const sim = getSim();
      return equivalenceSweep(sim, opts?.inspiration ? inspirationSweepPoses(sim.scene) : coveragePoses(sim.scene));
    },
    volumeEquivalence: (n, apex) => volumeEquivalence(getSim(), n, undefined, apex ? APEX_VOLUME_Z_MM : VOLUME_Z_MM),
    interfaceShell: () => interfaceShellEquivalence(getSim()),
    capsules: () => capsuleEquivalence(getSim()),
    ribEnds: () => ribEndsEquivalence(getSim()),
    pleuraEquivalence: () => withCompound(getSim(), dispatch, false, () => pleuraEquivalence(getSim())),
    mirror: (opts) => {
      const sim = getSim();
      const pattern = sim.patient.respiratoryPattern;
      const depth = sim.bmode.depthMm;
      try {
        sim.patient.respiratoryPattern = 'apnea-expiratory';
        dispatch({ type: 'bmode', patch: { depthMm: opts.depthMm } });
        return withCompound(sim, dispatch, false, () => {
          sim.setPose(opts.pose);
          sim.advance(1);
          sim.render();
          const env = sim.renderer.readEnvelope();
          const tr = sim.renderer.readTransmission();
          const depthMm = sim.bmode.depthMm;
          const fB = sim.profile.bEffectiveMHz;
          const level = (envDb: number, r: number) => displayLevelDb(envDb, r, sim.bmode, fB);
          const mirror = mirrorDepths(tr.lines, tr.samples, tr.mirrorHit);
          // la columna: dónde la encontraría cada línea con espejo si siguiera recta (la anatomía de TS, en el mismo instante)
          const t = sim.transducer;
          const vertebra = mirror.map((m, u) => {
            if (m < 0) return -1;
            const theta = -t.halfSector + (2 * t.halfSector * (u + 0.5)) / env.lines;
            for (let r = m; r < depthMm; r += 0.5)
              if (sim.anatomy.classifyWorld(pointOnLine(sim.frame, t, theta, r), sim.sample).tissue === Tissue.Vertebra) return r;
            return -1;
          });
          return { ...mirrorContrast(env, mirror, depthMm, level), column: columnLevel(env, vertebra, depthMm, level) };
        });
      } finally {
        sim.patient.respiratoryPattern = pattern;
        dispatch({ type: 'bmode', patch: { depthMm: depth } });
      }
    },
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
    ribShadow: (opts) => {
      const sim = getSim();
      const pattern = sim.patient.respiratoryPattern;
      try {
        sim.patient.respiratoryPattern = opts.respiration;
        return withCompound(sim, dispatch, false, () => {
          goTo(sim, opts.startPoint);
          sim.render();
          return ribShadowStats(sim);
        });
      } finally {
        sim.patient.respiratoryPattern = pattern;
      }
    },
    calibrationOverride: (o) => getSim().renderer.calibrationOverride(o),
    operator: (o) => {
      const sim = getSim();
      sim.operator = o ? { ...sim.operator, ...o } : defaultOperator(sim.patient.seed);
      return { ...sim.operator };
    },
    fidelity: (opts) => {
      const sim = getSim();
      const pattern = sim.patient.respiratoryPattern;
      const gain = sim.bmode.gainDb;
      try {
        sim.patient.respiratoryPattern = opts.respiration;
        // la ganancia del barrido (decisión 21), con el comando del equipo; al terminar, la de antes
        if (opts.gainDb !== undefined) dispatch({ type: 'bmode', patch: { gainDb: opts.gainDb } });
        return withCompound(sim, dispatch, false, () =>
          fidelityBench(sim, opts, { goTo: (id) => goTo(sim, id), ribShadow: () => ribShadowStats(sim) }),
        );
      } finally {
        sim.patient.respiratoryPattern = pattern;
        if (opts.gainDb !== undefined) dispatch({ type: 'bmode', patch: { gainDb: gain } });
      }
    },
    lungPulse: (opts) => withCompound(getSim(), dispatch, false, () => lungPulseMMode(getSim(), opts)),
    lungPulseEquivalence: () => lungPulseEquivalence(getSim()),
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
        const look0 = look0ApertureParity(sim, gpu, every);
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
        return { lines, samples, maxDiffDb, truncatedLines, worst, ...look0 };
      }),
    lateralParity: (opts) =>
      withCompound(getSim(), dispatch, false, () => {
        const sim = getSim();
        const patient = sim.patient.respiratoryPattern;
        sim.patient.respiratoryPattern = 'apnea-expiratory';
        try {
          goTo(sim, opts.startPoint);
          sim.advance(1);
          sim.render();
          const inp = sim.renderer.readLateralInputs();
          const tr = sim.transducer;
          return compareLateral(
            {
              lines: inp.lines,
              samples: inp.samples,
              coarseRows: COARSE_DEPTH,
              depthMm: sim.bmode.depthMm,
              focusMm: sim.bmode.focusMm,
              curvatureRadius: tr.curvatureRadius,
              halfSector: tr.halfSector,
              beam: bmodeBeam(sim.profile, sim.bmode),
              clutter: inp.clutter,
              re: inp.re,
              im: inp.im,
              coupling: inp.coupling,
              drawn: sim.renderer.readTransmission().drawn!,
              envelope: sim.renderer.readEnvelope().data,
            },
            Math.max(1, opts.every ?? 3),
            Math.max(1, opts.rowEvery ?? 8),
          );
        } finally {
          sim.patient.respiratoryPattern = patient;
        }
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
    undefined,
    // lus-sim (decisión 20): la fase del hueso de cada toma, con el haz del modo B
    boneCoherence(bmodeBeam(sim.profile, sim.bmode)),
  );
  return { ...parity, truncatedLines: 0 };
}

/**
 * lus-sim (decisión 20): la paridad de A de la mirada 0 con la fase del hueso (`compareLook0Aperture`) sobre los segmentos
 * que la GPU acaba de escribir, y la costilla de cada línea de A0 (h3) frente a `boneRunAlongLine` con la clasificación de
 * la CPU, hasta el espejo de la línea: la bisección del espejo (su paso final, profundidad/(160·2⁶)) en las dos.
 */
function look0ApertureParity(
  sim: Simulator,
  gpu: ReturnType<Simulator['renderer']['readTransmission']>,
  every: number,
): { look0Aperture: Look0ApertureParity; boneChord: { lines: number; mismatched: number; maxErrMm: number; quantumMm: number } } {
  const tr = sim.transducer;
  const depth = sim.bmode.depthMm;
  const grid = sim.renderer.readSegments(depth);
  const beam = sim.profile.beam;
  const ap: ApertureGeometry = {
    lines: gpu.lines,
    halfSector: tr.halfSector,
    curvatureRadius: tr.curvatureRadius,
    apertureTxMm: beam.apertureTxMm,
    apertureRxMaxMm: beam.apertureRxMaxMm,
    fNumberRxMin: beam.fNumberRxMin,
  };
  const look0Aperture = compareLook0Aperture(
    grid,
    ap,
    boneCoherence(bmodeBeam(sim.profile, sim.bmode)),
    {
      lines: gpu.lines,
      samples: gpu.samples,
      aperture: gpu.aperture,
      drawn: gpu.drawn!,
    },
    every,
  );
  const step = depth / COARSE_DEPTH;
  const quantumMm = step / 2 ** MIRROR_BISECTION_STEPS;
  let lines = 0;
  let mismatched = 0;
  let maxErrMm = 0;
  for (let u = 0; u < gpu.lines; u += every) {
    const theta = -tr.halfSector + (2 * tr.halfSector * (u + 0.5)) / gpu.lines;
    const until = grid.mirrorSeg[u] >= 0 ? (grid.mirrorSeg[u] + 0.5) * step - 1e-6 : depth;
    const cpu = boneRunAlongLine(
      (r) => TISSUES[sim.anatomy.classifyWorld(pointOnLine(sim.frame, tr, theta, r), sim.sample).tissue].bone,
      depth,
      COARSE_DEPTH,
      until,
    );
    const g = grid.boneEntryMm![u] >= 0 ? { entry: grid.boneEntryMm![u], exit: grid.boneExitMm![u] } : null;
    if (!cpu && !g) continue;
    lines++;
    if (!cpu || !g) {
      mismatched++;
      continue;
    }
    maxErrMm = Math.max(maxErrMm, Math.abs(cpu.entry - g.entry), Math.abs(cpu.exit - g.exit));
  }
  return { look0Aperture, boneChord: { lines, mismatched, maxErrMm, quantumMm } };
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
  // lus-sim (decisión 17): la pared bajo la sonda y lo que la parrilla asoma por debajo de ella (la pared torácica es más
  // delgada que la del abdomen de VExUS, 28 mm + 12)
  const under = scene.wallAtSkin(sim.pose.phi, sim.pose.z);
  const reach = under.skin + under.fat + under.muscle + 16;
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
    if (!cpu || cpu.dz <= 0) continue;
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
      errMm: e.err,
      spacingErrMm: e.spacing,
      shownErrMm: e.shown,
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

/**
 * Una línea de la imagen para la sombra costal (F-T08). La sombra se clasifica con los datos de la propia pasada A
 * (sus segmentos gruesos y las tomas de sus conos de apertura, `apertureTransmission`), no con la CPU, para que la
 * penumbra sea exactamente la que forma la GPU; la CPU da la geometría (la pleura, `pleuraCrossingLine`, y la primera
 * costilla ósea con su recorrido). En la envolvente de la GPU (dB re 1, antes de la compresión logarítmica) se mide el
 * pico en ±`RIB_SHADOW_PEAK_MM` de la pleura y de 2·D, su fondo y la intensidad media bajo la costilla; y su nivel en
 * la pantalla con el equipo del cuadro (`displayLevelDb`).
 */
export interface RibShadowLine {
  line: number;
  /** Acoplamiento de la línea (0–1). */
  coupling: number;
  /** Cruce de la pleura (mm) según la CPU; NaN si la línea no la registra. */
  pleuraMm: number;
  /** CPU: profundidad del primer hueso cortical antes de la pleura (la línea costal) y recorrido en hueso (mm); NaN sin hueso. */
  ribTopMm: number;
  boneMm: number;
  /** CPU: la primera costilla del camino es cartílago (no hace sombra limpia: F-T09). */
  cartilage: boolean;
  /** Pico de la envolvente en la pleura (±`RIB_SHADOW_PEAK_MM`) y en 2·D, en dB re 1. */
  pleuraDb: number;
  a2Db: number;
  /** Los mismos picos en la pantalla: dB sobre el blanco (≥ 0 satura; ≤ −rango dinámico, negro). */
  pleuraDisplayDb: number;
  a2DisplayDb: number;
  /**
   * Fondo de cada pico: la mediana de la envolvente (dB re 1) en ±`A_LINE_BACKGROUND_MM` de D y de 2·D, como la
   * prominencia de las líneas A (`aLineStats`).
   */
  pleuraBackgroundDb: number;
  a2BackgroundDb: number;
  /**
   * Intensidad media (dB re 1, 10·log10 de la media de la envolvente al cuadrado) de D − `RIB_SHADOW_PEAK_MM` a 2·D +
   * `RIB_SHADOW_PEAK_MM`, la misma ventana en todas las líneas: la línea pleural, la neblina y la primera línea A.
   */
  belowDb: number;
  /** Transmisión de ida y vuelta de la pasada A en la fila de la pleura (`pleuraCapMm`): un rayo y con la apertura (dB). */
  singleDb: number;
  apertureDb: number;
  /** Pasada A: la línea cruza hueso (su primer segmento óseo) antes de la fila de la pleura. */
  bone: boolean;
  /**
   * Líneas hasta la línea sin hueso más cercana o hasta el borde del sector, lo que esté antes (0 en el borde de la sombra; desde
   * la decisión 41, fuera del sector no se supone hueso); −1 sin hueso.
   */
  edgeLines: number;
  /**
   * Semiancho (líneas) del cono de emisión de la pasada A en la fila de la pleura, D_tx·(1 − r₀/r)/2 con r₀ el obstáculo
   * más somero de las líneas que alcanza la apertura; NaN si no hay obstáculo por encima de la pleura.
   */
  coneHalfLines: number;
  /**
   * lus-sim (decisión 20): alcance del lóbulo principal de la PSF lateral de dos vías en la pleura (líneas): 2,5σ, el radio
   * con que la pasada D suma el principal. Con el semiancho del cono (`coneHalfLines`), la penumbra física de la sombra: lo
   * que la apertura y el haz ven de la pleura vecina desde una línea bajo la costilla.
   */
  mainLobeLines: number;
  /** Todas las tomas de los conos de emisión y de recepción de la pasada A cruzan hueso: la sombra completa. */
  fullyShadowed: boolean;
  /** Ninguna toma cruza hueso: una línea intercostal fuera de la penumbra (la referencia). */
  free: boolean;
}

/** Sombra costal medida en la envolvente de la GPU (`ribShadowStats`). */
export interface RibShadowStats {
  lines: RibShadowLine[];
  /** Tamaño de una muestra de la envolvente (mm). */
  sampleMm: number;
  /**
   * Eco pleural intercostal de referencia (dB re 1): la mediana del pico de la pleura en las líneas libres (`free`), con la
   * pleura registrada y el acoplamiento pleno; y la mediana, en ellas, de la intensidad media de la misma ventana que
   * `belowDb` (lo que habría sin la sombra).
   */
  intercostalPleuraDb: number;
  intercostalWindowDb: number;
  /** Rango dinámico de la presentación (dB). */
  dynamicRangeDb: number;
  /**
   * lus-sim (decisión 20): el nivel en la pantalla (dB sobre el blanco) bajo el que el gris de 8 bits es 0 (el negro): el
   * de la curva de grises con la mitad del primer escalón, −RD·(1 − y₀) con y₀ = `levelOfGrey(0,5/255)`.
   */
  blackLevelDb: number;
}

/** Semiventana (mm) del pico de la línea pleural y de la línea A de orden 2, y margen de la ventana de la sombra. */
export const RIB_SHADOW_PEAK_MM = 1;

export function ribShadowStats(sim: Simulator): RibShadowStats {
  const tr = sim.transducer;
  const depth = sim.bmode.depthMm;
  const env = sim.renderer.readEnvelope();
  const trans = sim.renderer.readTransmission();
  const grid = sim.renderer.readSegments(depth);
  const dz = depth / env.samples;
  const step = depth / COARSE_DEPTH;
  // la PSF lateral de la pasada D: el haz del modo B y el paso entre líneas de D, (R + r)·2·semisector/(líneas − 1)
  const psfBeam = bmodeBeam(sim.profile, sim.bmode);
  const lineStep = (2 * tr.halfSector) / (env.lines - 1);
  const scene = sim.scene;
  const instant = sim.anatomy.instantFor(sim.sample);
  const toMaterial = (p: readonly number[]) => sim.anatomy.deformation.toMaterial([p[0], p[1], p[2]], sim.sample.resp);
  const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-12));
  const fB = sim.profile.bEffectiveMHz;
  const peak = (l: number, r: number): number => {
    let m = 0;
    for (
      let s = Math.max(0, Math.floor((r - RIB_SHADOW_PEAK_MM) / dz));
      s <= Math.min(env.samples - 1, Math.ceil((r + RIB_SHADOW_PEAK_MM) / dz));
      s++
    )
      m = Math.max(m, env.data[s * env.lines + l]);
    return m;
  };
  const background = (l: number, r: number): number => {
    const v: number[] = [];
    for (
      let s = Math.max(0, Math.floor((r - A_LINE_BACKGROUND_MM) / dz));
      s <= Math.min(env.samples - 1, Math.ceil((r + A_LINE_BACKGROUND_MM) / dz));
      s++
    )
      v.push(env.data[s * env.lines + l]);
    return median(v);
  };
  // pasada A: el primer obstáculo (gas o hueso, sin el pulmón de la cortina) y el primer hueso de cada línea, en mm
  const hits = Array.from({ length: env.lines }, (_, l) => lineHits(grid, l));
  const obstacleMm = hits.map((h) => {
    const seg = h.gasSeg >= 0 ? (h.boneSeg >= 0 ? Math.min(h.gasSeg, h.boneSeg) : h.gasSeg) : h.boneSeg;
    return seg >= 0 ? (seg + 0.5) * step : Number.POSITIVE_INFINITY;
  });
  const boneMmA = hits.map((h) => (h.boneSeg >= 0 ? (h.boneSeg + 0.5) * step : Number.POSITIVE_INFINITY));
  const out: RibShadowLine[] = [];
  for (let l = 0; l < env.lines; l++) {
    const theta = -tr.halfSector + (2 * tr.halfSector * (l + 0.5)) / env.lines;
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
    const D = cpu ? cpu.D : Number.NaN;
    let ribTop = Number.NaN;
    let bone = 0;
    let cartilage = false;
    const march = 0.05;
    for (let r = march; r < (cpu ? D : 0.5 * depth); r += march) {
      const t = sim.anatomy.classifyWorld(pointOnLine(sim.frame, tr, theta, r), sim.sample).tissue;
      if (t === Tissue.Bone || t === Tissue.Cartilage) {
        if (Number.isNaN(ribTop)) {
          ribTop = r;
          cartilage = t === Tissue.Cartilage;
        }
        if (t === Tissue.Bone) bone += march;
      }
    }
    const from = D - RIB_SHADOW_PEAK_MM;
    const to = 2 * D + RIB_SHADOW_PEAK_MM;
    let sum = 0;
    let n = 0;
    for (let s = Math.ceil(from / dz - 0.5); (s + 0.5) * dz <= to && s < env.samples; s++) {
      const e = env.data[s * env.lines + l];
      sum += e * e;
      n++;
    }
    // la fila de la pasada A que usa la rama del pulmón para la pleura (`pleuraCapMm`: la más honda sin el pulmón)
    const row = cpu ? Math.min(COARSE_DEPTH - 1, Math.floor(pleuraCapMm(D, step) / step)) : 0;
    const pleuraDb = cpu ? db(peak(l, D)) : Number.NaN;
    const a2Db = cpu ? db(peak(l, 2 * D)) : Number.NaN;
    out.push({
      line: l,
      coupling: contactCoupling(sim.contact, theta),
      pleuraMm: D,
      ribTopMm: ribTop,
      boneMm: bone,
      cartilage,
      pleuraDb,
      a2Db,
      pleuraDisplayDb: cpu ? displayLevelDb(pleuraDb, D, sim.bmode, fB) : Number.NaN,
      a2DisplayDb: cpu ? displayLevelDb(a2Db, 2 * D, sim.bmode, fB) : Number.NaN,
      pleuraBackgroundDb: cpu ? db(background(l, D)) : Number.NaN,
      a2BackgroundDb: cpu ? db(background(l, 2 * D)) : Number.NaN,
      belowDb: n ? 10 * Math.log10(Math.max(sum / n, 1e-24)) : Number.NaN,
      singleDb: cpu ? db(trans.single[row * trans.lines + l]) : Number.NaN,
      apertureDb: cpu ? db(trans.aperture[row * trans.lines + l]) : Number.NaN,
      bone: cpu ? boneMmA[l] < (row + 0.5) * step : false,
      edgeLines: -1,
      coneHalfLines: Number.NaN,
      mainLobeLines: cpu ? (2.5 * lateralSigmaMm(D, sim.bmode.focusMm, psfBeam)) / ((tr.curvatureRadius + D) * lineStep) : Number.NaN,
      fullyShadowed: false,
      free: false,
    });
  }
  // los conos de la pasada A en la fila de la pleura de cada línea (`apertureTransmission`: sus tomas y su redondeo)
  const dTheta = (2 * tr.halfSector) / env.lines;
  const beam = sim.profile.beam;
  const W = Math.ceil((0.5 * beam.apertureTxMm) / (tr.curvatureRadius * dTheta));
  // fuera del sector no se sabe si sigue la costilla (decisión 41: con el BLUE inferior de la regla de las manos, una costilla
  // acaba justo fuera del borde y la línea 0, que se suponía a 25 líneas del borde de su sombra, ve la pleura de más allá por
  // su cono de apertura, a −59,8 dB): el borde del sector cuenta como un borde de la sombra
  const isBone = (i: number): boolean => i >= 0 && i < env.lines && out[i].bone;
  const taps = (line: number, half: number): number[] =>
    Array.from({ length: APERTURE_TAPS }, (_, j) =>
      Math.min(env.lines - 1, Math.max(0, line + Math.floor(half * ((2 * j) / (APERTURE_TAPS - 1) - 1) + 0.5))),
    );
  for (const x of out) {
    if (Number.isNaN(x.pleuraMm)) continue;
    if (x.bone) {
      let d = 0;
      while (d < env.lines && isBone(x.line - d - 1) && isBone(x.line + d + 1)) d++;
      x.edgeLines = d;
    }
    const r = (Math.floor(pleuraCapMm(x.pleuraMm, step) / step) + 0.5) * step;
    let ro = Number.POSITIVE_INFINITY;
    for (let k = -W; k <= W; k++) {
      const o = obstacleMm[x.line + k];
      if (o !== undefined && o < r) ro = Math.min(ro, o);
    }
    if (!Number.isFinite(ro)) {
      x.free = !x.bone;
      continue;
    }
    const spacing = (tr.curvatureRadius + ro) * dTheta;
    const shrink = 1 - ro / r;
    x.coneHalfLines = (0.5 * beam.apertureTxMm * shrink) / spacing;
    const halfRx = (0.5 * Math.min(beam.apertureRxMaxMm, r / beam.fNumberRxMin) * shrink) / spacing;
    const all = [...taps(x.line, x.coneHalfLines), ...taps(x.line, halfRx)];
    x.fullyShadowed = x.bone && all.every((i) => out[i].bone);
    x.free = !x.bone && all.every((i) => !out[i].bone);
  }
  const ic = out.filter((x) => x.free && !Number.isNaN(x.pleuraMm) && x.coupling >= A_LINE_MIN_COUPLING);
  return {
    lines: out,
    sampleMm: dz,
    intercostalPleuraDb: median(ic.map((x) => x.pleuraDb)),
    intercostalWindowDb: median(ic.map((x) => x.belowDb)),
    dynamicRangeDb: sim.bmode.dynamicRangeDb,
    blackLevelDb: -sim.bmode.dynamicRangeDb * (1 - levelOfGrey(0.5 / 255)),
  };
}

/** Coloca la sonda en un punto de partida (sin animación) y avanza lo justo para que el marco la siga. */
function goTo(sim: Simulator, id: StartPoint['id']): void {
  const sp = START_POINTS.find((p) => p.id === id)!;
  // lus-sim (decisión 33): cada punto con su posición (los de la espalda, sentado; los demás, supino), para que el resultado de
  // un gancho no dependa del punto del gancho anterior
  sim.patient.position = sp.position ?? 'supine';
  sim.setPose({ phi: sp.phi, z: sp.z, lift: 0, yaw: sp.yaw, rock: sp.rock ?? 0, tilt: sp.tilt ?? 0 });
  sim.advance(0.05);
}
