import { describe, expect, it } from 'vitest';
import {
  FaceTally,
  SHELL_DISTANCE_TOL_MM,
  SHELL_POSITION_ERR_MM,
  equivalenceSweep,
  inspirationSweepPoses,
  interfaceShellEquivalence,
  pleuraEquivalence,
  shellDistanceTolerance,
  shellGradNorm,
  volumeEquivalence,
} from '../app/equivalenceSweep';
import type { Simulator } from '../app/simulator';
import { START_POINTS } from '../app/startPoints';
import { Interface, isRibInterface, isWallLayerInterface } from '../anatomy/interfaces';
import { AnatomyQuery, type WorldQuery } from '../anatomy/query';
import { AnatomyScene } from '../anatomy/scene';
import { Tissue } from '../anatomy/tissues';
import { PhysiologyEngine } from '../physiology/engine';
import { defaultPatient } from '../physiology/patientState';
import { probeContact } from '../probe/contact';
import { CONVEX_C35, clampPose, defaultPose, pointOnLine, type ProbePose } from '../probe/probe';
import { COARSE_DEPTH, DEFAULT_BMODE, type GpuPointQuery } from '../ultrasound/renderer';
import { pleuraCrossingLine } from '../ultrasound/transmission';

type P = [number, number, number];
/** Lo que la «GPU» cambia respecto a la CPU en un punto: tejido, cara o distancia a la cara. */
type Corruption = (p: P, q: WorldQuery) => { tissue?: number; iface?: number; ifd?: number; bd?: number };

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
function fakeSim(corrupt?: Corruption, pleuraShiftMm = 0, sample = new PhysiologyEngine(defaultPatient()).step()): Simulator {
  const patient = defaultPatient();
  const scene = new AnatomyScene(patient);
  const anatomy = new AnatomyQuery(scene);
  const gpuQuery = (pts: Float32Array): GpuPointQuery => {
    const n = pts.length / 3;
    const tissue = new Int32Array(n);
    const vessel = new Int32Array(n).fill(-1);
    const velocity = new Float32Array(n * 3);
    const iface = new Int32Array(n);
    const ifd = new Float32Array(n);
    const bd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p: P = [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]];
      const q = anatomy.classifyWorld(p, sample);
      const bad = corrupt?.(p, q) ?? {};
      tissue[i] = bad.tissue ?? q.tissue;
      iface[i] = bad.iface ?? q.interface;
      ifd[i] = bad.ifd ?? q.interfaceDistance;
      bd[i] = bad.bd ?? q.boundaryDistance;
    }
    return { tissue, vessel, velocity, iface, ifd, bd };
  };
  const sim = {
    scene,
    anatomy,
    sample,
    transducer: CONVEX_C35,
    bmode: DEFAULT_BMODE,
    pose: defaultPose(),
    // (decisión 33) la posición del paciente acota la pose como en el simulador (`Simulator.setPose`)
    patient,
    frame: probeContact(defaultPose(), CONVEX_C35, scene.torso).frame,
    gpuQuery,
    setPose(q: ProbePose) {
      const p = clampPose(q, sim.patient.position ?? 'supine');
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
    // los puntos interiores por tejido suman los interiores (del origen, decisión 81 de VExUS)
    expect(Object.values(v.byTissue).reduce((a, b) => a + b, 0)).toBe(v.interiorPoints);
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

  it('la distancia al borde del tejido (la que funde los bordes en B): exacta con la misma «GPU»; un borde de la pared fuera de sitio no pasa', () => {
    const ok = volumeEquivalence(fakeSim(), 3000);
    expect(ok.boundaryDistanceMaxErr).toBeLessThan(1e-4);
    // la mutación de la revisión: la pared sin borde (bd = 1000) cambia la imagen junto a sus caras
    const wall = volumeEquivalence(
      fakeSim((_p, q) => (q.tissue === Tissue.Fat || q.tissue === Tissue.Muscle ? { bd: 1e3 } : {})),
      3000,
    );
    expect(wall.tissueAgreement).toBe(1);
    expect(wall.boundaryDistanceMaxErr).toBeGreaterThan(2);
    expect(wall.boundaryWorst).toMatch(/^(Fat|Muscle) en /);
  });

  it('la cáscara de las caras cubre las caras de la pared y de las costillas de los planos de partida', () => {
    const r = interfaceShellEquivalence(fakeSim(), 24);
    expect(r.agreement).toBe(1);
    expect(r.distanceMaxErr).toBeLessThan(1e-4);
    expect(r.disagreements).toEqual([]);
    // lus-sim (decisión 17): en la pared torácica el primer plano intermuscular se funde con la fascia profunda (el
    // oblicuo es del abdomen): los planos de partida, todos en el tórax, no lo tienen
    for (const face of WALL_FACES.filter((f) => f !== 'ObliquePlane'))
      expect(r.byInterface[face] ?? 0, `${face}: ${JSON.stringify(r.byInterface)}`).toBeGreaterThan(10);
    expect(r.byInterface.ObliquePlane ?? 0).toBe(0);
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
    expect(wavy.distanceMaxErrOverTol).toBeGreaterThan(1);
  });

  it('la tolerancia de la distancia crece con el gradiente de la cara y no en las zonas planas (decisión 42)', () => {
    expect(shellDistanceTolerance(1)).toBe(SHELL_DISTANCE_TOL_MM);
    expect(shellDistanceTolerance(SHELL_DISTANCE_TOL_MM / SHELL_POSITION_ERR_MM)).toBeCloseTo(SHELL_DISTANCE_TOL_MM, 12);
    expect(shellDistanceTolerance(30)).toBeCloseTo(30 * SHELL_POSITION_ERR_MM, 12);
    // la mutación: 0,05 mm en una cara plana (la fascia profunda, |∇d| ≈ 1) sigue sin pasar
    const flat = interfaceShellEquivalence(
      fakeSim((_p, q) => (q.interface === Interface.DeepFascia ? { ifd: q.interfaceDistance + 0.05 } : {})),
      24,
    );
    expect(flat.distanceMaxErrOverTol, flat.distanceWorstOverTol).toBeGreaterThan(2);
    // el δx de SwiftShader medido (0,00101 y 0,00114 mm, decisión 42), con su margen y no más: con δx × 10 todo pasaría
    expect(SHELL_POSITION_ERR_MM).toBeGreaterThanOrEqual(0.00114);
    expect(SHELL_POSITION_ERR_MM).toBeLessThanOrEqual(0.002);
  });

  /** Una «escena» sintética: una sola cara con la distancia `d(p)` (para `shellGradNorm`, que solo clasifica puntos). */
  const synthetic = (d: (p: readonly number[]) => number): Simulator =>
    ({
      sample: {},
      anatomy: { classifyWorld: (p: readonly number[]) => ({ interface: Interface.Scarpa, interfaceDistance: d(p) }) },
    }) as unknown as Simulator;

  it('|∇d| de una cara lineal, d = 30·z: 30; con él pasa un error de 0,9·δx·30 y no uno de 1,1·δx·30 (decisión 42)', () => {
    // el oráculo es analítico: |∇(30·z + 0,3)| = 30
    const sim = synthetic((p) => 30 * p[2] + 0.3);
    const p = [1, 2, 0];
    const d = 0.3;
    const g = shellGradNorm(sim, p, Interface.Scarpa, d);
    expect(g).toBeCloseTo(30, 6);
    const run = (k: number) => {
      const t = new FaceTally();
      t.add(Interface.Scarpa, d, Interface.Scarpa, d + k * SHELL_POSITION_ERR_MM * 30, 'sintético', () =>
        shellGradNorm(sim, p, Interface.Scarpa, d),
      );
      return t;
    };
    // el error pasa de la tolerancia fija: la escalada entra en juego
    expect(0.9 * SHELL_POSITION_ERR_MM * 30).toBeGreaterThan(SHELL_DISTANCE_TOL_MM);
    expect(run(0.9).maxErrOverTol).toBeCloseTo(0.9, 6);
    expect(run(1.1).maxErrOverTol).toBeCloseTo(1.1, 6);
    expect(run(0.9).maxImpliedDxMm).toBeCloseTo(0.9 * SHELL_POSITION_ERR_MM, 9);
  });

  it('|∇d| junto a un salto de la cara: la pendiente del lado continuo (≈ 1), no la del salto; 0,05 mm no pasan (decisión 42)', () => {
    // d = z + 0,3 hasta z = 0,002 y 50 mm más allá: la diferencia hacia +z cruza el salto, la de −z no
    const sim = synthetic((p) => (p[2] < 0.002 ? p[2] + 0.3 : p[2] + 50.3));
    const p = [0, 0, 0];
    const g = shellGradNorm(sim, p, Interface.Scarpa, 0.3);
    expect(g).toBeCloseTo(1, 6);
    const t = new FaceTally();
    t.add(Interface.Scarpa, 0.3, Interface.Scarpa, 0.35, 'sintético', () => shellGradNorm(sim, p, Interface.Scarpa, 0.3));
    expect(t.maxErrOverTol).toBeCloseTo(0.05 / SHELL_DISTANCE_TOL_MM, 6);
    // y si la cara cambia a los dos lados de un eje, la tolerancia fija
    const other = {
      sample: {},
      anatomy: {
        classifyWorld: (q: readonly number[]) => ({
          interface: q[2] === 0 ? Interface.Scarpa : Interface.DeepFascia,
          interfaceDistance: 0.3 + 40 * Math.abs(q[2]),
        }),
      },
    } as unknown as Simulator;
    expect(shellGradNorm(other, p, Interface.Scarpa, 0.3)).toBe(1);
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
    // los tres puntos de partida y (lus-sim, decisión 18) la ventana cardiaca y el borde del pulmón en la LAM izquierda
    // los puntos de partida, la ventana cardiaca, el borde de la LAM izquierda y (cobertura torácica) la fosa supraclavicular
    expect(ok.lines).toBe((START_POINTS.length + 3) * CONVEX_C35.lines);
    // la pleura parietal se registra en todas las líneas de los tres puntos de partida (el pulmón toca la pared); en la
    // ventana cardiaca, no en su centro
    expect(ok.cpuPleura).toBeGreaterThan(START_POINTS.length * CONVEX_C35.lines);
    expect(ok.cpuPleura).toBeLessThan(ok.lines);
    expect(ok.centralDepthMm.cardiacWindow).toBe(-1);
    expect(ok.registrationMismatch).toBe(0);
    // solo el redondeo a float32 de la lectura (la GPU real da 0 en D: la bisección cae en múltiplos exactos del paso)
    expect(ok.depthMaxErrMm).toBeLessThan(1e-4);
    expect(ok.edgeMaxErrMm).toBeLessThan(1e-4);
    // bajo la pared torácica por región (decisión 17: 13–16 mm en estos puntos; antes, la heredada de 28)
    for (const id of START_POINTS.map((s) => s.id)) expect(ok.centralDepthMm[id]).toBeGreaterThan(10);
    // (decisión 33) los de la espalda, con el paciente sentado: bajo la pared posterior (en supino, la sonda quedaría en el
    // borde de la cama, 1,2π, con la pared lateral de ≈ 15 mm), y el paciente vuelve a su posición
    for (const id of ['posteriorUpper', 'posteriorMiddle', 'posteriorBasal']) expect(ok.centralDepthMm[id], id).toBeGreaterThan(24);
    // el paso final de la bisección con la profundidad del preajuste: 120 mm / 160 / 2⁶ (la cota de la e2e)
    expect(ok.quantumMm).toBeCloseTo(120 / 160 / 64, 12);
    // y si la lectura falla en un punto de la espalda, la posición y la pose vuelven a las de antes (en supino y sentado)
    for (const position of [undefined, 'sitting'] as const) {
      const failing = fakeSim();
      failing.patient.position = position;
      const pose0 = { ...failing.pose };
      const read = failing.renderer.readPleuraHits.bind(failing.renderer);
      failing.renderer.readPleuraHits = () => {
        if (failing.patient.position === 'sitting' && failing.pose.phi > 1.3 * Math.PI) throw new Error('lectura fallida');
        return read();
      };
      expect(() => pleuraEquivalence(failing)).toThrow('lectura fallida');
      expect(failing.patient.position).toBe(position);
      expect(failing.pose).toEqual(pose0);
    }
    const shifted = pleuraEquivalence(fakeSim(undefined, 0.05));
    expect(shifted.depthMaxErrMm).toBeCloseTo(0.05, 5);
    expect(shifted.depthMaxErrMm).toBeGreaterThan(shifted.quantumMm);
    expect(shifted.worst).toMatch(/D CPU/);
  });

  it('en la inspiración profunda, el barrido y el volumen ven una «GPU» con la inversa de VExUS (dos pasos de punto fijo)', () => {
    // lus-sim (decisión 22): la muestra con el diafragma bajado los 53 mm de la base (apnea inspiratoria)
    const deep = new PhysiologyEngine({ ...defaultPatient(), respiratoryPattern: 'apnea-inspiratory' }).step();
    expect(deep.resp.diaphragmCaudalMm).toBe(53);
    const ok = fakeSim(undefined, 0, deep);
    const poses = inspirationSweepPoses(ok.scene);
    expect(poses.map((p) => p.id)).toEqual(['cardiacWindow', 'leftBorder', 'supraclavicular', 'rightCurtain']);
    const good = equivalenceSweep(ok, poses);
    expect(good.map((r) => r.id)).toEqual([
      ...START_POINTS.map((s) => s.id),
      'cardiacWindow',
      'leftBorder',
      'supraclavicular',
      'rightCurtain',
    ]);
    for (const r of good) expect(r.interiorAgreement, r.id).toBe(1);
    // la «GPU» clasifica el punto de los dos pasos de punto fijo desde el mismo punto sin la compresión de la sonda
    const scene = ok.scene;
    const D = deep.resp.diaphragmCaudalMm;
    const instant = { diaphragmCaudalMm: D };
    const bad = fakeSim(
      (_p, q) => {
        const m = q.material;
        const z0 = m[2] - D * scene.respiratoryWeight(m);
        let f: P = [m[0], m[1], z0];
        for (let i = 0; i < 2; i++) f = [m[0], m[1], z0 + D * scene.respiratoryWeight(f)];
        return { tissue: scene.classify(f, instant).tissue };
      },
      0,
      deep,
    );
    // los planos la ven (su acuerdo interior baja de 1: 0,992 en el peor; la e2e exige ≥ 0,99 en ellos) y el volumen, que
    // exige el acuerdo exacto lejos de las interfaces, la rechaza
    const reps = equivalenceSweep(bad, poses);
    expect(Math.min(...reps.map((r) => r.interiorAgreement))).toBeLessThan(1);
    const v = volumeEquivalence(bad, 3000);
    expect(v.tissueAgreement).toBeLessThan(1);
  });
});
