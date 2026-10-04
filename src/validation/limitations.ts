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
  'wall-cupola-transition',
  'clavicle-section-uniform',
  'anterior-rib-shape',
  'scapula-plate',
  'spine-arch-slab',
  'patient-position-anatomy',
  'chest-wall-regional-approx',
  'chest-wall-height-transition',
  'wall-generic-layers',
  'heart-simplified',
  'lung-border-table',
  'abdomen-generic-tissue',
  'liver-spleen-simplified',
  'stomach-traube-lens',
  'kidney-retroperitoneum-port',
  'sliding-linear-height',
  'respiratory-field-vertical',
  // sonda
  'convex-probe-only',
  'probe-compression-kinematic',
  'probe-compression-in-plane',
  'operator-hand-rigid',
  'sector-detector-moving-skin',
  // imagen
  'no-lung-comet-tails',
  'pleura-series-same-line',
  'interface-echo-coherent-only',
  'rib-acoustics-simplified',
  'rib-core-leak-center',
  'speckle-statistics-uncalibrated',
  'display-uncalibrated',
  'gpu-timer-unverified',
  'sector-detector-symmetric',
  'no-sidelobes',
  'harmonic-simplified',
]);
