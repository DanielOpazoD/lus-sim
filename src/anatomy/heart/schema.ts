/**
 * Anatomía y fisiología de un caso cardiaco (lus-sim, decisión 49; adaptado de EchoTwin, `src/cases/schema.ts`, origen y commit
 * en docs/PROVENANCE.md). EchoTwin valida sus casos con Zod (casos como datos JSON que llegan del usuario); lus-sim solo usa el
 * caso normal del corazón y no depende de Zod: los tipos son los que Zod infería (`z.infer`), escritos a mano, con los valores
 * por omisión ya puestos en el caso (`normal-excellent.ts`). Los rangos que Zod comprobaba quedan en los comentarios.
 */

export interface LvAnatomyConfig {
  /** Diámetro interno telediastólico del VI (cm; 2,5–9). */
  eddCm: number;
  /** Del anillo al ápex en telediástole (cm; 5–12). */
  lengthEdCm: number;
  ivsdCm: number;
  lvpwdCm: number;
  /** 0 en bala, 1 esférico (por omisión 0,55). */
  sphericity: number;
  /** Grosor de la pared del ápex (cm; por omisión 0,7). */
  apexWallThicknessCm: number;
  /** Retrodispersión integrada calibrada del miocardio sobre la normal (dB, decisión 267 de EchoTwin; por omisión 0). */
  myocardialBackscatterDb: number;
}

export interface WallMotionConfig {
  segment: number;
  amplitude: number;
  delayPhase: number;
  score?: 1 | 2 | 3 | 4;
}

export interface Vec3Config {
  x: number;
  y: number;
  z: number;
}

export interface AnatomyConfig {
  lv: LvAnatomyConfig;
  la: { apDiameterCm: number; volumeMl: number };
  rv: { basalDiameterCm: number; lengthCm: number; freeWallThicknessCm: number; septalFlattening: number };
  ra: { volumeMl: number };
  aorta: { lvotDiameterCm: number; annulusCm: number; sinusCm: number; ascendingCm: number };
  mitral: {
    annulusDiameterCm: number;
    anteriorLeafletLengthCm: number;
    posteriorLeafletLengthCm: number;
    maxOpeningDeg: number;
    calcification: number;
    thickeningCm: number;
    samSeverity: number;
    prolapse: number;
  };
  aorticValve: { maxOpeningFraction: number; calcification: number; cuspThicknessCm: number; bicuspid: boolean };
  tricuspid: { annulusDiameterCm: number };
  pulmonaryArtery: { trunkDiameterCm: number };
  ivc: { diameterCm: number; collapsePct: number };
  pericardium: { effusionCm: number; tamponade: number };
  /** Marco del corazón en el tórax de EchoTwin (cm; x izquierda, y superior, z anterior). */
  heartPosition: { baseCm: Vec3Config; longAxis: Vec3Config; anterior: Vec3Config };
  wallMotion: WallMotionConfig[];
}

export interface PhysiologyConfig {
  edvMl: number;
  esvMl: number;
  mapseCm: number;
  tapseCm: number;
  ePeakMps: number;
  aPeakMps: number;
  decelerationTimeMs: number;
  ivrtMs: number;
  ePrimeSeptalCmps: number;
  ePrimeLateralCmps: number;
  sPrimeTricuspidCmps: number;
  contractility: number;
}

/** Lo que lus-sim toma de un caso de EchoTwin: su semilla, su anatomía y su fisiología. */
export interface CardiacCase {
  id: string;
  seed: number;
  anatomy: AnatomyConfig;
  physiology: PhysiologyConfig;
}
