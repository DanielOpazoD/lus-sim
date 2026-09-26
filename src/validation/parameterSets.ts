import type { ParameterSet } from '../core/evidence';

/**
 * Todos los conjuntos de parámetros del modelo (decisión 4). `evidence.test.ts` comprueba sobre esta
 * lista que cada fuente existe en docs/REFERENCES.md y que lo estimado figura en
 * docs/APPROXIMATIONS.md; también que ningún `defineParameters(…)` del código quede fuera de ella.
 * Un conjunto nuevo se añade aquí en el mismo cambio que lo crea.
 */
export const PARAMETER_SETS: readonly ParameterSet[] = [];
