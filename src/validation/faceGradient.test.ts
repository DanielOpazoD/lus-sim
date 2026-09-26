import { describe, expect, it } from 'vitest';
import { FACE_GRADIENT_EPS_MM, INTERFACES, Interface, LAST_TUBE_INTERFACE } from '../anatomy/interfaces';
import { tubeFaceGradient, tubeQuery, type Tube } from '../anatomy/primitives';
import { AnatomyQuery } from '../anatomy/query';
import { AnatomyScene, faceGeometryOf } from '../anatomy/scene';
import type { Vec3 } from '../core/vec3';
import { PhysiologyEngine } from '../physiology/engine';
import { defaultPatient } from '../physiology/patientState';
import {
  IFACE_GRADIENT_MAX,
  IFACE_REACH_MM,
  IFACE_SHIFT_MM,
  INTERFACE_ECHO_GLSL,
  faceDelta,
  faceProfile,
} from '../ultrasound/interfaceEcho';

/**
 * El eco de interfaz evalúa su perfil de integral unidad en δ = ifd/(|∇|·cosθ) (decisión 57): `ifd` es
 * el valor de la distancia de la cara, que no siempre es euclídea, y |∇| la norma de su gradiente
 * (`faceGradient`). Sin |∇|, la suma del perfil a lo largo de un rayo valía 1/|∇|: la pared AP de la VCI
 * elíptica (|∇| = 1/apScale) perdía 2,2 dB a apScale 0,777 y 6 dB a 0,5. Aquí: la suma vale 1 en una VCI
 * elíptica sintética y en la de la escena, el gradiente y la curvatura de `tubeFaceGradient` (gemelo de
 * la GLSL) son los de la distancia del tubo, y la salida barata de la pasada B (ifd > alcance·cota antes
 * de calcular el gradiente) no descarta ninguna muestra al alcance de su cara.
 *
 * lus-sim (decisión 10): los tubos sintéticos se conservan (prueban `primitives.ts` e `interfaceEcho.ts`,
 * portados idénticos); en la escena, las caras del tórax (pared, costillas, pericondrio y cúpula) en lugar de
 * las del hígado, la vesícula, el riñón y la cava. Lo que comprueba el shader ensamblado vuelve en el paso B.
 */
type V = Vec3;
const dr = 180 / 1024;
const add = (p: V, d: V, t: number): V => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const db = (x: number) => 20 * Math.log10(x);

/** VCI sintética: eje z, radio lateral 10 mm, sección elíptica de semieje AP 10·apScale; pared 0,8 mm. */
const syntheticIvc = (apScale: number, taper = 0): Tube => ({
  kind: 'tube',
  nodes: [
    { p: [0, 0, -60], r: 10 - taper },
    { p: [0, 0, 60], r: 10 + taper },
  ],
  apScale,
});
const WALL_MM = 0.8;

/**
 * Suma del perfil de dos lados a lo largo del rayo P + d·t que cruza la cara del tubo en P, promediada
 * sobre 50 posiciones de la cara dentro de una muestra. `withNorm` = false es la regla de antes (|∇| = 1).
 */
function profileSum(tube: Tube, P: V, d: V, withNorm = true): number {
  let acc = 0;
  const N = 50;
  for (let o = 0; o < N; o++)
    for (let k = -20; k <= 20; k++) {
      const p = add(P, d, (k + o / N) * dr);
      const hit = tubeQuery(p, tube, 1);
      if (hit.d >= WALL_MM) continue; // fuera de la pared: el hígado no conoce la cara
      const { gradient } = tubeFaceGradient(p, tube, 1, hit);
      const norm = Math.hypot(gradient[0], gradient[1], gradient[2]);
      const cos = Math.abs(dot(gradient, d)) / norm;
      acc += faceProfile(faceDelta(Math.abs(hit.d), withNorm ? norm : 1, cos), true) * dr;
    }
  return acc / N;
}

/** Rota v un ángulo a alrededor del eje unitario u (Rodrigues). */
const rotate = (v: V, u: V, a: number): V => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x: V = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return [0, 1, 2].map((i) => v[i] * c + x[i] * s + u[i] * dot(u, v) * (1 - c)) as V;
};

describe('Eco de interfaz en la distancia por la normal (|∇| de la cara)', () => {
  it('VCI elíptica sintética: el perfil suma 1 en las paredes AP y lateral a 0–20° y cualquier apScale', () => {
    for (const ap of [1, 0.777, 0.7, 0.5]) {
      const tube = syntheticIvc(ap);
      for (const [wall, P, n] of [
        ['AP', [0, 10 * ap, 0], [0, 1, 0]],
        ['lateral', [10, 0, 0], [1, 0, 0]],
      ] as [string, V, V][]) {
        // incidencia θ inclinando el rayo en la sección (alrededor del eje) y a lo largo del eje
        for (const [axis, name] of [
          [[0, 0, 1], 'sección'],
          [wall === 'AP' ? [1, 0, 0] : [0, 1, 0], 'eje'],
        ] as [V, string][])
          for (const deg of [0, 10, 20]) {
            const d = rotate(n, axis, (deg * Math.PI) / 180);
            const sum = profileSum(tube, P, d);
            expect(Math.abs(db(sum)), `apScale ${ap}, pared ${wall}, ${deg}° en ${name}: ${db(sum).toFixed(3)} dB`).toBeLessThan(0.1);
          }
      }
      // la regla de antes (δ = ifd/cosθ) integra 1/|∇| = apScale en la pared AP; en la lateral, 1
      const before = profileSum(tube, [0, 10 * ap, 0], [0, 1, 0], false);
      expect(db(before)).toBeCloseTo(db(ap), 1);
      expect(Math.abs(db(profileSum(tube, [10, 0, 0], [1, 0, 0], false)))).toBeLessThan(0.1);
    }
  });

  it('tubeFaceGradient es el gradiente de la distancia del tubo (elíptico y afilado) y su curvatura la de la sección', () => {
    const numGrad = (tube: Tube, p: V): V => {
      const h = 1e-4;
      return [0, 1, 2].map((a) => {
        const pp: V = [...p];
        const pm: V = [...p];
        pp[a] += h;
        pm[a] -= h;
        return (tubeQuery(pp, tube, 1).d - tubeQuery(pm, tube, 1).d) / (2 * h);
      }) as V;
    };
    for (const ap of [1, 0.777, 0.5])
      for (const taper of [0, 1.5]) {
        const tube = syntheticIvc(ap, taper);
        for (let i = 0; i < 64; i++) {
          const phi = (2 * Math.PI * (i + 0.37)) / 64;
          const z = -30 + (60 * i) / 64;
          const rz = 10 + (taper * z) / 60;
          // a ±0,4 mm de la pared (la banda del eco), por la dirección radial de la sección escalada
          for (const off of [-0.4, 0.3]) {
            const p: V = [(rz + off) * Math.cos(phi), (rz + off) * ap * Math.sin(phi), z];
            const hit = tubeQuery(p, tube, 1);
            const { gradient } = tubeFaceGradient(p, tube, 1, hit);
            const g = numGrad(tube, p);
            const norm = Math.hypot(...g);
            expect(Math.hypot(...gradient) / norm - 1, `ap ${ap}, afilado ${taper}`).toBeCloseTo(0, 5);
            expect(dot(gradient, g) / (Math.hypot(...gradient) * norm)).toBeGreaterThan(1 - 1e-8);
          }
        }
        // curvatura: la de la elipse en sus paredes AP y lateral, y la divergencia de la normal en general
        const r = 10;
        const kAp = tubeFaceGradient([0, r * ap, 0], tube, 1, tubeQuery([0, r * ap, 0], tube, 1)).curvature;
        const kLat = tubeFaceGradient([r, 0, 0], tube, 1, tubeQuery([r, 0, 0], tube, 1)).curvature;
        expect(kAp * r).toBeCloseTo(ap, 6);
        expect(kLat * r).toBeCloseTo(1 / (ap * ap), 6);
        if (taper) continue;
        const unitN = (p: V): V => {
          const { gradient: g } = tubeFaceGradient(p, tube, 1, tubeQuery(p, tube, 1));
          const l = Math.hypot(...g);
          return [g[0] / l, g[1] / l, g[2] / l];
        };
        for (const phi of [0.3, 0.9, 1.3, 2.2]) {
          const p: V = [r * Math.cos(phi), r * ap * Math.sin(phi), 0];
          const h = 1e-4;
          let div = 0;
          for (let a = 0; a < 3; a++) {
            const pp: V = [...p];
            const pm: V = [...p];
            pp[a] += h;
            pm[a] -= h;
            div += (unitN(pp)[a] - unitN(pm)[a]) / (2 * h);
          }
          // la cara es un cilindro: la divergencia de su normal es su curvatura circunferencial
          expect(tubeFaceGradient(p, tube, 1, tubeQuery(p, tube, 1)).curvature / div - 1, `ap ${ap}, φ ${phi}`).toBeCloseTo(0, 4);
        }
      }
  });

  describe('en la escena (apnea espiratoria)', () => {
    const patient = { ...defaultPatient(), respiratoryPattern: 'apnea-expiratory' as const };
    const scene = new AnatomyScene(patient);
    const anatomy = new AnatomyQuery(scene);
    const engine = new PhysiologyEngine(patient, { historySeconds: 4 });
    for (let i = 0; i < Math.round(2 / engine.clock.dt); i++) engine.step();
    const instant = anatomy.instantFor(engine.sample);

    it('instantFor: el descenso del diafragma de la muestra, memorizado por identidad de la muestra', () => {
      expect(instant.diaphragmCaudalMm).toBe(0); // apnea espiratoria
      expect(anatomy.instantFor(engine.sample)).toBe(instant);
      const next = engine.step();
      expect(anatomy.instantFor(next)).not.toBe(instant);
      expect(anatomy.instantFor(next)).toEqual({ diaphragmCaudalMm: next.resp.diaphragmCaudalMm });
    });

    it('la salida barata de la pasada B no descarta ninguna muestra al alcance de su cara', () => {
      // GLSL: sin calcular el gradiente, descarta ifd > alcance·cota, con cota = |∇| exacta en los tubos
      // (va en c.n) e IFACE_GRADIENT_MAX en el resto. Es exacto si toda muestra descartada tiene
      // ifd/|∇| > alcance: se comprueba en puntos del tronco a ≤ 3 mm de una cara (en el tórax no hay tubos)
      let state = 20260924;
      const rnd = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const seen = new Map<Interface, { near: number; dropped: number; maxNorm: number }>();
      for (let i = 0; i < 400_000; i++) {
        const r = Math.sqrt(rnd());
        const a = 2 * Math.PI * rnd();
        const m: V = [scene.torso.a * r * Math.cos(a), scene.torso.b * r * Math.sin(a), -160 + 280 * rnd()];
        const c = scene.classify(m, instant);
        if (c.interface === Interface.None || c.interfaceDistance > 3) continue;
        expect(c.interface, 'el tórax no tiene caras de tubo').toBeGreaterThan(LAST_TUBE_INTERFACE);
        const reach = INTERFACES[c.interface].twoSided ? IFACE_REACH_MM : IFACE_SHIFT_MM + IFACE_REACH_MM;
        const g = scene.faceGradient(m, instant)!;
        const s = seen.get(c.interface) ?? { near: 0, dropped: 0, maxNorm: 0 };
        s.near++;
        if (c.interfaceDistance > reach * IFACE_GRADIENT_MAX) {
          s.dropped++;
          s.maxNorm = Math.max(s.maxNorm, g.norm);
          expect(c.interfaceDistance / g.norm, `${Interface[c.interface]} en ${m.map((x) => x.toFixed(1)).join(', ')}`).toBeGreaterThan(
            reach,
          );
        }
        seen.set(c.interface, s);
      }
      // la cara hepática del diafragma (la mitad abdominal de la lámina, 1,25 mm, dentro de la cota: nunca se
      // descarta) aparece con muestras
      expect(seen.get(Interface.DiaphragmLiver)?.near ?? 0).toBeGreaterThan(200);
      // las caras de la pared y de las costillas (decisión 62): la distancia de su capa ondula en (u, z) y la
      // de la costilla no es euclídea; la salida barata tampoco pierde muestras suyas. Sin ondas periódicas en
      // la vuelta, la línea media posterior (donde u salta de +P/2 a −P/2) daba aquí un |∇| de ~10³. Umbrales de
      // VExUS (el tronco, la pared y las costillas son los mismos)
      for (const f of [
        Interface.SkinFat,
        Interface.Scarpa,
        Interface.DeepFascia,
        Interface.ObliquePlane,
        Interface.TransversusPlane,
        Interface.Transversalis,
        Interface.Peritoneum,
        Interface.RibCortex,
        Interface.Perichondrium,
      ]) {
        expect(seen.get(f)?.near ?? 0, Interface[f]).toBeGreaterThan(50);
        // el peritoneo lo dibuja una grasa preperitoneal de ≥ 1,5 mm cuya mitad honda cae entera dentro de la
        // cota: nunca se descarta
        if (f !== Interface.Peritoneum) expect(seen.get(f)?.dropped ?? 0, Interface[f]).toBeGreaterThan(20);
        expect(seen.get(f)?.maxNorm ?? 0, Interface[f]).toBeLessThan(IFACE_GRADIENT_MAX);
      }
    });

    it('faceGradient da el gradiente numérico de faceSdf en la cúpula', () => {
      // los puntos de la banda del eco (0,02–0,5 mm) de la cara en una rejilla del tronco: el mismo cálculo
      let worst = 0;
      let count = 0;
      const h = FACE_GRADIENT_EPS_MM;
      for (let x = -120; x <= 110; x += 2.3)
        for (let y = -80; y <= 80; y += 2.3)
          for (let z = -150; z <= 90; z += 7.9) {
            const m: V = [x, y, z];
            const c = scene.classify(m, instant);
            const face = faceGeometryOf(c.interface);
            if (!face || c.interfaceDistance < 0.02 || c.interfaceDistance > 0.5) continue;
            const num = [0, 1, 2].map((a) => {
              const pp: V = [...m];
              const pm: V = [...m];
              pp[a] += h;
              pm[a] -= h;
              return (scene.faceSdf(pp, instant, face)! - scene.faceSdf(pm, instant, face)!) / (2 * h);
            }) as V;
            const g = scene.faceGradient(m, instant)!;
            worst = Math.max(worst, Math.abs(g.norm / Math.hypot(...num) - 1));
            count++;
          }
      // medido: 273 puntos de la banda en la rejilla (la cúpula es la única cara con geometría de faceSdf)
      expect(count).toBeGreaterThan(200);
      expect(worst).toBeLessThan(1e-12);
      // fuera de toda cara, null; forzando la cúpula, su gradiente
      expect(scene.faceGradient([-55, -5, 70], instant)).toBeNull();
      expect(scene.faceGradient([-55, -5, 70], instant, 'dome')!.norm).toBeCloseTo(1, 3);
    });
  });

  it('GLSL: la cota de la salida barata, la jacobiana de la compresión y δ con |∇|', () => {
    const echo = INTERFACE_ECHO_GLSL.replace(/\s+/g, ' ');
    expect(echo).toContain(`#define IFACE_GRAD_MAX ${IFACE_GRADIENT_MAX.toFixed(4)}`);
    // con la compresión de la sonda (decisión 63) la cota se multiplica por la de la jacobiana (warpBound) y el
    // gradiente de la cara se lleva al mundo antes del eco
    expect(echo).toContain('float gBound = (c.iface <= IF_LAST_TUBE ? length(c.n) : IFACE_GRAD_MAX) * warpBound(w);');
    expect(echo).toContain('vec3 gw = warpNormal(w, fg.xyz * fg.w); float gn = length(gw); fg = vec4(gw / max(gn, 1e-9), gn);');
    expect(echo).toContain('return interfaceProfileEcho(c.iface, cosI, curv, c.ifd / (fg.w * cosI));');
    expect(echo).toContain('float kl = dot(lat, circ); kl = kl * kl * c.kc;');
  });
});
