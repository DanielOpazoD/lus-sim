import { defineParameters } from '../core/evidence';
import { dot, type Vec3 } from '../core/vec3';
import type { Torso } from '../anatomy/primitives';
import { torsoNormal } from '../anatomy/primitives';
import type { ProbeContact } from './contact';

/**
 * La mano del ecografista (lus-sim, decisión 39): lo que mueve la sonda respecto del tórax entre cuadros, con el reloj único
 * y una semilla reproducible. Es estado del operador, no del paciente. Dos movimientos:
 *
 *  - **La pared que respira bajo la sonda.** En respiración libre, el volumen mamario se mueve de espiración a inspiración AP
 *    1,29 ± 0,59 mm, craneocaudal 1,00 ± 0,51 mm y mediolateral 0,94 ± 0,52 mm (TC 4D, 100 pacientes; [@jo-movimiento-2026]).
 *    Se toma por el movimiento de la pared bajo la sonda: es una extrapolación (otra estructura, la pared anterior, y en todos
 *    los puntos). Con la inspiración profunda la pared anterior se mueve unas 3,5 veces más (AP 4,2–5,4 mm y SI 2,5–2,6 entre
 *    la espiración y la inspiración profunda sostenidas; [@lowanichkiattikul-pared-2016]), como el diafragma (53 frente a 16
 *    mm): el movimiento sigue la fracción de la excursión tranquila del diafragma, en lineal. La mano que sostiene la sonda
 *    sigue una fracción de ese movimiento, `chestFollow`: con 1 la sonda va pegada a la pared y no hay movimiento relativo;
 *    con 0 la mano queda quieta en la sala y la pared se mueve entera bajo la sonda. Ninguna fuente mide esa fracción: su
 *    rango son los dos extremos físicos y su valor sale de la exploración del banco (decisión 24).
 *  - **El temblor fisiológico de la mano**, con el pico de resonancia de la mano en 7–11 Hz, ≈ 8 Hz de media
 *    ([@lakie-temblor-2012]; con la carga de una sonda la resonancia baja algo), y una amplitud de 16, 2 y 24 µm rms por eje
 *    (30 µm el vector) en la punta de un instrumento sostenido en el aire ([@singh-temblor-2002], cirugía de retina). Con la
 *    sonda apoyada en el paciente es menor: el eje mayor es la cota de arriba de su rango. Es una suma de senos con
 *    frecuencias y fases de la semilla del operador, evaluada en el tiempo del reloj: dos cuadros en el mismo instante y con la
 *    misma semilla dan la misma sonda.
 *
 * Se aplica como una traslación rígida de la sonda y de su compresión (decisión 63), sin recalcular el contacto
 * (`translateContact`): los desplazamientos son de décimas de milímetro a ~1 mm, frente a los 10–30 mm del hundimiento de la
 * cara. No comprime: el componente AP acerca la pared entera a la sonda (`operator-hand-rigid`).
 */
export const OPERATOR_HAND = defineParameters('probe.operatorHand', {
  chestApMm: {
    value: 1.29,
    unit: 'mm',
    range: [0.7, 1.88],
    evidence: 'extrapolacion',
    sources: ['jo-movimiento-2026', 'lowanichkiattikul-pared-2016'],
    note: 'Movimiento AP del volumen mamario en respiración libre (media ± DE, TC 4D), tomado por el de la pared bajo la sonda: por la normal de la piel, hacia fuera en la inspiración',
  },
  chestSiMm: {
    value: 1.0,
    unit: 'mm',
    range: [0.49, 1.51],
    evidence: 'extrapolacion',
    sources: ['jo-movimiento-2026', 'lowanichkiattikul-pared-2016'],
    note: 'Movimiento craneocaudal del volumen mamario en respiración libre (media ± DE, TC 4D), tomado por el de la pared: hacia craneal en la inspiración',
  },
  chestLrMm: {
    value: 0.94,
    unit: 'mm',
    range: [0.42, 1.46],
    evidence: 'extrapolacion',
    sources: ['jo-movimiento-2026'],
    note: 'Movimiento mediolateral del volumen mamario en respiración libre (media ± DE, TC 4D), tomado por el de la pared: hacia fuera de la línea media, proporcional a la distancia a ella (0 en la línea media)',
  },
  chestFollow: {
    value: 0.75,
    unit: 'fracción',
    range: [0, 1],
    evidence: 'estimado',
    sources: [],
    note: 'Fracción del movimiento de la pared que sigue la mano: 1, la sonda pegada a la pared; 0, la mano quieta en la sala. Sin fuente: el rango son los extremos físicos; 0,75 se eligió con la exploración del banco (decisión 39: T2 de la pared, S1 y su decorrelación con el protocolo de los clips), con el temblor acotado por F-T11; se compensa con el temblor (sin la guarda ganaba 0,65 con 0,024)',
  },
  tremorRmsMm: {
    value: 0.012,
    unit: 'mm',
    range: [0, 0.024],
    evidence: 'estimado',
    sources: ['singh-temblor-2002'],
    note: 'Temblor fisiológico de la mano, rms por eje. Arriba, el eje mayor de un instrumento sostenido en el aire en cirugía de retina (16, 2 y 24 µm rms por eje; 30 µm el vector); con la sonda apoyada en el paciente, menos. La exploración del banco lo llevaba al borde de arriba; la guarda de F-T11 (la estratósfera en apnea, ≥ 0,95 en ocho semillas) lo acota en 0,012 (decisión 39)',
  },
  tremorHz: {
    value: 9,
    unit: 'Hz',
    range: [7, 11],
    evidence: 'documentado',
    sources: ['lakie-temblor-2012'],
    note: 'Centro de la banda del pico de resonancia del temblor postural de la mano (7–11 Hz; ≈ 8 de media, algo menos con la carga de la sonda): los senos del temblor se reparten en ±2 Hz',
  },
});

const P = OPERATOR_HAND.params;
/** Senos del temblor por eje. */
export const TREMOR_COMPONENTS = 6;

/** Las componentes del temblor de una semilla: por eje, frecuencia (Hz) y fase (rad) de cada seno. */
export type TremorComponents = { hz: number; phase: number }[][];

/**
 * Estado del operador: su semilla (la del temblor), si la mano está activa (se puede apagar para aislar otra cosa) y lo que
 * sigue de la pared y su temblor (los del registro; el barrido de la exploración los cambia sin recompilar).
 */
export interface OperatorState {
  seed: number;
  enabled: boolean;
  chestFollow: number;
  tremorRmsMm: number;
}

/** El operador por omisión con una semilla. */
export function defaultOperator(seed: number): OperatorState {
  return { seed, enabled: true, chestFollow: P.chestFollow.value, tremorRmsMm: P.tremorRmsMm.value };
}

/** Generador congruencial determinista en [0, 1) (el de `SIDELOBE_PHASES`). */
function lcg(seed: number): () => number {
  let s = Math.floor(Math.abs(seed)) % 2147483648;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/**
 * Las componentes del temblor de una semilla: por eje, `TREMOR_COMPONENTS` senos con frecuencias en la banda del pico
 * (`tremorHz` ± 2 Hz) y fases aleatorias, de amplitud igual y rms total el del temblor (rms de un seno: a/√2).
 */
export function tremorComponents(seed: number): TremorComponents {
  const rnd = lcg(seed * 7919 + 17);
  return [0, 1, 2].map(() =>
    Array.from({ length: TREMOR_COMPONENTS }, () => ({ hz: P.tremorHz.value - 2 + 4 * rnd(), phase: 2 * Math.PI * rnd() })),
  );
}

/** Desplazamiento del temblor (mm) en los tres ejes del mundo en el instante t (s). */
export function tremorMm(t: number, comps: TremorComponents, rmsMm = P.tremorRmsMm.value): Vec3 {
  const a = (rmsMm * Math.SQRT2) / Math.sqrt(TREMOR_COMPONENTS);
  const axis = (k: number): number => comps[k].reduce((s, c) => s + a * Math.sin(2 * Math.PI * c.hz * t + c.phase), 0);
  return [axis(0), axis(1), axis(2)];
}

/**
 * Desplazamiento de la pared (mm, mundo) en el punto de la piel p, con la fracción `breath` de la excursión tranquila del
 * diafragma: AP por la normal hacia fuera; craneocaudal hacia craneal (+z); mediolateral, la proyección en el plano de la piel
 * del eje izquierda–derecha (la x del tronco), hacia fuera y proporcional a la distancia a la línea media (x/a: 0 en el
 * esternón y en la columna, entero en el flanco, sin saltos).
 */
export function chestWallDisplacementMm(p: Vec3, torso: Torso, breath: number): Vec3 {
  const n = torsoNormal(p, torso);
  const lateral = Math.max(-1, Math.min(1, p[0] / torso.a));
  const d = dot([1, 0, 0], n);
  const lx: Vec3 = [(1 - d * n[0]) * lateral, -d * n[1] * lateral, -d * n[2] * lateral];
  const ap = P.chestApMm.value * breath;
  const si = P.chestSiMm.value * breath;
  const lr = P.chestLrMm.value * breath;
  return [n[0] * ap + lx[0] * lr, n[1] * ap + lx[1] * lr, n[2] * ap + si + lx[2] * lr];
}

/**
 * Traslación de la sonda respecto del tórax (mm, mundo) en el instante: −(1 − chestFollow)·(movimiento de la pared) más el
 * temblor. El tórax del simulador no se mueve en el mundo, así que la pared que se mueve bajo la sonda quieta es la sonda
 * que se mueve al revés sobre la pared.
 */
export function operatorOffsetMm(
  op: OperatorState,
  skinPoint: Vec3,
  torso: Torso,
  breath: number,
  t: number,
  comps: TremorComponents = tremorComponents(op.seed),
): Vec3 {
  if (!op.enabled) return [0, 0, 0];
  const w = chestWallDisplacementMm(skinPoint, torso, breath);
  const k = -(1 - op.chestFollow);
  const tr = tremorMm(t, comps, op.tremorRmsMm);
  return [k * w[0] + tr[0], k * w[1] + tr[1], k * w[2] + tr[2]];
}

/**
 * El contacto trasladado rígidamente `d` mm: la sonda y su compresión, sin recalcular el contacto. Con d = 0, el mismo objeto.
 */
export function translateContact(k: ProbeContact, d: Vec3): ProbeContact {
  if (d[0] === 0 && d[1] === 0 && d[2] === 0) return k;
  const move = (p: Vec3): Vec3 => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
  return {
    ...k,
    center: move(k.center),
    frame: { ...k.frame, face: move(k.frame.face), curvatureCenter: move(k.frame.curvatureCenter), skinPoint: move(k.frame.skinPoint) },
  };
}
