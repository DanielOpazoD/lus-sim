import { describe, expect, it } from 'vitest';
import {
  diaphragmEdgeZ,
  diaphragmHeight,
  orthonormalBasis,
  sdCylinderZ,
  sdDiaphragm,
  sdEllipsoid,
  sdEllipsoidLocal,
  sdRib,
  sdSphere,
  sdSpine,
  smoothMax,
  smoothMin,
  torsoDepth,
  torsoNormal,
  torsoPhi,
  torsoSkinPoint,
  tubeQuery,
  type Tube,
} from '../anatomy/primitives';
import { AnatomyScene } from '../anatomy/scene';
import { defaultPatient } from '../physiology/patientState';

/**
 * Primitivas implícitas (`anatomy/primitives.ts`) con valores cerrados: sobre
 * los ejes principales las distancias salen exactas, así que las aserciones son
 * igualdades (± 1e-9), no desigualdades.
 *
 * lus-sim (decisión 10): sin el riñón ni la cava de VExUS; en su lugar, las primitivas del tórax (tronco,
 * diafragma, columna y costillas) con la escena del tórax.
 */
describe('tubeQuery', () => {
  const recto: Tube = {
    kind: 'tube',
    nodes: [
      { p: [0, 0, 0], r: 5 },
      { p: [0, 0, 100], r: 5 },
    ],
    apScale: 1,
  };
  const conico: Tube = {
    ...recto,
    nodes: [
      { p: [0, 0, 0], r: 5 },
      { p: [0, 0, 100], r: 15 },
    ],
  };
  const plano: Tube = { ...recto, apScale: 0.5 };

  it('distancia con signo, ρ, radio interpolado y tangente', () => {
    const eje = tubeQuery([0, 0, 50], recto);
    expect(eje.d).toBeCloseTo(-5, 9);
    expect(eje.rho).toBeCloseTo(0, 9);
    expect(eje.r).toBe(5);
    expect(eje.s).toBeCloseTo(0.5, 9);
    expect(eje.tangent).toEqual([0, 0, 1]);
    expect(tubeQuery([3, 0, 50], recto).d).toBeCloseTo(-2, 9);
    expect(tubeQuery([3, 0, 50], recto).rho).toBeCloseTo(0.6, 9);
    expect(tubeQuery([8, 0, 50], recto).d).toBeCloseTo(3, 9);
    // más allá del extremo: distancia al último nodo
    expect(tubeQuery([0, 0, 150], recto).d).toBeCloseTo(45, 9);
    // radio interpolado y escala de calibre
    expect(tubeQuery([0, 0, 50], conico).r).toBeCloseTo(10, 9);
    expect(tubeQuery([0, 0, 50], conico, 2).r).toBeCloseTo(20, 9);
    expect(tubeQuery([0, 0, 50], conico, 2).d).toBeCloseTo(-20, 9);
  });

  it('sección elíptica: escala solo el semieje AP y conserva la tapa del extremo', () => {
    expect(tubeQuery([0, 2, 50], plano).d).toBeCloseTo(-1, 9); // semieje AP = 2,5
    expect(tubeQuery([0, 3, 50], plano).d).toBeCloseTo(1, 9);
    expect(tubeQuery([3, 0, 50], plano).d).toBeCloseTo(-2, 9); // lateral intacto
    // Defecto corregido: 50 mm más allá del extremo NO es el eje del vaso
    expect(tubeQuery([0, 0, 150], plano).d).toBeCloseTo(45, 9);
    expect(tubeQuery([0, 0, 150], plano).rho).toBeGreaterThan(1);
  });
});

describe('primitivas genéricas (elipsoide, esfera, cilindro, base ortonormal)', () => {
  it('distancias exactas en los ejes y base ortonormal', () => {
    const e = {
      kind: 'ellipsoid' as const,
      center: [10, 0, 0] as [number, number, number],
      radii: [20, 10, 5] as [number, number, number],
      taperX: 0,
    };
    expect(sdEllipsoid([10, 0, 0], e)).toBeLessThan(0);
    expect(sdEllipsoid([30, 0, 0], e)).toBeCloseTo(0, 9);
    expect(sdEllipsoid([40, 0, 0], e)).toBeGreaterThan(0);
    expect(sdEllipsoidLocal([0, 10, 0], [20, 10, 5])).toBeCloseTo(0, 9);
    expect(sdEllipsoidLocal([0, 0, 0], [20, 10, 5])).toBe(-5);
    expect(sdSphere([3, 4, 0], { kind: 'sphere', center: [0, 0, 0], r: 2 })).toBeCloseTo(3, 12);
    expect(sdCylinderZ([3, 4, 99], { kind: 'cylinderZ', x0: 0, y0: 0, r: 1 })).toBeCloseTo(4, 12);
    const { u, v, w } = orthonormalBasis([0, 0, 2], [1, 1, 0]);
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(u).toEqual([0, 0, 1]);
    expect(dot(u, v)).toBeCloseTo(0, 12);
    expect(dot(v, v)).toBeCloseTo(1, 12);
    expect(dot(w, u)).toBeCloseTo(0, 12);
    expect(dot(w, v)).toBeCloseTo(0, 12);
  });
});

describe('smoothMin / smoothMax', () => {
  it('valores cerrados, dualidad y coincidencia con min/max lejos de la mezcla', () => {
    expect(smoothMin(2, 2, 4)).toBeCloseTo(1, 12); // a − k/4
    expect(smoothMax(2, 2, 4)).toBeCloseTo(3, 12); // a + k/4
    expect(smoothMin(0, 1, 4)).toBeCloseTo(-0.5625, 12);
    expect(smoothMax(0, 1, 4)).toBeCloseTo(1.5625, 12);
    expect(smoothMin(0, 10, 4)).toBe(0);
    expect(smoothMax(0, 10, 4)).toBe(10);
    for (const [a, b] of [
      [0.3, -1.2],
      [5, 5.5],
      [-3, 2],
    ]) {
      expect(smoothMin(a, b, 3)).toBeCloseTo(-smoothMax(-a, -b, 3), 12);
    }
  });
});

describe('primitivas del tórax', () => {
  const scene = new AnatomyScene(defaultPatient());
  const t = scene.torso;

  it('tronco elíptico: φ, profundidad radial, normal y punto de la piel con valores cerrados en los ejes', () => {
    expect(torsoPhi(t.a, 0, t)).toBeCloseTo(0, 12); // izquierda del paciente
    expect(torsoPhi(0, t.b, t)).toBeCloseTo(Math.PI / 2, 12); // anterior
    expect(torsoPhi(-t.a, 0, t)).toBeCloseTo(Math.PI, 12); // derecha
    expect(torsoDepth([0, t.b, 0], t)).toBeCloseTo(0, 12);
    expect(torsoDepth([0, t.b - 10, 0], t)).toBeCloseTo(-10, 12);
    expect(torsoDepth([-(t.a + 5), 0, 0], t)).toBeCloseTo(5, 12);
    expect(torsoNormal([0, t.b, 0], t)).toEqual([0, 1, 0]);
    const n = torsoNormal([-t.a, 0, 30], t);
    expect(n[0]).toBeCloseTo(-1, 12);
    const skin = torsoSkinPoint((3 * Math.PI) / 4, 90, t);
    expect(torsoDepth(skin, t)).toBeCloseTo(0, 9);
    expect(skin[2]).toBe(90);
  });

  it('diafragma: la inserción baja de 0 en el xifoides a −50 mm detrás y la cúpula derecha llega a +55 mm', () => {
    const d = scene.diaphragm;
    expect(diaphragmEdgeZ(Math.PI / 2, d)).toBeCloseTo(0, 12);
    expect(diaphragmEdgeZ(-Math.PI / 2, d)).toBeCloseTo(-50, 12);
    expect(diaphragmHeight(d.right.x0, d.right.y0, d, t)).toBeCloseTo(d.right.apex, 9);
    expect(diaphragmHeight(d.left.x0, d.left.y0, d, t)).toBeCloseTo(d.left.apex, 9);
    // la distancia con signo: negativa en el tórax (por encima), positiva en el abdomen, casi euclídea en el ápice
    expect(sdDiaphragm([d.right.x0, d.right.y0, d.right.apex + 10], d, t)).toBeCloseTo(-10, 6);
    expect(sdDiaphragm([d.right.x0, d.right.y0, d.right.apex - 10], d, t)).toBeCloseTo(10, 6);
  });

  it('columna: cuerpo cilíndrico y arco posterior; nada por fuera', () => {
    const sp = scene.spine;
    expect(sdSpine([sp.x0, sp.y0, 0], sp)).toBeCloseTo(-sp.r, 12);
    expect(sdSpine([sp.x0, 0.5 * (sp.archY0 + sp.archY1), 0], sp)).toBeLessThan(0);
    expect(sdSpine([sp.archHalfWidth + 10, 0.5 * (sp.archY0 + sp.archY1), 0], sp)).toBeCloseTo(10, 12);
  });

  it('costilla: negativa en su línea media, hueso en el flanco y cartílago a ±45° de la línea media; derechas solas', () => {
    const rib = scene.ribs[0];
    const at = (phi: number): [number, number, number] => [
      rib.scale * t.a * Math.cos(phi),
      rib.scale * t.b * Math.sin(phi),
      rib.zAnterior + rib.tilt * (0.5 - 0.5 * Math.sin(phi)),
    ];
    const lateral = sdRib(at(Math.PI), rib, t, scene.spine);
    expect(lateral.d).toBeCloseTo(-Math.min(rib.halfThickness, rib.halfWidth), 9);
    expect(lateral.cartilage).toBe(false);
    expect(sdRib(at(0.6 * Math.PI), rib, t, scene.spine).cartilage).toBe(true);
    // `rightOnly` (limitación `no-spleen-no-left-ribs`): del lado izquierdo, más allá del esternón, no hay costilla
    expect(sdRib(at(0.1 * Math.PI), rib, t, scene.spine).d).toBe(1e3);
    // el arco termina en la apófisis transversa: nada por detrás de la columna
    expect(sdRib([-10, scene.spine.y0 - 20, rib.zAnterior + rib.tilt], rib, t, scene.spine).d).toBe(1e3);
  });
});
