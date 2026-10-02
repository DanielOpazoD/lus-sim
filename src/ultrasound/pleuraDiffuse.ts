import { INTERFACES, Interface } from '../anatomy/interfaces';
import { defineParameters } from '../core/evidence';
import { PLEURA_RP, PLEURA_RT, PLEURA_SERIES_FLOOR, PLEURA_WALL_FIELD_BOUND, pleuraSeriesDepths, seriesPow } from './pleura';
import { glslFloat } from './receiver';

/**
 * La parte difusa de la reflexión de la pleura en la serie de reverberaciones (lus-sim, ciclo 3b-2).
 *
 * La pleura es un reflector casi total (R_p ≈ 1, músculo/gas) con rugosidad fina σz. En la aproximación de Kirchhoff
 * para una superficie gaussiana, la reflexión se reparte en una parte coherente, R·χ en amplitud con
 * χ = exp(−2(k0·σz·cosθ)²) (la de Ament, la que ya forma la línea pleural, las líneas A y las copias de la pared), y una
 * difusa, incoherente, con el resto de la energía: R²·(1 − χ²). Hasta aquí la serie descartaba la difusa. Con R ≈ 1 en
 * el aire esa energía no se pierde (F-T07 en su espíritu): sale en un lóbulo alrededor de la dirección especular, y la
 * fracción que vuelve a la apertura de la línea alimenta la neblina bajo la pleura.
 *
 * El lóbulo. Con la función de correlación gaussiana de longitud l, la potencia difusa es la serie de Beckmann
 * Σ_{m≥1} e^{−g}·g^m/m! con un lóbulo gaussiano en el número de onda transversal de varianza 2m/l² por eje
 * (g = 4k0²σz²cos²θ = −ln χ²). Su varianza media pesada por la potencia de cada término es (2/l²)·g/(1 − e^{−g}), así que
 * el lóbulo difuso tiene, por eje y en seno del ángulo, la desviación θ_d = √(2·g/(1 − e^{−g}))/(k0·l): tiende a √2/(k0·l)
 * con la superficie casi lisa (g → 0) y a 2·√2·σz/l = 2·s_f (dos veces la pendiente rms de la rugosidad fina) con la muy
 * rugosa (g ≫ 1, óptica geométrica). Se trata como un lóbulo gaussiano (aproximación: la serie tiene colas más largas).
 *
 * La fracción que vuelve a la línea. El haz de una vía (intensidad gaussiana de σ por eje, lateral y elevacional) que se
 * refleja difuso en la pleura y sube h mm se ensancha a σ² + (θ_d·h)² por eje (ángulos pequeños) con la misma energía.
 * La señal de los dispersores de la pared es la integral del producto de las intensidades de ida y de vuelta, así que,
 * frente a la ida y la vuelta coherentes, una pierna difusa vale a1 = √2σ/√(2σ² + w²) por eje y las dos, a2 =
 * σ/√(σ² + w²), con w = θ_d·h. Sin ensanchar (w = 0), coherente + difusa = χ⁴ + 2χ²(1 − χ²) + (1 − χ²)² = 1: la energía
 * se conserva.
 *
 * Las copias de la pared:
 *  - espejo (sonda → pleura → sube a d → dispersa → baja → pleura → sonda): dos reflexiones en la pleura, a h = D − d;
 *    potencia relativa a R_p⁴·(T(D)²/T(d))²: χ⁴ (la coherente, la de siempre) + 2χ²(1 − χ²)·A1 + (1 − χ²)²·A2, con
 *    A_i = a_i(σ_lat) · a_i(σ_elev). La difusa es más fuerte justo bajo la pleura (d cerca de D, w pequeño) y se apaga
 *    hacia la piel: la forma de la neblina subpleural;
 *  - directa (sonda → pleura → cara de la sonda → baja a d → dispersa): una reflexión en la pleura en una sola pierna, con
 *    el haz difuso ensanchado en D + d (sube a la cara y baja): (1 − χ²)·A1(θ_d·(D + d)), unos −10 a −20 dB bajo la
 *    coherente;
 *  - las líneas A (la pleura como reflector en los dos extremos de cada vuelta) siguen solo coherentes: su parte difusa
 *    se ensancha 2D por vuelta y queda < −25 dB bajo la coherente; F-T01 y F-T02 no cambian.
 * En los órdenes n ≥ 1 las idas y vueltas de más se toman coherentes (G = R_p·χ·R_t·T(D) por vuelta) y la parte difusa,
 * la de las dos últimas piernas: lo difuso de las vueltas de más, ensanchado 2D en cada una, es despreciable.
 *
 * La copia difusa es incoherente con la coherente: un moteado independiente de la misma pared (la misma clasificación,
 * el mismo nivel, otra sal), sin el eco de cara plana (la imagen especular de una fascia no sobrevive a una pierna
 * difusa). Su realización queda anclada a la pared, como la coherente; que la rugosidad que la produce es la del pulmón,
 * que desliza, es del mecanismo de la arena (ciclo 3b-2, 3).
 *
 * Gemelos: estas funciones (TS: `pleuraDiffuseTerms`, el gemelo de la pleura y las pruebas) y `PLEURA_DIFFUSE_GLSL`
 * (pasada B, los dos programas).
 */
export const PLEURA_DIFFUSE = defineParameters('ultrasound.pleuraDiffuse', {
  correlationLengthMm: {
    value: 0.2,
    unit: 'mm',
    range: [0.1, 0.3],
    evidence: 'estimado',
    sources: ['demi-espectroscopia-2017', 'ostras-histopatologia-2023'],
    note:
      'Longitud de correlación l de la rugosidad fina de la superficie pulmonar, la que da la coherencia χ con σz 0,05 mm ' +
      '(`interfaces.ts`). Sin medida directa: se toma de la escala de los alvéolos subpleurales, 216 ± 28 µm (intercepto ' +
      'lineal, humano) a ≈ 280 µm (Demi 2017) y 132 ± 24 µm en el cerdo (Ostras 2023): `docs/knowledge/physics.md`, L14. ' +
      'Fija el ancho del lóbulo difuso (θ_d = √(2g/(1 − e^{−g}))/(k0·l)) y con él cuánto de la energía difusa vuelve a la ' +
      'línea. Se calibra con la neblina subpleural del banco (M de la neblina, decisión 24)',
  },
});

/** l (mm): `PLEURA_DIFFUSE.correlationLengthMm`. */
export const DIFFUSE_CORR_MM = PLEURA_DIFFUSE.params.correlationLengthMm.value;
/** El seno del lóbulo no pasa de 1 (por eje): con l pequeño, la aproximación gaussiana daría más de un hemisferio. */
export const DIFFUSE_MAX_SIN = 1;
/** Sal del moteado de la copia difusa (otra realización de la misma pared). */
export const DIFFUSE_SALT = 41.73;

/** σz de la pleura parietal (mm): la rugosidad fina de la tabla de caras, la de χ. */
const SIGMA_Z_MM = INTERFACES[Interface.PleuraWall].roughnessMm;

/** θ_d (seno, por eje): la desviación del lóbulo difuso con la incidencia cosI y k0 (rad/mm). */
export function diffuseLobe(cosI: number, k0: number, corrMm = DIFFUSE_CORR_MM): number {
  const x = 2 * k0 * SIGMA_Z_MM * cosI;
  const g = x * x;
  const ratio = g < 1e-4 ? 1 + 0.5 * g : g / -Math.expm1(-g);
  return Math.min(DIFFUSE_MAX_SIN, Math.sqrt(2 * ratio) / (k0 * corrMm));
}

/**
 * Lo que vale una pierna difusa (`one`) y las dos (`two`) frente a la ida y la vuelta coherentes, con el haz de una vía de
 * σ lateral y elevacional (intensidad) y el ensanchamiento w: producto de a1 = √2σ/√(2σ² + w²) y a2 = σ/√(σ² + w²) por eje.
 */
export function diffuseOverlap(sigmaLatMm: number, sigmaElevMm: number, wMm: number): { one: number; two: number } {
  const a1 = (s: number) => (Math.SQRT2 * s) / Math.sqrt(2 * s * s + wMm * wMm);
  const a2 = (s: number) => s / Math.sqrt(s * s + wMm * wMm);
  return { one: a1(sigmaLatMm) * a1(sigmaElevMm), two: a2(sigmaLatMm) * a2(sigmaElevMm) };
}

/**
 * Ganancia de la copia espejo difusa de orden n sobre el moteado independiente de la pared:
 * (n + 1)·R_p²·T(D)²/T(d)·Gⁿ·√(2χ²(1 − χ²)·A1 + (1 − χ²)²·A2).
 */
export function mirrorDiffuseGain(tD: number, td: number, chi: number, G: number, n: number, one: number, two: number): number {
  const c2 = chi * chi;
  const p = 2 * c2 * (1 - c2) * one + (1 - c2) * (1 - c2) * two;
  return (n + 1) * ((PLEURA_RP * PLEURA_RP * tD * tD) / Math.max(td, 1e-6)) * seriesPow(G, n) * Math.sqrt(Math.max(p, 0));
}

/** Ganancia de la copia directa difusa de orden n: (n + 2)·T(d)·R_p·R_t·T(D)·√((1 − χ²)·A1)·Gⁿ. */
export function forwardDiffuseGain(td: number, tD: number, chi: number, G: number, n: number, one: number, rt = PLEURA_RT): number {
  return (n + 2) * td * PLEURA_RP * rt * tD * Math.sqrt(Math.max((1 - chi * chi) * one, 0)) * seriesPow(G, n);
}

/** Un término difuso: la ganancia sobre el moteado independiente de la pared en `depth`. */
export interface DiffuseTerm {
  family: 'mirror-diffuse' | 'forward-diffuse';
  order: number;
  depth: number;
  /** Ensanchamiento del haz difuso en la pared (mm). */
  spreadMm: number;
  gain: number;
}

/** El haz de una vía en la profundidad d: σ lateral y elevacional de su intensidad (mm). */
export interface OneWayBeam {
  lat: (d: number) => number;
  elev: (d: number) => number;
}

/**
 * Los términos difusos a la distancia s del camino (gemelo de la serie difusa de la pasada B): con la misma condición de
 * corte que la coherente (`pleuraTerms`), la copia espejo difusa en d_M y la directa difusa en d_F. `cosI`, la incidencia
 * de la línea en la pleura; `chi`, su coherencia (`pleuraCoherence`); `G`, la ganancia de una vuelta (`pleuraRoundTrip`).
 */
export function pleuraDiffuseTerms(
  s: number,
  D: number,
  tD: number,
  chi: number,
  G: number,
  cosI: number,
  k0: number,
  tAt: (d: number) => number,
  beam: OneWayBeam,
  fieldBound = PLEURA_WALL_FIELD_BOUND,
  corrMm = DIFFUSE_CORR_MM,
): DiffuseTerm[] {
  if (s <= D) return [];
  const { n, mirror, forward } = pleuraSeriesDepths(s, D);
  if (!(seriesPow(G, n) * tD * fieldBound > PLEURA_SERIES_FLOOR)) return [];
  const th = diffuseLobe(cosI, k0, corrMm);
  const wM = th * (D - mirror);
  const wF = th * (D + forward);
  const oM = diffuseOverlap(beam.lat(mirror), beam.elev(mirror), wM);
  const oF = diffuseOverlap(beam.lat(forward), beam.elev(forward), wF);
  return [
    {
      family: 'mirror-diffuse',
      order: n,
      depth: mirror,
      spreadMm: wM,
      gain: mirrorDiffuseGain(tD, tAt(mirror), chi, G, n, oM.one, oM.two),
    },
    { family: 'forward-diffuse', order: n, depth: forward, spreadMm: wF, gain: forwardDiffuseGain(tAt(forward), tD, chi, G, n, oF.one) },
  ];
}

/**
 * La misma física en GLSL (pasada B, los dos programas; va delante de `PLEURA_GLSL`, cuyo `wallField` usa `DIFFUSE_SALT`;
 * usa `uIface` e `IF_PLEURA_WALL`). k0 sale del propio uniform de la pleura: uIface.y = 2·k0·σz.
 */
export const PLEURA_DIFFUSE_GLSL = /* glsl */ `
const float PLEURA_SIGMA_Z_MM = ${glslFloat(SIGMA_Z_MM)};
const float DIFFUSE_CORR_MM = ${glslFloat(DIFFUSE_CORR_MM)};
const float DIFFUSE_MAX_SIN = ${glslFloat(DIFFUSE_MAX_SIN)};
const float DIFFUSE_SALT = ${glslFloat(DIFFUSE_SALT)};
const float DIFFUSE_RP = ${glslFloat(PLEURA_RP)};
const float DIFFUSE_RT = ${glslFloat(PLEURA_RT)};
// θ_d del lóbulo difuso (seno, por eje) con la incidencia cosI
float diffuseLobe(float cosI) {
  float y = uIface[IF_PLEURA_WALL].y;
  float k0 = y / (2.0 * PLEURA_SIGMA_Z_MM);
  float x = y * cosI;
  float g = x * x;
  float ratio = g < 1e-4 ? 1.0 + 0.5 * g : g / (1.0 - exp(-g));
  return min(DIFFUSE_MAX_SIN, sqrt(2.0 * ratio) / (k0 * DIFFUSE_CORR_MM));
}
// (una pierna difusa, las dos) frente a la ida y la vuelta coherentes: σ lateral y elevacional de la intensidad de una vía
vec2 diffuseOverlap(float sl, float se, float w) {
  float w2 = w * w;
  float one = 2.0 * sl * se / sqrt((2.0 * sl * sl + w2) * (2.0 * se * se + w2));
  float two = sl * se / sqrt((sl * sl + w2) * (se * se + w2));
  return vec2(one, two);
}
float mirrorDiffuseGain(float tD, float td, float chi, float gn, float n, vec2 ov) {
  float c2 = chi * chi;
  float p = 2.0 * c2 * (1.0 - c2) * ov.x + (1.0 - c2) * (1.0 - c2) * ov.y;
  return (n + 1.0) * DIFFUSE_RP * DIFFUSE_RP * tD * tD / max(td, 1e-6) * gn * sqrt(max(p, 0.0));
}
float forwardDiffuseGain(float td, float tD, float chi, float gn, float n, vec2 ov) {
  return (n + 2.0) * td * DIFFUSE_RP * DIFFUSE_RT * tD * sqrt(max((1.0 - chi * chi) * ov.x, 0.0)) * gn;
}
`;
