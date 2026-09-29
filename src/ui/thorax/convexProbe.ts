import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, type Material } from 'three';
import { add, cross, normalize, scale, sub, type Vec3 } from '../../core/vec3';
import type { ProbeFrame, Transducer } from '../../probe/probe';
import { loftMesh, patientToView, probeViewAxes, type MeshData, type VisualProfile } from './geometry';

/** Carcasa visual sin marca: lente derivada del perfil, medidas del mango estimadas (decisión 25). */
export function convexHousingMesh(tr: Transducer): MeshData {
  const half = tr.curvatureRadius * Math.sin(tr.halfSector);
  const sag = tr.curvatureRadius * (1 - Math.cos(tr.halfSector));
  const rows: VisualProfile[] = [
    [sag + 1, half + 2.5, tr.elevationMm / 2 + 3, 0, 0],
    [sag + 9, half + 3, 12, 0, 0],
    [sag + 23, 27, 13, 0, 0],
    [sag + 42, 16, 12, 0, 0],
    [sag + 65, 14, 11, 0, 0],
    [sag + 85, 12, 10, 0, 0],
    [sag + 92, 9, 8, 0, 0],
  ];
  const data = loftMesh(rows, 3, 32, false);
  // Cabezal de sección superelíptica: contiene los extremos de la lente rectangular en elevación.
  // Hacia el mango pasa suavemente a sección oval, sin cambiar la cara acústica.
  for (let i = 0; i < data.positions.length; i += 3) {
    const j = (i / 3) % 32;
    const phi = (2 * Math.PI * j) / 32;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const height = data.positions[i + 1] * 1000;
    const power = 0.5 + 0.5 * Math.min(1, Math.max(0, (height - sag - 9) / 33));
    if (Math.abs(c) > 1e-8) data.positions[i] *= Math.abs(c) ** (power - 1);
    if (Math.abs(s) > 1e-8) data.positions[i + 2] *= Math.abs(s) ** (power - 1);
    if (i < 32 * 3) {
      const edge = Math.min(Math.abs(data.positions[i] * 1000), half);
      data.positions[i + 1] = (tr.curvatureRadius - Math.sqrt(tr.curvatureRadius ** 2 - edge ** 2) + 1) / 1000;
    }
  }
  return data;
}

/** Lente local: el mismo arco que pointOnLine, con +y hacia el mango. */
export function convexLensMesh(tr: Transducer, segments = 48): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const th = -tr.halfSector + (2 * tr.halfSector * i) / segments;
    for (const z of [-tr.elevationMm / 2, tr.elevationMm / 2])
      positions.push((tr.curvatureRadius * Math.sin(th)) / 1000, (tr.curvatureRadius * (1 - Math.cos(th))) / 1000, z / 1000);
    if (i < segments) {
      const a = 2 * i;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  return { positions, indices };
}

/** Marcador integrado en el lateral +x del mango, no una esfera suspendida. */
export function convexMarkerLocal(tr: Transducer): Vec3 {
  const sag = tr.curvatureRadius * (1 - Math.cos(tr.halfSector));
  return [14.4, sag + 61, 0];
}

export function cablePath(frame: ProbeFrame, tr: Transducer, samples = 32): Vec3[] {
  const sag = tr.curvatureRadius * (1 - Math.cos(tr.halfSector));
  const tip = add(frame.face, scale(frame.axial, -(sag + 111)));
  const c1 = add(tip, scale(frame.axial, -55));
  // Encaminamiento hacia fuera y caudal en el paciente, no gravedad ni dependencia de la cámara.
  const c2 = add(add(tip, scale(frame.skinNormal, 125)), [0, 0, -70]);
  const end = add(add(tip, scale(frame.skinNormal, 150)), [0, 0, -170]);
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples;
    const u = 1 - t;
    return [0, 1, 2].map((k) => u ** 3 * tip[k] + 3 * u ** 2 * t * c1[k] + 3 * u * t ** 2 * c2[k] + t ** 3 * end[k]) as Vec3;
  });
}

function geometry(data: MeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(data.positions, 3));
  g.setIndex(data.indices);
  g.computeVertexNormals();
  return g;
}

export class ConvexProbe {
  readonly root = new Group();
  readonly cable: Mesh<BufferGeometry, MeshStandardMaterial>;
  readonly lens: Mesh<BufferGeometry, MeshStandardMaterial>;
  private readonly materials: Material[];
  private readonly meshes: Mesh[] = [];
  updates = 0;

  constructor(readonly transducer: Transducer) {
    const plastic = new MeshStandardMaterial({ color: 0xeff1ec, roughness: 0.5, metalness: 0 });
    const rubber = new MeshStandardMaterial({ color: 0x293b42, roughness: 0.78, metalness: 0 });
    const accent = new MeshStandardMaterial({ color: 0x39baa7, roughness: 0.6, metalness: 0 });
    this.materials = [plastic, rubber, accent];
    const addMesh = (data: MeshData, material: MeshStandardMaterial, name: string) => {
      const m = new Mesh(geometry(data), material);
      m.name = name;
      this.meshes.push(m);
      this.root.add(m);
      return m;
    };
    addMesh(convexHousingMesh(transducer), plastic, 'convex-housing');
    const rim = convexLensMesh({
      ...transducer,
      halfSector: transducer.halfSector + 2 / transducer.curvatureRadius,
      elevationMm: transducer.elevationMm + 5,
    });
    for (let i = 1; i < rim.positions.length; i += 3) rim.positions[i] += 0.001;
    addMesh(rim, rubber, 'lens-rim');
    this.lens = addMesh(convexLensMesh(transducer), rubber, 'convex-lens');
    const sag = transducer.curvatureRadius * (1 - Math.cos(transducer.halfSector));
    addMesh(
      loftMesh(
        [
          [sag + 91, 8, 7, 0, 0],
          [sag + 97, 7, 6, 0, 0],
          [sag + 111, 2.3, 2.3, 0, 0],
        ],
        2,
        20,
      ),
      rubber,
      'strain-relief',
    );
    const [x, y, z] = convexMarkerLocal(transducer);
    addMesh(
      loftMesh(
        [
          [y - 4, 1.2, 2.4, x, z],
          [y + 4, 1.2, 2.4, x, z],
        ],
        1,
        12,
      ),
      accent,
      'orientation-notch',
    );
    const cableGeometry = new BufferGeometry();
    cableGeometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(33 * 8 * 3), 3));
    const indices: number[] = [];
    for (let i = 0; i < 32; i++)
      for (let j = 0; j < 8; j++) {
        const a = i * 8 + j;
        const b = i * 8 + ((j + 1) % 8);
        indices.push(a, b, a + 8, b, b + 8, a + 8);
      }
    cableGeometry.setIndex(indices);
    this.cable = new Mesh(cableGeometry, rubber);
    this.cable.name = 'probe-cable';
  }

  updateCable(frame: ProbeFrame): void {
    const points = cablePath(frame, this.transducer);
    const axes = probeViewAxes(frame);
    let normal: Vec3 = axes.x;
    const array = this.cable.geometry.getAttribute('position').array as Float32Array;
    for (let i = 0; i < points.length; i++) {
      const tangent = normalize(sub(patientToView(points[Math.min(i + 1, points.length - 1)]), patientToView(points[Math.max(0, i - 1)])));
      const binormal = normalize(cross(tangent, normal));
      normal = normalize(cross(binormal, tangent));
      const center = patientToView(points[i]);
      for (let j = 0; j < 8; j++) {
        const phi = (j * Math.PI) / 4;
        const v = add(center, add(scale(normal, 0.0023 * Math.cos(phi)), scale(binormal, 0.0023 * Math.sin(phi))));
        array.set(v, (i * 8 + j) * 3);
      }
    }
    this.cable.geometry.getAttribute('position').needsUpdate = true;
    this.cable.geometry.computeVertexNormals();
    this.cable.geometry.computeBoundingSphere();
    this.updates++;
  }

  dispose(): void {
    for (const m of this.meshes) m.geometry.dispose();
    this.cable.geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.root.clear();
  }
}
