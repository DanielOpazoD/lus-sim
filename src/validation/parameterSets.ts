import type { ParameterSet } from '../core/evidence';
import { START_POINT_POSES } from '../app/startPoints';
import { CHEST_WALL } from '../anatomy/organs/chestWall';
import { HEART } from '../anatomy/organs/heart';
import { LUNG_BORDER, LUNG_SLIDING } from '../anatomy/organs/lungBorder';
import { RIBCAGE } from '../anatomy/organs/ribcage';
import { THORAX_LINES } from '../anatomy/thoraxLines';
import { COSTAL_CARTILAGE } from '../anatomy/tissues';
import { BLUE_UPPER_POSE } from '../probe/probe';
import { LUNG_PRESET, TGC_REFERENCE } from '../ultrasound/lungPreset';
import { BONE_TRANSMISSION } from '../ultrasound/boneTransmission';

/**
 * Todos los conjuntos de parámetros del modelo (decisión 4). `evidence.test.ts` comprueba sobre esta
 * lista que cada fuente existe en docs/REFERENCES.md y que lo estimado figura en
 * docs/APPROXIMATIONS.md; también que ningún `defineParameters(…)` del código quede fuera de ella.
 * Un conjunto nuevo se añade aquí en el mismo cambio que lo crea.
 */
export const PARAMETER_SETS: readonly ParameterSet[] = [
  RIBCAGE,
  THORAX_LINES,
  CHEST_WALL,
  LUNG_BORDER,
  LUNG_SLIDING,
  HEART,
  COSTAL_CARTILAGE,
  BLUE_UPPER_POSE,
  START_POINT_POSES,
  LUNG_PRESET,
  TGC_REFERENCE,
  BONE_TRANSMISSION,
];
