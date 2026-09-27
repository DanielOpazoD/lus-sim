import { describe, expect, it } from 'vitest';
import {
  crossingLag,
  finite,
  mean,
  median,
  medianIqr,
  otsu,
  parabolicPeak,
  pearson,
  quantile,
  robustLine,
  slope,
  std,
} from '../measure/fidelity/stats';

/**
 * Estadística del banco de fidelidad (decisión 21): cada función con una respuesta conocida y, donde el banco lo necesita,
 * su equivarianza a x → a·x + b (lo que hace invariantes a las métricas de encima).
 */
describe('estadística del banco de fidelidad', () => {
  it('cuantiles con interpolación, mediana, IQR, media y desviación típica sobre los valores finitos', () => {
    const v = [3, Number.NaN, 1, 2, 4, Number.POSITIVE_INFINITY];
    expect(finite(v)).toEqual([3, 1, 2, 4]);
    expect(quantile(v, 0)).toBe(1);
    expect(quantile(v, 1)).toBe(4);
    expect(quantile(v, 0.5)).toBe(2.5);
    expect(quantile(v, 0.25)).toBe(1.75);
    expect(quantile(v, -3)).toBe(1);
    expect(median([5])).toBe(5);
    expect(Number.isNaN(median([]))).toBe(true);
    expect(medianIqr([1, 2, 3, 4, 5])).toEqual({ median: 3, p25: 2, p75: 4, n: 5 });
    expect(mean([1, 2, Number.NaN, 3])).toBe(2);
    expect(Number.isNaN(mean([Number.NaN]))).toBe(true);
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(Number.isNaN(std([]))).toBe(true);
  });

  it('Pearson: ±1 con una recta, invariante a transformaciones afines crecientes, NaN si una serie es constante', () => {
    const a = [1, 2, 3, 4, 5];
    expect(pearson(a, [2, 4, 6, 8, 10])).toBeCloseTo(1, 12);
    expect(pearson(a, [5, 4, 3, 2, 1])).toBeCloseTo(-1, 12);
    const b = [1, 3, 2, 5, 4];
    expect(
      pearson(
        a.map((x) => 3 * x + 7),
        b,
      ),
    ).toBeCloseTo(pearson(a, b), 12);
    expect(Number.isNaN(pearson(a, [1, 1, 1, 1, 1]))).toBe(true);
    expect(Number.isNaN(pearson([1, 2], [1, 2]))).toBe(true);
    expect(pearson([1, Number.NaN, 2, 3], [1, 5, 2, 3])).toBeCloseTo(1, 12);
  });

  it('Otsu exacto: separa dos grupos, η alto; el umbral se transforma con el dato', () => {
    const v = [0.1, 0.12, 0.11, 0.09, 0.8, 0.82, 0.79, 0.81];
    const s = otsu(v);
    expect(s.threshold).toBeGreaterThan(0.12);
    expect(s.threshold).toBeLessThan(0.79);
    expect(s.eta).toBeGreaterThan(0.99);
    const t = otsu(v.map((x) => 2 * x + 5));
    expect(t.threshold).toBeCloseTo(2 * s.threshold + 5, 12);
    expect(t.eta).toBeCloseTo(s.eta, 12);
    expect(Number.isNaN(otsu([1, 1, 1]).threshold)).toBe(true);
    expect(Number.isNaN(otsu([1]).eta)).toBe(true);
  });

  it('recta robusta: ignora los puntos fuera de la recta y no se ajusta sin dos y distintas', () => {
    const ys = Array.from({ length: 40 }, (_, i) => i);
    const xs = ys.map((y) => 10 - 0.5 * y);
    xs[5] = 100;
    xs[17] = -50;
    xs[30] = 80;
    const l = robustLine(ys, xs, 1)!;
    expect(l.a).toBeCloseTo(10, 9);
    expect(l.b).toBeCloseTo(-0.5, 9);
    expect(l.inliers).toBe(37);
    expect(robustLine([1], [1], 1)).toBeNull();
    expect(robustLine([2, 2], [1, 3], 1)).toBeNull();
  });

  it('pico parabólico, pendiente y cruce de nivel', () => {
    // parábola y = −(x − 0,3)² + 1 muestreada en −1, 0, 1
    const f = (x: number) => 1 - (x - 0.3) ** 2;
    const p = parabolicPeak(f(-1), f(0), f(1));
    expect(p.offset).toBeCloseTo(0.3, 12);
    expect(p.value).toBeCloseTo(1, 12);
    expect(parabolicPeak(1, 1, 1)).toEqual({ offset: 0, value: 1 });
    expect(slope([0, 1, 2, 3], [1, 3, 5, 7])).toBeCloseTo(2, 12);
    expect(Number.isNaN(slope([1, 1], [1, 2]))).toBe(true);
    expect(crossingLag([1, 0.8, 0.4, 0.1], 0.5)).toBeCloseTo(1.75, 12);
    expect(crossingLag([1, 0.5, 0.5, 0.2], 0.5)).toBeCloseTo(2, 12);
    expect(Number.isNaN(crossingLag([1, 0.9, 0.8], 0.5))).toBe(true);
  });
});
