import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildReferenceStats,
  clipStats,
  detectorAgreement,
  gateFailures,
  gatesOf,
  locateFile,
  manifestProblems,
  metricNeeds,
  runReference,
  sha256File,
  statsProblems,
  type Gates,
  type Manifest,
  type ManifestItem,
  type ReferenceStats,
} from '../../tools/fidelity/reference';
import { comparisonArgs, comparisonTable, simCell, type Stratum } from '../../tools/fidelity/compare';
import {
  compareToReference,
  COMPARED_METRICS,
  MIN_CLIPS,
  MIN_SUBJECTS,
  quantilesOf,
  simValuesOf,
  stackScalars,
  TEMPORAL_METRICS,
  type StratumMetric,
} from '../measure/fidelity/compare';
import { analyzeClip, type ClipAnalysis } from '../measure/fidelity/metrics';
import { referenceKeys } from './support/references';
import { SYNTHETIC_CONVEX, syntheticGeometry, syntheticLus, to8bit, type SyntheticLusOptions } from './support/syntheticLus';

/**
 * Banco de referencia (decisiones 5 y 21): el manifiesto y el archivo de estadísticas tienen la forma que dice
 * `docs/knowledge/reference-images.md` §3.3, ningún clip entra al repositorio, la geometría de cada clip está fijada, las
 * estadísticas son solo números derivados, el control de calidad y las compuertas deciden qué entra en cada estrato, y la
 * comparación no marca nada con un estrato pequeño ni con un valor censurado. Lo que necesita los clips reales está en
 * `fidelityReferenceBank.test.ts` y se salta sin la carpeta.
 */
const ROOT = resolve(__dirname, '../..');
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'docs/reference-bank/MANIFEST.json'), 'utf8')) as Manifest;
const STATS = JSON.parse(readFileSync(join(ROOT, 'docs/reference-bank/reference-stats.json'), 'utf8')) as ReferenceStats;
const KEYS = referenceKeys(readFileSync(join(ROOT, 'docs/REFERENCES.md'), 'utf8'));
const CONT = { lo: 0, hi: 1, quantum: 0 };
const byId = Object.fromEntries(MANIFEST.items.map((i) => [i.id, i]));

describe('manifiesto del banco de referencia', () => {
  it('es válido, cita claves de REFERENCES.md, fija la geometría de cada clip y ningún clip está en el repositorio', () => {
    expect(manifestProblems(MANIFEST, KEYS)).toEqual([]);
    expect(MANIFEST.items).toHaveLength(34);
    for (const it of MANIFEST.items) {
      expect(it.in_repo).toBe(false);
      expect(it.sha256).toMatch(/^[0-9a-f]{64}$/);
      // el archivo no está en el repo (decisión 5): ni con su ruta ni con su nombre
      expect(existsSync(join(ROOT, it.file))).toBe(false);
      expect(existsSync(join(ROOT, 'docs/reference-bank', it.file))).toBe(false);
      expect(it.sector.source).toMatch(/revisad/i);
    }
    // los tamaños de la fuente (Born, Commons y Cardiovascular Ultrasound, 26–27-09-2026)
    expect(Object.fromEntries(MANIFEST.items.map((i) => [i.id, i.size_bytes]))).toEqual({
      'LUS-01': 385800,
      'LUS-02': 910313,
      'LUS-03': 714531,
      'LUS-04a': 643977,
      'LUS-04b': 163027,
      'LUS-04c': 164803,
      'LUS-04d': 659880,
      'LUS-04e': 182332,
      'LUS-04f': 286987,
      'LUS-04g': 431522,
      'LUS-35a': 413696,
      'LUS-35b': 352256,
      'LUS-35c': 378880,
      'LUS-35d': 305152,
      'LUS-35e': 327680,
      'LUS-35f': 288768,
      'LUS-35g': 395264,
      'LUS-35h': 358400,
      'LUS-35i': 342016,
      'LUS-35j': 356352,
      'LUS-35k': 311296,
      'LUS-35l': 307200,
      'LUS-35m': 354304,
      'LUS-35n': 315392,
      'LUS-35o': 358400,
      'LUS-35p': 391168,
      'LUS-35q': 317440,
      'LUS-35r': 430080,
      'LUS-35s': 389120,
      'LUS-35t': 559104,
      'LUS-35u': 319488,
      'LUS-35v': 440320,
      'LUS-35w': 319488,
      'LUS-35x': 368640,
    });
  });

  it('los sujetos: los clips del mismo paciente no son independientes (Born: 4 pacientes y un voluntario)', () => {
    const subjects = new Set(MANIFEST.items.map((i) => i.subject));
    expect([...subjects].sort()).toEqual([
      'born-pat1',
      'born-pat2',
      'born-pat3',
      'born-pat4',
      'born-voluntario',
      'gargani-s1',
      'gillman-s1',
      'vieira-video1',
    ]);
    for (const p of ['pat1', 'pat2', 'pat3', 'pat4']) expect(MANIFEST.items.filter((i) => i.subject === `born-${p}`)).toHaveLength(6);
  });

  it('el control de calidad: los clips que no son pulmón limpio, traen el diafragma o el hígado o disparan una compuerta quedan fuera', () => {
    // pat1 132943 y 133043 (no es pulmón limpio); pat4 140024 (diafragma o hígado); pat2 133952 y 134240 (una línea oblicua
    // brillante y la pleura que salta entre cuadros)
    for (const id of ['LUS-35a', 'LUS-35b', 'LUS-35t', 'LUS-35h', 'LUS-35j']) expect(byId[id].qa.usable, id).toBe(false);
    expect(byId['LUS-35t'].qa.note).toMatch(/diafragma o el hígado/);
    // pat4 140434 es pulmón normal limpio (la revisión del coordinador lo había marcado por error): apto, sin compuertas
    expect(byId['LUS-35v'].qa.usable).toBe(true);
    expect(byId['LUS-35v'].qa.note).not.toMatch(/Trae el diafragma/);
    expect(STATS.clips.find((c) => c.id === 'LUS-35v')!.gate_failures).toEqual([]);
    // ninguna nota ni geometría dice una revisión que no se hizo
    for (const it of MANIFEST.items) {
      expect(`${it.qa.note} ${it.sector.source}`, it.id).not.toMatch(/pendiente de revisión humana/i);
      expect(it.sector.source, it.id).toMatch(
        /revisada por el agente coordinador en las hojas de contacto el 27-09-2026; falta la revisión de un ecografista/,
      );
    }
    // LUS-03 repite cuadros (Theora): fuera T2 y S1; trae texto identificador quemado, excluido y anotado
    expect(byId['LUS-03'].qa.temporal).toBe(false);
    expect(byId['LUS-03'].sector.exclude.length).toBeGreaterThan(0);
    expect(byId['LUS-03'].notes).toMatch(/texto identificador quemado/);
    // LUS-01: la piel no está en el borde superior del recorte (sin A1)
    expect(byId['LUS-01'].sector.skin_at_top).toBe(false);
    // los aptos convexos: al menos 3 clips de al menos 2 sujetos
    const convex = MANIFEST.items.filter((i) => i.qa.usable && i.probe === 'convex');
    expect(convex.length).toBeGreaterThanOrEqual(MIN_CLIPS);
    expect(new Set(convex.map((i) => i.subject)).size).toBeGreaterThanOrEqual(MIN_SUBJECTS);
  });

  it.each<[string, Partial<ManifestItem> | Record<string, unknown>, RegExp]>([
    ['un clip en el repo', { in_repo: true }, /in_repo/],
    ['licencia no comercial', { license: 'CC BY-NC 4.0' }, /no es abierta/],
    ['SHA-256 mal formado', { sha256: 'abc' }, /sha256/],
    ['ruta que sale de la carpeta', { file: '../x.mp4' }, /ruta relativa/],
    ['ruta absoluta', { file: '/tmp/x.mp4' }, /ruta relativa/],
    ['clave que no existe', { references: ['nadie-nada-2099'] }, /no está en REFERENCES/],
    ['sin control de calidad', { qa: undefined }, /qa/],
    ['sin la bandera temporal', { qa: { usable: true, pleura: true, a_lines: false, rib_shadow: false, note: 'x' } }, /temporal/],
    [
      'apto sin pleura',
      { qa: { usable: true, pleura: false, a_lines: false, rib_shadow: false, temporal: true, note: 'x' } },
      /sin pleura/,
    ],
    ['sonda desconocida', { probe: 'matricial' }, /probe/],
    ['id mal formado', { id: 'X-1' }, /LUS-NN/],
    ['URL sin https', { url: 'http://x' }, /url/],
    ['sin sujeto', { subject: '' }, /subject/],
    ['sin geometría', { sector: undefined }, /sector/],
    ['geometría de otro tipo', { sector: { ...MANIFEST.items[1].sector, geometry: { kind: 'matricial' } } }, /kind/],
    [
      'ángulos invertidos',
      {
        sector: {
          ...MANIFEST.items[1].sector,
          geometry: { kind: 'convex', apexX: 0, apexY: 0, thetaLeft: 1, thetaRight: -1, rhoMin: 1, rhoMax: 2 },
        },
      },
      /invertidos/,
    ],
    ['lineal sin rectángulo', { sector: { ...MANIFEST.items[1].sector, geometry: { kind: 'linear', xLeft: 5, xRight: 1 } } }, /lineal/],
    ['zona excluida mal formada', { sector: { ...MANIFEST.items[1].sector, exclude: [{ x0: 1 }] } }, /exclude/],
    ['sin la piel', { sector: { ...MANIFEST.items[1].sector, skin_at_top: 'sí' } }, /skin_at_top/],
    ['sin quién la revisó', { sector: { ...MANIFEST.items[1].sector, source: '' } }, /source/],
  ])('atrapa: %s', (_name, patch, re) => {
    const bad = { ...MANIFEST, items: [{ ...MANIFEST.items[0], ...patch }, ...MANIFEST.items.slice(1)] };
    expect(manifestProblems(bad, KEYS).join('\n')).toMatch(re);
  });

  it('atrapa ids repetidos, una lista vacía y lo que no es un manifiesto', () => {
    expect(manifestProblems({ ...MANIFEST, items: [MANIFEST.items[0], MANIFEST.items[0]] }).join('\n')).toMatch(/repetido/);
    expect(manifestProblems({ ...MANIFEST, items: [] })).toContain('items: lista vacía');
    expect(manifestProblems(null)).toEqual(['el manifiesto no es un objeto']);
    expect(manifestProblems({ ...MANIFEST, verified: 'ayer' }).join('\n')).toMatch(/verified/);
  });
});

/** Un clip sintético analizado con su control de calidad (y la geometría verdadera, como la del manifiesto). */
function synthClip(o: SyntheticLusOptions, frames: number, slide = 1): ClipAnalysis {
  return analyzeClip(syntheticLus(o, frames, slide, 0.01), { geometry: syntheticGeometry(o), scale: CONT, frameIntervalS: 1 / 30 });
}
const O = SYNTHETIC_CONVEX;
const QA_ALL: ManifestItem['qa'] = { usable: true, pleura: true, a_lines: true, rib_shadow: true, temporal: true, note: 'x' };
const itemOf = (id: string, subject: string, qa: ManifestItem['qa']) => ({
  id,
  bank_id: id.slice(0, 6),
  subject,
  pattern: 'normal',
  probe: 'convex' as const,
  qa,
  sector: { geometry: syntheticGeometry(O), exclude: [], skin_at_top: true, source: 'sintético' },
});
const EXTRA = { black: 0, truncated: false, detector: null };

describe('compuertas automáticas de cada clip', () => {
  const clean = synthClip(O, 4);

  it('un clip limpio no dispara ninguna', () => {
    expect(gatesOf(clean)).toEqual({
      dpl_spread: false,
      few_intercostal: false,
      floor_above_deep: false,
      bimodal_crests: false,
      repeated_frames: false,
    });
  });

  it('la pleura que salta entre cuadros, el suelo sobre el campo profundo, las crestas de dos poblaciones y los cuadros repetidos', () => {
    // la pleura a 15 y a 19 mm en cuadros alternos (la del cuadro medio guía ±30 %: las dos entran)
    const g = syntheticGeometry(O);
    const jumping = [15, 19, 15, 19].map((d) => syntheticLus({ ...O, dPlMm: d })[0]);
    expect(gatesOf(analyzeClip(jumping, { geometry: g, scale: CONT })).dpl_spread).toBe(true);
    // o sin pleura en más de un 20 % de los cuadros
    const lost = {
      ...clean,
      perFrame: clean.perFrame.map((m, i) =>
        i ? m : { ...m, structures: { ...m.structures, dPl: { px: Number.NaN, dPl: Number.NaN, mm: null } } },
      ),
    };
    expect(gatesOf(lost).dpl_spread).toBe(true);
    expect(gatesOf(synthClip({ ...O, floor: 0.16, deep: 0.08 }, 3)).floor_above_deep).toBe(true);
    const bimodal = synthClip(
      {
        ...O,
        ribs: [
          { from: 0.12, to: 0.21, topMm: 5 },
          { from: 0.21, to: 0.3, topMm: 13 },
        ],
      },
      3,
    );
    expect(gatesOf(bimodal).bimodal_crests).toBe(true);
    const f = syntheticLus(O, 3, 1, 0.01).map(to8bit);
    const doubled = analyzeClip([f[0], f[0], f[1], f[1], f[2], f[2]], { geometry: g });
    expect(gatesOf(doubled).repeated_frames).toBe(true);
    // pocas columnas intercostales
    const few = { ...clean, perFrame: clean.perFrame.map((m) => ({ ...m, structures: { ...m.structures, intercostalColumns: 5 } })) };
    expect(gatesOf(few).few_intercostal).toBe(true);
  });

  it('una compuerta disparada solo es un fallo si contradice el control de calidad de un clip apto', () => {
    const all: Gates = { dpl_spread: true, few_intercostal: true, floor_above_deep: true, bimodal_crests: true, repeated_frames: true };
    expect(gateFailures(QA_ALL, all)).toEqual(['dpl_spread', 'few_intercostal', 'floor_above_deep', 'bimodal_crests', 'repeated_frames']);
    expect(gateFailures({ ...QA_ALL, rib_shadow: false, temporal: false }, all)).toEqual(['dpl_spread', 'few_intercostal']);
    expect(gateFailures({ ...QA_ALL, usable: false }, all)).toEqual([]);
  });

  it('en el archivo del repo, ningún clip apto dispara una compuerta que su control de calidad no admite', () => {
    for (const c of STATS.clips) {
      expect(c.gate_failures, c.id).toEqual(gateFailures(c.qa, c.gates));
      if (c.qa.usable) expect(c.gate_failures, `${c.id}: ${JSON.stringify(c.gates)}`).toEqual([]);
    }
  });
});

describe('estadísticas de referencia', () => {
  const analysis = synthClip(O, 4);
  const good = clipStats(itemOf('LUS-90', 's1', QA_ALL), 'a'.repeat(64), O, 30, analysis, EXTRA);
  const noRib = clipStats(
    itemOf('LUS-91', 's2', { ...QA_ALL, rib_shadow: false, temporal: false }),
    'b'.repeat(64),
    O,
    30,
    analysis,
    EXTRA,
  );
  const unusable = clipStats(itemOf('LUS-92', 's3', { ...QA_ALL, usable: false, pleura: false }), 'c'.repeat(64), O, 30, analysis, EXTRA);
  const stats = buildReferenceStats(
    1,
    [good, noRib, unusable],
    [{ id: 'LUS-93', status: 'missing', detail: 'x.mp4' }],
    '2026-09-27T00:00:00Z',
  );

  it('solo números derivados, con su forma; los estratos, por sonda, con los clips y sujetos que ven cada métrica', () => {
    expect(statsProblems(stats)).toEqual([]);
    expect(stats.strata).toHaveLength(1);
    expect(stats.strata[0].clips).toEqual(['LUS-90', 'LUS-91']);
    expect(stats.strata[0].subjects).toEqual(['s1', 's2']);
    const g = stats.strata[0].metrics;
    // N1 necesita la sombra costal y S1 el tiempo: solo el primero; d_pl y M, los dos
    expect(g.N1.clips).toBe(1);
    expect(g['S1.ratio'].clips).toBe(1);
    expect(g['dPl.px']).toMatchObject({ clips: 2, subjects: 2, censoredClips: 0 });
    expect(g['M.wall'].betweenClips.n).toBe(2);
    expect(g['M.wall'].betweenSubjects.n).toBe(2);
    expect(stats.clips.map((c) => c.id)).toEqual(['LUS-90', 'LUS-91', 'LUS-92']);
    // la mediana de cada clip, no los cuadros
    expect(g['dPl.px'].betweenClips.median).toBe(good.stats.metrics['dPl.px'].median);
  });

  it('un clip con la métrica censurada o con una compuerta disparada no entra en la distribución', () => {
    const censored = {
      stats: {
        ...good.stats,
        id: 'LUS-94',
        subject: 's4',
        metrics: { ...good.stats.metrics, 'M.wall': { ...good.stats.metrics['M.wall'], censored: 'lower' as const } },
      },
    };
    const gated = { stats: { ...good.stats, id: 'LUS-95', subject: 's5', gate_failures: ['dpl_spread'] } };
    const s = buildReferenceStats(1, [good, censored, gated], [], '2026-09-27T00:00:00Z');
    expect(s.strata[0].clips).toEqual(['LUS-90', 'LUS-94']);
    expect(s.strata[0].metrics['M.wall']).toMatchObject({ clips: 1, censoredClips: 1, sparseClips: 0 });
  });

  it('un clip que mide la métrica en menos de la mitad de sus cuadros no entra (su mediana no es la del clip)', () => {
    const m = good.stats.metrics['M.wall'];
    const sparse = {
      stats: { ...good.stats, id: 'LUS-96', subject: 's6', metrics: { ...good.stats.metrics, 'M.wall': { ...m, n: 1, median: 99 } } },
    };
    expect(good.stats.analyzed_frames).toBe(4);
    const s = buildReferenceStats(1, [good, sparse], [], '2026-09-27T00:00:00Z');
    expect(s.strata[0].metrics['M.wall']).toMatchObject({ clips: 1, sparseClips: 1 });
    expect(s.strata[0].metrics['M.wall'].betweenClips.median).toBe(m.median);
    // la mitad justa, sí
    const half = { stats: { ...sparse.stats, id: 'LUS-97', metrics: { ...good.stats.metrics, 'M.wall': { ...m, n: 2 } } } };
    expect(buildReferenceStats(1, [good, half], [], '2026-09-27T00:00:00Z').strata[0].metrics['M.wall']).toMatchObject({
      clips: 2,
      sparseClips: 0,
    });
  });

  it('atrapa una ruta local, una lista de píxeles y un SHA-256 roto', () => {
    expect(
      statsProblems({ ...stats, skipped: [{ id: 'LUS-93', status: 'missing', detail: '/Users/alguien/datos/x.mp4' }] }).join('\n'),
    ).toMatch(/ruta local/);
    const pixels = { ...stats, clips: [{ ...stats.clips[0], frame: Array.from({ length: 100 }, (_, i) => i) }] };
    expect(statsProblems(pixels).join('\n')).toMatch(/lista larga/);
    expect(statsProblems({ ...stats, clips: [{ ...stats.clips[0], sha256: 'x' }] }).join('\n')).toMatch(/sha256/);
    expect(statsProblems({ ...stats, tool: 'otra' }).join('\n')).toMatch(/tool/);
    expect(statsProblems([])).toEqual(['las estadísticas no son un objeto']);
    expect(statsProblems({ ...stats, strata: undefined }).join('\n')).toMatch(/listas/);
  });

  it('qué necesita cada métrica', () => {
    expect(metricNeeds('A2.r2')).toEqual(['a_lines']);
    expect(metricNeeds('N4')).toEqual(['a_lines']);
    expect(metricNeeds('M.deep')).toEqual(['a_lines']);
    expect(metricNeeds('N2')).toEqual(['rib_shadow']);
    expect(metricNeeds('levels.floor.grey')).toEqual(['rib_shadow']);
    expect(metricNeeds('P4.dPl')).toEqual(['rib_shadow']);
    for (const k of TEMPORAL_METRICS) expect(metricNeeds(k)).toEqual(['temporal']);
    expect(metricNeeds('dPl.px')).toEqual([]);
    expect(metricNeeds('T1.axial.dPl')).toEqual([]);
  });

  it('cuánto se aparta el detector de la geometría fijada', () => {
    const g = syntheticGeometry(O);
    if (g.kind === 'linear') throw new Error('no es convexa');
    expect(detectorAgreement(g, { ...g, apexX: g.apexX + 3, apexY: g.apexY + 4, thetaRight: g.thetaRight + Math.PI / 180 })).toEqual({
      kind: 'convex',
      apex_px: 5,
      left_deg: 0,
      right_deg: 1,
    });
    const lin = { kind: 'linear' as const, xLeft: 0, xRight: 10, yTop: 0, yBottom: 10 };
    expect(detectorAgreement(lin, lin)).toEqual({ kind: 'linear', apex_px: null, left_deg: null, right_deg: null });
    expect(Number.isNaN(detectorAgreement(g, lin)!.right_deg)).toBe(true);
  });

  it('el archivo del repo es válido, casa con el manifiesto, mide cada clip entero y sus estratos solo llevan clips aptos', () => {
    expect(statsProblems(STATS)).toEqual([]);
    expect(STATS.skipped).toEqual([]);
    const sha = Object.fromEntries(MANIFEST.items.map((i) => [i.id, i.sha256]));
    expect(STATS.clips.map((c) => c.id)).toEqual(MANIFEST.items.map((i) => i.id));
    for (const c of STATS.clips) {
      expect(c.sha256).toBe(sha[c.id]);
      expect(c.truncated, c.id).toBe(false);
      expect(c.qa).toEqual(byId[c.id].qa);
    }
    const usable = new Set(MANIFEST.items.filter((i) => i.qa.usable).map((i) => i.id));
    for (const g of STATS.strata) for (const id of g.clips) expect(usable.has(id)).toBe(true);
    expect(STATS.strata.map((g) => g.probe).sort()).toEqual(['convex', 'linear', 'sector']);
    const convex = STATS.strata.find((g) => g.probe === 'convex')!;
    expect(convex.clips.length).toBeGreaterThanOrEqual(MIN_CLIPS);
    expect(convex.subjects.length).toBeGreaterThanOrEqual(MIN_SUBJECTS);
    // en cada métrica de cuadro entran exactamente los clips del estrato que la ven, no la tienen censurada y la miden en
    // al menos la mitad de sus cuadros
    for (const g of STATS.strata)
      for (const [k, x] of Object.entries(g.metrics)) {
        const members = STATS.clips.filter((c) => g.clips.includes(c.id));
        if (members.some((c) => c.stack && k in c.stack)) continue;
        const counted = members.filter((c) => {
          const m = c.metrics[k];
          return metricNeeds(k).every((need) => c.qa[need]) && m && m.median !== null && !m.censored && m.n >= 0.5 * c.analyzed_frames;
        });
        expect(x.clips, `${g.probe} ${k}`).toBe(counted.length);
      }
    // N1–N3 no se comparan (dependen del suelo); M sí
    expect(COMPARED_METRICS).not.toContain('N1');
    expect(COMPARED_METRICS).toContain('M.wall');
  });
});

describe('comparación simulador frente a referencia', () => {
  it('la comparación entre sujetos evita que numerosas ventanas de un sujeto dominen la distribución', () => {
    const metric: StratumMetric = {
      betweenClips: quantilesOf([1, 1, 1, 1, 1, 1, 1, 1, 1, 9]),
      betweenSubjects: quantilesOf([1, 9]),
      clips: 10,
      subjects: 2,
      censoredClips: 0,
      sparseClips: 0,
    };
    const sim = { 'M.wall': { value: 5, censored: null } };
    expect(compareToReference(sim, { 'M.wall': metric }, ['M.wall'])[0].position).toBe('above');
    expect(compareToReference(sim, { 'M.wall': metric }, ['M.wall'], 'subjects')[0]).toMatchObject({
      basis: 'subjects',
      position: 'inside',
    });
    expect(
      compareToReference({ 'M.wall': { value: 5, censored: 'lower' } }, { 'M.wall': metric }, ['M.wall'], 'subjects')[0].position,
    ).toBe('bound');
    expect(compareToReference(sim, { 'M.wall': { ...metric, subjects: 1 } }, ['M.wall'], 'subjects')[0].position).toBe('small');
  });

  it('el CLI permite un banco reservado y apnea, y rechaza opciones mal escritas o informes ausentes', () => {
    expect(comparisonArgs(['a.json'])).toMatchObject({ files: ['a.json'], basis: 'clips', respiration: 'quiet' });
    expect(comparisonArgs(['--basis', 'subjects', '--reference', 'reservado.json', '--respiration', 'all', 'a.json', 'b.json'])).toEqual({
      files: ['a.json', 'b.json'],
      basis: 'subjects',
      reference: 'reservado.json',
      respiration: 'all',
    });
    expect(comparisonArgs(['--respiration', 'apnea-expiratory', 'a.json']).respiration).toBe('apnea-expiratory');
    expect(() => comparisonArgs([])).toThrow(/pasa los informes/);
    expect(() => comparisonArgs(['--basis'])).toThrow(/falta el valor/);
    expect(() => comparisonArgs(['--basis', '--reference'])).toThrow(/falta el valor/);
    expect(() => comparisonArgs(['--basis', 'subject', 'a.json'])).toThrow(/desconocido/);
    expect(() => comparisonArgs(['--unknown', 'value', 'a.json'])).toThrow(/desconocido/);
  });
  const stratum = (values: number[], subjects: number, censoredClips = 0): StratumMetric => ({
    betweenClips: quantilesOf(values),
    betweenSubjects: quantilesOf(values.slice(0, subjects)),
    clips: values.length,
    subjects,
    censoredClips,
    sparseClips: 0,
  });
  const ref = {
    'M.wall': stratum([1, 1.1, 1.2, 1.3], 3),
    'M.haze': stratum([0.9, 1, 1.1], 2),
    'M.deep': stratum([2, 2.1], 2),
    N4: stratum([3, 4, 5], 1),
    P1: stratum([], 0),
  };

  it('sitúa cada métrica frente al p10–p90, nunca un valor censurado ni con un estrato pequeño', () => {
    const c = compareToReference(
      {
        'M.wall': { value: 0.5, censored: null },
        'M.haze': { value: 1.9, censored: 'lower' },
        'M.deep': { value: 2.05, censored: null },
        N4: { value: 9, censored: null },
        P1: { value: 1, censored: null },
      },
      ref,
      ['M.wall', 'M.haze', 'M.deep', 'N4', 'P1', 'P2.dPl'],
    );
    expect(c.map((x) => [x.metric, x.position])).toEqual([
      ['M.wall', 'below'],
      ['M.haze', 'bound'],
      ['M.deep', 'small'],
      ['N4', 'small'],
      ['P1', 'n/a'],
    ]);
    expect(compareToReference({ 'M.wall': { value: 2, censored: null } }, ref, ['M.wall'])[0].position).toBe('above');
    expect(compareToReference({ 'M.wall': { value: 1.15, censored: null } }, ref, ['M.wall'])[0].position).toBe('inside');
    expect(compareToReference({ 'M.wall': { value: null, censored: null } }, ref, ['M.wall'])[0].position).toBe('n/a');
    expect(stackScalars(null)).toBeNull();
  });

  it('los valores del simulador: la mediana de sus cuadros con su censura y la pila con la suya', () => {
    const stack = synthClip(O, 4).stack!;
    const v = simValuesOf(
      { 'M.wall': { median: 1.5, censored: null }, N1: { median: Number.NaN, censored: 'unknown' } },
      { ...stack, censored: { 'S1.ratio': 'lower' } },
    );
    expect(v['M.wall']).toEqual({ value: 1.5, censored: null });
    expect(v.N1).toEqual({ value: null, censored: 'unknown' });
    expect(v['S1.ratio'].censored).toBe('lower');
    expect(v['T2.wall'].censored).toBeNull();
  });

  it('la tabla en Markdown: el p10–p90 con clips y sujetos, las cotas como cotas y la marca solo con un estrato suficiente', () => {
    const strata: Stratum[] = [
      { pattern: 'normal', probe: 'convex', clips: ['a', 'b', 'c', 'd'], subjects: ['1', '2', '3'], metrics: ref },
      { pattern: 'normal', probe: 'linear', clips: ['e'], subjects: ['4'], metrics: { 'M.wall': stratum([0.8], 1) } },
    ];
    const sim = {
      startPoint: 'blueUpper',
      respiration: 'quiet',
      metrics: {
        'M.wall': { median: 0.5, censored: null },
        'M.haze': { median: 1.9, censored: 'lower' as const },
        N4: { median: 4, censored: null },
      },
      stack: null,
    };
    const t = comparisonTable(strata, [sim]);
    const subjects = comparisonTable(strata, [sim], 'convex', 'subjects');
    expect(subjects).toContain('p10–p90 entre sujetos');
    expect(subjects).toContain('1.02–1.18 [1.10] (4/3)');
    expect(t).toMatch(/\| M\.wall \| 1\.03–1\.27 \[1\.15\] \(4\/3\) \| 0\.800–0\.800 \[0\.800\] \(1\/1\) \| 0\.500 ↓ \|/);
    expect(t).toMatch(/\| M\.haze \| .* \| ≥ 1\.90 \|/);
    expect(t).toMatch(/\| N4 \| .* \| 4\.00 \|/);
    expect(simCell({ value: 3, censored: 'upper' }, 'inside')).toBe('≤ 3.00');
    expect(simCell({ value: 3, censored: 'resolution' }, 'inside')).toBe('3.00 (resolución)');
    expect(simCell({ value: 3, censored: 'unknown' }, undefined)).toBe('3.00 (cens.)');
    expect(simCell({ value: null, censored: null }, undefined)).toBe('—');
    expect(simCell({ value: 3, censored: null }, 'above')).toBe('3.00 ↑');
  });
});

describe('la herramienta sin el banco y con una carpeta de prueba', () => {
  it('sin la carpeta informa y no escribe nada', () => {
    const logs: string[] = [];
    const out = join(tmpdir(), `lus-ref-${process.pid}.json`);
    const r = runReference({
      dir: join(tmpdir(), 'no-existe-lus'),
      manifestPath: 'x',
      outPath: out,
      ffmpeg: 'ffmpeg',
      log: (m) => logs.push(m),
    });
    expect(r.status).toBe('no-dir');
    expect(existsSync(out)).toBe(false);
    expect(logs.join('\n')).toMatch(/no existe la carpeta/);
  });

  it('busca por ruta y por nombre, calcula el SHA-256 y salta lo que falta o no coincide', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lus-ref-'));
    try {
      mkdirSync(join(dir, 'otra', 'sub'), { recursive: true });
      writeFileSync(join(dir, 'otra', 'sub', 'clip.mp4'), 'no es un vídeo');
      expect(locateFile(dir, 'born/clip.mp4')).toBe(join(dir, 'otra', 'sub', 'clip.mp4'));
      expect(locateFile(dir, 'nada.mp4')).toBeNull();
      expect(sha256File(join(dir, 'otra', 'sub', 'clip.mp4'))).toMatch(/^[0-9a-f]{64}$/);
      const base = MANIFEST.items[0];
      const manifest: Manifest = {
        ...MANIFEST,
        items: [
          { ...base, id: 'LUS-01', file: 'nada.mp4' },
          { ...base, id: 'LUS-02', bank_id: 'LUS-02', file: 'clip.mp4', sha256: '0'.repeat(64) },
          { ...base, id: 'LUS-03', bank_id: 'LUS-03', file: 'clip.mp4', sha256: null },
        ],
      };
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
      const logs: string[] = [];
      const r = runReference({
        dir,
        manifestPath: join(dir, 'manifest.json'),
        outPath: join(dir, 'stats.json'),
        ffmpeg: join(dir, 'ffmpeg-que-no-existe'),
        log: (m) => logs.push(m),
      });
      if (r.status !== 'ok') throw new Error('sin estadísticas');
      expect(r.stats.skipped.map((s) => [s.id, s.status])).toEqual([
        ['LUS-01', 'missing'],
        ['LUS-02', 'sha256-mismatch'],
        ['LUS-03', 'decode-error'],
      ]);
      expect(logs.join('\n')).toMatch(/LUS-03: sha256 [0-9a-f]{64}/);
      expect(statsProblems(JSON.parse(readFileSync(join(dir, 'stats.json'), 'utf8')))).toEqual([]);
      // un manifiesto inválido no se mide
      writeFileSync(join(dir, 'bad.json'), JSON.stringify({ ...manifest, items: [] }));
      expect(() =>
        runReference({ dir, manifestPath: join(dir, 'bad.json'), outPath: join(dir, 's2.json'), ffmpeg: 'x', log: () => {} }),
      ).toThrow(/manifiesto inválido/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
