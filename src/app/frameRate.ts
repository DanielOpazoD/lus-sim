/**
 * FPS reales del modo B en el navegador (lus-sim, decisión 40): el indicador de O6 (`docs/MISSION.md`: modo B a ≥ 30 FPS en
 * un computador moderno). Cuenta solo los cuadros que se dibujan de verdad (en vivo y con la GPU; con la imagen congelada o el
 * contexto perdido el bucle sigue, pero no forma imagen) en una ventana de los últimos `windowMs`, y da también los intervalos
 * entre cuadros (la mediana y el p95, el intervalo en la posición ⌈0,95·n⌉ de los n ordenados: los tirones que la media
 * esconde). Quien la alimenta vacía la ventana (`reset`) en los huecos sin cuadros (congelar, perder la GPU, ocultar la
 * pestaña), para que no cuenten como un cuadro de varios segundos.
 */
export interface BmodeFrameRateSummary {
  /** Cuadros por segundo: (cuadros − 1) / (último − primero). */
  fps: number;
  /** Cuadros en la ventana y su duración (s). */
  frames: number;
  windowS: number;
  /** Intervalo entre cuadros consecutivos (ms): la mediana y el p95. */
  frameMsP50: number;
  frameMsP95: number;
}

export class BmodeFrameRate {
  private times: number[] = [];

  constructor(private readonly windowMs = 10_000) {
    if (!(windowMs > 0)) throw new RangeError(`BmodeFrameRate: ventana ${windowMs} ms (> 0)`);
  }

  /** Un cuadro del modo B dibujado en `nowMs` (el reloj de `requestAnimationFrame`). */
  frame(nowMs: number): void {
    this.times.push(nowMs);
    const from = nowMs - this.windowMs;
    let drop = 0;
    while (drop < this.times.length && this.times[drop] < from) drop++;
    if (drop) this.times.splice(0, drop);
  }

  /** Sin cuadros (imagen congelada, contexto perdido): la ventana vuelve a empezar. */
  reset(): void {
    this.times = [];
  }

  /** El resumen de la ventana, o null con menos de dos cuadros. */
  summary(): BmodeFrameRateSummary | null {
    const t = this.times;
    if (t.length < 2) return null;
    const span = t[t.length - 1] - t[0];
    const gaps = t
      .slice(1)
      .map((x, i) => x - t[i])
      .sort((a, b) => a - b);
    const q = (p: number): number => gaps[Math.min(gaps.length - 1, Math.max(0, Math.ceil(p * gaps.length) - 1))];
    return {
      fps: span > 0 ? ((t.length - 1) * 1000) / span : Number.POSITIVE_INFINITY,
      frames: t.length,
      windowS: span / 1000,
      frameMsP50: q(0.5),
      frameMsP95: q(0.95),
    };
  }
}
