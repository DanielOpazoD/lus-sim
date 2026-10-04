import { chai, describe, expect, it } from 'vitest';
import { wallColumnTexel } from '../anatomy/organs/chestWall';
import { LIVER, RENAL_IMPRESSION_ROUND_MM, liverEdgeZ } from '../anatomy/organs/liver';
import { perirenalDistance, renalImpression } from '../anatomy/organs/kidney';
import { lungBorderAt } from '../anatomy/organs/lungBorder';
import { probeHitPoint, ribLineArc, ribTableZ, spinousTipZ } from '../anatomy/organs/ribcage';
import { SPLEEN, SPLEEN_GASTRIC_ACROSS, buildSpleen, costalMarginZ, pointAtArc, spleenBelowMarginMm } from '../anatomy/organs/spleen';
import { wallArc } from '../anatomy/organs/wall';
import { torsoSkinPoint } from '../anatomy/primitives';
import { AnatomyScene, BASELINE_INSTANT } from '../anatomy/scene';
import { thoraxLinePhi, type ThoraxLine } from '../anatomy/thoraxLines';
import { Tissue } from '../anatomy/tissues';
import { probeCenterContent } from '../app/coverage';
import { CONVEX_C35, type ProbePose } from '../probe/probe';
import { icsCenter } from '../app/equivalenceSweep';
import type { Vec3 } from '../core/vec3';
import { defaultPatient } from '../physiology/patientState';
import { DIAPHRAGM_EXCURSION } from '../physiology/respiratory';

/**
 * El hígado y el bazo bajo las cúpulas (lus-sim, decisión 37), frente a la base: Gray («Surface Markings of the Abdomen», «The
 * Liver», «The Spleen»), Kratzer y cols. (el hígado en la LMC por ecografía), Vauthey y cols. (el volumen por TAC) y Chow y cols.
 * (el largo del bazo por ecografía). Lo que el modelo aún no cumple va con `notYetMet` y su número.
 */
const scene = new AnatomyScene(defaultPatient());
const cls = (m: Vec3) => scene.classify(m, BASELINE_INSTANT).tissue;
const isLiver = (t: Tissue) => t === Tissue.Liver || t === Tissue.LiverCapsule;

function notYetMet(title: string, body: () => void): void {
  it(`${title} [aún no se cumple]`, () => {
    expect(body).toThrow(chai.AssertionError);
  });
}

/** Lo que ve la línea central de la sonda con el diafragma bajado `caudal` mm (`probeCenterContent` de la cobertura). */
function probeContentAt(pose: ProbePose, caudal: number) {
  const resp = {
    phase: 0,
    volume: 0,
    volumeRate: 0,
    pleuralMmHg: 0,
    abdominalMmHg: 0,
    diaphragmCaudalMm: caudal,
    diaphragmVelocityMmS: 0,
  };
  return probeCenterContent(scene, pose, CONVEX_C35, { diaphragmCaudalMm: caudal }, resp);
}

/** Punto a `insideMm` bajo la cara interna de la pared en el rayo radial de la piel del ángulo φ, a la altura z. */
function underWall(phi: number, z: number, insideMm: number): Vec3 {
  const s = torsoSkinPoint(phi, z, scene.torso);
  const R = Math.hypot(s[0], s[1]);
  let lo = 0;
  let hi = 80;
  for (let i = 0; i < 50; i++) {
    const d = 0.5 * (lo + hi);
    if (scene.insideWallMm([s[0] * (1 - d / R), s[1] * (1 - d / R), z]) < insideMm) lo = d;
    else hi = d;
  }
  const d = 0.5 * (lo + hi);
  return [s[0] * (1 - d / R), s[1] * (1 - d / R), z];
}

/** La z más baja (paso 0,5 mm, de `from` hacia arriba) con hígado a `insideMm` bajo la pared en φ; null si no hay. */
function lowestLiverZ(phi: number, from: number, to: number, insideMm = 3): number | null {
  for (let z = from; z <= to; z += 0.5) if (isLiver(cls(underWall(phi, z, insideMm)))) return z;
  return null;
}

/** Extensión de un tejido en una rejilla de `h` mm del tronco (bajo z 60): [x0, x1, y0, y1, z0, z1] y volumen (mL). */
function extent(is: (t: Tissue) => boolean, h: number, box: [number, number, number, number, number, number]) {
  const e = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9];
  let n = 0;
  for (let x = box[0]; x <= box[1]; x += h)
    for (let y = box[2]; y <= box[3]; y += h)
      for (let z = box[4]; z <= box[5]; z += h) {
        if (!is(cls([x, y, z]))) continue;
        n++;
        e[0] = Math.min(e[0], x);
        e[1] = Math.max(e[1], x);
        e[2] = Math.min(e[2], y);
        e[3] = Math.max(e[3], y);
        e[4] = Math.min(e[4], z);
        e[5] = Math.max(e[5], z);
      }
  return { e, mL: (n * h * h * h) / 1000 };
}
const liverBox = extent(isLiver, 3, [-160, 160, -113, 113, -200, 60]);

describe('El hígado bajo la cúpula derecha (decisión 37; Gray, «Surface Markings of the Abdomen»)', () => {
  it('a la derecha baja contra la pared hasta 1 cm bajo el margen inferior del tórax (LMC, LAA, LAM y LAP)', () => {
    // a 3 mm bajo la pared el borde ha subido la cotangente del borde por esa profundidad (0,75 × 3) y el redondeo de su arista
    for (const line of ['midclavicular', 'anteriorAxillary', 'midaxillary', 'posteriorAxillary'] as ThoraxLine[]) {
      const phi = thoraxLinePhi(line, scene.torso, -1);
      const u = wallArc(torsoSkinPoint(phi, 0, scene.torso), scene.torso);
      const edge = wallColumnTexel(scene.chestWall, u)[2] - LIVER.params.belowMarginMm.value;
      const z = lowestLiverZ(phi, edge - 20, edge + 30);
      expect(z, line).not.toBeNull();
      expect(z!, `${line}: borde de Gray ${edge.toFixed(1)}`).toBeGreaterThanOrEqual(edge);
      expect(z!, `${line}: borde de Gray ${edge.toFixed(1)}`).toBeLessThanOrEqual(edge + 5);
    }
  });

  it('cruza la línea media justo sobre el plano transpilórico (las puntas de los 9.º cartílagos) camino del 8.º izquierdo', () => {
    const cage = scene.ribCage;
    const k9 = cage.ribs.findIndex((r) => r.number === 9 && r.side === -1);
    const transpyloric = ribTableZ(cage, k9, cage.ribs[k9].uEnd);
    const mid = liverEdgeZ(0, 0, scene.liver);
    expect(mid).toBeGreaterThan(transpyloric);
    expect(mid).toBeLessThan(transpyloric + 25);
    // y la clasificación lo pone ahí: a 3 mm bajo la línea alba, la cotangente del lóbulo izquierdo
    const z = lowestLiverZ(Math.PI / 2, mid - 20, mid + 30);
    expect(z!).toBeGreaterThanOrEqual(mid);
    expect(z!).toBeLessThanOrEqual(mid + 8);
  });

  // Gray («The Liver») dice que el lóbulo izquierdo llega «no pocas veces» a la línea mamilar; sus marcas de superficie lo cierran
  // en el 6.º cartílago a 5 cm, que es lo que pone el modelo (`anatomy.liver.leftEndXMm`, rango 50–95): la prueba fija esa
  // elección, no la anatomía de todos los adultos
  it('con el lóbulo izquierdo de las marcas de Gray, llega a la pared bajo el 6.º cartílago a 5 cm y no a la LMC izquierda', () => {
    const t = scene.torso;
    const at5cm = Math.acos(LIVER.params.leftEndXMm.value / t.a);
    expect(isLiver(cls(underWall(at5cm, scene.liver.tip.zEnd - 15, 3)))).toBe(true);
    const lmc = thoraxLinePhi('midclavicular', t, 1);
    const border = lungBorderAt(scene.lungBorder, wallArc(torsoSkinPoint(lmc, 0, t), t))[0];
    for (let z = border - 3; z > -150; z -= 1) expect(isLiver(cls(underWall(lmc, z, 3))), `LMC izquierda, z ${z}`).toBe(false);
  });

  it('su ancho transverso es el de Gray (20–22,5 cm) y su alto en la LMC el de Kratzer (14,5 ± 1,6 cm en el varón) a ± 2 DE', () => {
    const width = liverBox.e[1] - liverBox.e[0];
    expect(width).toBeGreaterThanOrEqual(200 - 3);
    expect(width).toBeLessThanOrEqual(225 + 3);
    // el plano sagital de la LMC derecha (95 mm de la línea media): del techo (la cúpula) al borde inferior
    let top = -1e9;
    let bottom = 1e9;
    for (let y = -100; y <= 110; y += 2)
      for (let z = -200; z <= 60; z += 1)
        if (isLiver(cls([-95, y, z]))) {
          top = Math.max(top, z);
          bottom = Math.min(bottom, z);
        }
    const span = top - bottom;
    expect(span).toBeGreaterThanOrEqual(145 - 2 * 16);
    expect(span).toBeLessThanOrEqual(145 + 2 * 16);
  });

  notYetMet('su alto junto a su cara derecha es el de Gray (15–17,5 cm; hoy ≈ 13,4 de máximo, a 120 mm de la línea media)', () => {
    // la mayor extensión vertical en los planos sagitales junto a la cara derecha (a 120–145 mm de la línea media)
    let span = 0;
    for (let x = -145; x <= -120; x += 5) {
      let top = -1e9;
      let bottom = 1e9;
      for (let y = -100; y <= 100; y += 2)
        for (let z = -200; z <= 60; z += 1)
          if (isLiver(cls([x, y, z]))) {
            top = Math.max(top, z);
            bottom = Math.min(bottom, z);
          }
      span = Math.max(span, top - bottom);
    }
    expect(span).toBeGreaterThanOrEqual(150);
    expect(span).toBeLessThanOrEqual(175);
  });

  notYetMet('su volumen es el del peso de Gray (1,4–1,6 kg en el varón, densidad 1,05: 1,33–1,52 L; hoy ≈ 1,76 L)', () => {
    expect(liverBox.mL).toBeGreaterThanOrEqual(1333);
    expect(liverBox.mL).toBeLessThanOrEqual(1524);
  });

  // La impresión renal (la grasa perirrenal y la sombra del riñón) no parte el hígado: entre dos tramos de hígado de una columna
  // radial del lado derecho no hay «resto» ni grasa retroperitoneal donde actúa (la impresión bajo su redondeo). Quedan, y no son
  // grietas, la grasa del propio riñón (columnas que rozan su polo superior), la vértebra y el recorte posteromedial de VExUS
  // (lejos del riñón). Con la impresión de la primera versión de la decisión 43, 9 columnas en el paciente por omisión
  it('la impresión renal no parte el hígado (tres hábitos, columnas radiales cada 0,25 mm)', () => {
    for (const h of HABITUS_SCENES.filter((x) => ['average-male', 'thin-male', 'obese-female'].includes(x.id))) {
      const s = h.scene;
      const bad: string[] = [];
      for (let phi = Math.PI * 1.02; phi < Math.PI * 1.98; phi += Math.PI / 36)
        for (let z = -160; z <= 20; z += 6) {
          let liverSeen = false;
          let gap: Vec3[] = [];
          for (let d = 0; d < 110; d += 0.25) {
            const m = probeHitPoint(phi, d, s.torso, z);
            const t = s.classify(m, BASELINE_INSTANT).tissue;
            if (t === Tissue.Air) break;
            if (isLiver(t)) {
              const cut = gap.some((g) => renalImpression(g, s.kidneys, perirenalDistance(g, s.kidneys)) < RENAL_IMPRESSION_ROUND_MM);
              if (liverSeen && cut) bad.push(`φ ${((phi * 180) / Math.PI).toFixed(0)}°, z ${z}, ${d} mm`);
              liverSeen = true;
              gap = [];
            } else if (liverSeen && (t === Tissue.Bowel || t === Tissue.RetroperitonealFat)) gap.push(m);
            else if (liverSeen) gap = [];
          }
        }
      expect(bad, h.id).toEqual([]);
    }
  });

  it('el riñón derecho queda fuera del hígado (decisión 43: su impresión renal, la de la grasa perirrenal de VExUS)', () => {
    const k = scene.kidneys[0];
    // el centro del riñón y un punto de su grasa detrás no son hígado; por encima del riñón, la cara posterior del lóbulo derecho
    // llega a la espalda (el EIC10 de la escapular derecha)
    expect(isLiver(cls(k.center))).toBe(false);
    expect(isLiver(cls([k.center[0], k.center[1] - 20, k.center[2]]))).toBe(false);
    expect(isLiver(cls([-75, -70, -40]))).toBe(true);
  });
});

/** Las escenas de los seis hábitos del tórax (decisión 28). */
const HABITUS_SCENES = (['average', 'thin', 'obese'] as const).flatMap((build) =>
  (['male', 'female'] as const).map((sex) => {
    const p = defaultPatient();
    return { id: `${build}-${sex}`, scene: new AnatomyScene({ ...p, habitus: { ...p.habitus, chest: { build, sex } } }) };
  }),
);

/**
 * Las columnas radiales del bazo de una escena (decisión 43): una rejilla de 15 × 15 sobre la huella (largo × ancho del marco
 * local), cada una por la dirección radial del tronco (`pointAtArc`) cada 0,25 mm desde la piel. De cada una: los tramos de bazo
 * ([desde, hasta) en mm bajo la piel) y el tejido justo por fuera del primero.
 */
interface SpleenColumn {
  along: number;
  across: number;
  runs: Array<[number, number]>;
  before: Tissue;
  /** El punto de bazo de la columna más adelante (mayor y). */
  front: Vec3;
}
function spleenColumns(s: AnatomyScene): SpleenColumn[] {
  const sp = s.spleen;
  const [A, B] = sp.radii;
  const out: SpleenColumn[] = [];
  for (let i = 0; i < 15; i++)
    for (let j = 0; j < 15; j++) {
      const along = -A + ((i + 0.5) * 2 * A) / 15;
      const across = -B + ((j + 0.5) * 2 * B) / 15;
      const u = sp.u0 + (along * sp.cos - across * sp.sin) / sp.arcScale;
      const z = sp.z0 + along * sp.sin + across * sp.cos;
      const runs: Array<[number, number]> = [];
      let before = Tissue.Air;
      let prev = Tissue.Air;
      let front: Vec3 = [0, -Infinity, 0];
      for (let d = 0; d <= sp.maxSkinDepth + 10; d += 0.25) {
        const m = pointAtArc(u, z, d, s.torso);
        const t = s.classify(m, BASELINE_INSTANT).tissue;
        if (t === Tissue.Spleen) {
          if (m[1] > front[1]) front = m;
          if (prev !== Tissue.Spleen) {
            if (!runs.length) before = prev;
            runs.push([d, d + 0.25]);
          } else runs[runs.length - 1][1] = d + 0.25;
        }
        prev = t;
      }
      if (runs.length) out.push({ along, across, runs, before, front });
    }
  return out;
}

/** Las columnas del bazo de los seis hábitos (se calculan una vez). */
let habitusColumns: Array<{ id: string; scene: AnatomyScene; cols: SpleenColumn[] }> | null = null;
function spleenColumnsByHabitus() {
  habitusColumns ??= HABITUS_SCENES.map((h) => ({ ...h, cols: spleenColumns(h.scene) }));
  return habitusColumns;
}

/** La y de la línea axilar media de Shen y cols.: a medio camino del ángulo xifoesternal (el esternón en z = 0) a la punta de
 * las espinosas (la cara posterior de la columna). */
function shenMidaxillaryY(s: AnatomyScene): number {
  const bone: number[] = [];
  for (let y = s.torso.b; y > 0; y -= 0.25) if (s.classify([0, y, 0], BASELINE_INSTANT).tissue === Tissue.Bone) bone.push(y);
  return 0.5 * (0.5 * (Math.max(...bone) + Math.min(...bone)) + s.spinous.tipY);
}

describe('El bazo normal bajo la cúpula izquierda (decisiones 37 y 43; Chow y cols., Shen y cols., Gray «The Spleen»)', () => {
  const pts: Vec3[] = [];
  for (let x = 0; x <= 160; x += 2)
    for (let y = -113; y <= 113; y += 2) for (let z = -180; z <= 20; z += 2) if (cls([x, y, z]) === Tissue.Spleen) pts.push([x, y, z]);
  const columns = spleenColumns(scene);

  /** Las extensiones de sus puntos por sus tres ejes principales, de mayor a menor (mm). */
  function extents(): number[] {
    const n = pts.length;
    const c = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / n);
    const C = [0, 1, 2].map((i) => [0, 1, 2].map((j) => pts.reduce((a, p) => a + (p[i] - c[i]) * (p[j] - c[j]), 0) / n));
    const axes: number[][] = [];
    for (let e = 0; e < 3; e++) {
      let v = [1, 0.3 * e, 0.1];
      for (let it = 0; it < 300; it++) {
        let w = [0, 1, 2].map((i) => C[i][0] * v[0] + C[i][1] * v[1] + C[i][2] * v[2]);
        for (const a of axes) {
          const d = w[0] * a[0] + w[1] * a[1] + w[2] * a[2];
          w = w.map((x, i) => x - d * a[i]);
        }
        const l = Math.hypot(w[0], w[1], w[2]);
        v = w.map((x) => x / l);
      }
      axes.push(v);
    }
    return axes.map((v) => {
      const proj = pts.map((p) => (p[0] - c[0]) * v[0] + (p[1] - c[1]) * v[1] + (p[2] - c[2]) * v[2]);
      return Math.max(...proj) - Math.min(...proj);
    });
  }

  // Lo normal (decisión 43): el largo de Chow para el varón de 175–179 cm (P5 8,6 cm) y no más de 12 (Gray; desde 12–13, la
  // esplenomegalia de Lucius y cols.); el ancho, en los P5–P95 de Chow; el grueso, por la dirección radial (la del hilio a la cara
  // convexa), de los 3 cm de Gray a Caglar y cols. + 1 DE (4,58 + 0,8: 5,4); el volumen, 150–220 mL (el bazo normal típico de
  // Lucius y cols., 160 mL, y Gray, ≈ 184; Perez y cols., 216). Mutaciones: con `lengthMm` 150 el largo pasa de 12 cm; con
  // `thicknessMm` 60, el grueso de 5,4 y el volumen de 220
  it('su largo, su ancho y su grueso son los de un adulto normal (Chow y cols., Gray, Caglar y cols.)', () => {
    const [l, w] = extents();
    const P = SPLEEN.params;
    expect(l).toBeGreaterThanOrEqual(P.lengthMm.range![0]);
    expect(l).toBeLessThanOrEqual(120);
    expect(w).toBeGreaterThanOrEqual(P.breadthMm.range![0]);
    expect(w).toBeLessThanOrEqual(P.breadthMm.range![1]);
    const radial = Math.max(...columns.map((c) => c.runs[0][1] - c.runs[0][0]));
    expect(radial).toBeGreaterThanOrEqual(30);
    expect(radial).toBeLessThanOrEqual(54);
  });

  it('su volumen es el de un adulto normal: 150–220 mL (Lucius y cols., Gray)', () => {
    const mL = (pts.length * 8) / 1000;
    expect(mL).toBeGreaterThanOrEqual(150);
    expect(mL).toBeLessThanOrEqual(220);
  });

  // Ningún tejido del «resto» ni del retroperitoneo parte el bazo (la revisión halló rendijas de 0,25–1,25 mm y, en el obeso,
  // 4–8 mm de grasa: la impresión renal saltaba lejos del riñón y la sombra lo cortaba con un plano coronal)
  it('es un solo tramo en cada columna radial, cada 0,25 mm, en los seis hábitos', () => {
    for (const { id, cols } of spleenColumnsByHabitus()) {
      expect(cols.length, id).toBeGreaterThan(150);
      const split = cols
        .filter((c) => c.runs.length > 1)
        .map((c) => `${c.along.toFixed(0)},${c.across.toFixed(0)}: ${JSON.stringify(c.runs)}`);
      expect(split, id).toEqual([]);
    }
  });

  // La línea axilar media de Shen y cols. (en el corte sagital, a medio camino del ángulo xifoesternal a la cara posterior de la
  // columna) cae en el avatar a ≈ 1 mm de la de la piel; el extremo anterior del bazo queda 12–17 mm por delante en los seis
  // hábitos (los obesos, 15,6 y 16,6), dentro de 26,6 ± 23,3 mm (± 1 DE)
  it('su extremo anterior pasa por delante de la axilar media de Shen y cols. en su rango (± 1 DE), en los seis hábitos', () => {
    const [lo, hi] = SPLEEN.params.anteriorToMidaxillaryMm.range!;
    for (const { id, scene: s, cols } of spleenColumnsByHabitus()) {
      // el punto más adelantado de las columnas y, a 1 mm, la caja de 24 mm a su alrededor
      const p0 = cols.reduce((a, c) => (c.front[1] > a[1] ? c.front : a), cols[0].front);
      let front = p0[1];
      for (let x = p0[0] - 12; x <= p0[0] + 12; x += 1)
        for (let y = p0[1] - 4; y <= p0[1] + 20; y += 1)
          for (let z = p0[2] - 12; z <= p0[2] + 12; z += 1)
            if (s.classify([x, y, z], BASELINE_INSTANT).tissue === Tissue.Spleen) front = Math.max(front, y);
      const ahead = front - shenMidaxillaryY(s);
      expect(ahead, id).toBeGreaterThanOrEqual(lo);
      expect(ahead, id).toBeLessThanOrEqual(hi);
    }
  });

  it('su eje va en la 11.ª costilla (la TC): bajo ella en la axilar posterior, y nada sobre la 10.ª', () => {
    const t = scene.torso;
    const lap = thoraxLinePhi('posteriorAxillary', t, 1);
    const au = ribLineArc(lap, t, scene.ribCage);
    const rib = (n: number) => {
      const k = scene.ribs.findIndex((r) => r.number === n && r.side === 1);
      return { z: ribTableZ(scene.ribCage, k, au), hw: scene.ribs[k].halfWidth };
    };
    expect(cls(underWall(lap, rib(11).z, 8))).toBe(Tissue.Spleen);
    const above = rib(10).z + rib(10).hw + 10;
    for (const d of [3, 8, 15]) expect(cls(underWall(lap, above, d)), `${d} mm`).not.toBe(Tissue.Spleen);
  });

  /** La z más baja con hueso o cartílago costal en la pared bajo el arco u: el reborde medido en la clasificación. */
  function lowestRibTissueZ(u: number): number {
    for (let z = -220; z <= 0; z += 0.5) {
      const wall = scene.chestWall.total(u, z);
      for (let d = 1; d < wall; d += 1) {
        const t = cls(pointAtArc(u, z, d, scene.torso));
        if (t === Tissue.Bone || t === Tissue.Cartilage) return z;
      }
    }
    return Infinity;
  }

  // `costalMarginZ` frente a las costillas que clasifica la escena (independiente de su fórmula): donde hay costilla, el borde
  // inferior de la más baja; en las puntas libres de la 11.ª y la 12.ª, el de la punta
  it('el reborde costal de la construcción es el de las costillas que se clasifican', () => {
    const k = (n: number) => scene.ribs.find((r) => r.number === n && r.side === 1)!;
    const t11 = k(11).uEnd;
    const t12 = k(12).uEnd;
    for (const u of [t11 - 30, t11 - 10, t11 + 1, t12 + 1, t12 + 20, t12 + 50])
      expect(Math.abs(lowestRibTissueZ(u) - costalMarginZ(scene.ribCage, u)), `u ${u.toFixed(0)}`).toBeLessThan(1.5);
  });

  // un bazo normal no se palpa: no pasa del reborde costal (Gray: su cara diafragmática, tras las costillas 9.ª–11.ª, y su borde
  // posterior en el borde inferior de la 11.ª; la TC, entre la 10.ª y la 12.ª). Detrás, su borde posterior llega a la 12.ª: se
  // admite medio alto de costilla bajo su borde inferior. Con el centro en el sitio de la primera versión de la decisión 43 (su
  // extremo anterior a 26,6 mm de la LAM de la piel), 41 mL pasaban hasta 46 mm bajo el reborde
  it('queda dentro de la parrilla: ningún punto pasa del reborde costal (el bazo normal no se palpa)', () => {
    const t = scene.torso;
    const hw = scene.ribs.find((r) => r.number === 12 && r.side === 1)!.halfWidth;
    let worst = -Infinity;
    for (const p of pts) worst = Math.max(worst, costalMarginZ(scene.ribCage, wallArc(p, t)) - p[2]);
    expect(worst).toBeLessThanOrEqual(hw);
    expect(spleenBelowMarginMm(scene.spleen, scene.ribCage)).toBeLessThanOrEqual(0);
  });

  // [DISCREPANCIA] (decisión 43, `liver-spleen-simplified`): Gray pone el diafragma entre el bazo y las costillas 9.ª–11.ª, pero
  // la lámina de la ZOA del modelo acaba `zoaBelowReflectionMm` (20 mm [SUPUESTO]) bajo la reflexión pleural, por encima del
  // reborde al que baja el bazo normal: en el tercio inferior de su cara diafragmática apoya en la grasa de la cara interna de la
  // pared. Medido (03-10-2026): con diafragma por fuera, 119 de 177 columnas (67 %); el resto, la grasa de la pared
  const face = columns.map((c) => c.before);
  it('su cara diafragmática apoya en el diafragma o, bajo la inserción de la ZOA, en la grasa de la pared (nunca en el «resto»)', () => {
    for (const t of face) expect([Tissue.Diaphragm, Tissue.Fat]).toContain(t);
    const dia = face.filter((t) => t === Tissue.Diaphragm).length / face.length;
    expect(dia).toBeGreaterThan(0.6);
  });
  notYetMet('toda su cara diafragmática apoya en el diafragma (Gray: lo separa de las costillas 9.ª–11.ª)', () => {
    expect(face.filter((t) => t !== Tissue.Diaphragm)).toEqual([]);
  });

  // sin los vasos del hilio (decisión 46), que entran en el bazo por el centro de su parte gástrica y quitan bazo a esa columna
  it('su cara visceral se hunde en su parte gástrica (Gray: la cresta la parte en gástrica y renal)', () => {
    const B = scene.spleen.radii[1];
    const bare = new AnatomyScene(defaultPatient());
    Object.assign(bare, { vessels: [], vesselBounds: [] });
    const bareColumns = spleenColumns(bare);
    const thick = (across: number) => {
      const c = bareColumns.reduce((a, x) => (Math.hypot(x.along, x.across - across) < Math.hypot(a.along, a.across - across) ? x : a));
      return c.runs[0][1] - c.runs[0][0];
    };
    const diff = thick(-SPLEEN_GASTRIC_ACROSS * B) - thick(SPLEEN_GASTRIC_ACROSS * B);
    expect(diff).toBeGreaterThan(SPLEEN.params.gastricImpressionMm.value - 3);
    expect(diff).toBeLessThan(SPLEEN.params.gastricImpressionMm.value + 3);
  });

  // decisión 43: las marcas de superficie de Gray no caben en un bazo normal en el avatar (el punto más alto a 4 cm de la línea
  // media en T9 y el más bajo en la axilar media en L1 quedan a ≈ 16 cm): manda la morfometría y el sitio de la TC
  notYetMet('su punto más alto es el de Gray: a 4 cm de la línea media de la espalda y a la altura de la espinosa de T9', () => {
    const top = pts.reduce((a, p) => (p[2] > a[2] ? p : a));
    expect(Math.abs(top[2] - spinousTipZ(9))).toBeLessThan(10);
    expect(Math.min(...pts.map((p) => p[0]))).toBeLessThan(50);
  });

  // la búsqueda del centro no falla en silencio: si el punto de partida ya deja el bazo en la parrilla (podría ir más adelante) o
  // si ningún centro lo deja, lanza
  it('buildSpleen lanza si la búsqueda de su centro no puede acotarlo', () => {
    const build = (lam: number) =>
      buildSpleen(scene.torso, scene.ribCage, lam, (u, z) => scene.chestWall.total(u, z), scene.lungBorder.rimFarMm);
    const lam = wallArc(torsoSkinPoint(thoraxLinePhi('midaxillary', scene.torso, 1), 0, scene.torso), scene.torso);
    expect(() => build(lam)).not.toThrow();
    expect(() => build(lam + 150)).toThrow(/ya cabe en la parrilla/);
    expect(() => build(lam - 400)).toThrow(/ningún centro/);
  });

  it('no pasa por delante de la axilar anterior (Gray: el estómago, en el espacio de Traube) ni a la derecha', () => {
    const t = scene.torso;
    const laa = wallArc(torsoSkinPoint(thoraxLinePhi('anteriorAxillary', t, 1), 0, t), t);
    for (const p of pts) {
      expect(p[0]).toBeGreaterThan(0);
      expect(wallArc(p, t)).toBeGreaterThan(laa);
    }
  });
});

describe('El signo de la cortina en la base (A-T13 con el órgano debajo; decisión 37)', () => {
  const deep = DIAPHRAGM_EXCURSION.params.deepMm.value;
  for (const [id, line, side, ics, organs] of [
    ['el hígado en la LAM derecha, EIC9', 'midaxillary', -1, 9, [Tissue.Liver, Tissue.LiverCapsule]],
    ['el bazo en la LAP izquierda, EIC10', 'posteriorAxillary', 1, 10, [Tissue.Spleen]],
  ] as const) {
    it(`en espiración se ve ${id} bajo el diafragma; en la inspiración profunda (${deep} mm), el pulmón lo tapa`, () => {
      const c = icsCenter(scene, line, side, ics);
      const pose = { ...c, lift: 0, yaw: 0, rock: 0, tilt: 0 };
      const rest = probeContentAt(pose, 0);
      expect(rest.content).toBe('below');
      expect(organs as readonly Tissue[]).toContain(rest.organ);
      const inspired = probeContentAt(pose, deep);
      expect(inspired.content).toBe('lung');
    });
  }
});
