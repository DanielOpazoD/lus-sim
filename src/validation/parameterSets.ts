import type { ParameterSet } from '../core/evidence';
import { POSTERIOR_START_POSES, START_POINT_POSES } from '../app/startPoints';
import { CHEST_WALL, RESPIRATORY_WALL } from '../anatomy/organs/chestWall';
import { HEART } from '../anatomy/organs/heart';
import { LUNG_PULSE } from '../anatomy/organs/lungPulse';
import { LUNG_BORDER, LUNG_SLIDING } from '../anatomy/organs/lungBorder';
import { CLAVICLE, RIBCAGE, SCAPULA } from '../anatomy/organs/ribcage';
import { SPINE } from '../anatomy/organs/spine';
import { LUNG_APEX } from '../anatomy/organs/lungApex';
import { SCAPULAR_LINE, THORAX_LINES } from '../anatomy/thoraxLines';
import { COVERAGE } from '../app/coverage';
import { TORSO } from '../anatomy/scene';
import { COSTAL_CARTILAGE } from '../anatomy/tissues';
import { BLUE_UPPER_POSE } from '../probe/probe';
import { LUNG_PRESET, TGC_REFERENCE } from '../ultrasound/lungPreset';
import { BONE_TRANSMISSION } from '../ultrasound/boneTransmission';
import { NORMAL_CALIBRATION } from '../ultrasound/normalCalibration';
import { DIAPHRAGM_EXCURSION } from '../physiology/respiratory';
import { FIDELITY_BENCH } from '../measure/fidelity/parameters';

/**
 * Todos los conjuntos de parámetros del modelo (decisión 4). `evidence.test.ts` comprueba sobre esta
 * lista que cada fuente existe en docs/REFERENCES.md y que lo estimado figura en
 * docs/APPROXIMATIONS.md; también que ningún `defineParameters(…)` del código quede fuera de ella.
 * Un conjunto nuevo se añade aquí en el mismo cambio que lo crea.
 */
export const PARAMETER_SETS: readonly ParameterSet[] = [
  TORSO,
  RIBCAGE,
  CLAVICLE,
  SCAPULA,
  SPINE,
  LUNG_APEX,
  THORAX_LINES,
  SCAPULAR_LINE,
  CHEST_WALL,
  LUNG_BORDER,
  LUNG_SLIDING,
  HEART,
  LUNG_PULSE,
  COSTAL_CARTILAGE,
  BLUE_UPPER_POSE,
  START_POINT_POSES,
  POSTERIOR_START_POSES,
  LUNG_PRESET,
  TGC_REFERENCE,
  BONE_TRANSMISSION,
  NORMAL_CALIBRATION,
  DIAPHRAGM_EXCURSION,
  RESPIRATORY_WALL,
  FIDELITY_BENCH,
  COVERAGE,
];
