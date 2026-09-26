import { describe, expect, it } from 'vitest';
import { equivalenceSweep, interfaceShellEquivalence, pleuraEquivalence, volumeEquivalence } from '../app/equivalenceSweep';
import type { Simulator } from '../app/simulator';
import { START_POINTS } from '../app/startPoints';
import { Interface, isRibInterface, isWallLayerInterface } from '../anatomy/interfaces';
import { AnatomyQuery, type WorldQuery } from '../anatomy/query';
import { AnatomyScene } from '../anatomy/scene';
import { Tissue } from '../anatomy/tissues';
import { PhysiologyEngine } from '../physiology/engine';
import { defaultPatient } from '../physiology/patientState';
import { probeContact } from '../probe/contact';
import { CONVEX_C35, defaultPose, pointOnLine, type ProbePose } from '../probe/probe';
import { COARSE_DEPTH, DEFAULT_BMODE, type GpuPointQuery } from '../ultrasound/renderer';
import { pleuraCrossingLine } from '../ultrasound/transmission';

type P = [number, number, number];
/** Lo que la «GPU» cambia respecto a la CPU en un punto: tejido, cara o distancia a la cara. */
type Corruption = (p: P, q: WorldQuery) => { tissue?: number; iface?: number; ifd?: number };

/** Las caras de la pared y de las costillas (decisión 62) que reparte `classify` en los planos de partida del tórax. */
const WALL_FACES = ['SkinFat', 'Scarpa', 'DeepFascia', 'ObliquePlane', 'TransversusPlane', 'Transversalis', 'Peritoneum', 'RibCortex'];

/**
 * Lógica de los gates de equivalencia sin WebGL: la «GPU» del simulador falso es la propia
 * anatomía TS (acuerdo perfecto) o una versión con un defecto inyectado, que deben detectar.
 *
 * lus-sim (decisión 12): la escena del tórax y sus puntos de partida (BLUE superior e inferior y PLAPS), sin vasos
 * (sin el acuerdo de vaso ni el error de velocidad de VExUS); los defectos inyectados son del tórax (pulmón, pared,
 * costillas) y se añade la pleura parietal de A0 frente a su gemelo (`pleuraEquivalence`).
 */
function fakeSim(corrupt?: Corruption, pleuraShiftMm = 0): Simulator {
  const patient = defaultPatient();
  const scene = new AnatomyScene(patient);
  const anatomy = new AnatomyQuery(scene);
  const sample = new PhysiologyEngine(patient).step();
  const gpuQuery = (pts: Float32Array): GpuPointQuery => {
    const n = pts.length / 3;
    const tissue = new Int32Array(n);
    const vessel = new Int32Array(n).fill(-1);
    const velocity = new Float32Array(n * 3);
    const iface = new Int32Array(n);
    const ifd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p: P = [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];
      const q = anatomy.classifyWorld(p, sample);
      const bad = corrupt?.(p, q) ?? {};
      tissue[i] = bad.tissue ?? q.tissue;
      iface[i] = bad.iface ?? q.interface;
      ifd[i] = bad.ifd ?? q.interfaceDistance;
    }
    return { tissue, vessel, velocity, iface, ifd };
  };
  const sim = {
    scene,
    anatomy,
    sample,
    transducer: CONVEX_C35,
    bmode: DEFAULT_BMODE,
    pose: defaultPose(),
    frame: probeContact(defaultPose(), CONVEX_C35, scene.torso).frame,
    gpuQuery,
    setPose(p: ProbePose) {
      sim.pose = p;
      const k = probeContact(p, CONVEX_C35, scene.torso);
      sim.frame = k.frame;
      anatomy.setProbeCompression(k);
    },
    advance() {},
    render() {},
    // A0 de la «GPU»: el gemelo de TS con la misma marcha, más un desplazamiento inyectado de la pleura
    renderer: {
      readPleuraHits: () => {
        const tr = CONVEX_C35;
        const out = new Float32Array(tr.lines * 4);
        const instant = anatomy.instantFor(sample);
        const toMaterial = (p: readonly number[]) => anatomy.deformation.toMaterial([p[0], p[1], p[2]], sample.resp);
        for (let l = 0; l < tr.lines; l++) {
          const theta = -tr.halfSector + (2 * tr.halfSector * (l + 0.5)) / tr.lines;
          const o = pointOnLine(sim.frame, tr, theta, 0);
          const e = pointOnLine(sim.frame, tr, theta, 1);
          const c = pleuraCrossingLine(
            (p) => scene.insideWallMm(toMaterial(p)),
            (p) => scene.lungEdgeMm(toMaterial(p), instant),
            o,
            [e[0] - o[0], e[1] - o[1], e[2] - o[2]],
            DEFAULT_BMODE.depthMm,
            COARSE_DEPTH,
          );
          out.set(c ? [c.D + pleuraShiftMm, c.dz, 0, 3] : [-1, 0, 0, 0], l * 4);
        }
        return out;
      },
    },
  };
  sim.setPose(defaultPose());
  return sim as unknown as Simulator;
}

describe('Gates de equivalencia TS ↔ GLSL (lógica)', () => {
  it('con una «GPU» idéntica, ventanas y volumen dan acuerdo exacto, y el volumen recorre los tejidos del tórax', () => {
    const sim = fakeSim();
    const reports = equivalenceSweep(sim);
    expect(reports.map((r) => r.id)).toEqual(START_POINTS.map((s) => s.id));
    for (const r of reports) expect(r.interiorAgreement).toBe(1);
    const v = volumeEquivalence(sim, 3000);
    expect(v.interiorPoints).toBeGreaterThan(2000);
    expect(v.tissueAgreement).toBe(1);
    // la cara de interfaz de cada punto interior: las capas de la pared y la mitad abdominal del diafragma tienen
    // cara lejos de su borde
    expect(v.interfacePoints).toBeGreaterThan(20);
    expect(v.interfaceAgreement).toBe(1);
    expect(v.interfaceDistanceMaxErr).toBeLessThan(1e-4); // float32
    // el volumen tiene dientes: pulmón, pared, columna y el «resto» bajo el diafragma
    for (const t of ['Lung', 'Fat', 'Muscle', 'Bowel', 'Vertebra']) expect(v.byTissue[t] ?? 0, t).toBeGreaterThan(20);
  });

  it('un defecto localizado (pulmón → «resto» en una esfera de 25 mm) lo detecta el volumen', () => {
    const sim = fakeSim((p, q) =>
      q.tissue === Tissue.Lung && Math.hypot(p[0] + 60, p[1] - 20, p[2] - 80) < 25 ? { tissue: Tissue.Bowel } : {},
    );
    const v = volumeEquivalence(sim, 3000);
    expect(v.tissueAgreement).toBeLessThan(1);
    expect(v.worst).toContain('Lung→Bowel');
  });

  it('la cara y su distancia en el volumen: una capa con otra cara o 0,01 mm de error no pasan', () => {
    const wrongFace = volumeEquivalence(
      fakeSim((_p, q) => (q.interface === Interface.DeepFascia ? { iface: Interface.Scarpa } : {})),
      3000,
    );
    expect(wrongFace.interfaceAgreement).toBeLessThan(1);
    expect(wrongFace.interfaceWorst).toContain('DeepFascia→Scarpa');
    const offset = volumeEquivalence(
      fakeSim((_p, q) => (q.interface !== Interface.None ? { ifd: q.interfaceDistance + 0.01 } : {})),
      3000,
    );
    expect(offset.interfaceAgreement).toBe(1);
    expect(offset.interfaceDistanceMaxErr).toBeGreaterThan(0.009);
  });

  it('la cáscara de las caras cubre las caras de la pared y de las costillas de los planos de partida', () => {
    const r = interfaceShellEquivalence(fakeSim(), 24);
    expect(r.agreement).toBe(1);
    expect(r.distanceMaxErr).toBeLessThan(1e-4);
    expect(r.disagreements).toEqual([]);
    for (const face of WALL_FACES) expect(r.byInterface[face] ?? 0, `${face}: ${JSON.stringify(r.byInterface)}`).toBeGreaterThan(10);
  });

  it('la cáscara ve una GPU sin las caras de la pared, o con la ondulación de la fascia cambiada', () => {
    // decisión 62: sin las caras de la pared, toda la pared quedaría sin eco; con otra ondulación (el
    // gemelo GLSL de `wallDepths` con otra fase), la distancia a la fascia profunda cambiaría
    const none = interfaceShellEquivalence(
      fakeSim((_p, q) => (isWallLayerInterface(q.interface) || isRibInterface(q.interface) ? { iface: Interface.None, ifd: 1e3 } : {})),
      24,
    );
    expect(none.agreement).toBeLessThan(0.9);
    expect(none.disagreements.join('\n')).toMatch(/(SkinFat|Scarpa|DeepFascia|Transversalis)→None/);
    const wavy = interfaceShellEquivalence(
      fakeSim((p, q) => (q.interface === Interface.DeepFascia ? { ifd: Math.abs(q.interfaceDistance - 0.05 * Math.sin(p[2] / 7)) } : {})),
      24,
    );
    expect(wavy.distanceMaxErr).toBeGreaterThan(0.02);
  });

  it('la cáscara ve la cara de la pleura parietal (la cara interna de la pared) cambiada de dueño', () => {
    // en el tórax la cara interna de la pared (Peritoneum en la tabla de VExUS) es la pleura parietal: una GLSL que
    // la dibujara como la transversalis la cambia de dueño en toda la huella del pulmón
    const r = interfaceShellEquivalence(
      fakeSim((_p, q) => (q.interface === Interface.Peritoneum ? { iface: Interface.Transversalis } : {})),
      24,
    );
    expect(r.agreement).toBeLessThan(0.999);
    expect(r.disagreements.join('\n')).toContain('Peritoneum→Transversalis');
  });

  it('la pleura de A0: una «GPU» igual al gemelo acuerda en todas las líneas; 0,05 mm de desplazamiento no pasan', () => {
    const ok = pleuraEquivalence(fakeSim());
    expect(ok.lines).toBe(START_POINTS.length * CONVEX_C35.lines);
    // la pleura parietal se registra en todas las líneas de los tres puntos de partida (el pulmón toca la pared)
    expect(ok.cpuPleura).toBe(ok.lines);
    expect(ok.registrationMismatch).toBe(0);
    // solo el redondeo a float32 de la lectura (la GPU real da 0 en D: la bisección cae en múltiplos exactos del paso)
    expect(ok.depthMaxErrMm).toBeLessThan(1e-4);
    expect(ok.edgeMaxErrMm).toBeLessThan(1e-4);
    for (const id of START_POINTS.map((s) => s.id)) expect(ok.centralDepthMm[id]).toBeGreaterThan(15);
    const shifted = pleuraEquivalence(fakeSim(undefined, 0.05));
    expect(shifted.depthMaxErrMm).toBeCloseTo(0.05, 5);
    expect(shifted.worst).toMatch(/D CPU/);
  });
});
