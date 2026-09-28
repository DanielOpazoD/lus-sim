import { describe, expect, it } from 'vitest';
import { fidelityBench, type FidelityBenchOptions } from '../app/fidelityBench';
import { defaultEquipment, type Simulator } from '../app/simulator';

const options: FidelityBenchOptions = { startPoint: 'blueUpper', respiration: 'apnea-expiratory', dynamicRangeDb: 50 };

describe('Instrumentación del rango dinámico, sin mutar el equipo del alumno', () => {
  it('aplica la copia durante la medida y restaura la identidad original si la adquisición falla', () => {
    const equipment = defaultEquipment();
    const initialRange = equipment.bmode.dynamicRangeDb;
    const sim = { equipment, frozen: false } as Simulator;
    const failure = new Error('fallo de adquisición');
    expect(() =>
      fidelityBench(sim, options, {
        goTo: () => {
          expect(sim.equipment).not.toBe(equipment);
          expect(sim.equipment.bmode.dynamicRangeDb).toBe(50);
          expect(equipment.bmode.dynamicRangeDb).toBe(initialRange);
          expect(sim.equipment.bmode.tgcDb).toBe(equipment.bmode.tgcDb);
          throw failure;
        },
        ribShadow: () => {
          throw new Error('no debe medir después del fallo');
        },
      }),
    ).toThrow(failure);
    expect(sim.equipment).toBe(equipment);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 39, 81])('rechaza %s dB sin adquirir ni cambiar el estado', (dynamicRangeDb) => {
    const equipment = defaultEquipment();
    const sim = { equipment, frozen: false } as Simulator;
    let acquired = false;
    expect(() =>
      fidelityBench(
        sim,
        { ...options, dynamicRangeDb },
        {
          goTo: () => {
            acquired = true;
          },
          ribShadow: () => {
            throw new Error('no debe adquirir');
          },
        },
      ),
    ).toThrow(/rango dinámico/);
    expect(acquired).toBe(false);
    expect(sim.equipment).toBe(equipment);
  });

  it('rechaza medir una imagen congelada como si fuera una adquisición nueva', () => {
    const sim = { equipment: defaultEquipment(), frozen: true } as Simulator;
    expect(() =>
      fidelityBench(sim, options, {
        goTo: () => {
          throw new Error('no debe adquirir');
        },
        ribShadow: () => {
          throw new Error('no debe adquirir');
        },
      }),
    ).toThrow(/congelada/);
  });
});
