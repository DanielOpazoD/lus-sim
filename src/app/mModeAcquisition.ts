import type { Simulator } from './simulator';

/** Una franja pertenece a una línea, una pose y unos ajustes; no a una etiqueta clínica. */
type Source = Pick<Simulator, 'frozen' | 'pose' | 'bmode'> & {
  renderer: { mStrip: { clear(): void } };
};

/**
 * Frontera de adquisición del modo M. No tiene reloj ni genera señal: decide cuándo empezar
 * otra franja antes de que el renderizador copie la línea del cuadro B que está formando.
 */
export class MModeAcquisition {
  private previous: { source: Source; renderer: Source['renderer']; values: number[] } | null = null;

  reset(): void {
    this.previous = null;
  }

  prepare(source: Source, enabled: boolean, theta: number): number | undefined {
    if (!enabled) {
      this.reset();
      return undefined;
    }
    if (source.frozen) return undefined;
    if (!Number.isFinite(theta)) throw new RangeError('Modo M: ángulo no finito');
    const { pose: p, bmode: b, renderer } = source;
    const values = [
      theta,
      p.phi,
      p.z,
      p.lift,
      p.yaw,
      p.rock,
      p.tilt,
      b.depthMm,
      b.focusMm,
      b.gainDb,
      b.dynamicRangeDb,
      b.persistence,
      Number(b.compound),
      Number(b.harmonic),
      ...b.tgcDb,
    ];
    const last = this.previous;
    if (
      !last ||
      last.source !== source ||
      last.renderer !== renderer ||
      last.values.length !== values.length ||
      values.some((value, i) => value !== last.values[i])
    ) {
      renderer.mStrip.clear();
      // Copia numérica: una mutación posterior de la pose o de la TGC tampoco mezcla adquisiciones.
      this.previous = { source, renderer, values };
    }
    return theta;
  }
}
