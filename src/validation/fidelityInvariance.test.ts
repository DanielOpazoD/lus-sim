// @tier slow
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyzeClip, type ClipAnalysis } from '../measure/fidelity/metrics';
import { detectSector, GREY_8BIT, type GreyFrame, type GreyScale, type SectorGeometry } from '../measure/fidelity/sector';
import { build, caseArb, eightBitArb, invariants, mapInto, mismatches, TOL_8BIT, type Case } from './support/fidelityCases';
import { affineInside, syntheticGeometry, to8bit, type SyntheticLusOptions } from './support/syntheticLus';

/**
 * Invariancia afín del banco de fidelidad (decisión 21; `docs/knowledge/reference-images.md` §3.1, principio 5): el gris
 * mostrado es ≈ a·dB + b con la ganancia y el rango dinámico desconocidos, así que lo que se declara invariante no debe
 * cambiar con g → a·g + b (a > 0) mientras nada se recorte. fast-check recorre sintéticos del patrón normal (profundidad de
 * la pleura, costillas, niveles, razón entre órdenes, semilla; `support/fidelityCases.ts`) y transformaciones, con semilla
 * fija y 200 corridas por propiedad (nivel lento):
 *
 *  1. **Continua**, a ∈ [0,05; 3] y b ∈ [−1; 1], con la geometría dada y una escala que no recorta: igual a 1e-6, también
 *     N1–N3 (aquí el suelo se mide) y la censura.
 *  2. **8 bits**: dos contrastes del mismo cuadro cuantizados (el sector entero entre 60 y 240 grises de ancho, sin
 *     recortar), con la geometría dada: dentro de `TOL_8BIT`.
 *  3. **Tubería del banco**: un abanico que sale del cuadro por un lado (como LUS-01), con el cambio solo dentro del sector (el
 *     marco de la pantalla no es señal): el detector propone la geometría en un contraste, se fija (el manifiesto) y se miden
 *     los dos contrastes con ella, dentro de `TOL_8BIT`; la geometría detectada en cada contraste, a ≤ 8 px y 1,5° de la
 *     verdadera.
 *
 * Que las propiedades muerden se comprobó mutando el código, no con una variante escrita aquí (decisión 21, «Mutaciones»).
 */
/** 200 por omisión; `FIDELITY_RUNS` lo cambia para explorar y `FIDELITY_NO_SHRINK=1` no encoge el contraejemplo (las mutaciones). */
const RUNS = Number(process.env.FIDELITY_RUNS ?? 200);
const FC = { seed: 20260927, numRuns: RUNS, endOnFailure: process.env.FIDELITY_NO_SHRINK === '1' };
/** Una escala que no recorta nada: la invariancia continua no pasa por la censura. */
const WIDE: GreyScale = { lo: -100, hi: 100, quantum: 0 };

/** Los cuadros de 8 bits de un contraste: el sector entero con `width` de ancho, en la posición `f` de su rango libre. */
function shown(o: SyntheticLusOptions, frames: GreyFrame[], lo: number, hi: number, width: number, f: number): GreyFrame[] {
  const [a, b] = mapInto(lo, hi, width, f);
  return frames.map((fr) => to8bit(affineInside(o, fr, a, b)));
}

const measure = (frames: GreyFrame[], geometry: SectorGeometry, scale: GreyScale = GREY_8BIT): ClipAnalysis =>
  analyzeClip(frames, { geometry, scale, frameIntervalS: 1 / 30 });

/** Distancia del ápice (px) y de los bordes (grados) entre dos geometrías convexas. */
function geometryError(g: SectorGeometry, t: SectorGeometry): { apex: number; left: number; right: number } {
  if (g.kind === 'linear' || t.kind === 'linear') return { apex: Number.POSITIVE_INFINITY, left: Number.NaN, right: Number.NaN };
  const deg = 180 / Math.PI;
  return {
    apex: Math.hypot(g.apexX - t.apexX, g.apexY - t.apexY),
    left: Math.abs(g.thetaLeft - t.thetaLeft) * deg,
    right: Math.abs(g.thetaRight - t.thetaRight) * deg,
  };
}

describe('invariancia afín de las métricas del banco (fast-check, 200 corridas por propiedad)', () => {
  it('continua: g → a·g + b dentro del sector, a ∈ [0,05; 3], sin recortar: las métricas invariantes y la censura no cambian', () => {
    fc.assert(
      fc.property(caseArb, fc.double({ min: 0.05, max: 3, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }), (c, a, b) => {
        const { o, frames } = build(c);
        const geometry = syntheticGeometry(o);
        const x0 = measure(frames, geometry, WIDE);
        const y0 = measure(
          frames.map((f) => affineInside(o, f, a, b)),
          geometry,
          WIDE,
        );
        const x = invariants(x0);
        // la prueba tiene dientes: el sintético tiene sus sombras, su pleura y sus líneas A
        expect(x.shadows).toBe(2);
        expect(x['A2.visible']).toBeGreaterThanOrEqual(1);
        expect(Number.isFinite(x['M.wall']) && Number.isFinite(x.N1)).toBe(true);
        expect(
          mismatches(x, invariants(y0), () => 1e-6),
          `a = ${a}, b = ${b}`,
        ).toEqual([]);
        expect(y0.perFrame[0].censored).toEqual(x0.perFrame[0].censored);
      }),
      FC,
    );
  }, 900_000);

  it('8 bits: dos contrastes cuantizados del mismo cuadro, sin recortar, dentro de la tolerancia del escalón', () => {
    fc.assert(
      fc.property(caseArb, eightBitArb, (c: Case, e) => {
        const { o, frames, lo, hi } = build(c);
        const geometry = syntheticGeometry(o);
        const x = invariants(measure(shown(o, frames, lo, hi, e.width1, e.b1), geometry), false);
        const y = invariants(measure(shown(o, frames, lo, hi, e.width2, e.b2), geometry), false);
        expect(x.shadows).toBe(2);
        expect(
          mismatches(x, y, (k) => TOL_8BIT[k] ?? 0),
          JSON.stringify(e),
        ).toEqual([]);
      }),
      FC,
    );
  }, 900_000);

  it('tubería del banco: el detector propone la geometría de un abanico cortado por el cuadro, se fija y se miden los dos contrastes', () => {
    let withShadows = 0;
    fc.assert(
      fc.property(caseArb, eightBitArb, (c: Case, e) => {
        const { o, frames, lo, hi } = build(c, true);
        const truth = syntheticGeometry(o);
        const first = shown(o, frames, lo, hi, e.width1, e.b1);
        const second = shown(o, frames, lo, hi, e.width2, e.b2);
        // la propuesta del detector en cada contraste: el borde que sale del cuadro no entra en su recta
        for (const f of [first, second]) {
          const err = geometryError(detectSector(f, GREY_8BIT).geometry, truth);
          expect(err.apex, JSON.stringify(e)).toBeLessThan(8);
          expect(Math.max(err.left, err.right), JSON.stringify(e)).toBeLessThan(1.5);
        }
        // la del primero, fijada (el manifiesto), mide los dos
        const fixed = detectSector(first, GREY_8BIT).geometry;
        const x = invariants(measure(first, fixed), false);
        const y = invariants(measure(second, fixed), false);
        if (x.shadows >= 1) withShadows++;
        expect(
          mismatches(x, y, (k) => TOL_8BIT[k] ?? 0),
          JSON.stringify(e),
        ).toEqual([]);
      }),
      FC,
    );
    // la prueba tiene dientes: casi siempre hay sombras que medir (en un caso de poco contraste, con la geometría
    // detectada —0,4° y 3 px de la verdadera— el detector de estructuras no separa la sombra de la neblina en ningún
    // contraste: no es invariancia lo que falla, sino la detección, y queda igual en los dos)
    expect(withShadows).toBeGreaterThanOrEqual(0.9 * RUNS);
  }, 900_000);

  it('lo que NO es invariante: la piel detectada en cada contraste (por eso la geometría del banco se fija en el manifiesto)', () => {
    // el soporte temporal compara σ_t con el brillo sobre el fondo: con el sector desplazado hacia el blanco, la pared quieta
    // del sintético (solo su ruido propio, 2 % del rango) deja de «variar» y la piel detectada se hunde (un caso de fast-check)
    const c: Case = {
      dPlMm: 13.25,
      rib1: -0.2,
      rib2: 0.042,
      ribTopFraction: 0.785,
      wall: 0.228,
      haze: 0.1,
      floor: 0.03,
      decay: 0.628,
      seed: 12,
    };
    const { o, frames, lo, hi } = build(c);
    const dark = detectSector(shown(o, frames, lo, hi, 60 / 255, 0), GREY_8BIT).geometry;
    const bright = detectSector(shown(o, frames, lo, hi, 0.66, 1), GREY_8BIT).geometry;
    const skin = syntheticGeometry(o);
    if (dark.kind === 'linear' || bright.kind === 'linear' || skin.kind === 'linear') throw new Error('no es convexa');
    expect(Math.abs(dark.rhoMin - skin.rhoMin)).toBeLessThan(3);
    expect(bright.rhoMin - skin.rhoMin).toBeGreaterThan(10);
  });
});
