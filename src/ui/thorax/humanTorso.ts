import { BufferGeometry, Float32BufferAttribute, Group, Mesh, type MeshStandardMaterial } from 'three';
import { compressionSample } from '../../anatomy/compression';
import { RespiratoryDeformation } from '../../anatomy/deformation';
import type { AnatomyScene } from '../../anatomy/scene';
import { dist, type Vec3 } from '../../core/vec3';
import { probeContact } from '../../probe/contact';
import type { Transducer } from '../../probe/probe';
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
    96,
    false,
  );
  const upper: VisualProfile[] = [
    [zMax, a, b, 0, 0],
    [zMax + 15, a * 1.01, b * 0.99, 0, 0],
    [zMax + 35, a * 1.08, b * 0.88, 0, -2],
    [zMax + 55, a * 0.89, b * 0.7, 0, -4],
    [zMax + 80, 53, 45, 0, -8],
    [zMax + 110, 44, 40, 0, -8],
    [zMax + 128, 47, 44, 0, 3],
    [zMax + 145, 58, 61, 0, 8],
    [zMax + 175, 69, 73, 0, 0],
    [zMax + 210, 70, 77, 0, -6],
    [zMax + 245, 57, 63, 0, -10],
    [zMax + 263, 32, 37, 0, -10],
    [zMax + 270, 3, 4, 0, -10],
  ];
  const lower: VisualProfile[] = [
    [zMin - 80, a * 0.61, b * 0.65, 0, -4],
    [zMin - 63, a * 0.85, b * 0.86, 0, -2],
    [zMin - 28, a * 0.97, b * 0.98, 0, 0],
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
      2,
      24,
    ),
  );
  return { skin, context: [loftMesh(upper, 2, 64), loftMesh(lower, 2, 64), ...arms] };
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
  private poseKey = '';
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
    this.acquisition = acquisition;
    if (key === this.poseKey) return;
    this.poseKey = key;
    const contact = probeContact(acquisition.pose, transducer, this.scene.torso);
    if (dist(contact.frame.face, acquisition.frame.face) > 1e-5) throw new Error('Navegador: contacto distinto al cuadro mostrado');
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
    this.updates++;
  }

  materialPoint(world: Vec3): Vec3 {
    return this.acquisition ? this.deformation.toMaterial(world, this.acquisition.sample.resp) : world;
  }

  dispose(): void {
    for (const surface of this.surfaces) surface.mesh.geometry.dispose();
    this.root.clear();
  }
}
