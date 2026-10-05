import { describe, expect, it } from 'vitest';
import { AnatomyScene, BASELINE_INSTANT } from '../anatomy/scene';
import { defaultPatient } from '../physiology/patientState';
import { Tissue } from '../anatomy/tissues';
import { Interface } from '../anatomy/interfaces';
import { ANATOMY_GLSL } from '../anatomy/gpu/anatomy.glsl';
import { kidneyLocal, kidneySinusSdf } from '../anatomy/organs/kidney';
import {
  BLIND_END_TAPER,
  HILUM_VESSELS,
  HILUM_VESSEL_COUNT,
  HILUM_VESSEL_MAX_NODES,
  HILUM_VESSEL_STRIDE,
  VESSEL_TABLE_COUNT,
  hilumVesselTable,
  type HilumVessel,
} from '../anatomy/organs/vessels';
import { tubeQuery } from '../anatomy/primitives';
import type { Vec3 } from '../core/vec3';

/**
 * Los vasos del hilio del bazo y de los riñones (decisión 46, `organs/vessels.ts`): calibres de la fuente, dónde entran (el bazo,
 * el seno renal), por dónde van (fuera de los demás órganos, en los seis hábitos) y la tabla y el gemelo de la GPU.
 */
const P = HILUM_VESSELS.params;
const scene = new AnatomyScene(defaultPatient());
const byId = (s: AnatomyScene, id: HilumVessel['id']) => s.vessels.find((v) => v.id === id)!;
/** Los vasos del hilio de la escena: los primeros de la tabla (tras ellos, desde la decisión 50, los subclavios). */
const hil = (s: AnatomyScene) => s.vessels.slice(0, HILUM_VESSEL_COUNT);

// Los riñones no cambian con el hábito (decisión 43: la profundidad de Xue): los renales son el mismo caso en los seis; los esplénicos
// siguen al bazo, que sí cambia
const HABITS = (['average', 'thin', 'obese'] as const).flatMap((build) =>
  (['male', 'female'] as const).map((sex) => {
    const p = defaultPatient();
    return { tag: `${build}/${sex}`, scene: new AnatomyScene({ ...p, habitus: { ...p.habitus, chest: { build, sex } } }) };
  }),
);

/** Puntos del eje de un vaso cada `step` mm, con su radio y el índice del segmento. */
function axisSamples(v: HilumVessel, step = 1): Array<{ p: Vec3; r: number; seg: number }> {
  const out: Array<{ p: Vec3; r: number; seg: number }> = [];
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
        seg: i,
      });
    }
  }
  return out;
}

describe('Los vasos del hilio (decisión 46)', () => {
  it('seis vasos con los calibres de la fuente: la vena esplénica 6,6 mm, la arteria 4 en el hilio, las renales 4,9 / 9,4 / 10', () => {
    expect(
      hil(scene)
        .map((v) => v.id)
        .sort(),
    ).toEqual(['renalArteryLeft', 'renalArteryRight', 'renalVeinLeft', 'renalVeinRight', 'splenicArtery', 'splenicVein'].sort());
    expect(scene.vessels.length).toBe(VESSEL_TABLE_COUNT);
    const maxR = (id: HilumVessel['id']) => Math.max(...byId(scene, id).tube.nodes.map((n) => n.r));
    expect(maxR('splenicVein')).toBeCloseTo(P.splenicVeinRadiusMm.value, 6);
    expect(byId(scene, 'splenicArtery').tube.nodes[0].r).toBeCloseTo(P.splenicArteryRadiusHilumMm.value, 6);
    expect(maxR('renalArteryLeft')).toBeCloseTo(P.renalArteryRadiusMm.value, 6);
    expect(maxR('renalVeinLeft')).toBeCloseTo(P.renalVeinLeftRadiusMm.value, 6);
    expect(maxR('renalVeinRight')).toBeCloseTo(P.renalVeinRightRadiusMm.value, 6);
    // las venas, de pared fina; la luz, sangre
    for (const v of hil(scene)) {
      expect(v.wallTissue).toBe(v.lumenInterface === Interface.VeinLumen ? Tissue.VesselWallThin : Tissue.ArteryWall);
      expect(v.tube.nodes.length).toBeLessThanOrEqual(HILUM_VESSEL_MAX_NODES);
      // el extremo medial, ciego, más estrecho (el vaso sale del modelo)
      const last = v.tube.nodes[v.tube.nodes.length - 1].r;
      const prev = v.tube.nodes[v.tube.nodes.length - 2].r;
      expect(last / prev, v.id).toBeCloseTo(BLIND_END_TAPER, 1);
    }
  });

  it('el eje de cada vaso es sangre y su pared rodea la luz, en los seis hábitos', () => {
    for (const { tag, scene: s } of HABITS)
      for (const v of hil(s))
        for (const { p, r } of axisSamples(v, 2)) {
          const c = s.classify(p, BASELINE_INSTANT);
          expect(c.tissue, `${tag} ${v.id} (${p.map((x) => x.toFixed(1)).join(', ')})`).toBe(Tissue.Blood);
          expect(c.interface).toBe(v.lumenInterface);
          // a medio grosor de la pared, fuera de la luz, en la dirección de y o de x (la que no sigue al eje)
          const t = tubeQuery(p, v.tube);
          const side: Vec3 = Math.abs(t.tangent[1]) < 0.8 ? [0, 1, 0] : [1, 0, 0];
          const w = s.classify([p[0] + side[0] * (r + 0.5 * v.wallMm), p[1] + side[1] * (r + 0.5 * v.wallMm), p[2]], BASELINE_INSTANT);
          if (w.tissue === Tissue.Blood) continue; // otro tramo del mismo vaso
          expect(w.tissue, `${tag} ${v.id}`).toBe(v.wallTissue);
        }
  });

  it('los esplénicos entran en el bazo por la parte gástrica de su cara visceral, y los renales en el seno del riñón', () => {
    for (const { tag, scene: s } of HABITS) {
      for (const id of ['splenicVein', 'splenicArtery'] as const) {
        const v = byId(s, id);
        const start = v.tube.nodes[0].p;
        // el primer nodo, dentro del bazo: con la clasificación sin los vasos, bazo
        const cls = classifyWithoutVessels(s, start);
        expect(cls, `${tag} ${id}`).toBe(Tissue.Spleen);
      }
      for (const [id, k] of [
        ['renalVeinRight', 0],
        ['renalArteryRight', 0],
        ['renalVeinLeft', 1],
        ['renalArteryLeft', 1],
      ] as const) {
        const kid = s.kidneys[k];
        expect(kidneySinusSdf(kidneyLocal(byId(s, id).tube.nodes[0].p, kid), kid), `${tag} ${id}`).toBeLessThan(0);
      }
    }
  });

  it('fuera del bazo y del riñón no tocan ningún órgano ni el hueso, en los seis hábitos', () => {
    const FORBIDDEN = new Set([
      Tissue.Liver,
      Tissue.LiverCapsule,
      Tissue.Lung,
      Tissue.Diaphragm,
      Tissue.Vertebra,
      Tissue.Bone,
      Tissue.Myocardium,
      Tissue.Psoas,
      Tissue.QuadratusLumborum,
      Tissue.Muscle,
      Tissue.Fat,
      Tissue.Skin,
      Tissue.Cartilage,
    ]);
    const SPLEEN_OR_KIDNEY = new Set([
      Tissue.Spleen,
      Tissue.RenalCapsule,
      Tissue.RenalCortex,
      Tissue.RenalMedulla,
      Tissue.RenalSinus,
      Tissue.RenalPelvis,
    ]);
    for (const { tag, scene: s } of HABITS)
      for (const v of hil(s)) {
        const hits: string[] = [];
        for (const { p, r, seg } of axisSamples(v, 1)) {
          // un anillo justo fuera de la pared, en el plano normal al eje
          const t = tubeQuery(p, v.tube);
          const a: Vec3 = Math.abs(t.tangent[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
          const e1 = normalize(cross(t.tangent, a));
          const e2 = cross(t.tangent, e1);
          for (let k = 0; k < 8; k++) {
            const th = (k * Math.PI) / 4;
            const R = r + v.wallMm + 1;
            const q: Vec3 = [
              p[0] + R * (Math.cos(th) * e1[0] + Math.sin(th) * e2[0]),
              p[1] + R * (Math.cos(th) * e1[1] + Math.sin(th) * e2[1]),
              p[2] + R * (Math.cos(th) * e1[2] + Math.sin(th) * e2[2]),
            ];
            const tissue = s.classify(q, BASELINE_INSTANT).tissue;
            const inOrgan = s.inStomach(q, BASELINE_INSTANT) || FORBIDDEN.has(tissue);
            // los dos primeros tramos entran en su órgano (el bazo o el seno renal)
            const ownOrgan = seg <= 1 && SPLEEN_OR_KIDNEY.has(tissue);
            if (inOrgan || (SPLEEN_OR_KIDNEY.has(tissue) && !ownOrgan))
              hits.push(`${Tissue[tissue]}@${q.map((x) => x.toFixed(1)).join(',')}`);
          }
        }
        expect(hits, `${tag} ${v.id}: ${hits.slice(0, 4).join(' ')}`).toEqual([]);
      }
  });

  it('no se cruzan entre sí: entre las paredes de dos vasos queda al menos 1 mm, en los seis hábitos', () => {
    for (const { tag, scene: s } of HABITS)
      for (let i = 0; i < s.vessels.length; i++)
        for (let j = i + 1; j < s.vessels.length; j++) {
          const a = s.vessels[i];
          const b = s.vessels[j];
          let gap = Infinity;
          for (const { p, r } of axisSamples(a, 1)) gap = Math.min(gap, tubeQuery(p, b.tube).d - r - a.wallMm - b.wallMm);
          expect(gap, `${tag} ${a.id} – ${b.id}`).toBeGreaterThan(1);
        }
  });

  it('la tabla de la GPU: cabecera, esfera envolvente y nodos de cada vaso; el gemelo GLSL va en la anatomía', () => {
    const t = hilumVesselTable(scene.vessels, scene.vesselBounds);
    expect(t.length).toBe(VESSEL_TABLE_COUNT * HILUM_VESSEL_STRIDE * 4);
    scene.vessels.forEach((v, i) => {
      const o = i * HILUM_VESSEL_STRIDE * 4;
      expect(t[o]).toBe(v.tube.nodes.length);
      expect(t[o + 2]).toBe(v.wallTissue);
      expect(t[o + 3]).toBe(v.lumenInterface);
      expect(t[o + 7]).toBeCloseTo(scene.vesselBounds[i].r, 3);
      const last = v.tube.nodes.length - 1;
      expect(t[o + 8 + 4 * last + 3]).toBeCloseTo(v.tube.nodes[last].r, 5);
    });
    expect(ANATOMY_GLSL).toContain('if (classifyTubes(m, c, tubeOut, 0, HV_COUNT)) return c;');
    // la distancia a la pared de los vasos, en la de los órganos y en la del «resto»; el gemelo de tubeQuery con su estrechamiento
    expect(ANATOMY_GLSL).toContain('perirenal)) { c.bd = min(c.bd, tubeOut); return c; }');
    expect(ANATOMY_GLSL).toContain('dOut = min(dOut, sd - h0.y);');
    expect(ANATOMY_GLSL).toContain('float taper = s > 0.0 && s < 1.0 ? (b.w - a.w) * inversesqrt(len2) : 0.0;');
    expect(ANATOMY_GLSL).toContain('kc = 1.0 / r;');
    expect(ANATOMY_GLSL).toContain('c.bd = max(min(min(min(bdBowel, bdR), dSpine), tubeOut), 0.0);');
  });

  // Muestras al azar a ≤ 20 mm del eje de cada vaso (semilla fija). La distancia a la frontera de lo que no es vaso no pasa de la
  // distancia verdadera a la cara externa de la pared más cercana (la GPU salta muestras con ella); en la luz y en la pared, la
  // distancia a la frontera y la de la cara son las del tubo. Sin `tubes.dOut` en el órgano o el «resto», la primera falla
  it('la distancia a la frontera respeta la pared de los vasos, y la luz y la pared dan la distancia de su cara', () => {
    let state = 46;
    const rnd = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    let outside = 0;
    scene.vessels.forEach((v, vi) => {
      for (const { p } of axisSamples(v, 3))
        for (let k = 0; k < 12; k++) {
          const q: Vec3 = [p[0] + 40 * (rnd() - 0.5), p[1] + 40 * (rnd() - 0.5), p[2] + 40 * (rnd() - 0.5)];
          const c = scene.classify(q, BASELINE_INSTANT);
          // junto a los subclavios (decisión 50), ni el aire (la GPU no lo muestrea) ni el pulmón (su distancia no cuenta la pleura, que
          // dibuja la pasada A, y la arteria va sobre ella, más lejos): solo ahí
          if (vi >= HILUM_VESSEL_COUNT && (c.tissue === Tissue.Air || c.tissue === Tissue.Lung)) continue;
          let near = Infinity;
          let own: { v: HilumVessel; d: number } | null = null;
          for (const w of scene.vessels) {
            const d = tubeQuery(q, w.tube).d;
            near = Math.min(near, d - w.wallMm);
            if (d < w.wallMm && (!own || d < own.d)) own = { v: w, d };
          }
          if (own) {
            const tag = `${own.v.id} (${q.map((x) => x.toFixed(2)).join(', ')})`;
            expect(c.interface, tag).toBe(own.v.lumenInterface);
            expect(c.interfaceDistance, tag).toBeCloseTo(Math.abs(own.d), 9);
            if (own.d < 0) expect(c.boundaryDistance, tag).toBeCloseTo(-own.d, 9);
            else expect(c.boundaryDistance, tag).toBeCloseTo(Math.min(own.d, own.v.wallMm - own.d), 9);
          } else {
            outside++;
            expect(c.boundaryDistance, `${Tissue[c.tissue]} (${q.map((x) => x.toFixed(2)).join(', ')})`).toBeLessThanOrEqual(near + 1e-9);
          }
        }
    });
    expect(outside).toBeGreaterThan(1000);
  });

  it('la cara de la luz: su normal es la radial del tubo (el gradiente analítico, el de la GPU)', () => {
    const v = byId(scene, 'splenicVein');
    const n = v.tube.nodes;
    const mid: Vec3 = [(n[2].p[0] + n[3].p[0]) / 2, (n[2].p[1] + n[3].p[1]) / 2, (n[2].p[2] + n[3].p[2]) / 2];
    const t = tubeQuery(mid, v.tube);
    const a: Vec3 = Math.abs(t.tangent[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const e1 = normalize(cross(t.tangent, a));
    const q: Vec3 = [mid[0] + (t.r + 0.2) * e1[0], mid[1] + (t.r + 0.2) * e1[1], mid[2] + (t.r + 0.2) * e1[2]];
    const c = scene.classify(q, BASELINE_INSTANT);
    expect(c.interface).toBe(Interface.VeinLumen);
    const g = scene.faceGradient(q, BASELINE_INSTANT)!;
    expect(Math.abs(g.normal[0] * e1[0] + g.normal[1] * e1[1] + g.normal[2] * e1[2])).toBeGreaterThan(0.99);
    expect(g.curvature).toBeGreaterThan(0.2);
  });
});

/** La clasificación del punto con la escena sin sus vasos (la de antes de la decisión 46). */
function classifyWithoutVessels(s: AnatomyScene, p: Vec3): Tissue {
  const saved = s.vessels;
  const savedBounds = s.vesselBounds;
  const w = s as unknown as { vessels: HilumVessel[]; vesselBounds: unknown[] };
  w.vessels = [];
  w.vesselBounds = [];
  try {
    return s.classify(p, BASELINE_INSTANT).tissue;
  } finally {
    w.vessels = saved as HilumVessel[];
    w.vesselBounds = savedBounds as unknown[];
  }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
}
