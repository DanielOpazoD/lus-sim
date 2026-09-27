import { median, quantile, robustLine } from './stats';

/**
 * Cuadros de gris y geometría del sector (decisión 21; `docs/knowledge/reference-images.md` §3.1, pasos 2–4). Un cuadro
 * es una matriz de gris por filas (fila 0 arriba) en la escala que diga `GreyScale` (0–255 de un vídeo o de la pantalla
 * del simulador, o 0–1). La geometría se detecta del propio clip: en los clips reales no hay verdad de terreno.
 */
export interface GreyFrame {
  width: number;
  height: number;
  /** Gris por píxel, fila a fila (índice y·width + x). */
  data: ArrayLike<number>;
}

/**
 * Escala del gris: `lo` y `hi` son el negro y el blanco del formato (0 y 255 en 8 bits), donde el dato puede estar
 * recortado (saturado); `quantum`, el escalón del formato (1 en 8 bits; 0 si es continuo).
 */
export interface GreyScale {
  lo: number;
  hi: number;
  quantum: number;
}

export const GREY_8BIT: GreyScale = { lo: 0, hi: 255, quantum: 1 };

/**
 * Geometría del sector en píxeles del cuadro. Convexo o sectorial: el ápice (centro de curvatura, puede quedar fuera
 * del cuadro), los ángulos de sus bordes (θ = atan2(x − ápice_x, y − ápice_y): 0 hacia abajo, negativo a la izquierda)
 * y los radios de la piel (`rhoMin`, el arco superior) y del fondo (`rhoMax`). Lineal: el rectángulo.
 */
export type SectorGeometry =
  | { kind: 'convex' | 'sector'; apexX: number; apexY: number; thetaLeft: number; thetaRight: number; rhoMin: number; rhoMax: number }
  | { kind: 'linear'; xLeft: number; xRight: number; yTop: number; yBottom: number };

/** Detección automática del sector (`detectSector`). */
export interface SectorDetection {
  geometry: SectorGeometry;
  /**
   * De dónde sale el soporte: `temporal`, los píxeles que varían en el tiempo (el paso 2 del §3.1: quita texto, reglas y
   * marcas fijas); `intensity`, los píxeles encendidos (un solo cuadro o un clip quieto, como el simulador en apnea).
   */
  maskSource: 'temporal' | 'intensity' | 'full-frame';
  /** Fracción del cuadro en el soporte. */
  supportFraction: number;
  /** Filas que ajustan cada borde lateral (a ≤ 1,5 px de su recta) sobre las filas con soporte. */
  edgeInliers: { left: number; right: number; rows: number };
}

/** Umbral de intensidad del soporte sobre el fondo, en fracción de la escala (≈ 5 grises en 8 bits). */
const SUPPORT_INTENSITY = 0.02;
/** Un píxel «varía» si su desviación típica temporal pasa de esto en escalones del formato. */
const SUPPORT_TEMPORAL_QUANTA = 0.75;
/** Tolerancia de la recta de cada borde (px) y huecos que se saltan dentro de una fila del soporte (px). */
const EDGE_TOL_PX = 1.5;
const ROW_GAP_PX = 3;
/** Una componente del soporte cuenta si tiene al menos esta fracción del tamaño de la mayor. */
const MAIN_COMPONENT_FRACTION = 0.05;
/** Un píxel «varía» si su σ temporal pasa de esta fracción de su brillo sobre el fondo (el texto quemado: ≤ 0,01; el campo cercano quieto de una sonda de fase, 0,03). */
const SUPPORT_TEMPORAL_FRACTION = 0.02;
/** Un tramo del soporte cuenta para el borde de su fila si tiene al menos tantos píxeles (quita motas sueltas). */
const MIN_RUN_PX = 4;
/** Por debajo de este ángulo entre los bordes (rad, 2°) el sector es lineal. */
const LINEAR_MAX_ANGLE = (2 * Math.PI) / 180;
/** Un sector cuyo arco superior está por debajo de esta fracción del radio del fondo es sectorial (sonda de fase). */
const PHASED_MAX_RHO_RATIO = 0.15;

/**
 * Las componentes conexas grandes (8 vecinos) de una máscara: las de al menos `fraction` del tamaño de la mayor. Quita
 * las letras, las marcas y los botones sueltos; conserva los trozos de un sector que el negro parte (en una sonda de fase
 * el campo medio puede quedar por debajo del negro y separar el campo cercano del lejano).
 */
export function mainComponents(mask: Uint8Array, W: number, H: number, fraction = MAIN_COMPONENT_FRACTION): Uint8Array {
  const label = new Int32Array(W * H).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    const n = sizes.length;
    let size = 0;
    label[s] = n;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const k = yy * W + xx;
          if (mask[k] && label[k] < 0) {
            label[k] = n;
            stack.push(k);
          }
        }
    }
    sizes.push(size);
  }
  const biggest = sizes.length ? Math.max(...sizes) : 0;
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (label[i] >= 0 && sizes[label[i]] >= fraction * biggest) out[i] = 1;
  return out;
}

/** Media y desviación típica temporal por píxel de una pila de cuadros del mismo tamaño. */
export function temporalStats(frames: readonly GreyFrame[]): { mean: Float64Array; std: Float64Array } {
  const { width, height } = frames[0];
  const n = width * height;
  const mean = new Float64Array(n);
  const std = new Float64Array(n);
  for (const f of frames) {
    if (f.width !== width || f.height !== height) throw new RangeError('temporalStats: cuadros de tamaños distintos');
    for (let i = 0; i < n; i++) mean[i] += f.data[i];
  }
  for (let i = 0; i < n; i++) mean[i] /= frames.length;
  for (const f of frames)
    for (let i = 0; i < n; i++) {
      const d = f.data[i] - mean[i];
      std[i] += d * d;
    }
  for (let i = 0; i < n; i++) std[i] = Math.sqrt(std[i] / frames.length);
  return { mean, std };
}

/**
 * Detecta el sector de un clip (o de un cuadro): el soporte (§3.1, paso 2), sus bordes laterales como rectas (RANSAC
 * determinista sobre el extremo izquierdo y derecho de cada fila), su ápice (la intersección de los bordes) y sus arcos
 * (la mediana, por ángulo, del radio mínimo y máximo del soporte). Lo que el soporte no ve, la geometría tampoco: si el
 * fondo del sector es negro exacto (el simulador con el preajuste), `rhoMax` queda donde acaba lo encendido.
 */
export function detectSector(frames: readonly GreyFrame[], scale: GreyScale = GREY_8BIT): SectorDetection {
  if (frames.length === 0) throw new RangeError('detectSector: sin cuadros');
  const { width: W, height: H } = frames[0];
  const { mean, std } = temporalStats(frames);
  const span = scale.hi - scale.lo;
  // el fondo: la esquina más oscura (la mediana de cada esquina, 3 % del lado; una barra de título o de interfaz puede
  // encender otras); si hasta la más oscura está encendida, el cuadro entero es imagen
  const cw = Math.max(1, Math.round(0.03 * W));
  const ch = Math.max(1, Math.round(0.03 * H));
  const cornerMedians = [
    [0, 0],
    [W - cw, 0],
    [0, H - ch],
    [W - cw, H - ch],
  ].map(([x0, y0]) => {
    const v: number[] = [];
    for (let y = y0; y < y0 + ch; y++) for (let x = x0; x < x0 + cw; x++) v.push(mean[y * W + x]);
    return median(v);
  });
  const bg = Math.min(...cornerMedians);
  if (bg > scale.lo + 0.1 * span)
    return {
      geometry: { kind: 'linear', xLeft: 0, xRight: W - 1, yTop: 0, yBottom: H - 1 },
      maskSource: 'full-frame',
      supportFraction: 1,
      edgeInliers: { left: H, right: H, rows: H },
    };
  const lit = new Uint8Array(W * H);
  let litCount = 0;
  const tauM = bg + SUPPORT_INTENSITY * span;
  // un píxel varía si su σ temporal pasa del escalón del formato y de una fracción de su propio brillo sobre el fondo: la
  // recompresión (Theora, h264) hace temblar 1–2 grises el texto y la interfaz quemados, que no son imagen (σ/brillo
  // ≈ 0,01), mientras el moteado, el ruido y el movimiento del tejido varían mucho más, también donde es oscuro
  const minS = SUPPORT_TEMPORAL_QUANTA * Math.max(scale.quantum, 1e-6 * span);
  const tauAt = (i: number): number => Math.max(minS, SUPPORT_TEMPORAL_FRACTION * (mean[i] - bg));
  let varying = 0;
  for (let i = 0; i < W * H; i++)
    if (mean[i] > tauM) {
      lit[i] = 1;
      litCount++;
      if (std[i] > tauAt(i)) varying++;
    }
  const temporal = frames.length >= 3 && varying >= 0.5 * litCount;
  const raw = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (lit[i] && (!temporal || std[i] > tauAt(i))) raw[i] = 1;
  // las componentes conexas grandes: la imagen; el texto, las escalas y los botones separados por negro, fuera
  const support = mainComponents(raw, W, H);
  let supportCount = 0;
  for (let i = 0; i < W * H; i++) supportCount += support[i];
  // los extremos de cada fila: el primer y el último tramo de ≥ MIN_RUN_PX píxeles del soporte (saltando huecos cortos).
  // No el tramo más largo: las sombras costales, negras, parten la fila en varios. Un extremo en el borde del cuadro (o a
  // menos de ROW_GAP_PX de él: el soporte puede perder la última columna) no es el borde del abanico sino el del recorte
  // (LUS-01: el abanico sale por la derecha): no entra en la recta
  const ys: number[] = [];
  const ysL: number[] = [];
  const xl: number[] = [];
  const ysR: number[] = [];
  const xr: number[] = [];
  for (let y = 0; y < H; y++) {
    let first = -1;
    let lastEnd = -1;
    let a = -1;
    let last = -1;
    const close = (): void => {
      if (a >= 0 && last - a + 1 >= MIN_RUN_PX) {
        if (first < 0) first = a;
        lastEnd = last;
      }
    };
    for (let x = 0; x < W; x++) {
      if (!support[y * W + x]) continue;
      if (a < 0 || x - last > ROW_GAP_PX + 1) {
        close();
        a = x;
      }
      last = x;
    }
    close();
    if (first >= 0 && lastEnd - first >= 0.05 * W) {
      ys.push(y);
      if (first > ROW_GAP_PX) {
        ysL.push(y);
        xl.push(first);
      }
      if (lastEnd < W - 1 - ROW_GAP_PX) {
        ysR.push(y);
        xr.push(lastEnd);
      }
    }
  }
  if (ys.length < 4) throw new Error(`detectSector: soporte insuficiente (${ys.length} filas con tramo)`);
  // un lado que toca el borde del cuadro en todas las filas: el recorte es ese borde (un lineal a lo ancho)
  const left = ysL.length >= 2 ? robustLine(ysL, xl, EDGE_TOL_PX) : { a: 0, b: 0, inliers: 0 };
  const right = ysR.length >= 2 ? robustLine(ysR, xr, EDGE_TOL_PX) : { a: W - 1, b: 0, inliers: 0 };
  if (!left || !right) throw new Error('detectSector: no se ajustan los bordes laterales');
  const edgeInliers = { left: left.inliers, right: right.inliers, rows: ys.length };
  const thetaL = Math.atan(left.b);
  const thetaR = Math.atan(right.b);
  const supportFraction = supportCount / (W * H);
  const maskSource = temporal ? 'temporal' : 'intensity';
  if (Math.abs(thetaR - thetaL) < LINEAR_MAX_ANGLE) {
    const yMid = median(ys);
    const xLeft = left.a + left.b * yMid;
    const xRight = right.a + right.b * yMid;
    const tops: number[] = [];
    const bottoms: number[] = [];
    for (let x = Math.ceil(xLeft); x <= Math.floor(xRight); x++) {
      let t = -1;
      let b = -1;
      for (let y = 0; y < H; y++)
        if (support[y * W + x]) {
          if (t < 0) t = y;
          b = y;
        }
      if (t >= 0) {
        tops.push(t);
        bottoms.push(b);
      }
    }
    return {
      geometry: { kind: 'linear', xLeft, xRight, yTop: quantile(tops, 0.1), yBottom: quantile(bottoms, 0.9) },
      maskSource,
      supportFraction,
      edgeInliers,
    };
  }
  // ápice: x = a_L + b_L·y = a_R + b_R·y
  const apexY = (right.a - left.a) / (left.b - right.b);
  const apexX = left.a + left.b * apexY;
  // arcos: por ángulo, el radio mínimo y máximo del soporte dentro de los bordes (1° de margen)
  const BINS = 48;
  const margin = Math.PI / 180;
  const lo = thetaL + margin;
  const hi = thetaR - margin;
  const minR = new Array<number>(BINS).fill(Number.POSITIVE_INFINITY);
  const maxR = new Array<number>(BINS).fill(Number.NEGATIVE_INFINITY);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!support[y * W + x]) continue;
      const th = Math.atan2(x - apexX, y - apexY);
      if (th < lo || th > hi) continue;
      const bin = Math.min(BINS - 1, Math.floor(((th - lo) / (hi - lo)) * BINS));
      const rho = Math.hypot(x - apexX, y - apexY);
      if (rho < minR[bin]) minR[bin] = rho;
      if (rho > maxR[bin]) maxR[bin] = rho;
    }
  // la piel: el p10 de los radios mínimos por ángulo (no la mediana: donde el campo cercano está a oscuras, como en los
  // lados de una sonda de fase, lo primero encendido queda hondo); el fondo, el p90 de los máximos (no la mediana: bajo una
  // sombra costal negra lo encendido acaba en la costilla)
  const rhoMin = quantile(
    minR.filter((r) => Number.isFinite(r)),
    0.1,
  );
  const rhoMax = quantile(
    maxR.filter((r) => Number.isFinite(r)),
    0.9,
  );
  // sonda de fase: las líneas salen del centro de la cara, el ápice; lo primero encendido está algo más abajo (el campo
  // cercano), así que la piel es el ápice (rhoMin = 0)
  if (rhoMin < PHASED_MAX_RHO_RATIO * rhoMax)
    return {
      geometry: { kind: 'sector', apexX, apexY, thetaLeft: thetaL, thetaRight: thetaR, rhoMin: 0, rhoMax },
      maskSource,
      supportFraction,
      edgeInliers,
    };
  return {
    geometry: { kind: 'convex', apexX, apexY, thetaLeft: thetaL, thetaRight: thetaR, rhoMin, rhoMax },
    maskSource,
    supportFraction,
    edgeInliers,
  };
}

/**
 * Muestreo del sector en «espacio del haz»: columnas a lo largo del sector (ángulo en convexa, x en lineal) y filas en
 * profundidad desde la piel, 1 px por fila (a lo largo del haz: la distancia radial en convexa). Así la pleura es una
 * fila por columna, las líneas A se buscan a lo largo de cada haz (F-T01: r_k = k·r_pl) y las sombras son tramos de
 * columnas. Interpolación bilineal: equivariante a x → a·x + b.
 */
export interface BeamSampler {
  geometry: SectorGeometry;
  cols: number;
  rows: number;
  /** Ángulo (convexa, rad) o x (lineal, px) de cada columna. */
  lateral: Float64Array;
  /** Separación entre columnas vecinas a la profundidad de la fila i (px). */
  lateralPx: (row: number) => number;
  /** Posición (x, y) en el cuadro de la muestra (fila, columna). */
  position: (row: number, col: number) => { x: number; y: number };
  /** Muestrea un cuadro: filas × columnas, NaN fuera del cuadro y en las zonas excluidas. */
  sample: (frame: GreyFrame) => Float64Array;
}

/** Margen lateral que no se muestrea a cada lado (fracción del ancho del sector): el borde del abanico. */
const LATERAL_MARGIN = 0.015;

/** Rectángulo del cuadro (px, extremos incluidos) que no se mide: texto o marcas quemados dentro del sector. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** El punto (x, y) está dentro del sector. */
export function insideSector(g: SectorGeometry, x: number, y: number): boolean {
  if (g.kind === 'linear') return x >= g.xLeft && x <= g.xRight && y >= g.yTop && y <= g.yBottom;
  const th = Math.atan2(x - g.apexX, y - g.apexY);
  const rho = Math.hypot(x - g.apexX, y - g.apexY);
  return th >= g.thetaLeft && th <= g.thetaRight && rho >= g.rhoMin && rho <= g.rhoMax;
}

/**
 * El negro de un clip (§3.1, principio 5): la moda del gris medio fuera del sector (el marco de la pantalla), redondeada al
 * escalón. Es donde el vídeo recorta por abajo, que no tiene por qué ser 0 (LUS-01: 3). null si no queda nada fuera (un
 * recorte lineal a lo ancho).
 */
export function outsideBlack(frames: readonly GreyFrame[], g: SectorGeometry, exclude: readonly Rect[] = []): number | null {
  const { mean } = temporalStats(frames);
  const { width: W, height: H } = frames[0];
  const counts = new Map<number, number>();
  const margin = 3;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (
        insideSector(g, x, y) ||
        exclude.some((r) => x >= r.x0 - margin && x <= r.x1 + margin && y >= r.y0 - margin && y <= r.y1 + margin)
      )
        continue;
      // lejos del borde del abanico (el suavizado del vídeo lo funde con el fondo)
      if (
        insideSector(g, x + margin, y) ||
        insideSector(g, x - margin, y) ||
        insideSector(g, x, y + margin) ||
        insideSector(g, x, y - margin)
      )
        continue;
      const v = Math.round(mean[y * W + x]);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  let best: number | null = null;
  let bestN = 0;
  for (const [v, n] of counts)
    if (n > bestN || (n === bestN && best !== null && v < best)) {
      best = v;
      bestN = n;
    }
  return bestN >= 50 ? best : null;
}

export function beamSampler(geometry: SectorGeometry, width: number, height: number, exclude: readonly Rect[] = []): BeamSampler {
  const g = geometry;
  let cols: number;
  let rows: number;
  const lateral: number[] = [];
  let position: (row: number, col: number) => { x: number; y: number };
  let lateralPx: (row: number) => number;
  if (g.kind === 'linear') {
    const w = g.xRight - g.xLeft;
    const a = g.xLeft + LATERAL_MARGIN * w;
    const b = g.xRight - LATERAL_MARGIN * w;
    cols = Math.max(2, Math.round(b - a));
    rows = Math.max(2, Math.floor(g.yBottom - g.yTop));
    for (let j = 0; j < cols; j++) lateral.push(a + ((j + 0.5) * (b - a)) / cols);
    const dx = (b - a) / cols;
    position = (i, j) => ({ x: lateral[j], y: g.yTop + i });
    lateralPx = () => dx;
  } else {
    const span = g.thetaRight - g.thetaLeft;
    const a = g.thetaLeft + LATERAL_MARGIN * span;
    const b = g.thetaRight - LATERAL_MARGIN * span;
    cols = Math.max(2, Math.round((b - a) * 0.5 * (g.rhoMin + g.rhoMax)));
    rows = Math.max(2, Math.floor(g.rhoMax - g.rhoMin));
    for (let j = 0; j < cols; j++) lateral.push(a + ((j + 0.5) * (b - a)) / cols);
    const dTheta = (b - a) / cols;
    position = (i, j) => {
      const rho = g.rhoMin + i;
      return { x: g.apexX + rho * Math.sin(lateral[j]), y: g.apexY + rho * Math.cos(lateral[j]) };
    };
    lateralPx = (i) => (g.rhoMin + i) * dTheta;
  }
  // índices y pesos bilineales, una vez para todos los cuadros
  const n = rows * cols;
  const i00 = new Int32Array(n).fill(-1);
  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const { x, y } = position(i, j);
      if (!(x >= 0 && y >= 0 && x <= width - 1 && y <= height - 1)) continue;
      if (exclude.some((r) => x >= r.x0 - 1 && x <= r.x1 + 1 && y >= r.y0 - 1 && y <= r.y1 + 1)) continue;
      const x0 = Math.min(Math.floor(x), width - 2);
      const y0 = Math.min(Math.floor(y), height - 2);
      const k = i * cols + j;
      i00[k] = y0 * width + x0;
      fx[k] = x - x0;
      fy[k] = y - y0;
    }
  const sample = (frame: GreyFrame): Float64Array => {
    if (frame.width !== width || frame.height !== height) throw new RangeError('beamSampler: el cuadro no tiene el tamaño del muestreo');
    const d = frame.data;
    const out = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const p = i00[k];
      if (p < 0) {
        out[k] = Number.NaN;
        continue;
      }
      const a = d[p] + (d[p + 1] - d[p]) * fx[k];
      const b = d[p + width] + (d[p + width + 1] - d[p + width]) * fx[k];
      out[k] = a + (b - a) * fy[k];
    }
    return out;
  };
  return { geometry, cols, rows, lateral: Float64Array.from(lateral), lateralPx, position, sample };
}
