import { describe, expect, it } from 'vitest';
import { AnatomyScene } from '../anatomy/scene';
import { PhysiologyEngine } from '../physiology/engine';
import { defaultPatient } from '../physiology/patientState';
import { probeContact } from '../probe/contact';
import { CONVEX_C35, defaultPose } from '../probe/probe';
import { ANATOMY_GLSL } from '../anatomy/gpu/anatomy.glsl';
import {
  SCENE_UNIFORMS,
  SCENE_UNIFORMS_GLSL,
  evaluateSceneUniforms,
  uploadSceneUniforms,
  type UniformSink,
} from '../anatomy/gpu/sceneUniforms';

/**
 * Esquema único de uniforms de la anatomía (Fase 2): ANATOMY_GLSL no declara uniforms a mano,
 * todo uniform que usa está en el esquema, ninguno del esquema sobra, y los valores tienen el
 * tamaño de su tipo.
 *
 * lus-sim (decisión 12): el paciente por omisión en lugar de los casos de VExUS, con y sin la compresión de la
 * sonda; el esquema es el del tórax (sin los uniforms del hígado, la vesícula, la aurícula, el gas ni los riñones).
 */
const body = ANATOMY_GLSL.replace(SCENE_UNIFORMS_GLSL, '');
const declared = new Set([...SCENE_UNIFORMS.map((u) => u.name), 'uSceneTex']);

describe('Esquema de uniforms de la escena', () => {
  it('ANATOMY_GLSL no contiene declaraciones de uniform escritas a mano', () => {
    expect(body).not.toMatch(/^\s*uniform\s/m);
  });

  it('todo uniform usado en el GLSL está en el esquema y ninguno del esquema sobra', () => {
    // Excluye accesos a campos (`c.uRef`) y nombres declarados como variable local o campo de
    // struct (`float uRef;`, `float uLocal = …`)
    const locals = new Set([...body.matchAll(/\b(?:float|int|bool|vec[234]|mat[34])\s+(u[A-Z]\w*)/g)].map((m) => m[1]));
    const used = new Set((body.match(/(?<![.\w])u[A-Z][A-Za-z0-9]*\b/g) ?? []).filter((n) => !locals.has(n)));
    for (const name of used) expect(declared.has(name), `${name} usado pero no declarado`).toBe(true);
    for (const name of declared) expect(used.has(name), `${name} declarado pero sin uso`).toBe(true);
  });

  it('el paciente por omisión da valores finitos del tamaño correcto y la subida llama al setter del tipo', () => {
    const patient = defaultPatient();
    const scene = new AnatomyScene(patient);
    const sample = new PhysiologyEngine(patient).step();
    for (const compression of [null, probeContact(defaultPose(), CONVEX_C35, scene.torso)]) {
      const values = evaluateSceneUniforms(scene, { sample, compression });
      expect(values).toHaveLength(SCENE_UNIFORMS.length);
      for (const { spec, data } of values) for (const v of data) expect(Number.isFinite(v), `${spec.name} no finito`).toBe(true);
      const calls: string[] = [];
      const sink: UniformSink = {
        f: (n) => calls.push(`f:${n}`),
        i: (n) => calls.push(`i:${n}`),
        v2: (n) => calls.push(`v2:${n}`),
        v3: (n) => calls.push(`v3:${n}`),
        v4: (n) => calls.push(`v4:${n}`),
        v3v: (n) => calls.push(`v3v:${n}`),
        v4v: (n) => calls.push(`v4v:${n}`),
      };
      uploadSceneUniforms(sink, values);
      expect(calls).toContain('v4v:uRibs');
      expect(calls).toContain('v4:uCurtain');
      expect(calls).toContain('v4:uResp');
      expect(calls).toHaveLength(SCENE_UNIFORMS.length);
    }
  });

  it('las costillas de la escena caben en el array del shader y el relleno queda lejos', () => {
    const scene = new AnatomyScene(defaultPatient());
    const ribs = SCENE_UNIFORMS.find((u) => u.name === 'uRibs')!;
    const ctx = { sample: new PhysiologyEngine(defaultPatient()).sample, compression: null };
    const data = Array.from(ribs.value(scene, ctx));
    expect(scene.ribs.length).toBeLessThanOrEqual(ribs.count!);
    // cada costilla de la escena, con sus cuatro valores
    scene.ribs.forEach((r, i) => expect(data.slice(i * 4, i * 4 + 4)).toEqual([r.zAnterior, r.tilt, r.halfWidth, r.halfThickness]));
    // la escena del tórax llena las 6 ranuras: el relleno (a 9999 mm, lejos de todo) se prueba con una escena de dos
    // costillas (lus-sim: en VExUS el bucle del relleno sí corría)
    const two = Array.from(ribs.value({ ...scene, ribs: scene.ribs.slice(0, 2) } as unknown as AnatomyScene, ctx));
    expect(two).toHaveLength(ribs.count! * 4);
    for (let i = 2; i < ribs.count!; i++) expect(two.slice(i * 4, i * 4 + 4)).toEqual([9999, 0, 1, 1]);
  });
});
