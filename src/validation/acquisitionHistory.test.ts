import { describe, expect, it } from 'vitest';
import { Simulator } from '../app/simulator';
import { defaultPatient } from '../physiology/patientState';
import { probeContact } from '../probe/contact';
import { defaultPose } from '../probe/probe';
import { CineRing, snapshotAcquisition, type AcquisitionState } from '../ultrasound/cine';
import { recordingGl } from './support/recordingGl';

function rig() {
  const rec = recordingGl({ width: 320, height: 240 });
  const sim = new Simulator(defaultPatient(), rec.canvas);
  return { ...rec, sim };
}

describe('La navegación muestra la adquisición del mismo cuadro B', () => {
  it('al recorrer el cine, pose, marco efectivo y respiración vuelven juntos al cuadro adquirido', () => {
    const { sim } = rig();
    const expected: AcquisitionState[] = [];
    for (let k = 0; k < 3; k++) {
      sim.setPose({ ...defaultPose(), z: 70 - k * 18, yaw: k * 0.2, lift: -k });
      sim.advance(k === 0 ? 0 : 0.4);
      sim.render();
      expected.push(
        snapshotAcquisition({
          pose: sim.pose,
          frame: sim.frame,
          sample: sim.sample,
          respiratoryPattern: sim.patient.respiratoryPattern,
          position: 'supine',
        }),
      );
    }
    expect(sim.renderer.cineCount).toBe(3);
    expect(new Set(expected.map((a) => a.sample.resp.diaphragmCaudalMm)).size).toBe(3);
    const live = sim.displayedAcquisition;
    sim.frozen = true;
    sim.renderer.cineSeal();
    for (const index of [0, 2, 1, 0]) {
      sim.renderer.showCine(index);
      expect(sim.displayedAcquisition).toEqual(expected[index]);
      expect(sim.displayedAcquisition.sample.t).toBe(sim.renderer.cineShownFrame!.t);
      expect(sim.displayed.bmode).toBe(sim.renderer.cineShownFrame!.bmode);
    }
    // El cine no reposiciona al paciente ni cambia la adquisición en vivo que se retomará.
    expect(sim.pose).toEqual(live.pose);
    expect(sim.sample.t).toBe(live.sample.t);
    sim.renderer.cineExit();
    sim.frozen = false;
    expect(sim.displayedAcquisition).toBe(live);
    sim.dispose();
  });

  it('al congelar incluye el último cuadro visible aunque la cadencia del cine todavía no lo guardara', () => {
    const { sim } = rig();
    sim.render();
    sim.setPose({ ...sim.pose, yaw: 0.45, lift: -2 });
    sim.advance(0.012);
    sim.render();
    expect(sim.renderer.cineCount).toBe(1);
    const final = snapshotAcquisition(sim.displayedAcquisition);
    sim.frozen = true;
    sim.renderer.cineSeal();
    expect(sim.renderer.cineCount).toBe(2);
    sim.renderer.showCine(1);
    expect(sim.displayedAcquisition).toEqual(final);
    sim.renderer.cineSeal();
    expect(sim.renderer.cineCount).toBe(2);
    sim.dispose();
  });

  it('el cuadro guardado no cambia al mutar los objetos de origen, incluidos los vectores y la respiración', () => {
    const { sim } = rig();
    sim.advance(0.2);
    const source = {
      pose: sim.pose,
      frame: sim.frame,
      sample: sim.sample,
      respiratoryPattern: sim.patient.respiratoryPattern,
      position: 'supine' as const,
    };
    const expected = snapshotAcquisition(source);
    sim.render();
    source.pose.phi += 0.1;
    source.frame.face[0] += 100;
    source.frame.axial[1] += 0.2;
    source.frame.skinPoint[2] += 100;
    source.sample.resp.diaphragmCaudalMm += 100;
    source.sample.t += 10;
    sim.frozen = true;
    sim.renderer.showCine(0);
    expect(sim.displayedAcquisition).toEqual(expected);
    sim.dispose();
  });

  it('la maniobra respiratoria del cine es la adquirida, aunque el paciente ya haya pasado de tranquila a profunda', () => {
    const { sim } = rig();
    sim.render();
    expect(sim.displayedAcquisition.respiratoryPattern).toBe('quiet');
    sim.patient.respiratoryPattern = 'deep';
    sim.advance(0.4);
    // Antes de la siguiente imagen sigue visible la adquisición tranquila.
    expect(sim.displayedAcquisition.respiratoryPattern).toBe('quiet');
    sim.render();
    expect(sim.displayedAcquisition.respiratoryPattern).toBe('deep');
    sim.frozen = true;
    sim.renderer.showCine(0);
    expect(sim.displayedAcquisition.respiratoryPattern).toBe('quiet');
    expect(sim.patient.respiratoryPattern).toBe('deep');
    sim.renderer.showCine(1);
    expect(sim.displayedAcquisition.respiratoryPattern).toBe('deep');
    sim.dispose();
  });

  it('la posición del paciente del cine es la adquirida (decisión 33): sentado en la espalda, aunque luego se tumbe', () => {
    const { sim } = rig();
    sim.patient.position = 'sitting';
    sim.setPose({ ...sim.pose, phi: 1.4 * Math.PI });
    sim.render();
    expect(sim.displayedAcquisition.position).toBe('sitting');
    sim.patient.position = 'supine';
    sim.setPose(sim.pose);
    sim.advance(0.4);
    sim.render();
    expect(sim.displayedAcquisition.position).toBe('supine');
    expect(sim.displayedAcquisition.pose.phi).toBeCloseTo(1.2 * Math.PI, 12);
    sim.frozen = true;
    sim.renderer.showCine(0);
    expect(sim.displayedAcquisition.position).toBe('sitting');
    expect(sim.displayedAcquisition.pose.phi).toBeCloseTo(1.4 * Math.PI, 12);
    sim.dispose();
  });

  it('antes de renderizar otro cuadro conserva el último visible; cambiar la escena o recuperar GPU descarta el anterior', () => {
    const { sim, canvas } = rig();
    sim.render();
    const rendered = sim.displayedAcquisition;
    sim.setPose({ ...sim.pose, z: sim.pose.z - 20 });
    sim.advance(0.2);
    expect(sim.displayedAcquisition).toBe(rendered);
    sim.renderer.setScene(sim.scene);
    expect(sim.renderer.cineCount).toBe(0);
    expect(sim.displayedAcquisition.pose).toEqual(sim.pose);
    expect(sim.displayedAcquisition.sample.t).toBe(sim.sample.t);
    sim.render();
    sim.frozen = true;
    sim.renderer.showCine(0);
    sim.rebuildRenderer(canvas);
    expect(sim.renderer.cineCount).toBe(0);
    expect(sim.renderer.cineShownFrame).toBeNull();
    expect(sim.displayedAcquisition.pose).toEqual(sim.pose);
    sim.dispose();
  });

  it('el gesto actualiza contacto y marco aun sin paso fisiológico, y congelar conserva la adquisición', () => {
    const { sim } = rig();
    const t = sim.sample.t;
    const pose = { ...sim.pose, z: sim.pose.z - 30, yaw: 0.3, lift: -2 };
    sim.setPose(pose);
    sim.advance(0);
    const contact = probeContact(sim.pose, sim.transducer, sim.scene.torso);
    expect(sim.frame).toEqual(contact.frame);
    expect(sim.sample.t).toBe(t);
    sim.render();
    expect(sim.displayedAcquisition.pose).toEqual(sim.pose);
    expect(sim.displayedAcquisition.pose.yaw).toBeCloseTo(pose.yaw, 12);
    expect(sim.displayedAcquisition.frame).toEqual(contact.frame);
    expect(sim.displayedAcquisition.frame.face).not.toEqual(sim.displayedAcquisition.frame.skinPoint);
    const displayed = sim.displayedAcquisition;
    sim.frozen = true;
    sim.setPose({ ...pose, z: pose.z - 10 });
    sim.advance(0.2);
    sim.render();
    expect(sim.frame).toEqual(contact.frame);
    expect(sim.sample.t).toBe(t);
    expect(sim.displayedAcquisition).toBe(displayed);
    sim.dispose();
  });
});

describe('Metadatos de adquisición dentro del anillo', () => {
  it('al dar la vuelta conserva cada pose con su tiempo y clear elimina la selección anterior', () => {
    const { sim } = rig();
    const ring = new CineRing<AcquisitionState>(3);
    for (let k = 0; k < 7; k++) {
      const source = {
        pose: { ...sim.pose, z: k * 10 },
        frame: { ...sim.frame, face: [k, 2, 3] as [number, number, number] },
        sample: { ...sim.sample, t: k, resp: { ...sim.sample.resp, diaphragmCaudalMm: k * 2 } },
        respiratoryPattern: sim.patient.respiratoryPattern,
        position: 'supine' as const,
      };
      ring.push(k, snapshotAcquisition(source));
      source.pose.z = -999;
      source.frame.face[0] = -999;
      source.sample.resp.diaphragmCaudalMm = -999;
    }
    for (let i = 0; i < ring.count; i++) {
      const k = i + 4;
      expect([ring.at(i).sample.t, ring.at(i).pose.z, ring.at(i).frame.face[0], ring.at(i).sample.resp.diaphragmCaudalMm]).toEqual([
        k,
        k * 10,
        k,
        k * 2,
      ]);
    }
    ring.clear();
    expect(ring.count).toBe(0);
    expect(() => ring.at(0)).toThrow(RangeError);
    sim.dispose();
  });
});
