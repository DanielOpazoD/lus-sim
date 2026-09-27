/**
 * Estado del paciente virtual (guía §3.A). Es la «verdad» latente: el alumno
 * no la modifica al mover la sonda. Ningún campo de este objeto es un grado
 * VExUS: el grado se calcula después sobre los observables (guía §5).
 *
 * Todos los valores por defecto están etiquetados en la base de conocimiento
 * como [EXTRAPOLACIÓN PROPIA] (G.1 y hoja consolidada) salvo indicación.
 *
 * lus-sim (decisión 10): el NÚCLEO del paciente de VExUS, lo que leen el ritmo, la respiración y la escena
 * del tórax. Se quitan la hemodinámica derecha y el hígado (los lee la red venosa, que no se porta); el
 * estado pulmonar regional se añadirá como una parte separada (docs/UNIFICATION.md).
 */
/**
 * Ritmo: sinusal, o fibrilación auricular (RR irregular sin patrón, sin onda P
 * ni contracción auricular organizada; ondas f en el ECG). En FA
 * `atrialFunction` se ignora (vale 0) y `rrVariability` es la dispersión
 * relativa de RR (típica 0,2–0,3).
 */
export type Rhythm = 'sinus' | 'atrial-fibrillation';
export type VentilationMode = 'spontaneous' | 'positive-pressure';
export type RespiratoryPattern = 'quiet' | 'deep' | 'apnea-expiratory' | 'apnea-inspiratory';

export interface PatientState {
  id: string;
  label: string;
  /** Semilla de todas las fuentes estocásticas del caso (guía §20). */
  seed: number;

  // --- Ritmo y frecuencia ---
  heartRateBpm: number;
  rhythm: Rhythm;
  /** Variabilidad RR relativa (0,02 = 2 %). */
  rrVariability: number;
  /** Intervalo PR sintético en ms (hoja consolidada: 160). */
  prIntervalMs: number;
  /**
   * Contracción auricular relativa, 0–1 (0 = sin onda a organizada). En el núcleo porque la lee el ritmo
   * (`rhythm.ts`, idéntico al de VExUS): la amplitud de la onda P del ECG de cada latido.
   */
  atrialFunction: number;

  // --- Presiones externas y respiración ---
  /**
   * Presión intraabdominal (mmHg): la lee el modelo respiratorio (`respiratory.ts`, presión abdominal).
   * 5 por omisión, la del adulto sano de VExUS (`defaultPatient`).
   */
  intraAbdominalPressureMmHg: number;
  ventilation: VentilationMode;
  /**
   * PEEP (cmH₂O): sube la presión pleural un 40 % en los dos modos (con respiración espontánea es una CPAP;
   * `respiratory.ts`). En lus-sim todavía no mueve la aireación (puente con el ventilador, fase 5) ni la
   * hemodinámica: el lazo cerrado de VExUS que la lleva a la PAD y al gasto (su decisión 79) no se porta.
   */
  peepCmH2O: number;
  respiratoryRateMin: number;
  respiratoryPattern: RespiratoryPattern;

  // --- Hábito corporal y ventana ---
  habitus: {
    subcutaneousFatMm: number;
    muscleMm: number;
    /**
     * Hábito del tórax (lus-sim, decisión 17: la pared torácica por región, `anatomy/organs/chestWall.ts`): complexión y
     * sexo. Sin él, el avatar de la base (varón de complexión media); `subcutaneousFatMm` y `muscleMm` quedan como la pared
     * del abdomen, bajo el reborde costal.
     */
    chest?: ChestHabitus;
  };
}

/** Complexión y sexo del tórax (anatomy.md §2.4–2.6): el avatar, la variante delgada (IMC ≈ 18,5) y la obesa (≈ 32–35). */
export interface ChestHabitus {
  build: 'average' | 'thin' | 'obese';
  sex: 'male' | 'female';
}

export function clonePatient(p: PatientState): PatientState {
  return JSON.parse(JSON.stringify(p)) as PatientState;
}

/**
 * Paciente por omisión: el núcleo del adulto sano euvolémico de VExUS (`NORMAL_ADULT` de
 * vexus-sim@52354d5:src/cases/index.ts), con sus mismos valores [EXTRAPOLACIÓN PROPIA de VExUS]. El
 * hábito (grasa y músculo) es el del abdomen de VExUS, la pared bajo el reborde costal; la del tórax es la del avatar de la
 * base, por región (lus-sim, decisión 17: `habitus.chest` sin fijar). Un objeto nuevo en cada llamada.
 */
export function defaultPatient(): PatientState {
  return {
    id: 'normal-adult',
    label: 'Adulto sano euvolémico',
    seed: 20260921,
    heartRateBpm: 70,
    rhythm: 'sinus',
    rrVariability: 0.03,
    prIntervalMs: 160,
    atrialFunction: 0.8,
    intraAbdominalPressureMmHg: 5,
    ventilation: 'spontaneous',
    peepCmH2O: 0,
    respiratoryRateMin: 14,
    respiratoryPattern: 'quiet',
    habitus: { subcutaneousFatMm: 14, muscleMm: 12 },
  };
}

/** Comprueba dominios básicos; lanza si un valor es físicamente imposible. */
export function validatePatient(p: PatientState): void {
  const inRange = (v: number, lo: number, hi: number, name: string) => {
    if (!(v >= lo && v <= hi)) throw new Error(`PatientState.${name}=${v} fuera de [${lo}, ${hi}]`);
  };
  inRange(p.heartRateBpm, 30, 220, 'heartRateBpm');
  inRange(p.atrialFunction, 0, 1, 'atrialFunction');
  inRange(p.intraAbdominalPressureMmHg, 0, 40, 'intraAbdominalPressureMmHg');
  inRange(p.peepCmH2O, 0, 30, 'peepCmH2O');
  inRange(p.respiratoryRateMin, 4, 50, 'respiratoryRateMin');
}
