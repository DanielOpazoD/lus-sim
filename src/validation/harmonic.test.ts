import { describe, expect, it } from 'vitest';
import { CONVEX_BEAM, lateralFwhmMm } from '../ultrasound/beamModel';
import { HARMONIC, harmonicBeam, harmonicNearGain, harmonicNearUniform, noiseGain, transientGain } from '../ultrasound/harmonic';
import { ELEV_RAYLEIGH_MM, ELEV_SIGMA0_MM, elevSigmaMm } from '../ultrasound/pleura';
import { bmodeBeam, CONVEX_C35_PROFILE } from '../ultrasound/transducerProfile';

/**
 * Armónica tisular (decisión 77): el haz armónico (emisión a f1 ÷√2, recepción a 2·f1), la σ elevacional
 * equivalente, la acumulación del campo cercano, el transitorio rechazado, el ruido que sube y los ecos
 * parásitos que bajan, en TS y en el GLSL, y su cableado en el renderizador real sobre un WebGL falso. La
 * imagen en GPU la mide la e2e (`harmonicContrast`).
 *
 * lus-sim (decisión 11): el haz y el modelo, idénticos; sin lo que comprueba los programas ensamblados, el
 * comando del equipo ni el renderizador sobre WebGL falso (vuelven con la GPU y la app en el paso B2). Que los
 * ecos parásitos bajen con la armónica lo prueba `clutter.test.ts`.
 */
const db = (x: number) => 20 * Math.log10(x);

describe('Armónica tisular (decisión 77): haz y modelo', () => {
  it('el haz fundamental no cambia: λ de emisión = la de recepción, escala 1 y la fórmula de siempre', () => {
    const p = CONVEX_BEAM;
    expect(p.lambdaTxMm).toBe(p.lambdaMm);
    expect(p.txScale).toBe(1);
    for (const F of [40, 90, 160])
      for (const r of [5, 20, 45, 90, 150, 220]) {
        const tx = Math.hypot((p.k * p.lambdaMm * F) / p.apertureTxMm, (p.apertureTxMm * Math.abs(r - F)) / F);
        const rx = (p.k * p.lambdaMm * r) / Math.max(1, Math.min(p.apertureRxMaxMm, r / p.fNumberRxMin));
        expect(lateralFwhmMm(r, F)).toBe(1 / Math.sqrt(1 / (tx * tx) + 1 / (rx * rx)));
      }
  });

  it('haz armónico: emite a f1 = f/2 con la fuente ∝ p1² (÷√2) y recibe a 2·f1; el principal solo cambia en el foco', () => {
    const h = harmonicBeam(CONVEX_BEAM);
    expect(h.lambdaMm).toBe(CONVEX_BEAM.lambdaMm); // recibe a la frecuencia nominal de la sonda (3,5 MHz)
    expect(h.lambdaMm).toBeCloseTo(1540 / (HARMONIC.rxMHz * 1e3), 12);
    expect(h.lambdaTxMm).toBe(2 * h.lambdaMm);
    expect(h.txScale).toBe(Math.SQRT1_2);
    expect({ ...h, lambdaTxMm: 0, txScale: 0 }).toEqual({ ...CONVEX_BEAM, lambdaTxMm: 0, txScale: 0 });
    const ratio = (r: number, F = 90) => lateralFwhmMm(r, F, h) / lateralFwhmMm(r, F);
    // en el foco la emisión a f1 (difracción ×2, ÷√2) ensancha el principal ~15 % (más con el foco somero: +25–36 % a
    // 20–40 mm, donde la difracción pesa más)
    expect(ratio(90)).toBeGreaterThan(1.1);
    expect(ratio(90)).toBeLessThan(1.2);
    expect(ratio(20, 20)).toBeGreaterThan(1.25);
    expect(ratio(20, 20)).toBeLessThan(1.4);
    // fuera del foco manda el desenfoque (÷√2) o la recepción: igual o más estrecho
    for (const r of [20, 45, 150, 200]) expect(ratio(r)).toBeLessThan(1.02);
    // el haz de la imagen B sigue al conmutador; el Doppler no lo lee
    expect(bmodeBeam(CONVEX_C35_PROFILE, { harmonic: false })).toBe(CONVEX_C35_PROFILE.beam);
    expect(bmodeBeam(CONVEX_C35_PROFILE, { harmonic: true })).toEqual(h);
  });

  it('elevación: la de siempre en fundamental; en armónica, √2 × la de dos vías del par f1² · 2f1', () => {
    for (const r of [5, 40, 80, 150, 220]) {
      expect(elevSigmaMm(r, 80)).toBe(ELEV_SIGMA0_MM * Math.sqrt(1 + ((r - 80) / ELEV_RAYLEIGH_MM) ** 2));
      // de dos vías: 1/σ2² = 1/σtx² + 1/σrx², con σtx = (2σ0/√2)·√(1 + ((r−F)/2zR)²)
      const sRx = ELEV_SIGMA0_MM * Math.sqrt(1 + ((r - 80) / ELEV_RAYLEIGH_MM) ** 2);
      const sTx = ((2 * ELEV_SIGMA0_MM) / Math.SQRT2) * Math.sqrt(1 + ((r - 80) / (2 * ELEV_RAYLEIGH_MM)) ** 2);
      const twoWay = 1 / Math.sqrt(1 / sTx ** 2 + 1 / sRx ** 2);
      expect(elevSigmaMm(r, 80, true)).toBeCloseTo(Math.SQRT2 * twoWay, 12);
    }
    // más gruesa en el foco (+15 %) y más fina lejos de él
    expect(elevSigmaMm(80, 80, true) / elevSigmaMm(80, 80)).toBeCloseTo(1.155, 2);
    expect(elevSigmaMm(180, 80, true)).toBeLessThan(elevSigmaMm(180, 80));
  });

  it('acumulación: 1 en fundamental y desde la referencia; en el campo cercano crece de 0 a 1 sin saltos', () => {
    for (const r of [0, 1, 5, 9.9, 10, 50]) expect(harmonicNearGain(r, false)).toBe(1);
    expect(harmonicNearGain(0, true)).toBe(0);
    expect(harmonicNearGain(HARMONIC.buildUpRefMm, true)).toBe(1);
    expect(harmonicNearGain(HARMONIC.buildUpRefMm - 1e-9, true)).toBeCloseTo(1, 6);
    let prev = -1;
    for (let r = 0; r <= 12; r += 0.25) {
      const g = harmonicNearGain(r, true);
      expect(g).toBeGreaterThanOrEqual(prev);
      expect(g).toBeLessThanOrEqual(1);
      prev = g;
    }
    // solo la piel: ~−7 dB a 1 mm, ~−3 dB a 2 mm y nada desde 4 mm (las líneas de la pared quedan como en fundamental)
    expect(db(harmonicNearGain(1, true))).toBeLessThan(-5);
    expect(db(harmonicNearGain(1, true))).toBeGreaterThan(-9);
    expect(db(harmonicNearGain(2, true))).toBeGreaterThan(-4);
    expect(harmonicNearGain(HARMONIC.buildUpRefMm, true)).toBe(1);
    expect(harmonicNearUniform(false)).toEqual([0, 0]);
    expect(harmonicNearUniform(true)).toEqual([HARMONIC.buildUpMm, HARMONIC.buildUpRefMm]);
  });

  it('el transitorio pierde 20 dB y el ruido sube 3 dB respecto al eco; en fundamental, nada', () => {
    expect(transientGain(false)).toBe(1);
    expect(noiseGain(false)).toBe(1);
    expect(db(transientGain(true))).toBeCloseTo(HARMONIC.fundamentalRejectionDb, 9);
    expect(db(noiseGain(true))).toBeCloseTo(HARMONIC.noiseDb, 9);
  });
});
