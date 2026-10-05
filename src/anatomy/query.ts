import type { Vec3 } from '../core/vec3';
import type { PhysiologySample } from '../physiology/engine';
import type { ProbeCompression } from './compression';
import { RespiratoryDeformation } from './deformation';
import { heartFinePhase } from './organs/heart';
import { type AnatomyScene, type Classification, type FaceGeometry, type SceneInstant } from './scene';

/**
 * Consulta anatómica en coordenadas del MUNDO: deshace la compresión de la sonda
 * (decisión 63) y la deformación respiratoria, clasifica el tejido y devuelve el campo de velocidades
 * (sangre relativa al vaso + movimiento global del vaso), tal como exige la
 * invariante Doppler 10.1: v_rel = u·t̂ + v_vaso − v_sonda.
 *
 * lus-sim (decisión 10): sin vasos, calibres ni velocidades de la sangre; la fisiología solo le pasa a la
 * escena el instante (`SceneInstant`, el descenso del diafragma) y el tejido se mueve con la respiración.
 */
export interface WorldQuery extends Classification {
  material: Vec3;
  /** Velocidad de la sangre en el punto: el tórax portado no tiene vasos, siempre null (forma de VExUS). */
  bloodVelocity: null;
  /** Base de flujo de la sangre: siempre null por lo mismo (forma de VExUS). */
  flowBasis: null;
  /** Velocidad del tejido/vaso por respiración (mm/s, mundo). */
  tissueVelocity: Vec3;
}

export class AnatomyQuery {
  readonly deformation: RespiratoryDeformation;

  constructor(readonly scene: AnatomyScene) {
    this.deformation = new RespiratoryDeformation(scene);
  }

  /**
   * Contacto de la sonda del cuadro (decisión 63): la compresión que ven todas las consultas del mundo (la
   * misma que sube la GPU). null: el tronco rígido (sin sonda).
   */
  setProbeCompression(k: ProbeCompression | null): void {
    this.deformation.compression = k;
  }

  get probeCompression(): ProbeCompression | null {
    return this.deformation.compression;
  }

  private lastSample: PhysiologySample | null = null;
  private lastInstant: SceneInstant | null = null;

  /**
   * Lo que la fisiología impone a la escena en una muestra (el `caliberFor` de VExUS sin los calibres).
   * Memorizado por identidad de la muestra: `PhysiologySample` es inmutable por paso y esta función se
   * llama decenas de miles de veces por segundo (corte, dispersores).
   */
  instantFor(s: PhysiologySample): SceneInstant {
    if (s === this.lastSample && this.lastInstant) return this.lastInstant;
    const instant: SceneInstant = { diaphragmCaudalMm: s.resp.diaphragmCaudalMm, heartPhase: heartFinePhase(s.heartPhase) };
    this.lastSample = s;
    this.lastInstant = instant;
    return instant;
  }

  classifyWorld(p: Vec3, s: PhysiologySample): WorldQuery {
    const m = this.deformation.toMaterial(p, s.resp);
    const c = this.scene.classify(m, this.instantFor(s));
    const tissueVelocity = this.deformation.tissueVelocity(m, s.resp);
    return { ...c, material: m, bloodVelocity: null, flowBasis: null, tissueVelocity };
  }

  /**
   * Distancia con signo a una cara geométrica (`AnatomyScene.faceSdf`) en un punto del MUNDO, con la
   * deformación respiratoria y el instante. Banco de fidelidad y pruebas.
   */
  faceSdfWorld(p: Vec3, s: PhysiologySample, face: FaceGeometry): number | null {
    return this.scene.faceSdf(this.deformation.toMaterial(p, s.resp), this.instantFor(s), face);
  }
}
