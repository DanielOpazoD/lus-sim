import { describe, expect, it } from 'vitest';
import {
  FIRST_WALL_INTERFACE,
  INTERFACES,
  INTERFACE_GLSL_NAME,
  Interface,
  LAST_WALL_INTERFACE,
  interfaceReflectivity,
} from '../anatomy/interfaces';
import { lungEdgeZ } from '../anatomy/organs/lungBorder';
import { wallArc } from '../anatomy/organs/wall';
import { AnatomyScene, type SceneInstant } from '../anatomy/scene';
import { ANATOMY_GLSL } from '../anatomy/gpu/anatomy.glsl';
import { sdDiaphragm, torsoNormal, torsoSkinPoint } from '../anatomy/primitives';
import { TISSUES, Tissue, attenuationDbPerCm } from '../anatomy/tissues';
import { cross, normalize, type Vec3 } from '../core/vec3';
import { CONVEX_C35, lineDirection, pointOnLine, probeFrame, type ProbeFrame, type ProbePose } from '../probe/probe';
import { CONVEX_BEAM, lateralSigmaMm } from '../ultrasound/beamModel';
import {
  IFACE_K_DB,
  IFACE_SHIFT_MM,
  IFACE_SLOPE_REF,
  facetLobe,
  interfaceEchoField,
  interfaceUniforms,
  roughnessCoherence,
} from '../ultrasound/interfaceEcho';
import {
  CURTAIN_CONTIGUOUS_SEGMENTS,
  CURTAIN_GAS_KIND,
  CURTAIN_MIN_AIR,
  CURTAIN_RECORD_MM,
  CURTAIN_TAPER_MM,
  PLEURA_GLSL,
  PLEURA_RP,
  PLEURA_RT,
  PLEURA_SERIES_FLOOR,
  PLEURA_WALL_FIELD_BOUND,
  WALL_COPY_FACE_GAIN,
  WALL_COPY_FACE_GAIN_RANGE,
  SLIDING_AX_MM,
  SLIDING_DB,
  SLIDING_EFOLD_MM,
  SLIDING_LAT_MM,
  SLIDING_PSF_GAIN_DB,
  aLineGain,
  aLineOrder,
  curtainAirFraction,
  curtainEdgeSigmaMm,
  edgeWidth1090Mm,
  elevSigmaMm,
  forwardGain,
  mirrorGain,
  normalCdf,
  pleuraCapMm,
  pleuraCoherence,
  pleuraRoundTrip,
  pleuraRoundTripLobe,
  pleuraSeriesDepths,
  pleuraSeriesEcho,
  pleuraTerms,
  slidingAmplitude,
  slidingField,
  slidingLattice,
} from '../ultrasound/pleura';
import { FRAG_RAWFIELD, FRAG_RAWFIELD_STEERED, FRAG_TRANS_HITS, FRAG_TRANS_SEGMENTS } from '../ultrasound/shaders/passes.glsl';
import { WALL_TEXTURE } from '../ultrasound/wallTexture';
import {
  GAS_DB_PER_CM,
  MIRROR_BISECTION_STEPS,
  STEERED_PREFIX_GLSL,
  lineHits,
  mirrorCrossing,
  pleuraCrossingLine,
  segmentDb,
  steeredPrefixDb,
  transmissionHitsLine,
  type HitsLine,
  type HitsLineQuery,
} from '../ultrasound/transmission';
import { defaultPatient } from '../physiology/patientState';
import { rng } from './syntheticSpeckle';
import { emptyGrid } from './support/segmentGrid';

/**
 * Pleura parietal y cortina pulmonar (decisión 61): la cara nueva de la tabla, las amplitudes de la serie
 * de reverberaciones frente a los caminos acústicos, sin doble eco pleural, la fracción de aire del borde
 * blando, la clasificación sin la cortina, el deslizamiento anclado al pulmón y la pleura de A0 (tipo 3, sin
 * espejo) frente al espejo del diafragma, que no cambia. El gemelo B → C → D con los niveles de la imagen
 * está en `pleuraTwin.test.ts` (lento) y la geometría del camino dirigido en `steeredSample.test.ts`.
 *
 * lus-sim (decisión 10): el núcleo del pulmón de la imagen, portado idéntico (`pleura.ts`, `transmission.ts`),
 * con la escena del tórax. Las vistas de VExUS que se usan aquí son del tórax bajo (el 8.º espacio en la axilar
 * media, el flanco y la subcostal con el haz hacia la cúpula) y se conservan como poses de prueba (`LOWER_VIEWS`):
 * son las que tienen cortina y espejo del diafragma. Lo que comprueba los programas ensamblados de las pasadas A y B
 * volvió con la GPU (paso B2, decisión 12); el banco de la cortina de `app/fidelity.ts` aún no se porta (fase 2).
 */
/**
 * Vistas del tórax bajo (las poses de los puntos de partida de VExUS vexus-sim@52354d5:src/app/startPoints.ts,
 * usadas como entradas de prueba): el 8.º espacio intercostal en la línea axilar media a lo largo del espacio,
 * el flanco longitudinal abanicado hacia atrás y la subcostal paramediana con el haz basculado hacia la cúpula.
 */
const LOWER_VIEWS: Record<'intercostal' | 'flank' | 'subxiphoid', ProbePose> = {
  intercostal: { phi: Math.PI, z: 0, lift: 0, yaw: -1.15, rock: 0, tilt: 0 },
  flank: { phi: Math.PI * 1.04, z: -20, lift: 0, yaw: 0, rock: 0, tilt: -0.2 },
  subxiphoid: { phi: Math.PI / 2 + 0.2, z: -20, lift: 0, yaw: 0, rock: 0.45, tilt: 0 },
};
const K0 = (2 * Math.PI) / CONVEX_BEAM.lambdaMm;
const db = (x: number) => 20 * Math.log10(x);
const deg = Math.PI / 180;

describe('la cara de la pleura parietal (decisión 61)', () => {
  it('entrada de la tabla: Fresnel músculo/gas, un lado (la dibuja el músculo), s 0,10–0,15, con su fuente', () => {
    const p = INTERFACES[Interface.PleuraWall];
    expect(p.sides).toEqual([Tissue.Muscle, Tissue.Lung]);
    expect(interfaceReflectivity(Interface.PleuraWall)).toBeCloseTo(0.9995, 4);
    expect(PLEURA_RP).toBe(interfaceReflectivity(Interface.PleuraWall));
    expect(p.twoSided).toBe(false);
    expect(p.slopeRms).toBeGreaterThanOrEqual(0.1);
    expect(p.slopeRms).toBeLessThanOrEqual(0.15);
    expect(p.source).toMatch(/Lee 2017/);
    expect(p.source).toMatch(/ESTIMADO/);
    expect(INTERFACE_GLSL_NAME[Interface.PleuraWall]).toBe('IF_PLEURA_WALL');
    // el uniform de la pasada B lleva su fila: (A, 2·k0·σz, 1/(4s²), un lado)
    const u = interfaceUniforms(K0);
    const row = Array.from(u.subarray(4 * Interface.PleuraWall, 4 * Interface.PleuraWall + 4));
    expect(row[1]).toBeCloseTo(2 * K0 * p.roughnessMm, 5);
    expect(row[2]).toBeCloseTo(1 / (4 * p.slopeRms * p.slopeRms), 5);
    expect(row[3]).toBe(0);
  });

  it('la línea pleural es la cara más brillante de la tabla y se apaga en los bordes del sector', () => {
    const p = INTERFACES[Interface.PleuraWall];
    const s = (i: Interface, a: number) =>
      10 ** (IFACE_K_DB / 20) *
      interfaceReflectivity(i) *
      facetLobe(Math.cos(a * deg), INTERFACES[i].slopeRms) *
      roughnessCoherence(Math.cos(a * deg), INTERFACES[i].roughnessMm, K0);
    // S sobre el moteado del hígado a incidencia normal: +45 dB (la del diafragma, +26)
    expect(db(s(Interface.PleuraWall, 0))).toBeGreaterThan(40);
    const others = Object.values(Interface).filter(
      (v): v is Interface => typeof v === 'number' && v !== Interface.None && v !== Interface.PleuraWall,
    );
    for (const i of others) expect(s(Interface.PleuraWall, 0), Interface[i]).toBeGreaterThan(s(i, 0));
    // −6 a −8 dB a 15° y < −25 dB a 35°: brillante cerca de la normal, apagada en los bordes
    const rel = (a: number) => db(s(Interface.PleuraWall, a) / s(Interface.PleuraWall, 0));
    expect(rel(15)).toBeLessThan(-4);
    expect(rel(15)).toBeGreaterThan(-9);
    expect(rel(35)).toBeLessThan(-25);
    expect(facetLobe(1, p.slopeRms)).toBeCloseTo(IFACE_SLOPE_REF / p.slopeRms, 12);
    // perfil de un lado: centrado 2,5σh dentro del músculo (por encima de D)
    const at = (delta: number) => interfaceEchoField(Interface.PleuraWall, 1, 1, delta, K0);
    expect(at(IFACE_SHIFT_MM)).toBeGreaterThan(at(0));
    expect(at(IFACE_SHIFT_MM)).toBeGreaterThan(at(2 * IFACE_SHIFT_MM));
    // lus-sim (decisión 15): la línea pleural y sus réplicas, que la rama del pulmón dibuja a los dos lados de k·D, con
    // el mismo perfil centrado en el cruce (`pleuraSeriesEcho`): pico en δ = 0, simétrico y con la misma altura
    expect(p.twoSided).toBe(false);
    for (const cosI of [1, Math.cos(15 * deg)]) {
      const series = (delta: number) => pleuraSeriesEcho(cosI, delta, K0);
      expect(series(0)).toBeCloseTo(interfaceEchoField(Interface.PleuraWall, cosI, 1, IFACE_SHIFT_MM, K0), 12);
      for (const d of [0.05, 0.14, 0.3]) {
        expect(series(d)).toBeLessThan(series(0));
        expect(series(d)).toBeCloseTo(series(-d), 12);
      }
    }
  });
});

/** Transmisión de una vía al cuadrado (ida y vuelta) de una pared con atenuación uniforme: T(0) = 1. */
const wallT = (tD: number, D: number) => (d: number) => tD ** (Math.min(d, D) / D);

/**
 * Todos los caminos acústicos, uno a uno, entre la cara de la sonda (F, reflexión R_t, que también recibe), un
 * dispersor a la distancia d (una sola retrodispersión, amplitud 1: la f de la pared va aparte) y la pleura a D
 * (reflexión coherente R_p·χ), con la transmisión de una vía de cada tramo (√T). Una onda baja o sube; al subir
 * a la cara, o se recibe o se refleja. Devuelve, por familia (espejo: el dispersor iluminado desde abajo;
 * directa: desde arriba), la suma de las amplitudes de los caminos que llegan a la profundidad aparente s (la
 * mitad del recorrido), con a lo sumo `maxP` rebotes en la pleura.
 */
function enumeratePaths(s: number, d: number, D: number, tD: number, chi: number, T: (x: number) => number, maxP = 10) {
  const rp = PLEURA_RP * chi;
  const leg = (a: number, b: number) => Math.sqrt(T(Math.max(a, b)) / T(Math.min(a, b)));
  const sum = { mirror: 0, forward: 0 };
  const tol = 1e-6;
  // pos: profundidad actual (0 cara, d dispersor, D pleura); down: sentido; len: recorrido; amp; kind: familia
  const walk = (pos: number, down: boolean, len: number, amp: number, pBounces: number, kind: 'mirror' | 'forward' | null): void => {
    if (len / 2 > s + tol || pBounces > maxP) return;
    if (down) {
      // bajando desde pos: primero el dispersor (si está debajo), luego la pleura
      if (pos < d) {
        // retrodispersión en d (iluminado desde arriba: la copia directa) o pasa de largo
        if (kind === null) walk(d, false, len + (d - pos), amp * leg(pos, d), pBounces, 'forward');
        walk(d, true, len + (d - pos), amp * leg(pos, d), pBounces, kind);
        return;
      }
      walk(D, false, len + (D - pos), amp * leg(pos, D) * rp, pBounces + 1, kind);
      return;
    }
    // subiendo desde pos: primero el dispersor (si está encima), luego la cara
    if (pos > d) {
      if (kind === null) walk(d, true, len + (pos - d), amp * leg(d, pos), pBounces, 'mirror');
      walk(d, false, len + (pos - d), amp * leg(d, pos), pBounces, kind);
      return;
    }
    const atFace = amp * leg(0, pos);
    const L = len + pos;
    if (kind !== null && Math.abs(L / 2 - s) < tol) sum[kind] += atFace;
    walk(0, true, L, atFace * PLEURA_RT, pBounces, kind);
  };
  walk(0, true, 0, 1, 0, null);
  return sum;
}

describe('serie de reverberaciones bajo la pleura: amplitudes frente a los caminos', () => {
  it('cada muestra bajo la pleura recibe la copia espejo y la directa con la suma de todos sus caminos (espejo ×(n+1), directa ×(n+2))', () => {
    const rnd = rng(611);
    let checked = 0;
    const orders = new Set<number>();
    for (let t = 0; t < 1500; t++) {
      const D = 15 + 35 * rnd();
      const tD = 0.1 + 0.8 * rnd();
      const chi = pleuraCoherence(Math.cos(40 * deg * rnd()), K0);
      const T = wallT(tD, D);
      const s = D + 1e-3 + 4 * D * rnd();
      const series = pleuraTerms(s, D, tD, chi, T, Infinity).filter((x) => x.family !== 'pleura');
      expect(series.map((x) => x.family).sort()).toEqual(['forward', 'mirror']);
      for (const term of series) {
        // la suma de todos los caminos de igual retardo con el dispersor a esa distancia
        const paths = enumeratePaths(s, term.depth, D, tD, chi, T);
        expect(term.gain / paths[term.family as 'mirror' | 'forward'], `${term.family} n ${term.order}`).toBeCloseTo(1, 9);
        orders.add(term.order);
        checked++;
      }
    }
    expect(checked).toBe(3000);
    expect([...orders].sort()).toEqual([0, 1, 2, 3]);
    // la cuenta de caminos: con n idas y vueltas más, n + 1 en el espejo y n + 2 en la directa
    const D = 27;
    const T = wallT(0.4, D);
    const chi = pleuraCoherence(1, K0);
    for (const n of [0, 1, 2]) {
      const s = (n + 1.5) * D;
      const { mirror, forward } = enumeratePaths(s, 0.5 * D, D, 0.4, chi, T);
      const G = pleuraRoundTrip(0.4, chi);
      expect(mirror / ((((PLEURA_RP * chi) ** 2 * 0.4 ** 2) / T(0.5 * D)) * G ** n)).toBeCloseTo(n + 1, 9);
      expect(forward / (T(0.5 * D) * G ** (n + 1))).toBeCloseTo(n + 2, 9);
    }
  });

  it('las líneas A son las réplicas del eco pleural: la copia directa con d = D, a kD, con G^(k−1)', () => {
    for (const D of [18, 27.3, 41]) {
      const tD = 0.34;
      const chi = pleuraCoherence(1, K0);
      const G = pleuraRoundTrip(tD, chi);
      expect(G).toBeCloseTo(PLEURA_RP * chi * PLEURA_RT * tD, 12);
      for (let k = 1; k <= 6; k++) {
        const s = k * D; // el pico del perfil de la réplica k (centrado en su cruce, decisión 15 de lus-sim)
        const [p] = pleuraTerms(s, D, tD, chi, wallT(tD, D));
        expect(p.family).toBe('pleura');
        expect(p.order).toBe(k);
        expect(p.depth).toBeCloseTo(0, 9);
        expect(p.gain).toBeCloseTo(tD * G ** (k - 1), 12);
        // la réplica k es un camino de F_{k−2} con d = D (salvo el eco pleural directo, k = 1): la pleura no es un
        // dispersor aparte, así que las k posiciones de la «dispersión» son el mismo camino y cuenta una vez
        if (k >= 2) expect(aLineGain(G, k) * tD).toBeCloseTo(forwardGain(tD, G, k - 2) / k, 12);
      }
      // cada réplica pierde G (una ida y vuelta más): la k = 3 es más débil que la 2
      expect(aLineGain(G, 3)).toBeLessThan(aLineGain(G, 2));
    }
  });

  it('F-T04: al inclinar la pleura, la línea A de orden k se apaga antes que la k − 1 y la línea pleural dura más que todas', () => {
    // Cada ida y vuelta pleura–cara solo vuelve por la línea con el lóbulo de Kirchhoff de la pleura (decisión 36): la cara de
    // la sonda es lisa y su normal es la línea, así que la réplica k paga el lóbulo k veces y la línea pleural una
    // (`docs/knowledge/physics.md` §2.3, «Efecto del ángulo», y §3.3, T04)
    const s = INTERFACES[Interface.PleuraWall].slopeRms;
    const D = 27;
    const tD = 0.34;
    expect(pleuraRoundTripLobe(1)).toBeCloseTo(1, 12);
    let prev: number[] = [];
    for (const a of [0, 2, 5, 8, 12, 16, 20]) {
      const c = Math.cos(a * deg);
      const lobe = pleuraRoundTripLobe(c);
      expect(lobe).toBeCloseTo(facetLobe(c, s) / facetLobe(1, s), 12);
      const chi = pleuraCoherence(c, K0);
      // el nivel de la réplica k (k = 1, la línea pleural) en su cruce, con el lóbulo de la línea pleural (el eco de la cara)
      const level = [1, 2, 3, 4].map(
        (k) => pleuraTerms(k * D, D, tD, chi, wallT(tD, D), Infinity, lobe)[0].gain * pleuraSeriesEcho(c, 0, K0),
      );
      if (prev.length) {
        // todo se apaga al inclinar, y cuanto más alto el orden, más deprisa: la caída de k frente a 0° crece con k
        const drop = level.map((v, i) => db(v) - db(prev[i]));
        for (let k = 1; k < 4; k++) expect(drop[k]).toBeLessThan(drop[k - 1] + 1e-9);
      }
      prev = level;
      if (a === 0) continue;
      // frente a 0°, la caída de la línea pleural es la menor (persiste más) y la réplica k cae k veces la de una ida y vuelta
      const level0 = [1, 2, 3, 4].map(
        (k) => pleuraTerms(k * D, D, tD, pleuraCoherence(1, K0), wallT(tD, D), Infinity, 1)[0].gain * pleuraSeriesEcho(1, 0, K0),
      );
      const rel = level.map((v, i) => db(v) - db(level0[i]));
      for (let k = 2; k <= 4; k++) expect(rel[k - 1]).toBeLessThan(rel[k - 2]);
    }
    // sin el lóbulo en la serie (el modelo de antes) la caída con el ángulo es la misma en todos los órdenes: la meta falla
    const c = Math.cos(12 * deg);
    const flat = [1, 2, 3].map(
      (k) =>
        db(pleuraTerms(k * D, D, tD, pleuraCoherence(c, K0), wallT(tD, D), Infinity, 1)[0].gain * pleuraSeriesEcho(c, 0, K0)) -
        db(pleuraTerms(k * D, D, tD, pleuraCoherence(c, K0), wallT(tD, D), Infinity, 1)[0].gain * pleuraSeriesEcho(1, 0, K0)),
    );
    expect(flat[2] - flat[0]).toBeCloseTo(0, 9);
    // a 12° (la tabla de la pleura parietal: s = 0,15) cada ida y vuelta pierde 3–6 dB; a 20°, más de 10
    expect(db(pleuraRoundTripLobe(Math.cos(12 * deg)))).toBeLessThan(-3);
    expect(db(pleuraRoundTripLobe(Math.cos(12 * deg)))).toBeGreaterThan(-6);
    expect(db(pleuraRoundTripLobe(Math.cos(20 * deg)))).toBeLessThan(-10);
    expect(PLEURA_GLSL).toContain(
      'float pleuraRoundTripLobe(float cosI) { float c2 = max(cosI * cosI, 1e-6); return exp(-(1.0 - c2) / c2 * uIface[IF_PLEURA_WALL].z) / c2; }',
    );
  });

  it('sin doble eco pleural: la pleura sale una sola vez en cada réplica y las copias de la pared no la llevan', () => {
    const D = 27.3;
    const tD = 0.34;
    const T = wallT(tD, D);
    const dr = 180 / 1024;
    const chi = pleuraCoherence(1, K0);
    const G = pleuraRoundTrip(tD, chi);
    for (let k = 1; k <= 4; k++) {
      // la integral del perfil de las réplicas en ±2 mm de kD: tD·G^(k−1) × la integral de una cara (una vez)
      let sum = 0;
      let unit = 0;
      for (let s = k * D - 2; s <= k * D + 2; s += dr / 16) {
        for (const x of pleuraTerms(s, D, tD, chi, T, Infinity))
          if (x.family === 'pleura') sum += x.gain * pleuraSeriesEcho(1, x.depth, K0) * (dr / 16);
        unit += pleuraSeriesEcho(1, k * D - s, K0) * (dr / 16);
      }
      expect(sum / (unit * tD * G ** (k - 1))).toBeCloseTo(1, 6);
    }
    // la copia espejo nunca muestrea la pleura: sus distancias están en [0, D) y cerca de kD caen en la piel
    for (let s = D + 0.01; s < 5 * D; s += 0.37) {
      const m = pleuraTerms(s, D, tD, chi, T, Infinity).find((x) => x.family === 'mirror')!;
      expect(m.depth).toBeGreaterThanOrEqual(0);
      expect(m.depth).toBeLessThanOrEqual(D);
    }
    // la GLSL: el eco de la pleura parietal solo en la réplica (además de su #define); la pared remuestreada no
    // lo dibuja
    for (const src of [FRAG_RAWFIELD, FRAG_RAWFIELD_STEERED]) {
      const code = src.replace(/\/\/.*$/gm, '');
      // el #define, la coherencia de su reflexión especular (su fila de uIface) y el eco de la réplica, centrado en su
      // cruce (pleuraSeriesEcho: la cara y si es de un lado, decisión 15 de lus-sim)
      // y, lus-sim (decisión 36), la pendiente de su cara en el lóbulo de cada ida y vuelta (pleuraRoundTripLobe)
      expect(code.match(/IF_PLEURA_WALL/g)?.length).toBe(5);
      expect(code.match(/interfaceProfileEcho\(IF_PLEURA_WALL,/g)?.length).toBe(1);
      expect(code.match(/pleuraSeriesEcho\(cosI, k \* (D|sD) - (r|s)\)/g)?.length).toBe(1);
    }
    // el gemelo GLSL de pleuraSeriesEcho: el desplazamiento de la cara de un lado, deshecho
    expect(PLEURA_GLSL).toContain(
      'return interfaceProfileEcho(IF_PLEURA_WALL, cosI, 1.0, delta + (uIface[IF_PLEURA_WALL].w > 0.5 ? 0.0 : IFACE_SHIFT));',
    );
    const wall = PLEURA_GLSL.slice(PLEURA_GLSL.indexOf('vec2 wallField('));
    expect(wall).not.toMatch(/IF_PLEURA_WALL|pleuraEcho/);
  });

  it('la cota del campo de la pared cubre el moteado y la cara más brillante de la copia (decisión 62)', () => {
    // la cara de la pared más brillante en su copia: su pico en incidencia y profundidad, con su variación máxima
    // a lo largo de la cara, por el tope del rango de WALL_COPY_FACE_GAIN, a 2 MHz (la frecuencia B más baja)
    const k0 = (2 * Math.PI) / (1540 / 2000);
    let peak = 0;
    for (let f = FIRST_WALL_INTERFACE; f <= LAST_WALL_INTERFACE; f++) {
      let pk = 0;
      for (let c = 0.05; c <= 1.0001; c += 0.01) for (let d = -1; d <= 1; d += 0.01) pk = Math.max(pk, interfaceEchoField(f, c, 1, d, k0));
      peak = Math.max(peak, pk * Math.exp(0.5 * WALL_TEXTURE.faceVariation[f - FIRST_WALL_INTERFACE]));
    }
    expect(PLEURA_WALL_FIELD_BOUND).toBeGreaterThanOrEqual(1.4 * 3 + WALL_COPY_FACE_GAIN_RANGE[1] * peak);
    expect(WALL_COPY_FACE_GAIN).toBeGreaterThanOrEqual(WALL_COPY_FACE_GAIN_RANGE[0]);
    expect(WALL_COPY_FACE_GAIN).toBeLessThanOrEqual(WALL_COPY_FACE_GAIN_RANGE[1]);
  });

  it('la serie se trunca bajo la décima del ruido del receptor (órdenes 2–5 con la pared y la pleura de la tabla)', () => {
    const chi = pleuraCoherence(1, K0);
    for (const tD of [0.2, 0.34, 0.6]) {
      const D = 27;
      let last = -1;
      for (let s = D + 0.1; s < 20 * D; s += 0.25) {
        const terms = pleuraTerms(s, D, tD, chi, wallT(tD, D));
        const m = terms.find((x) => x.family === 'mirror');
        if (m) last = Math.max(last, m.order);
      }
      const G = pleuraRoundTrip(tD, chi);
      expect(G ** last * tD * PLEURA_WALL_FIELD_BOUND).toBeGreaterThan(PLEURA_SERIES_FLOOR);
      expect(G ** (last + 1) * tD * PLEURA_WALL_FIELD_BOUND).toBeLessThanOrEqual(PLEURA_SERIES_FLOOR);
      expect(last).toBeGreaterThanOrEqual(2);
      expect(last).toBeLessThanOrEqual(5);
    }
  });

  it('cada reflexión de la pleura en la serie es la coherente, R_p·χ: la misma χ de Ament que da el nivel de la línea', () => {
    const p = INTERFACES[Interface.PleuraWall];
    for (const a of [0, 10, 25, 40]) {
      const c = Math.cos(a * deg);
      expect(pleuraCoherence(c, K0)).toBeCloseTo(roughnessCoherence(c, p.roughnessMm, K0), 12);
    }
    // la parte coherente de la pleura parietal a 0°: −8 a −10 dB (la del diafragma, −28,7)
    expect(db(pleuraCoherence(1, K0))).toBeGreaterThan(-10);
    expect(db(pleuraCoherence(1, K0))).toBeLessThan(-8);
    expect(PLEURA_GLSL).toContain(
      'float pleuraCoherence(float cosI) { float x = uIface[IF_PLEURA_WALL].y * cosI; return exp(-0.5 * x * x); }',
    );
    // R_t como uniform (lus-sim, decisión 35: `uPleuraRt`, el valor del registro salvo en el barrido de calibración)
    // y el lóbulo de la pleura en cada ida y vuelta (decisión 36)
    expect(PLEURA_GLSL).toContain(
      'float pleuraRoundTrip(float tD, float chi, float lobe) { return PLEURA_RP * chi * uPleuraRt * tD * lobe; }',
    );
    for (const src of [FRAG_RAWFIELD, FRAG_RAWFIELD_STEERED]) {
      expect(src).toContain('float chi = pleuraCoherence(cosI);');
      expect(src).toContain('float G = pleuraRoundTrip(tD, chi, pleuraRoundTripLobe(cosI));');
      // los pesos de la descomposición de la neblina (decisión 36: 1 salvo en `calibrationOverride({ seriesParts })`)
      expect(src).toContain(
        'air += f * (j == 1 ? uSeriesParts.x * (ser.x + 1.0) * PLEURA_RP * PLEURA_RP * chi * chi * tD * tD / max(td, 1e-6) * gn : uSeriesParts.y * (ser.x + 2.0) * td * G * gn);',
      );
    }
  });

  it('la transmisión hasta la pleura se lee en la última fila de A sin gas (sin mezclar la pérdida del pulmón)', () => {
    const step = 180 / 160;
    for (let D = 5; D < 60; D += 0.013) {
      const cap = pleuraCapMm(D, step);
      // el centro de la fila tope está por encima de D (su segmento no es pulmón) y a menos de 1,5 filas
      expect(cap).toBeLessThan(D);
      expect(D - cap).toBeLessThanOrEqual(1.5 * step + 1e-9);
      // la fila siguiente ya tiene su centro en la pleura o por debajo
      expect(cap + step).toBeGreaterThanOrEqual(D - 1e-9);
    }
  });
});

describe('borde blando de la cortina: fracción de aire del haz', () => {
  it('Φ de Abramowitz y Stegun a < 2·10⁻⁷ de los valores tabulados', () => {
    const table: [number, number][] = [
      [0, 0.5],
      [1, 0.8413447461],
      [-1, 0.1586552539],
      [1.2815516, 0.9],
      [-1.2815516, 0.1],
      [1.959964, 0.975],
      [-3.0902323, 0.001],
      [3.5, 0.9997673709],
    ];
    for (const [x, p] of table) expect(Math.abs(normalCdf(x) - p), `Φ(${x})`).toBeLessThan(2e-7);
  });

  it('σ² = (σe·e_z)² + (σl·l_z)² + σ_taper²; f(0) = ½, monótona, 10⁻³ a −3,09σ y ancho 10–90 % de 2,56σ', () => {
    expect(curtainEdgeSigmaMm(0, 0, 0, 0)).toBe(CURTAIN_TAPER_MM);
    expect(curtainEdgeSigmaMm(3, 4, 1, 1, 0)).toBeCloseTo(5, 12);
    expect(curtainEdgeSigmaMm(3, 4, 0.5, 0, 0)).toBeCloseTo(1.5, 12);
    const sg = 4.2;
    expect(curtainAirFraction(0, sg)).toBeCloseTo(0.5, 7);
    let prev = 0;
    for (let dz = -20; dz <= 20; dz += 0.1) {
      const f = curtainAirFraction(dz, sg);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(curtainAirFraction(-3.0902323 * sg, sg)).toBeCloseTo(CURTAIN_MIN_AIR, 5);
    const x10 = -1.2815516 * sg;
    expect(curtainAirFraction(x10, sg)).toBeCloseTo(0.1, 6);
    expect(edgeWidth1090Mm(sg)).toBeCloseTo(2 * 1.2815516 * sg, 9);
    // A0 registra la pleura bastante antes de que el aire importe: con el σ más ancho de la imagen (σ_taper 5)
    const widest = curtainEdgeSigmaMm(elevSigmaMm(0, CONVEX_C35.elevationFocusMm) * Math.SQRT1_2, 1.5, 1, 1, 5);
    expect(curtainAirFraction(-CURTAIN_RECORD_MM, widest)).toBeLessThan(CURTAIN_MIN_AIR);
  });

  it('en las vistas con cortina el borde mide 5–15 mm (10–90 %) y baja con la inspiración', () => {
    const scene = new AnatomyScene(defaultPatient());
    for (const id of ['intercostal', 'flank'] as const) {
      const fr = probeFrame(LOWER_VIEWS[id], scene.torso, CONVEX_C35);
      for (let i = 0; i < CONVEX_C35.lines; i += 16) {
        const th = -CONVEX_C35.halfSector + (2 * CONVEX_C35.halfSector * (i + 0.5)) / CONVEX_C35.lines;
        const dir = lineDirection(fr, th);
        const lat = normalize(cross(fr.elevation, dir));
        for (const D of [20, 30, 50]) {
          const sg = curtainEdgeSigmaMm(
            elevSigmaMm(D, CONVEX_C35.elevationFocusMm) * Math.SQRT1_2,
            lateralSigmaMm(D, 90, CONVEX_BEAM),
            fr.elevation[2],
            lat[2],
          );
          expect(edgeWidth1090Mm(sg), `${id} línea ${i} D ${D}`).toBeGreaterThanOrEqual(5);
          expect(edgeWidth1090Mm(sg), `${id} línea ${i} D ${D}`).toBeLessThanOrEqual(15);
        }
      }
    }
    // el borde sigue al descenso de la cortina: 10 mm de respiración tranquila mueven dz 10 mm
    const m: Vec3 = [-120, 10, 5];
    const inst = (caudal: number) => ({ diaphragmCaudalMm: caudal });
    expect(scene.lungEdgeMm(m, inst(10))! - scene.lungEdgeMm(m, inst(0))!).toBeCloseTo(10, 9);
    // lus-sim (decisión 18): en los dos hemitórax (en VExUS, la huella de la pleura llegaba a la línea media, decisión 71)
    expect(scene.lungEdgeMm([120, 10, 5], inst(0))).toBeCloseTo(5 - lungEdgeZ(scene.lungBorder, wallArc([120, 10, 5], scene.torso), 0), 9);
    expect(scene.lungEdgeMm([-60, 90, 20], inst(0))).not.toBeNull();
    // el borde de la columna: el del pulmón en FRC menos el descenso (sin pasar de la reflexión pleural)
    expect(scene.lungEdgeMm(m, inst(0))).toBeCloseTo(5 - lungEdgeZ(scene.lungBorder, wallArc(m, scene.torso), 0), 9);
    expect(ANATOMY_GLSL).toContain('return m.z - lungEdgeZ(wallArc(m));');
    expect(ANATOMY_GLSL).toContain('float lungEdgeZ(float u) { vec4 b = lungBorderAt(u); return max(b.y, b.x - uCurtain.x); }');
  });

  it('la GLSL calcula la fracción con el haz de dos vías y lo que ve del tejido de detrás con 1 − f', () => {
    expect(PLEURA_GLSL).toContain(
      'return normalCdf(dz / curtainEdgeSigmaMm(elevSigma(dRow) * 0.70710678, lateralSigmaMm(dRow), uElev.z, lat.z));',
    );
    expect(PLEURA_GLSL).toContain('return sqrt(se2 * se2 * ez * ez + sl * sl * lz * lz + CURTAIN_TAPER_MM * CURTAIN_TAPER_MM);');
    for (const src of [FRAG_RAWFIELD, FRAG_RAWFIELD_STEERED]) {
      expect(src).toContain('float wTissue = under ? 1.0 - fAir : 1.0;');
      expect(src).toContain('out2 += air * (fAir * coupling);');
      expect(src).toContain('out2 = tissue * wTissue;');
    }
  });
});

const caliberOf = (caudal: number): SceneInstant => ({ diaphragmCaudalMm: caudal });

describe('clasificación sin la cortina (gemelo de classifyWith(m, false))', () => {
  it('es classify en todas partes salvo en la lámina de pulmón, donde da lo que hay detrás', () => {
    const scene = new AnatomyScene(defaultPatient());
    const rnd = rng(612);
    let curtain = 0;
    let other = 0;
    for (const caudal of [0, 10, 30]) {
      const cal = caliberOf(caudal);
      for (let t = 0; t < 4000; t++) {
        // la mitad de los puntos en la lámina bajo la pared del seno costofrénico (lus-sim, decisión 18: alrededor de todo el
        // tronco); el resto en todo el tronco
        let m: Vec3;
        if (t % 2 === 0) {
          const phi = Math.PI * (-1 + 2 * rnd());
          const z = -60 + 120 * rnd();
          const inset = scene.wallThicknessAt(torsoSkinPoint(phi, z, scene.torso)) + 4 * rnd() - 0.5;
          const k = 1 - inset / 150;
          m = [scene.torso.a * k * Math.cos(phi), scene.torso.b * k * Math.sin(phi), z];
        } else m = [-170 + 340 * rnd(), -110 + 220 * rnd(), -200 + 300 * rnd()];
        const a = scene.classify(m, cal);
        const b = scene.classify(m, cal, false);
        const inCurtain = a.tissue === Tissue.Lung && scene.inLungCurtain(m, cal);
        if (inCurtain) {
          curtain++;
          // lo de detrás (lus-sim, decisión 18: la lámina cubre toda la pleura, así que no hay instante sin ella con que
          // compararla): sobre la cúpula, el pulmón del tórax (o el corazón); bajo ella, el diafragma (el de la cúpula junto al
          // borde, o el de la ZOA, que engruesa al inspirar) o el «resto» (en VExUS, el hígado)
          if (sdDiaphragm(m, scene.diaphragm, scene.torso) < 0) expect([Tissue.Lung, Tissue.Myocardium, Tissue.Blood]).toContain(b.tissue);
          else expect([Tissue.Diaphragm, Tissue.Bowel]).toContain(b.tissue);
        } else {
          other++;
          expect(b).toEqual(a);
        }
      }
    }
    expect(curtain).toBeGreaterThan(1000);
    expect(other).toBeGreaterThan(5000);
  });

  it('la GLSL: classify es classifyWith(m, true) y la cortina solo se mira con withCurtain', () => {
    expect(ANATOMY_GLSL).toContain('Cls classify(vec3 m) { return classifyWith(m, true); }');
    expect(ANATOMY_GLSL).toMatch(/if \(withCurtain\) \{\n\s+float dCurtain = lungCurtainDistance\(m, inside, u\);/);
    expect(ANATOMY_GLSL).toContain('float insideWallMm(vec3 m) { return -torsoDepth(m) - wallTotalMm(m); }');
    // el tejido que se ve a través del borde y sus planos laterales usan la variante bajo la pleura (la muestra de
    // la imagen); la pared que copia la serie, el prefijo de la pared de classify (classifyWall: piel, costillas y
    // las capas de la decisión 62, sin órganos ni tubos), con el eco de cara plana de sus capas (wallFaceEchoFlat,
    // sin faceGradient) y, pasada la cara interna, la capa más honda
    expect(PLEURA_GLSL).toContain('Cls c = classifyWith(m, withCurtain);');
    expect(PLEURA_GLSL).toContain('vec2 f1 = sampleSide(p + uElev * se, se, c, withCurtain, w);');
    expect(FRAG_RAWFIELD).toContain('vec2 tissue = wTissue >= CURTAIN_MIN_AIR ? mediumField(p, dir, r, elevSigma(r), !under) : vec2(0.0);');
    expect(FRAG_RAWFIELD_STEERED).toContain('vec2 f1 = sampleSidePh(p + uElev * se, se, c, ph0, g, withCurtain, w);');
    expect(FRAG_RAWFIELD_STEERED).toContain('tissue = mediumFieldPh(p, dir, s, elevSigma(r), !under, lookPhase(rho, alpha, a, uSteer.w)');
    expect(ANATOMY_GLSL).toContain('float wall;\n  float u;\n  if (classifyWall(m, c, depth, tn, wall, u)) return c;');
    expect(PLEURA_GLSL).toContain('if (!classifyWall(m, c, depth, tn, wallMm, wallU)) { c.tissue = T_FAT; c.n = tn; }');
    expect(PLEURA_GLSL).toContain('return field + vec2(WALL_COPY_FACE_GAIN * wallFaceEchoFlat(c, m, dir, w), 0.0);');
    expect(FRAG_RAWFIELD).toContain('vec2 f = wallField(pointOnLine(dir0, d), dir0, elevSigma(d), wD);');
    expect(FRAG_RAWFIELD_STEERED).toContain(
      'vec2 f = wallFieldPh(elem + dirK * d, dirK, elevSigma(rhoJ - uCurvR), lookPhase(rhoJ, alJ, a, uSteer.w)',
    );
  });
});

describe('deslizamiento pulmonar anclado al pulmón', () => {
  const scene = new AnatomyScene(defaultPatient());
  // puntos de la pleura parietal del receso (cara interna de la pared) en una franja craneocaudal
  const pleuraPoints = (n: number, seed: number): Vec3[] => {
    const rnd = rng(seed);
    return Array.from({ length: n }, () => {
      const phi = Math.PI * (0.85 + 0.3 * rnd());
      const z = -30 + 60 * rnd();
      const k = 1 - scene.wallThicknessAt(torsoSkinPoint(phi, z, scene.torso)) / 150;
      return [scene.torso.a * k * Math.cos(phi), scene.torso.b * k * Math.sin(phi), z] as Vec3;
    });
  };
  const corr = (a: number[], b: number[]) => {
    const ma = a.reduce((s, x) => s + x, 0) / a.length;
    const mb = b.reduce((s, x) => s + x, 0) / b.length;
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    for (let i = 0; i < a.length; i++) {
      sab += (a[i] - ma) * (b[i] - mb);
      saa += (a[i] - ma) ** 2;
      sbb += (b[i] - mb) ** 2;
    }
    return sab / Math.sqrt(saa * sbb);
  };
  const env = (p: Vec3, caudal: number, h: number) => {
    const f = slidingField(p, torsoNormal(p, scene.torso), caudal, h, 3.1);
    return Math.hypot(f[0], f[1]);
  };

  it('la misma fase respiratoria da la misma neblina; otra fase, otra (el pulmón ha bajado)', () => {
    const pts = pleuraPoints(3000, 613);
    for (const h of [2, 4, 6]) {
      const a = pts.map((p) => env(p, 12, h));
      const same = pts.map((p) => env(p, 12, h));
      expect(same).toEqual(a);
      // 5 mm de descenso: más que el grano a lo largo de la pleura; la correlación de la envolvente cae
      const moved = pts.map((p) => env(p, 17, h));
      expect(corr(a, moved)).toBeLessThan(0.2);
      // y el mismo pulmón visto en otro punto: el punto que baja con él conserva su neblina
      const followed = pts.map((p) => env([p[0], p[1], p[2] - 5], 17, h));
      expect(corr(a, followed)).toBeGreaterThan(0.999);
    }
  });

  it('grano alargado a lo largo de la pleura (≥ 3 veces más largo que hondo) y nivel −8 a −12 dB con caída 10–20 mm', () => {
    expect(SLIDING_LAT_MM / SLIDING_AX_MM).toBeGreaterThanOrEqual(3);
    expect(SLIDING_DB).toBeGreaterThanOrEqual(-12);
    expect(SLIDING_DB).toBeLessThanOrEqual(-8);
    expect(SLIDING_EFOLD_MM).toBeGreaterThanOrEqual(10);
    expect(SLIDING_EFOLD_MM).toBeLessThanOrEqual(20);
    // el campo va SLIDING_PSF_GAIN_DB por debajo: la imagen lo muestra a SLIDING_DB (medido en pleuraTwin.test.ts)
    expect(slidingAmplitude(0)).toBeCloseTo(10 ** ((SLIDING_DB - SLIDING_PSF_GAIN_DB) / 20), 12);
    expect(slidingAmplitude(SLIDING_EFOLD_MM) / slidingAmplitude(0)).toBeCloseTo(Math.exp(-1), 12);
    // correlación de la envolvente a 0,5 mm: a lo largo de la pleura alta, en profundidad baja
    const pts = pleuraPoints(3000, 614);
    const base = pts.map((p) => env(p, 0, 3));
    const alongZ = pts.map((p) => env([p[0], p[1], p[2] + 0.5], 0, 3));
    const deeper = pts.map((p) => env(p, 0, 3.5));
    expect(corr(base, alongZ)).toBeGreaterThan(0.8);
    expect(corr(base, deeper)).toBeLessThan(0.5);
    // la retícula: la z del pulmón (z + descenso) a escala del grano lateral y h hacia dentro a la del axial
    const q = slidingLattice([-120, 10, 5], [-1, 0, 0], 7, 2);
    expect(q[0]).toBeCloseTo(-120 / SLIDING_LAT_MM + 2 / SLIDING_AX_MM, 12);
    expect(q[2]).toBeCloseTo((5 + 7) / SLIDING_LAT_MM, 12);
    // lus-sim (decisión 19): lo que ha bajado el pulmón de su altura y su columna (en VExUS, z0 − uCurtain.x, el descenso de
    // la cortina en todo el tórax)
    expect(PLEURA_GLSL).toContain('vec3 q = (m + vec3(0.0, 0.0, lungSlideMm(m))) / SLIDING_LAT_MM - torsoNormal(m) * (h / SLIDING_AX_MM);');
  });
});

/**
 * A0 de antes de la decisión 61 (la de la decisión 57): el primer pulmón, sea el de la cortina o el del tórax,
 * es el espejo. Referencia para comprobar que el espejo del diafragma no cambia.
 */
function hitsBefore61(q: HitsLineQuery, origin: Vec3, dir0: Vec3, depthMm: number, coarseN: number): Omit<HitsLine, 'pleura' | 'bone'> {
  const step = depthMm / coarseN;
  const at = (p0: Vec3, d: Vec3, r: number): Vec3 => [p0[0] + d[0] * r, p0[1] + d[1] * r, p0[2] + d[2] * r];
  let dir: Vec3 = dir0;
  let hitPoint = origin;
  let hitR = 0;
  let mirrorSeg = -1;
  let gasSeg = -1;
  let boneSeg = -1;
  let gasKind = 0;
  let entered = false;
  for (let s = 0; s < coarseN; s++) {
    const r = (s + 0.5) * step;
    const p = mirrorSeg >= 0 ? at(hitPoint, dir, r - hitR) : at(origin, dir0, r);
    const c = q.at(p);
    if (c.tissue === Tissue.Air && !entered) continue;
    entered = true;
    if (TISSUES[c.tissue].gas) {
      if (c.tissue === Tissue.Lung && mirrorSeg < 0) {
        let nn = c.normal;
        hitR = mirrorCrossing(
          (x) => {
            const cm = q.at(at(origin, dir, x));
            if (cm.tissue === Tissue.Lung) nn = cm.normal;
            return cm.tissue === Tissue.Lung;
          },
          r,
          step,
          MIRROR_BISECTION_STEPS,
        );
        mirrorSeg = s;
        hitPoint = at(origin, dir, hitR);
        if (nn[0] * dir[0] + nn[1] * dir[1] + nn[2] * dir[2] > 0) nn = [-nn[0], -nn[1], -nn[2]];
        const dd = dir[0] * nn[0] + dir[1] * nn[1] + dir[2] * nn[2];
        dir = [dir[0] - 2 * dd * nn[0], dir[1] - 2 * dd * nn[1], dir[2] - 2 * dd * nn[2]];
        if (gasSeg < 0) {
          gasSeg = s;
          gasKind = 1;
        }
        continue;
      }
      if (gasSeg < 0) {
        gasSeg = s;
        gasKind = 2;
      }
      continue;
    }
    if (TISSUES[c.tissue].bone && boneSeg < 0) boneSeg = s;
  }
  return { mirrorSeg, gasSeg, boneSeg, gasKind, mirrorR: hitR, dir };
}

/** Consulta de A0 sobre la escena real (sin deformación: la pared y la cortina no se mueven con ella). */
function sceneQuery(scene: AnatomyScene, cal: SceneInstant): HitsLineQuery {
  return {
    at: (p) => {
      const c = scene.classify(p, cal);
      const normal = c.tissue === Tissue.Lung ? (scene.faceGradient(p, cal, 'dome')?.normal ?? [0, 0, 1]) : c.boundaryNormal;
      return { tissue: c.tissue, normal, curtain: c.tissue === Tissue.Lung && scene.inLungRecess(p) };
    },
    behind: (p) => scene.classify(p, cal, false).tissue,
    insideWall: (p) => scene.insideWallMm(p),
    curtainEdge: (p) => scene.lungEdgeMm(p, cal),
  };
}

describe('A0: la pleura parietal es su propio tipo (3) y el espejo del diafragma no cambia', () => {
  const scene = new AnatomyScene(defaultPatient());
  const fB = 3.0;
  const dbOf = (t: Tissue, step: number) => segmentDb(t, step, fB);
  const depth = 180;
  const N = 160;
  const frames: { id: string; fr: ProbeFrame }[] = [];
  for (const id of ['intercostal', 'flank', 'subxiphoid'] as const) {
    const sp = LOWER_VIEWS[id];
    for (const rock of [0, -0.35, 0.35])
      frames.push({ id: `${id}${rock}`, fr: probeFrame({ ...sp, rock: sp.rock + rock }, scene.torso, CONVEX_C35) });
  }

  /**
   * Primer y último segmento de pulmón del receso en el camino recto: el que toca la pared (la cortina o el
   * tórax por encima de la inserción) y el que le sigue pegado; un camino que roza la cúpula puede tener
   * varios tramos. Se para en el primer pulmón que no es del receso (el espejo del diafragma). −1 sin él. Con la
   * pleura registrada en `D`, un tramo solo empieza pegado a ella (decisión 62: a ≤ `CURTAIN_CONTIGUOUS_SEGMENTS`);
   * el pulmón del receso más hondo es el espejo.
   */
  const curtainRunOf = (q: HitsLineQuery, fr: ProbeFrame, th: number, step: number, D = Infinity): { first: number; last: number } => {
    let first = -1;
    let last = -1;
    let run = false;
    for (let s = 0; s < N; s++) {
      const c = q.at(pointOnLine(fr, CONVEX_C35, th, (s + 0.5) * step));
      run = c.tissue === Tissue.Lung && (run || (c.curtain && s * step <= D + CURTAIN_CONTIGUOUS_SEGMENTS * step));
      if (run) {
        if (first < 0) first = s;
        last = s;
      } else if (c.tissue === Tissue.Lung) break;
    }
    return { first, last };
  };

  it('pared torácica anterior derecha (decisión 71): el pulmón bajo la pared es pleura con líneas A, no el espejo', () => {
    // Antes la huella del receso era solo lateral y posterior (x ≤ −45, y ≤ 40): con la sonda en un espacio intercostal
    // anterior el pulmón bajo la pared se dibujaba como el espejo del diafragma, sin línea pleural ni líneas A
    const cal = caliberOf(0);
    const q = sceneQuery(scene, cal);
    const step = depth / N;
    let lines = 0;
    let pleuraLines = 0;
    for (const phi of [0.58 * Math.PI, 0.64 * Math.PI])
      for (const z of [30, 45]) {
        const fr = probeFrame({ phi, z, lift: 0, yaw: 0, rock: 0, tilt: 0 }, scene.torso, CONVEX_C35);
        for (let i = 0; i < CONVEX_C35.lines; i += 4) {
          const th = -CONVEX_C35.halfSector + (2 * CONVEX_C35.halfSector * (i + 0.5)) / CONVEX_C35.lines;
          const origin = pointOnLine(fr, CONVEX_C35, th, 0);
          const dir = lineDirection(fr, th);
          const got = transmissionHitsLine(q, origin, dir, depth, N, dbOf);
          // solo las líneas cuyo primer tejido tras la pared es pulmón (las costillas tapan algunas)
          const crossing = pleuraCrossingLine(q.insideWall, q.curtainEdge, origin, dir, depth, N);
          if (!crossing) continue;
          const run = curtainRunOf(q, fr, th, step, crossing.D);
          if (run.first < 0) continue;
          lines++;
          if (got.pleura && got.pleura.kind === CURTAIN_GAS_KIND) pleuraLines++;
        }
      }
    expect(lines).toBeGreaterThan(20);
    expect(pleuraLines).toBe(lines);
  });

  it('las líneas que cruzan la cortina: tipo 3 en el cruce exacto de la cara interna de la pared, sin espejo en ella', () => {
    let curtainLines = 0;
    let edgeLines = 0;
    let thoraxBehind = 0;
    for (const caudal of [0, 30]) {
      const cal = caliberOf(caudal);
      const q = sceneQuery(scene, cal);
      for (const { id, fr } of frames)
        for (let i = 0; i < CONVEX_C35.lines; i++) {
          const th = -CONVEX_C35.halfSector + (2 * CONVEX_C35.halfSector * (i + 0.5)) / CONVEX_C35.lines;
          const origin = pointOnLine(fr, CONVEX_C35, th, 0);
          const dir = lineDirection(fr, th);
          const got = transmissionHitsLine(q, origin, dir, depth, N, dbOf);
          const old = hitsBefore61(q, origin, dir, depth, N);
          const step = depth / N;
          // ¿pasa el camino recto por el pulmón del receso antes de cualquier espejo? (solo con su pleura registrada:
          // si el cruce de la pared cae fuera de la huella, el pulmón sigue siendo el espejo de siempre)
          const crossing = pleuraCrossingLine(q.insideWall, q.curtainEdge, origin, dir, depth, N);
          // y solo si ese pulmón empieza pegado al cruce (decisión 62): una línea que roza el borde y llega al pulmón
          // del receso mucho más hondo tiene el espejo de siempre
          const run = crossing ? curtainRunOf(q, fr, th, step, crossing.D) : { first: -1, last: -1 };
          const firstCurtain = run.first;
          const tag = `${id} línea ${i} descenso ${caudal}`;
          if (firstCurtain >= 0) {
            curtainLines++;
            expect(got.pleura, tag).not.toBeNull();
            const p = got.pleura!;
            expect(p.kind).toBe(CURTAIN_GAS_KIND);
            // el cruce exacto de la cara interna de la pared (bisección de 6 pasos: ≤ 0,009 mm en la línea)
            expect(Math.abs(scene.insideWallMm(pointOnLine(fr, CONVEX_C35, th, p.D))), tag).toBeLessThan(0.01);
            // el borde queda a menos de un segmento grueso del primer pulmón de la línea, que empieza pegado al cruce
            expect(p.dz, tag).toBeGreaterThan(-1.2);
            expect(run.first * step, tag).toBeLessThanOrEqual(p.D + step);
            // donde el cruce ya está en la cortina, el pulmón empieza ahí (sin costilla delante)
            if (p.dz > 0.1) expect(q.at(pointOnLine(fr, CONVEX_C35, th, p.D + 0.05)).tissue, tag).toBe(Tissue.Lung);
            // la decisión 57 ponía el espejo en la cortina; ahora no hay espejo en ella ni en el pulmón del tórax
            // pegado a ella (aire con aire), y el primer gas de h0 es el siguiente (intestino o el diafragma visto
            // desde el hígado)
            expect(old.mirrorSeg, tag).toBe(firstCurtain);
            expect(got.mirrorSeg < 0 || got.mirrorSeg > run.last + 1, tag).toBe(true);
            expect(got.gasSeg < 0 || got.gasSeg > run.last, tag).toBe(true);
            expect(p.curtainLast, tag).toBe(run.last);
            // ΔL: lo que el gas de la lámina cuesta de más frente al tejido de detrás, segmento a segmento
            let dL = 0;
            for (let s = run.first; s <= run.last; s++) {
              const pp = pointOnLine(fr, CONVEX_C35, th, (s + 0.5) * step);
              // entre dos tramos (un camino que roza la cúpula) puede haber diafragma: no es pulmón
              if (q.at(pp).tissue === Tissue.Lung) dL += GAS_DB_PER_CM * (step / 10) - dbOf(q.behind(pp), step);
            }
            expect(p.dL, tag).toBeCloseTo(dL, 9);
            // con el tórax detrás no cuesta nada de más (detrás también hay gas)
            if (q.behind(pointOnLine(fr, CONVEX_C35, th, (run.first + 0.5) * step)) !== Tissue.Lung) expect(p.dL, tag).toBeGreaterThan(5);
            else thoraxBehind++;
          } else {
            // sin cortina en el camino: h0 y h1 son los de antes, espejo del diafragma incluido
            expect(got.mirrorSeg, tag).toBe(old.mirrorSeg);
            expect(got.gasSeg, tag).toBe(old.gasSeg);
            expect(got.boneSeg, tag).toBe(old.boneSeg);
            expect(got.gasKind, tag).toBe(old.gasKind);
            expect(got.mirrorR, tag).toBe(old.mirrorR);
            expect(got.dir, tag).toEqual(old.dir);
            if (got.pleura) {
              edgeLines++;
              // cerca del borde por el lado del hígado: la pleura existe aunque el rayo central no dé en el pulmón
              // junto a la inserción del diafragma la cuña de pulmón bajo la pared es más fina que un segmento grueso
              expect(got.pleura.dz, tag).toBeLessThan(3);
              expect(got.pleura.dz, tag).toBeGreaterThan(-CURTAIN_RECORD_MM);
              expect(got.pleura.dL).toBe(0);
              expect(got.pleura.curtainLast).toBe(-1);
            }
          }
        }
    }
    expect(curtainLines).toBeGreaterThan(150);
    expect(edgeLines).toBeGreaterThan(20);
    expect(thoraxBehind).toBeGreaterThan(20);
  });

  // Decisión 62 (enmienda de la 61): la vista intercostal de la primera versión de la 62 (φ 0,98π, z 3, yaw −1,25,
  // basculada 0,2) tenía líneas que rozan el borde de la cortina en espiración (132–140; 93–111 basculada 0,55). A0 registraba su pleura con el volumen
  // parcial del borde (D 47–59 mm, f 0,12–0,35) y trataba como cortina el pulmón del receso posterior que la línea
  // alcanza 53–91 mm más hondo: sin espejo, ΔL 50–82 dB, y la pasada B quitaba así de 21 a 33 dB de atenuación al
  // hígado de en medio (una banda clara en la captura con GPU). Ese pulmón es el espejo del diafragma. lus-sim (decisión 18):
  // con el borde del pulmón de la base (53 mm más abajo en el flanco: la 8.ª costilla de la LAM), la misma vista 53 mm más
  // abajo (z −50). Lus-sim (decisión 28): con el tronco de 226 mm de profundidad, en z −50 solo 3 líneas rozaban el borde (no
  // porque baje: la 8.ª costilla de la LAM y el borde suben 1,5 mm; el plano es oblicuo y rasante y el flanco cambia de
  // curvatura, b²/a de 68,9 a 79,8 mm). En z −55, 56 y 46 líneas rasantes en las dos basculaciones; la aserción no cambia.
  it('una línea que roza el borde de la cortina y alcanza el pulmón del receso lejos de su pleura lo refleja (espejo, ΔL 0)', () => {
    const cal = caliberOf(0);
    const q = sceneQuery(scene, cal);
    const step = depth / N;
    let grazingLines = 0;
    for (const rock of [0.2, 0.55]) {
      const fr = probeFrame({ phi: Math.PI * 0.98, z: -55, lift: 0, yaw: -1.25, rock, tilt: 0 }, scene.torso, CONVEX_C35);
      for (let i = 0; i < CONVEX_C35.lines; i++) {
        const th = -CONVEX_C35.halfSector + (2 * CONVEX_C35.halfSector * (i + 0.5)) / CONVEX_C35.lines;
        const origin = pointOnLine(fr, CONVEX_C35, th, 0);
        const dir = lineDirection(fr, th);
        const crossing = pleuraCrossingLine(q.insideWall, q.curtainEdge, origin, dir, depth, N);
        if (!crossing) continue;
        const run = curtainRunOf(q, fr, th, step);
        if (run.first < 0 || (run.first + 0.5) * step - crossing.D < 20) continue;
        grazingLines++;
        const tag = `roca ${rock} línea ${i}: D ${crossing.D.toFixed(1)}, pulmón a ${((run.first + 0.5) * step).toFixed(0)} mm`;
        const got = transmissionHitsLine(q, origin, dir, depth, N, dbOf);
        const old = hitsBefore61(q, origin, dir, depth, N);
        // la pleura (el volumen parcial del borde) sigue registrada, sin lámina ni ΔL
        expect(got.pleura, tag).not.toBeNull();
        expect(got.pleura!.dL, tag).toBe(0);
        expect(got.pleura!.curtainLast, tag).toBe(-1);
        // y el pulmón lejano es el espejo de la decisión 57, en su segmento
        expect(got.mirrorSeg, tag).toBe(run.first);
        expect(got.mirrorSeg, tag).toBe(old.mirrorSeg);
        expect(got.mirrorR, tag).toBe(old.mirrorR);
      }
    }
    expect(grazingLines).toBeGreaterThanOrEqual(20);
    // la misma regla en la GPU (A0)
    expect(FRAG_TRANS_HITS).toContain(
      `(curtainRun || (pleuraD >= 0.0 && float(s) * step <= pleuraD + ${CURTAIN_CONTIGUOUS_SEGMENTS.toFixed(1)} * step && inLungRecess(m, insideWallMm(m))));`,
    );
  });

  // A0 en la GPU clasifica lo de detrás de la lámina solo en la lámina (una vuelta más del bucle con
  // classifyWith sin la cortina); en el pulmón del tórax que le sigue pegado no hace falta: sin la cortina es
  // el mismo pulmón y su ΔL es 0. El gemelo lo suma en todo el tramo: la misma cuenta.
  it('en el tramo de la cortina, fuera de la lámina lo de detrás es el mismo pulmón (ΔL 0)', () => {
    let sheet = 0;
    let thorax = 0;
    for (const caudal of [0, 30]) {
      const cal = caliberOf(caudal);
      const q = sceneQuery(scene, cal);
      for (const { id, fr } of frames)
        for (let i = 0; i < CONVEX_C35.lines; i++) {
          const th = -CONVEX_C35.halfSector + (2 * CONVEX_C35.halfSector * (i + 0.5)) / CONVEX_C35.lines;
          const origin = pointOnLine(fr, CONVEX_C35, th, 0);
          const dir = lineDirection(fr, th);
          if (pleuraCrossingLine(q.insideWall, q.curtainEdge, origin, dir, depth, N) === null) continue;
          const step = depth / N;
          // el tramo como el de A0 (y curtainRunOf): pulmón del receso y el que le sigue pegado
          let run = false;
          for (let s = 0; s < N; s++) {
            const p = pointOnLine(fr, CONVEX_C35, th, (s + 0.5) * step);
            const c = q.at(p);
            run = c.tissue === Tissue.Lung && (run || c.curtain);
            if (!run) {
              if (c.tissue === Tissue.Lung) break;
              continue;
            }
            if (scene.inLungCurtain(p, cal)) sheet++;
            else {
              thorax++;
              expect(q.behind(p), `${id} línea ${i} segmento ${s}`).toBe(Tissue.Lung);
            }
          }
        }
    }
    expect(sheet).toBeGreaterThan(100);
    expect(thorax).toBeGreaterThan(100);
  });

  it('el espejo del diafragma queda igual donde la línea llega a la cúpula sin cruzar la cortina', () => {
    let mirrors = 0;
    for (const caudal of [0, 10]) {
      const cal = caliberOf(caudal);
      const q = sceneQuery(scene, cal);
      for (const { fr } of frames)
        for (let i = 0; i < CONVEX_C35.lines; i += 5) {
          const th = -CONVEX_C35.halfSector + (2 * CONVEX_C35.halfSector * (i + 0.5)) / CONVEX_C35.lines;
          const origin = pointOnLine(fr, CONVEX_C35, th, 0);
          const dir = lineDirection(fr, th);
          const got = transmissionHitsLine(q, origin, dir, depth, N, dbOf);
          if (pleuraCrossingLine(q.insideWall, q.curtainEdge, origin, dir, depth, N) && curtainRunOf(q, fr, th, depth / N).first >= 0)
            continue;
          const old = hitsBefore61(q, origin, dir, depth, N);
          if (old.mirrorSeg < 0) continue;
          mirrors++;
          expect(got.mirrorSeg).toBe(old.mirrorSeg);
          expect(got.mirrorR).toBe(old.mirrorR);
          expect(got.dir).toEqual(old.dir);
          expect(got.gasKind).toBe(1);
        }
    }
    expect(mirrors).toBeGreaterThan(40);
  });

  it('A1 marca el pulmón de la cortina con 3 y los gemelos de A2 no lo toman por un impacto de gas', () => {
    expect(FRAG_TRANS_SEGMENTS).toContain('float curtainLast = floor(h2.w / 4.0) - 1.0;');
    expect(FRAG_TRANS_SEGMENTS).toContain(`float lung = !reflected && float(s) <= curtainLast ? ${CURTAIN_GAS_KIND.toFixed(1)} : 1.0;`);
    expect(STEERED_PREFIX_GLSL).toContain('if (g.w > 0.5 && g.w < 2.5 && sGas < 0.0) { sGas = crossing ? sMirror : sRow; gasKind = g.w; }');
    // una línea con 3 segmentos de cortina bajo la pared y gas intestinal más hondo
    const grid = emptyGrid();
    for (const s of [24, 25, 26]) {
      grid.gas[s] = CURTAIN_GAS_KIND;
      grid.db[s] = 6.75;
    }
    grid.gas[90] = 2;
    const h = lineHits(grid, 0);
    expect(h.gasSeg).toBe(90);
    expect(h.gasKind).toBe(2);
    const pre = steeredPrefixDb(grid, { curvatureRadius: 60, halfSector: (34 * Math.PI) / 180 }, 0, 0, 120);
    expect(pre.sGas).toBeCloseTo((90 + 0.5) * grid.stepMm, 9);
    expect(pre.gasKind).toBe(2);
    // pero su pérdida sí se suma
    expect(pre.db).toBeCloseTo(3 * 6.75, 9);
  });

  it('la GLSL de A0 lleva la misma marcha que el gemelo', () => {
    for (const line of [
      'layout(location = 2) out vec4 h2;',
      'float inside = insideWallMm(m);',
      'if (inside >= 0.0 && prevInside < 0.0) {',
      'if (insideWallMm(toMaterial(origin + dir0 * mid)) >= 0.0) hi = mid; else lo = mid;',
      'float dz = lungCurtainEdgeMm(toMaterial(origin + dir0 * rp));',
      `if (dz > -${CURTAIN_RECORD_MM.toFixed(1)}) { pleuraD = rp; pleuraDz = dz; }`,
      'if (mirrorSeg < 0.0 && !crossed) {',
      // una sola clasificación por vuelta: la de la cortina y, en la vuelta siguiente, la de detrás de la lámina
      'Cls c = classifyWith(m, !behind);',
      'curtainDb += lungDb - segmentDb(c.tissue, step);',
      'lungDb = segmentDb(c.tissue, step);',
      // (lus-sim, decisión 20: tampoco avanza en las vueltas de la bisección de un borde del hueso)
      'if (!behind && !bis) s++;',
      'behind = lungCurtainDistance(m, insideWallMm(m), wallArc(m)) >= 0.0;',
      'curtainLast = float(s);',
      `curtainRun = c.tissue == T_LUNG && mirrorSeg < 0.0 && (curtainRun || (pleuraD >= 0.0 && float(s) * step <= pleuraD + ${CURTAIN_CONTIGUOUS_SEGMENTS.toFixed(1)} * step && inLungRecess(m, insideWallMm(m))));`,
      `h2 = pleuraD >= 0.0 ? vec4(pleuraD, pleuraDz, curtainDb, ${CURTAIN_GAS_KIND.toFixed(1)} + 4.0 * (curtainLast + 1.0)) : vec4(-1.0, 0.0, 0.0, 0.0);`,
    ])
      expect(FRAG_TRANS_HITS, line).toContain(line);
    expect(dbOf(Tissue.Lung, 1.125)).toBeCloseTo(GAS_DB_PER_CM * 0.1125, 12);
    expect(dbOf(Tissue.Liver, 1.125)).toBeCloseTo(2 * attenuationDbPerCm(Tissue.Liver, fB) * 0.1125, 12);
  });
});

describe('la rama de la cortina de la pasada B (mirada 0)', () => {
  it('lleva las expresiones del gemelo: tope de la transmisión, réplicas, serie, deslizamiento y transmisión de detrás', () => {
    for (const line of [
      'vec4 h2 = texelFetch(uHits2, ivec2(tc.x, 0), 0);',
      'float fAir = D > 0.0 ? curtainAirFraction(h2.y, D, dir0) : 0.0;',
      'float rCap = pleuraCapMm(max(D, 0.0), uDepth / float(ts.y));',
      'float tD = curtain ? texture(uTrans0, vec2(vUv.x, rCap / uDepth)).x : 0.0;',
      'float tFree = min(t0.x, texture(uTrans2, vUv).x) * gain;',
      'float T = (curtain ? (under ? min(tFree, tD) : texture(uTrans0, vec2(vUv.x, min(r, rCap) / uDepth)).x) : t0.x) * coupling;',
      'float k = aLineOrder(r, D);',
      'air += vec2(uSeriesParts.w * seriesPow(G, k - 1.0) * tD * pleuraSeriesEcho(cosI, k * D - r), 0.0);',
      'vec3 ser = under ? pleuraSeriesDepths(r, D) : vec3(0.0);',
      'bool series = under && gn * tD * PLEURA_WALL_FIELD_BOUND * coupling > PLEURA_SERIES_FLOOR;',
      'int nWall = series ? 2 : 0;',
      'float d = j == 1 ? ser.y : ser.z;',
      'float td = texture(uTrans0, vec2(vUv.x, min(d, rCap) / uDepth)).x;',
      'air += f * (j == 1 ? uSeriesParts.x * (ser.x + 1.0) * PLEURA_RP * PLEURA_RP * chi * chi * tD * tD / max(td, 1e-6) * gn : uSeriesParts.y * (ser.x + 2.0) * td * G * gn);',
      'if (under && slidingAmplitude(r - D) * tD * coupling > PLEURA_SERIES_FLOOR) air += uSeriesParts.z * slidingField(pD, r - D, 0.0) * tD;',
    ])
      expect(FRAG_RAWFIELD, line).toContain(line);
    // y las funciones compartidas son las del gemelo
    for (const line of [
      'float pleuraCapMm(float D, float step) { return (max(ceil(D / step - 0.5) - 1.0, 0.0) + 0.5) * step; }',
      'return vec3(n, (n + 2.0) * D - s, s - (n + 1.0) * D);',
      'float aLineOrder(float s, float D) { return max(1.0, floor(s / D + 0.5)); }',
      'float seriesPow(float g, float n) { return n < 0.5 ? 1.0 : pow(max(g, 1e-30), n); }',
    ])
      expect(PLEURA_GLSL, line).toContain(line);
    // los gemelos TS de esas funciones
    expect(pleuraSeriesDepths(70, 27)).toEqual({ n: 1, mirror: 3 * 27 - 70, forward: 70 - 2 * 27 });
    expect(aLineOrder(40, 27)).toBe(1);
    expect(aLineOrder(41, 27)).toBe(2);
    expect(mirrorGain(0.3, 0.6, 0.5, 0.1, 2)).toBeCloseTo((3 * ((PLEURA_RP * 0.5) ** 2 * 0.09)) / 0.6 / 100, 12);
    expect(forwardGain(0.6, 0.1, 2)).toBeCloseTo(4 * 0.6 * 0.1 ** 3, 12);
  });
});
