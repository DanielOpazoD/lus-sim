import { defineParameters } from '../../core/evidence';
import { SUBPLEURAL_AERATION, SUBPLEURAL_GRID, SUBPLEURAL_NODES, type LungAeration } from '../../physiology/lungAeration';
import { HEART_VOL_BASE, HEART_VOL_TEXELS } from './heart';

/**
 * La microestructura subpleural que forma las líneas B (lus-sim, decisión 51): las trampas acústicas de Soldati y Demi
 * (`docs/knowledge/physics.md`, §2.4, mecanismo 1, y §3.1, principio 3), abiertas por el agua en el pulmón que pierde aire.
 * Es estado físico (guía §3.B): dónde hay canales accesibles bajo la pleura visceral, no cómo se ven (eso es de
 * `ultrasound/bLines.ts`). Una sola microestructura para todo el recorrido del pulmón aireado al blanco, que cambia con la
 * aireación subpleural del paciente (`physiology/lungAeration.ts`), no con el «tipo de artefacto»:
 *
 *  - **Trampas septales, discretas.** Donde un tabique interlobulillar engrosado por el agua toca la pleura queda un canal
 *    accesible de 0,1–1 mm (B25) entre paredes aireadas: una fuente secundaria que reirradia hacia la sonda. Se modelan como
 *    puntos en una retícula de celdas de `septalCellMm` sobre la pleura (el mapa (u, z) de la superficie: el arco de la piel y
 *    la altura con el pulmón llevado a su posición en espiración, el mismo que ancla el deslizamiento), uno por celda, con su
 *    posición sorteada dentro de ella. Cada celda tiene su susceptibilidad ξ (uniforme, fija por la semilla del paciente) y
 *    su trampa está abierta si ξ < p(φ), la fracción de tabiques abiertos con la fracción de gas φ de su región: 0 desde
 *    `septalOnsetGas` (el pulmón normal no tiene ninguna) y 1 desde `septalFullGas`, con la rampa suave `smoothstep` entre
 *    los dos [la forma es un SUPUESTO]. Así, al perder aire, primero aparecen líneas aisladas, luego varias por espacio
 *    intercostal (las B1 «espaciadas unos 7 mm», Lopes 2025; los «cohetes septales» de Lichtenstein) y a la vez la serie de la pleura pierde energía en sus
 *    columnas. El tamaño de cada canal (su área de acceso) varía de una trampa a otra.
 *  - **Inundación alveolar, como campo medio.** Cuando el agua llena los espacios aéreos (los de ~0,1–0,3 mm, muy por debajo
 *    de la resolución), la superficie accesible deja de ser un conjunto de puntos: es una fracción `alveolarAccess`·q(φ) de
 *    la pleura, con q(φ) la misma rampa entre `alveolarOnsetGas` y `alveolarFullGas`. Esa fracción no se resuelve en fuentes
 *    sueltas: quita reflexión especular a toda la pleura de la región y reirradia como un campo difuso (las líneas B
 *    coalescentes y el «pulmón blanco»). Es la escala negro → negro y blanco → blanco de Picano.
 *
 * TS y GLSL viven aquí juntos (`SUBPLEURAL_GLSL`): la tabla de la aireación del paciente en la textura de escena (un téxel por
 * nodo de la rejilla, tras la de los vasos del hilio), el hash entero de las celdas (exacto en las dos: `pcgHash`) y las
 * fracciones abiertas. La reirradiación y la pérdida de la serie, con el haz, en `ultrasound/bLines.ts`.
 */
export const SUBPLEURAL_TRAPS = defineParameters('anatomy.subpleuralTraps', {
  septalOnsetGas: {
    value: 0.72,
    unit: 'fracción',
    evidence: 'derivado',
    sources: ['ostras-histopatologia-2023', 'mongodi-qlus-2024'],
    note:
      'Fracción de gas por encima de la cual no hay ninguna trampa abierta. En la simulación de onda completa de Ostras (Fig. 7) ' +
      'solo hay líneas A con 70,2 y 80,3 % de aireación y empiezan a formarse con 63,9 % (B21, con su discrepancia interna); la ' +
      'TAC de Mongodi pone el patrón A en f ≥ 0,68. Con 0,72 el pulmón normal (0,80) no tiene trampas y con 0,70 aparece a lo ' +
      'sumo una vertical aislada (meta F-T27: «aireación ≥ 70 %: solo líneas A, a lo sumo una vertical aislada»)',
  },
  septalFullGas: {
    value: 0.5,
    unit: 'fracción',
    range: [0.45, 0.57],
    evidence: 'estimado',
    sources: ['soldati-exvivo-2012', 'mongodi-qlus-2024'],
    note:
      'Fracción de gas desde la que todos los tabiques subpleurales están abiertos. Las líneas B separadas ocupan f 0,55–0,65 ' +
      '(Mongodi) y el síndrome intersticial aparece con > 0,45 g/mL (≈ 57 % de aire, Soldati 2012, L17/L19): con 0,50 la ' +
      'rampa septal termina antes de las coalescentes (0,36–0,46). Se calibra con F-T27',
  },
  septalCellMm: {
    value: 5.9,
    unit: 'mm',
    range: [4.5, 7.5],
    evidence: 'estimado',
    sources: ['lopes-reaireacion-2025', 'soldati-trampas-2020'],
    note:
      'Lado de la celda de una trampa septal sobre la pleura. Con todos los tabiques abiertos, las líneas de un corte quedan a ' +
      '≈ a²/w de distancia, con w = √(2π)·σe ≈ 4,9 mm el grosor efectivo de la rebanada (σe de dos vías en la pleura con la ' +
      'lente a 80 mm): a = √(7·4,9) ≈ 5,9 mm da las líneas B1 «espaciadas unos 7 mm» (Lopes 2025; clinical.md §1.2). Los ' +
      'lobulillos de Soldati miden 1–2,5 cm (L15); la separación de sus tabiques en la superficie es ese orden',
  },
  siteJitter: {
    value: 0.8,
    unit: 'fracción de la celda',
    range: [0.5, 1],
    evidence: 'estimado',
    sources: ['soldati-trampas-2020'],
    note: 'Cuánto se aparta la trampa del centro de su celda (la red de tabiques no es una retícula): sin fuente cuantitativa',
  },
  septalAccessMm2: {
    value: 2,
    unit: 'mm²',
    range: [0.5, 2.5],
    evidence: 'estimado',
    sources: ['soldati-trampas-2020', 'kameda-modelos-2021'],
    note:
      'Área de acceso de la trampa más grande: la fracción del haz que entra es min(1, A/(2π·σl·σe)), con σl la anchura de ' +
      'emisión y σe la elevacional de dos vías en la pleura (≈ 1,8 mm² con el foco en la pleura; 2,8 mm² en el gemelo, con la pleura a 28 mm). Acceso de 0,1–1 mm o más (B25); ' +
      'un contacto más puntual da un artefacto más largo e intenso (Kameda 2021, B17). Se calibra con el borrado local de las ' +
      'líneas A (F-T26) y el número de líneas visibles (F-T27)',
  },
  accessSpread: {
    value: 0.5,
    unit: 'fracción',
    range: [0.2, 0.8],
    evidence: 'estimado',
    sources: ['soldati-trampas-2020'],
    note: 'Dispersión del tamaño del acceso entre trampas: el área va de (1 − esto) a 1 veces `septalAccessMm2` (uniforme)',
  },
  alveolarOnsetGas: {
    value: 0.55,
    unit: 'fracción',
    range: [0.5, 0.6],
    evidence: 'estimado',
    sources: ['mongodi-qlus-2024', 'ostras-histopatologia-2023'],
    note:
      'Fracción de gas por debajo de la cual el agua empieza a llenar los espacios aéreos subpleurales: entre las líneas B ' +
      'separadas (f 0,55–0,65) y las coalescentes (0,36–0,46) de Mongodi; Ostras da el puntaje 1 con 44,8 y 53,7 %',
  },
  alveolarFullGas: {
    value: 0.3,
    unit: 'fracción',
    range: [0.2, 0.36],
    evidence: 'estimado',
    sources: ['ostras-histopatologia-2023', 'mongodi-qlus-2024'],
    note:
      'Fracción de gas con la inundación alveolar completa: Ostras da el puntaje 2 (múltiples verticales sin horizontales) con ' +
      '21, 26,5 y 35,4 % (B21) y la meta F-T27 pide confluentes sin líneas A con ≤ 35 %',
  },
  alveolarAccess: {
    value: 0.85,
    unit: 'fracción',
    range: [0.6, 0.95],
    evidence: 'estimado',
    sources: ['soldati-porosidad-2014', 'picano-aguapulmonar-2016'],
    note:
      'Fracción de la pleura accesible con la inundación alveolar completa: del «reflector especular roto» al «pulmón blanco» ' +
      '(Soldati 2014) sin perder toda la reflexión (el pulmón aún tiene gas). Se calibra con F-T27 (sin líneas A con ≤ 35 %)',
  },
});

const TP = SUBPLEURAL_TRAPS.params;

/** Primer téxel de la tabla de la aireación subpleural en la textura de escena: tras la rejilla del volumen del corazón. */
export const SUBPLEURAL_TABLE_BASE = HEART_VOL_BASE + HEART_VOL_TEXELS;
/**
 * Un téxel por nodo de la rejilla, (fracción de gas, 0, 0, 0), y uno más de resumen, (la menor fracción de gas del pulmón, 0, 0,
 * 0): con ella la pasada B decide con una sola lectura si en el pulmón puede haber alguna trampa abierta.
 */
export const SUBPLEURAL_TABLE_TEXELS = SUBPLEURAL_NODES + 1;
/** Téxel del resumen de la tabla. */
export const SUBPLEURAL_SUMMARY_TEXEL = SUBPLEURAL_TABLE_BASE + SUBPLEURAL_NODES;
/** Desplazamiento de los índices de celda antes de pasarlos a entero sin signo (los índices son negativos a la derecha y abajo). */
export const CELL_INDEX_OFFSET = 4096;
/** Sal de la población septal en el hash de las celdas. */
export const SEPTAL_SALT = 0x5e97a1;

/** La tabla de la aireación del paciente: `SUBPLEURAL_TABLE_TEXELS` téxeles RGBA (float32, como en la GPU). */
export function subpleuralTable(lung: LungAeration | undefined): Float32Array {
  const t = new Float32Array(SUBPLEURAL_TABLE_TEXELS * 4);
  const normal = SUBPLEURAL_AERATION.params.normalGasFraction.value;
  let min = Infinity;
  for (let i = 0; i < SUBPLEURAL_NODES; i++) {
    t[i * 4] = lung ? lung.gas[i] : normal;
    min = Math.min(min, t[i * 4]);
  }
  t[SUBPLEURAL_NODES * 4] = min;
  return t;
}

const f4 = (x: number): string => x.toFixed(4);
const G = SUBPLEURAL_GRID;

/**
 * Gemelo GLSL (en la pasada B y en la consulta de puntos): usa `sceneTexel`. `subpleuralQuad` lee los cuatro nodos una vez; las
 * trampas vecinas de una línea se deciden con ellos (`quadGas`, prolongado), como en TS.
 */
export const SUBPLEURAL_GLSL = /* glsl */ `
#define SP_BASE ${SUBPLEURAL_TABLE_BASE}
#define SP_NU ${G.NU}
#define SP_NZ ${G.NZ}
const vec4 SP_GRID = vec4(${f4(G.U0)}, ${f4(G.DU)}, ${f4(G.Z0)}, ${f4(G.DZ)});
const vec4 SP_SEPTAL = vec4(${f4(TP.septalOnsetGas.value)}, ${f4(TP.septalFullGas.value)}, ${f4(TP.septalCellMm.value)}, ${f4(TP.siteJitter.value)});
const vec4 SP_ALVEOLAR = vec4(${f4(TP.alveolarOnsetGas.value)}, ${f4(TP.alveolarFullGas.value)}, ${f4(TP.alveolarAccess.value)}, ${f4(TP.accessSpread.value)});
struct SpQuad { vec2 corner; vec4 g; };
SpQuad subpleuralQuad(float u, float z) {
  float x = clamp((u - SP_GRID.x) / SP_GRID.y, 0.0, float(SP_NU - 1));
  float y = clamp((z - SP_GRID.z) / SP_GRID.w, 0.0, float(SP_NZ - 1));
  int j = min(int(floor(x)), SP_NU - 2);
  int i = min(int(floor(y)), SP_NZ - 2);
  int k = SP_BASE + i * SP_NU + j;
  SpQuad q;
  q.corner = vec2(SP_GRID.x + float(j) * SP_GRID.y, SP_GRID.z + float(i) * SP_GRID.w);
  q.g = vec4(sceneTexel(k).x, sceneTexel(k + 1).x, sceneTexel(k + SP_NU).x, sceneTexel(k + SP_NU + 1).x);
  return q;
}
float quadGas(SpQuad q, float u, float z) {
  float fx = (u - q.corner.x) / SP_GRID.y;
  float fy = (z - q.corner.y) / SP_GRID.w;
  float a = q.g.x + (q.g.y - q.g.x) * fx;
  float b = q.g.z + (q.g.w - q.g.z) * fx;
  return clamp(a + (b - a) * fy, 0.0, 1.0);
}
float openingRamp(float gas, float onset, float full) { return smoothstep(0.0, 1.0, clamp((onset - gas) / (onset - full), 0.0, 1.0)); }
float septalOpenFraction(float gas) { return openingRamp(gas, SP_SEPTAL.x, SP_SEPTAL.y); }
float alveolarAccessFraction(float gas) { return SP_ALVEOLAR.z * openingRamp(gas, SP_ALVEOLAR.x, SP_ALVEOLAR.y); }
uint pcgHash(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float u24(uint h) { return float(h >> 8u) * (1.0 / 16777216.0); }
// la celda (i, j) de la retícula septal: (u, z) de la trampa, susceptibilidad, tamaño; y su hash
vec4 trapCell(int i, int j, uint seedU, out uint hash) {
  uint h0 = pcgHash(seedU ^ pcgHash(uint(i + ${CELL_INDEX_OFFSET}) ^ pcgHash(uint(j + ${CELL_INDEX_OFFSET}) + ${SEPTAL_SALT}u)));
  uint h1 = pcgHash(h0);
  uint h2 = pcgHash(h1);
  hash = pcgHash(h2);
  float a = SP_SEPTAL.z;
  return vec4((float(i) + 0.5 + SP_SEPTAL.w * (u24(h0) - 0.5)) * a, (float(j) + 0.5 + SP_SEPTAL.w * (u24(h1) - 0.5)) * a, u24(h2),
    1.0 - SP_ALVEOLAR.w * u24(hash));
}
`;
