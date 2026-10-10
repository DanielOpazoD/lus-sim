import { describe, expect, it } from 'vitest';
import { AnatomyScene } from '../anatomy/scene';
import { attachEchoTwinHeart } from '../anatomy/heart/cardiacRuntime';
import { Simulator } from '../app/simulator';
import { errorLog } from '../app/errorLog';
import { clonePatient, defaultPatient } from '../physiology/patientState';
import { recordingGl } from './support/recordingGl';

/**
 * El volumen del corazón (RGBA16UI, ≈ 78 MB) es lo único grande del horneado: si la GPU no tiene memoria para él (un error de GL en
 * su `texImage3D`), el horneado falla como el de la fase 1 (`heartBake.test.ts`): el corazón sale de la escena, se informa una
 * vez, no hay latido y no se reintenta. En su propio archivo: el corazón fallido no vuelve en todo el módulo.
 */
const placed = new AnatomyScene(defaultPatient()).heart.cardiac!;
const macrotask = () => new Promise<void>((r) => setTimeout(r, 0));
const bakeDraws = (rec: ReturnType<typeof recordingGl>) =>
  rec.draws.filter((d) => d.frag === placed.bakeFragment || d.frag === placed.beatFragment);

describe('el volumen del corazón sin memoria en la GPU', () => {
  it('se informa una vez, sin corazón ni latido en la escena, sin dibujar nada y sin reintentos', async () => {
    const rec = recordingGl({ width: 320, height: 240 }, { volumeOutOfMemory: true });
    const reported = () => errorLog.recent(50).find((e) => e.source === 'gpu' && e.message.includes('reservar el volumen'));
    const sim = new Simulator(clonePatient(defaultPatient()), rec.canvas);
    // la escena se construyó con el corazón (registrado); su volumen se pide al construir el simulador
    expect(sim.scene.heart.cardiac).not.toBeNull();
    for (let i = 0; i < 20 && sim.scene.heart.cardiac; i++) await macrotask();
    expect(sim.scene.heart.cardiac).toBeNull();
    expect(sim.scene.heart.beat).toBeNull();
    expect(sim.scene.heart.plugDepthMm).toBe(0);
    expect(sim.scene.heart.base.r).toBe(0);
    expect(reported()?.count).toBe(1);
    // ni el horneado de telediástole ni el del latido dibujaron nada
    expect(bakeDraws(rec)).toHaveLength(0);
    const programs = rec.programs.length;
    // «Reiniciar paciente» con el mismo renderizador: la escena nueva no lo trae y nada se vuelve a intentar
    const next = new Simulator(clonePatient(defaultPatient()), rec.canvas, sim.renderer);
    expect(next.scene.heart.cardiac).toBeNull();
    await next.attachCardiac(attachEchoTwinHeart);
    await macrotask();
    expect(next.scene.heart.cardiac).toBeNull();
    expect(bakeDraws(rec)).toHaveLength(0);
    expect(rec.programs).toHaveLength(programs);
    expect(reported()?.count).toBe(1);
    expect(() => next.render()).not.toThrow();
  });
});
