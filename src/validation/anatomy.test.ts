import { describe, expect, it } from 'vitest';
import { RESPIRATORY_INVERSE, RespiratoryDeformation } from '../anatomy/deformation';
import { AnatomyQuery } from '../anatomy/query';
import { torsoDepth, torsoSkinPoint } from '../anatomy/primitives';
import { lungBorderAt, zoaThicknessMm } from '../anatomy/organs/lungBorder';
import { respiratoryWallOf, wallTotalOf } from '../anatomy/organs/chestWall';
import { heartStillWeight } from '../anatomy/organs/heart';
import { smoothstep } from '../core/vec3';
import { wallArc } from '../anatomy/organs/wall';
import { AnatomyScene, BASELINE_INSTANT, FACE_GEOMETRIES, faceGeometryOf, type FaceGeometry } from '../anatomy/scene';
import { Interface } from '../anatomy/interfaces';
import { Tissue } from '../anatomy/tissues';
import { PhysiologyEngine } from '../physiology/engine';
import { defaultPatient } from '../physiology/patientState';
import { contactCoupling, probeContact } from '../probe/contact';
import { CONVEX_C35, lineDirection, pointOnLine, probeFrame, skinSoftness, type ProbePose } from '../probe/probe';
import { RIBCAGE, ribLinePoint } from '../anatomy/organs/ribcage';
import { ribZ } from './support/chestView';

/**
 * Anatomía implícita de la escena (adaptada de `src/validation/anatomy.test.ts` de VExUS, decisión 10):
 * las pruebas de VExUS cuya intención sirve al tórax, con la escena del tórax (pared, costillas, columna,
 * diafragma, cortina y pulmón) en lugar de la abdominal. Lo del hígado, la vesícula, los riñones y los vasos
 * no se porta; bajo el diafragma queda el «resto» genérico (`abdomen-generic-tissue`).
 */
const NORMAL_ADULT = defaultPatient();

/**
 * Punto a `insideMm` bajo la cara interna de la pared (la pleura parietal) en el rayo radial de la piel del ángulo φ, a la
 * altura z (lus-sim, decisión 17: la pared cambia por región; bisección en `insideWallMm`).
 */
function underWall(scene: AnatomyScene, phi: number, z: number, insideMm: number): [number, number, number] {
  const s = torsoSkinPoint(phi, z, scene.torso);
  const R = Math.hypot(s[0], s[1]);
  let lo = 0;
  let hi = 60;
  for (let i = 0; i < 50; i++) {
    const d = 0.5 * (lo + hi);
    if (scene.insideWallMm([s[0] * (1 - d / R), s[1] * (1 - d / R), z]) < insideMm) lo = d;
    else hi = d;
  }
  const d = 0.5 * (lo + hi);
  return [s[0] * (1 - d / R), s[1] * (1 - d / R), z];
}

describe('Anatomía implícita (base B)', () => {
  const scene = new AnatomyScene(NORMAL_ADULT);
  const cls = (p: [number, number, number]) => scene.classify(p, BASELINE_INSTANT);

  it('clasifica puntos de referencia', () => {
    expect(cls([0, 200, 0]).tissue).toBe(Tissue.Air);
    // lus-sim (decisión 28): los puntos, respecto de la piel del tronco (b = 113; en VExUS, 105)
    const b = scene.torso.b;
    expect(cls([0, b - 1, 0]).tissue).toBe(Tissue.Skin);
    expect(cls([0, b - 10, -120]).tissue).toBe(Tissue.Fat);
    // la columna, con la piel de la espalda (en VExUS, el cuerpo en −46 y la apófisis en −70)
    const back = -b;
    expect(cls([0, back + 59, 0]).tissue).toBe(Tissue.Vertebra);
    // apófisis transversa (lus-sim, decisión 29: hasta 29,3 mm de la línea media; en VExUS, 40)
    expect(cls([25, back + 35, 0]).tissue).toBe(Tissue.Vertebra);
    // no hay arco costal por detrás de la columna: lo que hay ahí es vértebra, no costilla
    expect(cls([-25, back + 35, 5]).tissue).toBe(Tissue.Vertebra);
    expect(cls([-25, back + 35, 5]).tissue).not.toBe(Tissue.Bone);
    // las apófisis espinosas (decisión 29): la punta de la de T7, bajo la piel a la altura del cuerpo de T8; a 2,8 mm por fuera de su barra, hacia arriba, músculo
    const seg = RIBCAGE.params.thoracicSegmentMm.value;
    expect(cls([0, back + 12, 1.5 * seg]).tissue).toBe(Tissue.Vertebra);
    expect(cls([0, back + 12, 2 * seg]).tissue).toBe(Tissue.Muscle);
    // tórax sobre las cúpulas: pulmón en los dos lados (fuera del corazón, `heart-simplified`)
    expect(cls([-55, -5, 70]).tissue).toBe(Tissue.Lung);
    expect(cls([80, 50, 90]).tissue).toBe(Tissue.Lung);
    expect(cls([0, 60, 100]).tissue).toBe(Tissue.Lung);
    // bajo el diafragma, el «resto» de VExUS donde en VExUS está el hígado (`abdomen-generic-tissue`)
    expect(cls([-60, 20, -10]).tissue).toBe(Tissue.Bowel);
    // la 5.ª costilla derecha en la línea axilar media es hueso; junto al esternón, cartílago con su pericondrio; el
    // esternón, hueso en la línea media (decisión 16, `organs/ribcage.ts`)
    const onRib = (phi: number, n = 5): [number, number, number] => {
      const [x, y] = ribLinePoint(phi, scene.torso, scene.ribCage);
      return [x, y, ribZ(scene, n, phi)];
    };
    expect(cls(onRib(Math.PI)).tissue).toBe(Tissue.Bone);
    expect(cls(onRib(0.56 * Math.PI)).tissue).toBe(Tissue.Cartilage);
    expect(cls(onRib(0.56 * Math.PI)).interface).toBe(Interface.Perichondrium);
    // y la del lado izquierdo, igual
    expect(cls(onRib(0)).tissue).toBe(Tissue.Bone);
    expect(cls(onRib(0.44 * Math.PI)).tissue).toBe(Tissue.Cartilage);
    // en la línea media anterior la métrica radial es la normal (|∇| = 1)
    const sternumDepth = (z: number) =>
      scene.wallThicknessAt([0, scene.torso.b, z]) - scene.ribCage.pleuraComplex - 0.5 * scene.ribCage.sternum.thickness;
    expect(cls([0, scene.torso.b - sternumDepth(60), 60]).tissue).toBe(Tissue.Bone);
    expect(cls([0, scene.torso.b - sternumDepth(-10), -10]).tissue).toBe(Tissue.Cartilage); // el xifoides
    // ningún punto clasificado lleva vaso (el tórax portado no tiene vasos: la forma de VExUS, con null)
    for (const p of [
      [-55, -5, 70],
      [-60, 20, -10],
      [0, -46, 0],
    ] as [number, number, number][]) {
      expect(cls(p).vessel).toBeNull();
      expect(cls(p).vesselHit).toBeNull();
      expect(cls(p).flowFactor).toBe(1);
    }
  });

  it('la parrilla tiene 12 costillas numeradas en cada hemitórax, simétricas (decisión 16)', () => {
    // Guarda del orden de la escena, el que leen la tabla de la GPU y el bucle del shader: derechas 1–12 y después
    // izquierdas 1–12; las dos parrillas son espejo una de la otra
    expect(scene.ribs).toHaveLength(24);
    expect(scene.ribs.map((r) => [r.side, r.number])).toEqual([
      ...Array.from({ length: 12 }, (_, i) => [-1, i + 1]),
      ...Array.from({ length: 12 }, (_, i) => [1, i + 1]),
    ]);
    for (let i = 0; i < 12; i++) {
      const { side: _r, ...right } = scene.ribs[i];
      const { side: _l, ...left } = scene.ribs[12 + i];
      expect(left).toEqual(right);
    }
  });

  it('el «resto» bajo el diafragma mide su distancia a la frontera: tiende a 0 junto al diafragma', () => {
    // Antes (VExUS) valía 5 mm fijos: el gate volumétrico daba por interior un punto pegado al diafragma
    // y float32 lo clasificaba al otro lado (Bowel→Diaphragm en CI). Subiendo por cinco columnas (las tres de
    // VExUS y dos bajo la cúpula derecha, donde VExUS tiene el hígado), el bd de cada punto del resto no supera
    // la distancia a la interfaz que se encuentra: el diafragma
    for (const [x, y] of [
      [70, -5],
      [60, 20],
      [40, 30],
      [-60, 20],
      [-100, 0],
    ] as const) {
      const samples: Array<{ z: number; bd: number }> = [];
      let zT = Number.NaN;
      for (let z = -120; z < 60; z += 0.25) {
        const c = cls([x, y, z]);
        if (c.tissue === Tissue.Bowel) samples.push({ z, bd: c.boundaryDistance });
        else if (samples.length && samples[samples.length - 1].z === z - 0.25) {
          expect(c.tissue, `${x},${y}`).toBe(Tissue.Diaphragm);
          zT = z;
          break;
        }
      }
      expect(zT, `${x},${y}: sin transición`).not.toBeNaN();
      // el último punto del resto está a < 0,3 mm de la transición (el paso de la columna es 0,25 mm)
      expect(samples[samples.length - 1].bd).toBeLessThan(0.3);
      for (const p of samples.filter((q) => zT - q.z < 10)) expect(p.bd).toBeLessThanOrEqual(zT - p.z + 1e-9);
      // lejos de toda interfaz, el tope de VExUS (BOWEL_BD_CAP_MM, 5 mm)
      expect(samples[0].bd).toBe(5);
    }
  });

  it('el «resto» mide también su distancia a la pared: tiende a 0 junto a su cara interna', () => {
    // La rama es de lus-sim (decisión 10): en VExUS el hígado y los órganos se interponían entre el resto y la
    // pared; aquí el resto la toca bajo las cúpulas, así que su bd no puede pasar de la distancia a la cara interna
    // de la pared. Columnas horizontales a z = −120 (muy bajo las cúpulas: el diafragma queda lejos) desde el eje del
    // tronco hacia la derecha, la izquierda, delante y las dos diagonales anteriores (detrás está la columna); el
    // mismo criterio que la prueba anterior, con la pared como la interfaz que se encuentra
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, 1],
      [-Math.SQRT1_2, Math.SQRT1_2],
      [Math.SQRT1_2, Math.SQRT1_2],
    ] as const) {
      const samples: Array<{ r: number; bd: number }> = [];
      let rT = Number.NaN;
      for (let r = 0; r < 200; r += 0.25) {
        const c = cls([dx * r, dy * r, -120]);
        if (c.tissue === Tissue.Bowel) samples.push({ r, bd: c.boundaryDistance });
        else {
          expect([Tissue.Fat, Tissue.Muscle], `${dx},${dy}: ${Tissue[c.tissue]} a ${r} mm`).toContain(c.tissue);
          rT = r;
          break;
        }
      }
      expect(rT, `${dx},${dy}: sin transición`).not.toBeNaN();
      // el último punto del resto está a < 0,3 mm de la pared (el paso de la columna es 0,25 mm)
      expect(samples[samples.length - 1].bd, `${dx},${dy}`).toBeLessThan(0.3);
      for (const p of samples.filter((q) => rT - q.r < 10)) expect(p.bd, `${dx},${dy} a ${p.r}`).toBeLessThanOrEqual(rT - p.r + 1e-9);
      expect(samples[0].bd).toBe(5);
    }
  });

  it('el peso respiratorio es 0 en la pared y 1 en las vísceras', () => {
    expect(scene.respiratoryWeight([0, 100, 0])).toBe(0);
    // bajo la cúpula más alta (lus-sim, decisión 22: por encima, la ley de altura)
    expect(scene.respiratoryHeight.baseZ).toBeGreaterThan(0);
    expect(scene.respiratoryWeight([-90, -10, 0])).toBe(1);
    // la columna no respira
    expect(scene.respiratoryWeight([scene.spine.x0, scene.spine.y0, 0])).toBe(0);
    // lus-sim (decisión 18): ni el corazón, ni el tapón de su ventana, que no se separa de él al respirar
    expect(scene.respiratoryWeight(scene.heart.center)).toBe(0);
    expect(scene.respiratoryWeight([-60, 20, 20])).toBeLessThan(1);
    // lus-sim (decisión 22): la ley de altura, en recta de la cota de la cúpula a la altura en que se apaga el deslizamiento
    const { baseZ, topZ } = scene.respiratoryHeight;
    expect(topZ - baseZ).toBeCloseTo(scene.lungBorder.slideSpanMm, 9);
    const at = (z: number) => scene.respiratoryWeight([-90, -10, z]);
    expect(at(baseZ)).toBe(1);
    expect(at(0.5 * (baseZ + topZ))).toBeCloseTo(0.5, 9);
    expect(at(topZ)).toBe(0);
    expect(at(topZ + 50)).toBe(0);
  });

  it('el peso es el producto de la pared, la columna, el corazón y la ley de altura (decisión 22), con la pared de la clasificación', () => {
    // contra una cuenta independiente: la profundidad bajo la pared de la clasificación (`insideWallMm`) donde la pared que mira
    // el campo es la de verdad (fuera del paso al abdomen alargado), y cada factor con sus números
    const { baseZ, topZ } = scene.respiratoryHeight;
    let n = 0;
    for (let x = -155; x <= 155; x += 11)
      for (let y = -100; y <= 100; y += 11) {
        if (torsoDepth([x, y, 0], scene.torso) > 0) continue;
        const c = scene.respiratoryColumn(x, y);
        for (let z = -280; z <= 280; z += 13) {
          const m: [number, number, number] = [x, y, z];
          if (respiratoryWallOf(scene.chestWall, c.wall, c.wallBlendMm, z) !== wallTotalOf(scene.chestWall, c.wall, z)) continue;
          n++;
          const spine = smoothstep(scene.spine.r + 5, scene.spine.r + 35, Math.hypot(x - scene.spine.x0, y - scene.spine.y0));
          const height = Math.min(1, Math.max(0, (topZ - z) / (topZ - baseZ)));
          const expected = smoothstep(0, 25, scene.insideWallMm(m)) * spine * heartStillWeight(scene.heart, m) * height;
          expect(scene.respiratoryWeight(m)).toBeCloseTo(expected, 12);
          // y por su vertical, lo mismo
          expect(scene.respiratoryWeightAt(c, z)).toBe(scene.respiratoryWeight(m));
        }
      }
    expect(n).toBeGreaterThan(5000);
  });

  it('classifyWorld clasifica el punto material del mundo y da la velocidad respiratoria del tejido (sin sangre)', () => {
    const engine = new PhysiologyEngine({ ...NORMAL_ADULT, respiratoryPattern: 'deep' });
    while (engine.sample.resp.volumeRate <= 0 || engine.sample.resp.volume < 0.3) engine.step();
    const q = new AnatomyQuery(scene);
    const p: [number, number, number] = [-60, 20, 0];
    const w = q.classifyWorld(p, engine.sample);
    expect(w.material).toEqual(q.deformation.toMaterial(p, engine.sample.resp));
    expect(w.tissue).toBe(scene.classify(w.material, q.instantFor(engine.sample)).tissue);
    expect(w.bloodVelocity).toBeNull();
    expect(w.flowBasis).toBeNull();
    // al inspirar, las vísceras bajan: velocidad a lo largo de la dirección de la deformación, (0, 0, −1) (lus-sim, decisión
    // 22; en VExUS, (0, 0,15, −1) normalizada)
    const dir = RespiratoryDeformation.direction;
    expect(dir).toEqual([0, 0, -1]);
    const speed = engine.sample.resp.diaphragmVelocityMmS * scene.respiratoryWeight(w.material);
    expect(speed).toBeGreaterThan(0);
    for (let a = 0; a < 3; a++) expect(w.tissueVelocity[a]).toBeCloseTo(dir[a] * speed, 9);
    expect(w.tissueVelocity[2]).toBeLessThan(0);
    // la pared no se mueve
    expect(Math.hypot(...q.classifyWorld([0, 100, 60], engine.sample).tissueVelocity)).toBe(0);
  });

  it('por el camino real (motor → consulta → escena) la cortina baja con la inspiración del reloj', () => {
    // un punto 1,5 mm bajo la pared del seno costofrénico lateral derecho, 23 mm bajo el borde del pulmón en FRC: el
    // diafragma de la ZOA en espiración y pulmón cuando el diafragma del instante ha bajado más de 23 mm (el borde de la
    // cortina, el de FRC menos el descenso, pasa por debajo). A 1,5 mm de la pared el peso respiratorio es smoothstep(0,
    // 25, 1,5) ≈ 0,01: el punto material sube unos 0,55 mm con los 53 mm de descenso, así que se deja ±1 mm de descenso
    // alrededor de 23 sin juzgar. lus-sim (decisión 17): el punto, a 1,5 mm de la cara interna de la pared de ese punto
    // (por región); (decisión 18) con el borde del pulmón de la base (la 8.ª costilla en la LAM) y la ZOA bajo él
    const phi = Math.PI * 0.95;
    const zL = lungBorderAt(scene.lungBorder, wallArc(underWall(scene, phi, 0, 1.5), scene.torso))[0];
    const p = underWall(scene, phi, zL - 23, 1.5);
    const q = new AnatomyQuery(scene);
    const engine = new PhysiologyEngine({ ...NORMAL_ADULT, respiratoryPattern: 'deep' });
    const seen = new Set<Tissue>();
    let maxCaudal = 0;
    for (let i = 0; i < Math.round(60 / NORMAL_ADULT.respiratoryRateMin / engine.clock.dt); i++) {
      const s = engine.step();
      const instant = q.instantFor(s);
      expect(instant.diaphragmCaudalMm).toBe(s.resp.diaphragmCaudalMm);
      maxCaudal = Math.max(maxCaudal, instant.diaphragmCaudalMm);
      const t = q.classifyWorld(p, s).tissue;
      seen.add(t);
      if (s.resp.diaphragmCaudalMm < 22) expect(t).toBe(Tissue.Diaphragm);
      if (s.resp.diaphragmCaudalMm > 24) expect(t).toBe(Tissue.Lung);
    }
    // la inspiración profunda baja el diafragma 53 mm (lus-sim, decisión 22: la base en supino) y el punto pasa de un tejido
    // al otro dentro del ciclo
    expect(maxCaudal).toBeCloseTo(53, 1);
    expect([...seen].sort()).toEqual([Tissue.Lung, Tissue.Diaphragm].sort());
  });

  it('la deformación es invertible y desplaza lo que hay bajo el diafragma en sentido caudal', () => {
    const engine = new PhysiologyEngine({ ...NORMAL_ADULT, respiratoryPattern: 'deep' });
    while (engine.sample.resp.volume < 0.9) engine.step();
    const q = new AnatomyQuery(scene);
    const m: [number, number, number] = [-90, -10, 20];
    const w = q.deformation.toWorld(m, engine.sample.resp);
    // excursión profunda de 53 mm × volumen ≥ 0,9 × peso (la ley de altura en z 20: 0,96), en −z (lejos del corazón, que
    // no respira)
    expect(w[2]).toBeLessThan(m[2] - 40);
    expect(w[0]).toBe(m[0]);
    expect(w[1]).toBe(m[1]);
    const back = q.deformation.toMaterial(w, engine.sample.resp);
    expect(Math.hypot(back[0] - m[0], back[1] - m[1], back[2] - m[2])).toBeLessThan(RESPIRATORY_INVERSE.toleranceMm);
    // la pared no se mueve con la respiración
    // (decisión 28: 10 mm bajo la piel de delante, b − 10)
    const wall: [number, number, number] = [0, scene.torso.b - 10, 60];
    expect(q.deformation.toWorld(wall, engine.sample.resp)).toEqual(wall);
  });
});

describe('Sonda (guía §8)', () => {
  const scene = new AnatomyScene(NORMAL_ADULT);
  const pose: ProbePose = { phi: Math.PI * 0.92, z: 5, lift: 0, yaw: 0.3, rock: 0.1, tilt: -0.2 };
  const fr = probeFrame(pose, scene.torso, CONVEX_C35);

  it('el marco es ortonormal y el eje axial entra en el paciente', () => {
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(Math.abs(dot(fr.axial, fr.lateral))).toBeLessThan(1e-6);
    expect(Math.abs(dot(fr.axial, fr.elevation))).toBeLessThan(1e-6);
    expect(Math.abs(dot(fr.lateral, fr.elevation))).toBeLessThan(1e-6);
    expect(dot(fr.axial, fr.skinNormal)).toBeLessThan(-0.9);
  });

  it('la línea central parte de la cara y sigue el eje axial', () => {
    const p0 = pointOnLine(fr, CONVEX_C35, 0, 0);
    expect(Math.hypot(p0[0] - fr.face[0], p0[1] - fr.face[1], p0[2] - fr.face[2])).toBeLessThan(1e-6);
    const d = lineDirection(fr, 0);
    expect(Math.abs(d[0] - fr.axial[0]) + Math.abs(d[1] - fr.axial[1]) + Math.abs(d[2] - fr.axial[2])).toBeLessThan(1e-9);
  });

  it('el acoplamiento es total en contacto y se pierde al separar o bascular (contacto de la decisión 63)', () => {
    const coupling = (pose: ProbePose, theta: number) => contactCoupling(probeContact(pose, CONVEX_C35, scene.torso), theta);
    const flat: ProbePose = { phi: 0, z: 0, lift: 0, yaw: 0, rock: 0, tilt: 0 };
    expect(coupling(flat, 0)).toBe(1);
    expect(coupling({ ...flat, lift: 12 }, 0)).toBe(0);
    const rocked = { ...flat, rock: 0.35 };
    expect(coupling(rocked, CONVEX_C35.halfSector)).toBeLessThan(coupling(rocked, -CONVEX_C35.halfSector));
    // la pared blanda del epigastrio absorbe la basculación: bajo el xifoides se conserva más
    // contacto que sobre las costillas del flanco con la misma basculación craneal (decisión 43)
    const mean = (pose: ProbePose) => {
      const k = probeContact(pose, CONVEX_C35, scene.torso);
      let c = 0;
      for (let i = 0; i <= 40; i++) c += contactCoupling(k, -CONVEX_C35.halfSector + (2 * CONVEX_C35.halfSector * i) / 40) / 41;
      return c;
    };
    const epigastrium: ProbePose = { phi: Math.PI / 2 + 0.2, z: -20, lift: 0, yaw: 0, rock: 0.5, tilt: 0 };
    const ribs: ProbePose = { phi: Math.PI * 0.9, z: 20, lift: 0, yaw: 0, rock: 0.5, tilt: 0 };
    expect(skinSoftness(epigastrium)).toBeGreaterThan(0.6);
    expect(skinSoftness(ribs)).toBeLessThan(0.2);
    expect(mean(epigastrium)).toBeGreaterThan(0.65);
    expect(mean(epigastrium)).toBeGreaterThan(mean(ribs) + 0.1);
  });
});

describe('Cortina pulmonar (decisión 43)', () => {
  const scene = new AnatomyScene(NORMAL_ADULT);
  it('el pulmón baja por el seno costofrénico solo por debajo del borde que baja con la inspiración, a los dos lados', () => {
    // un punto 2,5 mm bajo la pared del flanco derecho (entre la lámina del diafragma de la ZOA en FRC, 1,9 mm, y la de la
    // cortina, 3 mm), 20 mm bajo el borde del pulmón en FRC: el «resto» en espiración, pulmón en inspiración profunda (el
    // borde baja 30 mm). lus-sim (decisión 17): el punto, a 2,5 mm de la cara interna de la pared de ese punto (por región);
    // (decisión 18) con el borde del pulmón de la base y la cortina en los dos hemitórax (en VExUS, solo a la derecha)
    const phi = Math.PI * 0.95;
    const zL = lungBorderAt(scene.lungBorder, wallArc(underWall(scene, phi, 0, 2.5), scene.torso))[0];
    const p = underWall(scene, phi, zL - 20, 2.5);
    const at = (q: [number, number, number], caudal: number) =>
      scene.classify(q, { ...BASELINE_INSTANT, diaphragmCaudalMm: caudal }).tissue;
    expect(at(p, 0)).toBe(Tissue.Bowel);
    expect(at(p, 30)).toBe(Tissue.Lung);
    expect(scene.inLungCurtain(p, { diaphragmCaudalMm: 30 })).toBe(true);
    expect(scene.inLungRecess(p)).toBe(true);
    // el mismo punto 10 mm más hondo nunca es cortina (lámina de 3 mm)
    const deep = underWall(scene, phi, zL - 20, 12.5);
    expect(at(deep, 30)).toBe(Tissue.Bowel);
    // y en el lado izquierdo, lo mismo (la tabla de los bordes es la misma a los dos lados)
    const left: [number, number, number] = [-p[0], p[1], p[2]];
    expect(at(left, 0)).toBe(Tissue.Bowel);
    expect(at(left, 30)).toBe(Tissue.Lung);
    // sin la cortina (withCurtain = false) el punto de la lámina es lo que hay detrás: el diafragma de la ZOA, que engruesa
    // al inspirar (5 mm a TLC)
    expect(scene.classify(p, { diaphragmCaudalMm: 30 }, false).tissue).toBe(Tissue.Diaphragm);
    // a 1 mm de la pared, bajo el borde, en espiración: el diafragma de la ZOA contra la pared
    expect(at(underWall(scene, phi, zL - 20, 1), 0)).toBe(Tissue.Diaphragm);
    expect(zoaThicknessMm(0)).toBeGreaterThan(1);
  });

  it('el borde del pulmón que toca la pared: el de su columna, que baja con el diafragma hasta la reflexión pleural', () => {
    for (const phi of [0.6 * Math.PI, 0.95 * Math.PI, 1.15 * Math.PI, 0.05 * Math.PI, -0.15 * Math.PI]) {
      const front = underWall(scene, phi, 60, 0);
      const [zL, zR] = lungBorderAt(scene.lungBorder, wallArc(front, scene.torso));
      // en FRC, a z 60 el pulmón toca la pared 60 − zL mm por encima de su borde
      expect(scene.lungEdgeMm(front, BASELINE_INSTANT)!, `φ ${phi / Math.PI}π`).toBeCloseTo(60 - zL, 6);
      // al inspirar baja lo que el diafragma, sin pasar de la reflexión
      expect(scene.lungEdgeMm(front, { diaphragmCaudalMm: 10 })!).toBeCloseTo(60 - zL + 10, 6);
      expect(scene.lungEdgeMm(front, { diaphragmCaudalMm: 500 })!).toBeCloseTo(60 - zR, 6);
    }
  });
});

describe('Caras geométricas del banco de interfaces (faceSdf)', () => {
  // La incidencia de cada pared y cada cara del banco (y la e2e de normales de la GPU) sale del
  // gradiente de `faceSdf`: debe valer la distancia de la clasificación, con su signo y pendiente 1.
  const scene = new AnatomyScene(NORMAL_ADULT);
  type V = [number, number, number];
  const sdf = (face: FaceGeometry) => (p: V) => scene.faceSdf(p, BASELINE_INSTANT, face);
  const grad = (f: (p: V) => number | null, p: V, eps = 0.02): V => {
    const g: V = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      const plus: V = [...p];
      const minus: V = [...p];
      plus[a] += eps;
      minus[a] -= eps;
      g[a] = (f(plus)! - f(minus)!) / (2 * eps);
    }
    return g;
  };
  const along = (p: V, d: V, t: number): V => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
  /** Cruce con la cara (sdf = 0) sobre el segmento p0 → p0 + d·tMax, con sdf(p0) < 0 < sdf(fin). */
  const crossing = (face: FaceGeometry, p0: V, d: V, tMax: number): V => {
    let lo = 0;
    let hi = tMax;
    expect(sdf(face)(p0)!).toBeLessThan(0);
    expect(sdf(face)(along(p0, d, tMax))!).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if (sdf(face)(along(p0, d, mid))! > 0) hi = mid;
      else lo = mid;
    }
    return along(p0, d, 0.5 * (lo + hi));
  };

  it('el tórax tiene la cara de la cúpula y la de la ZOA (lus-sim, decisión 18)', () => {
    expect(FACE_GEOMETRIES).toEqual(['dome', 'zoa']);
    // la geometría por interfaz es la de la cúpula; en la ZOA, `faceGradient` la cambia por la de su lámina
    expect(faceGeometryOf(Interface.DiaphragmLiver)).toBe('dome');
    for (const i of [Interface.None, Interface.PleuraWall, Interface.LiverCapsule, Interface.IvcLumen, Interface.RenalCapsule])
      expect(faceGeometryOf(i)).toBeNull();
  });

  it('cúpula: negativa en el tórax, positiva en el abdomen y pendiente 1 en la cara', () => {
    expect(sdf('dome')([-55, -5, 70])!).toBeLessThan(0); // tórax
    expect(sdf('dome')([-60, 20, -10])!).toBeGreaterThan(0); // abdomen
    // pendiente 1 sobre la cara: cúpula desde el pulmón hacia abajo, en las dos cúpulas
    const exact: Array<[V, V, number]> = [
      // lus-sim (decisión 18): las cúpulas del adulto en FRC (27 y 12 mm; en VExUS, 55 y 25): se cruzan más abajo
      [[-55, -5, 70], [0, 0, -1], 80],
      [[-70, 10, 60], [0, 0, -1], 80],
      [[70, -5, 40], [0, 0, -1], 60],
    ];
    for (const [p0, d, tMax] of exact) {
      const g = grad(sdf('dome'), crossing('dome', p0, d, tMax));
      expect(Math.abs(Math.hypot(...g) - 1), `cúpula desde ${p0.join(',')}`).toBeLessThan(1e-3);
    }
  });

  it('ZOA (decisión 18): negativa hacia la pared, positiva hacia el abdomen, con la normal de la pared', () => {
    const phi = Math.PI * 0.95;
    const zL = lungBorderAt(scene.lungBorder, wallArc(underWall(scene, phi, 0, 1), scene.torso))[0];
    const inZoa = underWall(scene, phi, zL - 15, 0.5);
    const beyond = underWall(scene, phi, zL - 15, 4);
    expect(sdf('zoa')(inZoa)!).toBeLessThan(0);
    expect(sdf('zoa')(beyond)!).toBeGreaterThan(0);
    // la cara abdominal de la lámina: la clasificación la dibuja en su mitad de dentro y faceGradient usa su geometría
    const face = underWall(scene, phi, zL - 15, 0.8 * zoaThicknessMm(0));
    const c = scene.classify(face, BASELINE_INSTANT);
    expect(c.tissue).toBe(Tissue.Diaphragm);
    expect(c.interface).toBe(Interface.DiaphragmLiver);
    const g = scene.faceGradient(face, BASELINE_INSTANT)!;
    const gz = grad(sdf('zoa'), face);
    const l = Math.hypot(...gz);
    expect(g.normal[0] * gz[0] + g.normal[1] * gz[1] + g.normal[2] * gz[2]).toBeCloseTo(l, 3);
    // hacia dentro: el gradiente apunta lejos de la piel
    expect(g.normal[0] * face[0] + g.normal[1] * face[1]).toBeLessThan(0);
  });

  it('en el mundo, faceSdfWorld es la cara del punto material que da la deformación', () => {
    const q = new AnatomyQuery(scene);
    const engine = new PhysiologyEngine({ ...NORMAL_ADULT, respiratoryPattern: 'apnea-expiratory' });
    const p: V = [-55, -5, 70];
    expect(q.faceSdfWorld(p, engine.sample, 'dome')).toBeCloseTo(sdf('dome')(p)!, 9);
  });
});

describe('Caras de interfaz en classify (decisión 57)', () => {
  // Cada punto dice qué cara dibuja (una por estructura) y a qué distancia está de ella; la GPU dice
  // lo mismo (`Cls.iface`, `Cls.ifd`) y la e2e de equivalencia lo comprobará punto a punto (paso B).
  const scene = new AnatomyScene(NORMAL_ADULT);
  type V = [number, number, number];
  const cls = (p: V) => scene.classify(p, BASELINE_INSTANT);
  const sdf = (face: FaceGeometry, p: V) => scene.faceSdf(p, BASELINE_INSTANT, face)!;
  const along = (p: V, d: V, t: number): V => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
  const crossing = (face: FaceGeometry, p0: V, d: V, tMax: number): V => {
    let lo = 0;
    let hi = tMax;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if (sdf(face, along(p0, d, mid)) > 0) hi = mid;
      else lo = mid;
    }
    return along(p0, d, 0.5 * (lo + hi));
  };

  it('diafragma: la mitad abdominal dibuja la cara hepática a 2,5 − dDome; la pleural, ninguna', () => {
    const c = crossing('dome', [-55, -5, 70], [0, 0, -1], 80);
    const pleural = along(c, [0, 0, -1], 0.5);
    expect(cls(pleural).tissue).toBe(Tissue.Diaphragm);
    expect(sdf('dome', pleural)).toBeLessThan(1.25);
    expect(cls(pleural).interface).toBe(Interface.None);
    const abdominal = along(c, [0, 0, -1], 2);
    const d = sdf('dome', abdominal);
    expect(d).toBeGreaterThan(1.25);
    expect(d).toBeLessThan(2.5);
    expect(cls(abdominal).tissue).toBe(Tissue.Diaphragm);
    expect(cls(abdominal).interface).toBe(Interface.DiaphragmLiver);
    expect(cls(abdominal).interfaceDistance).toBeCloseTo(2.5 - d, 9);
  });

  it('el «resto» y el pulmón no dibujan cara; el músculo de la pared, la de su capa (decisión 62)', () => {
    for (const [p, t] of [
      [[40, 40, -120], Tissue.Bowel],
      [[-60, 20, -10], Tissue.Bowel],
      [[-55, -5, 70], Tissue.Lung],
    ] as [V, Tissue][]) {
      expect(cls(p).tissue).toBe(t);
      expect(cls(p).interface, Tissue[t]).toBe(Interface.None);
      expect(cls(p).interfaceDistance).toBe(1e3);
    }
    // a 20 mm bajo la piel (músculo de 16 a 25,9 mm): la cara de pared más cercana, a menos de medio músculo. Bajo el
    // reborde costal (lus-sim, decisión 16: a z = −10 en esa línea está el cartílago de la 7.ª costilla) y bajo la mezcla
    // con la pared torácica (decisión 17: 100 mm), la pared del abdomen de VExUS
    // (decisión 28: en la misma radial y a la misma profundidad que en el tronco de VExUS, 160 × 105)
    const radial = (x: number, y: number, d: number): [number, number, number] => {
      const t = scene.torso;
      const phi = Math.atan2(y / 105, x / 160);
      const s = torsoSkinPoint(phi, -200, t);
      const r = Math.hypot(s[0], s[1]);
      return [s[0] * (1 - d / r), s[1] * (1 - d / r), -200];
    };
    const muscle = cls(radial(-64, 76.8, 20));
    expect(muscle.tissue).toBe(Tissue.Muscle);
    expect([Interface.DeepFascia, Interface.ObliquePlane, Interface.TransversusPlane, Interface.Transversalis]).toContain(muscle.interface);
    expect(muscle.interfaceDistance).toBeLessThan(5);
    // la grasa preperitoneal (2,1 mm) de la cara interna de la pared
    expect(cls(radial(-60, 72, scene.wallThicknessAt(radial(-60, 72, 0)) - 1)).tissue).toBe(Tissue.Fat);
  });
});
