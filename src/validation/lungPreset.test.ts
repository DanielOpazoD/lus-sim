import { describe, expect, it } from 'vitest';
import { AnatomyScene } from '../anatomy/scene';
import { Tissue, attenuationDbPerCm } from '../anatomy/tissues';
import { defaultPatient } from '../physiology/patientState';
import { defaultPose } from '../probe/probe';
import { DEFAULT_BMODE, nominalTgcDbPerCm } from '../ultrasound/renderer';
import { LUNG_PRESET, TGC_REFERENCE } from '../ultrasound/lungPreset';
import { CONVEX_C35_PROFILE } from '../ultrasound/transducerProfile';
import { A_LINE_BACKGROUND_MM } from '../app/testHooks';
import { chestView, scanLine } from './support/chestView';

/**
 * Preajuste pulmonar (decisión 12): el del consenso de 2026 [@volpicelli-actualizacion-2026] (D1_1.2, comentario 2)
 * en el equipo por omisión, y la compensación nominal del tejido de referencia torácico. El foco es un número
 * derivado de la escena: esta prueba lo vuelve a medir y falla si la anatomía cambia (paso C) sin recalcularlo.
 */
describe('Preajuste pulmonar del equipo', () => {
  it('un solo foco en la línea pleural del punto de partida por omisión (±1 mm)', () => {
    const v = chestView(new AnatomyScene(defaultPatient()), defaultPose());
    const central = scanLine(v, 0);
    expect(central.pleuraMm).not.toBeNull();
    expect(DEFAULT_BMODE.focusMm).toBe(LUNG_PRESET.params.focusMm.value);
    expect(Math.abs(DEFAULT_BMODE.focusMm - central.pleuraMm!), `pleura a ${central.pleuraMm!.toFixed(2)} mm`).toBeLessThanOrEqual(1);
  });

  it('armónica, composición y persistencia apagadas; la profundidad del consenso deja ver las líneas A 2–4; la TGC del usuario neutra', () => {
    expect(DEFAULT_BMODE.harmonic).toBe(false);
    expect(DEFAULT_BMODE.compound).toBe(false);
    expect(DEFAULT_BMODE.persistence).toBe(LUNG_PRESET.params.persistence.value);
    const [lo, hi] = LUNG_PRESET.params.depthMm.range!;
    expect(DEFAULT_BMODE.depthMm).toBeGreaterThanOrEqual(lo);
    expect(DEFAULT_BMODE.depthMm).toBeLessThanOrEqual(hi);
    // la razón de tomar el extremo alto: con la pleura del punto de partida por omisión, la línea A de orden 4 (4·D)
    // cabe con el fondo sobre el que se mide (A_LINE_BACKGROUND_MM + 1 mm, la regla del gancho de las líneas A)
    const D = scanLine(chestView(new AnatomyScene(defaultPatient()), defaultPose()), 0).pleuraMm!;
    expect(4 * D + A_LINE_BACKGROUND_MM + 1, `pleura a ${D.toFixed(2)} mm`).toBeLessThanOrEqual(DEFAULT_BMODE.depthMm);
    expect(DEFAULT_BMODE.tgcDb.every((db) => db === 0)).toBe(true);
    expect(LUNG_PRESET.params.depthMm.sources).toContain('volpicelli-actualizacion-2026');
  });

  it('la compensación nominal crece con la profundidad con la pendiente de referencia del tórax, no la del hígado', () => {
    const f = CONVEX_C35_PROFILE.bEffectiveMHz;
    const alpha = TGC_REFERENCE.params.alphaDbPerCmMHz.value;
    // ida y vuelta: 2·α·f dB/cm (2,5 dB/cm a 2,5 MHz)
    expect(nominalTgcDbPerCm(f)).toBeCloseTo(2 * alpha * f, 12);
    expect(nominalTgcDbPerCm(2 * f)).toBeCloseTo(2 * nominalTgcDbPerCm(f), 12);
    // VExUS compensaba la del hígado (3,0 dB/cm a 2,5 MHz): el tórax no tiene hígado bajo la sonda
    expect(nominalTgcDbPerCm(f)).toBeLessThan(2 * attenuationDbPerCm(Tissue.Liver, f));
    // entre la grasa y el músculo de la pared (IT'IS), los tejidos blandos que atraviesa el haz antes de la pleura
    expect(alpha * f).toBeGreaterThan(attenuationDbPerCm(Tissue.Fat, f));
    expect(alpha * f).toBeLessThan(attenuationDbPerCm(Tissue.Muscle, f));
  });
});
