import { describe, expect, it } from 'vitest';
import {
  COMPRESSION_GLSL,
  PROBE_COMPRESSION,
  compressionPlateMm,
  compressionReachMm,
  compressionSample,
  compressionSpanMm,
  uncompress,
  warpAt,
  warpBound,
  warpNormal,
  type ProbeCompression,
} from '../anatomy/compression';
import { torsoDepth, torsoDepthGradient } from '../anatomy/primitives';
import { AnatomyQuery } from '../anatomy/query';
import { AnatomyScene, BASELINE_INSTANT } from '../anatomy/scene';
import { Tissue } from '../anatomy/tissues';
import type { Vec3 } from '../core/vec3';
import { PhysiologyEngine } from '../physiology/engine';
import { defaultPatient } from '../physiology/patientState';
import { CONTACT, contactCoupling, probeContact, type ProbeContact } from '../probe/contact';
import {
  CONVEX_C35,
  clampPose,
  defaultPose,
  lineAngle,
  lineDirection,
  pointOnLine,
  probeFrame,
  type ProbeFrame,
  type ProbePose,
} from '../probe/probe';

/**
 * La sonda comprime el tejido (decisión 63): gemelo TS del campo de compresión y del contacto en los puntos de
 * partida. Todas las pruebas de geometría miden sobre `uncompress` (lo que ve `toMaterial`, en CPU y GPU) con el
 * marco efectivo (la sonda hundida) y comparan con el tronco rígido (`null`, el modelo de `main`), que no cumplía
 * ninguna: la pared en cúpula bajo la huella y los bordes sin acoplar (el hueco ad hoc de `lineCoupling`).
 *
 * lus-sim (decisión 10): el arnés de VExUS sobre vistas del tórax en lugar de sus puntos de partida abdominales
 * (que no se portan): el punto BLUE superior (la pose por omisión), un corte longitudinal del EIC5 en la línea
 * axilar media, el mismo corte en transversal (la pared lateral, la más curva en la sección), uno posterior
 * basal y el simétrico izquierdo del punto BLUE. Las cifras de VExUS se sustituyen por lo medido en estas vistas
 * (26-09-2026), con su margen explicado en cada prueba; las invariantes (solo empuja, sin pliegues) son las mismas.
 */
const scene = new AnatomyScene(defaultPatient());
const torso = scene.torso;
const tr = CONVEX_C35;
const W = compressionPlateMm(torso);

type ViewId = 'blueUpper' | 'lateral' | 'lateralTransverse' | 'posterior' | 'leftUpper';
/** EIC5 en la línea axilar media: entre la 5.ª (z 70) y la 6.ª (z 53) costillas de la escena. */
const EIC5_LAM_Z = 61.5;
const VIEWS: Record<ViewId, ProbePose> = {
  blueUpper: defaultPose(),
  lateral: { phi: Math.PI, z: EIC5_LAM_Z, lift: 0, yaw: 0, rock: 0, tilt: 0 },
  lateralTransverse: { phi: Math.PI, z: EIC5_LAM_Z, lift: 0, yaw: Math.PI / 2, rock: 0, tilt: 0 },
  posterior: { phi: 1.15 * Math.PI, z: 20, lift: 0, yaw: 0, rock: 0, tilt: 0 },
  leftUpper: { ...defaultPose(), phi: Math.PI - defaultPose().phi },
};
const VIEW_IDS = Object.keys(VIEWS) as ViewId[];

function view(id: ViewId, extra: Partial<ProbePose> = {}): { pose: ProbePose; frame: ProbeFrame; k: ProbeContact } {
  const pose = clampPose({ ...VIEWS[id], ...extra });
  const k = probeContact(pose, tr, torso);
  return { pose, frame: k.frame, k };
}
/** Profundidad bajo la cara (mm) a la que la línea θ cruza la capa de profundidad radial w, con la compresión k. */
function levelDepth(frame: ProbeFrame, k: ProbeCompression | null, theta: number, w: number): number {
  for (let d = -2; d <= 160; d += 0.05) if (-torsoDepth(uncompress(pointOnLine(frame, tr, theta, d), k), torso) >= w) return d;
  return Number.NaN;
}
/** Líneas acopladas (contacto ≥ `min`). */
function coupledLines(k: ProbeCompression, min = 0.5): number[] {
  const out: number[] = [];
  for (let i = 0; i < tr.lines; i++) if (contactCoupling(k, lineAngle(i, tr)) >= min) out.push(i);
  return out;
}
const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
/** Ángulo (°) entre una normal y la línea, en el plano de imagen (la compresión es plana en elevación). */
function inPlaneAngleDeg(frame: ProbeFrame, n: Vec3, dir: Vec3): number {
  const e = frame.elevation;
  const en = n[0] * e[0] + n[1] * e[1] + n[2] * e[2];
  const q: Vec3 = [n[0] - en * e[0], n[1] - en * e[1], n[2] - en * e[2]];
  return (Math.acos(Math.min(1, Math.abs(q[0] * dir[0] + q[1] * dir[1] + q[2] * dir[2]) / Math.hypot(...q))) * 180) / Math.PI;
}
/** Distancia material al eje de curvatura en el plano de la cara (la coordenada radial de `uncompress`). */
function materialRadius(frame: ProbeFrame, m: Vec3): number {
  const C = frame.curvatureCenter;
  const q: Vec3 = [m[0] - C[0], m[1] - C[1], m[2] - C[2]];
  const e = frame.elevation;
  const qe = q[0] * e[0] + q[1] * e[1] + q[2] * e[2];
  return Math.hypot(q[0] - qe * e[0], q[1] - qe * e[1], q[2] - qe * e[2]);
}

describe('la sonda comprime el tejido (decisión 63): solo empuja y la pared bajo las líneas acopladas queda paralela a la cara', () => {
  // Medido (26-09-2026; líneas acopladas de 192 y la cara interna de la pared, la pleura, bajo ellas): punto BLUE
  // 192, 25,25–29,00 mm; lateral 192, 28,00–29,05; transversal 116 (±20,5°), 28,00–29,00; posterior 192,
  // 26,40–29,05; izquierdo 192, 25,25–29,00. El tronco rígido bajo las mismas líneas: una cúpula de 15 mm. Lo que
  // queda de variación es la métrica radial de las capas en el tronco elíptico: a φ = 3π/4 la pared mide 25,2 mm
  // por la normal de la piel y 28 en la radial (la de la anatomía), así que la cara interna no es paralela a la
  // piel en ninguna vista oblicua a los ejes de la elipse. Umbrales: lo medido con ≈ 0,3 mm de margen.
  const cases: Array<[ViewId, number, number]> = [
    ['blueUpper', 192, 4],
    ['lateral', 192, 1.4],
    ['lateralTransverse', 110, 1.4],
    ['posterior', 192, 3],
    ['leftUpper', 192, 4],
  ];
  it.each(cases)(
    '%s: ≥ %s líneas acopladas; bajo ellas la piel en la cara y cada capa de la pared a la misma profundidad (cara interna ≤ %s mm)',
    (id, minLines, maxSpread) => {
      const { frame, k } = view(id);
      const lines = coupledLines(k);
      expect(lines.length, id).toBeGreaterThanOrEqual(minLines);
      const at = (kk: ProbeCompression | null, w: number) => lines.map((i) => levelDepth(frame, kk, lineAngle(i, tr), w));
      const skin = at(k, 0);
      const mid = at(k, W / 2);
      const inner = at(k, W);
      const innerRigid = at(null, W);
      const tag = `${id}: piel ${Math.min(...skin).toFixed(2)}–${Math.max(...skin).toFixed(2)}, media pared Δ ${spread(mid).toFixed(2)}, cara interna ${Math.min(...inner).toFixed(2)}–${Math.max(...inner).toFixed(2)} (rígido Δ ${spread(innerRigid).toFixed(1)})`;
      // la piel llega a la cara (el gel salva lo que falte en las líneas de transición)
      for (const d of skin) expect(Math.abs(d), tag).toBeLessThan(0.5);
      // ninguna capa de la pared se dobla alejándose de la cara bajo una línea acoplada: todas quedan a su
      // profundidad (la cara interna a W … W + tolerancia + la mitad de la rampa)
      expect(spread(mid), tag).toBeLessThanOrEqual(maxSpread);
      expect(spread(inner), tag).toBeLessThanOrEqual(maxSpread);
      expect(Math.max(...inner), tag).toBeLessThanOrEqual(W + CONTACT.wallTolMm + CONTACT.wallRampMm);
      // el tronco rígido (sin compresión): la cúpula
      expect(spread(innerRigid), tag).toBeGreaterThan(8);
    },
  );

  it('en el mundo la normal de las capas de la pared apunta a lo largo de la línea bajo las líneas de contacto pleno', () => {
    // piel, media pared y cara interna, en el plano de imagen, por la jacobiana (J^T de la inversa). Medido: ≤ 10,5°
    // (BLUE e izquierdo), 5,1° (lateral), 9,0° (transversal) y 8,4° (posterior); rígido 34–49°. La tabla es lineal
    // entre nodos (la pendiente de las capas oscila con el periodo de un nodo) y en las vistas oblicuas a los ejes
    // de la elipse queda la inclinación de la métrica radial. Umbrales: lo medido más ≈ 0,5°
    const limit: Record<ViewId, number> = { blueUpper: 11, lateral: 5.6, lateralTransverse: 9.5, posterior: 9, leftUpper: 11 };
    for (const id of VIEW_IDS) {
      const { frame, k } = view(id);
      let worst = 0;
      let worstRigid = 0;
      for (const i of coupledLines(k, 0.99)) {
        const th = lineAngle(i, tr);
        const dir = lineDirection(frame, th);
        for (const w of [0.5, W / 2, W - 0.5]) {
          const p = pointOnLine(frame, tr, th, levelDepth(frame, k, th, w));
          worst = Math.max(worst, inPlaneAngleDeg(frame, warpNormal(warpAt(p, k), torsoDepthGradient(uncompress(p, k), torso)), dir));
          const pr = pointOnLine(frame, tr, th, levelDepth(frame, null, th, w));
          worstRigid = Math.max(worstRigid, inPlaneAngleDeg(frame, torsoDepthGradient(pr, torso), dir));
        }
      }
      const tag = `${id}: ≤ ${worst.toFixed(2)}° (rígido ${worstRigid.toFixed(1)}°)`;
      expect(worst, tag).toBeLessThan(limit[id]);
      expect(worstRigid, tag).toBeGreaterThan(15);
    }
  });

  it('solo empuja y solo comprime a lo largo de la línea: s ≤ 0 y dr/dd ≥ 1 en un barrido de poses (sin pliegues ni estiramiento)', () => {
    // por construcción s_D ≥ s₀, s_D ≤ 0 y la caída multiplica s_D por algo decreciente; el barrido lo comprueba
    // en la tabla real (presión, flotación, basculación, inclinación y giro), en el plano y a ±3 mm de él. El
    // estiramiento radial (mundo/material) es 1/(dr/dd) ≤ 1. Son invariantes: el umbral es el de la física
    let worstRate = Infinity;
    let maxShift = -Infinity;
    let maxPush = 0;
    let where = '';
    for (const id of VIEW_IDS)
      for (const lift of [-6, -2, 0, 2])
        for (const rock of [-0.5, 0, 0.5])
          for (const tilt of [-0.4, 0, 0.4]) {
            const { frame, k } = view(id, { lift, rock, tilt });
            maxPush = Math.max(maxPush, -Math.min(...k.nodes.map((n) => n[0])));
            for (let i = 0; i < tr.lines; i += 12)
              for (const e of [-3, 0, 3]) {
                let prev = -Infinity;
                for (let d = -3; d < k.reachMm + 5; d += 0.5) {
                  const p0 = pointOnLine(frame, tr, lineAngle(i, tr), d);
                  const p: Vec3 = [p0[0] + frame.elevation[0] * e, p0[1] + frame.elevation[1] * e, p0[2] + frame.elevation[2] * e];
                  const c = compressionSample(p, k);
                  maxShift = Math.max(maxShift, c.shift);
                  const r = materialRadius(frame, uncompress(p, k));
                  if (prev > -Infinity && (r - prev) / 0.5 < worstRate) {
                    worstRate = (r - prev) / 0.5;
                    where = `${id} lift ${lift} rock ${rock} tilt ${tilt} línea ${i} e ${e} d ${d}`;
                  }
                  prev = r;
                }
              }
          }
    expect(maxShift).toBeLessThanOrEqual(0);
    expect(worstRate, where).toBeGreaterThanOrEqual(1 - 1e-6);
    // el empuje de la piel (a lo largo de la línea) queda lejos del eje de curvatura (R = 60 mm)
    expect(maxPush).toBeLessThan(0.6 * tr.curvatureRadius);
  });

  it('acoplamiento = contacto conseguido: entero en los cortes longitudinales; en el transversal, los bordes sin acoplar y con transición suave', () => {
    // Medido: los cortes longitudinales acoplan las 192 líneas (≥ 0,99); en el transversal de la pared lateral (la
    // sección del tronco, de 69 mm de radio ahí) la pared de los bordes, más allá de ±20,5°, no queda paralela ni
    // con la presión máxima, como en la intercostal de VExUS
    for (const id of ['blueUpper', 'lateral', 'posterior', 'leftUpper'] as const) {
      const { k } = view(id);
      for (let i = 0; i < tr.lines; i++) expect(contactCoupling(k, lineAngle(i, tr)), `${id} línea ${i}`).toBeGreaterThan(0.99);
    }
    {
      const { k } = view('lateralTransverse');
      const c = Array.from({ length: tr.lines }, (_, i) => contactCoupling(k, lineAngle(i, tr)));
      // un solo tramo acoplado que contiene el centro
      const on = c.map((x) => x >= 0.5);
      const edges = on.slice(1).filter((x, i) => x !== on[i]).length;
      expect(on[tr.lines / 2]).toBe(true);
      expect(edges).toBeLessThanOrEqual(2);
      expect(on[0]).toBe(false);
      expect(on[tr.lines - 1]).toBe(false);
      // la transición ocupa unas líneas, sin saltos de más de 0,25 entre dos (medido 0,16)
      let jump = 0;
      for (let i = 1; i < tr.lines; i++) jump = Math.max(jump, Math.abs(c[i] - c[i - 1]));
      expect(jump).toBeLessThan(0.25);
    }
    const mean = (k: ProbeCompression) => {
      let c = 0;
      for (let i = 0; i < tr.lines; i++) c += contactCoupling(k, lineAngle(i, tr)) / tr.lines;
      return c;
    };
    // apretar ensancha el contacto; flotar sobre la piel lo quita (el gel salva ~2 mm)
    expect(mean(view('lateralTransverse', { lift: -3 }).k)).toBeGreaterThan(mean(view('lateralTransverse').k) + 0.02);
    const hover = mean(view('lateral', { lift: 2 }).k);
    expect(hover).toBeGreaterThan(0.05);
    expect(hover).toBeLessThan(0.7);
    expect(mean(view('lateral', { lift: CONTACT.gelMm + CONTACT.gelRampMm + 0.1 }).k)).toBe(0);
  });

  it('apretar acerca el campo cercano a la sonda: la cara se hunde δ y lo hondo aparece hasta δ mm menos profundo', () => {
    // δ medido: 11,4 (BLUE e izquierdo), 14,2 (lateral), 16,0 (transversal, el tope) y 12,6 (posterior). La
    // estructura honda de la línea central de las vistas anteriores: la vértebra, a ~147 mm
    for (const id of VIEW_IDS) {
      const { pose, frame, k } = view(id);
      const rigid = probeFrame(pose, torso, tr);
      const d = k.summary.indentMm;
      expect(d, id).toBeGreaterThan(10);
      expect(d, id).toBeLessThanOrEqual(k.summary.capacityMm);
      const moved = [0, 1, 2].map((a) => rigid.face[a] - frame.face[a]);
      // a lo largo del eje de la sonda: el mismo plano de imagen, con el origen más abajo en la línea central
      for (let a = 0; a < 3; a++) expect(moved[a], id).toBeCloseTo(-rigid.axial[a] * d, 9);
    }
    for (const id of ['blueUpper', 'leftUpper'] as const) {
      const { pose, frame, k } = view(id);
      const rigid = probeFrame(pose, torso, tr);
      const d = k.summary.indentMm;
      const depthOf = (fr: ProbeFrame, kk: ProbeCompression | null): number => {
        for (let r = 30; r < 180; r += 0.25)
          if (scene.classify(uncompress(pointOnLine(fr, tr, 0, r), kk), BASELINE_INSTANT).tissue === Tissue.Vertebra) return r;
        return Number.NaN;
      };
      const before = depthOf(rigid, null);
      const after = depthOf(frame, k);
      const tag = `${id}: ${before.toFixed(1)} → ${after.toFixed(1)} mm (δ ${d.toFixed(1)})`;
      expect(before - after, tag).toBeLessThan(d + 1);
      expect(before - after, tag).toBeGreaterThan(0.5 * d);
    }
  });

  it('lo hondo: más allá del alcance nada se mueve; a más de 60 mm, menos que la cara', () => {
    // alcance medido: 94 (BLUE e izquierdo), 113 (lateral), 124 (transversal) y 102 mm (posterior); el tejido a más
    // de 60 mm (pulmón, el «resto») se mueve menos que la cara: el empuje se apaga bajo la pared
    for (const id of VIEW_IDS) {
      const { frame, k } = view(id);
      expect(k.reachMm, id).toBeLessThan(180);
      let worst = 0;
      let n = 0;
      for (let i = 0; i < tr.lines; i += 3)
        for (let d = 60; d <= 180; d += 1.5)
          for (const e of [-2, 0, 2]) {
            const p0 = pointOnLine(frame, tr, lineAngle(i, tr), d);
            const p: Vec3 = [p0[0] + frame.elevation[0] * e, p0[1] + frame.elevation[1] * e, p0[2] + frame.elevation[2] * e];
            const m = uncompress(p, k);
            if (d >= k.reachMm) expect(m, `${id} ${d}`).toEqual(p);
            n++;
            worst = Math.max(worst, Math.hypot(m[0] - p[0], m[1] - p[1], m[2] - p[2]));
          }
      expect(n, id).toBeGreaterThan(200);
      expect(worst, id).toBeLessThan(0.8 * k.summary.indentMm);
    }
  });

  it('con la sonda levantada no hay contacto ni deformación: la identidad exacta', () => {
    for (const id of VIEW_IDS)
      for (const lift of [12, 20]) {
        const { frame, k } = view(id, { lift });
        expect(k.summary.indentMm).toBe(0);
        expect(k.contact.every((c) => c === 0) && k.nodes.every((n) => n[0] === 0 && n[1] === 0), `${id} a ${lift} mm`).toBe(true);
        for (let i = 0; i < tr.lines; i += 7)
          for (let d = -5; d < 120; d += 3.1) {
            const p = pointOnLine(frame, tr, lineAngle(i, tr), d);
            expect(uncompress(p, k)).toEqual(p);
          }
      }
  });
});

describe('gemelo del campo y de su jacobiana (TS = GLSL)', () => {
  // la vista con la compresión más asimétrica del tórax: el transversal de la pared lateral, con los bordes sin
  // acoplar y el empuje al tope (en VExUS, la subxifoidea basculada)
  const { frame, k } = view('lateralTransverse', { rock: 0.3 });

  it('el gradiente analítico de s es el de las diferencias centrales dentro de la media huella elevacional', () => {
    let worst = 0;
    for (let th = -0.7; th <= 0.7; th += 0.017)
      for (let d = -5; d < 100; d += 1.37)
        for (const e of [-k.halfElevationMm, -2, 0, 3, k.halfElevationMm]) {
          const p0 = pointOnLine(frame, tr, th, d);
          const p: Vec3 = [p0[0] + frame.elevation[0] * e, p0[1] + frame.elevation[1] * e, p0[2] + frame.elevation[2] * e];
          const w = warpAt(p, k);
          const h = 1e-4;
          for (let a = 0; a < 3; a++) {
            const pp: Vec3 = [p[0], p[1], p[2]];
            const pm: Vec3 = [p[0], p[1], p[2]];
            pp[a] += h;
            pm[a] -= h;
            const num = (compressionSample(pp, k).shift - compressionSample(pm, k).shift) / (2 * h);
            worst = Math.max(worst, Math.abs(num - w.grad[a]));
          }
          expect(w.shift).toBeCloseTo(compressionSample(p, k).shift, 10);
        }
    // la tabla es lineal a tramos: junto a un nodo la diferencia central promedia las dos pendientes
    expect(worst).toBeLessThan(1e-3);
  });

  it('warpNormal es el gradiente en el mundo de un campo material (J^T), y warpBound lo acota', () => {
    for (const th of [-0.5, -0.2, 0, 0.3, 0.55])
      for (const d of [0.5, 9, 20, 27, 40, 55]) {
        const p = pointOnLine(frame, tr, th, d);
        const w = warpAt(p, k);
        const n = torsoDepthGradient(uncompress(p, k), torso);
        const got = warpNormal(w, n);
        const h = 1e-4;
        for (let a = 0; a < 3; a++) {
          const pp: Vec3 = [p[0], p[1], p[2]];
          const pm: Vec3 = [p[0], p[1], p[2]];
          pp[a] += h;
          pm[a] -= h;
          const num = (torsoDepth(uncompress(pp, k), torso) - torsoDepth(uncompress(pm, k), torso)) / (2 * h);
          expect(Math.abs(num - got[a]), `θ ${th} d ${d} eje ${a}`).toBeLessThan(2e-3);
        }
        expect(Math.hypot(...got)).toBeLessThanOrEqual(Math.hypot(...n) * warpBound(w) + 1e-9);
      }
  });

  it('toWorld deshace toMaterial con la compresión y la respiración', () => {
    const q = new AnatomyQuery(scene);
    q.setProbeCompression(k);
    expect(q.probeCompression).toBe(k);
    const resp = new PhysiologyEngine(defaultPatient()).step().resp;
    for (const th of [-0.5, 0, 0.4])
      for (const d of [-2, 3, 17, 33, 51, 90]) {
        const p = pointOnLine(frame, tr, th, d);
        const back = q.deformation.toWorld(q.deformation.toMaterial(p, resp), resp);
        expect(Math.hypot(back[0] - p[0], back[1] - p[1], back[2] - p[2])).toBeLessThan(1e-3);
      }
  });

  it('la GLSL lleva las mismas constantes y funciones', () => {
    const c = PROBE_COMPRESSION;
    expect(COMPRESSION_GLSL).toContain(`#define COMP_NODES ${c.nodes}`);
    expect(COMPRESSION_GLSL).toContain(`#define COMP_DECAY_MM ${c.decayMm.toFixed(4)}`);
    expect(COMPRESSION_GLSL).toContain(`#define COMP_SPAN_PER_SHIFT ${c.decaySpanPerShift.toFixed(4)}`);
    expect(COMPRESSION_GLSL).toContain(`#define COMP_LAT_TAPER ${c.lateralTaperSin.toFixed(4)}`);
    expect(COMPRESSION_GLSL).toContain(`#define COMP_ELEV_TAPER ${c.elevationTaperMm.toFixed(4)}`);
    for (const fn of ['compressionSample', 'uncompress', 'warpAt', 'warpNormal', 'warpBound'])
      expect(COMPRESSION_GLSL, fn).toMatch(new RegExp(`\\b${fn}\\(`));
    // sin atan (el arranque con SwiftShader) y sin indexado dinámico de uniforms: la tabla va en la textura de escena
    // (la textura, los uniforms y toMaterial del shader ensamblado vuelven en el paso B)
    expect(COMPRESSION_GLSL.replace(/\/\/.*$/gm, '')).not.toMatch(/\batan\s*\(/);
    expect(COMPRESSION_GLSL).toContain('sceneTexel(COMP_BASE + i)');
    expect(COMPRESSION_GLSL).toContain('float g = compressionProfile(rho - v.w, v.xyz, gd, gp);');
    // el alcance: el máximo de D + S en la tabla, y s = 0 a partir de él
    expect(k.reachMm).toBe(Math.max(...k.nodes.map((n) => n[2] + compressionSpanMm(n[1]))));
    expect(compressionReachMm(k.nodes)).toBe(k.reachMm);
  });
});
