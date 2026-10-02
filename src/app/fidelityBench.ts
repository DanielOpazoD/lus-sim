import {
  beamSampler,
  detectSector,
  GREY_8BIT,
  type GreyFrame,
  type SectorDetection,
  type SectorGeometry,
} from '../measure/fidelity/sector';
import { analyzeClip, levelBands, type ClipAnalysis } from '../measure/fidelity/metrics';
import { speckleTiles, type SpeckleTile } from '../measure/fidelity/speckleMap';
import { detectStructures, type BeamImage } from '../measure/fidelity/structures';
import { median, medianIqr, quantile } from '../measure/fidelity/stats';
import { pointOnLine } from '../probe/probe';
import type { RespiratoryPattern } from '../physiology/patientState';
import { GREY_CURVE, levelOfGrey } from '../ultrasound/greyMap';
import { IFACE_K_DB } from '../ultrasound/interfaceEcho';
import { PLEURA_RP, PLEURA_RT, pleuraCapMm, pleuraCoherence } from '../ultrasound/pleura';
import { COARSE_DEPTH, displayLevelDb, nominalTgcDbPerCm } from '../ultrasound/renderer';
import type { Simulator } from './simulator';
import { SPECKLE_PATCH, speckleMask, type EnvelopeFrame } from './speckle';
import type { StartPoint } from './startPoints';
import type { RibShadowStats } from './testHooks';
import { EQUIPMENT_LIMITS } from './equipment';

/**
 * Banco de fidelidad, lado del simulador (decisión 21): captura la imagen MOSTRADA (el gris de 8 bits del lienzo, tras la
 * curva de grises: `readDisplay`) en un punto de partida con una respiración, la mide con las mismas funciones que los
 * clips reales (`src/measure/fidelity/`) y comprueba que el detector automático ve lo que el simulador sabe (la pleura del
 * gemelo de A0, las líneas A a k veces la línea pleural mostrada, las sombras donde las líneas cruzan hueso). Como solo el
 * simulador conoce su curva de grises y su envolvente, añade los niveles en dB: invirtiendo la curva sobre el gris (lo que
 * se ve; recortado en el negro de 8 bits) y leyendo la envolvente de la GPU en las mismas bandas (sin recortar), y la caída
 * por orden de las líneas A frente a la fórmula de F-T02. No retoca nada: mide (guía §20).
 */
export interface FidelityBenchOptions {
  startPoint: StartPoint['id'];
  respiration: RespiratoryPattern;
  /** Cuadros de la pila (≥ 1; 1 por omisión) y su intervalo (s; 1/30 por omisión, un vídeo a 30 cps). */
  frames?: number;
  frameIntervalS?: number;
  /** Segundos de simulación tras colocar la sonda antes del primer cuadro (1 por omisión). */
  settleS?: number;
  /** Ganancia del equipo durante la medida (dB; la del preajuste por omisión): el barrido de ganancia. */
  gainDb?: number;
  /** Rango dinámico experimental: copia temporal del equipo, restaurada incluso si la medida falla. */
  dynamicRangeDb?: number;
  /**
   * Lado (px) de las teselas de moteado que el informe devuelve para estimar el mapa de grises desde la imagen
   * (`speckleMap.ts`, decisión 31): la autoprueba del estimador sobre un mapa conocido. Sin él, no se devuelven.
   */
  speckleTile?: number;
}

/** Un nivel en la pantalla: gris (mediana o pico), dB sobre el blanco desde el gris y desde la envolvente sin recortar. */
export interface DbLevel {
  grey: number;
  /** dB sobre el blanco invirtiendo la curva de grises; null si el gris está en el negro (el nivel real es ≤ `blackLevelDb`). */
  displayDb: number | null;
  /** dB sobre el blanco de la envolvente en las mismas muestras (`displayLevelDb`): no se recorta en el negro. */
  envelopeDb: number;
}

export interface FidelityBenchReport {
  startPoint: StartPoint['id'];
  respiration: RespiratoryPattern;
  frames: number;
  frameIntervalS: number;
  /** Procedencia de la adquisición; los tiempos distinguen réplicas de un instante de una pila temporal. */
  acquisition: { seed: number; timesS: number[]; interfaceKDb: number; pleuraRt: number };
  display: {
    width: number;
    height: number;
    mmPerPx: number;
    gainDb: number;
    dynamicRangeDb: number;
    greyCurve: number;
    blackLevelDb: number;
  };
  geometry: {
    true: SectorGeometry;
    detected: SectorDetection;
    apexErrPx: number;
    thetaErrDeg: { left: number; right: number };
    rhoMinErrPx: number;
    /** Profundidad que alcanza el soporte detectado frente a la del sector (mm): lo negro no se ve. */
    detectedDepthMm: number;
    trueDepthMm: number;
  };
  /** Mediana e IQR de cada métrica sobre los cuadros, con la geometría verdadera (la línea base). */
  metrics: ClipAnalysis['summary'];
  stack: ClipAnalysis['stack'];
  /** Estructuras del cuadro medio (geometría verdadera). */
  structures: ClipAnalysis['meanStructures'];
  /** Lo mismo con la geometría detectada (lo que vería el banco en un clip): resumen. */
  detectedMetrics: ClipAnalysis['summary'];
  coherence: {
    pleura: { columns: number; medianErrMm: number; p95AbsErrMm: number; maxAbsErrMm: number; within1mm: number };
    /** Por orden: posición detectada frente a k veces la línea pleural mostrada (mm) y frente a k·D del gemelo (mm). */
    aLines: { k: number; visible: boolean; ratio: number; shownErrMm: number; cpuErrMm: number }[];
    shadows: {
      detected: { fromDeg: number; toDeg: number; coreColumns: number; coreOnBone: number }[];
      /** Tramos de líneas en sombra completa del simulador (con su núcleo, fuera de la penumbra) y la fracción que cubre el detector. */
      simulated: { fromLine: number; toLine: number; coreLines: number; covered: number }[];
      coreOnBone: number;
    };
  };
  /** Niveles en dB (solo el simulador sabe su curva y su envelope). */
  levelsDb: Record<'wall' | 'haze' | 'deep' | 'floor' | 'pleura' | 'aLine2' | 'aLine3', DbLevel>;
  /** Caída por orden de las líneas A (dB) medida en la pantalla y en la envolvente, frente a F-T02. */
  aLineDrop: {
    orders: { k: number; displayDb: number | null; envelopeDb: number; dropDisplayDb: number | null; dropEnvelopeDb: number }[];
    ft02: { predictedDb: ReturnType<typeof medianIqr>; chi: number; transmissionDb: number; tgcDb: number; lines: number };
  };
  /** Teselas de moteado de la imagen mostrada (con `speckleTile`), con la geometría verdadera. */
  speckleTiles?: SpeckleTile[];
  /**
   * La forma del moteado en la envolvente sin recortar (la verdad de la autoprueba del mapa, decisión 31), en parches de 16
   * muestras × 8 líneas (los de `speckle.ts`): `region`, toda la pared entre 0,2 y 0,85 de la pleura de las líneas libres
   * (con su grasa, sus caras, sus planos y sus estrías); `muscle` (solo con `speckleTile`: la máscara es cara), los parches
   * de músculo sin estructura (`speckleMask`). De cada parche, la DE, p90 − p50 y p50 − p10 de 20·log₁₀ de la envolvente
   * (dB; Rayleigh: 5,57, 5,21 y 8,18, algo menos en parches finitos con grano) y la asimetría (p50 − p10)/(p90 − p50)
   * (Rayleigh: 1,57, poco sensible al grano y al tamaño del parche); medianas sobre los parches.
   */
  wallSpeckle: { region: EnvelopeSpread; muscle?: EnvelopeSpread };
}

/** La forma del moteado de la envolvente en parches (ver `wallSpeckle`). */
export interface EnvelopeSpread {
  patches: number;
  sdDb: number;
  p90p50Db: number;
  p50p10Db: number;
  asymmetry: number;
}

function envelopeSpread(env: EnvelopeFrame, inside: (line: number, sample: number) => boolean): EnvelopeSpread {
  const { axial: AX, lateral: LAT } = SPECKLE_PATCH;
  const hi: number[] = [];
  const lo: number[] = [];
  const asym: number[] = [];
  const sds: number[] = [];
  for (let u0 = 0; u0 + LAT <= env.lines; u0 += LAT)
    for (let v0 = 0; v0 + AX <= env.samples; v0 += AX) {
      const v: number[] = [];
      for (let u = u0; u < u0 + LAT && v.length >= (u - u0) * AX; u++)
        for (let k = v0; k < v0 + AX; k++) if (inside(u, k)) v.push(20 * Math.log10(Math.max(env.data[k * env.lines + u], 1e-12)));
      if (v.length < AX * LAT) continue;
      const h = quantile(v, 0.9) - quantile(v, 0.5);
      const l = quantile(v, 0.5) - quantile(v, 0.1);
      const m = v.reduce((x, y) => x + y, 0) / v.length;
      sds.push(Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / (v.length - 1)));
      hi.push(h);
      lo.push(l);
      asym.push(l / h);
    }
  return { patches: hi.length, sdDb: median(sds), p90p50Db: median(hi), p50p10Db: median(lo), asymmetry: median(asym) };
}

/** dB sobre el blanco de un gris de 8 bits (inversa de la curva de grises); null en el negro. */
function greyToDisplayDb(grey: number, dynamicRangeDb: number): number | null {
  if (!Number.isFinite(grey)) return Number.NaN;
  if (grey < 0.5) return null;
  return dynamicRangeDb * (levelOfGrey(Math.min(grey, 255) / 255, GREY_CURVE) - 1);
}

export function fidelityBench(
  sim: Simulator,
  opts: FidelityBenchOptions,
  deps: { goTo: (id: StartPoint['id']) => void; ribShadow: () => RibShadowStats },
): FidelityBenchReport {
  if (sim.frozen) throw new Error('fidelityBench: la imagen está congelada; no se adquieren cuadros');
  const range = opts.dynamicRangeDb;
  const limits = EQUIPMENT_LIMITS.dynamicRangeDb;
  if (range !== undefined && (!Number.isFinite(range) || range < limits.min || range > limits.max))
    throw new RangeError(`fidelityBench: rango dinámico ${range} fuera de ${limits.min}–${limits.max} dB`);
  const equipment = sim.equipment;
  try {
    // Instrumentación del banco, sin notificar ni modificar controles. La instantánea original nunca se muta.
    if (range !== undefined) sim.equipment = { ...equipment, bmode: { ...equipment.bmode, dynamicRangeDb: range } };
    return measureFidelity(sim, opts, deps);
  } finally {
    sim.equipment = equipment;
  }
}

function measureFidelity(
  sim: Simulator,
  opts: FidelityBenchOptions,
  deps: { goTo: (id: StartPoint['id']) => void; ribShadow: () => RibShadowStats },
): FidelityBenchReport {
  const n = Math.max(1, Math.round(opts.frames ?? 1));
  const dt = opts.frameIntervalS ?? 1 / 30;
  deps.goTo(opts.startPoint);
  sim.advance(opts.settleS ?? 1);
  // cuadro 0 con su verdad: la sombra (pleura del gemelo, hueso por línea), la envolvente y la transmisión
  sim.render();
  const frames: GreyFrame[] = [];
  const timesS: number[] = [];
  const grab = (): void => {
    const d = sim.renderer.readDisplay();
    frames.push({ width: d.width, height: d.height, data: d.gray.slice() });
    timesS.push(sim.sample.t);
  };
  grab();
  const rib = deps.ribShadow();
  const env = sim.renderer.readEnvelope();
  const trans = sim.renderer.readTransmission();
  for (let i = 1; i < n; i++) {
    sim.advance(dt);
    sim.render();
    grab();
  }
  const tr = sim.transducer;
  const b = sim.bmode;
  const lay = sim.renderer.display;
  const mmPerPx = 1 / lay.scale;
  const fB = sim.profile.bEffectiveMHz;
  const blackLevelDb = -b.dynamicRangeDb * (1 - levelOfGrey(0.5 / 255, GREY_CURVE));
  // geometría verdadera (la del lienzo: `sectorLayout`) y detectada
  const truth: SectorGeometry = {
    kind: 'convex',
    apexX: lay.apexX,
    apexY: lay.apexY,
    thetaLeft: -tr.halfSector,
    thetaRight: tr.halfSector,
    rhoMin: tr.curvatureRadius * lay.scale,
    rhoMax: (tr.curvatureRadius + b.depthMm) * lay.scale,
  };
  const detected = detectSector(frames, GREY_8BIT);
  const dg = detected.geometry;
  const deg = (x: number): number => (x * 180) / Math.PI;
  const analysis = analyzeClip(frames, { geometry: truth, mmPerPx, frameIntervalS: dt });
  const analysisDetected = analyzeClip(frames, { mmPerPx, frameIntervalS: dt, maxFrames: 8 });
  // el cuadro 0 en el espacio del haz con la geometría verdadera: sus estructuras, contra la verdad del cuadro 0
  const sampler = beamSampler(truth, frames[0].width, frames[0].height);
  const beam: BeamImage = { rows: sampler.rows, cols: sampler.cols, data: sampler.sample(frames[0]) };
  const st = detectStructures(beam);
  const lineOf = (j: number): number => {
    const thetaSim = -sampler.lateral[j]; // el simulador cuenta θ positivo hacia la izquierda de la pantalla
    return Math.min(env.lines - 1, Math.max(0, Math.round(((thetaSim + tr.halfSector) / (2 * tr.halfSector)) * env.lines - 0.5)));
  };
  const rowMm = (row: number): number => row * mmPerPx;
  // pleura: la del detector frente al cruce del gemelo de A0 de su línea
  const perr: number[] = [];
  for (const j of st.intercostal) {
    const D = rib.lines[lineOf(j)].pleuraMm;
    if (Number.isFinite(D)) perr.push(rowMm(st.pleuraPx[j]) - D);
  }
  const absErr = perr.map(Math.abs);
  const pleuraCoherenceStats = {
    columns: perr.length,
    medianErrMm: median(perr),
    p95AbsErrMm: quantile(absErr, 0.95),
    maxAbsErrMm: absErr.length ? Math.max(...absErr) : Number.NaN,
    within1mm: absErr.length ? absErr.filter((e) => e <= 1).length / absErr.length : Number.NaN,
  };
  // líneas A: frente a k veces la línea pleural mostrada (u = k: la detectada) y frente a k·D del gemelo
  const dPlMm = rowMm(st.dPlPx);
  const dCpu = median(st.intercostal.map((j) => rib.lines[lineOf(j)].pleuraMm));
  const aLines = st.aLines.map((p) => ({
    k: p.k,
    visible: p.k === 1 || p.visible,
    ratio: p.ratio,
    shownErrMm: (p.u - p.k) * dPlMm,
    cpuErrMm: p.u * dPlMm - p.k * dCpu,
  }));
  // sombras: el núcleo de cada sombra detectada sobre líneas que cruzan hueso; los tramos de sombra completa del simulador
  const onBone = (j: number): boolean => rib.lines[lineOf(j)].bone;
  const detectedShadows = st.shadows.map((r) => {
    const core = st.shadowCore.filter((j) => j >= r.from && j <= r.to);
    return {
      fromDeg: deg(-sampler.lateral[r.from]),
      toDeg: deg(-sampler.lateral[r.to]),
      coreColumns: core.length,
      coreOnBone: core.length ? core.filter(onBone).length / core.length : Number.NaN,
    };
  });
  const shadowLines = new Set<number>();
  for (const r of st.shadows) for (let j = r.from; j <= r.to; j++) shadowLines.add(lineOf(j));
  const simRuns: { fromLine: number; toLine: number; coreLines: number; covered: number }[] = [];
  let cur: number[] = [];
  const flush = (): void => {
    if (!cur.length) return;
    const core = cur.filter((l) => {
      const x = rib.lines[l];
      return x.edgeLines > x.coneHalfLines + x.mainLobeLines;
    });
    simRuns.push({
      fromLine: cur[0],
      toLine: cur[cur.length - 1],
      coreLines: core.length,
      covered: core.length ? core.filter((l) => shadowLines.has(l)).length / core.length : Number.NaN,
    });
    cur = [];
  };
  for (const x of rib.lines) {
    if (x.fullyShadowed) cur.push(x.line);
    else flush();
  }
  flush();
  // niveles en dB: el gris invertido y la envolvente sin recortar en las mismas muestras
  const envDbAt = (j: number, row: number): number => {
    const l = lineOf(j);
    const r = rowMm(row);
    const dz = b.depthMm / env.samples;
    const x = Math.min(env.samples - 1, Math.max(0, r / dz - 0.5));
    const s0 = Math.floor(x);
    const s1 = Math.min(env.samples - 1, s0 + 1);
    const e = env.data[s0 * env.lines + l] + (env.data[s1 * env.lines + l] - env.data[s0 * env.lines + l]) * (x - s0);
    return displayLevelDb(20 * Math.log10(Math.max(e, 1e-12)), r, b, fB);
  };
  const m0 = analysis.perFrame[0];
  // la forma del moteado de la pared en la envolvente sin recortar (la verdad de la autoprueba del mapa, decisión 31)
  const wallSpeckle = ((): FidelityBenchReport['wallSpeckle'] => {
    const dz = b.depthMm / env.samples;
    const inWall = (u: number, v: number): boolean => {
      const D = rib.lines[u]?.pleuraMm;
      if (!rib.lines[u]?.free || !Number.isFinite(D)) return false;
      const r = (v + 0.5) * dz;
      return r >= 0.2 * D && r <= 0.85 * D;
    };
    const region = envelopeSpread(env, inWall);
    return opts.speckleTile ? { region, muscle: envelopeSpread(env, speckleMask(sim, env)) } : { region };
  })();
  const bands = levelBands(st, beam.rows);
  const bandEnvelope = (segs: { col: number; from: number; to: number }[]): number => {
    const v: number[] = [];
    for (const s of segs)
      for (let i = Math.max(0, Math.ceil(s.from)); i <= Math.min(beam.rows - 1, Math.floor(s.to)); i++) v.push(envDbAt(s.col, i));
    return median(v);
  };
  /** Pico de la envolvente (dB en la pantalla) en ±1 mm de u·p_j de cada columna intercostal: la mediana. */
  const peakEnvelope = (u: number): number => {
    const reach = Math.max(1, Math.round(1 / mmPerPx));
    const v: number[] = [];
    for (const j of st.intercostal) {
      const c = Math.round(u * st.pleuraPx[j]);
      let m = Number.NEGATIVE_INFINITY;
      for (let i = c - reach; i <= c + reach; i++) if (i >= 0 && i < beam.rows) m = Math.max(m, envDbAt(j, i));
      if (Number.isFinite(m)) v.push(m);
    }
    return median(v);
  };
  const lv = (grey: number, envelopeDb: number): DbLevel => ({ grey, displayDb: greyToDisplayDb(grey, b.dynamicRangeDb), envelopeDb });
  const peakU = (k: number): number => (Number.isFinite(st.aLines[k - 1]?.u) ? st.aLines[k - 1].u : k);
  const levelsDb = {
    wall: lv(m0.levels.wall.grey, bandEnvelope(bands.wall)),
    haze: lv(m0.levels.haze.grey, bandEnvelope(bands.haze)),
    deep: lv(m0.levels.deep.grey, bandEnvelope(bands.deep)),
    floor: lv(m0.levels.floor.grey, bandEnvelope(bands.floor)),
    pleura: lv(m0.levels.pleuraPeak, peakEnvelope(peakU(1))),
    aLine2: lv(m0.levels.a1Peak, peakEnvelope(peakU(2))),
    aLine3: lv(m0.levels.a2Peak, peakEnvelope(peakU(3))),
  };
  // caída por orden: pantalla (gris invertido de los picos del perfil) y envolvente (picos por columna)
  const orders = st.aLines
    .slice(0, 5)
    .map((p) => ({ k: p.k, displayDb: greyToDisplayDb(p.grey, b.dynamicRangeDb), envelopeDb: peakEnvelope(peakU(p.k)) }));
  const withDrop = orders.map((o, i) => {
    const next = orders[i + 1];
    return {
      ...o,
      dropDisplayDb: next && o.displayDb !== null && next.displayDb !== null ? o.displayDb - next.displayDb : null,
      dropEnvelopeDb: next ? o.envelopeDb - next.envelopeDb : Number.NaN,
    };
  });
  // F-T02: −20·log10|R_p·χ·R_t| − 20·log10 T(D) − compensación nominal en D, por línea intercostal del gemelo
  const k0 = (2 * Math.PI) / sim.profile.beam.lambdaMm;
  const step = b.depthMm / COARSE_DEPTH;
  const scene = sim.scene;
  const toMaterial = (p: readonly number[]) => sim.anatomy.deformation.toMaterial([p[0], p[1], p[2]], sim.sample.resp);
  const inside = (p: readonly number[]): number => scene.insideWallMm(toMaterial(p));
  const pred: number[] = [];
  const chis: number[] = [];
  const tDs: number[] = [];
  const lines = [...new Set(st.intercostal.map(lineOf))].filter((l) => rib.lines[l].free && Number.isFinite(rib.lines[l].pleuraMm));
  for (const l of lines) {
    const D = rib.lines[l].pleuraMm;
    const theta = -tr.halfSector + (2 * tr.halfSector * (l + 0.5)) / env.lines;
    const p = pointOnLine(sim.frame, tr, theta, D);
    const q = pointOnLine(sim.frame, tr, theta, D + 1);
    const dir = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const h = 0.05;
    const g = [0, 1, 2].map((a) => {
      const pp = [...p];
      const pm = [...p];
      pp[a] += h;
      pm[a] -= h;
      return (inside(pp) - inside(pm)) / (2 * h);
    });
    const norm = Math.hypot(g[0], g[1], g[2]);
    const cosI = norm > 0 ? Math.abs((g[0] * dir[0] + g[1] * dir[1] + g[2] * dir[2]) / norm) : 1;
    const chi = pleuraCoherence(cosI, k0);
    const row = Math.min(COARSE_DEPTH - 1, Math.floor(pleuraCapMm(D, step) / step));
    const tD = trans.aperture[row * trans.lines + l];
    chis.push(chi);
    tDs.push(tD);
    pred.push(-20 * Math.log10(PLEURA_RP * chi * PLEURA_RT * tD) - nominalTgcDbPerCm(fB) * (D / 10));
  }
  const dTrue = b.depthMm * lay.scale;
  const dDet = dg.kind === 'linear' ? dg.yBottom - dg.yTop : dg.rhoMax - dg.rhoMin;
  return {
    startPoint: opts.startPoint,
    respiration: opts.respiration,
    frames: n,
    frameIntervalS: dt,
    acquisition: { seed: sim.patient.seed, timesS, interfaceKDb: IFACE_K_DB, pleuraRt: PLEURA_RT },
    display: {
      width: frames[0].width,
      height: frames[0].height,
      mmPerPx,
      gainDb: b.gainDb,
      dynamicRangeDb: b.dynamicRangeDb,
      greyCurve: GREY_CURVE,
      blackLevelDb,
    },
    geometry: {
      true: truth,
      detected,
      apexErrPx: dg.kind === 'linear' ? Number.NaN : Math.hypot(dg.apexX - lay.apexX, dg.apexY - lay.apexY),
      thetaErrDeg:
        dg.kind === 'linear'
          ? { left: Number.NaN, right: Number.NaN }
          : { left: deg(dg.thetaLeft + tr.halfSector), right: deg(dg.thetaRight - tr.halfSector) },
      rhoMinErrPx: dg.kind === 'linear' ? Number.NaN : dg.rhoMin - tr.curvatureRadius * lay.scale,
      detectedDepthMm: dDet * mmPerPx,
      trueDepthMm: dTrue * mmPerPx,
    },
    metrics: analysis.summary,
    stack: analysis.stack,
    structures: analysis.meanStructures,
    detectedMetrics: analysisDetected.summary,
    coherence: {
      pleura: pleuraCoherenceStats,
      aLines,
      shadows: {
        detected: detectedShadows,
        simulated: simRuns,
        coreOnBone: st.shadowCore.length ? st.shadowCore.filter(onBone).length / st.shadowCore.length : Number.NaN,
      },
    },
    levelsDb,
    wallSpeckle,
    ...(opts.speckleTile ? { speckleTiles: speckleTiles(frames, truth, { tile: opts.speckleTile, maxFrames: 8 }) } : {}),
    aLineDrop: {
      orders: withDrop,
      ft02: {
        predictedDb: medianIqr(pred),
        chi: median(chis),
        transmissionDb: 20 * Math.log10(median(tDs)),
        tgcDb: nominalTgcDbPerCm(fB) * (dCpu / 10),
        lines: lines.length,
      },
    },
  };
}
