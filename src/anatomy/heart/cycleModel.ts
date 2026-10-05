/**
 * Estado cinemático del corazón en una fase del latido (lus-sim, decisión 49; adaptado de EchoTwin,
 * `src/simulator/cardiac-cycle/cycleModel.ts`, origen y commit en docs/PROVENANCE.md). En la fase 1 del corazón (decisión 49)
 * solo se porta la forma del estado que lee la pose (`heartPose.ts`): el latido es el de telediástole, fijo
 * (`organs/heart.ts`). Las tablas del latido (`buildBeatTables`, `cycleStateAt`) llegan con el movimiento (fase 2), movidas por el
 * reloj único de lus-sim (`core/clock.ts`).
 */
/** Kinematic state of the heart at a given phase, derived from the beat tables. */
export interface CycleState {
  phase: number;
  timeInBeatS: number;
  rrS: number;
  lvVolumeMl: number;
  /** 0 at end-diastole, 1 at end-systole (volume based). */
  contraction: number;
  /** Mitral valve opening 0..1 (driven by inflow). */
  mvOpen: number;
  /** Aortic valve opening 0..1 (driven by ejection flow). */
  avOpen: number;
  /** Tricuspid / pulmonic openings mirror the left side with a small delay. */
  tvOpen: number;
  pvOpen: number;
  /** Longitudinal annular displacement fraction of MAPSE (0 = end diastole position). */
  longitudinal: number;
  /** Tricuspid annular displacement fraction of TAPSE (decision 106). */
  rvLongitudinal: number;
  /** Inferior vena cava collapse this frame while breathing freely (decision 113); the patient state's when absent. */
  ivcCollapse?: number;
  /** Atrial contraction 0..1 (0 in AF). */
  atrialContraction: number;
  /** 1 from the end of the A wave until ejection starts (the atria stay at their minimal volume), 0 in AF. */
  atrialHold: number;
  mitralFlowMlps: number;
  aorticFlowMlps: number;
  edvMl: number;
  esvMl: number;
  /**
   * Arterial pressure in the descending aorta behind the left atrium, as a fraction of the pulse pressure above the
   * diastolic one (decision 272): 0 at the foot of the pulse, 1 at the systolic peak.
   */
  aorticPressure: number;
}
