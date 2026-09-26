/**
 * Limitaciones conocidas del modelo, con identificador (práctica de VExUS). Cada id debe aparecer entre
 * acentos graves en docs/LIMITATIONS.md (docs.test.ts lo exige), de modo que «lo sabíamos» sea
 * comprobable por máquina. Cuando una limitación se resuelve, se borra de aquí y del documento en el
 * mismo cambio.
 */
export const KNOWN_LIMITATIONS: ReadonlySet<string> = new Set(['no-image-yet']);
