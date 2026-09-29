import { BufferGeometry, Float32BufferAttribute, Group, Mesh, type MeshStandardMaterial, type Object3D, type Raycaster } from 'three';
import { compressionSample } from '../../anatomy/compression';
import { RespiratoryDeformation } from '../../anatomy/deformation';
import type { AnatomyScene } from '../../anatomy/scene';
import { dist, type Vec3 } from '../../core/vec3';
import { probeContact } from '../../probe/contact';
import type { ProbeFrame, Transducer } from '../../probe/probe';
import type { AcquisitionState } from '../../ultrasound/cine';
import { loftMesh, patientToView, SCAN_LIMITS, viewToPatient, type MeshData, type VisualProfile } from './geometry';

/** Medidas de AUTORÍA visual del maniquí, no antropometría ni nuevos parámetros del paciente. */
export function humanTorsoMeshes(scene: AnatomyScene): { skin: MeshData; context: MeshData[] } {
  const { a, b } = scene.torso;
  const { zMin, zMax } = SCAN_LIMITS;
  // La piel explorable conserva exactamente la elipse del motor, con altura suficiente para mostrar contacto.
  const skin = loftMesh(
    [
      [zMin, a, b, 0, 0],
      [zMax, a, b, 0, 0],
    ],
    48,
    64,
    false,
  );
  const upper: VisualProfile[] = [
    [zMax, a, b, 0, 0],
    [zMax + 18, a, b, 0, 0],
    [zMax + 40, a * 1.12, b * 0.91, 0, -2],
    [zMax + 60, a * 0.94, b * 0.73, 0, -4],
    [zMax + 82, 55, 46, 0, -8],
    [zMax + 112, 43, 39, 0, -8],
    [zMax + 132, 48, 47, 0, 4],
    [zMax + 151, 58, 65, 0, 6],
    [zMax + 192, 70, 79, 0, -3],
    [zMax + 234, 73, 80, 0, -8],
    [zMax + 276, 59, 68, 0, -10],
    [zMax + 308, 39, 46, 0, -12],
    [zMax + 324, 3, 4, 0, -12],
  ];
  const lower: VisualProfile[] = [
    [zMin - 105, a * 0.86, b * 0.9, 0, -1],
    [zMin - 80, a * 0.88, b * 0.94, 0, -1],
    [zMin - 40, a * 0.94, b * 0.97, 0, 0],
    [zMin - 12, a, b, 0, 0],
    [zMin, a, b, 0, 0],
  ];
  // Los brazos se abren hacia fuera: solo se unen sobre zMax, nunca encima de una ventana acústica.
  const arms = [-1, 1].map((side) =>
    loftMesh(
      [
        [-50, 5, 7, side * (a + 134), 0],
        [-38, 24, 27, side * (a + 134), 0],
        [10, 29, 33, side * (a + 128), 0],
        [105, 33, 40, side * (a + 99), 0],
        [190, 44, 52, side * (a + 56), -1],
        [230, 48, 59, side * (a + 30), -2],
        [250, 34, 45, side * (a + 16), -4],
        [258, 5, 7, side * (a + 10), -5],
      ],
      3,
      32,
    ),
  );
  const head = loftMesh(upper, 3, 64, [false, true]);
  // Relieve facial mínimo del maniquí: nariz/mentón orientan el frente sin textura ni identidad humana.
  // Solo contexto por encima de zMax: no mueve piel explorada ni representa una estructura acústica.
  for (let i = 0; i < head.positions.length; i += 3) {
    const z = head.positions[i + 1] * 1000 - zMax;
    const x = head.positions[i] * 1000;
    if (head.positions[i + 2] > 0 && z > 132)
      head.positions[i + 2] +=
        (0.018 * Math.exp(-(((z - 203) / 18) ** 2)) + 0.005 * Math.exp(-(((z - 145) / 13) ** 2))) * Math.exp(-((x / 17) ** 2));
  }
  return { skin, context: [head, loftMesh(lower, 3, 64, [true, false]), ...arms] };
}

/** Geometría con propietario; atributos estables durante el movimiento. */
function mesh(data: MeshData, material: MeshStandardMaterial): Mesh<BufferGeometry, MeshStandardMaterial> {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(data.positions, 3));
  g.setIndex(data.indices);
  g.computeVertexNormals();
  return new Mesh(g, material);
}

/** Solo representa el contacto del cuadro mostrado; nunca escribe en sim.anatomy ni crea otro reloj. */
export class HumanTorso {
  readonly root = new Group();
  readonly skin: Mesh<BufferGeometry, MeshStandardMaterial>;
  readonly occluders: Mesh<BufferGeometry, MeshStandardMaterial>[];
  readonly deformation: RespiratoryDeformation;
  private readonly surfaces: Array<{ mesh: Mesh<BufferGeometry, MeshStandardMaterial>; base: Float32Array; changed: number[] }>;
  private readonly seams: Array<Array<{ geometry: BufferGeometry; vertex: number }>>;
  private poseKey = '';
  private expectedFrame: ProbeFrame | null = null;
  private acquisition: AcquisitionState | null = null;
  updates = 0;
  warpedVertices = 0;

  constructor(
    readonly scene: AnatomyScene,
    skinMaterial: MeshStandardMaterial,
    contextMaterial: MeshStandardMaterial,
  ) {
    const data = humanTorsoMeshes(scene);
    this.skin = mesh(data.skin, skinMaterial);
    this.skin.name = 'functional-skin';
    this.occluders = data.context.map((d) => mesh(d, contextMaterial));
    this.occluders.forEach((m, i) => {
      m.name = ['head-shoulders', 'abdomen-end', 'right-arm', 'left-arm'][i];
    });
    this.root.add(this.skin, ...this.occluders);
    // Las uniones comparten posición y normal, pero no material: Costillas no vuelve transparente la cabeza.
    const shared = new Map<string, Array<{ geometry: BufferGeometry; vertex: number }>>();
    for (const m of [this.skin, ...this.occluders.slice(0, 2)]) {
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        if (Math.min(Math.abs(p.getY(i) - SCAN_LIMITS.zMin / 1000), Math.abs(p.getY(i) - SCAN_LIMITS.zMax / 1000)) > 1e-7) continue;
        const key = [p.getX(i), p.getY(i), p.getZ(i)].map((v) => v.toFixed(7)).join('|');
        const group = shared.get(key) ?? [];
        group.push({ geometry: m.geometry, vertex: i });
        shared.set(key, group);
      }
    }
    this.seams = [...shared.values()].filter((group) => group.length > 1);
    this.smoothSeams();
    this.deformation = new RespiratoryDeformation(scene);
    // También los bordes de contexto: así la compresión en zMin/zMax no abre una costura.
    this.surfaces = [this.skin, ...this.occluders].map((m) => ({
      mesh: m,
      base: Float32Array.from(m.geometry.getAttribute('position').array),
      changed: [],
    }));
  }

  update(acquisition: AcquisitionState, transducer: Transducer): void {
    const p = acquisition.pose;
    const key = [p.phi, p.z, p.lift, p.yaw, p.rock, p.tilt, transducer.curvatureRadius, transducer.halfSector, transducer.elevationMm].join(
      '|',
    );
    const contact = key === this.poseKey ? null : probeContact(acquisition.pose, transducer, this.scene.torso);
    const expected = contact?.frame ?? this.expectedFrame;
    if (
      !expected ||
      (['face', 'axial', 'lateral', 'elevation'] as const).some((axis) => dist(expected[axis], acquisition.frame[axis]) > 1e-5)
    )
      throw new Error('Navegador: contacto distinto al cuadro mostrado');
    this.acquisition = acquisition;
    if (!contact) return;
    this.poseKey = key;
    this.expectedFrame = expected;
    this.deformation.compression = contact;
    this.warpedVertices = 0;
    for (const surface of this.surfaces) {
      const attr = surface.mesh.geometry.getAttribute('position');
      const array = attr.array as Float32Array;
      for (const i of surface.changed) array.set(surface.base.subarray(i, i + 3), i);
      surface.changed.length = 0;
      for (let i = 0; i < surface.base.length; i += 3) {
        const p = viewToPatient([surface.base[i], surface.base[i + 1], surface.base[i + 2]]);
        // Si s(q)=0, q ya es la raíz única de la recompresión monótona. No se hacen 60 iteraciones allí.
        if (compressionSample(p, contact).shift === 0) continue;
        const q = this.deformation.toWorld(p, acquisition.sample.resp);
        array.set(patientToView(q), i);
        surface.changed.push(i);
        this.warpedVertices++;
      }
      attr.needsUpdate = true;
      surface.mesh.geometry.computeVertexNormals();
      surface.mesh.geometry.computeBoundingSphere();
    }
    this.smoothSeams();
    this.updates++;
  }

  private smoothSeams(): void {
    for (const group of this.seams) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (const { geometry, vertex } of group) {
        const n = geometry.getAttribute('normal');
        x += n.getX(vertex);
        y += n.getY(vertex);
        z += n.getZ(vertex);
      }
      const length = Math.hypot(x, y, z);
      for (const { geometry, vertex } of group) {
        const n = geometry.getAttribute('normal');
        n.setXYZ(vertex, x / length, y / length, z / length);
        n.needsUpdate = true;
      }
    }
  }

  materialPoint(world: Vec3): Vec3 {
    return this.acquisition ? this.deformation.toMaterial(world, this.acquisition.sample.resp) : world;
  }

  /** Primer impacto visible: ni cabeza/brazos ni la carcasa permiten seleccionar piel a través de ellos. */
  pick(raycaster: Raycaster, probe: Object3D[], dragging = false): Vec3 | 'probe' | 'blocked' | null {
    const hit = raycaster.intersectObjects([this.skin, ...this.occluders, ...(dragging ? [] : probe)], false)[0];
    if (!hit) return null;
    if (hit.object === this.skin) return this.materialPoint(viewToPatient(hit.point.toArray()));
    return this.occluders.includes(hit.object as typeof this.skin) ? 'blocked' : 'probe';
  }

  dispose(): void {
    for (const surface of this.surfaces) surface.mesh.geometry.dispose();
    this.root.clear();
  }
}
