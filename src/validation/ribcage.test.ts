import { describe, expect, it } from 'vitest';
import { ANATOMY_GLSL, COMPRESSION_BASE } from '../anatomy/gpu/anatomy.glsl';
import { PROBE_COMPRESSION } from '../anatomy/compression';
import {
  MAX_RIBS,
  RIBCAGE,
  RIBCAGE_GLSL,
  RIBS_PER_SIDE,
  RIB_TABLE_BASE,
  RIB_TABLE_COLS,
  RIB_TABLE_DU_MM,
  pleuraNormalDepth,
  ribLinePoint,
  ribScan,
  ribTableZ,
  sternumHalfWidth,
} from '../anatomy/organs/ribcage';
import { wallArc } from '../anatomy/organs/wall';
import { torsoDepth } from '../anatomy/primitives';
import { AnatomyScene, BASELINE_INSTANT } from '../anatomy/scene';
import { thoraxLinePhi } from '../anatomy/thoraxLines';
import { Tissue } from '../anatomy/tissues';
import type { Vec3 } from '../core/vec3';
import { defaultPatient } from '../physiology/patientState';
import { ribOf } from './support/chestView';

/**
 * La parrilla costal del adulto promedio (decisión 16, `anatomy/organs/ribcage.ts`): cómo se construye y lo que la base
 * dice de cada pieza. Las metas por nivel y región (los anchos, el alto, las cuentas por línea, la oblicuidad) están en
 * `anatomyTargets.test.ts`; aquí, el esternón, los tres tipos de cartílago, los extremos, la calcificación y el gemelo
 * GLSL.
 */
const scene = new AnatomyScene(defaultPatient());
const cage = scene.ribCage;
const t = scene.torso;
const P = RIBCAGE.params;
const cls = (p: Vec3) => scene.classify(p, BASELINE_INSTANT);
const z = (n: number, u: number) => ribTableZ(cage, n - 1, u);
/** Punto del rayo radial de ángulo elíptico τ (0 delante, + a la izquierda) a `nP` mm de la pleura por la normal, altura zz. */
function atNormal(tau: number, nP: number, zz: number): Vec3 {
  const sx = t.a * Math.sin(tau);
  const sy = t.b * Math.cos(tau);
  const R = Math.hypot(sx, sy);
  let lo = 0;
  let hi = 60;
  for (let i = 0; i < 60; i++) {
    const d = 0.5 * (lo + hi);
    const p: Vec3 = [sx * (1 - d / R), sy * (1 - d / R), zz];
    if (pleuraNormalDepth(p, d, t) > nP) lo = d;
    else hi = d;
  }
  const d = 0.5 * (lo + hi);
  return [sx * (1 - d / R), sy * (1 - d / R), zz];
}
/** τ ≥ 0 de un |u| (la inversa de `wallArc` en el lado izquierdo). */
function tauOf(u: number): number {
  let lo = 0;
  let hi = Math.PI;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (wallArc([t.a * Math.sin(mid), t.b * Math.cos(mid), 0], t) < u) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}
/** Punto de la línea media de la costilla n (derecha) en |u| = au. */
const onRib = (n: number, au: number): Vec3 => {
  const p = atNormal(tauOf(au), cage.pleuraComplex + cage.halfThickness, z(n, au));
  return [-p[0], p[1], p[2]];
};

describe('esternón: manubrio, cuerpo y xifoides (Gray, «The Sternum» y «Surface Markings of the Thorax»)', () => {
  const s = cage.sternum;
  const seg = P.thoracicSegmentMm.value;

  it('en los niveles vertebrales de Gray: escotadura yugular en el borde inferior de T2, ángulo en T4–T5, unión xifoesternal (z = 0) en T9–T10', () => {
    expect(s.zTop).toBeCloseTo(7 * seg, 9);
    expect(s.zAngle).toBeCloseTo(5 * seg, 9);
    expect(s.zTip).toBe(-P.xiphoidLengthMm.value);
    // manubrio de 47 mm y cuerpo de 117 (el cuerpo, «considerably longer»)
    expect(s.zTop - s.zAngle).toBeGreaterThan(40);
    expect(s.zAngle).toBeGreaterThan(2 * (s.zTop - s.zAngle));
  });

  it('el manubrio se estrecha hasta el ángulo, el cuerpo sigue y el xifoides se afina; hueso y, el xifoides, cartílago', () => {
    expect(sternumHalfWidth(s.zTop, cage)).toBeCloseTo(s.halfWidthTop, 9);
    expect(sternumHalfWidth(s.zAngle, cage)).toBeCloseTo(s.halfWidthBody, 9);
    expect(sternumHalfWidth(40, cage)).toBe(s.halfWidthBody);
    expect(sternumHalfWidth(s.zTip, cage)).toBeCloseTo(s.halfWidthXiphoid / 3, 9);
    const mid = (zz: number): Vec3 => atNormal(0, cage.pleuraComplex + 0.5 * s.thickness, zz);
    for (const zz of [s.zTop - 5, 100, 30]) expect(cls(mid(zz)).tissue, `z ${zz}`).toBe(Tissue.Bone);
    expect(cls(mid(-10)).tissue).toBe(Tissue.Cartilage);
    expect(cls(mid(s.zTop + 5)).tissue).not.toBe(Tissue.Bone);
    expect(cls(mid(s.zTip - 5)).tissue).not.toBe(Tissue.Cartilage);
    // su cara posterior, a `pleuraComplex` de la cara interna de la pared, como las costillas
    expect(cls(atNormal(0, cage.pleuraComplex + 0.1, 60)).tissue).toBe(Tissue.Bone);
    expect(cls(atNormal(0, cage.pleuraComplex - 0.1, 60)).tissue).not.toBe(Tissue.Bone);
  });

  it('los cartílagos 1.º–7.º llegan al esternón: la 1.ª al manubrio, la 2.ª al ángulo esternal y la 7.ª a la unión xifoesternal', () => {
    for (let n = 1; n <= 7; n++) {
      const r = ribOf(scene, n);
      const zSt = z(n, r.uEnd);
      // el extremo medial de la línea media, en el borde del esternón a su altura (a 0,5 mm)
      const p = onRib(n, r.uEnd + 0.01);
      expect(Math.abs(p[0]) - sternumHalfWidth(zSt, cage), `${n}.ª`).toBeGreaterThanOrEqual(-0.5);
      expect(Math.abs(p[0]) - sternumHalfWidth(zSt, cage), `${n}.ª`).toBeLessThanOrEqual(0.5);
      // y es cartílago
      expect(cls(onRib(n, r.uEnd + 1)).tissue, `${n}.ª`).toBe(Tissue.Cartilage);
    }
    expect(z(1, ribOf(scene, 1).uEnd)).toBeGreaterThan(cage.sternum.zAngle);
    expect(z(1, ribOf(scene, 1).uEnd)).toBeLessThan(cage.sternum.zTop);
    // la 2.ª en el ángulo esternal a menos de medio alto costal (1,7 mm)
    expect(Math.abs(z(2, ribOf(scene, 2).uEnd) - cage.sternum.zAngle)).toBeLessThan(0.5 * P.ribHeightMm.value);
    expect(z(7, ribOf(scene, 7).uEnd)).toBeCloseTo(0, 1);
    // los intervalos entre las carillas del cuerpo del esternón «diminish in length from above downward» (Gray)
    const joints = [2, 3, 4, 5, 6, 7].map((n) => z(n, ribOf(scene, n).uEnd));
    for (let i = 2; i < joints.length; i++) expect(joints[i - 1] - joints[i]).toBeLessThan(joints[i - 2] - joints[i - 1]);
  });
});

describe('cartílagos y extremos de las costillas (Gray, «The Costal Cartilages» y «The Ribs»)', () => {
  it('uniones condrocostales: cartílago por dentro, hueso por fuera; la 4.ª y la 5.ª a 7–8 cm de la línea media; los cartílagos alargan de la 1.ª a la 7.ª', () => {
    let prev = 0;
    for (let n = 1; n <= 7; n++) {
      const r = ribOf(scene, n);
      expect(cls(onRib(n, r.uCc - 1)).tissue, `${n}.ª`).toBe(Tissue.Cartilage);
      expect(cls(onRib(n, r.uCc + 1)).tissue, `${n}.ª`).toBe(Tissue.Bone);
      if (n === 4 || n === 5) {
        const x = Math.abs(onRib(n, r.uCc)[0]);
        expect(x).toBeGreaterThanOrEqual(70);
        expect(x).toBeLessThanOrEqual(80);
      }
      const length = r.uCc - r.uEnd;
      expect(length, `${n}.ª`).toBeGreaterThan(prev);
      prev = length;
    }
    // la 8.ª unión condrocostal, en la medioclavicular (la reflexión pleural de Gray la cruza en la línea mamaria)
    expect(ribOf(scene, 8).uCc).toBeCloseTo(cage.stations.midclavicular, 6);
  });

  it('los cartílagos 8.º–10.º acaban en el de arriba (se tocan en la punta) y las 11.ª y 12.ª, libres con su punta de cartílago', () => {
    for (let n = 8; n <= 10; n++) {
      const r = ribOf(scene, n);
      const gap = z(n - 1, r.uEnd) - z(n, r.uEnd) - ribOf(scene, n - 1).halfWidth - r.halfWidth;
      expect(Math.abs(gap), `${n}.ª`).toBeLessThan(0.2);
      // la de arriba sigue más allá de la punta (la de abajo no llega al esternón)
      expect(ribOf(scene, n - 1).uEnd, `${n}.ª`).toBeLessThan(r.uEnd);
    }
    for (const n of [11, 12]) {
      const r = ribOf(scene, n);
      expect(r.uEnd, `${n}.ª`).toBeGreaterThan(cage.stations.anteriorAxillary);
      expect(cls(onRib(n, r.uEnd + 1)).tissue, `${n}.ª`).toBe(Tissue.Cartilage);
      expect(cls(onRib(n, r.uCc + 2)).tissue, `${n}.ª`).toBe(Tissue.Bone);
      // por delante de la punta, nada de la costilla
      expect([Tissue.Bone, Tissue.Cartilage], `${n}.ª`).not.toContain(cls(onRib(n, r.uEnd - 2)).tissue);
    }
    // la 12.ª, mucho más corta que la 11.ª
    expect(ribOf(scene, 12).uPost - ribOf(scene, 12).uEnd).toBeLessThan(0.8 * (ribOf(scene, 11).uPost - ribOf(scene, 11).uEnd));
  });

  it('los extremos posteriores, en las apófisis transversas: nada de costilla por detrás de la columna', () => {
    for (let n = 1; n <= 12; n++) {
      const r = ribOf(scene, n);
      const p = onRib(n, r.uPost);
      expect(Math.abs(p[0]), `${n}.ª`).toBeCloseTo(scene.spine.archHalfWidth + 6, 0);
      expect([Tissue.Bone, Tissue.Cartilage], `${n}.ª`).not.toContain(cls(onRib(n, r.uPost + 3)).tissue);
    }
  });
});

describe('calcificación del cartílago (opción de la escena)', () => {
  it('sin ella (el avatar) el cartílago es cartílago; con 25 % del volumen, una cáscara de hueso y la sombra que la acompaña', () => {
    expect(cage.calcifiedRim).toBe(0);
    const calcified = new AnatomyScene(defaultPatient(), { cartilageCalcifiedFraction: 0.25 });
    expect(calcified.ribCage.calcifiedRim).toBeCloseTo(1 - Math.sqrt(0.75), 12);
    const r = ribOf(scene, 5);
    const u = 0.5 * (r.uEnd + r.uCc);
    const center = onRib(5, u);
    // en el centro del cartílago, cartílago en las dos escenas; junto a su borde, hueso solo en la calcificada
    expect(calcified.classify(center, BASELINE_INSTANT).tissue).toBe(Tissue.Cartilage);
    const edge: Vec3 = [center[0], center[1], center[2] + 0.95 * r.halfWidth];
    expect(scene.classify(edge, BASELINE_INSTANT).tissue).toBe(Tissue.Cartilage);
    expect(calcified.classify(edge, BASELINE_INSTANT).tissue).toBe(Tissue.Bone);
    // el tejido blando junto al cartílago calcificado dibuja la cortical (el hueso más cercano)
    const above: Vec3 = [center[0], center[1], center[2] + r.halfWidth + 0.5];
    const d = -torsoDepth(above, t);
    expect(ribScan(above, d, wallArc(above, t), t, calcified.ribCage).ribD).toBeLessThan(1);
    expect(ribScan(above, d, wallArc(above, t), t, cage).ribD).toBeGreaterThan(1);
  });
});

describe('la tabla y el gemelo GLSL', () => {
  it('la tabla es simétrica, cubre cada costilla y va en la textura de escena tras la compresión', () => {
    expect(RIB_TABLE_BASE).toBe(COMPRESSION_BASE + PROBE_COMPRESSION.nodes);
    const half = RIB_TABLE_COLS * 3 * 4;
    expect(Array.from(cage.table.subarray(half, 2 * half))).toEqual(Array.from(cage.table.subarray(0, half)));
    for (const r of cage.ribs) expect(r.uPost).toBeLessThan((RIB_TABLE_COLS - 1) * RIB_TABLE_DU_MM);
    // la interpolación lineal de la tabla se aparta poco de la curva construida: la pendiente de cada costilla cambia
    // despacio (segunda diferencia de la tabla ≤ 1,5 mm en 4 mm de |u| dentro de su extensión)
    for (let k = 0; k < RIBS_PER_SIDE; k++) {
      const r = cage.ribs[k];
      for (let u = r.uEnd + RIB_TABLE_DU_MM; u + RIB_TABLE_DU_MM <= r.uPost; u += RIB_TABLE_DU_MM) {
        const dd = ribTableZ(cage, k, u + RIB_TABLE_DU_MM) - 2 * ribTableZ(cage, k, u) + ribTableZ(cage, k, u - RIB_TABLE_DU_MM);
        expect(Math.abs(dd), `${k + 1}.ª en ${u.toFixed(0)}`).toBeLessThan(1.5);
      }
    }
  });

  it('las constantes del shader salen del módulo y la anatomía lo incluye', () => {
    expect(ANATOMY_GLSL).toContain(RIBCAGE_GLSL);
    expect(RIBCAGE_GLSL).toContain(`#define RIBS_PER_SIDE ${RIBS_PER_SIDE}`);
    expect(RIBCAGE_GLSL).toContain(`#define RIB_COLS ${RIB_TABLE_COLS}`);
    expect(RIBCAGE_GLSL).toContain(`#define RIB_DU ${RIB_TABLE_DU_MM.toFixed(4)}`);
    expect(RIBCAGE_GLSL).toContain(`#define RIB_BASE ${RIB_TABLE_BASE}`);
    expect(ANATOMY_GLSL).toContain(`#define MAX_RIBS ${MAX_RIBS}`);
    // el lado de la muestra decide qué 12 costillas recorre el bucle (el lado es un dato de la tabla y de uRibs)
    expect(RIBCAGE_GLSL).toContain('int s = u < 0.0 ? 0 : 1;');
    expect(RIBCAGE_GLSL).toContain('int i = s * RIBS_PER_SIDE + j;');
  });

  it('la sonda en la medioclavicular corta la parrilla donde la tabla pone la estación medioclavicular', () => {
    const hit = ribLinePoint(thoraxLinePhi('midclavicular', t), t, cage);
    expect(Math.abs(wallArc(hit, t))).toBeCloseTo(cage.stations.midclavicular, 6);
  });
});
