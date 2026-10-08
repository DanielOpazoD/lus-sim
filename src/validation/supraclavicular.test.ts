import { describe, expect, it } from 'vitest';
import { AnatomyScene, BASELINE_INSTANT } from '../anatomy/scene';
import { Interface } from '../anatomy/interfaces';
import { Tissue } from '../anatomy/tissues';
import { ANATOMY_GLSL } from '../anatomy/gpu/anatomy.glsl';
import { torsoDepth, torsoSkinPoint, tubeQuery } from '../anatomy/primitives';
import {
  wallCupolaMm,
  wallFossaColumn,
  wallFossaMm,
  wallLayersAt,
  wallTotalAt,
  CHEST_WALL_TEXELS_PER_COL,
} from '../anatomy/organs/chestWall';
import { SUPRACLAVICULAR, fossaColumn, neckLayers, wallPoint } from '../anatomy/organs/supraclavicular';
import { HILUM_VESSELS, HILUM_VESSEL_COUNT, VESSEL_TABLE_COUNT, type HilumVessel } from '../anatomy/organs/vessels';
import { wallArc, wallDepths, wallPlaneDepth } from '../anatomy/organs/wall';
import { probeCenterContent } from '../app/coverage';
import { probeContact } from '../probe/contact';
import { CONVEX_C35, pointOnLine } from '../probe/probe';
import { AnatomyQuery } from '../anatomy/query';
import type { Vec3 } from '../core/vec3';
import { defaultPatient } from '../physiology/patientState';

/**
 * La fosa supraclavicular (decisión 50, `organs/supraclavicular.ts`): la depresión que adelgaza la pared sobre la clavícula, las
 * capas del cuello (el esternocleidomastoideo, el escaleno y la grasa del triángulo posterior) y los vasos subclavios.
 */
const P = SUPRACLAVICULAR.params;
const scene = new AnatomyScene(defaultPatient());
const cw = scene.chestWall;
const c = scene.ribCage.clavicle;
const third = (c.u1 - c.u0) / 3;
/** Borde superior de la clavícula en la columna |u|. */
const clavTop = (au: number) => c.z0 + c.rise * Math.min(1, Math.max(0, (au - c.u0) / (c.u1 - c.u0))) + c.radius;
const HABITS = (['average', 'thin', 'obese'] as const).flatMap((build) =>
  (['male', 'female'] as const).map((sex) => {
    const p = defaultPatient();
    return { tag: `${build}/${sex}`, scene: new AnatomyScene({ ...p, habitus: { ...p.habitus, chest: { build, sex } } }) };
  }),
);
const sub = (s: AnatomyScene) => s.vessels.slice(HILUM_VESSEL_COUNT);
/** Fin de espiración (la del medidor de la cobertura). */
const REST = { phase: 0, volume: 0, volumeRate: 0, pleuralMmHg: 0, abdominalMmHg: 0, diaphragmCaudalMm: 0, diaphragmVelocityMmS: 0 };

/** Puntos del eje de un vaso cada `step` mm, con su radio. */
function axisSamples(v: HilumVessel, step = 1): Array<{ p: Vec3; r: number }> {
  const out: Array<{ p: Vec3; r: number }> = [];
  const n = v.tube.nodes;
  for (let i = 0; i < n.length - 1; i++) {
    const a = n[i];
    const b = n[i + 1];
    const L = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]);
    for (let t = 0; t < L; t += step) {
      const q = t / L;
      out.push({
        p: [a.p[0] + (b.p[0] - a.p[0]) * q, a.p[1] + (b.p[1] - a.p[1]) * q, a.p[2] + (b.p[2] - a.p[2]) * q],
        r: a.r + (b.r - a.r) * q,
      });
    }
  }
  return out;
}

describe('La depresión de la fosa supraclavicular', () => {
  it('nada bajo el borde superior de la clavícula; entera a `fossaRiseMm` sobre él, sobre el tercio medio; nada sobre el lateral', () => {
    const mid = c.u0 + 1.5 * third;
    for (const side of [-1, 1]) {
      expect(wallFossaMm(cw, side * mid, clavTop(mid) - 0.1)).toBe(0);
      expect(wallFossaMm(cw, side * mid, clavTop(mid) + P.fossaRiseMm.value + 0.5)).toBeCloseTo(P.fossaDepthMm.value, 1);
      expect(wallFossaMm(cw, side * (c.u1 + 2 * P.fossaBlendMm.value), 220)).toBe(0);
      // por dentro, bajo el esternocleidomastoideo, menos honda
      expect(wallFossaMm(cw, side * (c.u0 + 0.4 * third), 220)).toBeLessThan(0.1 * P.fossaDepthMm.value);
      // y en ningún sitio de la espalda
      expect(wallFossaMm(cw, side * 300, 220)).toBe(0);
    }
    // el téxel de la tabla es el de `fossaColumn`
    const col = wallFossaColumn(cw, 8 * 9);
    expect(Array.from(col)).toEqual(Array.from(fossaColumn(8 * 9, c)).map((x) => Math.fround(x)));
    expect(CHEST_WALL_TEXELS_PER_COL).toBe(5);
  });

  it('la pleura de la cúpula, sin escalones: su pendiente bajo la fosa no pasa de 2,5 mm por mm, en los seis hábitos', () => {
    for (const { tag, scene: s } of HABITS) {
      let worst = 0;
      for (let u = 0; u <= 200; u += 2)
        for (let z = 160; z <= 230; z += 1) {
          const nb = [
            wallTotalAt(s.chestWall, u, z + 0.25),
            wallTotalAt(s.chestWall, u, z - 0.25),
            wallTotalAt(s.chestWall, u + 0.25, z),
            wallTotalAt(s.chestWall, u - 0.25, z),
          ];
          // fuera del techo de la cúpula (la radial que no cruza pulmón)
          if (wallCupolaMm(s.chestWall, u, z) >= 200 || nb.some((v) => v > 60)) continue;
          worst = Math.max(worst, Math.abs(nb[0] - nb[1]) / 0.5, Math.abs(nb[2] - nb[3]) / 0.5);
        }
      // medido (05-10-2026): 1,95 en el avatar, 2,35 en la mujer obesa; el tope, un margen sobre lo medido (no es un límite físico:
      // la decisión 44 dejaba la ladera en ≤ 1,9 delante)
      expect(worst, tag).toBeLessThan(2.5);
    }
  });

  it('la sonda apoyada en la fosa, en los seis hábitos: bajo su cara está la piel y la pleura más honda que ella, no en ella', () => {
    // la pared rígida del contacto (la de la pared sin lo que la cúpula le suma, menos la depresión) nunca pasa de la pleura
    for (const { tag, scene: s } of HABITS) {
      for (let u = 0; u <= 200; u += 8)
        for (let z = 150; z <= 230; z += 4) expect(s.chestWall.cupola!(u, z), `${tag} ${u} ${z}`).toBeGreaterThanOrEqual(0);
      const top = s.ribCage.sternum.zTop + 10;
      for (const tilt of [0, 0.2, 0.35]) {
        const pose = { phi: Math.PI - Math.acos(70 / s.torso.a), z: top + 12.5, lift: 0, yaw: Math.PI / 2, rock: 0, tilt };
        const k = probeContact(pose, CONVEX_C35, s.torso);
        const q = new AnatomyQuery(s);
        q.setProbeCompression(k);
        const at = (r: number) =>
          s.classify(q.deformation.toMaterial(pointOnLine(k.frame, CONVEX_C35, 0, r), REST), BASELINE_INSTANT).tissue;
        expect(at(0.5), `${tag} ${tilt}`).toBe(Tissue.Skin);
        const m = probeCenterContent(s, pose);
        if (m.content === 'lung') expect(m.pleuraMm!, `${tag} ${tilt}`).toBeGreaterThan(8);
      }
    }
  });
});

describe('Las capas del cuello sobre la clavícula', () => {
  it('por dentro: la grasa subcutánea y, bajo ella, el esternocleidomastoideo y el escaleno, con un plano entre los dos', () => {
    const au = c.u0 + 0.5 * third;
    const z = clavTop(au) + 10;
    const L = wallLayersAt(cw, au, z);
    const below = wallLayersAt(cw, au, clavTop(au) - 20);
    expect(L.fat).toBeCloseTo(below.fat, 6);
    const w = wallDepths(scene.torso, au, z, L);
    const plane = wallPlaneDepth(au, z, 1, scene.torso, w, 0, L);
    // el plano músculo–músculo, a un esternocleidomastoideo bajo la fascia (la onda de la pared, ±0,3 mm)
    expect(plane - (L.skin + L.fat)).toBeGreaterThan(P.scmMm.value - 1.5);
    expect(plane - (L.skin + L.fat)).toBeLessThan(P.scmMm.value + 1.5);
  });

  it('en la fosa mayor: grasa (el triángulo posterior) hasta el suelo muscular, sin pasar del plexo; sobre el tercio lateral, la pared', () => {
    // sobre la cúpula (la celda de la fosa de la cobertura: a 70 mm de la línea media, 12,5 sobre el tercio medial de la clavícula)
    const au = Math.abs(wallArc(torsoSkinPoint(Math.PI - Math.acos(70 / scene.torso.a), 0, scene.torso), scene.torso));
    const z = scene.ribCage.sternum.zTop + 10 + 12.5;
    const L = wallLayersAt(cw, au, z);
    const W = wallTotalAt(cw, au, z);
    expect(L.skin + L.fat + L.muscle).toBeCloseTo(W, 6);
    // (a ±0,5 mm: el peso de la altura y el del esternocleidomastoideo, que aquí aún no son 1 y 0)
    expect(L.skin + L.fat).toBeCloseTo(Math.min(W - L.pre - P.floorMm.value, P.plexusDepthMm.value), 0);
    // sobre el techo de la cúpula, la grasa hasta la hondura del plexo (sin el tope llegaba a cientos de milímetros)
    const roofZ = clavTop(c.u0 + 1.3 * third) + 20;
    const Lr = wallLayersAt(cw, c.u0 + 1.3 * third, roofZ);
    expect(wallCupolaMm(cw, c.u0 + 1.3 * third, roofZ)).toBeGreaterThanOrEqual(200);
    expect(Lr.skin + Lr.fat).toBeCloseTo(P.plexusDepthMm.value, 1);
    // sobre el tercio lateral (el trapecio y el deltoides), las capas del tórax
    const lat = c.u0 + 2.6 * third;
    expect(wallLayersAt(cw, lat, clavTop(lat) + 15).fat).toBeCloseTo(wallLayersAt(cw, lat, clavTop(lat) - 30).fat, 6);
    // la mujer: la mama no sube sobre la clavícula, la depresión se lleva su grasa
    const p = defaultPatient();
    const woman = new AnatomyScene({ ...p, habitus: { ...p.habitus, chest: { build: 'average', sex: 'female' } } });
    const cf = woman.ribCage.clavicle;
    const col = wallFossaColumn(woman.chestWall, cf.u0 + 0.5 * (cf.u1 - cf.u0));
    expect(col[1]).toBeGreaterThan(P.fossaDepthMm.value + 1.5);
    expect(wallFossaColumn(cw, c.u0 + 0.5 * (c.u1 - c.u0))[1]).toBeCloseTo(P.fossaDepthMm.value, 4);
  });

  it('`neckLayers` sin peso no cambia las capas del tórax', () => {
    expect(neckLayers([180, 15, 1, 0], 1, 30, 2, 4, 0.3, 3)).toEqual([4, 3]);
    expect(neckLayers([180, 15, 1, 1], 0, 30, 2, 4, 0.3, 3)).toEqual([4, 3]);
  });
});

describe('Los vasos subclavios', () => {
  it('la arteria y la vena de cada lado, con el calibre de la vena de Berk y cols. y su cara de delante a su hondura', () => {
    expect(scene.vessels.length).toBe(VESSEL_TABLE_COUNT);
    expect(sub(scene).map((v) => v.id)).toEqual([
      'subclavianArteryRight',
      'subclavianVeinRight',
      'subclavianArteryLeft',
      'subclavianVeinLeft',
    ]);
    for (const v of sub(scene)) {
      const maxR = Math.max(...v.tube.nodes.map((n) => n.r));
      const vein = v.lumenInterface === Interface.VeinLumen;
      expect(v.wallTissue).toBe(vein ? Tissue.VesselWallThin : Tissue.ArteryWall);
      expect(maxR).toBeCloseTo(vein ? P.subclavianVeinRadiusMm.value : P.subclavianArteryRadiusMm.value, 6);
      for (const n of v.tube.nodes) {
        const d = -torsoDepth(n.p, scene.torso);
        if (vein) {
          if (n.r === maxR) expect(d - n.r).toBeCloseTo(P.subclavianVeinDepthMm.value, 3);
        } else expect(d).toBeLessThanOrEqual(P.plexusDepthMm.value + 1e-9);
        // todos sobre la clavícula, por delante
        expect(n.p[1]).toBeGreaterThan(0);
      }
    }
    // en el hábito delgado la arteria se estrecha lo que falte para caber entre la piel y la pleura, sin bajar de 1,5 mm
    const p = defaultPatient();
    const thin = new AnatomyScene({ ...p, habitus: { ...p.habitus, chest: { build: 'thin', sex: 'male' } } });
    const rThin = Math.min(
      ...sub(thin)[0]
        .tube.nodes.slice(1, -1)
        .map((n) => n.r),
    );
    expect(rThin).toBeGreaterThanOrEqual(1.5);
    expect(rThin).toBeLessThan(P.subclavianArteryRadiusMm.value);
    // los dos lados, simétricos
    const [ar, , al] = sub(scene);
    ar.tube.nodes.forEach((n, i) => {
      expect(n.p[0]).toBeCloseTo(-al.tube.nodes[i].p[0], 6);
      expect(n.p[2]).toBeCloseTo(al.tube.nodes[i].p[2], 6);
    });
  });

  it('el eje es sangre y su pared la rodea; medio milímetro fuera de la pared no hay hueso, pulmón, piel ni aire, en los seis hábitos', () => {
    const FORBIDDEN = new Set([Tissue.Bone, Tissue.Lung, Tissue.Skin, Tissue.Air, Tissue.Cartilage]);
    for (const { tag, scene: s } of HABITS)
      for (const v of sub(s)) {
        const hits: string[] = [];
        for (const { p, r } of axisSamples(v, 1)) {
          const cl = s.classify(p, BASELINE_INSTANT);
          expect(cl.tissue, `${tag} ${v.id} (${p.map((x) => x.toFixed(1)).join(', ')})`).toBe(Tissue.Blood);
          expect(cl.interface).toBe(v.lumenInterface);
          const t = tubeQuery(p, v.tube);
          const a: Vec3 = Math.abs(t.tangent[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
          const e1 = norm(cross(t.tangent, a));
          const e2 = cross(t.tangent, e1);
          for (let k = 0; k < 8; k++) {
            const th = (k * Math.PI) / 4;
            // la arteria va sobre la pleura (en el hábito delgado, la fosa tiene 12 mm hasta ella)
            const R = r + v.wallMm + 0.5;
            const q: Vec3 = [0, 1, 2].map((i) => p[i] + R * (Math.cos(th) * e1[i] + Math.sin(th) * e2[i])) as Vec3;
            const tissue = s.classify(q, BASELINE_INSTANT).tissue;
            if (FORBIDDEN.has(tissue)) hits.push(`${Tissue[tissue]}@${q.map((x) => x.toFixed(1)).join(',')}`);
          }
        }
        expect(hits, `${tag} ${v.id}: ${hits.slice(0, 4).join(' ')}`).toEqual([]);
      }
  });

  it('por la fosa, la sonda transversal ve la arteria sobre la pleura de la cúpula', () => {
    const phi = Math.PI - Math.acos(70 / scene.torso.a);
    const z = scene.ribCage.sternum.zTop + 10 + 12.5;
    const pose = { phi, z, lift: 0, yaw: Math.PI / 2, rock: 0, tilt: 0 };
    const m = probeCenterContent(scene, pose);
    expect(m.content).toBe('lung');
    // a lo largo de la línea, antes de la pleura, la luz de la arteria derecha
    const art = sub(scene)[0];
    const u = wallArc(torsoSkinPoint(phi, z, scene.torso), scene.torso);
    let seen = false;
    for (let d = 2; d < m.pleuraMm!; d += 0.25) if (tubeQuery(wallPoint(u, z, d, scene.torso), art.tube).d < 0) seen = true;
    expect(seen).toBe(true);
  });

  it('la GPU: la pared mira los subclavios en su tramo de la tabla, antes del hueso, y la fosa en uCupola.y', () => {
    expect(ANATOMY_GLSL).toContain('classifyTubes(m, tc, subOut, HV_COUNT, HV_COUNT + HV_SUBCLAVIAN)');
    expect(ANATOMY_GLSL).toContain('c.bd = min(-inD, subOut);');
    expect(ANATOMY_GLSL).toContain('float roofTop = wall - cup + wallFossaMm(u, m.z);');
    expect(ANATOMY_GLSL).toContain('vec2 nk = neckLayers(col, fossaHeight(col, z), W, s.x, s.y, s.z, s.w);');
    expect(HILUM_VESSELS.params.arteryWallMm.value).toBeGreaterThan(0);
  });
});

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
}
