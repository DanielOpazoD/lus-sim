import { describe, expect, it } from 'vitest';
import { ANATOMY_GLSL } from '../anatomy/gpu/anatomy.glsl';
import { SCENE_UNIFORMS } from '../anatomy/gpu/sceneUniforms';
import {
  FIRST_WALL_INTERFACE,
  INTERFACES,
  INTERFACE_COUNT,
  INTERFACE_GLSL_NAME,
  Interface,
  LAST_WALL_INTERFACE,
  hasCurvatureCoherence,
  interfaceReflectivity,
  isRibInterface,
  isWallLayerInterface,
} from '../anatomy/interfaces';
import { ORGAN_MODULES } from '../anatomy/organs';
import {
  WALL,
  WALL_GLSL,
  preperitonealMm,
  wallArc,
  wallDepths,
  wallPerimeter,
  wallPlaneDepth,
  wallPlaneGap,
  wallWave,
} from '../anatomy/organs/wall';
import { torsoDepth, torsoDepthGradient, torsoNormal, torsoSkinPoint, type Torso } from '../anatomy/primitives';
import { MAX_RIBS, ribCenterDepth, ribCurvature, ribLinePoint, ribMetric, ribSd, ribTableZ, ribTangent } from '../anatomy/organs/ribcage';
import { AnatomyScene, BASELINE_INSTANT, faceGeometryOf } from '../anatomy/scene';
import { TISSUE_COUNT, Tissue } from '../anatomy/tissues';
import type { Vec3 } from '../core/vec3';
import { defaultPatient } from '../physiology/patientState';
import { CONVEX_C35, lineDirection, pointOnLine, probeFrame } from '../probe/probe';
import { CONVEX_C35_PROFILE } from '../ultrasound/transducerProfile';
import {
  IFACE_GRADIENT_MAX,
  IFACE_REACH_MM,
  IFACE_SHIFT_MM,
  INTERFACE_ECHO_GLSL,
  faceDelta,
  faceLitFromProbe,
  interfaceEchoField,
} from '../ultrasound/interfaceEcho';
import { FRAG_RAWFIELD, FRAG_RAWFIELD_STEERED } from '../ultrasound/shaders/passes.glsl';
import { intercostalZ } from './support/chestView';
import {
  WALL_FACE_ECHO_GLSL,
  WALL_TEXTURE,
  WALL_TEXTURE_GLSL,
  fatSeptum,
  muscleStriation,
  wallFaceEchoFlat,
  wallFaceGain,
  wallOrientation,
  wallTexture,
} from '../ultrasound/wallTexture';

/**
 * Pared torácica y abdominal realista (decisión 62): geometría de las capas y de sus caras (TS, con su gemelo
 * GLSL en `organs/wall.ts`), la tabla de caras nuevas y la textura de la pasada B (`wallTexture.ts`). Antes la
 * pared eran tres bandas uniformes sin ninguna cara: estas pruebas fallan en `main` (no existe nada de esto).
 *
 * lus-sim (decisiones 10 y 12): la misma pared que VExUS, con la escena del tórax y el paciente por omisión; la vista del
 * flanco de VExUS pasa a un corte longitudinal del EIC5 en la línea axilar media, con costillas a los dos lados de la
 * línea central. Lo que comprueba el shader ensamblado volvió con la GPU (paso B2). Desde la decisión 16 las costillas
 * son las de la parrilla del adulto promedio (`organs/ribcage.ts`), con sus propias pruebas en `anatomyTargets.test.ts`;
 * aquí, sus caras en la pared.
 */
const scene = new AnatomyScene(defaultPatient());
const t = scene.torso;
const cls = (p: Vec3) => scene.classify(p, BASELINE_INSTANT);
/** Punto a la profundidad d bajo la piel en el ángulo del tronco φ (radial desde el eje, la métrica de las capas). */
const at = (phi: number, z: number, d: number): Vec3 => {
  const skin: Vec3 = [t.a * Math.cos(phi), t.b * Math.sin(phi), z];
  const k = 1 - d / Math.hypot(skin[0], skin[1]);
  return [skin[0] * k, skin[1] * k, z];
};
const FLANK = Math.PI * 1.04;
/**
 * lus-sim (decisión 17): el tórax tiene su pared por región (`organs/chestWall.ts`, `chestWall.test.ts`); la pared en capas
 * de VExUS (tres músculos con sus planos, grasa de 14 mm) es la del abdomen, bajo el reborde costal. Sus pruebas miran
 * ahí: z −280 queda bajo la transición en todo el tronco (el reborde más bajo, −132 al lado, y 100 mm de mezcla), y las
 * funciones puras, con el tronco uniforme del hábito (sin la pared torácica).
 */
const ABDOMEN_Z = -280;
const tu: Torso = { ...t, chestWall: undefined };
const WALL_FACES = [
  Interface.SkinFat,
  Interface.Scarpa,
  Interface.DeepFascia,
  Interface.ObliquePlane,
  Interface.TransversusPlane,
  Interface.Transversalis,
  Interface.Peritoneum,
];

describe('capas de la pared (decisión 62)', () => {
  it('la grasa preperitoneal sale del músculo del hábito (15 % de la grasa, 1,5–4 mm) y el espesor total no cambia', () => {
    expect(preperitonealMm(14)).toBeCloseTo(2.1, 9);
    expect(preperitonealMm(5)).toBe(1.5);
    expect(preperitonealMm(40)).toBe(4);
    expect(t.preperitonealMm).toBeCloseTo(2.1, 9);
    // lus-sim (decisión 17): el hábito es la pared del abdomen, bajo el reborde costal (en el tórax, la pared por región)
    expect(scene.wallThicknessAt([0, t.b, -200])).toBeCloseTo(t.skinMm + t.fatMm + t.muscleMm, 9);
    // el esquema único sube la grasa preperitoneal en uWall.w
    const uWall = SCENE_UNIFORMS.find((u) => u.name === 'uWall')!;
    expect(uWall.type).toBe('vec4');
    expect(Array.from(uWall.value(scene, { sample: null as never, compression: null }))).toEqual([
      t.skinMm,
      t.fatMm,
      t.muscleMm,
      t.preperitonealMm,
    ]);
  });

  it('u es la longitud de arco de la piel: el cuarto de perímetro de Ramanujan y |du/ds| = 1 a ±0,5 %', () => {
    const a = t.a;
    const b = t.b;
    const ramanujan = (Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))) / 4;
    expect(wallArc([a, 0, 0], t)).toBeCloseTo(ramanujan, 0);
    expect(wallPerimeter(t) / 4).toBeCloseTo(ramanujan, 0);
    expect(wallArc([0, b, 0], t)).toBeCloseTo(0, 9);
    // +x (izquierda del paciente) es u creciente
    expect(wallArc([10, b, 0], t)).toBeGreaterThan(0);
    for (let tau = -3; tau <= 3; tau += 0.25) {
      const p = (s: number): Vec3 => [a * Math.sin(s), b * Math.cos(s), 0];
      const h = 1e-4;
      const ds = Math.hypot(p(tau + h)[0] - p(tau - h)[0], p(tau + h)[1] - p(tau - h)[1]);
      const du = wallArc(p(tau + h), t) - wallArc(p(tau - h), t);
      expect(Math.abs(du / ds - 1), `τ ${tau}`).toBeLessThan(0.005);
    }
  });

  it('las ondas son periódicas en la vuelta: sin costura donde u salta de +P/2 a −P/2 (línea media posterior)', () => {
    const P = wallPerimeter(t);
    for (let k = 0; k < 5; k++)
      for (const z of [-80, 0, 35]) expect(Math.abs(wallWave(P / 2, z, k, t) - wallWave(-P / 2, z, k, t))).toBeLessThan(1e-9);
    // la fascia profunda a ambos lados del corte, a 0,001 mm
    const left = wallDepths(t, wallArc([0.001, -104, 10], t), 10).fascia;
    const right = wallDepths(t, wallArc([-0.001, -104, 10], t), 10).fascia;
    expect(Math.abs(left - right)).toBeLessThan(1e-3);
  });

  it('orden de las caras en la pared lateral y fusión de los planos hacia el recto', () => {
    for (const z of [-60, -14, 20]) {
      const u = wallArc(at(FLANK, z, 0), tu);
      const w = wallDepths(tu, u, z);
      const p0 = wallPlaneDepth(u, z, 0, tu);
      const p1 = wallPlaneDepth(u, z, 1, tu);
      expect(w.skin).toBeLessThan(w.scarpa);
      expect(w.scarpa).toBeLessThan(w.fascia);
      expect(w.fascia).toBeLessThan(p0);
      expect(p0).toBeLessThan(p1);
      expect(p1).toBeLessThan(w.transversalis);
      expect(w.transversalis).toBeLessThan(w.peritoneum);
      // la grasa preperitoneal ondula sin bajar de 1,5 mm con 2,1 mm de media (la cara de un lado cabe)
      expect(w.peritoneum - w.transversalis).toBeGreaterThan(1.8);
      expect(wallPlaneGap(p0, 0, w)).toBeGreaterThan(WALL.planeMinMm);
      expect(wallPlaneGap(p1, 1, w)).toBeGreaterThan(WALL.planeMinMm);
    }
    // en la línea media (recto) los planos se han fundido con sus vainas
    for (const u of [-30, 0, 20]) {
      const w = wallDepths(tu, u, 0);
      expect(wallPlaneGap(wallPlaneDepth(u, 0, 0, tu), 0, w)).toBeLessThan(WALL.planeMinMm);
      expect(wallPlaneGap(wallPlaneDepth(u, 0, 1, tu), 1, w)).toBeLessThan(WALL.planeMinMm);
    }
  });

  it('classify: tejidos y caras de piel a peritoneo en el flanco, cada muestra con su capa más cercana', () => {
    const z = ABDOMEN_Z;
    const u = wallArc(at(FLANK, z, 0), t);
    const w = wallDepths(t, u, z);
    const planes = [wallPlaneDepth(u, z, 0, t), wallPlaneDepth(u, z, 1, t)];
    const expected: [number, Interface, Tissue][] = [
      [w.skin, Interface.SkinFat, Tissue.Fat],
      [w.scarpa, Interface.Scarpa, Tissue.Fat],
      [w.fascia, Interface.DeepFascia, Tissue.Muscle],
      [planes[0], Interface.ObliquePlane, Tissue.Muscle],
      [planes[1], Interface.TransversusPlane, Tissue.Muscle],
      [w.transversalis, Interface.Transversalis, Tissue.Fat],
    ];
    for (const [d, face, tissue] of expected) {
      const c = cls(at(FLANK, z, d + 0.1));
      expect(c.tissue, Interface[face]).toBe(tissue);
      expect(c.interface, Interface[face]).toBe(face);
      expect(c.interfaceDistance, Interface[face]).toBeCloseTo(0.1, 1);
    }
    // dentro de la piel, la cara dermis/grasa; junto a la cara interna, el peritoneo (de un lado)
    expect(cls(at(FLANK, z, 1)).tissue).toBe(Tissue.Skin);
    expect(cls(at(FLANK, z, 1)).interface).toBe(Interface.SkinFat);
    const pe = cls(at(FLANK, z, w.peritoneum - 0.3));
    expect(pe.tissue).toBe(Tissue.Fat);
    expect(pe.interface).toBe(Interface.Peritoneum);
    expect(pe.interfaceDistance).toBeCloseTo(0.3, 5);
    // ninguna muestra de la pared se queda sin cara ni la dibuja fuera de su capa
    for (let d = 0.05; d < w.peritoneum; d += 0.1) {
      const c = cls(at(FLANK, z, d));
      if (c.tissue === Tissue.Bone || c.tissue === Tissue.Cartilage) continue;
      expect(isWallLayerInterface(c.interface) || c.interface === Interface.RibCortex, `${d.toFixed(2)} mm`).toBe(true);
    }
  });

  it('cortical costal: la dibuja el músculo junto a la costilla ósea; el cartílago dibuja su pericondrio', () => {
    // barrido de la pared derecha: muestras de cada una, con su distancia al alcance del eco
    let rib = 0;
    let peri = 0;
    for (let phiDeg = 95; phiDeg <= 250; phiDeg += 5)
      for (let z = -100; z <= 80; z += 1)
        for (let d = 10; d < 34; d += 0.5) {
          const c = cls(at((phiDeg * Math.PI) / 180, z, d));
          if (c.interface === Interface.RibCortex) {
            expect([Tissue.Muscle, Tissue.Fat]).toContain(c.tissue);
            expect(c.interfaceDistance).toBeLessThan(WALL.ribFacePriorityMm);
            rib++;
          }
          if (c.interface === Interface.Perichondrium) {
            expect(c.tissue).toBe(Tissue.Cartilage);
            peri++;
          }
          if (c.tissue === Tissue.Bone) expect(c.interface).toBe(Interface.None);
        }
    expect(rib).toBeGreaterThan(100);
    expect(peri).toBeGreaterThan(100);
    // la prioridad de la cortical cubre el perfil de una cara de un lado con la cota de su gradiente
    expect(WALL.ribFacePriorityMm).toBeGreaterThanOrEqual((IFACE_SHIFT_MM + IFACE_REACH_MM) * IFACE_GRADIENT_MAX);
    // la sección elíptica de la costilla: en su cresta, halfThickness/halfWidth²; el eje, tangente a la piel (la 6.ª
    // derecha en el flanco)
    const cage = scene.ribCage;
    const k = 5;
    const phi = Math.PI * 1.04;
    const hit = ribLinePoint(phi, t, cage);
    const zc = ribTableZ(cage, k, Math.abs(wallArc(hit, t)));
    // el mismo rayo radial que el punto de la línea media, 1,02 semigrosores (por la normal) más somero: su cresta
    const rho = Math.hypot(hit[0] / t.a, hit[1] / t.b);
    const R = Math.hypot(hit[0], hit[1]) / rho;
    const k1 = (1 - (ribCenterDepth(hit, t, cage) - 1.02 * cage.halfThickness * ribMetric(hit, t)) / R) / rho;
    const crest: Vec3 = [hit[0] * k1, hit[1] * k1, zc];
    expect(ribCurvature(crest, k, t, cage)).toBeCloseTo(cage.halfThickness / cage.ribs[k].halfWidth ** 2, 3);
    const n = torsoNormal(crest, t);
    const tg = ribTangent(crest, k, t, cage);
    expect(Math.abs(n[0] * tg[0] + n[1] * tg[1])).toBeLessThan(0.1);
    // el esternón es plano y vertical
    expect(ribCurvature([0, 90, 50], MAX_RIBS, t, cage)).toBe(0);
    expect(ribTangent([0, 90, 50], MAX_RIBS, t, cage)).toEqual([0, 0, 1]);
  });

  it('la grasa subcutánea no corta las costillas y la búsqueda de la parrilla empieza donde una puede llegar', () => {
    // antes la grasa se clasificaba antes que las costillas: su cresta, donde asoma en la grasa, quedaba cortada por ella.
    // Toda muestra dentro de la sección de una costilla (su distancia < −0,05 mm) es hueso o cartílago
    const cage = scene.ribCage;
    let inRib = 0;
    for (let phiDeg = 92; phiDeg <= 268; phiDeg += 6)
      for (let z = -150; z <= 210; z += 2)
        for (let d = 1.5; d < scene.wallThicknessAt(at((phiDeg * Math.PI) / 180, z, 0)); d += 0.5) {
          const p = at((phiDeg * Math.PI) / 180, z, d);
          let inside = false;
          for (let k = 0; k <= MAX_RIBS; k++) if (ribSd(p, k, t, cage) < -0.05) inside = true;
          if (!inside) continue;
          inRib++;
          expect([Tissue.Bone, Tissue.Cartilage], `${phiDeg}°, z ${z}, ${d} mm`).toContain(cls(p).tissue);
        }
    expect(inRib).toBeGreaterThan(1000);
    // conservadora: ningún punto a más del grosor del esternón (el hueso más grueso) de la pleura, por la normal (|∇| ≤ 1,2),
    // está dentro de una costilla ni del esternón
    const bone = 1.2 * (cage.pleuraComplex + Math.max(2 * cage.halfThickness, cage.sternum.thickness));
    for (let phiDeg = -60; phiDeg <= 240; phiDeg += 6)
      for (let z = -150; z <= 210; z += 6) {
        // lus-sim (decisión 17): la pared de ese punto (por región)
        const depth0 = scene.wallThicknessAt(at((phiDeg * Math.PI) / 180, z, 0)) - bone;
        for (let d = 0; d < depth0; d += 1)
          for (let k = 0; k <= MAX_RIBS; k++) expect(ribSd(at((phiDeg * Math.PI) / 180, z, d), k, t, cage)).toBeGreaterThan(0);
      }
  });

  it('faceGradient de las caras de la pared: la normal de la piel y |∇| ≤ 1,1 (la métrica radial de las capas)', () => {
    for (const d of [2.1, t.skinMm + t.fatMm - 0.2]) {
      const m = at(FLANK, ABDOMEN_Z, d);
      const g = scene.faceGradient(m, BASELINE_INSTANT)!;
      const n = torsoNormal(m, t);
      expect(Math.abs(g.normal[0] * n[0] + g.normal[1] * n[1] + g.normal[2] * n[2])).toBeGreaterThan(0.99);
      expect(g.norm).toBeGreaterThan(0.99);
      expect(g.norm).toBeLessThan(1.1);
    }
    // las caras de pared y de costilla no tienen geometría de faceSdf (se tratan aparte)
    for (const f of [...WALL_FACES, Interface.RibCortex, Interface.Perichondrium]) expect(faceGeometryOf(f)).toBeNull();
  });
});

describe('caras nuevas en la tabla de la decisión 57', () => {
  it('cada cara de la pared y de la costilla tiene su fila, su nombre GLSL, su fuente y un solo tipo de dueño', () => {
    // tras la pleura parietal de la decisión 61 (12): nueve caras de la pared y las costillas, 13–21
    expect(INTERFACE_COUNT).toBe(22);
    expect(Interface.SkinFat).toBe(Interface.PleuraWall + 1);
    expect(Object.keys(INTERFACES)).toHaveLength(INTERFACE_COUNT);
    for (const f of [...WALL_FACES, Interface.RibCortex, Interface.Perichondrium]) {
      const p = INTERFACES[f];
      expect(p.source.length, Interface[f]).toBeGreaterThan(20);
      expect(interfaceReflectivity(f), Interface[f]).toBeGreaterThan(0.02);
      expect(ANATOMY_GLSL, Interface[f]).toContain(`#define ${INTERFACE_GLSL_NAME[f]} ${f}`);
    }
    for (const f of WALL_FACES) expect(isWallLayerInterface(f)).toBe(true);
    expect(FIRST_WALL_INTERFACE).toBe(Interface.SkinFat);
    expect(LAST_WALL_INTERFACE).toBe(Interface.Peritoneum);
    // de un lado: el peritoneo (la grasa preperitoneal), la cortical (el tejido blando de fuera), el pericondrio
    for (const f of [Interface.Peritoneum, Interface.RibCortex, Interface.Perichondrium]) expect(INTERFACES[f].twoSided).toBe(false);
    for (const f of WALL_FACES.filter((x) => x !== Interface.Peritoneum)) expect(INTERFACES[f].twoSided).toBe(true);
    // Fresnel de los tejidos: dermis/grasa 0,146, fascia grasa/músculo 0,138, hueso 0,59
    expect(interfaceReflectivity(Interface.SkinFat)).toBeCloseTo(0.146, 2);
    expect(interfaceReflectivity(Interface.DeepFascia)).toBeCloseTo(0.138, 2);
    expect(interfaceReflectivity(Interface.RibCortex)).toBeCloseTo(0.59, 2);
    // la coherencia de curvatura: tubos y costillas
    expect(hasCurvatureCoherence(Interface.RibCortex)).toBe(true);
    expect(hasCurvatureCoherence(Interface.Perichondrium)).toBe(true);
    expect(hasCurvatureCoherence(Interface.DeepFascia)).toBe(false);
    expect(isRibInterface(Interface.RibCortex)).toBe(true);
  });
});

describe('cortical costal: solo la cara que mira a la sonda (decisión 62)', () => {
  // Capturas con GPU (25-09-2026): cada costilla del flanco dibujaba un anillo entero (la cara anterior y la
  // posterior). La cara posterior está a la sombra del hueso: su normal exterior apunta lejos de la sonda y solo se
  // la alcanza a través del hueso; la transmisión con apertura (penumbra, decisión 54) y los caminos dirigidos (58)
  // la iluminaban a medias en los bordes de la costilla, y el eco (con |cosθ|) la dibujaba como a la anterior. Con
  // SwiftShader, el flanco con y sin la regla: sin ella, los anillos inferiores; con ella, solo el arco anterior.
  it('la cara posterior no da eco (en la mirada 0 ni en las dirigidas); sin la regla, casi tanto como la anterior', () => {
    // lus-sim: el corte longitudinal del EIC5 en la línea axilar media (costillas 4.ª a 7.ª en el plano)
    const z5 = intercostalZ(scene, 5, Math.PI);
    const fr = probeFrame({ phi: Math.PI, z: z5, lift: 0, yaw: 0, rock: 0, tilt: 0 }, t, CONVEX_C35);
    const k0 = (2 * Math.PI) / (1540 / (CONVEX_C35_PROFILE.bEffectiveMHz * 1000));
    const R = CONVEX_C35.curvatureRadius;
    const L = CONVEX_C35.lines;
    const th = (u: number) => -CONVEX_C35.halfSector + (2 * CONVEX_C35.halfSector * (u + 0.5)) / L;
    let front = 0;
    let backUnlit = 0;
    let backLit = 0;
    let backSamples = 0;
    for (const theta of [0, (7 * Math.PI) / 180, (-7 * Math.PI) / 180])
      for (let u = 0; u < L; u += 2)
        for (let r = 12; r < 45; r += 0.05) {
          const m = pointOnLine(fr, CONVEX_C35, th(u), r);
          const c = cls(m);
          if (c.interface !== Interface.RibCortex) continue;
          // el camino de la mirada θ que pasa por la muestra (su dirección, `steeredSample`)
          const dir = lineDirection(fr, th(u) + Math.asin((R * Math.sin(theta)) / (R + r)));
          const fg = scene.faceGradient(m, BASELINE_INSTANT)!;
          const dot = fg.normal[0] * dir[0] + fg.normal[1] * dir[1] + fg.normal[2] * dir[2];
          const cosI = Math.abs(dot);
          const e = interfaceEchoField(c.interface, cosI, 1, faceDelta(c.interfaceDistance, fg.norm, cosI), k0);
          if (dot <= 0) front = Math.max(front, e);
          else {
            backSamples++;
            backUnlit = Math.max(backUnlit, e);
            if (faceLitFromProbe(c.interface, fg.normal, dir)) backLit = Math.max(backLit, e);
          }
        }
    expect(backSamples).toBeGreaterThan(100);
    expect(front).toBeGreaterThan(0);
    // el eco de la cara posterior con |cosθ| (sin la regla) llega a menos de 3 dB del de la anterior
    expect(20 * Math.log10(backUnlit / front)).toBeGreaterThan(-3);
    // con la regla, nada (≥ 30 dB bajo la anterior, sea cual sea la transmisión)
    expect(backLit).toBe(0);
    // gemelo GLSL de la regla, en el eco de interfaz de los dos programas de B
    expect(INTERFACE_ECHO_GLSL).toContain('if (c.iface == IF_RIB && dot(fg.xyz, dir) > 0.0) return 0.0;');
    for (const src of [FRAG_RAWFIELD, FRAG_RAWFIELD_STEERED]) expect(src).toContain(INTERFACE_ECHO_GLSL);
    // el cartílago transmite: su cara profunda sí se ve
    expect(faceLitFromProbe(Interface.Perichondrium, [0, 0, 1], [0, 0, 1])).toBe(true);
    expect(faceLitFromProbe(Interface.RibCortex, [0, 0, 1], [0, 0, 1])).toBe(false);
    expect(faceLitFromProbe(Interface.RibCortex, [0, 0, -1], [0, 0, 1])).toBe(true);
  });
});

describe('eco de cara plana de las copias de la pared (serie de la pleura, decisión 61)', () => {
  it('el gradiente analítico de la profundidad radial es el numérico', () => {
    for (const p of [at(FLANK, -14, 5), at(Math.PI * 0.56, -20, 12), at(Math.PI * 0.88, 8, 27), at(Math.PI * 1.3, 30, 20)] as Vec3[]) {
      const g = torsoDepthGradient(p, t);
      const h = 1e-4;
      for (let k = 0; k < 3; k++) {
        const a: Vec3 = [...p];
        const b: Vec3 = [...p];
        a[k] += h;
        b[k] -= h;
        expect(g[k]).toBeCloseTo((torsoDepth(a, t) - torsoDepth(b, t)) / (2 * h), 6);
      }
    }
  });

  it('wallFaceEchoFlat da el eco de interfaceEcho (con faceGradient) a ±0,5 dB por cara, sin la ondulación a ±0,05', () => {
    // la energía del eco de cada cruce de cara a lo largo de líneas normales y oblicuas (hasta 20°): el eco
    // completo, con la normal y la norma numéricas de la cara (las de la GPU fuera de bucles), frente al de
    // cara plana (normal y norma de la profundidad radial), que va en el bucle de la serie
    const K0 = (2 * Math.PI) / (1540 / 2500);
    const worst = new Map<Interface, number>();
    for (const [phi, z, tiltDeg] of [
      [Math.PI * 0.56, ABDOMEN_Z, 0],
      [FLANK, ABDOMEN_Z + 6, 0],
      [FLANK, ABDOMEN_Z + 6, 15],
      [Math.PI * 0.88, ABDOMEN_Z + 16, 10],
      [Math.PI * 0.7, ABDOMEN_Z - 10, 20],
    ] as const) {
      const skin = torsoSkinPoint(phi, z, t);
      const n = torsoNormal(skin, t);
      const tl = (tiltDeg * Math.PI) / 180;
      const dir: Vec3 = [-n[0] * Math.cos(tl), -n[1] * Math.cos(tl), Math.sin(tl)];
      const acc = new Map<Interface, { flat: number; full: number }>();
      for (let s = 0.01; s < 32; s += 0.01) {
        const m: Vec3 = [skin[0] + dir[0] * s, skin[1] + dir[1] * s, skin[2] + dir[2] * s];
        const c = cls(m);
        if (!isWallLayerInterface(c.interface)) continue;
        const fg = scene.faceGradient(m, BASELINE_INSTANT)!;
        const cosI = Math.abs(fg.normal[0] * dir[0] + fg.normal[1] * dir[1] + fg.normal[2] * dir[2]);
        const full = interfaceEchoField(
          c.interface,
          cosI,
          wallFaceGain(m, c.interface, t),
          faceDelta(c.interfaceDistance, fg.norm, cosI),
          K0,
        );
        const flat = wallFaceEchoFlat(c.interface, c.interfaceDistance, m, dir, t, K0);
        const e = acc.get(c.interface) ?? { flat: 0, full: 0 };
        acc.set(c.interface, { flat: e.flat + flat * flat, full: e.full + full * full });
      }
      for (const [f, e] of acc) if (e.full > 0) worst.set(f, Math.max(worst.get(f) ?? 0, Math.abs(10 * Math.log10(e.flat / e.full))));
    }
    // todas las caras vistas (el recto no tiene planos: los dan el flanco y las oblicuas)
    expect([...worst.keys()].sort()).toEqual([...WALL_FACES].sort());
    for (const [f, db] of worst) expect(db, Interface[f]).toBeLessThan(0.5);
    expect(worst.get(Interface.SkinFat)!).toBeLessThan(0.05);
    expect(worst.get(Interface.Peritoneum)!).toBeLessThan(0.05);
    // sin la cortical ni el pericondrio (cilindros: no son planos paralelos a la piel)
    for (const f of [Interface.RibCortex, Interface.Perichondrium, Interface.LiverCapsule])
      expect(wallFaceEchoFlat(f, 0.3, at(FLANK, ABDOMEN_Z, 10), [0, 1, 0], t, K0)).toBe(0);
  });

  it('la GLSL: el mismo gradiente y el eco de cara plana en la pared que copia la serie, sin faceGradient', () => {
    expect(WALL_FACE_ECHO_GLSL).toContain(
      'vec2 g = p.xy / r * (1.0 - 1.0 / rho) + r / (rho * rho * rho) * p.xy / (uTorso.xy * uTorso.xy);',
    );
    expect(WALL_FACE_ECHO_GLSL).toContain('return interfaceProfileEcho(c.iface, cosI, wallFaceGain(m, c.iface), c.ifd / (gl * cosI));');
    expect(WALL_FACE_ECHO_GLSL.replace(/\/\/.*$/gm, '')).not.toContain('faceGradient');
    for (const src of [FRAG_RAWFIELD, FRAG_RAWFIELD_STEERED]) {
      expect(src).toContain(WALL_FACE_ECHO_GLSL);
      expect(src.indexOf(WALL_FACE_ECHO_GLSL)).toBeGreaterThan(src.indexOf(INTERFACE_ECHO_GLSL));
      expect(src).toContain('return field + vec2(WALL_COPY_FACE_GAIN * wallFaceEchoFlat(c, m, dir, w), 0.0);');
    }
  });
});

describe('gemelo GLSL (organs/wall.ts y wallTexture.ts)', () => {
  it('la anatomía incluye el módulo de la pared, con las constantes interpoladas', () => {
    expect(ORGAN_MODULES.map((o) => o.id)).toContain('wall');
    expect(ANATOMY_GLSL).toContain(WALL_GLSL);
    expect(WALL_GLSL).toContain(`#define WALL_SCARPA_FRACTION ${WALL.scarpaFraction.toFixed(4)}`);
    expect(WALL_GLSL).toContain(`#define WALL_RIB_PRIORITY_MM ${WALL.ribFacePriorityMm.toFixed(4)}`);
    const glsl = ANATOMY_GLSL.replace(/\s+/g, ' ');
    // classify: capas onduladas, la cortical del hueso más cercano y el pericondrio del cartílago (lus-sim, decisión 16:
    // la parrilla de `organs/ribcage.ts`)
    expect(glsl).toContain('vec4 wd = wallDepthsOf(u, m.z, wl, wx.z);');
    expect(glsl).toContain('if ((!c || uRibParams.z > 0.0) && rd < ribD) { ribD = rd; ribI = i; }');
    expect(glsl).toContain('if (cart) { c.iface = IF_PERICHONDRIUM; c.ifd = -inD;');
    expect(glsl).toContain('c.tissue = d < wd.y ? T_FAT : (d < wd.z ? T_MUSCLE : T_FAT);');
    // en classifyWall (el prefijo de la pared de classify, decisión 61): la parrilla antes de la grasa subcutánea donde
    // puede llegar (la grasa no la corta); lus-sim (decisión 17): el grosor de la pared en el (u, z) de cada muestra y sus
    // capas solo dentro de ella; con la muestra fuera de la pared, classifyWith sigue con ese grosor
    const cls = glsl.slice(glsl.indexOf('bool classifyWall(vec3 m, out Cls c, out float depth, out vec3 tn, out float wall) {'));
    expect(glsl.indexOf('Cls classifyWith(vec3 m, bool withCurtain) {')).toBeGreaterThan(glsl.indexOf('bool classifyWall('));
    expect(cls).toContain('return true; } return false; }');
    const arc = cls.indexOf('float u = wallArc(m); wall = wallTotalAt(u, m.z);');
    const layers = cls.indexOf('if (d < wall) wl = wallLayersAt(u, m.z, wx);');
    const ribs = cls.indexOf('int ri = ribScan(m, d, u, wall, inD, cart, ribD, ribI, ribAny);');
    const inWall = cls.indexOf('if (d < wall) {');
    expect(arc).toBeGreaterThan(0);
    expect(layers).toBeGreaterThan(arc);
    expect(ribs).toBeGreaterThan(layers);
    expect(inWall).toBeGreaterThan(ribs);
    expect(cls.indexOf('vec4 wd = wallDepthsOf(u, m.z, wl, wx.z);')).toBeGreaterThan(inWall);
    expect(glsl).toContain('float wall; if (classifyWall(m, c, depth, tn, wall)) return c;');
    // y la parrilla no mira nada bajo la pared
    expect(glsl).toContain('if (d >= wall) return -1;');
    // faceGradient: la distancia de la capa y la de la costilla cuya cara es (la de la clasificación)
    expect(glsl).toContain('} else if (c.iface >= IF_FIRST_WALL && c.iface <= IF_LAST_WALL) {');
    expect(glsl).toContain('int k = faceRib(m);');
  });

  it('la pasada B aplica la textura solo a la grasa y al músculo, y el eco de las caras de pared y costilla', () => {
    expect(FRAG_RAWFIELD).toContain(WALL_TEXTURE_GLSL);
    // la dirección del haz de la mirada 0 es la radial desde el centro de curvatura en el punto del MUNDO (con la
    // compresión de la sonda, decisión 63, m ya no es p en la pared) y la lámina va al mundo por la jacobiana
    expect(FRAG_RAWFIELD).toContain('if (tissue == T_FAT || tissue == T_MUSCLE) het *= wallTexture(m, tissue, dir, w);');
    expect(FRAG_RAWFIELD).toContain('vec2 f0 = fieldFor(m, se, c.tissue, normalize(p - uCurvC), w);');
    expect(FRAG_RAWFIELD_STEERED).toContain(
      'if (tissue == T_FAT || tissue == T_MUSCLE) het *= wallTexture(m, tissue, normalize(b0 + g / uSteer.w), w);',
    );
    expect(FRAG_RAWFIELD_STEERED).toContain('vec2 f0 = fieldForPh(m, se, c.tissue, ph0, g, normalize(p - uCurvC), w);');
    // la textura va antes del eco de interfaz (que usa wallFaceGain) en los dos programas
    for (const src of [FRAG_RAWFIELD, FRAG_RAWFIELD_STEERED])
      expect(src.indexOf('float wallFaceGain(')).toBeLessThan(src.indexOf('float interfaceEcho('));
    const echo = INTERFACE_ECHO_GLSL.replace(/\s+/g, ' ');
    expect(echo).toContain('c.iface <= IF_LAST_TUBE || c.iface == IF_RIB || c.iface == IF_PERICHONDRIUM ? tubeCurvature(');
    expect(echo).toContain('if (c.iface >= IF_FIRST_WALL && c.iface <= IF_LAST_WALL) curv *= wallFaceGain(m, c.iface);');
    expect(FRAG_RAWFIELD).toContain(`uIface[${INTERFACE_COUNT}]`);
    // tablas del GLSL con el tamaño interpolado
    expect(WALL_TEXTURE_GLSL).toContain(`const float WT_FACE_VAR[${WALL_TEXTURE.faceVariation.length}]`);
    expect(WALL_TEXTURE.faceVariation.length).toBe(LAST_WALL_INTERFACE - FIRST_WALL_INTERFACE + 1);
    // los tejidos de la decisión 81 (psoas, cuadrado lumbar, grasa retroperitoneal) van al final: no mueven índices
    expect(TISSUE_COUNT).toBe(30);
  });
});

describe('textura de la pared (wallTexture.ts)', () => {
  const dirIn = (m: Vec3): Vec3 => {
    const n = torsoNormal(m, t);
    return [-n[0], -n[1], -n[2]];
  };

  it('vale 1 en cualquier tejido que no sea la grasa o el músculo de la pared (hígado, riñón y vasos no cambian)', () => {
    for (const tissue of [Tissue.Liver, Tissue.RenalCortex, Tissue.RenalSinus, Tissue.Blood, Tissue.Skin, Tissue.Bone, Tissue.PerirenalFat])
      for (let i = 0; i < 50; i++) {
        const m: Vec3 = [-150 + 3.7 * i, -60 + 2.3 * i, -90 + 1.9 * i];
        expect(wallTexture(m, tissue, [0, 1, 0], t)).toBe(1);
      }
    // y el eco solo cambia en las caras de la pared
    for (const f of [Interface.LiverCapsule, Interface.IvcLumen, Interface.RibCortex]) expect(wallFaceGain(at(FLANK, 0, 10), f, t)).toBe(1);
  });

  it('septos de la grasa: lóbulos de 5–10 mm a lo largo de la piel con techos casi paralelos a ella, finos y especulares', () => {
    let n = 0;
    let onSeptum = 0;
    let horizontal = 0;
    const runs: number[] = [];
    let run = 0;
    const z = -30;
    for (let u = -150; u < 150; u += 0.05) {
      // una línea a lo largo de la piel a 8 mm de hondo (grasa): tramos entre paredes de columna
      const phi = Math.PI / 2 - u / 135;
      const m = at(phi, z, 8.3);
      const s = fatSeptum(m, tu);
      n++;
      if (s[3] > 0.5) {
        onSeptum++;
        const nn = torsoNormal(m, t);
        if (Math.abs(s[0] * nn[0] + s[1] * nn[1] + s[2] * nn[2]) > 0.9) horizontal++;
        if (run > 0) runs.push(run * 0.05);
        run = 0;
      } else run++;
    }
    // un septo cubre una fracción pequeña (0,2–0,5 mm de espesor): la grasa es sobre todo lóbulo
    expect(onSeptum / n).toBeGreaterThan(0.02);
    expect(onSeptum / n).toBeLessThan(0.3);
    // a lo largo de la piel, los tramos sin septo miden de media lo que un lóbulo (la línea cruza techos y paredes)
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(mean).toBeGreaterThan(2);
    expect(mean).toBeLessThan(12);
    expect(horizontal).toBeGreaterThan(0);
    // especular: el mismo septo de frente brilla más que visto a 60°
    expect(wallOrientation([0, 0, 1], [0, 0, 1])).toBe(1);
    expect(wallOrientation([0, 0, 1], [Math.sin(1.05), 0, Math.cos(1.05)])).toBeLessThan(0.3);
  });

  it('estrías del músculo: cada ~2,2 mm en profundidad, casi paralelas a la piel y en tramos finitos', () => {
    const peaks: number[] = [];
    let covered = 0;
    let total = 0;
    for (let z = -80; z <= 20; z += 5) {
      let prev = 0;
      let rising = false;
      const u0 = wallArc(at(FLANK, z, 0), tu);
      const w = wallDepths(tu, u0, z);
      for (let d = w.fascia + 0.3; d < w.transversalis - 0.3; d += 0.02) {
        const s = muscleStriation(at(FLANK, z, d), tu);
        const wv = s[3];
        if (wv < prev && rising && prev > 0.3) peaks.push(d);
        rising = wv > prev;
        prev = wv;
        total++;
        if (wv > 0.3) covered++;
      }
    }
    expect(peaks.length).toBeGreaterThan(10);
    // la máscara de tramos deja fuera parte de las estrías; las que hay ocupan una fracción pequeña del músculo
    expect(covered / total).toBeGreaterThan(0.02);
    expect(covered / total).toBeLessThan(0.3);
    // pendiente ≤ 15° (peniforme): la normal de la estría se aparta ≤ 15° de la de la piel
    for (let z = -60; z <= 20; z += 10) {
      const m = at(FLANK, z, t.skinMm + t.fatMm + 3);
      const s = muscleStriation(m, tu);
      const n = torsoNormal(m, t);
      expect(Math.abs(s[0] * n[0] + s[1] * n[1] + s[2] * n[2])).toBeGreaterThan(Math.cos((15 * Math.PI) / 180));
    }
  });

  it('anclada: la textura en un punto material no depende de la sonda (solo del haz por su brillo especular)', () => {
    for (let i = 0; i < 200; i++) {
      const m = at(FLANK + 0.003 * i, -40 + 0.37 * i, 3 + ((i * 0.131) % 22));
      const c = cls(m);
      const g1 = wallTexture(m, c.tissue, dirIn(m), t);
      const g2 = wallTexture([...m] as Vec3, c.tissue, dirIn(m), t);
      expect(g2).toBe(g1);
    }
  });
});
