/**
 * Limitaciones conocidas del modelo, con identificador (práctica de VExUS). Cada id debe aparecer entre
 * acentos graves en docs/LIMITATIONS.md (docs.test.ts lo exige), de modo que «lo sabíamos» sea comprobable por
 * máquina. Cuando una limitación se resuelve, se borra de aquí y del documento en el mismo cambio. Las que se
 * heredan de VExUS con el código portado conservan su identificador (decisiones 10 y 11).
 */
export const KNOWN_LIMITATIONS: ReadonlySet<string> = new Set([
  'normal-acquisition-only',
  'navigator-parametric',
  // anatomía y fisiología
  'left-handed-anatomy-frame',
  'thorax-cylindrical-cage',
  'rib-section-uniform',
  'apex-cupola-wall',
  'clavicle-section-uniform',
  'chest-wall-regional-approx',
  'wall-generic-layers',
  'heart-simplified',
  'lung-border-table',
  'abdomen-generic-tissue',
  'sliding-linear-height',
  'respiratory-field-vertical',
  // sonda
  'convex-probe-only',
  'probe-compression-kinematic',
  'probe-compression-in-plane',
  // imagen
  'no-lung-comet-tails',
  'pleura-series-same-line',
  'interface-echo-coherent-only',
  'rib-acoustics-simplified',
  'speckle-statistics-uncalibrated',
  'display-uncalibrated',
  'no-sidelobes',
  'harmonic-simplified',
]);
