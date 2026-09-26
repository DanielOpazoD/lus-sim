import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineParameters, parameterProblems, type Parameter } from '../core/evidence';
import { referenceKeys } from './support/references';
import { PARAMETER_SETS } from './parameterSets';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const ok: Parameter = { value: 2, unit: 'mm', range: [1, 3], evidence: 'documentado', sources: ['autor-tema-2012'] };

/**
 * Evidencia de los parámetros (decisión 4). Cada regla se prueba en los dos sentidos: el parámetro
 * válido pasa y la misma entrada con el defecto falla con el mensaje que lo nombra.
 */
describe('parameterProblems: cada regla atrapa su defecto', () => {
  it('un parámetro documentado con fuente y rango es válido', () => {
    expect(parameterProblems('p', ok)).toEqual([]);
  });

  it.each<[string, Partial<Parameter>, RegExp]>([
    ['valor no finito', { value: Number.NaN }, /no finito/],
    ['sin unidad', { unit: ' ' }, /sin unidad/],
    ['documentado sin fuente', { sources: [] }, /sin fuente/],
    ['consenso sin fuente', { evidence: 'consenso', sources: [] }, /sin fuente/],
    ['estimado sin rango', { evidence: 'estimado', range: undefined }, /sin rango/],
    ['extrapolación sin rango', { evidence: 'extrapolacion', range: undefined }, /sin rango/],
    ['clave mal formada', { sources: ['Volpicelli 2012'] }, /mal formada/],
    ['valor fuera de su rango', { value: 9 }, /fuera de su rango/],
    ['rango invertido', { range: [3, 1] }, /rango inválido/],
    ['derivado sin cálculo', { evidence: 'derivado', note: undefined }, /sin el cálculo/],
  ])('%s', (_name, patch, message) => {
    const problems = parameterProblems('p', { ...ok, ...patch });
    expect(problems.join('\n')).toMatch(message);
  });

  it('lo estimado no necesita fuente pero sí rango', () => {
    expect(parameterProblems('p', { value: 0.3, unit: 'fracción', range: [0.2, 0.5], evidence: 'estimado', sources: [] })).toEqual([]);
  });
});

describe('defineParameters', () => {
  it('devuelve el conjunto congelado cuando todo es válido', () => {
    const set = defineParameters('prueba', { a: ok });
    expect(set.name).toBe('prueba');
    expect(set.params.a.value).toBe(2);
    expect(Object.isFrozen(set.params)).toBe(true);
  });

  it('rompe la carga del módulo si un parámetro no tiene evidencia válida', () => {
    expect(() => defineParameters('prueba', { a: { ...ok, sources: [] } })).toThrow(/prueba\.a: evidencia «documentado» sin fuente/);
  });
});

/** Archivos .ts del código (sin pruebas). */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (f.endsWith('.ts') && !f.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('Registro de parámetros del modelo (src/validation/parameterSets.ts)', () => {
  const keys = referenceKeys(read('docs/REFERENCES.md'));
  const approximations = read('docs/APPROXIMATIONS.md');

  it('los nombres de los conjuntos son únicos', () => {
    const names = PARAMETER_SETS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('cada fuente citada por un parámetro existe en docs/REFERENCES.md', () => {
    const missing = PARAMETER_SETS.flatMap((s) =>
      Object.entries(s.params).flatMap(([id, p]) => p.sources.filter((k) => !keys.has(k)).map((k) => `${s.name}.${id} → ${k}`)),
    );
    expect(missing).toEqual([]);
  });

  it('cada parámetro estimado o extrapolado figura en docs/APPROXIMATIONS.md', () => {
    const missing = PARAMETER_SETS.flatMap((s) =>
      Object.entries(s.params)
        .filter(([, p]) => p.evidence === 'estimado' || p.evidence === 'extrapolacion')
        .map(([id]) => `${s.name}.${id}`)
        .filter((qid) => !approximations.includes(`\`${qid}\``)),
    );
    expect(missing).toEqual([]);
  });

  it('ningún defineParameters del código queda fuera del registro', () => {
    const registered = new Set(PARAMETER_SETS.map((s) => s.name));
    const declared = sourceFiles(resolve(ROOT, 'src'))
      .filter((f) => !f.endsWith('evidence.ts'))
      .flatMap((f) => [...read(f).matchAll(/defineParameters\(\s*'([^']+)'/g)].map((m) => m[1]));
    expect(declared.filter((n) => !registered.has(n))).toEqual([]);
  });
});
