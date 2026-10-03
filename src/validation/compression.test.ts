import { describe, expect, it } from 'vitest';
import { ANATOMY_GLSL, COMPRESSION_BASE, SCENE_TEX_H, SCENE_TEX_W } from '../anatomy/gpu/anatomy.glsl';
import { SCENE_UNIFORMS } from '../anatomy/gpu/sceneUniforms';
import {
  COMPRESSION_GLSL,
  PROBE_COMPRESSION,
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
import { intercostalZ } from './support/chestView';
import { Tissue } from '../anatomy/tissues';
import type { Vec3 } from '../core/vec3';
import { PhysiologyEngine } from '../physiology/engine';
import { defaultPatient } from '../physiology/patientState';
import { CONTACT, contactCoupling, probeContact, type ProbeContact } from '../probe/contact';
import {
  CONVEX_C35,
  clampPose,
  lineAngle,
  lineDirection,
  pointOnLine,
  probeFrame,
  type ProbeFrame,
  type ProbePose,
} from '../probe/probe';
import { measurementViewPose } from '../app/measurementViews';

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
/**
 * lus-sim (decisión 17): la pared torácica cambia por región, así que cada capa se mide a su fracción del grosor de la pared
 * del punto (`wallThicknessAt`): la media pared y la cara interna, la pleura parietal. En el tronco uniforme de VExUS era
 * un grosor fijo (`compressionPlateMm`, que sigue siendo el de la pared del abdomen).
 */
const wallAt = (m: Vec3): number => scene.wallThicknessAt(m);

type ViewId = 'blueUpper' | 'lateral' | 'lateralTransverse' | 'posterior' | 'leftUpper';
/** EIC5 en la línea axilar media, entre la 5.ª y la 6.ª costillas de la parrilla (decisión 16). */
const EIC5_LAM_Z = intercostalZ(scene, 5, Math.PI);
const VIEWS: Record<ViewId, ProbePose> = {
  // (decisión 42) la vista de medida del BLUE superior (el EIC2 de la LMC), donde se midió la compresión (decisión 63); en el BLUE
  // superior clínico, junto a la cúpula, la cara interna de la pared varía 3,05 mm bajo la cara (`wall-cupola-transition`)
  blueUpper: measurementViewPose('blueUpper'),
  lateral: { phi: Math.PI, z: EIC5_LAM_Z, lift: 0, yaw: 0, rock: 0, tilt: 0 },
  lateralTransverse: { phi: Math.PI, z: EIC5_LAM_Z, lift: 0, yaw: Math.PI / 2, rock: 0, tilt: 0 },
  posterior: { phi: 1.15 * Math.PI, z: 20, lift: 0, yaw: 0, rock: 0, tilt: 0 },
  leftUpper: { ...measurementViewPose('blueUpper'), phi: Math.PI - measurementViewPose('blueUpper').phi },
};
const VIEW_IDS = Object.keys(VIEWS) as ViewId[];

function view(id: ViewId, extra: Partial<ProbePose> = {}): { pose: ProbePose; frame: ProbeFrame; k: ProbeContact } {
  const pose = clampPose({ ...VIEWS[id], ...extra });
  const k = probeContact(pose, tr, torso);
  return { pose, frame: k.frame, k };
}
/**
 * Profundidad bajo la cara (mm) a la que la línea θ cruza la capa a la fracción `f` del grosor de la pared (0 la piel, 1 la
 * cara interna), con la compresión k; o, con `f` > 1, la profundidad radial fija f − 1 (mm; la de las capas cercanas).
 */
function levelDepth(frame: ProbeFrame, k: ProbeCompression | null, theta: number, f: number): number {
  for (let d = -2; d <= 160; d += 0.05) {
    const m = uncompress(pointOnLine(frame, tr, theta, d), k);
    if (-torsoDepth(m, torso) >= (f > 1 ? f - 1 : f * wallAt(m))) return d;
  }
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
  // Medido (27-09-2026, con la pared torácica por región, decisión 17; líneas acopladas de 192 y la cara interna de la pared,
  // la pleura, bajo ellas, frente al grosor de la pared en su punto): punto BLUE 192, −1,55…+1,05 mm; lateral 192,
  // 0,01…1,25; transversal 142, 0,02…1,78; posterior 192, −0,88…1,11; izquierdo 192, como el BLUE. El tronco rígido bajo
  // las mismas líneas: una cúpula de 13–19 mm. Lo que queda de variación es la métrica radial de las capas en el tronco
  // elíptico (a φ = 3π/4 la normal de la piel no es radial) y, en la pared por región, que el contacto toma el grosor de
  // la pared donde cada línea entra en la piel y la cara interna lo toma en su propio punto. Umbrales: lo medido con
  // ≈ 0,3 mm de margen.
  const cases: Array<[ViewId, number, number]> = [
    ['blueUpper', 192, 3],
    ['lateral', 192, 1.6],
    ['lateralTransverse', 110, 2.1],
    ['posterior', 192, 2.3],
    ['leftUpper', 192, 3],
  ];
  it.each(cases)(
    '%s: ≥ %s líneas acopladas; bajo ellas la piel en la cara y cada capa de la pared a la misma profundidad (cara interna ≤ %s mm)',
    (id, minLines, maxSpread) => {
      const { frame, k } = view(id);
      const lines = coupledLines(k);
      expect(lines.length, id).toBeGreaterThanOrEqual(minLines);
      const at = (kk: ProbeCompression | null, f: number) => lines.map((i) => levelDepth(frame, kk, lineAngle(i, tr), f));
      const skin = at(k, 0);
      // lo que cada capa se aparta de su profundidad (la fracción de la pared del punto de cruce, en la radial)
      const off = (kk: ProbeCompression | null, f: number) =>
        lines.map((i) => {
          const d = levelDepth(frame, kk, lineAngle(i, tr), f);
          return d - f * wallAt(uncompress(pointOnLine(frame, tr, lineAngle(i, tr), d), kk));
        });
      const mid = off(k, 0.5);
      const inner = off(k, 1);
      const innerRigid = at(null, 1);
      const W = k.plateMm;
      const tag = `${id}: piel ${Math.min(...skin).toFixed(2)}–${Math.max(...skin).toFixed(2)}, media pared Δ ${spread(mid).toFixed(2)}, cara interna −W ${Math.min(...inner).toFixed(2)}–${Math.max(...inner).toFixed(2)} (W ${W.toFixed(1)}; rígido Δ ${spread(innerRigid).toFixed(1)})`;
      // la piel llega a la cara (el gel salva lo que falte en las líneas de transición)
      for (const d of skin) expect(Math.abs(d), tag).toBeLessThan(0.5);
      // ninguna capa de la pared se dobla alejándose de la cara bajo una línea acoplada: todas quedan a su
      // profundidad (la cara interna a W … W + tolerancia + la mitad de la rampa)
      expect(spread(mid), tag).toBeLessThanOrEqual(maxSpread);
      expect(spread(inner), tag).toBeLessThanOrEqual(maxSpread);
      expect(Math.max(...inner), tag).toBeLessThanOrEqual(CONTACT.wallTolMm + CONTACT.wallRampMm);
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
        for (const f of [1.5, 0.5, 0.97]) {
          const p = pointOnLine(frame, tr, th, levelDepth(frame, k, th, f));
          worst = Math.max(worst, inPlaneAngleDeg(frame, warpNormal(warpAt(p, k), torsoDepthGradient(uncompress(p, k), torso)), dir));
          const pr = pointOnLine(frame, tr, th, levelDepth(frame, null, th, f));
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

  it('lo hondo: más allá del alcance nada se mueve; el pulmón y el «resto» a más de 60 mm, menos que la cara', () => {
    // alcance medido: 94 (BLUE e izquierdo), 113 (lateral), 124 (transversal) y 102 mm (posterior); el tejido hondo
    // a más de 60 mm (pulmón, el «resto») se mueve menos que la cara: el empuje se apaga bajo la pared. Como en
    // VExUS (sus vasos y el riñón), el desplazamiento y su cuenta son solo de ese tejido, no de la pared del otro
    // lado ni de la columna; la identidad más allá del alcance vale para toda muestra y lleva su propia cuenta
    for (const id of VIEW_IDS) {
      const { frame, k } = view(id);
      expect(k.reachMm, id).toBeLessThan(180);
      let worst = 0;
      let deep = 0;
      let beyond = 0;
      for (let i = 0; i < tr.lines; i += 3)
        for (let d = 60; d <= 180; d += 1.5)
          for (const e of [-2, 0, 2]) {
            const p0 = pointOnLine(frame, tr, lineAngle(i, tr), d);
            const p: Vec3 = [p0[0] + frame.elevation[0] * e, p0[1] + frame.elevation[1] * e, p0[2] + frame.elevation[2] * e];
            const m = uncompress(p, k);
            if (d >= k.reachMm) {
              expect(m, `${id} ${d}`).toEqual(p);
              beyond++;
            }
            const t = scene.classify(m, BASELINE_INSTANT).tissue;
            if (t !== Tissue.Lung && t !== Tissue.Bowel) continue;
            deep++;
            worst = Math.max(worst, Math.hypot(m[0] - p[0], m[1] - p[1], m[2] - p[2]));
          }
      // medido el 26-09-2026: 9825–15 318 muestras hondas y 7296–11 136 más allá del alcance por vista; el tejido
      // hondo se movió 0,49 (BLUE e izquierdo), 0,68 (lateral), 0,74 (transversal) y 0,58 (posterior) del
      // hundimiento. Las cuentas mínimas solo fallan si una vista deja de ver tejido hondo o el alcance crece
      expect(deep, id).toBeGreaterThan(5000);
      expect(beyond, id).toBeGreaterThan(5000);
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

  it('la GLSL lleva las mismas constantes y funciones, y toMaterial deshace la compresión antes que la respiración', () => {
    const c = PROBE_COMPRESSION;
    expect(COMPRESSION_GLSL).toContain(`#define COMP_NODES ${c.nodes}`);
    expect(COMPRESSION_GLSL).toContain(`#define COMP_DECAY_MM ${c.decayMm.toFixed(4)}`);
    expect(COMPRESSION_GLSL).toContain(`#define COMP_SPAN_PER_SHIFT ${c.decaySpanPerShift.toFixed(4)}`);
    expect(COMPRESSION_GLSL).toContain(`#define COMP_LAT_TAPER ${c.lateralTaperSin.toFixed(4)}`);
    expect(COMPRESSION_GLSL).toContain(`#define COMP_ELEV_TAPER ${c.elevationTaperMm.toFixed(4)}`);
    for (const fn of ['compressionSample', 'uncompress', 'warpAt', 'warpNormal', 'warpBound'])
      expect(COMPRESSION_GLSL, fn).toMatch(new RegExp(`\\b${fn}\\(`));
    expect(ANATOMY_GLSL).toContain(COMPRESSION_GLSL);
    // (lus-sim, decisión 22: la respiración, la bisección en la vertical de q)
    expect(ANATOMY_GLSL).toMatch(
      /vec3 toMaterial\(vec3 p\) \{\n\s+vec3 q = uncompress\(p\);\n\s+float D = uResp\.x;\n\s+if \(D <= 0\.0\) return q;\n\s+RespCol c = respColumn\(q\);/,
    );
    // sin atan (el arranque con SwiftShader) y sin indexado dinámico de uniforms: la tabla va en la textura de escena
    expect(COMPRESSION_GLSL.replace(/\/\/.*$/gm, '')).not.toMatch(/\batan\s*\(/);
    expect(COMPRESSION_GLSL).toContain('sceneTexel(COMP_BASE + i)');
    // lus-sim (decisión 12): sin tubos, la tabla es lo único de la textura de escena y empieza en su primer téxel
    expect(ANATOMY_GLSL).toContain(`#define COMP_BASE ${COMPRESSION_BASE}`);
    expect(COMPRESSION_BASE).toBe(0);
    expect(SCENE_TEX_W * SCENE_TEX_H).toBeGreaterThanOrEqual(COMPRESSION_BASE + c.nodes);
    // el esquema único sube el marco (tres vec4) con R + alcance en uCompC.w; sin compresión, uCompC.w = 0 (la
    // GLSL no desplaza nada). El radio viaja en la tabla (su .w)
    const names = SCENE_UNIFORMS.map((u) => u.name);
    expect(names).toEqual(expect.arrayContaining(['uCompC', 'uCompAx', 'uCompLat']));
    const ctx = { sample: null as never, compression: null };
    expect(Array.from(SCENE_UNIFORMS.find((u) => u.name === 'uCompC')!.value(scene, ctx))[3]).toBe(0);
    const withK = { ...ctx, compression: k };
    expect(Array.from(SCENE_UNIFORMS.find((u) => u.name === 'uCompC')!.value(scene, withK))[3]).toBeCloseTo(k.radiusMm + k.reachMm, 4);
    expect(Array.from(SCENE_UNIFORMS.find((u) => u.name === 'uCompAx')!.value(scene, withK))[3]).toBeCloseTo(Math.sin(k.halfAngle), 12);
    expect(COMPRESSION_GLSL).toContain('float g = compressionProfile(rho - v.w, v.xyz, gd, gp);');
    // el alcance: el máximo de D + S en la tabla, y s = 0 a partir de él
    expect(k.reachMm).toBe(Math.max(...k.nodes.map((n) => n[2] + compressionSpanMm(n[1]))));
    expect(compressionReachMm(k.nodes)).toBe(k.reachMm);
  });
});
