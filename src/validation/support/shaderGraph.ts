import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';

/**
 * Evalúa en memoria el grafo de módulos de `entry` (CommonJS con `transpileModule`) con el fuente que da `codeOf` para
 * cada módulo: el original o el que deja el plugin del build (`tools/build/glslMinify.ts`). Así las pruebas del
 * minificado montan los programas tal como los monta la app, sin GPU ni build. Las importaciones relativas se buscan en
 * `sources` (ruta normalizada → contenido); las demás, en `node_modules`.
 */
export function loadShaderGraph(
  entry: string,
  sources: ReadonlyMap<string, string>,
  codeOf: (path: string, code: string) => string,
): Record<string, unknown> {
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const nodeRequire = createRequire(entry);
  const load = (path: string): Record<string, unknown> => {
    const hit = cache.get(path);
    if (hit) return hit.exports;
    const code = sources.get(path);
    if (code === undefined) throw new Error(`sin fuente: ${path}`);
    const js = ts.transpileModule(codeOf(path, code), {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} as Record<string, unknown> };
    cache.set(path, module);
    const require = (spec: string): unknown => {
      if (!spec.startsWith('.')) return nodeRequire(spec);
      const base = join(dirname(path), spec);
      const file = [base, `${base}.ts`, join(base, 'index.ts')].find((f) => sources.has(f));
      if (!file) throw new Error(`${path}: no se resuelve ${spec}`);
      return load(file);
    };
    // lus-sim (decisión 12): un nombre que no es una ruta absoluta. Node pasa las rutas absolutas al inspector como
    // `file://`, y la cobertura v8 de vitest mezclaba este fuente transpilado (otras posiciones) con el módulo real del
    // mismo archivo: sus rangos sin ejecutar tapaban los ejecutados (steering.ts, speckleField.ts… caían al 60 %)
    const run = runInThisContext(`(function (require, module, exports) {${js}\n})`, {
      filename: `shader-graph:${relative(process.cwd(), path)}`,
    }) as (r: typeof require, m: typeof module, e: Record<string, unknown>) => void;
    run(require, module, module.exports);
    return module.exports;
  };
  return load(entry);
}
