import { createRequire } from 'node:module';
import type * as TS from 'typescript';
import type { Plugin } from 'vite';

/**
 * Las notas de evidencia fuera del bundle (lus-sim, decisión 29). Cada número del modelo lleva en `defineParameters` su nota
 * (la cita, el cálculo, el supuesto): ≈ 36 kB del bundle que la aplicación no lee (ni el informe técnico ni la interfaz las
 * muestran; las leen las pruebas, la documentación y quien lee el código). En el build, el valor de cada `note` de un
 * `defineParameters` pasa a `'·'`: la validación de `core/evidence.ts` (un valor derivado lleva nota) se sigue cumpliendo al
 * cargar y el resto del objeto no cambia. Solo se tocan las notas que son literales de cadena o sumas de ellos; los saltos de
 * línea se conservan (el mapa de fuentes sigue siendo línea a línea). En desarrollo y en las pruebas, las notas enteras.
 */
let ts: typeof TS | null = null;
const typescript = (): typeof TS => (ts ??= createRequire(import.meta.url)('typescript') as typeof TS);

/** El texto que queda de una nota: la marca y, de cada literal que se quita, solo sus saltos de línea. */
export const STRIPPED_NOTE = '·';

/** Los literales de cadena de una suma de literales, o null si la expresión tiene algo más. */
function literalParts(t: typeof TS, e: TS.Expression): TS.StringLiteralLike[] | null {
  if (t.isStringLiteralLike(e)) return [e];
  if (t.isParenthesizedExpression(e)) return literalParts(t, e.expression);
  if (t.isBinaryExpression(e) && e.operatorToken.kind === t.SyntaxKind.PlusToken) {
    const a = literalParts(t, e.left);
    const b = literalParts(t, e.right);
    return a && b ? [...a, ...b] : null;
  }
  return null;
}

/** El código con las notas de los `defineParameters` vaciadas (ver el módulo); el mismo número de líneas. */
export function stripEvidenceNotes(code: string, fileName = 'module.ts'): string {
  const t = typescript();
  const sf = t.createSourceFile(fileName, code, t.ScriptTarget.Latest, true, t.ScriptKind.TS);
  const edits: Array<[number, number, string]> = [];
  const visit = (node: TS.Node): void => {
    if (t.isCallExpression(node) && t.isIdentifier(node.expression) && node.expression.text === 'defineParameters') {
      const params = node.arguments[1];
      if (params && t.isObjectLiteralExpression(params))
        for (const p of params.properties) {
          if (!t.isPropertyAssignment(p) || !t.isObjectLiteralExpression(p.initializer)) continue;
          for (const q of p.initializer.properties) {
            if (!t.isPropertyAssignment(q) || !t.isIdentifier(q.name) || q.name.text !== 'note') continue;
            const parts = literalParts(t, q.initializer);
            if (!parts) continue;
            parts.forEach((lit, i) => {
              const start = lit.getStart(sf);
              const text = code.slice(start, lit.end);
              const breaks = (text.match(/\n/g) ?? []).length;
              edits.push([start, lit.end, `'${i === 0 ? STRIPPED_NOTE : ''}'` + '\n'.repeat(breaks)]);
            });
          }
        }
    }
    t.forEachChild(node, visit);
  };
  visit(sf);
  let out = code;
  for (const [a, b, s] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + s + out.slice(b);
  return out;
}

/** Mapa de fuentes línea a línea (cada línea del código transformado viene de la misma línea del fuente). */
function lineMap(code: string, id: string): { version: number; sources: string[]; names: string[]; mappings: string } {
  const lines = code.split('\n').length;
  return { version: 3, sources: [id], names: [], mappings: ['AAAA', ...Array.from({ length: lines - 1 }, () => 'AACA')].join(';') };
}

/** Plugin de Vite: solo en el build y solo en los módulos de `src/` que declaran parámetros. */
export function evidenceNotes(): Plugin {
  return {
    name: 'evidence-notes',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0];
      if (!code.includes('defineParameters') || id.startsWith('\0') || !/[\\/]src[\\/].*\.ts$/.test(file)) return null;
      if (/\.test\.ts$/.test(file)) return null;
      const out = stripEvidenceNotes(code, file);
      return out === code ? null : { code: out, map: lineMap(out, id) };
    },
  };
}
