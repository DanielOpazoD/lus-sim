import { describe, expect, it } from 'vitest';
import { Simulator } from '../app/simulator';
import { AnatomyScene } from '../anatomy/scene';
import { torsoNormal, torsoSkinPoint } from '../anatomy/primitives';
import { dot } from '../core/vec3';
import { DIAPHRAGM_EXCURSION } from '../physiology/respiratory';
import { defaultPatient } from '../physiology/patientState';
import { probeContact } from '../probe/contact';
import {
  OPERATOR_HAND,
  chestWallDisplacementMm,
  defaultOperator,
  operatorOffsetMm,
  translateContact,
  tremorComponents,
  tremorMm,
} from '../probe/operator';
import { recordingGl } from './support/recordingGl';

/**
 * La mano del ecografista (lus-sim, decisión 39): el movimiento de la sonda respecto del tórax entre cuadros, del reloj único
 * y con la semilla del operador.
 */
const P = OPERATOR_HAND.params;
const torso = new AnatomyScene(defaultPatient()).torso;
const norm = (v: readonly number[]) => Math.hypot(v[0], v[1], v[2]);

describe('la mano del ecografista (decisión 39)', () => {
  it('el temblor tiene el rms del registro por eje, su banda (7–11 Hz) y es el mismo en el mismo instante con la misma semilla', () => {
    const comps = tremorComponents(7);
    for (const axis of comps)
      for (const c of axis) {
        expect(c.hz).toBeGreaterThanOrEqual(7);
        expect(c.hz).toBeLessThanOrEqual(11);
      }
    const n = 20000;
    const sq = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const v = tremorMm(i * 0.0137, comps);
      for (let k = 0; k < 3; k++) sq[k] += v[k] * v[k];
    }
    for (let k = 0; k < 3; k++) expect(Math.sqrt(sq[k] / n) / P.tremorRmsMm.value).toBeCloseTo(1, 1);
    expect(tremorMm(12.345, tremorComponents(7))).toEqual(tremorMm(12.345, comps));
    // otra semilla, otro temblor
    expect(tremorMm(12.345, tremorComponents(8))).not.toEqual(tremorMm(12.345, comps));
  });

  it('la pared se mueve con las amplitudes de la TC 4D: AP por la normal, craneal y hacia fuera, lineal en la fracción', () => {
    for (const phi of [Math.PI / 2 - 0.4, Math.PI / 2 + 0.4, -Math.PI / 2 + 0.6, 1.15 * Math.PI, Math.PI - 0.01, Math.PI + 0.01]) {
      const p = torsoSkinPoint(phi, 0, torso);
      const n = torsoNormal(p, torso);
      expect(norm(chestWallDisplacementMm(p, torso, 0))).toBe(0);
      for (const breath of [0.5, 1]) {
        const w = chestWallDisplacementMm(p, torso, breath);
        // AP por la normal (el término mediolateral va en el plano de la piel) y SI hacia craneal
        expect(dot(w, n)).toBeCloseTo(P.chestApMm.value * breath, 9);
        expect(w[2]).toBeCloseTo(P.chestSiMm.value * breath, 9);
        // mediolateral: hacia fuera de la línea media, a lo sumo su amplitud
        const lr = [w[0] - n[0] * dot(w, n), w[1] - n[1] * dot(w, n)];
        expect(Math.hypot(lr[0], lr[1])).toBeLessThanOrEqual(P.chestLrMm.value * breath + 1e-9);
        if (Math.abs(p[0]) > 1 && Math.hypot(lr[0], lr[1]) > 1e-6) expect(Math.sign(lr[0])).toBe(Math.sign(p[0]));
      }
    }
    // sin saltos a través de la axilar media (φ = π) ni de la línea media (x = 0)
    for (const [a, b] of [
      [Math.PI - 0.01, Math.PI + 0.01],
      [Math.PI / 2 - 0.01, Math.PI / 2 + 0.01],
    ]) {
      const wa = chestWallDisplacementMm(torsoSkinPoint(a, 0, torso), torso, 1);
      const wb = chestWallDisplacementMm(torsoSkinPoint(b, 0, torso), torso, 1);
      expect(norm([wa[0] - wb[0], wa[1] - wb[1], wa[2] - wb[2]])).toBeLessThan(0.05);
    }
  });

  it('la sonda se mueve al revés de la pared por lo que la mano no sigue, más el temblor; apagada, nada', () => {
    const p = torsoSkinPoint(Math.PI / 2 - 0.4, 0, torso);
    const op = { ...defaultOperator(3), tremorRmsMm: 0 };
    for (const follow of [0, 0.5, 1]) {
      const o = operatorOffsetMm({ ...op, chestFollow: follow }, p, torso, 1, 2.5);
      const w = chestWallDisplacementMm(p, torso, 1);
      for (let k = 0; k < 3; k++) expect(o[k]).toBeCloseTo(-(1 - follow) * w[k], 9);
    }
    expect(operatorOffsetMm({ ...defaultOperator(3), enabled: false }, p, torso, 1, 2.5)).toEqual([0, 0, 0]);
    // al final de la espiración (fracción 0) solo queda el temblor
    const a = operatorOffsetMm(defaultOperator(3), p, torso, 0, 2.5);
    expect(a).toEqual(tremorMm(2.5, tremorComponents(3), P.tremorRmsMm.value));
  });

  it('en el simulador: la sonda es la de la pose trasladada con el reloj y la semilla; la CPU ve el mismo contacto', () => {
    const run = (seed: number) => {
      const rec = recordingGl({ width: 320, height: 240 });
      const sim = new Simulator(defaultPatient(), rec.canvas);
      sim.operator = { ...sim.operator, seed };
      sim.advance(1.7);
      return sim;
    };
    const a = run(11);
    const b = run(11);
    const c = run(12);
    expect(a.sample.t).toBe(b.sample.t);
    expect(a.frame).toEqual(b.frame);
    expect(a.frame.face).not.toEqual(c.frame.face);
    // la traslación, recalculada a mano desde la muestra del reloj y el contacto de la pose
    const k = probeContact(a.pose, a.transducer, a.scene.torso);
    const breath = a.sample.resp.diaphragmCaudalMm / DIAPHRAGM_EXCURSION.params.quietMm.value;
    const d = operatorOffsetMm(a.operator, k.frame.skinPoint, a.scene.torso, breath, a.sample.t);
    for (let i = 0; i < 3; i++) expect(a.operatorOffsetMm[i]).toBeCloseTo(d[i], 12);
    expect(a.frame).toEqual(translateContact(k, d).frame);
    expect(a.contact.center).toEqual(translateContact(k, d).center);
    // apagada, el marco es el de la pose
    a.operator = { ...a.operator, enabled: false };
    a.advance(0.1);
    expect(a.frame).toEqual(k.frame);
    for (const s of [a, b, c]) s.dispose();
  });
});
