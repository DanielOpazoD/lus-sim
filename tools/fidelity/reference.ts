/**
 * Banco de fidelidad, lado de la referencia (decisión 21; `docs/knowledge/reference-images.md` §3):
 *
 *   npm run fidelity:ref                          # LUS_REFERENCE_DIR o ~/datos/lus-referencia
 *   npm run fidelity:ref -- --dir /ruta --ffmpeg /opt/homebrew/bin/ffmpeg [--max-frames N]
 *
 * Lee `docs/reference-bank/MANIFEST.json`, busca cada archivo en la carpeta del banco (fuera del repo, decisión 5), comprueba
 * su SHA-256, decodifica todos sus cuadros en gris con ffmpeg y los mide con las funciones del banco (`src/measure/fidelity/`)
 * con la GEOMETRÍA FIJADA en el manifiesto (propuesta por el detector y revisada por una persona: la detección automática
 * cambia con la ganancia en un abanico cortado por el marco), el negro del propio vídeo como recorte bajo y sus zonas quemadas
 * fuera. Calcula compuertas automáticas por clip (un clip apto que dispare una hace fallar la prueba) y escribe
 * `docs/reference-bank/reference-stats.json`: solo estadísticas derivadas (números), ni cuadros, ni rutas locales. Los
 * estratos llevan la distribución entre clips y entre sujetos de la mediana de cada clip apto.
 *
 * Sin la carpeta, lo dice y sale con 0 (en CI no hay banco ni ffmpeg). No descarga nada.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { quantilesOf, stackScalars, TEMPORAL_METRICS, type Quantiles, type StratumMetric } from '../../src/measure/fidelity/compare';
import { analyzeClip, flattenMetrics, type ClipAnalysis, type Censor } from '../../src/measure/fidelity/metrics';
import { detectSector, GREY_8BIT, outsideBlack, type GreyFrame, type Rect, type SectorGeometry } from '../../src/measure/fidelity/sector';
import { median, quantile } from '../../src/measure/fidelity/stats';

/** La geometría de un clip, fijada en el manifiesto: el sector, las zonas quemadas y si la piel está en el borde superior. */
export interface FixedSector {
  geometry: SectorGeometry;
  exclude: Rect[];
  skin_at_top: boolean;
  /** Quién la propuso y quién la revisó. */
  source: string;
}

export interface ManifestItem {
  id: string;
  bank_id: string;
  /** El sujeto (anonimizado): los clips del mismo sujeto no son independientes. */
  subject: string;
  finding: string;
  pattern: string;
  file: string;
  url: string;
  doi: string | null;
  size_bytes: number | null;
  sha256: string | null;
  license: string;
  license_url: string;
  credit: string;
  references: string[];
  probe: 'convex' | 'linear' | 'sector' | null;
  equipment: string | null;
  frequency_mhz: number | null;
  population: string;
  in_repo: boolean;
  mm_per_px: number | null;
  notes: string;
  sector: FixedSector;
  /**
   * Control de calidad humano (§2, criterio del banco): si el clip entra en los estratos y qué se ve de verdad en él. Sin
   * pleura, nada (todas las bandas cuelgan de ella); sin líneas A, fuera A1, A2, M y N4; sin sombra costal, fuera el suelo y lo
   * que lo usa (P1, P4, N1–N3); sin tiempo fiable (cuadros repetidos), fuera T2 y S1. El clip se mide igual y sus números
   * quedan en `clips` para revisarlo.
   */
  qa: { usable: boolean; pleura: boolean; a_lines: boolean; rib_shadow: boolean; temporal: boolean; note: string };
}

export interface Manifest {
  version: number;
  description: string;
  verified: string;
  items: ManifestItem[];
}

/** Licencias que el banco admite en el repositorio público (§2 y §4.1: CC BY, CC BY-SA y dominio público). */
export const OPEN_LICENSES = ['CC BY 4.0', 'CC BY 2.0', 'CC BY-SA 4.0', 'CC BY-SA 3.0', 'CC0 1.0', 'dominio público'] as const;
const PROBES = ['convex', 'linear', 'sector'];
const QA_FLAGS = ['usable', 'pleura', 'a_lines', 'rib_shadow', 'temporal'] as const;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const nullOr = (x: unknown, ok: (v: unknown) => boolean): boolean => x === null || ok(x);
const isStr = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const isHttps = (x: unknown): boolean => typeof x === 'string' && /^https:\/\/\S+$/.test(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Problemas de una geometría fijada (lista vacía si es válida). */
function sectorProblems(id: string, s: unknown): string[] {
  if (!isObj(s) || !isObj(s.geometry)) return [`${id}.sector: {geometry, exclude, skin_at_top, source}`];
  const out: string[] = [];
  const g = s.geometry;
  if (g.kind === 'linear') {
    if (!['xLeft', 'xRight', 'yTop', 'yBottom'].every((k) => isNum(g[k])) || !((g.xLeft as number) < (g.xRight as number)))
      out.push(`${id}.sector.geometry: lineal {xLeft < xRight, yTop, yBottom}`);
  } else if (g.kind === 'convex' || g.kind === 'sector') {
    if (!['apexX', 'apexY', 'thetaLeft', 'thetaRight', 'rhoMin', 'rhoMax'].every((k) => isNum(g[k])))
      out.push(`${id}.sector.geometry: convexa o sectorial {apexX, apexY, thetaLeft, thetaRight, rhoMin, rhoMax}`);
    else if (!((g.thetaLeft as number) < (g.thetaRight as number) && (g.rhoMin as number) < (g.rhoMax as number)))
      out.push(`${id}.sector.geometry: ángulos o radios invertidos`);
  } else out.push(`${id}.sector.geometry.kind: convex, sector o linear`);
  if (!Array.isArray(s.exclude) || !s.exclude.every((r) => isObj(r) && ['x0', 'y0', 'x1', 'y1'].every((k) => isNum(r[k]))))
    out.push(`${id}.sector.exclude: lista de {x0, y0, x1, y1}`);
  if (typeof s.skin_at_top !== 'boolean') out.push(`${id}.sector.skin_at_top: booleano`);
  if (!isStr(s.source)) out.push(`${id}.sector.source: quién la propuso y revisó`);
  return out;
}

/** Problemas del manifiesto (lista vacía si es válido). `referenceKeys`: las claves de docs/REFERENCES.md. */
export function manifestProblems(m: unknown, referenceKeys?: ReadonlySet<string>): string[] {
  const out: string[] = [];
  if (!isObj(m)) return ['el manifiesto no es un objeto'];
  if (typeof m.version !== 'number') out.push('version: falta o no es un número');
  if (!isStr(m.description)) out.push('description: falta');
  if (typeof m.verified !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.verified)) out.push('verified: fecha AAAA-MM-DD');
  if (!Array.isArray(m.items) || m.items.length === 0) return [...out, 'items: lista vacía'];
  const ids = new Set<string>();
  m.items.forEach((it: unknown, i: number) => {
    const at = `items[${i}]`;
    if (!isObj(it)) {
      out.push(`${at}: no es un objeto`);
      return;
    }
    const id = String(it.id);
    if (typeof it.id !== 'string' || !/^LUS-\d{2}[a-z]?$/.test(it.id)) out.push(`${at}.id «${id}»: LUS-NN o LUS-NNx`);
    if (ids.has(id)) out.push(`${at}.id «${id}» repetido`);
    ids.add(id);
    if (typeof it.bank_id !== 'string' || !/^LUS-\d{2}$/.test(it.bank_id) || !id.startsWith(it.bank_id))
      out.push(`${id}.bank_id: el LUS-NN del §2.1`);
    for (const k of ['subject', 'finding', 'pattern', 'credit', 'population', 'notes']) if (!isStr(it[k])) out.push(`${id}.${k}: falta`);
    if (typeof it.file !== 'string' || !it.file || isAbsolute(it.file) || it.file.split('/').includes('..'))
      out.push(`${id}.file: ruta relativa a la carpeta del banco, sin «..»`);
    if (!isHttps(it.url)) out.push(`${id}.url: https`);
    if (!isHttps(it.license_url)) out.push(`${id}.license_url: https`);
    if (!nullOr(it.doi, (v) => typeof v === 'string' && /^10\.\d{4,9}\/\S+$/.test(v))) out.push(`${id}.doi: 10.xxxx/… o null`);
    if (!nullOr(it.size_bytes, (v) => Number.isInteger(v) && (v as number) > 0)) out.push(`${id}.size_bytes: entero > 0 o null`);
    if (!nullOr(it.sha256, (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v))) out.push(`${id}.sha256: 64 hexadecimales o null`);
    if (!(OPEN_LICENSES as readonly string[]).includes(String(it.license)))
      out.push(`${id}.license «${String(it.license)}»: no es abierta (§4.1)`);
    if (!nullOr(it.probe, (v) => PROBES.includes(String(v)))) out.push(`${id}.probe: convex, linear, sector o null`);
    if (!nullOr(it.equipment, isStr)) out.push(`${id}.equipment: texto o null`);
    if (!nullOr(it.frequency_mhz, (v) => typeof v === 'number' && v > 0)) out.push(`${id}.frequency_mhz: > 0 o null`);
    if (!nullOr(it.mm_per_px, (v) => typeof v === 'number' && v > 0)) out.push(`${id}.mm_per_px: > 0 o null`);
    // decisión 5: ningún clip entra al repositorio
    if (it.in_repo !== false) out.push(`${id}.in_repo: debe ser false (decisión 5)`);
    out.push(...sectorProblems(id, it.sector));
    const qa = it.qa;
    if (!isObj(qa) || !QA_FLAGS.every((k) => typeof qa[k] === 'boolean') || !isStr(qa.note))
      out.push(`${id}.qa: {${QA_FLAGS.join(', ')}, note}`);
    else if (qa.usable && !qa.pleura) out.push(`${id}.qa: un clip sin pleura no puede ser usable`);
    if (!Array.isArray(it.references) || it.references.length === 0) out.push(`${id}.references: al menos una clave`);
    else if (referenceKeys)
      for (const k of it.references)
        if (!referenceKeys.has(String(k))) out.push(`${id}.references: «${String(k)}» no está en REFERENCES.md`);
  });
  return out;
}

/** Una métrica de un clip: cuantiles sobre sus cuadros y su censura (la de la mitad o más de los cuadros). */
export type ClipMetric = Quantiles & { censored: Censor | null; censored_fraction: number };

/**
 * Compuertas automáticas (la herramienta no confía a ciegas en el control de calidad): `true` = disparada.
 *  - `dpl_spread`: d_pl cambia más del 20 % entre cuadros (p10–p90 sobre la mediana), o más del 20 % de los cuadros no
 *    tiene pleura a ±30 % de la del cuadro medio: la pleura detectada salta;
 *  - `few_intercostal`: menos de 20 columnas intercostales (mediana de los cuadros);
 *  - `floor_above_deep`: el suelo de la sombra por encima del campo profundo (N3 < 0): la «sombra» no es una sombra;
 *  - `bimodal_crests`: en la mitad o más de los cuadros no queda ninguna sombra y se descarta al menos un tramo oscuro por
 *    crestas de varias poblaciones: lo oscuro no es una sombra costal limpia;
 *  - `repeated_frames`: más del 20 % de los pares de cuadros seguidos son idénticos (el vídeo repite cuadros).
 */
export interface Gates {
  dpl_spread: boolean;
  few_intercostal: boolean;
  floor_above_deep: boolean;
  bimodal_crests: boolean;
  repeated_frames: boolean;
}

/** Estadística de un clip en reference-stats.json. */
export interface ClipStats {
  id: string;
  bank_id: string;
  subject: string;
  pattern: string;
  probe: ManifestItem['probe'];
  sha256: string;
  width: number;
  height: number;
  frames: number;
  analyzed_frames: number;
  /** Se decodificaron menos cuadros de los que tiene el clip (`--max-frames`). */
  truncated: boolean;
  fps: number | null;
  /** El negro del vídeo (la moda fuera del sector): su recorte bajo. */
  black: number;
  sector: { kind: string; source: 'manifest'; skin_at_top: boolean; excluded: number };
  /** Cuánto se aparta el detector de la geometría fijada (ápice en px, bordes en grados): la estabilidad de la propuesta. */
  detector: { kind: string; apex_px: number | null; left_deg: number | null; right_deg: number | null } | null;
  qa: ManifestItem['qa'];
  gates: Gates;
  /** Compuertas disparadas que el control de calidad no esperaba (un clip apto debe tener esta lista vacía). */
  gate_failures: string[];
  /** Por métrica escalar (`flattenMetrics`): p10–p90 sobre los cuadros analizados, con su censura. */
  metrics: Record<string, ClipMetric>;
  /** T2 y S1 de la pila entera (un valor por clip); null con menos de 3 cuadros. */
  stack: Record<string, number | null> | null;
  stack_censored: Record<string, Censor>;
}

export interface SkippedClip {
  id: string;
  status: 'missing' | 'sha256-mismatch' | 'decode-error' | 'analysis-error';
  detail: string;
}

/** Un estrato (patrón y sonda): cada métrica con la mediana de cada clip apto que la ve, entre clips y entre sujetos. */
export interface StratumStats {
  pattern: string;
  probe: string;
  clips: string[];
  subjects: string[];
  metrics: Record<string, StratumMetric>;
}

export interface ReferenceStats {
  generated: string;
  tool: string;
  manifest_version: number;
  clips: ClipStats[];
  skipped: SkippedClip[];
  strata: StratumStats[];
}

const num = (x: number): number | null => (Number.isFinite(x) ? Number(x.toPrecision(6)) : null);

/** Qué necesita cada métrica, además de la pleura (el control de calidad del manifiesto decide si entra). */
export function metricNeeds(name: string): ('a_lines' | 'rib_shadow' | 'temporal')[] {
  if ((TEMPORAL_METRICS as readonly string[]).includes(name)) return ['temporal'];
  if (/^(A1\.|A2\.|N4$|M\.|levels\.a[12]Peak$)/.test(name)) return ['a_lines'];
  if (/^(P1$|P4\.|N[123]$|levels\.(floor|ribP95)\.)/.test(name)) return ['rib_shadow'];
  return [];
}

/** Las compuertas de un clip analizado. */
export function gatesOf(a: ClipAnalysis): Gates {
  const flat = a.perFrame.map(flattenMetrics);
  const col = (k: string): number[] => flat.map((f) => f[k]).filter((v) => Number.isFinite(v));
  const dpl = col('dPl.px');
  const lost = 1 - dpl.length / Math.max(1, flat.length);
  const n3 = col('N3');
  const floor = median(col('levels.floor.grey'));
  const deep = median(col('levels.deep.grey'));
  const rejected = col('shadows.rejected');
  const count = col('shadows.count');
  const pairs = Math.max(1, a.frames - 1);
  return {
    dpl_spread: dpl.length ? lost > 0.2 || (quantile(dpl, 0.9) - quantile(dpl, 0.1)) / median(dpl) > 0.2 : true,
    few_intercostal: !(median(col('intercostal.columns')) >= 20),
    floor_above_deep: (n3.length > 0 && median(n3) < 0) || (Number.isFinite(floor) && Number.isFinite(deep) && floor > deep),
    bimodal_crests: rejected.length > 0 && rejected.filter((r, i) => r >= 1 && !(count[i] >= 1)).length >= 0.5 * rejected.length,
    repeated_frames: a.stack ? a.stack.repeatedPairs / pairs > 0.2 : false,
  };
}

/** Las compuertas disparadas que contradicen el control de calidad (las que miran lo que el clip dice que se ve). */
export function gateFailures(qa: ManifestItem['qa'], g: Gates): string[] {
  if (!qa.usable) return [];
  const out: string[] = [];
  if (g.dpl_spread) out.push('dpl_spread');
  if (g.few_intercostal) out.push('few_intercostal');
  if (qa.rib_shadow && g.floor_above_deep) out.push('floor_above_deep');
  if (qa.rib_shadow && g.bimodal_crests) out.push('bimodal_crests');
  if (qa.temporal && g.repeated_frames) out.push('repeated_frames');
  return out;
}

/** Un clip analizado: sus estadísticas y la mediana de cada métrica (las que van a los estratos). */
export interface AnalyzedClip {
  stats: ClipStats;
}

export function clipStats(
  item: Pick<ManifestItem, 'id' | 'bank_id' | 'subject' | 'pattern' | 'probe' | 'qa' | 'sector'>,
  sha256: string,
  size: { width: number; height: number },
  fps: number | null,
  a: ClipAnalysis,
  extra: { black: number; truncated: boolean; detector: ClipStats['detector'] },
): AnalyzedClip {
  const perFrame = a.perFrame.map(flattenMetrics);
  const names = [...new Set(perFrame.flatMap((f) => Object.keys(f)))].sort();
  const gates = gatesOf(a);
  return {
    stats: {
      id: item.id,
      bank_id: item.bank_id,
      subject: item.subject,
      pattern: item.pattern,
      probe: item.probe,
      sha256,
      width: size.width,
      height: size.height,
      frames: a.frames,
      analyzed_frames: a.analyzedFrames,
      truncated: extra.truncated,
      fps: fps === null ? null : num(fps),
      black: extra.black,
      sector: {
        kind: item.sector.geometry.kind,
        source: 'manifest',
        skin_at_top: item.sector.skin_at_top,
        excluded: item.sector.exclude.length,
      },
      detector: extra.detector,
      qa: item.qa,
      gates,
      gate_failures: gateFailures(item.qa, gates),
      metrics: Object.fromEntries(
        names.map((k) => [
          k,
          {
            ...quantilesOf(perFrame.map((f) => f[k] ?? Number.NaN)),
            censored: a.summary[k]?.censored ?? null,
            censored_fraction: num(a.summary[k]?.censoredFraction ?? 0) ?? 0,
          },
        ]),
      ),
      stack: stackScalars(a.stack),
      stack_censored: a.stack?.censored ?? {},
    },
  };
}

/**
 * El archivo de estadísticas: los clips, los saltados y los estratos por patrón y sonda (convexa, lineal, sectorial). En cada
 * estrato entran los clips aptos (`qa.usable`) sin compuertas disparadas y, en cada métrica, los que ven lo que esa métrica
 * necesita (`metricNeeds`), no la tienen censurada y la miden en al menos la mitad de sus cuadros analizados (la mediana de
 * los pocos cuadros en que, por ejemplo, asoma una línea A de orden 3 no es el valor del clip: `sparseClips`); de cada uno,
 * su mediana. La distribución se da entre clips y entre sujetos (la mediana de las medianas de cada sujeto), con cuántos
 * hay de cada uno.
 */
export function buildReferenceStats(
  manifestVersion: number,
  clips: AnalyzedClip[],
  skipped: SkippedClip[],
  generated = new Date().toISOString(),
): ReferenceStats {
  const keyOf = (c: ClipStats) => `${c.pattern}|${c.probe ?? 'desconocida'}`;
  const usable = clips.filter((c) => c.stats.qa.usable && c.stats.gate_failures.length === 0);
  const sees = (c: ClipStats, name: string): boolean => metricNeeds(name).every((need) => c.qa[need]);
  const valueOf = (c: ClipStats, name: string): { v: number; censored: boolean; sparse: boolean } => {
    if (name in (c.stack ?? {})) return { v: c.stack?.[name] ?? Number.NaN, censored: !!c.stack_censored[name], sparse: false };
    const m = c.metrics[name];
    return { v: m?.median ?? Number.NaN, censored: !!m?.censored, sparse: !m || m.n < 0.5 * c.analyzed_frames };
  };
  const strata = [...new Set(usable.map((c) => keyOf(c.stats)))].sort().map((key) => {
    const members = usable.filter((c) => keyOf(c.stats) === key).map((c) => c.stats);
    const [pattern, probe] = key.split('|');
    const names = [...new Set(members.flatMap((c) => [...Object.keys(c.metrics), ...Object.keys(c.stack ?? {})]))].sort();
    const metrics: Record<string, StratumMetric> = {};
    for (const k of names) {
      const seeing = members.filter((c) => sees(c, k));
      const measured = seeing.map((c) => ({ c, ...valueOf(c, k) })).filter((x) => Number.isFinite(x.v));
      const vals = measured.filter((x) => !x.sparse);
      const good = vals.filter((x) => !x.censored);
      if (!good.length) continue;
      const subjects = [...new Set(good.map((x) => x.c.subject))];
      metrics[k] = {
        betweenClips: quantilesOf(good.map((x) => x.v)),
        betweenSubjects: quantilesOf(subjects.map((s) => median(good.filter((x) => x.c.subject === s).map((x) => x.v)))),
        clips: good.length,
        subjects: subjects.length,
        censoredClips: vals.length - good.length,
        sparseClips: measured.length - vals.length,
      };
    }
    return { pattern, probe, clips: members.map((c) => c.id), subjects: [...new Set(members.map((c) => c.subject))].sort(), metrics };
  });
  return {
    generated,
    tool: 'tools/fidelity/reference.ts',
    manifest_version: manifestVersion,
    clips: clips.map((c) => c.stats),
    skipped,
    strata,
  };
}

/** Problemas del archivo de estadísticas: la forma, solo números finitos o null, y nada que no sea derivado. */
export function statsProblems(s: unknown): string[] {
  const out: string[] = [];
  if (!isObj(s)) return ['las estadísticas no son un objeto'];
  if (typeof s.generated !== 'string' || Number.isNaN(Date.parse(s.generated))) out.push('generated: fecha ISO');
  if (s.tool !== 'tools/fidelity/reference.ts') out.push('tool: tools/fidelity/reference.ts');
  if (typeof s.manifest_version !== 'number') out.push('manifest_version: número');
  if (!Array.isArray(s.clips) || !Array.isArray(s.skipped) || !Array.isArray(s.strata)) return [...out, 'clips, skipped y strata: listas'];
  const numOrNull = (v: unknown): boolean => v === null || isNum(v);
  const qOk = (d: unknown): boolean =>
    isObj(d) && ['p10', 'p25', 'median', 'p75', 'p90'].every((k) => numOrNull(d[k])) && Number.isInteger(d.n);
  s.clips.forEach((c: unknown, i: number) => {
    if (!isObj(c)) return out.push(`clips[${i}]: no es un objeto`);
    const id = String(c.id);
    if (typeof c.id !== 'string' || !/^LUS-\d{2}[a-z]?$/.test(c.id)) out.push(`clips[${i}].id`);
    if (typeof c.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(c.sha256)) out.push(`${id}.sha256`);
    if (!isStr(c.subject)) out.push(`${id}.subject`);
    for (const k of ['width', 'height', 'frames', 'analyzed_frames'])
      if (!Number.isInteger(c[k]) || (c[k] as number) <= 0) out.push(`${id}.${k}`);
    if (!isObj(c.gates) || !Array.isArray(c.gate_failures)) out.push(`${id}.gates`);
    if (!isObj(c.metrics) || Object.keys(c.metrics).length === 0) out.push(`${id}.metrics: vacío`);
    else for (const [k, d] of Object.entries(c.metrics)) if (!qOk(d)) out.push(`${id}.metrics.${k}: {p10, p25, median, p75, p90, n}`);
    if (c.stack !== null && !(isObj(c.stack) && Object.values(c.stack).every(numOrNull))) out.push(`${id}.stack`);
  });
  s.strata.forEach((g: unknown, i: number) => {
    if (!isObj(g) || !isObj(g.metrics) || !Array.isArray(g.clips) || !Array.isArray(g.subjects)) return out.push(`strata[${i}]`);
    for (const [k, d] of Object.entries(g.metrics))
      if (!isObj(d) || !qOk(d.betweenClips) || !qOk(d.betweenSubjects) || !Number.isInteger(d.clips) || !Number.isInteger(d.subjects))
        out.push(`strata[${i}].metrics.${k}`);
  });
  s.skipped.forEach((x: unknown, i: number) => {
    if (!isObj(x) || !['missing', 'sha256-mismatch', 'decode-error', 'analysis-error'].includes(String(x.status)))
      out.push(`skipped[${i}]`);
  });
  // solo estadísticas derivadas: ni rutas locales ni listas largas de números (cuadros, perfiles)
  const text = JSON.stringify(s);
  if (/\/Users\/|\/home\/|[A-Z]:\\\\|~\//.test(text)) out.push('contiene una ruta local');
  const longArray = (v: unknown): boolean =>
    Array.isArray(v)
      ? (v.length > 64 && v.every((x) => typeof x === 'number')) || v.some(longArray)
      : isObj(v) && Object.values(v).some(longArray);
  if (longArray(s)) out.push('contiene una lista larga de números (¿píxeles?)');
  return out;
}

/** SHA-256 hexadecimal de un archivo. */
export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Busca `file` en `dir`: primero como ruta relativa y si no, por su nombre en cualquier subcarpeta. null si no está. */
export function locateFile(dir: string, file: string): string | null {
  const direct = join(dir, file);
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  const name = basename(file);
  const walk = (d: string): string | null => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      const st = statSync(p);
      if (st.isDirectory()) {
        const r = walk(p);
        if (r) return r;
      } else if (e === name) return p;
    }
    return null;
  };
  return walk(dir);
}

/**
 * Cuadros en gris de 8 bits (rango completo) de un vídeo con ffmpeg y ffprobe, todos o a lo sumo `maxFrames` (`truncated`
 * dice si quedaron cuadros fuera); lanza si no se puede decodificar.
 */
export function decodeGrey(
  path: string,
  ffmpeg: string,
  maxFrames = Number.POSITIVE_INFINITY,
): { frames: GreyFrame[]; fps: number | null; width: number; height: number; truncated: boolean } {
  const ffprobe = join(dirname(ffmpeg), basename(ffmpeg).replace('ffmpeg', 'ffprobe'));
  const probe = spawnSync(
    existsSync(ffprobe) ? ffprobe : 'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,r_frame_rate', '-of', 'json', path],
    { encoding: 'utf8' },
  );
  if (probe.status !== 0) throw new Error(`ffprobe falló (${probe.status}): ${probe.stderr || probe.error?.message}`);
  const st = (JSON.parse(probe.stdout) as { streams: { width: number; height: number; avg_frame_rate: string; r_frame_rate: string }[] })
    .streams[0];
  if (!st) throw new Error('ffprobe: sin pista de vídeo');
  // la cadencia media; si el contenedor no la da (Ogg: «0/0»), la nominal
  const rate = (s: string | undefined): number | null => {
    const [n, d] = (s ?? '').split('/').map(Number);
    return n > 0 && d > 0 ? n / d : null;
  };
  const fps = rate(st.avg_frame_rate) ?? rate(st.r_frame_rate);
  // gris de rango completo: el Y de un vídeo de rango limitado (16–235) se lleva a 0–255
  const limit = Number.isFinite(maxFrames) ? ['-frames:v', String(maxFrames + 1)] : [];
  const dec = spawnSync(
    ffmpeg,
    ['-v', 'error', '-i', path, '-vf', 'scale=out_range=full,format=gray', ...limit, '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'],
    { maxBuffer: 2 ** 31 },
  );
  if (dec.status !== 0) throw new Error(`ffmpeg falló (${dec.status}): ${dec.stderr?.toString() || dec.error?.message}`);
  const size = st.width * st.height;
  const count = Math.floor(dec.stdout.length / size);
  if (count < 1) throw new Error('ffmpeg: ningún cuadro');
  const truncated = count > maxFrames;
  const frames = Array.from({ length: Math.min(count, maxFrames) }, (_, i) => ({
    width: st.width,
    height: st.height,
    data: dec.stdout.subarray(i * size, (i + 1) * size),
  }));
  return { frames, fps, width: st.width, height: st.height, truncated };
}

/** Cuánto se aparta la geometría detectada de la fijada: el ápice (px) y los bordes (grados). */
export function detectorAgreement(fixed: SectorGeometry, detected: SectorGeometry): ClipStats['detector'] {
  const deg = (x: number): number | null => num((x * 180) / Math.PI);
  if (fixed.kind === 'linear' || detected.kind === 'linear')
    return {
      kind: detected.kind,
      apex_px: null,
      left_deg: null,
      right_deg: fixed.kind === detected.kind ? null : Number.NaN,
    };
  return {
    kind: detected.kind,
    apex_px: num(Math.hypot(detected.apexX - fixed.apexX, detected.apexY - fixed.apexY)),
    left_deg: deg(detected.thetaLeft - fixed.thetaLeft),
    right_deg: deg(detected.thetaRight - fixed.thetaRight),
  };
}

export interface RunOptions {
  dir: string;
  manifestPath: string;
  outPath: string;
  ffmpeg: string;
  maxFrames?: number;
  log?: (msg: string) => void;
}

/**
 * Corre el banco sobre la carpeta de referencia. Devuelve `no-dir` sin tocar nada si la carpeta no existe; si no, escribe las
 * estadísticas (aunque falten clips: quedan en `skipped`) y las devuelve.
 */
export function runReference(o: RunOptions): { status: 'no-dir' } | { status: 'ok'; stats: ReferenceStats } {
  const log = o.log ?? console.log;
  if (!existsSync(o.dir)) {
    log(
      `fidelity:ref — no existe la carpeta del banco de referencia (${o.dir}): nada que medir. Descarga los clips del manifiesto a mano (decisión 5) o usa --dir / LUS_REFERENCE_DIR.`,
    );
    return { status: 'no-dir' };
  }
  const manifest = JSON.parse(readFileSync(o.manifestPath, 'utf8')) as Manifest;
  const problems = manifestProblems(manifest);
  if (problems.length) throw new Error(`manifiesto inválido:\n${problems.join('\n')}`);
  const clips: AnalyzedClip[] = [];
  const skipped: SkippedClip[] = [];
  for (const item of manifest.items) {
    const path = locateFile(o.dir, item.file);
    if (!path) {
      log(`${item.id}: no está (${item.file})`);
      skipped.push({ id: item.id, status: 'missing', detail: item.file });
      continue;
    }
    const sha = sha256File(path);
    if (item.sha256 === null) log(`${item.id}: sha256 ${sha} (el manifiesto lo tiene en null: anótalo tras verificar el origen)`);
    else if (item.sha256 !== sha) {
      log(`${item.id}: el SHA-256 no coincide (${sha} ≠ ${item.sha256}): se salta`);
      skipped.push({ id: item.id, status: 'sha256-mismatch', detail: sha });
      continue;
    }
    const bytes = statSync(path).size;
    if (item.size_bytes !== null && item.size_bytes !== bytes) log(`${item.id}: ${bytes} B frente a ${item.size_bytes} B del manifiesto`);
    let decoded: ReturnType<typeof decodeGrey>;
    try {
      decoded = decodeGrey(path, o.ffmpeg, o.maxFrames ?? Number.POSITIVE_INFINITY);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      log(`${item.id}: no se pudo decodificar: ${detail}`);
      skipped.push({ id: item.id, status: 'decode-error', detail: detail.slice(0, 200) });
      continue;
    }
    if (decoded.truncated) log(`${item.id}: AVISO, solo se decodificaron ${decoded.frames.length} cuadros (--max-frames): el clip sigue`);
    try {
      const { geometry, exclude, skin_at_top } = item.sector;
      const black = outsideBlack(decoded.frames, geometry, exclude) ?? 0;
      const scale = { ...GREY_8BIT, lo: black };
      const a = analyzeClip(decoded.frames, {
        scale,
        geometry,
        exclude,
        skinAtTop: skin_at_top,
        mmPerPx: item.mm_per_px,
        frameIntervalS: decoded.fps ? 1 / decoded.fps : null,
        maxFrames: 60,
      });
      let detector: ClipStats['detector'] = null;
      try {
        detector = detectorAgreement(geometry, detectSector(decoded.frames, scale).geometry);
      } catch (e) {
        log(`${item.id}: el detector no propone geometría (${e instanceof Error ? e.message : String(e)})`);
      }
      const c = clipStats(item, sha, decoded, decoded.fps, a, { black, truncated: decoded.truncated, detector });
      clips.push(c);
      const fails = c.stats.gate_failures;
      log(
        `${item.id}: ${decoded.frames.length} cuadros ${decoded.width}×${decoded.height} a ${decoded.fps?.toFixed(1) ?? '?'} cps, ${geometry.kind}, negro ${black}` +
          (fails.length ? ` — AVISO: apto con compuertas disparadas: ${fails.join(', ')}` : ''),
      );
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      log(`${item.id}: el análisis falló: ${detail}`);
      skipped.push({ id: item.id, status: 'analysis-error', detail: detail.slice(0, 200) });
    }
  }
  const stats = buildReferenceStats(manifest.version, clips, skipped);
  const bad = statsProblems(stats);
  if (bad.length) throw new Error(`estadísticas inválidas:\n${bad.join('\n')}`);
  writeFileSync(o.outPath, `${JSON.stringify(stats, null, 1)}\n`);
  log(`fidelity:ref — ${clips.length} clips medidos, ${skipped.length} saltados → ${o.outPath}`);
  return { status: 'ok', stats };
}

const isMain = process.argv[1]?.endsWith('reference.ts');
if (isMain) {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1] ?? '');
  const def = existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
  runReference({
    dir: resolve(args.get('dir') ?? process.env.LUS_REFERENCE_DIR ?? join(homedir(), 'datos', 'lus-referencia')),
    manifestPath: args.get('manifest') ?? 'docs/reference-bank/MANIFEST.json',
    outPath: args.get('out') ?? 'docs/reference-bank/reference-stats.json',
    ffmpeg: args.get('ffmpeg') ?? def,
    maxFrames: args.has('max-frames') ? Number(args.get('max-frames')) : undefined,
  });
}
