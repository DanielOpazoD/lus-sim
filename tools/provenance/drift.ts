/**
 * Deriva del código portado (decisión 3). Lee la tabla de docs/PROVENANCE.md y, para cada archivo,
 * compara la copia local con su origen en el commit fijado y cuenta los commits del origen que tocaron
 * ese archivo después del commit fijado:
 *
 *   npm run provenance              informe
 *   npm run provenance -- --check   falla si un archivo marcado «idéntico» ya no lo es, o si uno
 *                                   marcado «adaptado» es igual a su origen (la tabla miente)
 *
 * Los repositorios de origen se buscan junto a este (`../vexus-sim`, `../simuladorecocardiograma`) o en
 * las variables VEXUS_DIR y ECHOTWIN_DIR. Si un origen no está (p. ej. en CI), sus filas se informan
 * como «origen no disponible» y no fallan: la comprobación es local, en la máquina donde viven los
 * tres simuladores. Todo `git` se invoca con argumentos en lista, sin shell.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export type Declared = 'idéntico' | 'adaptado';

export interface ProvenanceRow {
  /** Ruta local, relativa a la raíz del repo. */
  file: string;
  /** Repositorio de origen (`vexus-sim` o `echotwin-tte`). */
  repo: string;
  /** Commit fijado del origen. */
  commit: string;
  /** Ruta en el origen. */
  originPath: string;
  declared: Declared;
  /** Qué cambió respecto del origen (texto libre; «—» si nada). */
  changes: string;
}

const ROW = /^\|\s*`([^`]+)`\s*\|\s*`([a-z0-9-]+)@([0-9a-f]{7,40}):([^`]+)`\s*\|\s*(idéntico|adaptado)\s*\|\s*(.*?)\s*\|\s*$/;

/** Filas de la tabla de procedencia; las líneas que no son filas de datos se ignoran. */
export function parseProvenance(md: string): ProvenanceRow[] {
  const out: ProvenanceRow[] = [];
  for (const line of md.split('\n')) {
    const m = ROW.exec(line);
    if (!m) continue;
    out.push({ file: m[1], repo: m[2], commit: m[3], originPath: m[4], declared: m[5] as Declared, changes: m[6] });
  }
  return out;
}

/** Repos de origen conocidos: carpeta hermana por omisión y variable de entorno que la sustituye. */
export const ORIGINS: Record<string, { sibling: string; env: string }> = {
  'vexus-sim': { sibling: 'vexus-sim', env: 'VEXUS_DIR' },
  'echotwin-tte': { sibling: 'simuladorecocardiograma', env: 'ECHOTWIN_DIR' },
};

export function originDir(repo: string, root: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const o = ORIGINS[repo];
  if (!o) return null;
  const dir = resolve(env[o.env] ?? join(root, '..', o.sibling));
  return existsSync(join(dir, '.git')) ? dir : null;
}

function git(dir: string, args: string[]): { status: number; stdout: string } {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status ?? -1, stdout: r.stdout ?? '' };
}

/** Contenido del origen en el commit fijado, o `null` si el commit o la ruta no existen. */
export function originContent(dir: string, commit: string, path: string): string | null {
  const r = git(dir, ['show', `${commit}:${path}`]);
  return r.status === 0 ? r.stdout : null;
}

/**
 * Contenidos del origen para varias rutas en un solo proceso (`git cat-file --batch`). La comprobación de
 * la suite no puede lanzar un `git` por archivo: con la máquina cargada, ~116 procesos tardaron 68 s y la
 * prueba agotó su plazo. Clave `commit:ruta`; `null` si el objeto no existe o no es un archivo.
 */
export function originContents(dir: string, specs: readonly string[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  if (specs.length === 0) return out;
  const r = spawnSync('git', ['-C', dir, 'cat-file', '--batch'], { input: specs.join('\n') + '\n', maxBuffer: 256 * 1024 * 1024 });
  const buf = r.stdout ?? Buffer.alloc(0);
  let pos = 0;
  for (const spec of specs) {
    const nl = buf.indexOf(0x0a, pos);
    if (nl < 0) {
      out.set(spec, null);
      continue;
    }
    const header = buf.subarray(pos, nl).toString('utf8');
    pos = nl + 1;
    // «<sha> <tipo> <bytes>» seguido del contenido y un salto de línea; «<spec> missing» si no existe
    const m = /^[0-9a-f]+ (\w+) (\d+)$/.exec(header);
    if (!m) {
      out.set(spec, null);
      continue;
    }
    const size = Number(m[2]);
    out.set(spec, m[1] === 'blob' ? buf.subarray(pos, pos + size).toString('utf8') : null);
    pos += size + 1;
  }
  return out;
}

export interface Honesty {
  row: ProvenanceRow;
  actual: Actual;
  /** La tabla dice lo que el código es (solo se juzga si el origen está disponible). */
  honest: boolean;
}

/** ¿Dice la tabla la verdad? Solo compara contenidos: un proceso `git` por repositorio de origen. */
export function honestyOf(rows: readonly ProvenanceRow[], root: string, env: NodeJS.ProcessEnv = process.env): Honesty[] {
  const byRepo = new Map<string, ProvenanceRow[]>();
  for (const r of rows) byRepo.set(r.repo, [...(byRepo.get(r.repo) ?? []), r]);
  const out: Honesty[] = [];
  for (const [repo, list] of byRepo) {
    const dir = originDir(repo, root, env);
    const contents = dir
      ? originContents(
          dir,
          list.map((r) => `${r.commit}:${r.originPath}`),
        )
      : new Map<string, string | null>();
    for (const row of list) {
      const origin = contents.get(`${row.commit}:${row.originPath}`) ?? null;
      if (!dir || origin === null) {
        out.push({ row, actual: 'origen no disponible', honest: true });
        continue;
      }
      const same = origin === readFileSync(join(root, row.file), 'utf8');
      out.push({ row, actual: same ? 'idéntico' : 'modificado', honest: row.declared === 'idéntico' ? same : !same });
    }
  }
  return out;
}

/** Líneas añadidas y quitadas entre dos textos (git diff --no-index, sin shell). */
export function lineDelta(before: string, after: string): { added: number; removed: number } {
  if (before === after) return { added: 0, removed: 0 };
  const tmp = mkdtempSync(join(tmpdir(), 'lus-provenance-'));
  try {
    const a = join(tmp, 'a');
    const b = join(tmp, 'b');
    writeFileSync(a, before);
    writeFileSync(b, after);
    const r = spawnSync('git', ['diff', '--no-index', '--numstat', '--', a, b], { encoding: 'utf8' });
    const m = /^(\d+)\s+(\d+)/.exec(r.stdout ?? '');
    return m ? { added: Number(m[1]), removed: Number(m[2]) } : { added: 0, removed: 0 };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Commits del origen que tocaron `path` después de `commit` (en origin/main o, si no hay, main). */
export function upstreamCommitsSince(dir: string, commit: string, path: string): number | null {
  for (const ref of ['origin/main', 'main']) {
    if (git(dir, ['rev-parse', '--verify', '--quiet', ref]).status !== 0) continue;
    const r = git(dir, ['log', '--oneline', `${commit}..${ref}`, '--', path]);
    if (r.status !== 0) return null;
    return r.stdout.split('\n').filter((l) => l.trim() !== '').length;
  }
  return null;
}

export type Actual = 'idéntico' | 'modificado' | 'origen no disponible';

export interface DriftReport {
  row: ProvenanceRow;
  actual: Actual;
  added: number;
  removed: number;
  upstream: number | null;
  /** La tabla dice lo que el código es (solo se juzga si el origen está disponible). */
  honest: boolean;
}

export function driftOf(row: ProvenanceRow, root: string, env: NodeJS.ProcessEnv = process.env): DriftReport {
  const dir = originDir(row.repo, root, env);
  const origin = dir ? originContent(dir, row.commit, row.originPath) : null;
  if (!dir || origin === null) return { row, actual: 'origen no disponible', added: 0, removed: 0, upstream: null, honest: true };
  const local = readFileSync(join(root, row.file), 'utf8');
  const { added, removed } = lineDelta(origin, local);
  const actual: Actual = added === 0 && removed === 0 ? 'idéntico' : 'modificado';
  const honest = row.declared === 'idéntico' ? actual === 'idéntico' : actual === 'modificado';
  return { row, actual, added, removed, upstream: upstreamCommitsSince(dir, row.commit, row.originPath), honest };
}

if (process.argv[1]?.endsWith('drift.ts')) {
  const root = process.cwd();
  const rows = parseProvenance(readFileSync(join(root, 'docs/PROVENANCE.md'), 'utf8'));
  const reports = rows.map((r) => driftOf(r, root));
  for (const d of reports) {
    const delta = d.actual === 'modificado' ? ` (+${d.added} −${d.removed})` : '';
    const up = d.upstream === null ? '' : d.upstream === 0 ? ' · origen sin cambios' : ` · origen: ${d.upstream} commit(s) nuevos`;
    const flag = d.honest ? '' : `  ← la tabla dice «${d.row.declared}»`;
    console.log(`${d.row.file.padEnd(40)} ${d.actual}${delta}${up}${flag}`);
  }
  if (process.argv.includes('--check') && reports.some((d) => !d.honest)) {
    console.error('provenance: docs/PROVENANCE.md no coincide con el código');
    process.exit(1);
  }
}
