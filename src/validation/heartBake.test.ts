import { describe, expect, it } from 'vitest';
import { AnatomyScene } from '../anatomy/scene';
import { registerCardiac } from '../anatomy/organs/heart';
import { attachEchoTwinHeart } from '../anatomy/heart/cardiacRuntime';
import { Simulator } from '../app/simulator';
import { errorLog } from '../app/errorLog';
import { clonePatient, defaultPatient } from '../physiology/patientState';
import { recordingGl } from './support/recordingGl';
import { HEART_BAKE_LAYERS } from '../ultrasound/heartBake';

/**
 * El horneado del volumen del corazón (decisión 49) con el WebGL falso: por pasos de varias capas, sin lecturas que paren la página,
 * el corazón entra en la escena cuando su volumen está (la CPU y la GPU a la vez) y un horneado fallido lo saca de la escena, se
 * informa y no se reintenta. En su propio archivo: el corazón fallido no vuelve en todo el módulo.
 */
const bakeFrag = new AnatomyScene(defaultPatient()).heart.cardiac!.bakeFragment;
const macrotask = () => new Promise<void>((r) => setTimeout(r, 0));
const bakeDraws = (rec: ReturnType<typeof recordingGl>) => rec.draws.filter((d) => d.frag === bakeFrag);

describe('el horneado del volumen del corazón', () => {
  it('por pasos de varias capas y sin lecturas; el corazón entra en la escena cuando su volumen está entero', async () => {
    registerCardiac(null);
    const rec = recordingGl({ width: 320, height: 240 });
    const sim = new Simulator(clonePatient(defaultPatient()), rec.canvas);
    registerCardiac(attachEchoTwinHeart);
    expect(sim.scene.heart.cardiac).toBeNull();
    const done = sim.attachCardiac(attachEchoTwinHeart);
    // colocado aparte: la escena no lo tiene hasta que la GPU tiene su volumen
    expect(sim.scene.heart.cardiac).toBeNull();
    await macrotask();
    const first = bakeDraws(rec).length;
    expect(first).toBe(HEART_BAKE_LAYERS);
    expect(sim.scene.heart.cardiac).toBeNull();
    const reads = rec.reads.length;
    await done;
    const draws = bakeDraws(rec);
    const nz = sim.scene.heart.cardiac!.vol.dims[2];
    expect(draws.map((d) => d.uniforms.uLayer[0])).toEqual(Array.from({ length: nz }, (_, k) => k));
    expect(rec.reads.length).toBe(reads);
    expect(sim.scene.heart.plugDepthMm).toBeGreaterThan(0);
    // otra escena del mismo paciente trae el mismo corazón, ya horneado: nada que dibujar
    const again = new Simulator(clonePatient(defaultPatient()), rec.canvas, sim.renderer);
    await again.attachCardiac(attachEchoTwinHeart);
    expect(again.scene.heart.cardiac).toBe(sim.scene.heart.cardiac);
    expect(bakeDraws(rec).length).toBe(nz);
  });

  it('un horneado fallido saca el corazón de la escena, se informa una vez y no se reintenta', async () => {
    const rec = recordingGl({ width: 320, height: 240 }, { fail: { frag: bakeFrag, stage: 'link' } });
    const reported = () => errorLog.recent(50).find((e) => e.source === 'gpu' && e.message.includes('heartBake'));
    const sim = new Simulator(clonePatient(defaultPatient()), rec.canvas);
    // la escena se construyó con el corazón (registrado); su volumen se pide al construir el simulador
    expect(sim.scene.heart.cardiac).not.toBeNull();
    for (let i = 0; i < 20 && sim.scene.heart.cardiac; i++) await macrotask();
    expect(sim.scene.heart.cardiac).toBeNull();
    expect(sim.scene.heart.plugDepthMm).toBe(0);
    expect(sim.scene.heart.base.r).toBe(0);
    expect(reported()?.count).toBe(1);
    const programs = rec.programs.length;
    // «Reiniciar paciente» con el mismo renderizador: la escena nueva no lo trae y nada se vuelve a compilar
    const next = new Simulator(clonePatient(defaultPatient()), rec.canvas, sim.renderer);
    expect(next.scene.heart.cardiac).toBeNull();
    await next.attachCardiac(attachEchoTwinHeart);
    await macrotask();
    expect(next.scene.heart.cardiac).toBeNull();
    expect(rec.programs.length).toBe(programs);
    expect(reported()?.count).toBe(1);
    expect(() => next.render()).not.toThrow();
  });
});
