import { describe, expect, it } from 'vitest';
import { AnatomyScene, BASELINE_INSTANT } from '../anatomy/scene';
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
import { chestView, scanLine } from './support/chestView';

/**
 * Lo que lus-sim cambia de la sonda de VExUS (decisión 10): la pose por omisión en el punto BLUE superior
 * derecho aproximado y el recorrido de la sonda por los dos hemitórax. El resto de `probe.ts` y `contact.ts`,
 * idénticos, lo prueban `anatomy.test.ts` (marco y acoplamiento) y `compression.test.ts` (contacto).
 */
const scene = new AnatomyScene(defaultPatient());

describe('pose por omisión: el punto BLUE superior derecho aproximado', () => {
  it('sale de BLUE_UPPER_POSE, en la línea medioclavicular derecha, con el marcador craneal (corte longitudinal)', () => {
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
    // el punto BLUE superior izquierdo (el simétrico del derecho) está dentro del recorrido
    const left = clampPose({ ...defaultPose(), phi: Math.PI - defaultPose().phi });
    expect(left.phi).toBeCloseTo(0.25 * Math.PI, 12);
    // el resto de límites, los de VExUS
    const c = clampPose({ phi: 1, z: 900, lift: -50, yaw: 2.5 * Math.PI, rock: 2, tilt: -2 });
    expect(c.z).toBe(200);
    expect(c.lift).toBe(-6);
    expect(c.yaw).toBeCloseTo(0.5 * Math.PI, 9);
    expect(c.rock).toBe(0.7);
    expect(c.tilt).toBe(-0.7);
  });

  it('la velocidad de la sonda es el desplazamiento de su cara por segundo', () => {
    const a = probeFrame(defaultPose(), scene.torso, CONVEX_C35);
    const b = probeFrame({ ...defaultPose(), z: defaultPose().z + 2 }, scene.torso, CONVEX_C35);
    const v = probeVelocity(a, b, 0.5);
    expect(v[2]).toBeCloseTo(4, 9);
    expect(probeVelocity(a, b, 0)).toEqual([0, 0, 0]);
  });
});
