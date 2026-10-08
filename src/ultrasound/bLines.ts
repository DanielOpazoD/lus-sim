import { defineParameters } from '../core/evidence';
import { CELL_INDEX_OFFSET, SUBPLEURAL_SUMMARY_TEXEL, SUBPLEURAL_TRAPS } from '../anatomy/organs/subpleural';
import { glslFloat } from './receiver';

/**
 * Las líneas B en la imagen (lus-sim, decisión 51): lo que la sonda recibe de las trampas subpleurales abiertas
 * (`anatomy/organs/subpleural.ts`). Mecanismo, el de la hipótesis más aceptada del consenso de 2023 (Demi; Soldati 2020;
 * `docs/knowledge/physics.md` §2.4, mecanismos 1 y 4): el pulso que llega a un canal accesible de la pleura entra, queda
 * atrapado entre paredes aireadas y, por dispersión múltiple y reverberación, la trampa reirradia hacia la sonda poco a poco:
 * una **fuente secundaria** fija al pulmón que sigue emitiendo después del eco de la pleura. Lo que se ve sale de ahí, sin
 * dibujar ninguna línea:
 *
 *  - **Vertical y hasta el fondo.** La trampa está en la pleura, a la distancia D de la sonda; lo que emite en el instante
 *    t tras el eco pleural llega como si viniera de D + c·t/2: su eco ocupa, en la línea que la ve, toda la profundidad bajo la
 *    pleura, con la amplitud de su reverberación, e^(−τ/L) a τ = r − D. Atraviesa solo la pared (T(D)), no el pulmón: la TGC,
 *    que compensa la atenuación de un tejido que la señal no cruza, la levanta con la profundidad; con L del orden de la
 *    compensación nominal llega al fondo «sin apagarse» (la definición de consenso), y con menos ganancia distal se acorta.
 *  - **Como un láser y radial.** La trampa es más pequeña que el haz: la ven las líneas cuyo haz la cubre en la pleura, y su
 *    anchura lateral es la de la PSF en la profundidad de la pleura (`docs/knowledge/physics.md` §2.4, [DERIVADO]: «si la
 *    trampa es menor que el haz, el ancho lateral en la imagen se acerca a la anchura lateral de la PSF en la profundidad de la
 *    pleura»), la σ lateral de dos vías del equipo en D (`lateralSigmaMm`), con la elevacional de dos vías de la lente: con el
 *    foco en la pleura, una línea fina de anchura estable en ángulo (radial en la convexa); con el foco hondo, más ancha y
 *    tenue (F-T22). La pasada D la vuelve a filtrar con la PSF de su profundidad (`docs/APPROXIMATIONS.md`).
 *  - **Borra las líneas A en su columna.** La fracción del haz que entra en las trampas, η = Σ κ·w, deja de reflejarse
 *    especularmente: cada reflexión en la pleura de esa línea vale (1 − η) de la de antes (la línea pleural, sus réplicas y
 *    las copias de la pared). Entre trampas, las líneas A siguen (coexisten, 2026: D1_3).
 *  - **Se mueve con el deslizamiento.** Las trampas están en el mapa del pulmón (el mismo que ancla el deslizamiento): bajan
 *    con él y su reirradiación, sorteada una vez por trampa, viaja con ellas.
 *  - **Confluencia.** La inundación alveolar (el campo medio de `subpleural.ts`) quita a toda la región una fracción ηa de la
 *    reflexión especular y la reirradia como un campo difuso anclado al pulmón (otra población de fuentes, por debajo de la
 *    resolución): las líneas coalescentes y el pulmón blanco, sin líneas A.
 *
 * Lo que no se modela aquí (`docs/LIMITATIONS.md`): la selectividad en frecuencia de la trampa (F-T20, F-T21: solo hay una
 * sonda), el contenido atenuante (fibrosis, F-T19), la armónica (F-T24) y la composición (F-T25: bajo la pleura K solo usa la
 * mirada 0). Gemelos: `B_LINES_GLSL` (pasada B y consulta de puntos) y `bLineTraps.ts` (TS: pruebas, gemelo de la pleura y
 * equivalencia, fuera de la entrada del bundle), con el mismo hash entero.
 */
export const B_LINES = defineParameters('ultrasound.bLines', {
  ringDownEfoldMm: {
    value: 35,
    unit: 'mm',
    range: [23, 45],
    evidence: 'estimado',
    sources: ['ostras-histopatologia-2023', 'volpicelli-actualizacion-2026', 'kameda-mecanismos-2022'],
    note:
      'Caída de la amplitud de la reirradiación con la profundidad aparente (e-fold). Ostras da un tiempo de reverberación de ' +
      '56 µs con agua y 30 µs con conectivo (B19), 4,3 y 2,3 cm a c/2 (B20), sin verificar su definición; la longitud depende ' +
      'del acceso frente al volumen de la trampa (Kameda, B17). Con 35 mm (2,5 dB/cm) la línea B de edema sigue a la ' +
      'compensación de referencia (2·0,5 dB/cm/MHz a 2,5 MHz) y llega al fondo de 10–12 cm (F-T18; consenso 2026, D1_1.1)',
  },
  trapSourceDb: {
    value: -8,
    unit: 'dB',
    range: [-14, -3],
    evidence: 'estimado',
    sources: ['volpicelli-consenso-2012', 'lichtenstein-luci-2014'],
    note:
      'Nivel de la reirradiación de una trampa que capta todo el haz (κ·w = 1), junto a la pleura (τ 2–6 mm), frente a la línea ' +
      'pleural de las líneas vecinas sin trampa, en la envolvente (gemelo de la pleura): «hiperecoica» (2012) y «bien ' +
      'definida, tipo láser» (Lichtenstein), sin cifra. Se calibra con el banco cuando haya clips con líneas B',
  },
  alveolarSourceDb: {
    value: -20,
    unit: 'dB',
    range: [-26, -12],
    evidence: 'estimado',
    sources: ['picano-aguapulmonar-2016', 'soldati-porosidad-2014'],
    note:
      'Nivel del campo difuso de la inundación alveolar completa (ηa = 1) junto a la pleura frente a la línea pleural vecina: el ' +
      '«pulmón blanco» (Picano; Soldati 2014). Calibrado en el gemelo con F-T27: con −20 dB el campo difuso cubre la pantalla ' +
      'desde f ≈ 0,45 (las coalescentes de Mongodi, 0,36–0,46) y no con 0,50 (verticales que cubren < 50 %)',
  },
  diffuseGrainMm: {
    value: 0.6,
    unit: 'mm',
    range: [0.3, 1.2],
    evidence: 'estimado',
    sources: ['soldati-trampas-2020'],
    note:
      'Paso de la retícula del campo difuso en el mapa de la pleura: las fuentes alveolares (espacios de 50–300 µm, B25 y L14) ' +
      'están por debajo de la resolución; la retícula solo tiene que ser menor que la PSF para que su moteado lo fije el haz',
  },
});

const BP = B_LINES.params;
const TP = SUBPLEURAL_TRAPS.params;

/**
 * Amplitudes de la pasada B (antes de C y D) de una trampa con κ·w = 1 y del campo difuso con ηa = 1, frente a la línea pleural
 * de amplitud T(D)·`pleuraSeriesEcho` (perfil de integral unidad): las del objetivo en dB menos la ganancia que C y D dan al eco
 * especular frente a una señal sin correlación lateral más allá de la PSF [MEDIDO con el gemelo B → C → D, `bLines.test.ts`].
 */
export const TRAP_RAW_GAIN_DB = 38;
export const DIFFUSE_RAW_GAIN_DB = 36.9;
export const TRAP_SOURCE = 10 ** ((BP.trapSourceDb.value + TRAP_RAW_GAIN_DB) / 20);
export const ALVEOLAR_SOURCE = 10 ** ((BP.alveolarSourceDb.value + DIFFUSE_RAW_GAIN_DB) / 20);
/** Paso de la retícula de la reirradiación en la profundidad aparente (mm): el del moteado (`uLattice`). */
export const RING_LATTICE_MM = 0.42;
/** Tope de la fracción del haz que entra en las trampas de una línea (siempre queda algo de reflexión especular). */
export const ETA_MAX = 0.98;
/**
 * La anchura lateral con que se dibuja una trampa (σ) no baja de esta fracción del paso entre líneas en la pleura: más fina, la
 * pasada B la vería o no según cayera sobre una línea o entre dos (la energía del dibujo oscila < 0,3 dB con 0,6).
 */
export const DRAW_PITCH_FRACTION = 0.6;
/**
 * …ni pasa de esta fracción de la celda: así la ventana de trampas de una línea (3σ lateral y 3σe en elevación) cabe en 4 × 4
 * celdas. Con el foco muy hondo la línea B dibujada es más estrecha que el haz (`APPROXIMATIONS.md`); su intensidad sí baja.
 */
export const DRAW_CELL_FRACTION = 0.3;
/** Ventana de trampas: ±3σ en la dirección lateral y en la elevacional (peso ≥ e^−4,5). */
export const WINDOW_SIGMAS = 3;
/** Peso mínimo de una trampa en la línea: por encima de e^−4,5 (0,0111), el peso en el borde de la ventana de ±3σ. */
export const MIN_TRAP_WEIGHT = 0.012;
/** Jacobiano mínimo del mapa (u, z) frente a (lateral, elevación): por debajo, el plano corre a lo largo de la normal de la pleura. */
export const MIN_CHART_DET = 0.05;
/** Sales de la reirradiación de las trampas y del campo difuso. */
export const RING_SALT = 0x2b1e5;
export const DIFFUSE_SALT = 0x6a09e;
/**
 * Gemelo GLSL (pasada B de la mirada 0 y consulta de puntos). Usa `SUBPLEURAL_GLSL`, `sceneTexel`, `wallArc`, `lungSlideMm`,
 * `elevSigma`, `lateralSigmaMm` (con sus uniforms del haz) y los de la geometría (`uElev`, `uCurvR`, `uHalfSector`,
 * `uLinesF`) y `uSeed`. `bLineField(m, dir, D, τ)`: m, el punto material de la pleura de la línea antes del latido; devuelve
 * (re, im, ρ, trampas).
 */
export const B_LINES_GLSL = /* glsl */ `
#define BL_SUMMARY ${SUBPLEURAL_SUMMARY_TEXEL}
const vec4 BL_PARAMS = vec4(${glslFloat(BP.ringDownEfoldMm.value)}, ${glslFloat(TRAP_SOURCE)}, ${glslFloat(ALVEOLAR_SOURCE)}, ${glslFloat(BP.diffuseGrainMm.value)});
const vec4 BL_DRAW = vec4(${glslFloat(DRAW_PITCH_FRACTION)}, ${glslFloat(DRAW_CELL_FRACTION)}, ${glslFloat(WINDOW_SIGMAS)}, ${glslFloat(MIN_TRAP_WEIGHT)});
const float BL_ACCESS = ${glslFloat(TP.septalAccessMm2.value)};
const float BL_ONSET = ${glslFloat(Math.max(TP.septalOnsetGas.value, TP.alveolarOnsetGas.value))};
const float BL_RING = ${glslFloat(RING_LATTICE_MM)};
vec2 gaussNode(uint h) {
  float a = u24(pcgHash(h)) + ${glslFloat(1 / 33554432)};
  float b = u24(pcgHash(h ^ 0x9e3779b9u));
  float r = sqrt(-2.0 * log(a));
  return r * vec2(cos(6.2831853 * b), sin(6.2831853 * b));
}
// pesos normalizados entre dos nodos independientes (la varianza no cae a medio camino)
vec2 nodeWeights(float t) { float f = smoothstep(0.0, 1.0, t); return vec2(1.0 - f, f) * inversesqrt((1.0 - f) * (1.0 - f) + f * f); }
vec2 ringDown(uint h, float tau) {
  float x = tau / BL_RING;
  float k = floor(x);
  uint ki = uint(int(k));
  vec2 w = nodeWeights(x - k);
  return w.x * gaussNode(pcgHash(h ^ pcgHash(ki + ${RING_SALT}u))) + w.y * gaussNode(pcgHash(h ^ pcgHash(ki + ${RING_SALT + 1}u)));
}
vec2 diffuseNode(int i, int j, int k, uint seedU) {
  return gaussNode(pcgHash(seedU ^ pcgHash(uint(i + ${CELL_INDEX_OFFSET * 16}) ^ pcgHash(uint(j + ${CELL_INDEX_OFFSET * 16}) ^ pcgHash(uint(k) + ${DIFFUSE_SALT}u)))));
}
vec2 diffuseField(float u, float z, float tau, uint seedU) {
  vec3 x = vec3(u / BL_PARAMS.w, z / BL_PARAMS.w, tau / BL_RING);
  vec3 c = floor(x);
  vec2 wx = nodeWeights(x.x - c.x);
  vec2 wy = nodeWeights(x.y - c.y);
  vec2 wt = nodeWeights(x.z - c.z);
  ivec3 n = ivec3(c);
  vec2 f = vec2(0.0);
  for (int a = 0; a < 2; a++)
    for (int b = 0; b < 2; b++)
      for (int t = 0; t < 2; t++) f += wx[a] * wy[b] * wt[t] * diffuseNode(n.x + a, n.y + b, n.z + t, seedU);
  return f;
}
// ¿Puede abrirse algo en el pulmón? (un téxel por muestra: sin trampas, la pasada B de siempre)
bool lungMayOpen() { return sceneTexel(BL_SUMMARY).x < BL_ONSET; }
vec4 bLineField(vec3 m, vec3 dir, float D, float tau) {
  if (!lungMayOpen()) return vec4(0.0, 0.0, 1.0, 0.0);
  uint seedU = uint(uSeed * 7.0 + 0.5);
  float u = wallArc(m);
  float zc = m.z + lungSlideMm(m);
  SpQuad q = subpleuralQuad(u, zc);
  // el mapa frente a (lateral, elevación): diferencias de 1 mm del arco; la z, la de la dirección
  vec3 lat = normalize(cross(uElev, dir));
  float uL = wallArc(m + lat) - u;
  float uE = wallArc(m + uElev) - u;
  float det = uL * uElev.z - uE * lat.z;
  if (!(abs(det) >= ${glslFloat(MIN_CHART_DET)})) return vec4(0.0, 0.0, 1.0, 0.0);
  // distancias al eje del haz: la proyección (Jᵀ); la caja de la ventana en el mapa, con su inversa
  vec4 k = vec4(uL, lat.z, uE, uElev.z);
  vec4 M = vec4(uElev.z, -lat.z, -uE, uL) / det;
  float sPhys = lateralSigmaMm(D);
  float pitch = (uCurvR + D) * (2.0 * uHalfSector / (uLinesF - 1.0));
  float sDraw = min(max(sPhys, BL_DRAW.x * pitch), BL_DRAW.y * SP_SEPTAL.z);
  float sElev = elevSigma(D) * 0.70710678;
  float alv = alveolarAccessFraction(quadGas(q, u, zc));
  float eta = 0.0;
  vec2 f = vec2(0.0);
  float traps = 0.0;
  float lo = min(min(q.g.x, q.g.y), min(q.g.z, q.g.w));
  float hi = max(max(q.g.x, q.g.y), max(q.g.z, q.g.w));
  if (septalOpenFraction(lo - 0.5 * (hi - lo)) > 0.0) {
    float a = SP_SEPTAL.z;
    float kappa0 = min(1.0, BL_ACCESS / (6.2831853 * sPhys * sElev));
    float rl = BL_DRAW.z * sDraw;
    float re = BL_DRAW.z * sElev;
    float hu = min(length(vec2(rl * M.x, re * M.y)), 1.5 * a);
    float hz = min(length(vec2(rl * M.z, re * M.w)), 1.5 * a);
    int i0 = int(floor((u - hu) / a));
    int j0 = int(floor((zc - hz) / a));
    int ni = min(int(floor((u + hu) / a)) - i0, 3);
    int nj = min(int(floor((zc + hz) / a)) - j0, 3);
    for (int di = 0; di < 4; di++) {
      if (di > ni) break;
      for (int dj = 0; dj < 4; dj++) {
        if (dj > nj) break;
        uint h;
        vec4 c = trapCell(i0 + di, j0 + dj, seedU, h);
        if (!(c.z < septalOpenFraction(quadGas(q, c.x, c.y)))) continue;
        vec2 d = c.xy - vec2(u, zc);
        float dl = k.x * d.x + k.y * d.y;
        float de = k.z * d.x + k.w * d.y;
        float w = exp(-0.5 * (dl * dl / (sDraw * sDraw) + de * de / (sElev * sElev)));
        if (w < BL_DRAW.w) continue;
        float kw = kappa0 * c.w * w;
        eta += kw;
        traps += 1.0;
        if (tau >= 0.0) f += kw * ringDown(h, tau);
      }
    }
  }
  eta = min(eta, ${glslFloat(ETA_MAX)});
  float decay = tau >= 0.0 ? exp(-tau / BL_PARAMS.x) : 0.0;
  f *= BL_PARAMS.y * decay;
  if (alv > 0.0 && tau >= 0.0) f += BL_PARAMS.z * alv * decay * diffuseField(u, zc, tau, seedU);
  return vec4(f, (1.0 - eta) * (1.0 - alv), traps);
}
`;
