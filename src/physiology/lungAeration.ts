import { defineParameters } from '../core/evidence';

/**
 * Aireación subpleural por región (lus-sim, decisión 51): la parte del estado del paciente que dice cuánto gas queda en el
 * pulmón bajo la pleura visceral, la variable de la que salen las trampas acústicas y, con ellas, las líneas B
 * (`anatomy/organs/subpleural.ts`, `ultrasound/bLines.ts`). Es un contrato del paciente, no de la imagen
 * (`docs/UNIFICATION.md`, regla 4): una fracción de gas (0–1, la del parénquima a ~1 cm de la pleura) en una rejilla regular
 * sobre la superficie del tórax, en las unidades del motor (mm, el marco de VExUS con el origen en el xifoides):
 *  - columnas en `u`, el arco de la piel desde la línea media anterior, con signo (el de `wallArc`: positivo hacia +x), de
 *    `U0` a `U0 + (NU − 1)·DU`, que cubre el perímetro entero de los troncos del modelo (841 mm el de referencia);
 *  - filas en `z`, la altura, de `Z0` a `Z0 + (NZ − 1)·DZ`, del seno costodiafragmático posterior al vértice.
 * Fuera de la rejilla manda el nodo más cercano. Un simulador hermano (VExUS, EchoTwin) que lleve el agua pulmonar la
 * escribe aquí; lus-sim la lee en la textura de escena. Sin `lung`, el paciente tiene la aireación normal en todo el pulmón.
 *
 * El valor no es un puntaje ni un número de líneas B (guía §5): es una propiedad física del pulmón, la misma que miden la
 * densidad de la TAC (fracción de gas ≈ 1 − ρ/1,05) y los modelos de Soldati y Mongodi. La fase 4 (decisión 51) la calcula
 * desde la presión de llenado y el agua extravascular; aquí solo se define y se consulta.
 */
export const SUBPLEURAL_GRID = Object.freeze({ U0: -420, DU: 35, NU: 25, Z0: -220, DZ: 40, NZ: 13 });

export const SUBPLEURAL_AERATION = defineParameters('physiology.subpleuralAeration', {
  normalGasFraction: {
    value: 0.8,
    unit: 'fracción',
    range: [0.7, 0.9],
    evidence: 'documentado',
    sources: ['ostras-histopatologia-2023'],
    note:
      'Porosidad (aireación) normal del parénquima humano, 70–90 % (dato citado por Ostras 2023; `docs/knowledge/physics.md`, ' +
      'L13 y §3.2, que propone el 80 % por omisión). La densidad subpleural por TAC en la UCI (0,34 g/mL, Baldi 2013) da 68 %',
  },
});

/** Aireación subpleural del paciente: `gas[iz·NU + iu]`, la fracción de gas en el nodo (U0 + iu·DU, Z0 + iz·DZ). */
export interface LungAeration {
  gas: number[];
}

/** Número de nodos de la rejilla. */
export const SUBPLEURAL_NODES = SUBPLEURAL_GRID.NU * SUBPLEURAL_GRID.NZ;

/** La misma fracción de gas en todo el pulmón (un caso docente sencillo: el pulmón normal, o un edema difuso homogéneo). */
export function uniformAeration(gas: number): LungAeration {
  return { gas: new Array<number>(SUBPLEURAL_NODES).fill(gas) };
}

/** Posición (u, z) en mm del nodo `i` de la rejilla. */
export function subpleuralNode(i: number): { u: number; z: number } {
  const g = SUBPLEURAL_GRID;
  return { u: g.U0 + (i % g.NU) * g.DU, z: g.Z0 + Math.floor(i / g.NU) * g.DZ };
}

/** Comprueba la forma y el dominio de una aireación; lanza con el motivo. */
export function validateAeration(a: LungAeration): void {
  if (a.gas.length !== SUBPLEURAL_NODES) throw new Error(`LungAeration.gas: ${a.gas.length} nodos (se esperan ${SUBPLEURAL_NODES})`);
  for (const [i, g] of a.gas.entries()) if (!(g >= 0 && g <= 1)) throw new Error(`LungAeration.gas[${i}] = ${g} fuera de [0, 1]`);
}

/**
 * El cuadrilátero de la rejilla que contiene (u, z) (con el punto llevado al borde si cae fuera): su esquina (columna j, fila i)
 * y sus cuatro valores (g00 en (j, i), g10 en (j + 1, i), g01 en (j, i + 1), g11 en (j + 1, i + 1)). Gemelo de
 * `subpleuralQuad` (GLSL, `anatomy/organs/subpleural.ts`).
 */
export interface SubpleuralQuad {
  j: number;
  i: number;
  g: readonly [number, number, number, number];
}

export function subpleuralQuad(gas: readonly number[], u: number, z: number): SubpleuralQuad {
  const G = SUBPLEURAL_GRID;
  const x = Math.min(Math.max((u - G.U0) / G.DU, 0), G.NU - 1);
  const y = Math.min(Math.max((z - G.Z0) / G.DZ, 0), G.NZ - 1);
  const j = Math.min(Math.floor(x), G.NU - 2);
  const i = Math.min(Math.floor(y), G.NZ - 2);
  const at = (jj: number, ii: number): number => gas[ii * G.NU + jj];
  return { j, i, g: [at(j, i), at(j + 1, i), at(j, i + 1), at(j + 1, i + 1)] };
}

/**
 * La fracción de gas en (u, z) con la interpolación bilineal del cuadrilátero `q`, prolongada fuera de él (un punto a pocos
 * mm del cuadrilátero de la línea usa su misma pendiente: así las trampas vecinas de una línea se deciden con los mismos
 * cuatro valores que la GPU lee una vez) y acotada a [0, 1].
 */
export function quadGas(q: SubpleuralQuad, u: number, z: number): number {
  const G = SUBPLEURAL_GRID;
  const fx = (u - (G.U0 + q.j * G.DU)) / G.DU;
  const fy = (z - (G.Z0 + q.i * G.DZ)) / G.DZ;
  const a = q.g[0] + (q.g[1] - q.g[0]) * fx;
  const b = q.g[2] + (q.g[3] - q.g[2]) * fx;
  return Math.min(1, Math.max(0, a + (b - a) * fy));
}

/** Fracción de gas subpleural del paciente en (u, z) (bilineal; sin `lung`, la normal). */
export function gasFractionAt(lung: LungAeration | undefined, u: number, z: number): number {
  if (!lung) return SUBPLEURAL_AERATION.params.normalGasFraction.value;
  const G = SUBPLEURAL_GRID;
  const uc = Math.min(Math.max(u, G.U0), G.U0 + (G.NU - 1) * G.DU);
  const zc = Math.min(Math.max(z, G.Z0), G.Z0 + (G.NZ - 1) * G.DZ);
  return quadGas(subpleuralQuad(lung.gas, uc, zc), uc, zc);
}
