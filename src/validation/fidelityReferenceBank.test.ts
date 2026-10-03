// @tier slow
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runReference, type ReferenceStats } from '../../tools/fidelity/reference';

/**
 * El banco de referencia real (decisiones 5 y 21), una prueba DORADA: `docs/reference-bank/reference-stats.json` es la
 * salida de `npm run fidelity:ref` sobre los 34 clips del manifiesto, enteros (sin `--max-frames`), con la geometría fijada
 * en el manifiesto. Esta prueba vuelve a medirlos y exige ese archivo número a número (salvo la fecha): si cambia una métrica,
 * el detector de estructuras, una compuerta, el manifiesto o un clip, hay que regenerarlo con `npm run fidelity:ref` en el
 * mismo cambio y revisar la diferencia (qué clips y métricas se movieron, y si algún clip apto dispara una compuerta).
 *
 * Solo corre donde están la carpeta del banco (`LUS_REFERENCE_DIR` o ~/datos/lus-referencia, fuera del repo: decisión 5) y
 * ffmpeg; en CI se salta (no hay banco). Tarda de 2–4 min (27-09) a más de 15 (03-10, con el detector de la decisión 36) en un M4,
 * así que no corre en `npm run check` sino con `npm run fidelity:bank` (LUS_REFERENCE_CHECK=1), obligatorio en todo cambio que
 * toque `src/measure/fidelity/`, `tools/fidelity/` o `docs/reference-bank/` (CLAUDE.md).
 */
const ROOT = resolve(__dirname, '../..');
const DIR = process.env.LUS_REFERENCE_DIR ?? join(homedir(), 'datos', 'lus-referencia');
const FFMPEG = existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
const hasFfmpeg = spawnSync(FFMPEG, ['-version']).status === 0;

describe.skipIf(process.env.LUS_REFERENCE_CHECK !== '1' || !existsSync(DIR) || !hasFfmpeg)(
  'banco de referencia real (fuera del repositorio)',
  () => {
    it('las estadísticas del repositorio son las de los clips del banco, enteros', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'lus-ref-bank-'));
      try {
        const r = runReference({
          dir: DIR,
          manifestPath: join(ROOT, 'docs/reference-bank/MANIFEST.json'),
          outPath: join(tmp, 'stats.json'),
          ffmpeg: FFMPEG,
          log: () => {},
        });
        if (r.status !== 'ok') throw new Error('sin estadísticas');
        const repo = JSON.parse(readFileSync(join(ROOT, 'docs/reference-bank/reference-stats.json'), 'utf8')) as ReferenceStats;
        expect(r.stats.skipped).toEqual([]);
        expect(r.stats.clips.every((c) => !c.truncated)).toBe(true);
        const strip = (s: ReferenceStats) => ({ clips: s.clips, strata: s.strata, skipped: s.skipped });
        expect(JSON.parse(JSON.stringify(strip(r.stats)))).toEqual(strip(repo));
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }, 900_000);
  },
);
