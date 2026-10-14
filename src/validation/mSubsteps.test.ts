import { describe, expect, it } from 'vitest';
import { M_COLUMNS, M_SUBSTEPS_MAX, mSubstepBudget, mSubstepSamples } from '../ultrasound/mmode';

/**
 * Las columnas M de los pasos del reloj entre dos cuadros (decisión 54): cuáles de las muestras de la fisiología se
 * registran además de la del cuadro, cuántas como mucho y en qué orden.
 */
const samples = (ts: number[]) => ts.map((t) => ({ t }));

describe('mSubstepSamples', () => {
  it('toma las muestras estrictamente entre los dos cuadros, en orden', () => {
    const out = mSubstepSamples(samples([0, 0.004, 0.008, 0.012, 0.016]), 0, 0.016);
    expect(out.map((s) => s.t)).toEqual([0.004, 0.008, 0.012]);
  });
  it('con más pasos que el tope, reparte por igual y conserva el orden', () => {
    const ts = Array.from({ length: 25 }, (_, i) => i * 0.004);
    const out = mSubstepSamples(samples(ts), 0, 0.1, 4);
    expect(out).toHaveLength(4);
    expect(out.map((s) => s.t)).toEqual([...out.map((s) => s.t)].sort((a, b) => a - b));
    for (let i = 1; i < out.length; i++) expect(out[i].t - out[i - 1].t).toBeCloseTo(0.02, 2);
    expect(out[out.length - 1].t).toBeLessThan(0.1);
  });
  it('sin pasos intermedios, sin reloj que avance o sin tope, nada', () => {
    expect(mSubstepSamples(samples([0, 0.004]), 0, 0.004)).toEqual([]);
    expect(mSubstepSamples(samples([0, 0.004]), 0.004, 0.004)).toEqual([]);
    expect(mSubstepSamples(samples([0, 0.002, 0.004]), 0, 0.004, 0)).toEqual([]);
  });
  it('el anillo guarda al menos 8 s a la cadencia máxima (el barrido más largo de la interfaz)', () => {
    expect(M_COLUMNS).toBeGreaterThanOrEqual(8 * 60 * (M_SUBSTEPS_MAX + 1));
  });
  it('el presupuesto por tiempo de cuadro: el tope con GPU real, 2 con cuadros lentos, 0 con SwiftShader', () => {
    expect(mSubstepBudget(1 / 60)).toBe(M_SUBSTEPS_MAX);
    expect(mSubstepBudget(1 / 15)).toBe(M_SUBSTEPS_MAX);
    expect(mSubstepBudget(1 / 10)).toBe(2);
    expect(mSubstepBudget(0.5)).toBe(0);
    expect(mSubstepBudget(0)).toBe(M_SUBSTEPS_MAX);
  });
});
