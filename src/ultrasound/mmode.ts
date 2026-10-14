/**
 * Modo M (decisión 80): en cada cuadro la GPU copia la línea M de la envolvente mostrada (con el mapa de grises
 * del modo B) a una columna de una textura en anillo, la franja; para verla, cada píxel de la franja toma la
 * columna que cubre su instante (`MColumnRing.pixelSlots`). Nada vuelve a la CPU.
 */

/** Filas de una columna (de la cara a la profundidad del sector): 0,35 mm a 18 cm. */
export const M_SAMPLES = 512;
/** Columnas del anillo de la franja: 16 s a la cadencia del reloj (250 columnas/s; 2 MB en R8). */
export const M_COLUMNS = 4096;
/**
 * Columnas de la franja por cuadro además de la del propio cuadro (decisión 54): los instantes del reloj único (pasos de
 * 4 ms) entre el cuadro anterior y este, hasta este tope. Con 60 cuadros por segundo caben los 4 pasos de cada cuadro
 * (la franja a 250 columnas/s, la cadencia del reloj); con menos cuadros, la cadencia baja a 5 × cuadros/s. Tope de
 * presupuesto, no un número físico: cada columna extra cuesta ≈ 0,4 pasadas B–K sobre la banda de la línea M.
 */
export const M_SUBSTEPS_MAX = 4;

/**
 * Instantes del reloj que la franja registra entre dos cuadros (decisión 54): de las muestras de la fisiología con
 * `tPrev` < t < `tNow` (las de los pasos del reloj dados en este cuadro), como mucho `max`, repartidas por igual (la última
 * de cada tramo), y en orden. La del propio cuadro (`tNow`) la registra el cuadro.
 */
export function mSubstepSamples<T extends { t: number }>(samples: readonly T[], tPrev: number, tNow: number, max = M_SUBSTEPS_MAX): T[] {
  if (!(max >= 1) || !(tNow > tPrev)) return [];
  const between: T[] = [];
  for (const s of samples) if (s.t > tPrev && s.t < tNow) between.push(s);
  if (between.length <= max) return between;
  const out: T[] = [];
  for (let k = 1; k <= max; k++) out.push(between[Math.ceil((k * between.length) / (max + 1)) - 1]);
  return out.filter((s, i) => i === 0 || s !== out[i - 1]);
}
/**
 * Hueco máximo entre dos columnas seguidas (s): el bucle avanza como mucho 0,25 s por cuadro. Un hueco mayor (el reloj
 * avanzado sin dibujar) se queda en negro en vez de rellenarse con la columna siguiente.
 */
export const M_MAX_GAP_S = 0.5;

/** Coordenada u de la línea θ en la textura polar: la misma que usa la conversión de barrido. */
export function mLineU(theta: number, halfSector: number): number {
  return (theta + halfSector) / (2 * halfSector);
}

/**
 * Instantes de las columnas del anillo de la franja M: la columna i (0 = la más vieja) está en la ranura
 * `slot(i)` de la textura y cubre (t de la anterior, t]. Una profundidad distinta o un reloj que vuelve atrás
 * empiezan una franja nueva; el mismo instante (reloj quieto) reescribe la última columna. `version` cambia con
 * cada columna para que la vista sepa cuándo volver a dibujar.
 */
export class MColumnRing {
  private readonly times: Float64Array;
  private head = 0;
  count = 0;
  depthMm = 0;
  version = 0;

  constructor(readonly capacity = M_COLUMNS) {
    this.times = new Float64Array(capacity);
  }

  /** Ranura de la columna del instante t. */
  push(t: number, depthMm: number): number {
    const last = this.count ? this.times[this.slot(this.count - 1)] : Number.NaN;
    if (this.count && (depthMm !== this.depthMm || t < last)) this.count = 0;
    this.depthMm = depthMm;
    this.version++;
    if (t === last && this.count) return this.slot(this.count - 1);
    const slot = this.head;
    this.times[slot] = t;
    this.head = (slot + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
    return slot;
  }

  clear(): void {
    this.count = 0;
    this.version++;
  }

  slot(i: number): number {
    return (this.head - this.count + i + this.capacity) % this.capacity;
  }

  time(i: number): number {
    return this.times[this.slot(i)];
  }

  /**
   * Columna de cada píxel de una franja de W píxeles que termina en el instante `tRight` y muestra
   * `secondsVisible` (el eje de `ecgX`): la ranura de la primera columna con t ≥ el instante del centro del píxel,
   * o −1 si no hay (antes de la primera columna, después de la última o en un hueco de más de `M_MAX_GAP_S`).
   */
  pixelSlots(tRight: number, secondsVisible: number, W: number, out = new Float32Array(W)): Float32Array {
    let i = 0;
    const n = this.count;
    for (let x = 0; x < W; x++) {
      const t = tRight - secondsVisible + ((x + 0.5) / W) * secondsVisible;
      while (i < n && this.time(i) < t) i++;
      const ok = i < n && (i > 0 ? this.time(i) - this.time(i - 1) <= M_MAX_GAP_S : this.time(0) === t);
      out[x] = ok ? this.slot(i) : -1;
    }
    return out;
  }
}
