import { describe, expect, it } from 'vitest';
import {
  SUBPLEURAL_AERATION,
  SUBPLEURAL_GRID,
  SUBPLEURAL_NODES,
  gasFractionAt,
  quadGas,
  subpleuralNode,
  subpleuralQuad,
  uniformAeration,
  validateAeration,
} from '../physiology/lungAeration';
import { defaultPatient, validatePatient } from '../physiology/patientState';
import { SUBPLEURAL_SUMMARY_TEXEL, SUBPLEURAL_TABLE_BASE, SUBPLEURAL_TRAPS, subpleuralTable } from '../anatomy/organs/subpleural';
import { alveolarAccessFraction, pcgHash, seedBits, septalOpenFraction, tableGas, trapCell, u24 } from '../anatomy/organs/subpleuralTraps';
import { AnatomyScene } from '../anatomy/scene';
import { SCENE_TEX_H, SCENE_TEX_W } from '../anatomy/gpu/anatomy.glsl';
import { B_LINES, ETA_MAX, RING_LATTICE_MM } from '../ultrasound/bLines';
import {
  diffuseField,
  lungMayOpen,
  nodeWeights,
  ringDown,
  trapGeometry,
  trapOffset,
  trapScan,
  type TrapGeometry,
} from '../ultrasound/bLineTraps';
import { glslFloat } from '../ultrasound/receiver';
import { CONVEX_BEAM, lateralSigmaMm } from '../ultrasound/beamModel';
import { FRAG_RAWFIELD, FRAG_QUERY } from '../ultrasound/shaders/passes.glsl';

/**
 * Las líneas B (decisión 51): el contrato de la aireación del paciente, la población de trampas, su reirradiación y el
 * detector, sin GPU. La imagen formada (gemelo B → C → D) está en `bLinesTwin.test.ts`; la equivalencia TS ↔ GLSL, en la e2e
 * (`e2e/lineasB.spec.ts`).
 */
const TP = SUBPLEURAL_TRAPS.params;
/** pcg_hash(0) = 129708002 es el valor publicado del PCG de 32 bits; los demás, los de esta implementación (y la de la GLSL). */
const PCG_REFERENCE = [129708002, 2831084092, 2055130248, 1223963391, 3861530882];
const TRAP_CELL_REFERENCE = {
  u: 18.85349496841431,
  z: -6.7725861406326295,
  xi: 0.6515954732894897,
  size: 0.809094101190567,
  hash: 1639869407,
};
const quadOf = (gas: number) => ({ j: 0, i: 0, g: [gas, gas, gas, gas] as const });
/** La geometría de una línea perpendicular a una pleura plana con el corte longitudinal (lateral = z, elevación = u). */
const geom = (u = 0, z = 0): TrapGeometry => trapGeometry(u, z, 0, 1, 1, 0, 0.26, 0.55, 1.7)!;

describe('Aireación subpleural del paciente (el contrato)', () => {
  it('la rejilla cubre el perímetro del tronco y el pulmón de la base al vértice', () => {
    const G = SUBPLEURAL_GRID;
    expect(G.U0).toBeLessThanOrEqual(-420);
    expect(G.U0 + (G.NU - 1) * G.DU).toBeGreaterThanOrEqual(420);
    expect(G.Z0).toBeLessThanOrEqual(-200);
    expect(G.Z0 + (G.NZ - 1) * G.DZ).toBeGreaterThanOrEqual(250);
    expect(subpleuralNode(G.NU + 1)).toEqual({ u: G.U0 + G.DU, z: G.Z0 + G.DZ });
  });

  it('sin `lung`, la aireación normal; con ella, la bilineal de sus nodos y el nodo más cercano fuera de la rejilla', () => {
    expect(gasFractionAt(undefined, 0, 0)).toBe(SUBPLEURAL_AERATION.params.normalGasFraction.value);
    const a = uniformAeration(0.8);
    const G = SUBPLEURAL_GRID;
    a.gas[6 * G.NU + 12] = 0.4; // nodo (u = 0, z = 20)
    expect(gasFractionAt(a, 0, 20)).toBeCloseTo(0.4, 12);
    expect(gasFractionAt(a, 17.5, 20)).toBeCloseTo(0.6, 12);
    expect(gasFractionAt(a, 0, 40)).toBeCloseTo(0.6, 12);
    expect(gasFractionAt(a, 5000, 20)).toBeCloseTo(0.8, 12);
    // el cuadrilátero prolonga su pendiente fuera de él (y acota a [0, 1])
    const q = subpleuralQuad(a.gas, 1, 21);
    expect(quadGas(q, -10, 20)).toBeLessThanOrEqual(1);
    expect(quadGas(q, 1, 21)).toBeCloseTo(gasFractionAt(a, 1, 21), 12);
  });

  it('el paciente valida su aireación (forma y dominio)', () => {
    const p = defaultPatient();
    p.lung = uniformAeration(0.5);
    expect(() => validatePatient(p)).not.toThrow();
    p.lung.gas[3] = 1.2;
    expect(() => validatePatient(p)).toThrow(/fuera de \[0, 1\]/);
    expect(() => validateAeration({ gas: [0.5] })).toThrow(/nodos/);
  });

  it('la escena lleva la tabla en la textura de escena, con el resumen; cambiarla sube la versión', () => {
    const p = defaultPatient();
    const scene = new AnatomyScene(p);
    expect(SUBPLEURAL_SUMMARY_TEXEL + 1).toBeLessThanOrEqual(SCENE_TEX_W * SCENE_TEX_H);
    expect(SUBPLEURAL_TABLE_BASE).toBeGreaterThan(0);
    expect(tableGas(scene.subpleural.table).every((g) => g === Math.fround(0.8))).toBe(true);
    const v = scene.subpleural.version;
    const lung = uniformAeration(0.7);
    lung.gas[10] = 0.3;
    scene.setLungAeration(lung);
    expect(scene.subpleural.version).toBe(v + 1);
    expect(scene.subpleural.table[SUBPLEURAL_NODES * 4]).toBeCloseTo(0.3, 6);
    expect(subpleuralTable(undefined)[SUBPLEURAL_NODES * 4]).toBeCloseTo(0.8, 6);
  });
});

describe('Trampas subpleurales (estado físico)', () => {
  it('el pulmón normal no tiene ninguna; se abren al perder aire y todas desde la fracción llena (F-T27)', () => {
    expect(septalOpenFraction(SUBPLEURAL_AERATION.params.normalGasFraction.value)).toBe(0);
    expect(septalOpenFraction(TP.septalOnsetGas.value)).toBe(0);
    expect(septalOpenFraction(0.7)).toBeLessThan(0.05);
    expect(septalOpenFraction(TP.septalFullGas.value)).toBe(1);
    let prev = 0;
    for (let g = 0.8; g >= 0.2; g -= 0.01) {
      const p = septalOpenFraction(g);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    // la inundación alveolar empieza después de los tabiques y llega a su fracción accesible
    expect(alveolarAccessFraction(TP.septalOnsetGas.value)).toBe(0);
    expect(alveolarAccessFraction(0.57)).toBe(0);
    expect(alveolarAccessFraction(0.25)).toBeCloseTo(TP.alveolarAccess.value, 12);
  });

  it('el hash de las celdas es entero (exacto en TS y GLSL), determinista y uniforme', () => {
    expect(pcgHash(0)).toBe(pcgHash(0));
    expect(pcgHash(1)).not.toBe(pcgHash(2));
    const xs: number[] = [];
    for (let i = 0; i < 4000; i++) xs.push(u24(pcgHash(i)));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(xs.reduce((a, b) => a + b, 0) / xs.length).toBeCloseTo(0.5, 1);
    // valores de referencia del PCG de 32 bits (Jarzynski y Olano 2020, `pcg_hash`), los mismos que da la GLSL (la equivalencia de
    // la e2e): un cambio del hash solo en TS rompe esto antes que la GPU
    expect([0, 1, 2, 42, 0xffffffff].map(pcgHash)).toEqual(PCG_REFERENCE);
    expect(trapCell(3, -2, 921)).toEqual(TRAP_CELL_REFERENCE);
    // la semilla es la que la GPU recupera de uSeed = (semilla mod 1000)/7
    const seed = 20260921;
    expect(Math.floor(Math.fround((seed % 1000) / 7) * 7 + 0.5)).toBe(seedBits(seed));
    const c = trapCell(-3, 7, seedBits(seed));
    expect(c).toEqual(trapCell(-3, 7, seedBits(seed)));
    // la trampa queda dentro de su celda (con su jitter) y su tamaño en [1 − dispersión, 1]
    const a = TP.septalCellMm.value;
    expect(c.u).toBeGreaterThanOrEqual(-3 * a);
    expect(c.u).toBeLessThan(-2 * a);
    expect(c.size).toBeGreaterThanOrEqual(1 - TP.accessSpread.value);
    expect(c.size).toBeLessThanOrEqual(1);
  });

  it('la fracción abierta de una región es la de sus celdas (ley de los grandes números)', () => {
    const q = quadOf(0.6);
    let open = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const c = trapCell(i % 80, Math.floor(i / 80), 921);
      if (c.xi < septalOpenFraction(quadGas(q, c.u, c.z))) open++;
    }
    expect(open / N).toBeCloseTo(septalOpenFraction(0.6), 1);
  });
});

describe('Reirradiación y pérdida especular de las trampas (bLines.ts)', () => {
  it('con el pulmón normal no hay nada: ρ = 1, sin campo (la guarda de la pasada B)', () => {
    expect(lungMayOpen(0.8)).toBe(false);
    expect(lungMayOpen(0.6)).toBe(true);
    for (const tau of [-1, 0, 5, 50])
      expect(trapScan(geom(), quadOf(0.8), 0.8, 921, tau)).toMatchObject({ re: 0, im: 0, rho: 1, eta: 0, traps: 0 });
  });

  it('η crece al perder aire, con su tope; ρ = (1 − η)(1 − ηa) y sobre la pleura solo ρ', () => {
    const etaOf = (gas: number): number => {
      let s = 0;
      for (let z = 0; z < 300; z += 0.7) s += trapScan(geom(0, z), quadOf(gas), gas, 921, -1).eta;
      return s;
    };
    expect(etaOf(0.71)).toBeLessThan(etaOf(0.62));
    expect(etaOf(0.62)).toBeLessThan(etaOf(0.52));
    for (let z = 0; z < 100; z += 0.9) {
      const s = trapScan(geom(0, z), quadOf(0.4), 0.4, 921, -1);
      expect(s.eta).toBeLessThanOrEqual(ETA_MAX);
      expect(s.rho).toBeCloseTo((1 - s.eta) * (1 - s.alveolar), 12);
      expect(s.re).toBe(0);
      expect(s.im).toBe(0);
    }
  });

  it('la reirradiación cae con e^(−τ/L) y está fija a la trampa (misma señal en todas las líneas que la ven)', () => {
    const L = B_LINES.params.ringDownEfoldMm.value;
    // energía media de la señal de una trampa: plana en τ (el moteado de la reverberación)
    const e = (t0: number) => {
      let s = 0;
      for (let k = 0; k < 2000; k++) {
        const v = ringDown(k * 7919 + 1, t0);
        s += v[0] ** 2 + v[1] ** 2;
      }
      return s / 2000;
    };
    expect(e(3) / e(40)).toBeGreaterThan(0.8);
    expect(e(3) / e(40)).toBeLessThan(1.25);
    // una línea con trampas: |campo| a 2L frente a L, de media e^−1
    let num = 0;
    let den = 0;
    for (let z = 0; z < 400; z += 0.6) {
      const a = trapScan(geom(0, z), quadOf(0.6), 0.6, 921, L);
      const b = trapScan(geom(0, z), quadOf(0.6), 0.6, 921, 2 * L);
      den += a.re ** 2 + a.im ** 2;
      num += b.re ** 2 + b.im ** 2;
    }
    expect(Math.sqrt(num / den)).toBeCloseTo(Math.exp(-1), 1);
  });

  it('la anchura con que se ve una trampa es la de la PSF lateral en la pleura, con el paso de líneas y la celda por cotas', () => {
    const s = lateralSigmaMm(16, 16, CONVEX_BEAM);
    const g = trapGeometry(0, 0, 0, 1, 1, 0, s, 0.5, 1.9)!;
    expect(g.sigmaDrawMm).toBeCloseTo(Math.max(s, 0.3), 12);
    const deep = trapGeometry(0, 0, 0, 1, 1, 0, lateralSigmaMm(16, 60, CONVEX_BEAM), 0.5, 1.9)!;
    expect(deep.sigmaPhysMm).toBeGreaterThan(2 * g.sigmaPhysMm);
    expect(deep.sigmaDrawMm).toBeLessThanOrEqual(0.3 * TP.septalCellMm.value);
    // un plano a lo largo de la normal de la pleura no ve trampas
    expect(trapGeometry(0, 0, 0, 0.01, 0.01, 0, s, 0.5, 1.9)).toBeNull();
  });

  it('la distancia de una trampa al eje del haz es su proyección (Jᵀ): en incidencia oblicua la huella es cos θ más corta', () => {
    for (const th of [0, 0.3, 0.6]) {
      // la dirección lateral de la línea corre sobre la pleura con cos θ (el resto va hacia la normal); la elevacional, por u
      const g = trapGeometry(0, 0, 0, Math.cos(th), 1, 0, 0.3, 0.5, 1.7)!;
      const [dl, de] = trapOffset(g, 0, 2);
      expect(dl).toBeCloseTo(2 * Math.cos(th), 12);
      expect(de).toBeCloseTo(0, 12);
      expect(trapOffset(g, 1.5, 0)[1]).toBeCloseTo(1.5, 12);
    }
    // con el plano girado sobre la pleura, la proyección conserva la distancia (base ortonormal)
    const c = Math.cos(0.5);
    const s = Math.sin(0.5);
    const g = trapGeometry(0, 0, s, c, c, -s, 0.3, 0.5, 1.7)!;
    const [dl, de] = trapOffset(g, 1, 2);
    expect(Math.hypot(dl, de)).toBeCloseTo(Math.hypot(1, 2), 12);
  });

  it('η satura en ETA_MAX cuando las trampas cubren todo el haz, y ρ lo lleva', () => {
    // haz fino (κ0 = 1) sobre un pulmón con todos los tabiques abiertos: alguna línea suma Σκw > ETA_MAX
    let capped = 0;
    for (let z = 0; z < 400; z += 0.25) {
      const g = trapGeometry(0.3, z, 0, 1, 1, 0, 0.05, 3, 1.7)!;
      const r = trapScan(g, quadOf(0.5), 0.5, 921, -1);
      expect(r.eta).toBeLessThanOrEqual(ETA_MAX);
      if (r.eta === ETA_MAX) {
        capped++;
        expect(r.rho).toBeCloseTo((1 - ETA_MAX) * (1 - r.alveolar), 12);
      }
    }
    expect(capped).toBeGreaterThan(0);
    // y el tope deja pasar casi todo el haz a las trampas (con 0,6 la línea A sobreviviría en la columna de una trampa grande)
    expect(ETA_MAX).toBeGreaterThan(0.9);
  });

  it('los pesos entre nodos conservan la energía: el campo no deja bandas a cada paso de su retícula', () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const [a, b] = nodeWeights(t);
      expect(a * a + b * b).toBeCloseTo(1, 12);
    }
    const phase = (f: number) => {
      let e = 0;
      for (let k = 0; k < 3000; k++) {
        const v = ringDown((k * 2654435761) >>> 0, ((k % 50) + f) * RING_LATTICE_MM);
        e += v[0] ** 2 + v[1] ** 2;
      }
      return e;
    };
    expect(Math.abs(10 * Math.log10(phase(0.5) / phase(0)))).toBeLessThan(0.5);
    let e0 = 0;
    let e1 = 0;
    for (let k = 0; k < 2000; k++) {
      const a = diffuseField(k * 1.37, k * 0.71, (k % 40) * RING_LATTICE_MM, 921);
      const b = diffuseField(k * 1.37, k * 0.71, ((k % 40) + 0.5) * RING_LATTICE_MM, 921);
      e0 += a[0] ** 2 + a[1] ** 2;
      e1 += b[0] ** 2 + b[1] ** 2;
    }
    expect(Math.abs(10 * Math.log10(e1 / e0))).toBeLessThan(0.5);
  });

  it('la pasada B y la consulta de puntos llevan el gemelo GLSL, y la serie de la mirada 0 multiplica χ por ρ', () => {
    for (const src of [FRAG_RAWFIELD, FRAG_QUERY]) {
      expect(src).toContain('vec4 bLineField(vec3 m, vec3 dir, float D, float tau)');
      expect(src).toContain('uint pcgHash(uint v)');
    }
    expect(FRAG_RAWFIELD).toContain('float chi = pleuraCoherence(cosI) * bl.z;');
    expect(FRAG_RAWFIELD).toContain('air += bl.xy * tD;');
    // las expresiones de la GLSL que el gemelo TS replica (una mutación en una sola de las dos la atrapa la e2e; estas, aquí)
    for (const line of [
      'float kappa0 = min(1.0, BL_ACCESS / (6.2831853 * sPhys * sElev));',
      'float zc = m.z + lungSlideMm(m);',
      'if (tau >= 0.0) f += kw * ringDown(h, tau);',
      'float dl = k.x * d.x + k.y * d.y;',
      'float de = k.z * d.x + k.w * d.y;',
      'vec4 k = vec4(uL, lat.z, uE, uElev.z);',
      'float sPhys = lateralSigmaMm(D);',
      `eta = min(eta, ${glslFloat(ETA_MAX)});`,
      'return vec4(f, (1.0 - eta) * (1.0 - alv), traps);',
      'float sElev = elevSigma(D) * 0.70710678;',
      'eta += kw;',
    ])
      expect(FRAG_RAWFIELD, line).toContain(line);
    // y nada las pisa después: en el cuerpo de bLineField, k, sElev, sPhys y kappa0 se asignan una sola vez y η solo se acumula
    // y se acota (una mutación que conserve el texto y reasigne debajo la atrapa esto; la e2e, la que cambie la cuenta)
    const body = FRAG_RAWFIELD.slice(FRAG_RAWFIELD.indexOf('vec4 bLineField('));
    const fn = body.slice(0, body.indexOf('\n}\n') + 2);
    // todas las variables locales (no solo las fijadas arriba: también dl, de, w, kw…) se asignan una sola vez; los acumuladores
    // (η, f, traps) solo como se espera
    const assigns = (v: string) => fn.match(new RegExp(`(?<![\\w.])${v}(?:\\.[xyzw]+)?\\s*[-+*/]?=(?!=)`, 'g')) ?? [];
    const declared = [...fn.matchAll(/\b(?:float|int|uint|bool|vec[234])\s+(\w+)\s*=/g)].map((m) => m[1]);
    const accumulators = ['eta', 'f', 'traps'];
    expect(declared).toEqual(expect.arrayContaining(['k', 'sElev', 'sPhys', 'kappa0', 'alv', 'zc', 'u', 'dl', 'de', 'w', 'kw']));
    for (const v of declared.filter((x) => !accumulators.includes(x))) expect(assigns(v).length, v).toBe(1);
    expect(assigns('eta')).toEqual(['eta =', 'eta +=', 'eta =']);
  });
});
