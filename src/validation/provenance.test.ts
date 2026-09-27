import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gitEnv, honestyOf, lineDelta, originContents, originDir, parseProvenance } from '../../tools/provenance/drift';

const ROOT = resolve(__dirname, '../..');
const rows = parseProvenance(readFileSync(resolve(ROOT, 'docs/PROVENANCE.md'), 'utf8'));

/**
 * Procedencia del código portado (decisión 3). La tabla de docs/PROVENANCE.md es la que permitirá
 * reconciliar lus-sim con VExUS y EchoTwin al unirlos: tiene que decir la verdad.
 */
describe('docs/PROVENANCE.md', () => {
  it('parseProvenance lee las filas de datos y omite el resto (entrada sintética)', () => {
    const md = [
      '| Archivo | Origen | Estado | Cambios |',
      '|---|---|---|---|',
      '| `src/core/clock.ts` | `vexus-sim@52354d5:src/core/clock.ts` | idéntico | — |',
      '| `src/validation/layers.test.ts` | `vexus-sim@52354d5:src/validation/layers.test.ts` | adaptado | matriz de capas propia |',
      '| `src/x.ts` | origen sin formato | idéntico | — |',
    ].join('\n');
    expect(parseProvenance(md)).toEqual([
      {
        file: 'src/core/clock.ts',
        repo: 'vexus-sim',
        commit: '52354d5',
        originPath: 'src/core/clock.ts',
        declared: 'idéntico',
        changes: '—',
      },
      {
        file: 'src/validation/layers.test.ts',
        repo: 'vexus-sim',
        commit: '52354d5',
        originPath: 'src/validation/layers.test.ts',
        declared: 'adaptado',
        changes: 'matriz de capas propia',
      },
    ]);
  });

  it('cada fila apunta a un archivo local que existe, sin duplicados', () => {
    expect(rows.length).toBeGreaterThan(0);
    const files = rows.map((r) => r.file);
    expect(files.filter((f, i) => files.indexOf(f) !== i)).toEqual([]);
    expect(files.filter((f) => !existsSync(resolve(ROOT, f)))).toEqual([]);
  });

  it('un archivo adaptado dice qué cambió', () => {
    expect(rows.filter((r) => r.declared === 'adaptado' && (r.changes === '' || r.changes === '—')).map((r) => r.file)).toEqual([]);
  });

  it('lineDelta cuenta líneas añadidas y quitadas', () => {
    expect(lineDelta('a\nb\n', 'a\nb\n')).toEqual({ added: 0, removed: 0 });
    expect(lineDelta('a\nb\n', 'a\nc\nd\n')).toEqual({ added: 2, removed: 1 });
  });

  it('originDir: repo desconocido o carpeta inexistente → null', () => {
    expect(originDir('otro-repo', ROOT)).toBeNull();
    expect(originDir('vexus-sim', ROOT, { VEXUS_DIR: '/no/existe' })).toBeNull();
  });

  it('originContents lee varios objetos en un solo proceso, incluidos los que no existen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lus-origin-'));
    try {
      // sin las variables GIT_* del hook que corra la prueba (el pre-push): con ellas, en un worktree, este repo de juguete se
      // comitea en la rama del worktree (`gitEnv`)
      const git = (...args: string[]) =>
        spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8', env: gitEnv() });
      git('init', '-q');
      writeFileSync(join(dir, 'a.ts'), 'línea 1\nlínea 2\n');
      writeFileSync(join(dir, 'b.ts'), '');
      git('add', '.');
      git('commit', '-q', '-m', 'x');
      const got = originContents(dir, ['HEAD:a.ts', 'HEAD:no-existe.ts', 'HEAD:b.ts', 'HEAD:a.ts']);
      expect(got.get('HEAD:a.ts')).toBe('línea 1\nlínea 2\n');
      expect(got.get('HEAD:no-existe.ts')).toBeNull();
      expect(got.get('HEAD:b.ts')).toBe('');
      expect(originContents(dir, [])).toEqual(new Map());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gitEnv quita las variables GIT_* que exporta un hook: el repo de juguete no se comitea en el de GIT_DIR', () => {
    expect(gitEnv({ PATH: '/bin', GIT_DIR: '/x/.git', GIT_WORK_TREE: '/x', GIT_INDEX_FILE: '/x/i', HOME: '/h' })).toEqual({
      PATH: '/bin',
      HOME: '/h',
    });
    // el caso del hook con un repo señuelo en GIT_DIR (y nada más heredado): con ese entorno el commit cae en el señuelo (la
    // mutación, lo que pasó en un worktree); con gitEnv, en el repo de juguete
    const decoy = mkdtempSync(join(tmpdir(), 'lus-decoy-'));
    const dir = mkdtempSync(join(tmpdir(), 'lus-origin-'));
    try {
      spawnSync('git', ['-C', decoy, 'init', '-q'], { env: gitEnv() });
      const hookEnv = { ...gitEnv(), GIT_DIR: join(decoy, '.git') };
      const commitIn = (env: NodeJS.ProcessEnv) => {
        const git = (...args: string[]) =>
          spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8', env });
        git('init', '-q');
        writeFileSync(join(dir, 'a.ts'), 'a\n');
        git('add', '.');
        git('commit', '-q', '-m', 'x');
      };
      const head = (repo: string) => spawnSync('git', ['-C', repo, 'rev-parse', '--verify', '-q', 'HEAD'], { env: gitEnv() }).status;
      commitIn(gitEnv(hookEnv));
      expect(head(dir)).toBe(0);
      expect(head(decoy)).not.toBe(0);
      commitIn(hookEnv);
      expect(head(decoy)).toBe(0);
    } finally {
      rmSync(decoy, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Solo donde viven los repos de origen (la máquina de desarrollo); en CI no están y se informa aparte
  const available = rows.some((r) => originDir(r.repo, ROOT) !== null);
  it.skipIf(!available)('la tabla dice la verdad: lo «idéntico» es idéntico y lo «adaptado» difiere de su origen', () => {
    const lies = honestyOf(rows, ROOT)
      .filter((d) => !d.honest)
      .map((d) => `${d.row.file}: la tabla dice «${d.row.declared}», el código está ${d.actual}`);
    expect(lies).toEqual([]);
  });
});
