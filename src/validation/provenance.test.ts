import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { driftOf, lineDelta, originDir, parseProvenance } from '../../tools/provenance/drift';

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

  // Solo donde viven los repos de origen (la máquina de desarrollo); en CI no están y se informa aparte
  const available = rows.some((r) => originDir(r.repo, ROOT) !== null);
  it.skipIf(!available)('la tabla dice la verdad: lo «idéntico» es idéntico y lo «adaptado» difiere de su origen', () => {
    const lies = rows
      .map((r) => driftOf(r, ROOT))
      .filter((d) => !d.honest)
      .map((d) => `${d.row.file}: la tabla dice «${d.row.declared}», el código está ${d.actual}`);
    expect(lies).toEqual([]);
  });
});
