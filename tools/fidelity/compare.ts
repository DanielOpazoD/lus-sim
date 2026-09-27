/**
 * Tabla del banco de fidelidad (decisión 21): el simulador frente al banco de referencia, métrica a métrica.
 *
 *   npm run fidelity:compare -- test-results/…/fidelidad-blueUpper.json test-results/…/fidelidad-plaps.json …
 *
 * Lee los informes que adjunta la e2e (`e2e/fidelidad.spec.ts`) y `docs/reference-bank/reference-stats.json`, y escribe en la
 * salida estándar una tabla en Markdown: el p10–p90 entre clips (la mediana de cada clip apto) de cada estrato de referencia,
 * con cuántos clips y sujetos hay detrás, y la mediana del simulador en cada punto de partida con respiración tranquila (la
 * de los clips), marcada frente al estrato de la misma sonda (convexa): ↓ bajo el p10, ↑ sobre el p90, · dentro. Un valor
 * censurado sale como cota (≥ o ≤, o «cens.») y un estrato con menos de 3 clips o 2 sujetos no marca nada. Solo informa: la
 * calibración es del ciclo 3b.
 */
import { readFileSync } from 'node:fs';
import { COMPARED_METRICS, compareToReference, simValuesOf, type SimValue, type StratumMetric } from '../../src/measure/fidelity/compare';
import type { MetricSummary, StackMetrics } from '../../src/measure/fidelity/metrics';

export interface SimReport {
  startPoint: string;
  respiration: string;
  metrics: Record<string, Pick<MetricSummary, 'median' | 'censored'>>;
  stack: StackMetrics | null;
}
export interface Stratum {
  pattern: string;
  probe: string;
  clips: string[];
  subjects: string[];
  metrics: Record<string, StratumMetric>;
}

const fmt = (x: number | null | undefined): string =>
  x === null || x === undefined || !Number.isFinite(x) ? '—' : Math.abs(x) >= 100 ? x.toFixed(0) : x.toPrecision(3);

/** Un valor del simulador en la tabla: cota si está censurado, y la marca frente a la referencia si la hay. */
export function simCell(v: SimValue, position: string | undefined): string {
  if (v.value === null) return '—';
  if (v.censored === 'lower') return `≥ ${fmt(v.value)}`;
  if (v.censored === 'upper') return `≤ ${fmt(v.value)}`;
  if (v.censored) return `${fmt(v.value)} (${v.censored === 'resolution' ? 'resolución' : 'cens.'})`;
  const mark = position === 'below' ? ' ↓' : position === 'above' ? ' ↑' : position === 'inside' ? ' ·' : '';
  return `${fmt(v.value)}${mark}`;
}

/** La tabla en Markdown: estratos de referencia y columnas del simulador, con la posición frente a `sameProbe`. */
export function comparisonTable(strata: Stratum[], sims: SimReport[], sameProbe = 'convex'): string {
  const ref = strata.find((g) => g.probe === sameProbe);
  const head = [
    'Métrica',
    ...strata.map((g) => `Ref. ${g.probe}: p10–p90 [mediana] (clips/sujetos)`),
    ...sims.map((s) => `Sim. ${s.startPoint}`),
  ];
  const lines = [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`];
  for (const m of COMPARED_METRICS) {
    const cells = strata.map((g) => {
      const r = g.metrics[m];
      const q = r?.betweenClips;
      return q ? `${fmt(q.p10)}–${fmt(q.p90)} [${fmt(q.median)}] (${r.clips}/${r.subjects})` : '—';
    });
    const simCells = sims.map((s) => {
      const v = simValuesOf(s.metrics, s.stack);
      const sv = v[m] ?? { value: null, censored: null };
      const cmp = ref ? compareToReference(v, ref.metrics, [m])[0] : undefined;
      return simCell(sv, cmp?.position);
    });
    if (cells.every((c) => c === '—') && simCells.every((c) => c === '—')) continue;
    lines.push(`| ${m} | ${[...cells, ...simCells].join(' | ')} |`);
  }
  return lines.join('\n');
}

const isMain = process.argv[1]?.endsWith('compare.ts');
if (isMain) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('fidelity:compare — pasa los informes de la e2e (fidelidad-<punto>.json)');
    process.exit(1);
  }
  const { strata } = JSON.parse(readFileSync('docs/reference-bank/reference-stats.json', 'utf8')) as { strata: Stratum[] };
  const sims = files
    .flatMap((f) => (JSON.parse(readFileSync(f, 'utf8')) as { reports: SimReport[] }).reports)
    .filter((r) => r.respiration === 'quiet');
  console.log(comparisonTable(strata, sims));
}
