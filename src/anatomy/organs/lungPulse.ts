import { defineParameters } from '../../core/evidence';
import { smoothstep, type Vec3 } from '../../core/vec3';
import { torsoNormal, type Torso } from '../primitives';
import { heartLocal, heartSd, type Heart } from './heart';

/**
 * El pulso pulmonar (lus-sim, decisión 32; meta A-T16): el pulmón junto al corazón se mueve con el latido, y en apnea, sin
 * deslizamiento, ese movimiento de la pleura visceral es lo que se ve (Lichtenstein 2003). La base no tiene la amplitud
 * ecográfica (`docs/knowledge/physics.md` D12, NO ENCONTRADO también en la búsqueda de 2026); tiene el movimiento del borde
 * del pulmón junto al corazón por TAC (Hsu 2017, D12a) y del pulmón por RM (White 2014, D12b), y dos cotas ecográficas en
 * apnea con el ruido del método dentro (Costamagna 2026, Fung 2025).
 *
 * Modelo. El campo del latido es u(x) = −A·e(t)·g(d)·n̂c: el pulmón sigue a la cara del corazón, que en la sístole se retira
 * por su normal (n̂c, la del elipsoide en x: Hsu mide el borde perpendicular a la pared del corazón). La amplitud A es la del
 * borde junto a la pared libre del ventrículo izquierdo (`leftVentricleMm`) en las caras de los lados y de detrás, y la del
 * ventrículo derecho (`rightVentricleMm`) en la cara anterior, la de la ventana (la pared libre del ventrículo derecho en
 * `heart.ts`), mezcladas con n̂c·e3 [SUPUESTO: la mezcla]. Decae con la distancia d a la cara del corazón (`heartSd`) como
 * g = 1 − smoothstep(0, `reachMm`, d) y es 0 desde `reachMm` (lejos del corazón, nada). e(t), la fracción del volumen latido
 * expulsada (`physiology/ventricle.ts`: 0 en la telediástole, 1 en la telesístole, donde White mide el máximo). La pleura
 * visceral está pegada a la parietal (sin derrame): de ese campo solo se desliza su parte tangente a la pared,
 * v = (I − n̂n̂ᵀ)·u (n̂, la normal del tronco); la normal la comprime el aire del pulmón entre el corazón y la pared. Por eso
 * donde la cara del corazón es paralela a la pared casi no se desliza, y sí en sus bordes, donde la cara está oblicua. Es un
 * deslizamiento como el respiratorio (decisión 19): mueve la arena del pulmón bajo la pleura, no la pared, y es la base de la
 * sinusoide del derrame cuando haya líquido (entonces la parte normal deja de comprimirse contra la pared).
 *
 * La inversa (el pulmón que está ahora en p estaba en x, con x + v(x) = p): punto fijo x ← p − v(x), que converge porque v es
 * contractiva (su constante de Lipschitz, `LUNG_PULSE_INVERSE.lipschitz`, la comprueba `lungPulse.test.ts` con las mayores
 * amplitudes del rango en el pulmón de la banda subpleural, 0–10 mm bajo la pleura: la GLSL solo lo evalúa en la pleura de cada
 * línea); tras `steps` pasos el error es ≤ L^steps·|v| ≤ la tolerancia. El mapa x ↦ x + v(x) es por eso un difeomorfismo
 * (jacobiano > 0): el latido no pliega la arena del pulmón.
 */
export const LUNG_PULSE = defineParameters('anatomy.lungPulse', {
  leftVentricleMm: {
    value: 7.37,
    unit: 'mm',
    range: [4.99, 11.02],
    evidence: 'derivado',
    sources: ['hsu-margen-2017'],
    note:
      'Ancho que barre el borde mediastino–pulmón junto a la pared libre del ventrículo izquierdo entre las fases del 10 al ' +
      '90 % del RR (de pico a pico), perpendicular a la pared del corazón, en el plano axial (TAC coronaria con sincronía ECG, ' +
      '38 adultos de 58 ± 10 años, con propranolol y nitroglicerina; Tabla 2): 6,98 ± 1,99 mm en la parte alta y 7,76 ± 3,26 ' +
      'en la baja; el valor, la media de las dos, y el rango, de la media menos una DE de la alta a la media más una DE de la baja',
  },
  rightVentricleMm: {
    value: 2.7,
    unit: 'mm',
    range: [1.7, 3.7],
    evidence: 'documentado',
    sources: ['hsu-margen-2017'],
    note: 'El mismo borde junto al ventrículo derecho (Hsu 2017, Tabla 2): 2,70 ± 1,00 mm; el rango, ± una DE',
  },
  reachMm: {
    value: 40,
    unit: 'mm',
    range: [25, 60],
    evidence: 'estimado',
    sources: ['white-pulmoncardiaco-2014'],
    note:
      'Distancia a la cara del corazón a la que el campo se apaga [ESTIMADO]. White 2014 (RM con sincronía ECG, 10 sanos en ' +
      'apnea): el desplazamiento cardiaco del tejido pulmonar imagenado (sin los vasos) pasa de 1 mm solo en el 15,5 % de los ' +
      'vóxeles, «casi exclusivamente» junto al corazón, y cae deprisa fuera de esa zona; no da la distancia. Con 40 mm, los ' +
      '7,4 mm del ventrículo izquierdo bajan a 1 mm a ≈ 30 mm del corazón (1 − smoothstep = 0,135). Seppenwoolde 2002 (solo el ' +
      'resumen): 1–4 mm en los tumores cerca del corazón; Chen 2014 no halla relación con la distancia (tumores unidos a ' +
      'tejidos quietos)',
  },
});

/**
 * La inversa por punto fijo: `lipschitz` es la cota de |∇v| con las mayores amplitudes del rango, comprobada por
 * `lungPulse.test.ts`; con ella, `steps` pasos dejan el error bajo `toleranceMm` con cualquier amplitud del rango.
 */
export const LUNG_PULSE_INVERSE = Object.freeze({ steps: 25, toleranceMm: 0.05, lipschitz: 0.8 });
if (LUNG_PULSE.params.leftVentricleMm.range![1] * LUNG_PULSE_INVERSE.lipschitz ** LUNG_PULSE_INVERSE.steps > LUNG_PULSE_INVERSE.toleranceMm)
  throw new Error('el punto fijo del pulso pulmonar no alcanza su tolerancia con la mayor amplitud');

/** Las amplitudes del borde (mm): la del ventrículo izquierdo y la del derecho; por omisión, las del modelo. */
export interface LungPulseAmplitudes {
  leftMm: number;
  rightMm: number;
}
const MODEL_AMPLITUDES: LungPulseAmplitudes = {
  leftMm: LUNG_PULSE.params.leftVentricleMm.value,
  rightMm: LUNG_PULSE.params.rightVentricleMm.value,
};

/**
 * Deslizamiento del pulmón por el latido en x (mm) con la fracción expulsada `ejection` (gemelo GLSL, que la lee de
 * `uLungPulse`): la parte tangente a la pared del campo que sigue a la cara del corazón.
 */
export function lungPulseShift(h: Heart, t: Torso, x: Vec3, ejection: number, amp: LungPulseAmplitudes = MODEL_AMPLITUDES): Vec3 {
  if (!(ejection > 0)) return [0, 0, 0];
  const reach = LUNG_PULSE.params.reachMm.value;
  const d = heartSd(h, x);
  if (d >= reach) return [0, 0, 0];
  // la normal del elipsoide en x: el gradiente de |q/r|² en su marco, llevado al mundo
  const q = heartLocal(h, x);
  const a = q[0] / (h.radii[0] * h.radii[0]);
  const b = q[1] / (h.radii[1] * h.radii[1]);
  const c = q[2] / (h.radii[2] * h.radii[2]);
  const L = Math.hypot(a, b, c);
  if (!(L > 0)) return [0, 0, 0];
  const nc: Vec3 = [
    (a * h.e1[0] + b * h.e2[0] + c * h.e3[0]) / L,
    (a * h.e1[1] + b * h.e2[1] + c * h.e3[1]) / L,
    (a * h.e1[2] + b * h.e2[2] + c * h.e3[2]) / L,
  ];
  const front = Math.min(1, Math.max(0, c / L));
  const A = amp.leftMm + (amp.rightMm - amp.leftMm) * front;
  const n = torsoNormal(x, t);
  const nn = nc[0] * n[0] + nc[1] * n[1] + nc[2] * n[2];
  const k = -ejection * A * (1 - smoothstep(0, reach, Math.max(d, 0)));
  return [k * (nc[0] - nn * n[0]), k * (nc[1] - nn * n[1]), k * (nc[2] - nn * n[2])];
}

/** El punto x del pulmón (antes del latido) que está ahora en p: x + v(x) = p, por punto fijo (gemelo GLSL). */
export function lungPulseInverse(h: Heart, t: Torso, p: Vec3, ejection: number, amp: LungPulseAmplitudes = MODEL_AMPLITUDES): Vec3 {
  if (!(ejection > 0) || heartSd(h, p) >= LUNG_PULSE.params.reachMm.value + ejection * Math.max(amp.leftMm, amp.rightMm)) return p;
  let x: Vec3 = p;
  for (let i = 0; i < LUNG_PULSE_INVERSE.steps; i++) {
    const v = lungPulseShift(h, t, x, ejection, amp);
    x = [p[0] - v[0], p[1] - v[1], p[2] - v[2]];
  }
  return x;
}

/**
 * Gemelo GLSL (va tras el corazón: usa `heartSd`, `heartLocal`, los `uHeart*` y `torsoNormal`). `uLungPulse` = e(t), la
 * fracción expulsada del instante. El bucle de la inversa es corto y barato a propósito (una distancia al elipsoide y su
 * normal por paso); fuera del alcance del corazón no entra.
 */
export const LUNG_PULSE_GLSL = /* glsl */ `
#define LP_REACH ${LUNG_PULSE.params.reachMm.value.toFixed(4)}
#define LP_LV ${LUNG_PULSE.params.leftVentricleMm.value.toFixed(4)}
#define LP_RV ${LUNG_PULSE.params.rightVentricleMm.value.toFixed(4)}
#define LP_STEPS ${LUNG_PULSE_INVERSE.steps}
vec3 lungPulseShift(vec3 x) {
  float d = heartSd(x);
  if (uLungPulse <= 0.0 || d >= LP_REACH) return vec3(0.0);
  vec3 r = vec3(uHeartE1.w, uHeartE2.w, uHeartE3.w);
  vec3 g = heartLocal(x) / (r * r);
  float L = length(g);
  if (L <= 0.0) return vec3(0.0);
  vec3 nc = (g.x * uHeartE1.xyz + g.y * uHeartE2.xyz + g.z * uHeartE3.xyz) / L;
  float A = mix(LP_LV, LP_RV, clamp(g.z / L, 0.0, 1.0));
  vec3 n = torsoNormal(x);
  return -uLungPulse * A * (1.0 - smoothstep(0.0, LP_REACH, max(d, 0.0))) * (nc - dot(nc, n) * n);
}
vec3 lungPulseInverse(vec3 p) {
  if (uLungPulse <= 0.0 || heartSd(p) >= LP_REACH + uLungPulse * max(LP_LV, LP_RV)) return p;
  vec3 x = p;
  for (int i = 0; i < LP_STEPS; i++) x = p - lungPulseShift(x);
  return x;
}
`;
