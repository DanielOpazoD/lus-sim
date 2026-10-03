import { chai, describe, expect, it } from 'vitest';
import { wallColumnTexel } from '../anatomy/organs/chestWall';
import { LIVER, liverEdgeZ } from '../anatomy/organs/liver';
import { lungBorderAt } from '../anatomy/organs/lungBorder';
import { ribLineArc, ribTableZ } from '../anatomy/organs/ribcage';
import { SPLEEN } from '../anatomy/organs/spleen';
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

  it('el riñón de Morris queda fuera: detrás, bajo la punta de T11 (el derecho 1 cm más bajo), entre 2,5 y 9,5 cm de la línea media', () => {
    const K = scene.liver.kidney;
    for (let z = K.zRight - 30; z < K.zRight - 8; z += 2)
      for (const x of [-40, -60, -80]) expect(isLiver(cls([x, K.yAnt - 15, z])), `${x}, z ${z}`).toBe(false);
    // por encima del riñón, la cara posterior del lóbulo derecho llega a la espalda (el EIC10 de la escapular derecha)
    expect(isLiver(cls([-75, -70, K.zRight + 15]))).toBe(true);
  });
});

describe('El bazo bajo la cúpula izquierda (decisión 37; Gray, «The Spleen» y «Surface Markings of the Abdomen»)', () => {
  const pts: Vec3[] = [];
  for (let x = 0; x <= 160; x += 2)
    for (let y = -113; y <= 113; y += 2) for (let z = -180; z <= 20; z += 2) if (cls([x, y, z]) === Tissue.Spleen) pts.push([x, y, z]);

  it('su largo (el eje principal de sus puntos) es el de Gray o el de Chow (10–14 cm)', () => {
    const n = pts.length;
    const c = [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / n);
    const C = [0, 1, 2].map((i) => [0, 1, 2].map((j) => pts.reduce((a, p) => a + (p[i] - c[i]) * (p[j] - c[j]), 0) / n));
    let v = [1, 0, 0];
    for (let it = 0; it < 200; it++) {
      const w = [0, 1, 2].map((i) => C[i][0] * v[0] + C[i][1] * v[1] + C[i][2] * v[2]);
      const l = Math.hypot(w[0], w[1], w[2]);
      v = w.map((x) => x / l);
    }
    const proj = pts.map((p) => (p[0] - c[0]) * v[0] + (p[1] - c[1]) * v[1] + (p[2] - c[2]) * v[2]);
    const length = Math.max(...proj) - Math.min(...proj);
    const [lo, hi] = SPLEEN.params.lengthMm.range!;
    expect(length).toBeGreaterThanOrEqual(lo);
    expect(length).toBeLessThanOrEqual(hi);
  });

  it('su punto más bajo cae en la axilar media, y en la axilar posterior ocupa la banda de la 9.ª a la 11.ª costilla', () => {
    const low = pts.reduce((a, p) => (p[2] < a[2] ? p : a));
    const t = scene.torso;
    const lam = wallArc(torsoSkinPoint(thoraxLinePhi('midaxillary', t, 1), 0, t), t);
    expect(Math.abs(wallArc(low, t) - lam)).toBeLessThan(30);
    const lap = thoraxLinePhi('posteriorAxillary', t, 1);
    const au = ribLineArc(lap, t, scene.ribCage);
    const rib = (n: number) => {
      const k = scene.ribs.findIndex((r) => r.number === n && r.side === 1);
      return { z: ribTableZ(scene.ribCage, k, au), hw: scene.ribs[k].halfWidth };
    };
    expect(cls(underWall(lap, rib(10).z, 8))).toBe(Tissue.Spleen);
    const below = rib(11).z - rib(11).hw - 10;
    for (const d of [3, 8, 15]) expect(cls(underWall(lap, below, d)), `${d} mm`).not.toBe(Tissue.Spleen);
  });

  notYetMet('su volumen es el del peso de Gray (≈ 200 g; a la densidad de IT’IS, 1089 kg/m³, ≈ 184 mL ± 10 %; hoy ≈ 134)', () => {
    const mL = (pts.length * 8) / 1000;
    expect(mL).toBeGreaterThanOrEqual(184 * 0.9);
    expect(mL).toBeLessThanOrEqual(184 * 1.1);
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
