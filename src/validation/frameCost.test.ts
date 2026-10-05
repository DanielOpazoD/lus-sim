import { describe, expect, it } from 'vitest';
import { EquipmentController, type EquipmentCommand } from '../app/equipment';
import { Simulator, defaultEquipment } from '../app/simulator';
import { measurementViewPose } from '../app/measurementViews';
import { createTestHooks, frameMeasureOptions } from '../app/testHooks';
import { C_RECONSTRUCTION_MM_S } from '../core/units';
import { clonePatient, defaultPatient } from '../physiology/patientState';
import { FRAME_PASSES, type PassId } from '../ultrasound/passGraph';
import type { FrameInputs, PassRepeat, UltrasoundRenderer } from '../ultrasound/renderer';
import { recordingGl } from './support/recordingGl';
import { registerCardiac } from '../anatomy/organs/heart';

// lus-sim (decisión 49): estas pruebas cuentan los dibujos y los enlaces de las pasadas; sin el corazón de EchoTwin, que el
// renderizador hornea con su propio programa al llegar (lo prueban `cardiac.test.ts` y la e2e)
registerCardiac(null);

/**
 * lus-sim (decisión 12): sin la caja de color ni `forceColor` (VExUS medía el cuadro con la pasada de color a su
 * propia cadencia); el resto del protocolo de medida es el mismo, en el punto BLUE inferior y con el paciente por
 * omisión.
 */

/** Renderizador falso: registra lo que pide cada cuadro (el coste en GPU lo mide el banco, no vitest). */
class FakeRenderer {
  frames: { repeat: PassRepeat | undefined }[] = [];
  poses: FrameInputs['pose'][] = [];
  syncs = 0;
  /** Cuadros que dibuja antes de fallar (un fallo de GPU a mitad de la medida). */
  failAfter = Number.POSITIVE_INFINITY;
  setScene(): void {}
  render(inputs: FrameInputs, repeat?: PassRepeat): void {
    if (this.frames.length >= this.failAfter) throw new Error('fallo de GPU simulado');
    this.frames.push({ repeat });
    this.poses.push({ ...inputs.pose });
  }
  finishForTiming(): void {
    this.syncs++;
  }
}

/** Simulador real con el renderizador falso y el equipo gobernado por comandos, como en `SimulationSession`. */
function rig() {
  const fake = new FakeRenderer();
  const sim = new Simulator(clonePatient(defaultPatient()), {} as HTMLCanvasElement, fake as unknown as UltrasoundRenderer);
  const equipment = new EquipmentController(defaultEquipment(), { halfSectorRad: sim.transducer.halfSector, cMmS: C_RECONSTRUCTION_MM_S });
  sim.equipment = equipment.state;
  equipment.subscribe((next) => {
    sim.equipment = next;
  });
  const dispatch = (cmd: EquipmentCommand): void => equipment.dispatch(cmd);
  return { fake, sim, equipment, dispatch, hooks: createTestHooks(() => sim, dispatch) };
}

describe('frameCostMs: el coste del cuadro y por pasada', () => {
  it('dibuja n + 1 cuadros completos (uno de calentamiento) sincronizados con la GPU al principio y al final', () => {
    const { fake, equipment, hooks } = rig();
    const before = equipment.state;
    hooks.frameCostMs(20);
    expect(fake.frames.length).toBe(21);
    for (const f of fake.frames) expect(f).toEqual({ repeat: undefined });
    expect(fake.syncs).toBe(2);
    expect(equipment.state).toEqual(before);
  });

  it('lanza si no dibujaría ningún cuadro: imagen congelada o n que no es un entero ≥ 1', () => {
    const { fake, sim, hooks } = rig();
    sim.frozen = true;
    expect(() => hooks.frameCostMs(10)).toThrow(/congelada/);
    sim.frozen = false;
    for (const n of [0, -1, 2.5, Number.NaN]) expect(() => hooks.frameCostMs(n)).toThrow(/entero ≥ 1/);
    expect(fake.frames.length).toBe(0);
    expect(hooks.frameCostMs(3)).toBeGreaterThanOrEqual(0);
    expect(fake.frames.length).toBe(4);
  });

  it('si un cuadro falla, el error sube', () => {
    const { fake, hooks } = rig();
    fake.failAfter = 3;
    expect(() => hooks.frameCostMs(20)).toThrow(/fallo de GPU/);
    expect(fake.frames.length).toBe(3);
  });

  it('repeatPass llega al renderizador en cada cuadro, con repeatCount repeticiones (1 por defecto)', () => {
    const { fake, hooks } = rig();
    hooks.frameCostMs(4, { repeatPass: 'rawField' });
    expect(fake.frames.map((f) => f.repeat)).toEqual(Array(5).fill({ pass: 'rawField', times: 1 }));
    fake.frames = [];
    hooks.frameCostMs(4, { repeatPass: 'transmission', repeatCount: 3 });
    expect(fake.frames.every((f) => f.repeat?.pass === 'transmission' && f.repeat.times === 3)).toBe(true);
  });

  it('startPoint mide en la pose de partida aunque la sonda se haya movido (el barrido del banco)', () => {
    const { fake, sim, hooks } = rig();
    // la vista de medida (decisión 42), no el punto clínico: `startPoint` de `frameCostMs` es una vista de medida
    sim.patient.position = 'supine';
    sim.setPose(measurementViewPose('blueLower'));
    sim.advance(0.05);
    const at = { ...sim.pose };
    sim.setPose({ ...at, tilt: at.tilt + (6 * Math.PI) / 180 });
    hooks.frameCostMs(3);
    expect(fake.poses.every((p) => p.tilt !== at.tilt)).toBe(true);
    sim.setPose({ ...at, rock: at.rock - (6 * Math.PI) / 180 });
    fake.poses = [];
    hooks.frameCostMs(3, { startPoint: 'blueLower' });
    expect(fake.poses.length).toBe(4);
    for (const p of fake.poses) expect(p).toEqual(at);
  });

  it('las opciones que no medirían nada lanzan en vez de ignorarse', () => {
    expect(() => frameMeasureOptions({ repeatPass: 'noExiste' as PassId })).toThrow(/no es una pasada/);
    expect(() => frameMeasureOptions({ repeatPass: 'rawField', repeatCount: 0 })).toThrow(/entero ≥ 1/);
    expect(() => frameMeasureOptions({ repeatPass: 'rawField', repeatCount: 1.5 })).toThrow(/entero ≥ 1/);
    expect(() => frameMeasureOptions({ repeatCount: 2 })).toThrow(/sin repeatPass/);
    expect(frameMeasureOptions({ repeatPass: 'present' })).toEqual({ repeat: { pass: 'present', times: 1 } });
    expect(frameMeasureOptions()).toEqual({});
  });

  it('la aplicación no cambia: render() sin opciones ni repite ni fuerza; con la imagen congelada no dibuja', () => {
    const { fake, sim } = rig();
    sim.render();
    sim.render();
    expect(fake.frames).toEqual(Array(2).fill({ repeat: undefined }));
    sim.frozen = true;
    sim.render();
    expect(fake.frames.length).toBe(2);
  });
});

/**
 * Simulador con el renderizador REAL sobre el WebGL falso (sin caja de color: 11 pasadas por cuadro, las de lus-sim). Sin
 * composición espacial: con ella, D escribe cada cuadro en otra ranura del anillo (decisión 58,
 * `compoundRenderer.test.ts`) y aquí se comparan cuadros de la misma paridad de la persistencia.
 */
function realRig() {
  const rec = recordingGl({ width: 320, height: 240 });
  const sim = new Simulator(clonePatient(defaultPatient()), rec.canvas);
  sim.equipment = { ...sim.equipment, bmode: { ...sim.equipment.bmode, compound: false } };
  return { ...rec, sim };
}

describe('repeatPass en el renderizador real (WebGL falso)', () => {
  const perFrame = FRAME_PASSES.filter((p) => p.cadence === 'frame').length;

  it('sin repetición, un dibujo por pasada y ningún destino de prueba', () => {
    const { sim, draws, attachments } = realRig();
    const fbos = attachments.size;
    sim.render();
    expect(draws.length).toBe(perFrame);
    expect(attachments.size).toBe(fbos + 3); // conversión de barrido y las dos historias, del primer cuadro
    draws.length = 0;
    sim.render();
    expect(draws.length).toBe(perFrame);
    expect(attachments.size).toBe(fbos + 3);
  });

  for (const pass of ['rawField', 'transmission', 'persistence', 'present'] as const)
    it(`${pass}: cada repetición es su propio pase de render, con las texturas de la pasada, y la salida real no cambia`, () => {
      const { sim, draws, binds, attachments } = realRig();
      // la persistencia alterna sus dos historias: el cuadro con repetición se compara con el de su paridad
      sim.render();
      const base = draws.splice(0);
      sim.render();
      draws.length = 0;
      const idx = FRAME_PASSES.filter((p) => p.cadence === 'frame').findIndex((p) => p.id === pass);
      const own = base[idx];
      binds.length = 0;
      sim.render({ repeat: { pass, times: 3 } });
      expect(draws.length).toBe(perFrame + 3);
      // la pasada y las demás dibujan igual que sin repetir (mismo destino, programa y texturas)
      const withoutRepeats = [...draws.slice(0, idx + 1), ...draws.slice(idx + 4)];
      expect(withoutRepeats.map((d) => [d.fbo?.id ?? null, d.program?.id])).toEqual(base.map((d) => [d.fbo?.id ?? null, d.program?.id]));
      const repeats = draws.slice(idx + 1, idx + 4);
      const frameFbos = new Set(base.map((d) => d.fbo));
      let prev = draws[idx].fbo;
      for (const r of repeats) {
        expect(r.program).toBe(own.program);
        expect(r.units).toBe(draws[idx].units);
        // otro FBO que el del dibujo anterior y que cualquier destino del cuadro
        expect(r.fbo).not.toBe(prev);
        expect(frameFbos.has(r.fbo)).toBe(false);
        // con el tamaño y los formatos de la salida de la pasada (la pantalla: RGBA8 del lienzo)
        const want = own.fbo ? attachments.get(own.fbo) : [{ internal: attachments.get(repeats[0].fbo!)![0].internal, w: 320, h: 240 }];
        expect(attachments.get(r.fbo!)).toEqual(want);
        expect(r.viewport).toEqual(draws[idx].viewport);
        prev = r.fbo;
      }
      expect(new Set(repeats.map((r) => r.fbo)).size).toBe(2);
      // al terminar vuelve a quedar puesto el destino de la pasada
      const lastRepeatBind = binds.lastIndexOf(repeats[2].fbo);
      expect(binds[lastRepeatBind + 1]).toBe(own.fbo);
    });

  it('dispose libera los destinos de prueba', () => {
    const { sim, draws, deleted } = realRig();
    sim.render({ repeat: { pass: 'rawField', times: 2 } });
    const scratch = new Set(draws.slice(5, 7).map((d) => d.fbo));
    sim.renderer.dispose();
    for (const f of scratch) expect(deleted.has(f!)).toBe(true);
  });
});

/**
 * La sincronización de la medida (decisión 40): `finishForTiming` lee un píxel de la pantalla, que escribe la última pasada,
 * y no del framebuffer que esté ligado. Tras guardar un cuadro en el cine queda ligada para lectura la envolvente (R32F), donde
 * RGBA/UNSIGNED_BYTE es inválido: en la GPU real cada medida dejaba un `GL_INVALID_OPERATION`. El WebGL falso rechaza la
 * lectura como WebGL.
 */
describe('finishForTiming: espera al cuadro leyendo la pantalla', () => {
  const rigRead = () => {
    const rec = realRig();
    const gl = rec.canvas.getContext('webgl2') as unknown as WebGL2RenderingContext;
    return { ...rec, gl };
  };

  it('tras un cuadro que va al cine (la lectura ligada es la envolvente, de coma flotante), lee la pantalla y deja la lectura como estaba', () => {
    const { sim, gl, reads, attachments } = rigRead();
    sim.render();
    // la trampa: lo ligado para lectura al acabar el cuadro es un FBO de coma flotante
    const bound = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as object | null;
    expect(bound).not.toBeNull();
    expect(attachments.get(bound as never)?.[0]?.internal).toBe(gl.R32F);
    sim.renderer.finishForTiming();
    expect(reads.at(-1)).toEqual({ fbo: null, internal: null, valid: true });
    expect(gl.getParameter(gl.READ_FRAMEBUFFER_BINDING)).toBe(bound);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it('una lectura de coma flotante del renderizador (RGBA/FLOAT, la transmisión) no deja error', () => {
    const { sim, gl, reads } = rigRead();
    sim.render();
    sim.renderer.readTransmission();
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((r) => r.valid)).toBe(true);
    expect(() => sim.renderer.finishForTiming()).not.toThrow();
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it('lanza si WebGL informa un error en vez de devolver una medida sin sincronizar', () => {
    const { sim, gl } = rigRead();
    sim.render();
    // una lectura inválida pendiente (la de antes de la decisión 40: RGBA/UNSIGNED_BYTE sobre lo que esté ligado)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    expect(() => sim.renderer.finishForTiming()).toThrow(/finishForTiming: WebGL informa el error 0x502/);
  });
});
