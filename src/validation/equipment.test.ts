import { describe, expect, it } from 'vitest';
import { EQUIPMENT_LIMITS, EquipmentController, normalizeEquipment, reduceEquipment, type EquipmentContext } from '../app/equipment';
import { defaultEquipment } from '../app/simulator';
import { C_RECONSTRUCTION_MM_S } from '../core/units';
import { CONVEX_C35 } from '../probe/probe';
import { DEFAULT_BMODE } from '../ultrasound/renderer';
import { LUNG_PRESET } from '../ultrasound/lungPreset';

/**
 * Modelo de dominio del ecógrafo (Fase 1): comandos + invariantes físicas.
 *
 * lus-sim (decisión 12): solo el modo B; sin el color, el PW, el tríplex ni el modo M de VExUS (sus pruebas de la
 * puerta, la caja, la PRF y los modos no aplican). El equipo arranca en el preajuste pulmonar (`lungPreset.ts`).
 */
const ctx: EquipmentContext = { halfSectorRad: CONVEX_C35.halfSector, cMmS: C_RECONSTRUCTION_MM_S };
const base = () => normalizeEquipment(defaultEquipment(), ctx);

describe('Estado del equipo', () => {
  it('arranca en el preajuste pulmonar: un foco en la pleura, sin armónica ni composición ni persistencia, 12 cm', () => {
    const e = base();
    expect(e).toEqual(defaultEquipment());
    expect(e.bmode).toEqual(DEFAULT_BMODE);
    expect(e.bmode.depthMm).toBe(LUNG_PRESET.params.depthMm.value);
    expect(e.bmode.focusMm).toBe(LUNG_PRESET.params.focusMm.value);
    expect(e.bmode.persistence).toBe(0);
    expect(e.bmode.harmonic).toBe(false);
    expect(e.bmode.compound).toBe(false);
    // la TGC del usuario en su posición neutra: la ganancia creciente la da la compensación nominal
    expect(e.bmode.tgcDb).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    // cada equipo nuevo es una copia: la TGC no es la del preajuste (que no debe cambiar con él)
    expect(defaultEquipment().bmode.tgcDb).not.toBe(DEFAULT_BMODE.tgcDb);
    expect(defaultEquipment().bmode).not.toBe(DEFAULT_BMODE);
  });

  it('reducir la profundidad arrastra el foco dentro de la imagen', () => {
    let e = base();
    e = reduceEquipment(e, { type: 'bmode', patch: { focusMm: 170, depthMm: 240 } }, ctx);
    expect(e.bmode.focusMm).toBe(170);
    e = reduceEquipment(e, { type: 'bmode', patch: { depthMm: 80 } }, ctx);
    expect(e.bmode.depthMm).toBe(80);
    expect(e.bmode.focusMm).toBeLessThanOrEqual(80);
  });

  it('pasos de profundidad y ganancia se acotan; TGC por banda; rango dinámico y persistencia acotados; normalizar es idempotente', () => {
    let e = base();
    for (let i = 0; i < 40; i++) e = reduceEquipment(e, { type: 'stepDepth', deltaMm: 10 }, ctx);
    expect(e.bmode.depthMm).toBe(EQUIPMENT_LIMITS.depthMm.max);
    for (let i = 0; i < 40; i++) e = reduceEquipment(e, { type: 'stepDepth', deltaMm: -10 }, ctx);
    expect(e.bmode.depthMm).toBe(EQUIPMENT_LIMITS.depthMm.min);
    for (let i = 0; i < 40; i++) e = reduceEquipment(e, { type: 'stepGain', deltaDb: -2 }, ctx);
    expect(e.bmode.gainDb).toBe(EQUIPMENT_LIMITS.gainDb.min);
    e = reduceEquipment(e, { type: 'tgc', band: 3, db: 99 }, ctx);
    expect(e.bmode.tgcDb[3]).toBe(EQUIPMENT_LIMITS.tgcDb.max);
    // una banda que no existe no cambia nada
    expect(reduceEquipment(e, { type: 'tgc', band: 8, db: -5 }, ctx).bmode.tgcDb).toEqual(e.bmode.tgcDb);
    e = reduceEquipment(e, { type: 'bmode', patch: { dynamicRangeDb: 10, persistence: 2, focusMm: 1 } }, ctx);
    expect(e.bmode.dynamicRangeDb).toBe(EQUIPMENT_LIMITS.dynamicRangeDb.min);
    expect(e.bmode.persistence).toBe(EQUIPMENT_LIMITS.persistence.max);
    expect(e.bmode.focusMm).toBe(EQUIPMENT_LIMITS.focusMm.min);
    expect(normalizeEquipment(e, ctx)).toEqual(e);
  });

  it('el controlador avisa en cada comando y nunca expone un estado sin normalizar', () => {
    const c = new EquipmentController({ ...defaultEquipment(), bmode: { ...defaultEquipment().bmode, depthMm: 999 } }, ctx);
    expect(c.state.bmode.depthMm).toBe(EQUIPMENT_LIMITS.depthMm.max);
    const seen: number[] = [];
    const off = c.subscribe((next, prev) => seen.push(next.bmode.depthMm - prev.bmode.depthMm));
    c.dispatch({ type: 'stepDepth', deltaMm: -20 });
    expect(seen).toEqual([-20]);
    off();
    c.dispatch({ type: 'stepDepth', deltaMm: -20 });
    expect(seen).toEqual([-20]);
  });

  it('composición espacial (decisión 58) y armónica (decisión 77): los conmutadores, apagados en el preajuste pulmonar', () => {
    let e = base();
    expect(e.bmode.compound).toBe(false);
    e = reduceEquipment(e, { type: 'compound', enabled: true }, ctx);
    expect(e.bmode.compound).toBe(true);
    e = reduceEquipment(e, { type: 'harmonic', enabled: true }, ctx);
    expect(e.bmode.harmonic).toBe(true);
    // otros comandos los conservan
    e = reduceEquipment(e, { type: 'stepDepth', deltaMm: 10 }, ctx);
    expect([e.bmode.compound, e.bmode.harmonic]).toEqual([true, true]);
    e = reduceEquipment(e, { type: 'compound', enabled: false }, ctx);
    e = reduceEquipment(e, { type: 'harmonic', enabled: false }, ctx);
    expect([e.bmode.compound, e.bmode.harmonic]).toEqual([false, false]);
    expect(normalizeEquipment(e, ctx)).toEqual(e);
  });
});
