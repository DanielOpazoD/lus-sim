import { describe, expect, it } from 'vitest';
import { AnatomyScene, BASELINE_INSTANT } from '../anatomy/scene';
import { thoraxLinePhi } from '../anatomy/thoraxLines';
import { Tissue } from '../anatomy/tissues';
import { defaultPatient } from '../physiology/patientState';
import { probeContact } from '../probe/contact';
import {
  BLUE_UPPER_POSE,
  CONVEX_C35,
  clampPose,
  defaultPose,
  pointOnLine,
  probeFrame,
  probeVelocity,
  skinSoftness,
  type ProbePose,
} from '../probe/probe';
import { chestView, intercostalZ, scanLine } from './support/chestView';
import { measurementViewPose } from '../app/measurementViews';

/**
 * Lo que lus-sim cambia de la sonda de VExUS (decisión 10): la pose por omisión en el punto BLUE superior
 * derecho (desde la decisión 42, el de la regla de las manos; el EIC2 de la medioclavicular es la vista de medida) y el recorrido de la sonda por los dos hemitórax. El resto de `probe.ts` y `contact.ts`,
 * idénticos, lo prueban `anatomy.test.ts` (marco y acoplamiento) y `compression.test.ts` (contacto).
 */
const scene = new AnatomyScene(defaultPatient());

describe('pose por omisión: el punto BLUE superior derecho de la regla de las manos (decisión 42)', () => {
  it('sale de BLUE_UPPER_POSE, en el hemitórax derecho anterior, con el marcador craneal (corte longitudinal)', () => {
    const p = defaultPose();
    expect(p.phi).toBe(BLUE_UPPER_POSE.params.phi.value);
    expect(p.z).toBe(BLUE_UPPER_POSE.params.z.value);
    expect([p.lift, p.yaw, p.rock, p.tilt]).toEqual([0, 0, 0, 0]);
    // un objeto nuevo en cada llamada
    expect(defaultPose()).not.toBe(p);
    const fr = probeFrame(p, scene.torso, CONVEX_C35);
    // lado derecho (x < 0) y delante (y > 0); el eje lateral de la imagen es craneal (+z): corte longitudinal
    expect(fr.skinPoint[0]).toBeLessThan(0);
    expect(fr.skinPoint[1]).toBeGreaterThan(0);
    expect(fr.lateral[2]).toBeGreaterThan(0.99);
    // es tórax: pleura bajo la línea central, con pulmón debajo, y la pared sobre las costillas es rígida
    const v = chestView(scene, p);
    const D = scanLine(v, 0).pleuraMm!;
    expect(D).toBeGreaterThan(0);
    expect(scene.classify(v.material(pointOnLine(v.contact.frame, CONVEX_C35, 0, D + 5)), BASELINE_INSTANT).tissue).toBe(Tissue.Lung);
    expect(scene.classify(v.material(pointOnLine(v.contact.frame, CONVEX_C35, 0, D - 5)), BASELINE_INSTANT).tissue).toBe(Tissue.Muscle);
    expect(skinSoftness(p)).toBeCloseTo(0.15, 12);
  });

  it('la vista de medida del BLUE superior está en la línea medioclavicular, a la altura del centro de su EIC2 (a ≤ 0,5 mm)', () => {
    // decisión 16: la medioclavicular de `thoraxLines.ts` y el EIC2 entre la 2.ª y la 3.ª costillas de la parrilla del
    // adulto promedio, bajo la sonda; hasta la decisión 41, la pose por omisión, y hoy la vista de medida (decisión 42)
    const v = measurementViewPose('blueUpper');
    expect(v.phi).toBeCloseTo(thoraxLinePhi('midclavicular', scene.torso), 12);
    expect(Math.abs(v.z - intercostalZ(scene, 2, v.phi))).toBeLessThanOrEqual(0.5);
  });

  it('el contacto por omisión apoya toda la cara (ninguna línea sin acoplar en el punto BLUE)', () => {
    const k = probeContact(defaultPose(), CONVEX_C35, scene.torso);
    expect(Math.min(...k.contact)).toBeGreaterThan(0.99);
  });
});

describe('clampPose: la sonda recorre los dos hemitórax', () => {
  it('el ángulo va de la línea axilar posterior izquierda a la derecha, simétrico respecto de la línea media anterior', () => {
    const base: ProbePose = { phi: 0, z: 0, lift: 0, yaw: 0, rock: 0, tilt: 0 };
    const lo = clampPose({ ...base, phi: -10 }).phi;
    const hi = clampPose({ ...base, phi: 10 }).phi;
    expect(lo).toBeCloseTo(-0.2 * Math.PI, 12);
    expect(hi).toBeCloseTo(1.2 * Math.PI, 12);
    // simetría: el mismo margen más allá de cada flanco (φ = 0 izquierdo, φ = π derecho)
    expect(Math.PI / 2 - lo).toBeCloseTo(hi - Math.PI / 2, 12);
    // el punto BLUE superior izquierdo (el simétrico del derecho) y la medioclavicular izquierda están dentro del recorrido
    const left = clampPose({ ...defaultPose(), phi: Math.PI - defaultPose().phi });
    expect(left.phi).toBeCloseTo(Math.PI - defaultPose().phi, 12);
    const lmcLeft = clampPose({ ...defaultPose(), phi: Math.PI - measurementViewPose('blueUpper').phi });
    expect(lmcLeft.phi).toBeCloseTo(thoraxLinePhi('midclavicular', scene.torso, 1), 12);
    // el resto de límites, los de VExUS, salvo el craneal: la fosa supraclavicular (decisión 48)
    const c = clampPose({ phi: 1, z: 900, lift: -50, yaw: 2.5 * Math.PI, rock: 2, tilt: -2 });
    expect(c.z).toBe(225);
    expect(clampPose({ phi: 1, z: -900, lift: 0, yaw: 0, rock: 0, tilt: 0 }).z).toBe(-200);
    expect(c.lift).toBe(-6);
    expect(c.yaw).toBeCloseTo(0.5 * Math.PI, 9);
    expect(c.rock).toBe(0.7);
    expect(c.tilt).toBe(-0.7);
  });

  it('sentado (decisión 29) la sonda da la vuelta al tronco: φ se envuelve en la línea media posterior, sin tope', () => {
    const base: ProbePose = { phi: 0, z: 0, lift: 0, yaw: 0, rock: 0, tilt: 0 };
    const at = (phi: number) => clampPose({ ...base, phi }, 'sitting').phi;
    // la línea media posterior es el corte: 1,5π y −0,5π son el mismo sitio
    expect(at(1.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI, 12);
    expect(at(1.4 * Math.PI)).toBeCloseTo(1.4 * Math.PI, 12);
    expect(at(-0.4 * Math.PI)).toBeCloseTo(-0.4 * Math.PI, 12);
    // cualquier vuelta cae en [−π/2, 3π/2)
    for (const phi of [-7, -2, 0.3, 3.1, 4.7, 9]) {
      const w = at(phi);
      expect(w).toBeGreaterThanOrEqual(-0.5 * Math.PI);
      expect(w).toBeLessThan(1.5 * Math.PI);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(phi), 12);
      expect(Math.sin(w)).toBeCloseTo(Math.sin(phi), 12);
    }
    // el resto de los límites, los del supino; y en supino, el tope de siempre
    const c = clampPose({ phi: 1, z: 900, lift: -50, yaw: 0, rock: 2, tilt: -2 }, 'sitting');
    expect([c.z, c.lift, c.rock, c.tilt]).toEqual([225, -6, 0.7, -0.7]);
    expect(clampPose({ ...base, phi: 1.4 * Math.PI }).phi).toBeCloseTo(1.2 * Math.PI, 12);
  });

  it('la velocidad de la sonda es el desplazamiento de su cara por segundo', () => {
    const a = probeFrame(defaultPose(), scene.torso, CONVEX_C35);
    const b = probeFrame({ ...defaultPose(), z: defaultPose().z + 2 }, scene.torso, CONVEX_C35);
    const v = probeVelocity(a, b, 0.5);
    expect(v[2]).toBeCloseTo(4, 9);
    expect(probeVelocity(a, b, 0)).toEqual([0, 0, 0]);
  });
});
