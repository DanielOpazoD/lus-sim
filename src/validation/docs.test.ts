import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDecisions, renderIndex } from '../../tools/docs/decisions-index';
import { citedKeys, isLocatable, parseReferences } from './support/references';
import { PARAMETER_SETS } from './parameterSets';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const DOCS = readdirSync(resolve(ROOT, 'docs'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => `docs/${f}`);
/** Documentos de tema de la base de conocimiento (`docs/KNOWLEDGE.md` los enlaza). */
const KNOWLEDGE_DOCS = readdirSync(resolve(ROOT, 'docs/knowledge'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => `docs/knowledge/${f}`);
const ALL_DOCS = ['README.md', 'CLAUDE.md', 'CONTRIBUTING.md', ...DOCS, ...KNOWLEDGE_DOCS];

/**
 * Consistencia de la documentación (práctica de EchoTwin y VExUS): los documentos son de carga; si se
 * desvían del código o de la bibliografía, la suite falla.
 */
describe('Documentación', () => {
  it('parseDecisions/renderIndex: numeración, estado «superada» y niveles ### ignorados (entrada sintética)', () => {
    const md = '# T\n## 1. Elegir Vitest\ntexto\n## 2. Reloj único [Estado: superada por 5]\nx\n### 3. No\n## 10. Otra\n';
    const ds = parseDecisions(md);
    expect(ds).toEqual([
      { n: 1, title: 'Elegir Vitest', status: 'vigente', line: 2 },
      { n: 2, title: 'Reloj único', status: 'superada por 5', line: 4 },
      { n: 10, title: 'Otra', status: 'vigente', line: 7 },
    ]);
    expect(renderIndex(ds)).toContain('| [2](DECISIONS.md#L4) | Reloj único | superada por 5 |');
  });

  it('DECISIONS.md numera 1..N sin huecos y el índice generado está al día', () => {
    const ds = parseDecisions(read('docs/DECISIONS.md'));
    expect(ds.length).toBeGreaterThan(0);
    ds.forEach((d, i) => expect(d.n).toBe(i + 1));
    expect(read('docs/DECISIONS_INDEX.md')).toBe(renderIndex(ds));
  });

  it('los documentos solo nombran archivos del repo que existen', () => {
    const missing: string[] = [];
    for (const doc of ALL_DOCS) {
      for (const m of read(doc).matchAll(/`((?:src|tools|docs|e2e|\.github)\/[A-Za-z0-9_./-]+\.(?:ts|js|md|mjs|yml))`/g)) {
        if (!existsSync(resolve(ROOT, m[1]))) missing.push(`${doc} → ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('ARCHITECTURE.md y README.md citan archivos fuente reales', () => {
    for (const doc of ['docs/ARCHITECTURE.md', 'README.md']) {
      const refs = [...read(doc).matchAll(/`((?:src|tools)\/[A-Za-z0-9_./-]+\.ts)`/g)];
      expect(refs.length, `${doc} no cita archivos fuente`).toBeGreaterThan(2);
    }
  });

  it('README documenta los scripts que un usuario debe conocer y enlaza cada documento de docs/', () => {
    const readme = read('README.md');
    for (const s of ['npm run dev', 'npm test', 'npm run test:all', 'npm run check', 'npm run e2e', 'npm run provenance']) {
      expect(readme.includes(s), `README no menciona ${s}`).toBe(true);
    }
    for (const doc of DOCS.filter((d) => d !== 'docs/DECISIONS_INDEX.md')) {
      expect(readme.includes(doc), `README no enlaza ${doc}`).toBe(true);
    }
  });

  it('KNOWLEDGE.md enlaza cada documento de tema de docs/knowledge/', () => {
    const knowledge = read('docs/KNOWLEDGE.md');
    expect(KNOWLEDGE_DOCS.length).toBeGreaterThan(0);
    for (const doc of KNOWLEDGE_DOCS) expect(knowledge.includes(doc), `KNOWLEDGE.md no enlaza ${doc}`).toBe(true);
  });

  it('los documentos solo citan scripts de npm que existen (práctica de EchoTwin)', () => {
    const { scripts } = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const missing: string[] = [];
    for (const doc of ALL_DOCS)
      for (const m of read(doc).matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) if (!(m[1] in scripts)) missing.push(`${doc} → npm run ${m[1]}`);
    expect(missing).toEqual([]);
  });

  it('README cita la versión actual del paquete en su «Estado»', () => {
    const { version } = JSON.parse(read('package.json')) as { version: string };
    expect(read('README.md')).toContain(`## Estado (v${version}`);
  });

  it('cada limitación declarada en código aparece en docs/LIMITATIONS.md', async () => {
    const { KNOWN_LIMITATIONS } = await import('./limitations');
    const md = read('docs/LIMITATIONS.md');
    for (const id of KNOWN_LIMITATIONS) expect(md.includes(`\`${id}\``), `LIMITATIONS.md no cita \`${id}\``).toBe(true);
  });
});

describe('Bibliografía (docs/REFERENCES.md)', () => {
  const entries = parseReferences(read('docs/REFERENCES.md'));

  it('las claves son únicas y cada entrada es localizable (DOI, PMID o URL)', () => {
    const keys = entries.map((e) => e.key);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
    expect(entries.filter((e) => !isLocatable(e.text)).map((e) => e.key)).toEqual([]);
  });

  it('cada cita [@clave] de los documentos existe en la bibliografía', () => {
    const keys = new Set(entries.map((e) => e.key));
    const missing: string[] = [];
    for (const doc of ALL_DOCS) for (const k of citedKeys(read(doc))) if (!keys.has(k)) missing.push(`${doc} → @${k}`);
    expect(missing).toEqual([]);
  });

  it('ninguna entrada queda huérfana: cada clave se cita en un documento o en un parámetro del código', () => {
    const cited = new Set([
      ...ALL_DOCS.flatMap((doc) => citedKeys(read(doc))),
      ...PARAMETER_SETS.flatMap((s) => Object.values(s.params).flatMap((p) => [...p.sources])),
    ]);
    expect(entries.map((e) => e.key).filter((k) => !cited.has(k))).toEqual([]);
  });

  it('parseReferences lee solo las líneas de entrada (sintética)', () => {
    const md = '# Bibliografía\n\ntexto\n- `autor-tema-2012` — Autor A. Título. Revista. 2012. PMID: 1\n- sin clave — nada\n';
    expect(parseReferences(md)).toEqual([{ key: 'autor-tema-2012', text: 'Autor A. Título. Revista. 2012. PMID: 1', line: 4 }]);
  });

  it('citedKeys y isLocatable (entradas sintéticas)', () => {
    expect(citedKeys('A [@a-1] y [@b-2; @c-3], no [nota] ni [@Mal Formada] ni el ejemplo `[@d-4]`')).toEqual(['a-1', 'b-2', 'c-3']);
    expect(isLocatable('Chest. 2008. doi:10.1378/chest.07-2800')).toBe(true);
    expect(isLocatable('PMID: 18403664')).toBe(true);
    expect(isLocatable('Sin identificador')).toBe(false);
  });
});
