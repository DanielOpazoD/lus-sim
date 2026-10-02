/**
 * Tabla en dB del banco de fidelidad (decisión 31), la entrada del ciclo 3b-2:
 *
 *   npm run fidelity:db -- test-results/…/fidelidad-blueUpper.json test-results/…/fidelidad-plaps.json …
 *
 * Para el simulador, desde su envolvente sin recortar (el informe de `e2e/fidelidad.spec.ts`): las brechas pleura–pared,
 * pleura–neblina y pleura–campo profundo, la caída por orden de las líneas A frente a F-T02 y la forma del moteado de la
 * región de la pared en parches de 16 × 8 (DE, p90 − p50 y asimetría de 20·log₁₀ de la envolvente; Rayleigh: 5,57 dB,
 * 5,21 dB y 1,57). Para los clips, por sujeto, lo mismo pasado a dB por el mapa
 * de grises estimado desde su moteado (`speckleMap.ts`), solo en los clips cuyo mapa es fiable; si no lo es, el motivo y
 * los números que lo muestran (la asimetría en dB, 1,57 si el moteado es de Rayleigh). No inventa un mapa que no sabe.
 */
import { readFileSync } from 'node:fs';
import { dbOfGreyMap } from '../../src/measure/fidelity/speckleMap';
import type { ClipStats, ReferenceStats } from './reference';

export interface DbSimReport {
  startPoint: string;
  respiration: string;
  levelsDb: Record<'wall' | 'haze' | 'deep' | 'pleura' | 'aLine2' | 'aLine3', { envelopeDb: number }>;
  aLineDrop: {
    orders: { k: number; dropEnvelopeDb: number | null }[];
    ft02: { predictedDb: { median: number } };
  };
  wallSpeckle?: { region: { sdDb: number; p90p50Db: number; asymmetry: number } };
}

const f1 = (x: number | null | undefined): string => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(1));
const f2 = (x: number | null | undefined): string => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(2));

/** Las filas del simulador: una por punto de partida y respiración. */
export function simDbTable(reports: readonly DbSimReport[]): string {
  const head = [
    'Simulador (envolvente)',
    'Pleura − pared (dB)',
    'Pleura − neblina',
    'Pleura − campo profundo',
    'Caída 1→2 / 2→3 (dB)',
    'F-T02 (dB)',
    'Región de la pared: DE / p90−p50 (dB) / asimetría',
  ];
  const rows = reports.map((r) => {
    const L = r.levelsDb;
    const drop = (k: number): string => f1(r.aLineDrop.orders.find((o) => o.k === k)?.dropEnvelopeDb);
    const w = r.wallSpeckle?.region;
    return [
      `${r.startPoint}, ${r.respiration}`,
      f1(L.pleura.envelopeDb - L.wall.envelopeDb),
      f1(L.pleura.envelopeDb - L.haze.envelopeDb),
      f1(L.pleura.envelopeDb - L.deep.envelopeDb),
      `${drop(1)} / ${drop(2)}`,
      f1(r.aLineDrop.ft02.predictedDb.median),
      w ? `${f2(w.sdDb)} / ${f2(w.p90p50Db)} / ${f2(w.asymmetry)}` : '—',
    ];
  });
  rows.push([
    'Moteado de Rayleigh (referencia; en parches con grano, DE y p90−p50 algo menores)',
    '',
    '',
    '',
    '',
    '',
    '5,57 / 5,21 / 1,57',
  ]);
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

/** dB (más una constante) de un gris con el mapa (c, RD) sobre el negro del clip: ln(g − negro + G/c)/β; con c = 0, lineal. */
export function dbOfGrey(g: number | null, c: number, rangeDb: number, black: number): number {
  if (g === null) return Number.NaN;
  return dbOfGreyMap(g - black, c, rangeDb, 255 - black);
}

/** Las filas de los clips aptos, por sujeto: el mapa estimado y, si es fiable, las brechas en dB. */
export function clipDbTable(clips: readonly ClipStats[]): string {
  const head = [
    'Sujeto',
    'Clip',
    'Grano con 16 px (x × y, px)',
    'Tesela (px)',
    'Teselas',
    'Asimetría en dB (Rayleigh 1,57)',
    'c',
    'RD (dB)',
    'Pared (16 px): teselas / asimetría',
    'Mapa',
    'Pleura − pared (dB)',
  ];
  const usable = clips.filter((c) => c.qa.usable).sort((a, b) => a.subject.localeCompare(b.subject) || a.id.localeCompare(b.id));
  const rows = usable.map((c) => {
    const g = c.grey_map;
    const w = c.grey_map_wall;
    const grain = g?.grain_px_16 ?? g?.grain_px;
    return [
      c.subject,
      c.id,
      // el grano, con «≥» si la autocorrelación no cayó antes de media tesela (una cota)
      grain ? grain.map((v) => (v !== null && v >= 8 ? `≥ ${f1(v)}` : f1(v))).join(' × ') : '—',
      String(g?.tile ?? '—'),
      String(g?.tiles ?? '—'),
      f2(g?.asymmetry),
      f2(g?.c),
      f1(g?.range_db),
      w ? `${w.tiles} / ${f2(w.asymmetry)}` : '—',
      g?.reliable ? 'fiable' : `no: ${g?.reasons.join('; ') ?? 'sin estimar'}`,
      // solo con un mapa fiable
      g?.reliable && g.c !== null && g.range_db !== null
        ? f1(
            dbOfGrey(c.metrics['levels.pleuraPeak']?.median ?? Number.NaN, g.c, g.range_db, c.black) -
              dbOfGrey(c.metrics['levels.wall.grey']?.median ?? Number.NaN, g.c, g.range_db, c.black),
          )
        : '—',
    ];
  });
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

const isMain = process.argv[1]?.endsWith('dbTable.ts');
if (isMain) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('fidelity:db — pasa los informes de la e2e (fidelidad-<punto>.json)');
    process.exit(1);
  }
  const reports = files.flatMap((f) => (JSON.parse(readFileSync(f, 'utf8')) as { reports: DbSimReport[] }).reports);
  const stats = JSON.parse(readFileSync('docs/reference-bank/reference-stats.json', 'utf8')) as ReferenceStats;
  console.log(simDbTable(reports));
  console.log('');
  console.log(clipDbTable(stats.clips));
}
