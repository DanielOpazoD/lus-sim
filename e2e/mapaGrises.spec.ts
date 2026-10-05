import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { FidelityBenchReport } from '../src/app/fidelityBench';
import {
  ASYMMETRY_BAND,
  fitGreyMap,
  fitGreyMapAcrossGains,
  RAYLEIGH_P90_P50_DB,
  RAYLEIGH_QUANTILE_ASYMMETRY,
  type SpeckleTile,
} from '../src/measure/fidelity/speckleMap';

/**
 * Autoprueba del estimador del mapa de grises desde el moteado (decisión 31) sobre el simulador, cuyo mapa se conoce
 * (curva c = 3,5, rango dinámico 70 dB: `greyMap.ts`). Tolerancias declaradas el 02-10-2026 ANTES de mirar los clips:
 *
 *  1. La familia de mapas se lee de la imagen mostrada: con un barrido de ganancia conocido, por ubicación, c = 3,5 ± 0,5 y
 *     RD = 70 dB ± 5 %. No supone nada de la forma del moteado (solo que no cambia con el nivel): prueba el modelo exacto
 *     g + G/c ∝ A^q y que la conversión de barrido no lo deforma.
 *  2. El estimador de UNA imagen supone moteado de Rayleigh. La región de la pared del simulador (0,2–0,85 de la pleura, con
 *     su grasa, sus caras, sus planos intermusculares y sus estrías) no lo es: en la envolvente, en parches de 16 muestras ×
 *     8 líneas, p90 − p50 es 8,0–9,2 dB (Rayleigh: 5,21, menos en parches con grano) y su asimetría por cuantiles en dB
 *     0,94–0,96 (BLUE superior) y 1,28–1,30 (PLAPS) frente a 1,57 (GPU y SwiftShader, sobre main a04ba7c). El músculo sin
 *     estructura (`speckleMask`) casi no tiene parches en estas vistas (3 y 0): su moteado lo vigila `imagen.spec.ts` en la
 *     zona paraesternal (SNR de Rayleigh). El mapa de la región no puede darse por fiable, y la asimetría en dB lo delata
 *     (1,09–1,12; banda 1,48–1,68, estrechada tras la revisión adversarial), igual que su grano lateral, 3 px,
 *     grueso para teselas de 16 px.
 *
 * La pared del simulador está en grises 20–40 con el preajuste: para que el moteado cubra el mapa, cada vista se adquiere a
 * seis ganancias (el mapa no cambia con la ganancia). Teselas de 16 px en la pared (0,2–0,85 de la pleura).
 */
const GAINS_DB = [-20, -12, -4, 4, 12, 20] as const;
const TILE = 16;

type StartPoint = 'blueUpper' | 'plaps';

/**
 * Una prueba por vista (02-10-2026): las dos juntas tardaban 4,9–5,0 min en el CI frente a su plazo de 5, y en un corredor
 * lento el primer intento agotaba el plazo y el reintento se comía el del fragmento (PR #45). Las aserciones son las mismas.
 */
for (const startPoint of ['blueUpper', 'plaps'] as const)
  test(`el mapa de grises se lee del moteado del simulador, y el diagnóstico delata que su pared no es moteado de Rayleigh (${startPoint})`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    await page.goto('/?e2e=1&corazon=0');
    await expect.poll(() => page.evaluate(() => typeof window.__lusTest), { timeout: 120_000 }).toBe('object');
    type Run = Pick<FidelityBenchReport, 'display' | 'wallSpeckle'> & { startPoint: StartPoint; wallTiles: SpeckleTile[] };
    const runs: Run[] = [];
    for (const gainDb of GAINS_DB)
      runs.push(
        await page.evaluate(
          ({ sp, g, tile }) => {
            const r = window.__lusTest!.fidelity({
              startPoint: sp,
              respiration: 'apnea-expiratory',
              frames: 3,
              gainDb: g,
              speckleTile: tile,
            });
            const geo = r.geometry.true;
            const dPl = r.metrics['dPl.px'].median;
            if (geo.kind === 'linear') throw new Error('mapa de grises: el simulador es convexo');
            // la pared: el centro de la tesela entre 0,2 y 0,85 de la pleura
            const wallTiles = (r.speckleTiles ?? []).filter((t) => {
              const depth = Math.hypot(t.x + tile / 2 - geo.apexX, t.y + tile / 2 - geo.apexY) - geo.rhoMin;
              return depth > 0.2 * dPl && depth < 0.85 * dPl;
            });
            return { startPoint: sp, display: r.display, wallSpeckle: r.wallSpeckle, wallTiles };
          },
          { sp: startPoint, g: gainDb, tile: TILE },
        ),
      );
    expect(runs.every((r) => r.display.dynamicRangeDb === 70 && r.display.greyCurve === 3.5)).toBe(true);
    // 1. por ubicación, a través de las ganancias
    const sweep = fitGreyMapAcrossGains(runs.map((r) => ({ gainDb: r.display.gainDb, tiles: r.wallTiles })));
    // 2. el estimador de una imagen, con todas las teselas de la pared juntas
    const { dbBetween, ...single } = fitGreyMap(runs.flatMap((r) => r.wallTiles));
    void dbBetween;
    const envelope = { startPoint, ...runs.find((r) => r.display.gainDb === GAINS_DB[0])!.wallSpeckle };
    const file = testInfo.outputPath(`mapa-grises-${startPoint}.json`);
    writeFileSync(file, JSON.stringify({ sweep, single, envelope, rayleighP90P50Db: RAYLEIGH_P90_P50_DB }, null, 1));
    await testInfo.attach(`mapa-grises-${startPoint}.json`, { path: file, contentType: 'application/json' });
    console.log(`MAPA_GRISES ${JSON.stringify({ sweep, single, envelope })}`);
    expect(sweep.locations, JSON.stringify(sweep)).toBeGreaterThanOrEqual(30);
    expect(Math.abs(sweep.c - 3.5), JSON.stringify(sweep)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(sweep.rangeDb / 70 - 1), JSON.stringify(sweep)).toBeLessThanOrEqual(0.05);
    // la región de la pared en la envolvente no tiene la forma de Rayleigh (la verdad del simulador)…
    expect(envelope.region.patches, JSON.stringify(envelope)).toBeGreaterThanOrEqual(10);
    // en parches finitos y con grano, p90 − p50 del moteado de Rayleigh sale ≤ 5,21 dB: más ancho, no es de Rayleigh
    expect(envelope.region.p90p50Db, JSON.stringify(envelope)).toBeGreaterThan(RAYLEIGH_P90_P50_DB + 1);
    // …y el estimador de una imagen no da su mapa por fiable (su rango dinámico, 44–51 dB, estaría mal: es 70): lo delata
    // la asimetría en dB
    expect(single.reliable, JSON.stringify(single)).toBe(false);
    expect(single.asymmetry, JSON.stringify(single)).toBeLessThan(ASYMMETRY_BAND[0]);
    // en el BLUE superior la región es casi simétrica en dB (0,94–0,96 frente a 1,57); en el PLAPS, 1,28–1,30
    if (startPoint === 'blueUpper')
      expect(envelope.region.asymmetry, JSON.stringify(envelope)).toBeLessThan(RAYLEIGH_QUANTILE_ASYMMETRY - 0.3);
    expect(errors).toEqual([]);
  });
