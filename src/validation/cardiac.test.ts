import { describe, expect, it } from 'vitest';
import golden from './support/echotwinHeartGolden.json';
import { echoTwinCmToLus, lusToEchoTwinCm, swapYZ } from '../core/units';
import type { Vec3 } from '../core/vec3';
import { AnatomyScene, BASELINE_INSTANT } from '../anatomy/scene';
import { defaultPatient } from '../physiology/patientState';
import { ANATOMY_GLSL } from '../anatomy/gpu/anatomy.glsl';
import {
  CARDIAC_BASE_SPHERE_CM,
  CARDIAC_BOX_CM,
  CARDIAC_CACHE_SIZE,
  buildCardiac,
  CARDIAC_GLSL,
  ET_TO_LUS_TISSUE,
  HEART_ED_STATE,
  cardiacBoxSd,
  cardiacLocal,
  cardiacPoint,
  cardiacSample,
} from '../anatomy/heart/cardiac';
import { classifyHeart, computeHeartPose, createHeartModel } from '../anatomy/heart/heartModel';
import { normalExcellentCase } from '../physiology/heart/normal-excellent';
import { Structure, Tissue as EtTissue, makeSample } from '../anatomy/heart/tissue';
import { GLSL_COMMON } from '../anatomy/heart/gpu/glslCommon';
import { GLSL_HEART } from '../anatomy/heart/gpu/glslHeart';
import { GLSL_GENERATED } from '../anatomy/heart/gpu/glslGenerated';
import {
  CARDIAC_TISSUES,
  HEART,
  HEART_GLSL,
  HEART_VOXEL_BD_CAP_MM,
  heartQuery,
  heartSd,
  heartVoxel,
  heartVolumeTable,
  heartWindowDistance,
  echoTwinOrigin,
  decodeHeartVoxel,
  HEART_PALETTE,
} from '../anatomy/organs/heart';
import { ELEV_SIGMA0_MM, elevSigmaMm } from '../ultrasound/pleura';
import { VOXEL_MM, voxelWords } from '../anatomy/heart/cardiacRuntime';
import { ribTableZ, ribLineArc } from '../anatomy/organs/ribcage';
import { wallArc } from '../anatomy/organs/wall';
import { sdDiaphragm } from '../anatomy/primitives';
import { thoraxLinePhi } from '../anatomy/thoraxLines';
import { Tissue } from '../anatomy/tissues';

/**
 * El corazón de EchoTwin en lus-sim (decisión 49, fase 1: estático en telediástole): el puerto reproduce el origen punto a
 * punto, sus cavidades tienen los volúmenes del caso, la caja y la esfera de la base cubren lo que dicen, y su sitio en el
 * tórax es el de Gray (el ápex) y el de Latham (la ventana).
 */
const scene = new AnatomyScene(defaultPatient());
const heart = scene.heart;
const runtime = heart.cardiac!;
const cardiac = runtime.cardiac;

/** Puntos del marco del corazón (cm) de una rejilla de paso `h` sobre la caja con `pad` cm de más, con su clasificación. */
function* grid(h: number, pad = 0): Generator<{ q: Vec3; hit: boolean; tissue: number; structure: number }> {
  const s = makeSample();
  const { min, max } = CARDIAC_BOX_CM;
  for (let x = min[0] - pad; x <= max[0] + pad; x += h)
    for (let y = min[1] - pad; y <= max[1] + pad; y += h)
      for (let z = min[2] - pad; z <= max[2] + pad; z += h) {
        const hit = classifyHeart(cardiac.model, cardiac.pose, x, y, z, s);
        yield { q: [x, y, z], hit, tissue: s.tissue, structure: s.structure };
      }
}

describe('el marco de EchoTwin y el de lus-sim (core/units.ts)', () => {
  const o = { zIcs4Mm: 38.8, skinYMm: 113 };
  it('el origen de EchoTwin es la piel de la línea media a la altura del 4.º EIC; ida y vuelta exactas', () => {
    expect(lusToEchoTwinCm([0, 113, 38.8], o)).toEqual([0, 0, 0]);
    expect(echoTwinCmToLus([0, 0, 0], o)).toEqual([0, 113, 38.8]);
    const p: [number, number, number] = [12.5, -40, 77];
    const back = echoTwinCmToLus(lusToEchoTwinCm(p, o), o);
    for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(p[i], 12);
  });

  it('las mismas direcciones del cuerpo: la izquierda, la cabeza y delante, sin espejo', () => {
    // 1 cm a la izquierda, 1 cm craneal y 1 cm anterior en lus-sim
    expect(lusToEchoTwinCm([10, 113, 38.8], o)).toEqual([1, 0, 0]);
    expect(lusToEchoTwinCm([0, 113, 48.8], o)).toEqual([0, 1, 0]);
    expect(lusToEchoTwinCm([0, 123, 38.8], o)).toEqual([0, 0, 1]);
    // cambiar y por z invierte la quiralidad del triedro (lus-sim es levógiro, EchoTwin dextrógiro) sin espejar la x
    const [ex, ey, ez] = [swapYZ([1, 0, 0]), swapYZ([0, 1, 0]), swapYZ([0, 0, 1])];
    const det = ex[0] * (ey[1] * ez[2] - ey[2] * ez[1]) - ex[1] * (ey[0] * ez[2] - ey[2] * ez[0]) + ex[2] * (ey[0] * ez[1] - ey[1] * ez[0]);
    expect(det).toBe(-1);
    expect(ex).toEqual([1, 0, 0]);
  });
});

describe('el puerto de EchoTwin (c15aec7) reproduce su clasificador', () => {
  it('los puntos de referencia del origen: mismo tejido, misma estructura y la misma distancia', () => {
    const c = normalExcellentCase;
    const f = golden.frameOriginCm;
    const anatomy = { ...c.anatomy, heartPosition: { ...c.anatomy.heartPosition, baseCm: { x: f.x, y: f.y, z: f.z } } };
    const m = createHeartModel(anatomy, c.physiology, { x: 0, y: 0, z: 0 }, c.seed, 0, 0);
    const hp = computeHeartPose(m, HEART_ED_STATE);
    const s = makeSample();
    let hits = 0;
    for (const [x, y, z, hit, tissue, structure, sdf] of golden.points) {
      const got = classifyHeart(m, hp, x, y, z, s);
      expect(got ? 1 : 0).toBe(hit);
      if (got) {
        hits++;
        expect(s.tissue).toBe(tissue);
        expect(s.structure).toBe(structure);
      }
      expect(Math.abs(s.sdf - sdf)).toBeLessThan(1e-8 * Math.max(1, Math.abs(sdf)));
    }
    expect(hits).toBeGreaterThan(200);
  });

  it('el estado de telediástole es el del comienzo del latido de EchoTwin: el VI lleno y las semilunares cerradas', () => {
    expect(HEART_ED_STATE.lvVolumeMl).toBe(normalExcellentCase.physiology.edvMl);
    expect(HEART_ED_STATE.contraction).toBeLessThan(1e-5);
    expect(HEART_ED_STATE.avOpen).toBe(0);
    expect(HEART_ED_STATE.pvOpen).toBe(0);
    expect(HEART_ED_STATE.mvOpen).toBe(0);
  });
});

describe('las cavidades en telediástole tienen los volúmenes del caso', () => {
  // rejilla de 2,5 mm sobre la caja: el volumen de cada estructura (mL)
  const h = 0.25;
  const vol = new Map<number, number>();
  for (const g of grid(h)) if (g.hit) vol.set(g.structure, (vol.get(g.structure) ?? 0) + h * h * h);
  const v = (s: Structure) => vol.get(s) ?? 0;

  it('el VI, su volumen telediastólico (120 mL); el VD, el de EchoTwin (124 mL, VD normal 88–227 mL)', () => {
    // EchoTwin, con una rejilla de 1,5 mm: VI 116,0, VD 124,0, AI 28,9 y AD 30,4 mL (la aurícula, en su mínimo tras contraerse)
    expect(v(Structure.LvCavity)).toBeGreaterThan(0.92 * 120);
    expect(v(Structure.LvCavity)).toBeLessThan(1.04 * 120);
    expect(v(Structure.RvCavity)).toBeGreaterThan(110);
    expect(v(Structure.RvCavity)).toBeLessThan(138);
    expect(v(Structure.LaCavity)).toBeGreaterThan(24);
    expect(v(Structure.LaCavity)).toBeLessThan(34);
    expect(v(Structure.RaCavity)).toBeGreaterThan(25);
    expect(v(Structure.RaCavity)).toBeLessThan(36);
  });

  it('la masa del miocardio del VI, la de un adulto normal (88–224 g con 1,05 g/mL)', () => {
    const lvWall =
      v(Structure.LvWallSeptal) +
      v(Structure.LvWallLateral) +
      v(Structure.LvWallAnterior) +
      v(Structure.LvWallInferior) +
      v(Structure.LvApex);
    expect(lvWall * 1.05).toBeGreaterThan(88);
    expect(lvWall * 1.05).toBeLessThan(224);
  });
});

describe('la caja, la esfera de la base y el sitio del corazón en el tórax de lus-sim', () => {
  it('la caja contiene todo lo cardiaco (rejilla de 2,5 mm con 1 cm más), y fuera de ella el corazón no se evalúa', () => {
    let outside = 0;
    let inside = 0;
    for (const g of grid(0.25, 1)) {
      if (!g.hit) continue;
      inside++;
      if (cardiacBoxSd(g.q) >= -0.1) outside++;
    }
    expect(inside).toBeGreaterThan(10000);
    expect(outside).toBe(0);
    // fuera de la caja, la distancia de la caja acota la del corazón
    const far = cardiacPoint(cardiac, [CARDIAC_BOX_CM.max[0] + 2, 0, 0]);
    const s = cardiacSample(cardiac, far);
    expect(s.tissue).toBe(-1);
    expect(s.clear).toBeCloseTo(20, 6);
  });

  it('la esfera de la base y el elipsoide con su tapón cubren el saco (lo que no respira contiene el corazón)', () => {
    const VESSELS = new Set([
      Structure.Ivc,
      Structure.Svc,
      Structure.HepaticVein,
      Structure.PulmonaryVein,
      Structure.PulmonaryArtery,
      Structure.AorticRoot,
    ]);
    const B = CARDIAC_BASE_SPHERE_CM;
    let out = 0;
    for (const g of grid(0.25)) {
      if (!g.hit || VESSELS.has(g.structure)) continue;
      const m = cardiacPoint(cardiac, g.q);
      const inBase = Math.hypot(g.q[0] - B.c[0], g.q[1] - B.c[1], g.q[2] - B.c[2]) <= B.r;
      if (!inBase && heartSd(heart, m) > heart.plugDepthMm) out++;
    }
    expect(out).toBe(0);
    expect(scene.respiratoryWeight(heart.base.c)).toBe(0);
    expect(scene.respiratoryWeight(cardiacPoint(cardiac, [0, 0, 4]))).toBe(0);
  });

  it('el ápex del saco, en el 5.º EIC a 8–10 cm de la línea media y por dentro de la pleura (la língula lo tapa)', () => {
    const a = runtime.apexMm;
    expect(a[0]).toBeGreaterThan(70);
    expect(a[0]).toBeLessThan(100);
    const au = Math.abs(wallArc(a, scene.torso));
    const cage = scene.ribCage;
    expect(a[2]).toBeLessThan(ribTableZ(cage, 4, au));
    expect(a[2]).toBeGreaterThan(ribTableZ(cage, 5, au));
    expect(scene.insideWallMm(a)).toBeGreaterThan(0);
    expect(scene.insideWallMm(a)).toBeLessThan(HEART.params.apexCoverMm.value);
    // el centro del anillo mitral, detrás del 4.º cartílago izquierdo (EchoTwin: 1,7 cm a la izquierda de la línea media)
    const o = cardiac.originMm;
    expect(o[0]).toBeGreaterThan(10);
    expect(o[0]).toBeLessThan(35);
    const ps = ribLineArc(thoraxLinePhi('parasternal', scene.torso), scene.torso, cage);
    expect(o[2]).toBeLessThan(ribTableZ(cage, 2, ps));
    expect(o[2]).toBeGreaterThan(ribTableZ(cage, 4, ps));
  });

  it('en la ventana el pericardio toca la pleura y no se mete en la pared; el tapón de grasa es fino', () => {
    // el punto del corazón más cercano a la pleura en el disco, a windowContactMm (±0,5 mm); el tapón, < 15 mm
    let nearest = 1e3;
    for (const g of grid(0.25)) {
      if (!g.hit) continue;
      const m = cardiacPoint(cardiac, g.q);
      if (heartWindowDistance(heart, wallArc(m, scene.torso), m[2]) < 0) nearest = Math.min(nearest, scene.insideWallMm(m));
    }
    expect(nearest).toBeGreaterThan(HEART.params.windowContactMm.value - 0.5);
    expect(nearest).toBeLessThan(HEART.params.windowContactMm.value + 1.5);
    expect(heart.plugDepthMm).toBeGreaterThan(2);
    expect(heart.plugDepthMm).toBeLessThan(15);
  });

  it('fuera de la ventana, la lámina de la cortina gana al corazón: pulmón bajo la pleura', () => {
    // 5 mm por fuera del borde lateral de la ventana, 1,5 mm bajo la pleura: el corazón está a < 3 mm (limitación medida)
    const w = heart.window;
    let lung = 0;
    let checked = 0;
    for (let a = 0; a < 2 * Math.PI; a += Math.PI / 12) {
      const u = w.u + (w.r + 5) * Math.cos(a);
      const z = w.z + (w.r + 5) * Math.sin(a);
      // la pleura bajo la piel de arco u: por la vertical del tronco
      let lo = -Math.PI;
      let hi = Math.PI;
      for (let i = 0; i < 60; i++) {
        const mid = 0.5 * (lo + hi);
        if (wallArc([scene.torso.a * Math.sin(mid), scene.torso.b * Math.cos(mid), 0], scene.torso) < u) lo = mid;
        else hi = mid;
      }
      const s: Vec3 = [scene.torso.a * Math.sin(lo), scene.torso.b * Math.cos(lo), z];
      const R = Math.hypot(s[0], s[1]);
      let d = 0;
      while (scene.insideWallMm([s[0] * (1 - d / R), s[1] * (1 - d / R), z]) < 1.5 && d < 80) d += 0.05;
      const p: Vec3 = [s[0] * (1 - d / R), s[1] * (1 - d / R), z];
      const t = scene.classify(p, BASELINE_INSTANT).tissue;
      if (scene.lungEdgeMm(p, BASELINE_INSTANT)! < 0) continue;
      checked++;
      if (t === Tissue.Lung) lung++;
    }
    expect(checked).toBeGreaterThan(8);
    expect(lung).toBe(checked);
  });

  it('el corazón no baja de la cúpula: lo que quedaría bajo el diafragma de lus-sim es del abdomen (medido, declarado)', () => {
    let below = 0;
    const h = 0.25;
    for (const g of grid(h)) {
      if (!g.hit) continue;
      const m = cardiacPoint(cardiac, g.q);
      if (sdDiaphragm(m, scene.diaphragm, scene.torso) >= 0) {
        below += h * h * h;
        expect(CARDIAC_TISSUES.has(scene.classify(m, BASELINE_INSTANT).tissue) && sdDiaphragm(m, scene.diaphragm, scene.torso) > 0.5).toBe(
          false,
        );
      }
    }
    // la vena cava inferior y la hepática (≈ 17 mL) y la cara inferior de los ventrículos (decisión 49: ≈ 70 mL en total)
    expect(below).toBeGreaterThan(40);
    expect(below).toBeLessThan(90);
  });
});

describe('la clasificación del corazón en la escena', () => {
  it('cardiacSample y heartQuery: el tejido de EchoTwin traducido, la grasa del tapón, y fuera nada', () => {
    // en el centro del VI (en su eje, a media altura), sangre
    const lv = cardiacSample(cardiac, cardiacPoint(cardiac, [0, 0, 4]));
    expect(lv.tissue).toBe(Tissue.Blood);
    expect(lv.bd).toBeGreaterThan(10);
    expect(Math.hypot(...lv.n)).toBeCloseTo(1, 9);
    // la pared del VI lateral
    const s = makeSample();
    let wall: Vec3 | null = null;
    for (let x = 1; x < 5 && !wall; x += 0.02) {
      if (classifyHeart(cardiac.model, cardiac.pose, x, 0, 4, s) && s.tissue === EtTissue.Myocardium) wall = [x, 0, 4];
    }
    expect(cardiacSample(cardiac, cardiacPoint(cardiac, wall!)).tissue).toBe(Tissue.Myocardium);
    // ida y vuelta del marco del corazón
    const q: Vec3 = [1.2, -3.4, 5.6];
    const back = cardiacLocal(cardiac, cardiacPoint(cardiac, q));
    for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(q[i], 10);
    // bajo la pleura en el centro de la ventana: grasa del tapón o corazón; nunca pulmón
    const wc = heart.window;
    const fatOrHeart = heartQuery(heart, cardiacPoint(cardiac, [0, 0, 4]), 30, wc.u);
    expect(fatOrHeart.tissue).toBe(Tissue.Blood);
    // lejos, nada y una distancia
    const far = heartQuery(heart, [-100, -60, 150], 40, -100);
    expect(far.tissue).toBe(-1);
    expect(far.clear).toBeGreaterThan(30);
  });

  it('cada tejido de EchoTwin tiene el suyo en lus-sim; los del corazón son los que la medida reconoce', () => {
    for (let t = 0; t < 18; t++) expect((ET_TO_LUS_TISSUE as Record<number, Tissue>)[t]).toBeDefined();
    expect(ET_TO_LUS_TISSUE[EtTissue.Myocardium]).toBe(Tissue.Myocardium);
    expect(ET_TO_LUS_TISSUE[EtTissue.Blood]).toBe(Tissue.Blood);
    expect(CARDIAC_TISSUES.has(ET_TO_LUS_TISSUE[EtTissue.Pericardium])).toBe(true);
    expect(CARDIAC_TISSUES.has(ET_TO_LUS_TISSUE[EtTissue.Valve])).toBe(true);
    expect(CARDIAC_TISSUES.has(Tissue.Fat)).toBe(false);
  });
});

describe('la GLSL portada', () => {
  const defined = (src: string): string[] => {
    const code = src.replace(/\/\/.*$/gm, '');
    return [
      ...code.matchAll(/^\s*#define\s+(\w+)/gm),
      ...code.matchAll(/^\s*const\s+\w+\s+(\w+)\s*(?:\[\s*\w*\s*\])?\s*=/gm),
      ...code.matchAll(/^\s*struct\s+(\w+)/gm),
      ...code.matchAll(/^\s*(?:void|float|int|bool|[iu]?vec[234]|mat[234]|[A-Z]\w*)\s+(\w+)\s*\(/gm),
    ].map((m) => m[1]);
  };

  it('todo lo que define lleva el prefijo et_ (no choca con la GLSL de lus-sim) y va en ANATOMY_GLSL', () => {
    const names = defined(GLSL_COMMON + GLSL_HEART + GLSL_GENERATED);
    expect(names.length).toBeGreaterThan(400);
    expect(names.filter((n) => !n.startsWith('et_'))).toEqual([]);
    // decisión 49: la GLSL de EchoTwin solo va en el programa que hornea el volumen; las pasadas leen el volumen
    expect(ANATOMY_GLSL).not.toContain('et_classifyHeart');
    expect(ANATOMY_GLSL).toContain(HEART_GLSL);
    expect(runtime.bakeFragment).toContain(CARDIAC_GLSL);
    expect(runtime.bakeFragment).toContain('oVoxel = uvec4(');
    // la textura de parámetros cabe en el ancho de una textura de una fila
    expect(cardiac.params.length / 4).toBeLessThanOrEqual(4096);
  });

  it('los parámetros propios de lus-sim tras los de EchoTwin: el marco del corazón en mm', () => {
    const p = cardiac.params;
    const n = p.length;
    // las 12 cifras están en algún sitio tras PARAM_COUNT: el origen y los tres ejes unitarios
    const tail = Array.from(p.slice(n - 16));
    const o = cardiac.originMm.map((v) => Math.fround(v));
    const at = tail.findIndex((v, i) => v === o[0] && tail[i + 1] === o[1] && tail[i + 2] === o[2]);
    expect(at).toBeGreaterThanOrEqual(0);
    for (const e of [cardiac.ex, cardiac.ey, cardiac.ez]) expect(Math.hypot(...e)).toBeCloseTo(1, 9);
  });
});

describe('el volumen horneado del corazón (decisión 49)', () => {
  const v = runtime.vol;

  it('cada vóxel guarda lo que el clasificador de EchoTwin dice en su centro (código y décimas de mm)', () => {
    const s = makeSample();
    const min = CARDIAC_BOX_CM.min;
    for (const [i, j, k] of [
      [100, 90, 120],
      [10, 10, 10],
      [150, 150, 60],
      [120, 70, 200],
    ]) {
      const w = decodeHeartVoxel(voxelWords(cardiac, i, j, k, false), 0);
      const hit = classifyHeart(
        cardiac.model,
        cardiac.pose,
        min[0] + (i + 0.5) * 0.07,
        min[1] + (j + 0.5) * 0.07,
        min[2] + (k + 0.5) * 0.07,
        s,
      );
      expect(w.idx > 0 ? HEART_PALETTE[w.idx - 1] : -1).toBe(hit ? ET_TO_LUS_TISSUE[s.tissue] : -1);
      expect(w.dq).toBe(Math.min(7, Math.floor((hit ? Math.max(0, -s.sdf) : Math.max(0, s.sdf)) * 20 + 0.5)));
    }
    expect(v.voxelMm).toBe(VOXEL_MM);
    for (let a = 0; a < 3; a++)
      expect(v.dims[a] * VOXEL_MM).toBeGreaterThanOrEqual(10 * (CARDIAC_BOX_CM.max[a] - CARDIAC_BOX_CM.min[a]) - 1e-9);
  });

  it('heartVoxel: el tejido del vóxel que contiene el punto y una distancia con tope; fuera de la esfera, la de la esfera', () => {
    // en el centro del VI, sangre lejos de la pared
    const lv = heartVoxel(heart, cardiacPoint(cardiac, [0, 0, 4]));
    expect(lv.tissue).toBe(Tissue.Blood);
    // la distancia, con el tope de la rejilla (la de EchoTwin no es una cota)
    expect(lv.d).toBe(HEART_VOXEL_BD_CAP_MM);
    // el mismo vóxel en todo su interior
    const c = cardiacPoint(cardiac, [0, 0, 4]);
    expect(heartVoxel(heart, [c[0] + 0.1, c[1] - 0.1, c[2] + 0.1]).tissue).toBe(Tissue.Blood);
    // fuera de la esfera
    const far: Vec3 = [v.sphere.c[0] + v.sphere.r + 30, v.sphere.c[1], v.sphere.c[2]];
    const out = heartVoxel(heart, far);
    expect(out.tissue).toBe(-1);
    expect(out.d).toBeCloseTo(30, 6);
    // la tabla de la textura de escena: esfera, origen y lado, ejes
    const t = heartVolumeTable(heart);
    expect(Array.from(t.slice(0, 4))).toEqual([...v.sphere.c, v.sphere.r].map((x) => Math.fround(x)));
    expect(t[7]).toBeCloseTo(VOXEL_MM, 6);
    // y el volumen coincide con el clasificador analítico lejos de las fronteras: los tejidos de 400 puntos al azar
    let agree = 0;
    let n = 0;
    // mulberry32 (entero, sin perder bits)
    let seed = 7;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 4000 && n < 400; i++) {
      const q: Vec3 = [-4 + 8 * rnd(), -4 + 8 * rnd(), -1 + 10 * rnd()];
      const m = cardiacPoint(cardiac, q);
      const a = cardiacSample(cardiac, m);
      if (a.tissue === -1 || a.bd < 2) continue;
      n++;
      if (heartVoxel(heart, m).tissue === a.tissue) agree++;
    }
    // salvo donde una valva o una cuerda flota en la sangre (la sdf de la sangre no las cuenta): 398 de 400
    expect(n).toBe(400);
    expect(agree).toBeGreaterThanOrEqual(0.99 * n);
  });

  it('la distancia del volumen no es una cota, y nadie la usa como tal: B reclasifica toda muestra de elevación en la rejilla', () => {
    // propiedad medida: con la distancia del vóxel en un punto, ¿todo el entorno de ese radio tiene su tejido? No siempre: la sdf de
    // EchoTwin no cuenta las valvas ni las cuerdas en la sangre ni los vasos fuera del saco, y su pared lleva retícula
    let seed = 11;
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const at = (a: number, b: number, c: number): Vec3 =>
      [0, 1, 2].map((i) => v.originMm[i] + v.ex[i] * a + v.ey[i] * b + v.ez[i] * c) as Vec3;
    let n = 0;
    let broken = 0;
    for (let i = 0; i < 1500; i++) {
      const m = at(rnd() * v.dims[0] * v.voxelMm, rnd() * v.dims[1] * v.voxelMm, rnd() * v.dims[2] * v.voxelMm);
      const q = heartVoxel(heart, m);
      expect(q.d).toBeLessThanOrEqual(HEART_VOXEL_BD_CAP_MM);
      if (q.d <= 0) continue;
      n++;
      for (let k = 0; k < 16; k++) {
        const u = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1];
        const l = Math.hypot(u[0], u[1], u[2]);
        const r = 0.999 * q.d * Math.cbrt(rnd());
        if (heartVoxel(heart, [m[0] + (u[0] / l) * r, m[1] + (u[1] / l) * r, m[2] + (u[2] / l) * r]).tissue !== q.tissue) {
          broken++;
          break;
        }
      }
    }
    // ≈ 2–3 % de los puntos con distancia (con 0,5 mm de tope seguía en ≈ 0,7 %): por eso no puede servir para ahorrar nada
    expect(broken).toBeGreaterThan(0);
    expect(broken / n).toBeLessThan(0.05);
    // y no sirve: la pasada B solo reutiliza el tejido del centro si la distancia pasa de σ_elev + 0,5 mm (`sampleSide`), y la σ
    // elevacional nunca baja de la del foco; el tope queda por debajo en fundamental y en armónica
    for (let r = 0; r <= 240; r += 2)
      for (const harmonic of [false, true]) expect(elevSigmaMm(r, 60, harmonic) + 0.5).toBeGreaterThan(HEART_VOXEL_BD_CAP_MM);
    expect(ELEV_SIGMA0_MM + 0.5).toBeGreaterThan(HEART_VOXEL_BD_CAP_MM);
  });

  it('sin el corazón (antes de que llegue su chunk), nada: la escena sin él es la del pulmón', () => {
    const empty = { ...heart, cardiac: null };
    expect(heartVoxel(empty, cardiacPoint(cardiac, [0, 0, 4]))).toEqual({ tissue: -1, d: 1e3 });
    expect(Array.from(heartVolumeTable(empty))).toEqual(new Array(20).fill(0));
  });

  it('una escena nueva del mismo paciente trae el mismo volumen: el renderizador no lo vuelve a hornear', () => {
    // otra respiración o «Restablecer paciente» construyen otra escena; hornear de nuevo costaba ≈ 46 s con SwiftShader
    const again = new AnatomyScene(defaultPatient()).heart;
    expect(again.cardiac).toBe(runtime);
    expect(again.plugDepthMm).toBe(heart.plugDepthMm);
  });

  // la última: suelta el corazón de las demás
  it('la caché de corazones guarda los últimos y suelta el más antiguo', { timeout: 300_000 }, () => {
    const o = echoTwinOrigin(scene.torso, scene.ribCage);
    const base = normalExcellentCase.anatomy.heartPosition.baseCm;
    const at = (dx: number) => buildCardiac({ x: base.x + dx, y: base.y, z: base.z }, o);
    const first = at(0.01);
    expect(at(0.01)).toBe(first);
    for (let i = 1; i <= CARDIAC_CACHE_SIZE; i++) at(0.01 + 0.01 * i);
    expect(at(0.01)).not.toBe(first);
  });
});
