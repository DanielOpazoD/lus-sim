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
import {
  COMPARED_METRICS,
  compareToReference,
  simValuesOf,
  type ReferenceBasis,
  type SimValue,
  type StratumMetric,
} from '../../src/measure/fidelity/compare';
import type { MetricSummary, StackMetrics } from '../../src/measure/fidelity/metrics';

export interface SimReport {
  startPoint: string;
  respiration: string;
  display?: { gainDb: number; dynamicRangeDb: number; greyCurve: number };
  acquisition?: { interfaceKDb: number; pleuraRt: number };
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
export function comparisonTable(strata: Stratum[], sims: SimReport[], sameProbe = 'convex', basis: ReferenceBasis = 'clips'): string {
  const ref = strata.find((g) => g.probe === sameProbe);
  const head = [
    'Métrica',
    ...strata.map((g) => `Ref. ${g.probe}: p10–p90 entre ${basis === 'subjects' ? 'sujetos' : 'clips'} [mediana] (clips/sujetos)`),
    ...sims.map(
      (s) =>
        `Sim. ${s.startPoint} (${s.respiration}${s.display ? `; G=${s.display.gainDb}, DR=${s.display.dynamicRangeDb} dB, c=${s.display.greyCurve}` : ''}${s.acquisition ? `; K=${s.acquisition.interfaceKDb} dB, Rt=${s.acquisition.pleuraRt}` : ''})`,
    ),
  ];
  const lines = [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`];
  for (const m of COMPARED_METRICS) {
    const cells = strata.map((g) => {
      const r = g.metrics[m];
      const q = basis === 'subjects' ? r?.betweenSubjects : r?.betweenClips;
      return q ? `${fmt(q.p10)}–${fmt(q.p90)} [${fmt(q.median)}] (${r.clips}/${r.subjects})` : '—';
    });
    const simCells = sims.map((s) => {
      const v = simValuesOf(s.metrics, s.stack);
      const sv = v[m] ?? { value: null, censored: null };
      const cmp = ref ? compareToReference(v, ref.metrics, [m], basis)[0] : undefined;
      return simCell(sv, cmp?.position);
    });
    if (cells.every((c) => c === '—') && simCells.every((c) => c === '—')) continue;
    lines.push(`| ${m} | ${[...cells, ...simCells].join(' | ')} |`);
  }
  return lines.join('\n');
}

/** Opciones explícitas para comparar las mismas adquisiciones con un grupo de referencia reservado. */
export function comparisonArgs(args: readonly string[]): {
  files: string[];
  reference: string;
  basis: ReferenceBasis;
  respiration: 'quiet' | 'apnea-expiratory' | 'all';
} {
  const options: ReturnType<typeof comparisonArgs> = {
    files: [],
    reference: 'docs/reference-bank/reference-stats.json',
    basis: 'clips',
    respiration: 'quiet',
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      options.files.push(arg);
      continue;
    }
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`fidelity:compare — falta el valor de ${arg}`);
    if (arg === '--reference') options.reference = value;
    else if (arg === '--basis' && (value === 'clips' || value === 'subjects')) options.basis = value;
    else if (arg === '--respiration' && (value === 'quiet' || value === 'apnea-expiratory' || value === 'all')) options.respiration = value;
    else throw new Error(`fidelity:compare — opción o valor desconocido: ${arg} ${value}`);
  }
  if (!options.files.length) throw new Error('fidelity:compare — pasa los informes de la e2e (fidelidad-<punto>.json)');
  return options;
}

const isMain = process.argv[1]?.endsWith('compare.ts');
if (isMain) {
  const opts = comparisonArgs(process.argv.slice(2));
  const { strata } = JSON.parse(readFileSync(opts.reference, 'utf8')) as { strata: Stratum[] };
  const sims = opts.files
    .flatMap((f) => (JSON.parse(readFileSync(f, 'utf8')) as { reports: SimReport[] }).reports)
    .filter((r) => opts.respiration === 'all' || r.respiration === opts.respiration);
  if (!sims.length) throw new Error(`fidelity:compare — ningún informe con respiración ${opts.respiration}`);
  console.log(comparisonTable(strata, sims, 'convex', opts.basis));
}
