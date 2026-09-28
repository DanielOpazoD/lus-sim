import type { Censor, MetricSummary, StackMetrics } from './metrics';
import { finite, quantile } from './stats';

/**
 * Distribuciones de referencia y comparación simulador frente a banco (decisión 21; `docs/knowledge/reference-images.md`
 * §3.1, paso 8, y §3.3): cada métrica del banco de referencia se resume por estrato de sonda con la distribución entre clips
 * (la mediana de cada clip) y entre sujetos, y el valor del simulador se sitúa frente a su p10–p90. Solo informa: la
 * tolerancia la fija la calibración (ciclo 3b). Un valor censurado es una cota, no una medida: nunca sale por debajo ni por
 * encima de la referencia; tampoco un estrato con menos de `MIN_CLIPS` clips o `MIN_SUBJECTS` sujetos.
 */
export interface Quantiles {
  p10: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  p90: number | null;
  n: number;
}

/** Un estrato con menos clips o sujetos no es una distribución: se informa sin situar al simulador. */
export const MIN_CLIPS = 3;
export const MIN_SUBJECTS = 2;

const num = (x: number): number | null => (Number.isFinite(x) ? Number(x.toPrecision(6)) : null);

/** Cuantiles p10, p25, p50, p75 y p90 de los valores finitos (null si no hay). */
export function quantilesOf(values: readonly number[]): Quantiles {
  const f = finite(values);
  return {
    p10: num(quantile(f, 0.1)),
    p25: num(quantile(f, 0.25)),
    median: num(quantile(f, 0.5)),
    p75: num(quantile(f, 0.75)),
    p90: num(quantile(f, 0.9)),
    n: f.length,
  };
}

/** Una métrica de un estrato: la distribución entre clips y entre sujetos, sin los clips en que es una cota. */
export interface StratumMetric {
  betweenClips: Quantiles;
  betweenSubjects: Quantiles;
  clips: number;
  subjects: number;
  /** Clips del estrato con la métrica censurada (fuera de la distribución). */
  censoredClips: number;
}

/** Un valor del simulador: la mediana de sus cuadros y su censura. */
export interface SimValue {
  value: number | null;
  censored: Censor | null;
}

export interface MetricComparison {
  metric: string;
  basis: ReferenceBasis;
  simulator: SimValue;
  reference: StratumMetric;
  /**
   * Dónde cae el simulador: bajo el p10, dentro del p10–p90, sobre el p90; `bound`, el del simulador es una cota (censurado);
   * `small`, el estrato no llega a `MIN_CLIPS` clips o `MIN_SUBJECTS` sujetos; `n/a`, falta un dato.
   */
  position: 'below' | 'inside' | 'above' | 'bound' | 'small' | 'n/a';
}

/** Cada sujeto pesa una vez al calibrar; «clips» conserva la comparación histórica de la decisión 21. */
export type ReferenceBasis = 'clips' | 'subjects';

/**
 * Compara el simulador con el p10–p90 entre clips de un estrato, métrica a métrica: las de `metrics` (`COMPARED_METRICS`
 * por omisión) que existen en los dos lados, en ese orden.
 */
export function compareToReference(
  simulator: Record<string, SimValue>,
  reference: Record<string, StratumMetric>,
  metrics: readonly string[] = COMPARED_METRICS,
  basis: ReferenceBasis = 'clips',
): MetricComparison[] {
  return metrics
    .filter((k) => k in reference && k in simulator)
    .map((metric) => {
      const s = simulator[metric];
      const r = reference[metric];
      const q = basis === 'subjects' ? r.betweenSubjects : r.betweenClips;
      const v = s.value;
      let position: MetricComparison['position'];
      if (v === null || !Number.isFinite(v) || q.p10 === null || q.p90 === null) position = 'n/a';
      else if (s.censored) position = 'bound';
      else if (r.clips < MIN_CLIPS || r.subjects < MIN_SUBJECTS) position = 'small';
      else position = v < q.p10 ? 'below' : v > q.p90 ? 'above' : 'inside';
      return {
        metric,
        basis,
        simulator: { value: v === null || !Number.isFinite(v) ? null : num(v), censored: s.censored },
        reference: r,
        position,
      };
    });
}

/** Las métricas de la pila (T2, S1) con nombre plano: un valor por clip. */
export function stackScalars(stack: StackMetrics | null): Record<string, number | null> | null {
  if (!stack) return null;
  return {
    'T2.wall': num(stack.T2.wall.median),
    'T2.subPleura': num(stack.T2.subPleura.median),
    'S1.ratio': num(stack.S1.ratio),
    'S1.sigmaBelow': num(stack.S1.sigmaBelow),
    'S1.sigmaAbove': num(stack.S1.sigmaAbove),
    'S1.decorrelationS': stack.S1.decorrelationS === null ? null : num(stack.S1.decorrelationS),
  };
}

/** Los valores del simulador para la comparación: la mediana de sus cuadros con su censura y las métricas de su pila. */
export function simValuesOf(
  summary: Record<string, Pick<MetricSummary, 'median' | 'censored'>>,
  stack: StackMetrics | null,
): Record<string, SimValue> {
  const out: Record<string, SimValue> = {};
  for (const [k, v] of Object.entries(summary))
    out[k] = { value: Number.isFinite(v.median) ? v.median : null, censored: v.censored ?? null };
  for (const [k, v] of Object.entries(stackScalars(stack) ?? {})) out[k] = { value: v, censored: stack?.censored[k] ?? null };
  return out;
}

/** Las métricas de la pila que dependen del tiempo (fuera en un clip que repite cuadros: `qa.temporal`). */
export const TEMPORAL_METRICS = ['T2.wall', 'T2.subPleura', 'S1.ratio', 'S1.sigmaBelow', 'S1.sigmaAbove', 'S1.decorrelationS'] as const;

/**
 * Las métricas que se comparan entre el simulador y la referencia: las que no necesitan suelo ni escala (en múltiplos de
 * d_pl: los clips no la tienen), más la pila. N1–N3 no: con el suelo recortado dependen de la ganancia (decisión 21).
 */
export const COMPARED_METRICS = [
  'M.wall',
  'M.haze',
  'M.deep',
  'N4',
  'P1',
  'P2.dPl',
  'P4.dPl',
  'A1.max',
  'A2.r2',
  'A2.r3',
  'A2.slopeLn',
  'A2.visible',
  'T1.axial.dPl',
  'T1.lateral.dPl',
  'T1.sigmaOverProminence',
  'T2.wall',
  'T2.subPleura',
  'S1.ratio',
  'S1.decorrelationS',
] as const;
