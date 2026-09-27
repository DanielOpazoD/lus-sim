import { describe, expect, it } from 'vitest';
import { AnatomyScene } from '../anatomy/scene';
import { Tissue, attenuationDbPerCm } from '../anatomy/tissues';
import { defaultPatient } from '../physiology/patientState';
import { defaultPose } from '../probe/probe';
import { DEFAULT_BMODE, DISPLAY_REF_DB, displayLevelDb, nominalTgcDbPerCm } from '../ultrasound/renderer';
import { FRAG_SCANCONVERT } from '../ultrasound/shaders/passes.glsl';
import { LUNG_PRESET, TGC_REFERENCE } from '../ultrasound/lungPreset';
import { CONVEX_C35_PROFILE } from '../ultrasound/transducerProfile';
import { A_LINE_BACKGROUND_MM } from '../app/testHooks';
import { EQUIPMENT_LIMITS } from '../app/equipment';
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

  it('la ganancia del preajuste es la que no satura la línea pleural (lus-sim, decisión 20), con margen del equipo hacia abajo', () => {
    // el valor es una medida de la GPU (la e2e de la sombra costal exige la línea pleural intercostal bajo el blanco y cerca
    // de él en los tres puntos de partida); aquí, que el equipo arranca con ella y que el alumno puede bajar y subir
    expect(DEFAULT_BMODE.gainDb).toBe(LUNG_PRESET.params.gainDb.value);
    expect(LUNG_PRESET.params.gainDb.sources).toContain('demi-guias-2023');
    expect(DEFAULT_BMODE.gainDb - EQUIPMENT_LIMITS.gainDb.min).toBeGreaterThanOrEqual(15);
    expect(EQUIPMENT_LIMITS.gainDb.max - DEFAULT_BMODE.gainDb).toBeGreaterThanOrEqual(20);
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

  it('el nivel en la pantalla (`displayLevelDb`) es el de la pasada de escaneo antes de la curva de grises', () => {
    // gemelo de `displayGrey` (lus-sim, ciclo 1: la e2e de la sombra costal juzga con él lo que se ve)
    for (const line of [
      'float comp = min(uTgcCapDb, tgcAt(r) + uNominalTgcDbPerCm * (r / 10.0));',
      'float db = 20.0 * (log(max(env, 1e-7)) / 2.302585093) + uGainDb + comp + uRefDb;',
      'float x = clamp(r / uDepth, 0.0, 0.9999) * 7.0;',
      'return mix(uTgc[i], uTgc[i + 1], f);',
    ])
      expect(FRAG_SCANCONVERT, line).toContain(line);
    const f = CONVEX_C35_PROFILE.bEffectiveMHz;
    // con la TGC neutra: la envolvente + la compensación nominal a r + la ganancia + la referencia
    expect(displayLevelDb(40, 27, DEFAULT_BMODE, f)).toBeCloseTo(
      40 + nominalTgcDbPerCm(f) * 2.7 + DEFAULT_BMODE.gainDb + DISPLAY_REF_DB,
      9,
    );
    // la TGC del usuario se interpola entre sus 8 bandas (a mitad de la banda 3 y 4 de 12 cm: r = 3,5/7 · 120)
    const tgc = { ...DEFAULT_BMODE, tgcDb: [0, 0, 0, 4, 8, 0, 0, 0] };
    expect(displayLevelDb(40, 60, tgc, f) - displayLevelDb(40, 60, DEFAULT_BMODE, f)).toBeCloseTo(6, 9);
    // el techo de la compensación (50 dB)
    expect(displayLevelDb(0, 119, { ...DEFAULT_BMODE, tgcDb: [60, 60, 60, 60, 60, 60, 60, 60] }, f)).toBeCloseTo(
      50 + DEFAULT_BMODE.gainDb + DISPLAY_REF_DB,
      9,
    );
  });
});
