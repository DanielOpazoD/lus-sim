import { describe, expect, it } from 'vitest';
import { ANATOMY_GLSL, SCENE_TEX_H, SCENE_TEX_W } from '../anatomy/gpu/anatomy.glsl';
import { SCENE_UNIFORMS } from '../anatomy/gpu/sceneUniforms';
import {
  CHEST_WALL,
  CHEST_WALL_BASE,
  CHEST_WALL_COLS,
  CHEST_WALL_DU_MM,
  CHEST_WALL_GLSL,
  CHEST_WALL_TEXELS,
  CHEST_WALL_TEXELS_PER_COL,
  wallLayersAt,
  wallTotalAt,
} from '../anatomy/organs/chestWall';
import { LUNG_APEX, LUNG_APEX_GLSL } from '../anatomy/organs/lungApex';
import { RIBCAGE, RIB_TABLE_BASE, RIB_TABLE_TEXELS } from '../anatomy/organs/ribcage';
import {
  WALL,
  wallArc,
  wallPerimeter,
  wallBand,
  wallDepths,
  wallInnerNormal,
  wallLayers,
  wallPlaneDepth,
  wallPlaneGap,
} from '../anatomy/organs/wall';
import { torsoDepthGradient, torsoNormal, torsoSkinPoint, type WallLayersAt } from '../anatomy/primitives';
import { AnatomyScene, BASELINE_INSTANT } from '../anatomy/scene';
import { Tissue } from '../anatomy/tissues';
import { FRAG_RAWFIELD, FRAG_RAWFIELD_STEERED } from '../ultrasound/shaders/passes.glsl';
import type { Vec3 } from '../core/vec3';
import { defaultPatient, type ChestHabitus } from '../physiology/patientState';
import { RespiratoryModel } from '../physiology/respiratory';

/**
 * La pared torácica por región (decisión 17, `anatomy/organs/chestWall.ts`): las capas de cada estación son las de la base
 * (`docs/knowledge/anatomy.md` §2.3), la tabla (la que ve la GPU) las interpola sin salirse de ellas, las caras quedan en su
 * orden en todo el tórax, la banda intercostal engruesa delante al inspirar y bajo el reborde costal vuelve la pared del
 * abdomen de VExUS. Las metas medidas bajo la sonda (A-T1–A-T5, A-T10) están en `anatomyTargets.test.ts`.
 */
const scene = new AnatomyScene(defaultPatient());
const t = scene.torso;
const cw = scene.chestWall;
const P = CHEST_WALL.params;
const complex = RIBCAGE.params.pleuraComplexMm.value;
/** |∇torsoDepth| (normal → radial) bajo la piel de arco u, a media pared. */
function metric(u: number): number {
  let lo = 0;
  let hi = Math.PI;
  for (let i = 0; i < 50; i++) {
    const mid = 0.5 * (lo + hi);
    if (wallArc([t.a * Math.sin(mid), t.b * Math.cos(mid), 0], t) < u) lo = mid;
    else hi = mid;
  }
  const tau = 0.5 * (lo + hi);
  const s: Vec3 = [t.a * Math.sin(tau), t.b * Math.cos(tau), 0];
  const R = Math.hypot(s[0], s[1]);
  const W = cw.total(u, 0);
  const k = 1 - (0.5 * W) / R;
  const g = torsoDepthGradient([s[0] * k, s[1] * k, 0], t);
  return Math.hypot(g[0], g[1]);
}
/** Capas de una estación por la normal de la piel (mm): piel, grasa, músculo sobre los intercostales, banda y total. */
function normal(u: number, z: number): { skin: number; fat: number; above: number; band: number; total: number } {
  const L = cw.layers(u, z);
  const g = metric(u);
  return {
    skin: L.skin / g,
    fat: L.fat / g,
    above: (L.muscle - L.band - L.pre) / g,
    band: L.band / g,
    total: (L.skin + L.fat + L.muscle) / g,
  };
}
const st = cw.stations;
const HIGH_Z = cw.zHigh + 20;
const LOW_Z = cw.zLow - 20;

describe('pared torácica por región (decisión 17)', () => {
  it('las estaciones tienen las capas de la base (anatomy.md §2.3), por la normal de la piel', () => {
    const cases: Array<[string, number, number, { skin: number; fat: number; above: number; band: number; total: number }]> = [
      // EIC2-LMC: piel 1,8, grasa 3,7, pectoral 8,0, intercostales 2,2, complejo 0,3 = 16,0
      ['LMC', st.midclavicular, LOW_Z, { skin: 1.8, fat: 3.7, above: 8, band: 2.2, total: 16 }],
      ['paraesternal', st.parasternal, HIGH_Z, { skin: 1.8, fat: 3.7, above: 8, band: 2.2, total: 16 }],
      // EIC5 LAA/LAM: piel 1,8, grasa 3,2, serrato 4,5, intercostales 3,0 = 12,8
      ['LAM baja', st.midaxillary, LOW_Z, { skin: 1.8, fat: 3.2, above: 4.5, band: 3, total: 12.8 }],
      ['LAA baja', st.anteriorAxillary, LOW_Z, { skin: 1.8, fat: 3.2, above: 4.5, band: 3, total: 12.8 }],
      // la axila alta, 18 (McLean), con los intercostales del EIC3 lateral (Yoshida)
      ['LAM alta', st.midaxillary, HIGH_Z, { skin: 1.8, fat: 4, above: 18 - 1.8 - 4 - 3.7 - complex, band: 3.7, total: 18 }],
      // infraescapular: piel 2,5, grasa 4, dorsal ancho 5, intercostales 4,3 = 16,1
      ['infraescapular', st.infrascapular, LOW_Z, { skin: 2.5, fat: 4, above: 5, band: 4.3, total: 16.1 }],
      // la línea media posterior, la pared heredada
      [
        'línea media posterior',
        st.posteriorMidline,
        LOW_Z,
        { skin: 2.5, fat: 4, above: 28 - 2.5 - 4 - 4.3 - complex, band: 4.3, total: 28 },
      ],
    ];
    for (const [name, u, z, want] of cases) {
      const got = normal(u, z);
      // la tabla guarda cada 8 mm de piel: en una estación que no cae en un nodo, lo interpolado a ≤ 0,15 mm
      for (const k of ['skin', 'fat', 'above', 'band', 'total'] as const) expect(got[k], `${name}: ${k}`).toBeCloseTo(want[k], 0);
      expect(Math.abs(got.total - want.total), name).toBeLessThan(0.3);
    }
    // la axila alta frente a la baja: 5,2 mm más
    expect(normal(st.midaxillary, HIGH_Z).total - normal(st.midaxillary, LOW_Z).total).toBeCloseTo(18 - 12.8, 1);
  });

  it('la pared alta y la baja se unen entre el centro del EIC5 y la 4.ª costilla de la LAM, y la tabla es simétrica', () => {
    // las alturas salen de la parrilla (la axilar media derecha)
    expect(cw.zLow).toBeLessThan(cw.zHigh);
    expect(cw.zHigh - cw.zLow).toBeGreaterThan(30);
    // monótona entre las dos
    let prev = -Infinity;
    for (let z = cw.zLow - 5; z <= cw.zHigh + 5; z += 1) {
      const w = cw.total(st.midaxillary, z);
      expect(w).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = w;
    }
    // la tabla va por |u|: la izquierda es la derecha
    for (const u of [10, 60, 150, 250, 400]) for (const z of [-60, 0, 90]) expect(cw.layers(-u, z)).toEqual(cw.layers(u, z));
    // y va en la textura de escena tras la tabla costal, entera
    expect(CHEST_WALL_BASE).toBe(RIB_TABLE_BASE + RIB_TABLE_TEXELS);
    expect(SCENE_TEX_W * SCENE_TEX_H).toBeGreaterThanOrEqual(CHEST_WALL_BASE + CHEST_WALL_TEXELS);
    expect((CHEST_WALL_COLS - 1) * CHEST_WALL_DU_MM).toBeGreaterThan(st.posteriorMidline);
  });

  it('las caras de la pared quedan en su orden en todo el tórax; el primer plano se funde y el segundo es el músculo–intercostal', () => {
    let n = 0;
    for (let u = -420; u <= 420; u += 7)
      for (let z = -120; z <= 180; z += 9) {
        const L = wallLayers(t, u, z);
        const w = wallDepths(t, u, z, L);
        const p0 = wallPlaneDepth(u, z, 0, t, w, 0, L);
        const p1 = wallPlaneDepth(u, z, 1, t, w, 0, L);
        const tag = `u ${u}, z ${z}`;
        expect(w.skin, tag).toBeLessThan(w.scarpa);
        expect(w.scarpa, tag).toBeLessThan(w.fascia);
        expect(w.fascia, tag).toBeLessThan(w.transversalis);
        expect(w.transversalis, tag).toBeLessThan(w.peritoneum);
        // un plano con cara (no fundido con su vaina: en el abdomen, hacia el recto) queda entre la fascia y la transversalis
        for (const p of [p0, p1])
          if (wallPlaneGap(p, p === p0 ? 0 : 1, w) >= WALL.planeMinMm) {
            expect(p, tag).toBeGreaterThan(w.fascia);
            expect(p, tag).toBeLessThan(w.transversalis);
          }
        if (L.abdomen > 0) continue;
        n++;
        // en el tórax: el primer plano, fundido con la fascia profunda (sin cara); el segundo sobre la banda, con cara
        expect(wallPlaneGap(p0, 0, w), tag).toBeLessThan(WALL.planeMinMm);
        expect(wallPlaneGap(p1, 1, w), tag).toBeGreaterThanOrEqual(WALL.planeMinMm);
        expect(w.transversalis - p1, tag).toBeCloseTo(L.band, 0);
        // la fascia endotorácica a un complejo pleural de la pleura (sin la ondulación de la transversalis del abdomen)
        expect(w.peritoneum - w.transversalis, tag).toBeCloseTo(L.pre, 9);
      }
    expect(n).toBeGreaterThan(1000);
  });

  it('al inspirar a fondo engruesa la banda de delante (Yoshida: +0,76 mm por la normal) y no la del lado', () => {
    const deep = new RespiratoryModel({ ...defaultPatient(), respiratoryPattern: 'deep' }).excursionMm();
    // la referencia del reparto es el descenso de la inspiración profunda del modelo respiratorio
    expect(P.inspirationReferenceMm.value).toBe(deep);
    const front = st.midclavicular;
    const L = wallLayers(t, front, 0);
    // (en la radial, × |∇|; la tabla, cada 8 mm de piel, lo interpola a ≤ 0,01 mm)
    const full = wallBand(t, front, 0, deep, L) - wallBand(t, front, 0, 0, L);
    expect(Math.abs(full - P.intercostalInspirationMm.value * metric(front))).toBeLessThan(0.01);
    // a medio descenso, la mitad; más allá del de referencia, lo mismo
    expect(wallBand(t, front, 0, deep / 2, L) - L.band).toBeCloseTo(0.5 * full, 9);
    expect(wallBand(t, front, 0, 2 * deep, L)).toBeCloseTo(wallBand(t, front, 0, deep, L), 9);
    const Lm = wallLayers(t, st.midaxillary, 0);
    expect(wallBand(t, st.midaxillary, 0, deep, Lm)).toBe(Lm.band);
    // la pleura no se mueve: solo el plano músculo–intercostal sube
    const w = wallDepths(t, front, 0, L);
    expect(wallPlaneDepth(front, 0, 1, t, w, deep, L)).toBeLessThan(wallPlaneDepth(front, 0, 1, t, w, 0, L));
    expect(wallDepths(t, front, 0).peritoneum).toBe(w.peritoneum);
  });

  it('bajo el reborde costal vuelve la pared del abdomen del hábito (VExUS), sin saltos', () => {
    const abdomen: WallLayersAt = { skin: t.skinMm, fat: t.fatMm, muscle: t.muscleMm, pre: t.preperitonealMm, band: 0, abdomen: 1 };
    for (const u of [0, 80, 180, 300, 420]) {
      const L = cw.layers(u, -290);
      expect(L.abdomen, `u ${u}`).toBe(1);
      for (const k of ['skin', 'fat', 'muscle', 'pre'] as const) expect(L[k], `u ${u}: ${k}`).toBeCloseTo(abdomen[k], 5);
    }
    // continua en z (la mezcla de 100 mm) y en u (el reborde suavizado entre columnas): ningún salto de más de 0,5 mm en 1 mm
    for (let u = 0; u <= 420; u += 3)
      for (let z = -250; z <= 40; z += 1) {
        expect(Math.abs(cw.total(u, z + 1) - cw.total(u, z)), `u ${u}, z ${z}`).toBeLessThan(0.5);
        expect(Math.abs(cw.total(u + 1, z) - cw.total(u, z)), `u ${u}, z ${z}`).toBeLessThan(0.5);
      }
  });

  it('las variantes de la base (anatomy.md §2.4–2.6) por hábito: delgada, obesa y mujer', () => {
    const wallOf = (habitus: ChestHabitus, u: number, z: number) => {
      const p = defaultPatient();
      const sc = new AnatomyScene({ ...p, habitus: { ...p.habitus, chest: habitus } });
      return sc.chestWall.total(u, z) / metric(u);
    };
    // delgada: 12 delante (grasa 1,75, pectoral 6) y 10 al lado
    expect(Math.abs(wallOf({ build: 'thin', sex: 'male' }, st.midclavicular, 0) - (1.8 + 1.75 + 6 + 2.2 + complex))).toBeLessThan(0.15);
    expect(wallOf({ build: 'thin', sex: 'male' }, st.midaxillary, LOW_Z)).toBeCloseTo(10, 0);
    // obesa: 23 delante (McLean, mujeres de IMC 30) y 1,1 × al lado, en grasa (la métrica, la de la pared del avatar: ≤ 0,2)
    const near = (a: number, b: number, tag: string) => expect(Math.abs(a - b), tag).toBeLessThan(0.2);
    near(wallOf({ build: 'obese', sex: 'male' }, st.midclavicular, 0), P.obeseAnteriorWallMm.value, 'obesa, LMC');
    near(
      wallOf({ build: 'obese', sex: 'male' }, st.midaxillary, LOW_Z),
      P.obeseLateralRatio.value * P.obeseAnteriorWallMm.value,
      'obesa, LAM',
    );
    // mujer: +2 del esternón a la axilar anterior, nada desde la media
    near(wallOf({ build: 'average', sex: 'female' }, st.midclavicular, 0) - 16, P.femaleAnteriorExtraMm.value, 'mujer, LMC');
    near(wallOf({ build: 'average', sex: 'female' }, st.midaxillary, LOW_Z), 12.8, 'mujer, LAM');
  });

  it('sobre el esternón, piel y grasa presternal: el hueso empieza donde acaba la grasa en todos los hábitos', () => {
    for (const build of ['average', 'thin', 'obese'] as const) {
      const p = defaultPatient();
      const sc = new AnatomyScene({ ...p, habitus: { ...p.habitus, chest: { build, sex: 'male' } } });
      const L = sc.chestWall.layers(0, 60);
      let bone = -1;
      for (let d = 0; d < 40; d += 0.05) {
        const t0 = sc.classify([0, sc.torso.b - d, 60], BASELINE_INSTANT).tissue;
        if (t0 === Tissue.Bone) {
          bone = d;
          break;
        }
      }
      // (en la línea media la métrica es la normal)
      expect(bone, build).toBeCloseTo(L.skin + L.fat, 0);
      expect(bone, build).toBeGreaterThan(3);
    }
  });

  it('la pleura se inclina con la pared (la normal de su cara, no la de la piel): poco delante, hasta ≈ 10° hacia la axila', () => {
    const tilt = (u: number, z: number): number => {
      const tau = (() => {
        let lo = 0;
        let hi = Math.PI;
        for (let i = 0; i < 50; i++) {
          const mid = 0.5 * (lo + hi);
          if (wallArc([t.a * Math.sin(mid), t.b * Math.cos(mid), 0], t) < u) lo = mid;
          else hi = mid;
        }
        return 0.5 * (lo + hi);
      })();
      const sk: Vec3 = [-t.a * Math.sin(tau), t.b * Math.cos(tau), z];
      const R = Math.hypot(sk[0], sk[1]);
      const d = cw.total(u, z);
      const m: Vec3 = [sk[0] * (1 - d / R), sk[1] * (1 - d / R), z];
      const n = wallInnerNormal(m, t);
      const ns = torsoNormal(m, t);
      return (Math.acos(Math.min(1, n[0] * ns[0] + n[1] * ns[1] + n[2] * ns[2])) * 180) / Math.PI;
    };
    // delante, lo que cambian con u la métrica radial y la pared del esternón a la medioclavicular (3,1°)
    expect(tilt(st.midclavicular, LOW_Z)).toBeLessThan(4);
    let worst = 0;
    for (let z = cw.zLow; z <= cw.zHigh; z += 2) worst = Math.max(worst, tilt(st.midaxillary, z));
    expect(worst).toBeGreaterThan(5);
    expect(worst).toBeLessThan(12);
    // y es la que usa la pasada B para la incidencia de la pleura
    for (const src of [FRAG_RAWFIELD, FRAG_RAWFIELD_STEERED]) expect(src).toContain('wallInnerNormal(toMaterial(pD))');
  });

  it('el pulmón que toca la pared baja lo que el diafragma alrededor de todo el tronco (la cortina)', () => {
    // lus-sim (decisión 17): sin escalar las cúpulas con la cara interna de la pared, la pleura del flanco quedaba fuera de su
    // elipse, el pulmón llegaba a la inserción (−50) y el borde no se movía al respirar. Desde la decisión 18 el borde en FRC
    // es el de la base (`organs/lungBorder.ts`: la 8.ª costilla en la LAM, z −35) y la cortina baja en los dos hemitórax. A
    // 1,5 mm de la pleura, delante, al lado y detrás, a los dos lados
    const border = (phi: number, caudal: number): number => {
      let low = Number.NaN;
      for (let z = 60; z >= -150; z -= 0.5) {
        const sk = torsoSkinPoint(phi, z, t);
        const R = Math.hypot(sk[0], sk[1]);
        let lo = 0;
        let hi = 60;
        for (let i = 0; i < 40; i++) {
          const d = 0.5 * (lo + hi);
          if (scene.insideWallMm([sk[0] * (1 - d / R), sk[1] * (1 - d / R), z]) < 1.5) lo = d;
          else hi = d;
        }
        const d = 0.5 * (lo + hi);
        if (scene.classify([sk[0] * (1 - d / R), sk[1] * (1 - d / R), z], { diaphragmCaudalMm: caudal }).tissue !== Tissue.Lung) break;
        low = z;
      }
      return low;
    };
    for (const f of [0.7, 0.85, 1, 1.1, 1.2, 0.15, 0, -0.1, -0.2]) {
      const rest = border(f * Math.PI, 0);
      const deep = border(f * Math.PI, 30);
      expect(rest, `${f}π`).toBeLessThan(-10);
      expect(rest - deep, `${f}π`).toBeGreaterThanOrEqual(29);
    }
  });

  it('la ladera de la cúpula pleural tiene la pendiente acotada en todo el perímetro (decisión 44)', () => {
    // la pared por encima de la 1.ª costilla y por debajo del techo (la radial ya no cruza pulmón), del esternón a la línea media
    // posterior: |∇W| (mm de pared por mm de z y de piel). Delante (u < 384) ≤ 2 (medido: 1,88); junto a la línea media posterior,
    // donde la cúpula pasa al cuello delante de la columna, ≤ 4,5 (medido: 4,25 en u 403). Con la curva de la decisión 27,
    // Rc·(1 − √(1 − h)), 37 delante y 45 detrás
    const S = LUNG_APEX.params.cupolaMaxSlope.value;
    const h = 0.05;
    const worst = { front: { g: 0, at: '' }, back: { g: 0, at: '' } };
    for (let u = 0; u <= wallPerimeter(t) / 2; u += 1)
      for (let z = 140; z <= 200; z += 0.25) {
        const v = [cw.total(u, z), cw.total(u, z + h), cw.total(u, z - h), cw.total(u + h, z), cw.total(Math.max(0, u - h), z)];
        if (v.some((x) => x > 150)) continue;
        const g = Math.hypot((v[1] - v[2]) / (2 * h), (v[3] - v[4]) / (2 * h));
        const w = u < 384 ? worst.front : worst.back;
        if (g > w.g) {
          w.g = g;
          w.at = `u ${u}, z ${z}`;
        }
      }
    expect(worst.front.g, worst.front.at).toBeLessThanOrEqual(2);
    expect(worst.front.g, worst.front.at).toBeGreaterThan(S * 0.9);
    expect(worst.back.g, worst.back.at).toBeLessThanOrEqual(4.5);
  });

  it('la ladera de la cúpula pleural sale de la pared sin esquina (decisión 44)', () => {
    // en su arranque sobre la 1.ª costilla la ladera crece como h² (a 1 mm, < 0,25 mm; medido ≤ 0,15), no como h (la de la
    // decisión 27: 0,39 mm en la LMC, 3,17 fuera del tercio medio)
    for (const u of [40, 86, 140]) {
      const j = Math.floor(u / CHEST_WALL_DU_MM);
      const zApex = cw.table[(j * CHEST_WALL_TEXELS_PER_COL + 3) * 4];
      const base = cw.total(j * CHEST_WALL_DU_MM, zApex - 0.5);
      expect(cw.total(j * CHEST_WALL_DU_MM, zApex + 1) - base, `u ${u}`).toBeLessThan(0.25);
    }
  });

  it('gemelo GLSL de la ladera de la cúpula: la misma curva y la misma pendiente que en TS (decisión 44)', () => {
    const A = LUNG_APEX.params;
    expect(LUNG_APEX_GLSL).toContain(`#define CUPOLA_RC ${A.cupolaCurveMm.value.toFixed(4)}`);
    expect(LUNG_APEX_GLSL).toContain(`#define CUPOLA_SLOPE ${A.cupolaMaxSlope.value.toFixed(4)}`);
    expect(LUNG_APEX_GLSL).toContain(
      'float cupolaRoofDepthMm(vec2 a) { return min(CUPOLA_RC, 0.5 * CUPOLA_SLOPE * max(a.y - a.x, 1e-3)); }',
    );
    expect(LUNG_APEX_GLSL).toContain('if (z >= a.x + span) return CUPOLA_CAP;');
    expect(LUNG_APEX_GLSL).toContain('return cupolaRoofDepthMm(a) * h * h;');
    expect(ANATOMY_GLSL).toContain(LUNG_APEX_GLSL);
  });

  it('gemelo GLSL: la tabla y las constantes salen del módulo, y el shader y la escena leen la misma pared', () => {
    expect(ANATOMY_GLSL).toContain(CHEST_WALL_GLSL);
    expect(CHEST_WALL_GLSL).toContain(`#define CW_BASE ${CHEST_WALL_BASE}`);
    expect(CHEST_WALL_GLSL).toContain(`#define CW_COLS ${CHEST_WALL_COLS}`);
    expect(CHEST_WALL_GLSL).toContain(`#define CW_DU ${CHEST_WALL_DU_MM.toFixed(4)}`);
    expect(CHEST_WALL_GLSL).toContain(`#define CW_ABD_BLEND ${P.abdomenBlendMm.value.toFixed(4)}`);
    // uChestWall: las alturas y el engrosamiento inspiratorio por mm de descenso, con su referencia
    const u = SCENE_UNIFORMS.find((x) => x.name === 'uChestWall')!;
    expect(Array.from(u.value(scene, { sample: null as never, compression: null }))).toEqual([
      cw.zHigh,
      cw.zLow,
      P.intercostalInspirationMm.value / P.inspirationReferenceMm.value,
      cw.maxTotal,
    ]);
    // la GLSL no lee la tabla más hondo que `maxTotal` (más la lámina de la cortina o el tope del «resto»): es una cota de
    // verdad, en todo el tronco y en cada hábito
    for (const chest of [
      { build: 'average', sex: 'male' },
      { build: 'thin', sex: 'female' },
      { build: 'obese', sex: 'female' },
    ] as const) {
      const p = defaultPatient();
      const w = new AnatomyScene({ ...p, habitus: { ...p.habitus, chest } }).chestWall;
      let max = 0;
      // por encima de la cúpula pleural más baja (cobertura torácica) la pared engruesa hasta cerrarse sobre el vértice: ahí la
      // GLSL siempre lee la tabla (uCupola.x)
      for (let uu = 0; uu <= 440; uu += 2) for (let z = -300; z <= w.apexMinZ; z += 5) max = Math.max(max, w.total(uu, z));
      expect(w.maxTotal, chest.build).toBeGreaterThanOrEqual(max);
      expect(w.maxTotal - max, chest.build).toBeLessThan(0.5);
    }
    expect(ANATOMY_GLSL).toContain(
      'float far = m.z > uCupola.x ? 1e4 : uChestWall.w + max(max(uCurtain.y, BOWEL_BD_CAP_MM + LB_ZOA_TLC + 1.0), uHeartC.w);',
    );
    // la escena lee la pared con los gemelos TS de nombre GLSL, sobre la misma tabla float32 (que el GLSL da lo mismo lo
    // comprueba la e2e: volumen, cáscara y extremos de las costillas)
    for (const [uu, z] of [
      [33, 12],
      [-190, 55],
      [300, -120],
    ] as const) {
      expect(wallTotalAt(cw, uu, z)).toBe(cw.total(uu, z));
      expect(wallLayersAt(cw, uu, z)).toEqual(cw.layers(uu, z));
    }
    // la cara interna de la pared bajo la sonda: la pleura a la profundidad de la pared de su punto
    const s = torsoSkinPoint(Math.PI, 0, t);
    expect(scene.insideWallMm(s)).toBeCloseTo(-cw.total(wallArc(s, t), 0), 9);
  });
});
