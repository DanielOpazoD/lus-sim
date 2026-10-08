import { describe, expect, it } from 'vitest';
import { AnatomyScene } from '../anatomy/scene';
import { SUBPLEURAL_TRAPS } from '../anatomy/organs/subpleural';
import { HeartFailureModel, nearestSite, sitePose } from '../app/heartFailure';
import type { Simulator } from '../app/simulator';
import { protocolById, protocolSites } from '../lus/protocols';
import { HEMODYNAMICS } from '../physiology/hemodynamics';
import { SUBPLEURAL_GRID, SUBPLEURAL_NODES, subpleuralNode } from '../physiology/lungAeration';
import { defaultPatient } from '../physiology/patientState';
import { clampPose, defaultPose, type ProbePose } from '../probe/probe';

/**
 * El mando hemodinámico en la aplicación (decisión 52, `app/heartFailure.ts`) sobre la escena del tórax, sin GPU: lleva el agua a
 * la aireación del paciente y a la tabla de la escena, con la gravedad de su posición y su cinética; y las poses ideales de los
 * sitios de los protocolos.
 */
function fakeSim(position: 'supine' | 'sitting' = 'supine'): Simulator {
  const patient = defaultPatient();
  patient.position = position;
  const scene = new AnatomyScene(patient);
  const sim = {
    patient,
    scene,
    pose: defaultPose(),
    setPose(p: ProbePose) {
      sim.pose = clampPose(p, position);
    },
  };
  return sim as unknown as Simulator;
}

/** Fracción de gas media de los nodos de pulmón que cumplen `pick`. */
function meanGas(sim: Simulator, pick: (u: number, z: number) => boolean): number {
  const gas = sim.patient.lung!.gas;
  let s = 0;
  let n = 0;
  for (let i = 0; i < SUBPLEURAL_NODES; i++) {
    const { u, z } = subpleuralNode(i);
    if (pick(u, z)) {
      s += gas[i];
      n++;
    }
  }
  return s / n;
}

describe('El mando hemodinámico lleva el agua a la aireación del paciente (decisión 52)', () => {
  it('bajo la bisagra el pulmón queda normal; por encima, pierde aire, y la escena sube su tabla', () => {
    const sim = fakeSim();
    const m = new HeartFailureModel(() => sim);
    const v0 = sim.scene.subpleural.version;
    m.setInput({ control: { kind: 'pcwp', mmHg: 10 }, phenotype: 'hfpef', rapMmHg: 6 }, true);
    expect(sim.scene.subpleural.version).toBe(v0 + 1);
    // sin trampas abiertas en ninguna región (las declives, con la gravedad, se acercan al pivote)
    expect(Math.min(...sim.patient.lung!.gas)).toBeGreaterThan(SUBPLEURAL_TRAPS.params.septalOnsetGas.value);
    m.setInput({ control: { kind: 'pcwp', mmHg: 28 }, phenotype: 'hfpef', rapMmHg: 6 }, true);
    expect(Math.min(...sim.patient.lung!.gas)).toBeLessThan(0.6);
    expect(m.evlwi().now).toBeGreaterThan(HEMODYNAMICS.params.evlwiNormal.value + 3);
    m.reset();
    expect(sim.patient.lung).toBeUndefined();
  });

  it('en supino el agua se va atrás; sentado, a las bases (la gravedad, capa 3)', () => {
    const half = (SUBPLEURAL_GRID.NU - 1) * SUBPLEURAL_GRID.DU * 0.5;
    const supine = fakeSim('supine');
    new HeartFailureModel(() => supine).setInput({ control: { kind: 'pcwp', mmHg: 23 }, phenotype: 'hfpef', rapMmHg: 6 }, true);
    const anterior = meanGas(supine, (u, z) => Math.abs(u) < 100 && z > -40 && z < 160);
    const posterior = meanGas(supine, (u, z) => Math.abs(u) > half * 0.7 && z > -40 && z < 160);
    expect(posterior).toBeLessThan(anterior - 0.02);
    const sitting = fakeSim('sitting');
    new HeartFailureModel(() => sitting).setInput({ control: { kind: 'pcwp', mmHg: 23 }, phenotype: 'hfpef', rapMmHg: 6 }, true);
    const apex = meanGas(sitting, (u, z) => Math.abs(u) < 300 && z > 120);
    const base = meanGas(sitting, (u, z) => Math.abs(u) < 300 && z < 0 && z > -80);
    expect(base).toBeLessThan(apex - 0.02);
  });

  it('la cinética: el agua sube en minutos y baja más despacio; «esperar» la avanza sin mover la respiración', () => {
    const sim = fakeSim();
    const m = new HeartFailureModel(() => sim);
    m.setInput({ control: { kind: 'pcwp', mmHg: 28 }, phenotype: 'hfpef', rapMmHg: 6 });
    expect(m.evlwi().now).toBeCloseTo(HEMODYNAMICS.params.evlwiNormal.value, 6);
    m.step(60);
    const oneMin = m.evlwi();
    expect(oneMin.now - 7.4).toBeLessThan(0.1 * (oneMin.steady - 7.4));
    m.wait(120);
    expect(m.evlwi().now).toBeGreaterThan(oneMin.steady - 0.1);
    m.setInput({ control: { kind: 'pcwp', mmHg: 10 }, phenotype: 'hfpef', rapMmHg: 6 });
    m.wait(30);
    expect(m.evlwi().now).toBeGreaterThan(9);
  });

  it('«pulmón normal» olvida el mando: «esperar» después no lo resucita', () => {
    const sim = fakeSim();
    const m = new HeartFailureModel(() => sim);
    m.setInput({ control: { kind: 'evlwi', mlKg: 17.3 }, phenotype: 'hfpef', rapMmHg: 6 }, true);
    expect(m.evlwi().now).toBeCloseTo(17.3, 1);
    m.reset();
    expect(m.input).toBeNull();
    m.wait(10);
    expect(sim.patient.lung).toBeUndefined();
    expect(m.evlwi().now).toBe(HEMODYNAMICS.params.evlwiNormal.value);
    m.step(600);
    expect(sim.patient.lung).toBeUndefined();
    // un modelo recién creado, sin mando, tampoco inventa uno al esperar
    const fresh = new HeartFailureModel(() => fakeSim());
    fresh.wait(60);
    expect(fresh.evlwi().now).toBe(HEMODYNAMICS.params.evlwiNormal.value);
    // y un mando nuevo después del reinicio vuelve a funcionar
    m.setInput({ control: { kind: 'pcwp', mmHg: 28 }, phenotype: 'hfpef', rapMmHg: 6 }, true);
    expect(sim.patient.lung).toBeDefined();
  });

  it('con el EVLWI como mando, el EVLWI global es el pedido', () => {
    const sim = fakeSim();
    const m = new HeartFailureModel(() => sim);
    for (const e of [10, 15, 20]) {
      m.setInput({ control: { kind: 'evlwi', mlKg: e }, phenotype: 'hfref', rapMmHg: 6 }, true);
      expect(m.evlwi().now).toBeCloseTo(e, 1);
    }
  });

  it('cada sitio de los protocolos tiene su pose ideal en su línea y su espacio intercostal, y se reconoce bajo la sonda', () => {
    const sim = fakeSim();
    for (const id of ['blue28', 'zones8count', 'stress4'] as const) {
      const p = protocolById(id);
      for (const s of protocolSites(p)) {
        const pose = sitePose(sim, s, p.orientation);
        expect(Number.isFinite(pose.phi) && Number.isFinite(pose.z)).toBe(true);
        expect(pose.yaw).toBe(p.orientation === 'intercostal' ? Math.PI / 2 : 0);
        sim.setPose(pose);
        expect(nearestSite(sim, p)).toEqual(s);
      }
    }
  });
});
