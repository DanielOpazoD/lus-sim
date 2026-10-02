import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STRIPPED_NOTE, stripEvidenceNotes } from '../../tools/build/evidenceNotes';

const SRC = fileURLToPath(new URL('..', import.meta.url));
function sources(dir = SRC): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.ts$/.test(f) && !/\.test\.ts$/.test(f)) out.push(p);
  }
  return out;
}

/**
 * Las notas de evidencia fuera del bundle (decisión 29, `tools/build/evidenceNotes.ts`): el build vacía el valor de cada `note`
 * de un `defineParameters` (≈ 36 kB del bundle que la aplicación no lee) sin tocar lo demás ni el número de líneas.
 */
describe('Notas de evidencia en el build (tools/build/evidenceNotes.ts)', () => {
  it('vacía las notas (literales y sumas de literales) y conserva el resto y las líneas', () => {
    const src = [
      "export const P = defineParameters('x.y', {",
      '  a: {',
      '    value: 1,',
      "    unit: 'mm',",
      "    evidence: 'derivado',",
      "    sources: ['gray-anatomia-1918'],",
      "    note: 'una cita ' +",
      "      'y su cálculo',",
      '  },',
      "  b: { value: 2, unit: 'mm', evidence: 'documentado', sources: ['k-a-1'], note: `plantilla` },",
      '});',
      "const other = { note: 'no es un parámetro' };",
    ].join('\n');
    const out = stripEvidenceNotes(src);
    expect(out.split('\n')).toHaveLength(src.split('\n').length);
    expect(out).toContain(`note: '${STRIPPED_NOTE}' +`);
    expect(out).not.toContain('una cita');
    expect(out).not.toContain('su cálculo');
    expect(out).not.toContain('plantilla');
    // fuera de defineParameters, nada
    expect(out).toContain("const other = { note: 'no es un parámetro' };");
    expect(out).toContain("sources: ['gray-anatomia-1918'],");
  });

  it('una nota que no es solo texto se queda como está', () => {
    const src = "defineParameters('x', { a: { value: 1, unit: 'mm', evidence: 'estimado', range: [0, 2], sources: [], note: 'n ' + N } });";
    expect(stripEvidenceNotes(src)).toBe(src);
  });

  it('en el código del modelo: el mismo número de líneas en cada módulo y ninguna nota con texto', () => {
    let notes = 0;
    for (const f of sources()) {
      const code = readFileSync(f, 'utf8');
      if (!code.includes('defineParameters')) continue;
      const out = stripEvidenceNotes(code, f);
      expect(out.split('\n').length, f).toBe(code.split('\n').length);
      notes += (code.match(/\bnote:/g) ?? []).length;
      // lo que queda de cada nota es la marca (y cadenas vacías)
      for (const m of out.matchAll(/\bnote:\s*'([^']*)'/g)) expect(m[1], f).toBe(STRIPPED_NOTE);
    }
    expect(notes).toBeGreaterThan(150);
  });

  it('la aplicación no lee las notas: ningún módulo fuera de las pruebas y de `core/evidence.ts` usa `.note`', () => {
    for (const f of sources()) {
      if (f.endsWith(join('core', 'evidence.ts'))) continue;
      expect(/\.note\b/.test(readFileSync(f, 'utf8')), f).toBe(false);
    }
  });
});
