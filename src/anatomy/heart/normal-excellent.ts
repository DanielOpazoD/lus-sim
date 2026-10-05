import type { CardiacCase } from './schema';

/**
 * Caso 1 de EchoTwin — adulto normal, ventana excelente, sinusal 65 lpm (lus-sim, decisión 49; adaptado de EchoTwin,
 * `src/cases/normal-excellent.ts`, origen y commit en docs/PROVENANCE.md). Solo la anatomía y la fisiología que el corazón
 * lee, con los valores por omisión que ponía Zod ya escritos (`septalFlattening`, `prolapse`, `pulmonaryArtery`,
 * `tamponade`, `myocardialBackscatterDb`); el resto del caso (ritmo, hemodinámica, ventana, vistas, objetivos) es de la
 * ecocardiografía y no se porta. Paciente sintético: sin datos reales.
 */
export const normalExcellentCase: CardiacCase = {
  id: 'normal-excellent-window',
  seed: 101,
  anatomy: {
    lv: {
      eddCm: 4.8,
      lengthEdCm: 8.6,
      ivsdCm: 0.9,
      lvpwdCm: 0.9,
      sphericity: 0.5,
      apexWallThicknessCm: 0.7,
      myocardialBackscatterDb: 0,
    },
    la: { apDiameterCm: 3.5, volumeMl: 52 },
    rv: { basalDiameterCm: 3.4, lengthCm: 7.4, freeWallThicknessCm: 0.4, septalFlattening: 0 },
    ra: { volumeMl: 45 },
    aorta: { lvotDiameterCm: 2.1, annulusCm: 2.4, sinusCm: 3.2, ascendingCm: 3.0 },
    mitral: {
      annulusDiameterCm: 3.0,
      anteriorLeafletLengthCm: 2.4,
      posteriorLeafletLengthCm: 1.3,
      maxOpeningDeg: 70,
      calcification: 0,
      thickeningCm: 0.1,
      samSeverity: 0,
      prolapse: 0,
    },
    aorticValve: {
      maxOpeningFraction: 1,
      calcification: 0,
      cuspThicknessCm: 0.08,
      bicuspid: false,
    },
    tricuspid: { annulusDiameterCm: 3.3 },
    pulmonaryArtery: { trunkDiameterCm: 2.3 },
    ivc: { diameterCm: 1.7, collapsePct: 70 },
    pericardium: { effusionCm: 0, tamponade: 0 },
    // The long axis (mitral centre → apex) projects 36° below the leftward horizontal in the frontal plane and 47° anterior
    // of leftward in the transverse plane: healthy adults measure 38 ± 10° and 46 ± 7° by cardiac MRI (Engblom et al., Am
    // Heart J 2005;150:507, n = 94). lus-sim (decisión 49): la orientación del eje se conserva; la posición (`baseCm`) la
    // vuelve a calcular `organs/heart.ts` sobre la parrilla de lus-sim (el ápex de Gray y la ventana de Latham).
    heartPosition: {
      baseCm: { x: 1.682, y: -0.269, z: -8.458 },
      longAxis: { x: 0.611, y: -0.45, z: 0.651 },
      anterior: { x: 0.092, y: 0.858, z: 0.506 },
    },
    wallMotion: [],
  },
  physiology: {
    edvMl: 120,
    esvMl: 45,
    mapseCm: 1.4,
    tapseCm: 2.2,
    ePeakMps: 0.8,
    aPeakMps: 0.55,
    decelerationTimeMs: 180,
    ivrtMs: 75,
    ePrimeSeptalCmps: 11,
    ePrimeLateralCmps: 14,
    sPrimeTricuspidCmps: 13,
    contractility: 1,
  },
};
