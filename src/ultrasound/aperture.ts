import { TISSUES, Tissue } from '../anatomy/tissues';
import { C_RECONSTRUCTION_M_S } from '../core/units';
import { AXIAL_SIGMA_MM, type BeamParams } from './beamModel';
import { alongLineMm } from './steering';

/**
 * Penumbra de la apertura (decisión 54). El eco de un punto a la profundidad r no viaja por un solo
 * rayo: sale de toda la apertura y vuelve a ella. Un obstáculo somero (costilla, borde del pulmón)
 * tapa solo los rayos que lo cruzan; los rayos de un elemento a a un punto p cruzan la profundidad
 * del obstáculo r₀ a una distancia lateral a·(1 − r₀/r) del eje, así que el cono mide
 * D·(1 − r₀/r) a esa profundidad. La transmisión de ida es la media de la de las líneas que caen
 * dentro de ese cono (cada una representa los rayos que cruzan el obstáculo en su posición), y la
 * de ida y vuelta, el producto de la media de emisión (D fija) por la de recepción (apertura
 * dinámica D = min(D_máx, r/F#)). Sin obstáculo por encima de r, un solo rayo.
 *
 * Consecuencias: bajo una costilla ancha junto a la sonda la sombra es completa; más hondo el cono
 * se estrecha menos que la costilla deja de cubrirlo y la sombra se rellena; su borde es una rampa
 * del ancho del cono, no un escalón de una línea.
 *
 * Gemelos: `apertureTransmission` (TS, pruebas) y `APERTURE_GLSL` (pasada A), misma fórmula.
 *
 * lus-sim (ciclo 2, decisión 20): la media del cono es de amplitudes con su fase. Un rayo que cruza L mm de hueso
 * (c = 3515 m/s) llega antes que por el tejido blando que ese hueso ocupa: su fase adelanta k·L, con k = 2π·f·(1/c_blando −
 * 1/c_hueso). Si todas las tomas del cono cruzan el mismo hueso (una placa) solo se retrasa el frente y el foco no pierde
 * nada; una costilla de sección redonda es más gruesa en el centro que en los bordes, así que el frente llega deformado
 * (una lente divergente) y las tomas se suman con fases distintas. La media es la de la potencia de la suma coherente
 * promediada en la banda gaussiana del pulso (`BoneCoherence`): con todas las tomas sin hueso, la media de siempre.
 */

/** Tomas por cono (la media se toma en líneas enteras, como la GPU con `texelFetch`). */
export const APERTURE_TAPS = 9;
/** Líneas a cada lado donde se busca el obstáculo (cubre el cono máximo, D/2 en la cara). */
export const APERTURE_SEARCH_LINES = 40;

/**
 * Fase que el hueso añade a una toma del cono (ciclo 2, decisión 20), en radianes por mm de hueso: la de emisión y la de
 * recepción, 2π·f·(1/c_blando − 1/c_hueso), y la anchura de la banda del pulso en las mismas unidades (σ del espectro de
 * energía, 2π·σ_f·(1/c_blando − 1/c_hueso)). Sin hueso en el cono no se usa. `boneCoherence` la calcula del haz.
 */
export interface BoneCoherence {
  kTxPerMm: number;
  kRxPerMm: number;
  sigmaPerMm: number;
  /**
   * En armónica la emisión va a f/2 y la fuente del armónico es ∝ p₁² (decisión 77): el cono de emisión pierde por la fase
   * lo que pierde p₁, al cuadrado (`coneMeanOf`). La revisión del ciclo 2 lo halló: sin el cuadrado, el cono de emisión en
   * armónica quedaba 5–20 dB más brillante bajo una costilla.
   */
  txSquared: boolean;
}

/**
 * `BoneCoherence` del haz del modo B (lus-sim, decisión 20). La fase: la frecuencia de emisión y la de recepción, c/λ
 * (en fundamental, las dos de 3,5 MHz; en armónica, la emisión a la mitad), con la velocidad del hueso cortical y la del
 * músculo intercostal que la costilla ocupa (IT'IS, `TISSUES`). La banda: la del pulso de la pasada C, cuya envolvente de
 * dos vías tiene σ = `AXIAL_SIGMA_MM` en profundidad (σ_t = 2σ/c): su espectro de energía, gaussiano, tiene
 * σ_f = 1/(2π·√2·σ_t) (0,33 MHz). Ningún número nuevo.
 */
export function boneCoherence(beam: Pick<BeamParams, 'lambdaMm' | 'lambdaTxMm'>): BoneCoherence {
  const slowness = 1 / TISSUES[Tissue.Muscle].c - 1 / TISSUES[Tissue.Bone].c; // s/m
  const perMm = (fHz: number): number => 2 * Math.PI * fHz * slowness * 1e-3;
  const sigmaT = (2 * AXIAL_SIGMA_MM * 1e-3) / C_RECONSTRUCTION_M_S;
  return {
    kTxPerMm: perMm(C_RECONSTRUCTION_M_S / (beam.lambdaTxMm * 1e-3)),
    kRxPerMm: perMm(C_RECONSTRUCTION_M_S / (beam.lambdaMm * 1e-3)),
    sigmaPerMm: perMm(1 / (2 * Math.PI * Math.SQRT2 * sigmaT)),
    // la emisión a una frecuencia menor que la recepción: la armónica (`harmonicBeam`, λ_tx = 2λ)
    txSquared: beam.lambdaTxMm > beam.lambdaMm,
  };
}

/** Hueso a lo largo de cada línea del cono hasta la profundidad del punto (mm) y la fase que añade. */
export interface ApertureBone {
  mm: (l: number) => number;
  coherence: BoneCoherence;
}

/**
 * Media de amplitudes de las tomas `amps` con la fase de su hueso `bones` (mm): la raíz de la potencia de la suma
 * coherente promediada en la banda gaussiana del pulso, Σ_j Σ_m a_j·a_m·cos(k·ΔL)·e^(−(σ·ΔL)²/2), entre el número de
 * tomas. Sin hueso (todas las L iguales a 0) es la media de siempre, sin cuentas de más.
 */
export function coherentConeMean(amps: readonly number[], bones: readonly number[], k: number, sigma: number): number {
  const n = amps.length;
  let sum = 0;
  let bone = false;
  for (let j = 0; j < n; j++) {
    sum += amps[j];
    if (bones[j] > 0) bone = true;
  }
  if (!bone) return sum / n;
  let p = 0;
  for (let j = 0; j < n; j++) {
    p += amps[j] * amps[j];
    for (let m = j + 1; m < n; m++) {
      const d = bones[j] - bones[m];
      p += 2 * amps[j] * amps[m] * Math.cos(k * d) * Math.exp(-0.5 * (sigma * d) ** 2);
    }
  }
  return Math.sqrt(Math.max(p, 0)) / n;
}

export interface ApertureGeometry {
  lines: number;
  halfSector: number;
  curvatureRadius: number;
  /** Apertura de emisión (mm). */
  apertureTxMm: number;
  /** Apertura de recepción máxima (mm) y F# mínimo de recepción. */
  apertureRxMaxMm: number;
  fNumberRxMin: number;
}

/**
 * Transmisión de amplitud ida y vuelta con apertura en (línea, profundidad r).
 * `oneWay(l)`: transmisión de ida de un rayo por la línea l hasta r (0–1).
 * `firstObstacleMm(l)`: profundidad del primer gas o hueso de la línea l (Infinity si no hay).
 * `roundBias` (líneas; 0 en el gemelo) desplaza el redondeo de las tomas del cono: la paridad con la GPU
 * (`steeredParity.ts`) lo usa para reconocer las muestras en empate de redondeo. `bone` (lus-sim, decisión 20): el hueso
 * de cada línea hasta r y su fase; sin él, ninguna toma cruza hueso (la media de amplitudes de siempre).
 */
/**
 * Media de un cono con la fase de su hueso (`coherentConeMean`) o, con `squared` (el cono de emisión en armónica: la fuente
 * del armónico es ∝ p₁²), la media de amplitudes de siempre por la pérdida de coherencia de p₁ al cuadrado: con las
 * amplitudes de p₁ (√a) y la fase de la emisión, (coherente/media)². Sin hueso, la media de siempre en los dos casos.
 */
export function coneMeanOf(amps: readonly number[], bones: readonly number[], k: number, sigma: number, squared: boolean): number {
  if (!squared) return coherentConeMean(amps, bones, k, sigma);
  const roots = amps.map((a) => Math.sqrt(a));
  const n = amps.length;
  let plain = 0;
  let mean = 0;
  for (let j = 0; j < n; j++) {
    plain += roots[j];
    mean += amps[j];
  }
  plain /= n;
  mean /= n;
  if (plain <= 0) return 0;
  const c = coherentConeMean(roots, bones, k, sigma);
  return mean * (c / plain) * (c / plain);
}

export function apertureTransmission(
  geom: ApertureGeometry,
  line: number,
  r: number,
  oneWay: (l: number) => number,
  firstObstacleMm: (l: number) => number,
  roundBias = 0,
  bone?: ApertureBone,
): number {
  const single = oneWay(line) ** 2;
  const dTheta = (2 * geom.halfSector) / geom.lines;
  const maxHalf = (0.5 * geom.apertureTxMm) / (geom.curvatureRadius * dTheta);
  let ro = Infinity;
  for (let d = -APERTURE_SEARCH_LINES; d <= APERTURE_SEARCH_LINES; d++) {
    if (d < -Math.ceil(maxHalf) || d > Math.ceil(maxHalf)) continue;
    const l = line + d;
    if (l < 0 || l >= geom.lines) continue;
    const o = firstObstacleMm(l);
    if (o < r) ro = Math.min(ro, o);
  }
  if (!Number.isFinite(ro)) return single;
  const spacing = (geom.curvatureRadius + ro) * dTheta;
  const shrink = 1 - ro / r;
  const halfTx = (0.5 * geom.apertureTxMm * shrink) / spacing;
  const halfRx = (0.5 * Math.min(geom.apertureRxMaxMm, r / geom.fNumberRxMin) * shrink) / spacing;
  const coneMean = (halfLines: number, k: number, squared: boolean): number => {
    const amps: number[] = [];
    const bones: number[] = [];
    for (let j = 0; j < APERTURE_TAPS; j++) {
      const off = halfLines * ((2 * j) / (APERTURE_TAPS - 1) - 1);
      const l = Math.min(geom.lines - 1, Math.max(0, line + Math.floor(off + 0.5 + roundBias)));
      amps.push(oneWay(l));
      bones.push(bone ? bone.mm(l) : 0);
    }
    return coneMeanOf(amps, bones, k, bone ? bone.coherence.sigmaPerMm : 0, squared);
  };
  const c = bone?.coherence;
  return coneMean(halfTx, c ? c.kTxPerMm : 0, c ? c.txSquared : false) * coneMean(halfRx, c ? c.kRxPerMm : 0, false);
}

/**
 * Penumbra de una mirada dirigida θ (composición espacial, decisión 58): el mismo cono, pero de los
 * caminos dirigidos. Las líneas vecinas de una mirada son paralelas desplazadas un elemento, y la que
 * llega a la línea l de la rejilla común en la fila del punto es la del elemento φ_l − θ + β(ρ): el
 * cono se toma sobre esas líneas (recentrado en el cruce del camino dirigido con el obstáculo), con el
 * paso entre ellas a la distancia s del camino, (R·cos θ + s)·dφ, y las distancias a lo largo del camino.
 * Es `apertureTransmission` con radio efectivo R·cos θ (la búsqueda del obstáculo, D/2 en la cara, se
 * ensancha con él) y r → s(ρ). `oneWay(l)` y `firstObstacleMm(l)` son los del camino dirigido que llega
 * a la línea l (el prefijo dirigido de A2: `steeredPrefixDb`), con el obstáculo a lo largo del camino.
 * Con θ = 0 es exactamente `apertureTransmission`.
 */
export function steeredApertureTransmission(
  geom: ApertureGeometry,
  theta: number,
  line: number,
  r: number,
  oneWay: (l: number) => number,
  firstObstacleMm: (l: number) => number,
  roundBias = 0,
  bone?: ApertureBone,
): number {
  if (theta === 0) return apertureTransmission(geom, line, r, oneWay, firstObstacleMm, roundBias, bone);
  const R = geom.curvatureRadius;
  const steered: ApertureGeometry = { ...geom, curvatureRadius: R * Math.cos(theta) };
  return apertureTransmission(steered, line, alongLineMm(R + r, theta, R), oneWay, firstObstacleMm, roundBias, bone);
}

/**
 * La misma fórmula en GLSL para la pasada A (`FRAG_TRANSMISSION`): lee la atenuación ida y vuelta
 * de un rayo (uPre0.x, dB) y los primeros impactos por línea (uHits0: gas en .y, hueso en .z, en
 * segmentos gruesos). Necesita uLinesF, uHalfSector, uCurvR, uCoarseN y uAperture. lus-sim (decisión 20): el hueso de
 * cada toma, la cuerda de la costilla de su línea hasta la fila con la entrada y la salida exactas de A0 (`boneChordMm`,
 * que va delante, con uHits3), y su fase (uBoneCoh: k de emisión, k de recepción y σ de la banda, por mm de hueso, y en .w
 * 1 si la emisión construye el armónico, ∝ p₁²).
 */
export const APERTURE_GLSL = /* glsl */ `
const int AP_TAPS = ${APERTURE_TAPS};
const int AP_SEARCH = ${APERTURE_SEARCH_LINES};
uniform vec4 uBoneCoh;
float apOneWay(int l, int k) {
  l = clamp(l, 0, int(uLinesF) - 1);
  return pow(10.0, -texelFetch(uPre0, ivec2(l, k), 0).x / 40.0);
}
float apBoneMm(int l, int k, float step) {
  return boneChordMm(clamp(l, 0, int(uLinesF) - 1), (float(k) + 0.5) * step);
}
// media de amplitudes con la fase del hueso de cada toma (coherentConeMean): sin hueso, la media de siempre
float apCoherentMean(float a[AP_TAPS], float b[AP_TAPS], float kPh) {
  float sum = 0.0;
  bool bone = false;
  for (int j = 0; j < AP_TAPS; j++) {
    sum += a[j];
    if (b[j] > 0.0) bone = true;
  }
  if (!bone) return sum / float(AP_TAPS);
  float p = 0.0;
  for (int j = 0; j < AP_TAPS; j++) {
    p += a[j] * a[j];
    for (int m = j + 1; m < AP_TAPS; m++) {
      float d = b[j] - b[m];
      p += 2.0 * a[j] * a[m] * cos(kPh * d) * exp(-0.5 * (uBoneCoh.z * d) * (uBoneCoh.z * d));
    }
  }
  return sqrt(max(p, 0.0)) / float(AP_TAPS);
}
// coneMeanOf: con squared (la emisión en armónica, uBoneCoh.w), la media por la pérdida de coherencia de p1 al cuadrado
float apConeMeanOf(float a[AP_TAPS], float b[AP_TAPS], float kPh, bool squared) {
  if (!squared) return apCoherentMean(a, b, kPh);
  float r[AP_TAPS];
  float plain = 0.0;
  float mean = 0.0;
  for (int j = 0; j < AP_TAPS; j++) {
    r[j] = sqrt(a[j]);
    plain += r[j];
    mean += a[j];
  }
  plain /= float(AP_TAPS);
  mean /= float(AP_TAPS);
  if (plain <= 0.0) return 0.0;
  float c = apCoherentMean(r, b, kPh);
  return mean * (c / plain) * (c / plain);
}
float apConeMean(int line, int k, float halfLines, float kPh, float step, bool squared) {
  float a[AP_TAPS];
  float b[AP_TAPS];
  for (int j = 0; j < AP_TAPS; j++) {
    float off = halfLines * (2.0 * float(j) / float(AP_TAPS - 1) - 1.0);
    int l = line + int(floor(off + 0.5));
    a[j] = apOneWay(l, k);
    b[j] = apBoneMm(l, k, step);
  }
  return apConeMeanOf(a, b, kPh, squared);
}
float apertureTransmission(int line, int k, float r, float step, float single) {
  float dTheta = 2.0 * uHalfSector / uLinesF;
  float maxHalf = (0.5 * uAperture.x) / (uCurvR * dTheta);
  int W = int(ceil(maxHalf));
  float ro = 1e9;
  for (int d = -AP_SEARCH; d <= AP_SEARCH; d++) {
    if (d < -W || d > W) continue;
    int l = line + d;
    if (l < 0 || l >= int(uLinesF)) continue;
    vec4 h = texelFetch(uHits0, ivec2(l, 0), 0);
    float seg = h.y >= 0.0 ? (h.z >= 0.0 ? min(h.y, h.z) : h.y) : h.z;
    if (seg >= 0.0) {
      float rr = (seg + 0.5) * step;
      if (rr < r) ro = min(ro, rr);
    }
  }
  if (ro > 1e8) return single;
  float spacing = (uCurvR + ro) * dTheta;
  float shrink = 1.0 - ro / r;
  float halfTx = 0.5 * uAperture.x * shrink / spacing;
  float halfRx = 0.5 * min(uAperture.y, r / uAperture.z) * shrink / spacing;
  return apConeMean(line, k, halfTx, uBoneCoh.x, step, uBoneCoh.w > 0.5) * apConeMean(line, k, halfRx, uBoneCoh.y, step, false);
}
`;

/**
 * `steeredApertureTransmission` en GLSL para la pasada A (etapa 2 de la decisión 58). Va detrás de
 * `APERTURE_GLSL` (usa AP_TAPS, AP_SEARCH y apConeMeanOf). Lee el prefijo dirigido de A2 (`uPreSteer`: dB ida y
 * vuelta, y primer gas y primer hueso a lo largo del camino, −1 sin ellos) en la fila k de cada línea vecina y
 * necesita uLinesF, uHalfSector, uAperture y uSteer (θ, R·sin θ, R·cos θ, k2). `s` es la distancia a lo
 * largo del camino hasta el punto y `single`, la transmisión de su propio rayo dirigido. lus-sim (decisión 20): el
 * hueso de cada toma a lo largo de su camino dirigido (A2, `uPreSteerX.z`, mm).
 */
export const STEERED_APERTURE_GLSL = /* glsl */ `
float apOneWaySteer(int l, int k) {
  l = clamp(l, 0, int(uLinesF) - 1);
  return pow(10.0, -texelFetch(uPreSteer, ivec2(l, k), 0).x / 40.0);
}
float apBoneMmSteer(int l, int k) {
  l = clamp(l, 0, int(uLinesF) - 1);
  return texelFetch(uPreSteerX, ivec2(l, k), 0).z;
}
float apConeMeanSteer(int line, int k, float halfLines, float kPh, bool squared) {
  float a[AP_TAPS];
  float b[AP_TAPS];
  for (int j = 0; j < AP_TAPS; j++) {
    float off = halfLines * (2.0 * float(j) / float(AP_TAPS - 1) - 1.0);
    int l = line + int(floor(off + 0.5));
    a[j] = apOneWaySteer(l, k);
    b[j] = apBoneMmSteer(l, k);
  }
  return apConeMeanOf(a, b, kPh, squared);
}
float steeredApertureTransmission(int line, int k, float s, float single) {
  float dTheta = 2.0 * uHalfSector / uLinesF;
  float rc = uSteer.z;
  float maxHalf = (0.5 * uAperture.x) / (rc * dTheta);
  int W = int(ceil(maxHalf));
  float so = 1e9;
  for (int d = -AP_SEARCH; d <= AP_SEARCH; d++) {
    if (d < -W || d > W) continue;
    int l = line + d;
    if (l < 0 || l >= int(uLinesF)) continue;
    vec4 h = texelFetch(uPreSteer, ivec2(l, k), 0);
    float o = h.y >= 0.0 ? (h.z >= 0.0 ? min(h.y, h.z) : h.y) : h.z;
    if (o >= 0.0 && o < s) so = min(so, o);
  }
  if (so > 1e8) return single;
  float spacing = (rc + so) * dTheta;
  float shrink = 1.0 - so / s;
  float halfTx = 0.5 * uAperture.x * shrink / spacing;
  float halfRx = 0.5 * min(uAperture.y, s / uAperture.z) * shrink / spacing;
  return apConeMeanSteer(line, k, halfTx, uBoneCoh.x, uBoneCoh.w > 0.5) * apConeMeanSteer(line, k, halfRx, uBoneCoh.y, false);
}
`;
