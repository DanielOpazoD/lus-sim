import { CONVEX_C35_PROFILE, type TransducerProfile } from '../ultrasound/transducerProfile';
import type { AcquisitionState } from '../ultrasound/cine';
import type { ProbeCompression } from '../anatomy/compression';
import { AnatomyQuery } from '../anatomy/query';
import { AnatomyScene } from '../anatomy/scene';
import { PhysiologyEngine, type PhysiologySample } from '../physiology/engine';
import type { PatientState } from '../physiology/patientState';
import { probeContact, type ProbeContact } from '../probe/contact';
import { clampPose, defaultPose, type ProbeFrame, type ProbePose, type Transducer } from '../probe/probe';
import { DEFAULT_BMODE, UltrasoundRenderer, type BModeSettings, type GpuPointQuery, type PassRepeat } from '../ultrasound/renderer';

/** Misma pose, campo a campo (el contacto se reutiliza con la sonda quieta). */
function samePose(a: ProbePose, b: ProbePose): boolean {
  return a.phi === b.phi && a.z === b.z && a.lift === b.lift && a.yaw === b.yaw && a.rock === b.rock && a.tilt === b.tilt;
}

/** Ajustes del equipo: M comparte la envolvente y el mapa de grises de B; sin color ni PW. */
export interface EquipmentSettings {
  bmode: BModeSettings;
}

/**
 * Opciones de `Simulator.render`:
 *  - `mline`: línea M opcional, capturada de este mismo cuadro B y de su reloj; no añade una pasada física.
 *  - `repeat`: solo para los ganchos de medida, repite una pasada dentro del cuadro (`PassRepeat`).
 * Se conserva el nombre del contrato para los bancos existentes; sin `forceColor` (no hay color).
 */
export interface RenderMeasureOptions {
  repeat?: PassRepeat;
  mline?: number;
}

/** El equipo en su preajuste (el pulmonar, `DEFAULT_BMODE`). */
export function defaultEquipment(): EquipmentSettings {
  return { bmode: { ...DEFAULT_BMODE, tgcDb: [...DEFAULT_BMODE.tgcDb] } };
}

/**
 * Orquestador de un caso: un reloj (el de la fisiología) gobierna latido, respiración, deformación y
 * adquisición.
 *
 * Responsabilidades separadas (guía §3, §19):
 *  - PhysiologyEngine: estado del paciente y señales continuas;
 *  - AnatomyScene/AnatomyQuery: geometría y deformación;
 *  - UltrasoundRenderer: adquisición/imagen en GPU (modo B y su línea M opcional).
 * La UI solo lee estado y modifica sonda y ajustes del equipo; nunca toca el PatientState en marcha salvo
 * maniobras respiratorias explícitas. lus-sim (decisión 12): sin la cadena del PW, el audio, la puerta ni la
 * cadencia del color de VExUS.
 */
export class Simulator {
  readonly patient: PatientState;
  readonly scene: AnatomyScene;
  readonly anatomy: AnatomyQuery;
  readonly physiology: PhysiologyEngine;
  /** Perfil del transductor (geometría, haz, frecuencias efectivas): una sola fuente. */
  readonly profile: TransducerProfile = CONVEX_C35_PROFILE;
  get transducer(): Transducer {
    return this.profile.geometry;
  }
  renderer: UltrasoundRenderer;
  pose: ProbePose = defaultPose();
  /** Instantánea inmutable que asigna `EquipmentController` (sobrevive a los cambios de caso). */
  equipment: EquipmentSettings = defaultEquipment();
  frozen = false;
  private lastFrame: ProbeFrame;
  /** Contacto de la sonda del cuadro (decisión 63): el marco efectivo (hundido), la compresión y el acoplamiento. */
  private lastContact: ProbeContact;
  private contactPose: ProbePose;

  /**
   * `renderer`: el de otro simulador (cambio de caso), que se queda con sus programas compilados y
   * recibe esta escena al FINAL, cuando todo lo demás se ha construido sin errores.
   */
  constructor(patient: PatientState, canvas: HTMLCanvasElement, renderer?: UltrasoundRenderer) {
    this.patient = patient;
    this.scene = new AnatomyScene(patient);
    this.anatomy = new AnatomyQuery(this.scene);
    this.physiology = new PhysiologyEngine(patient);
    this.lastContact = probeContact(this.pose, this.transducer, this.scene.torso);
    this.lastFrame = this.lastContact.frame;
    this.contactPose = this.pose;
    this.anatomy.setProbeCompression(this.lastContact);
    if (renderer) renderer.setScene(this.scene);
    this.renderer = renderer ?? new UltrasoundRenderer(canvas, this.scene, this.profile);
  }

  // Ajustes de solo lectura: se cambian con comandos (`EquipmentController`), nunca en sitio
  get bmode(): Readonly<BModeSettings> {
    return this.equipment.bmode;
  }
  /**
   * Ajustes de la imagen en pantalla: los del equipo o, con un cuadro del cine a la vista (decisión 80), los
   * de ese cuadro (profundidad y foco con que se formó).
   */
  get displayed(): { bmode: Readonly<BModeSettings> } {
    return (this.frozen && this.renderer.cineShownFrame) || this.equipment;
  }
  /**
   * Navegación del cuadro que se ve: su adquisición histórica en cine o la del último render vivo completado.
   * Antes de la primera imagen (también al recuperar GPU), usa el contacto actual, sin reutilizar otro paciente.
   */
  get displayedAcquisition(): AcquisitionState {
    return (
      (this.frozen && this.renderer.cineShownFrame?.acquisition) ||
      this.renderer.liveAcquisition || {
        pose: this.contactPose,
        frame: this.lastFrame,
        sample: this.sample,
        respiratoryPattern: this.patient.respiratoryPattern,
      }
    );
  }
  get sample(): PhysiologySample {
    return this.physiology.sample;
  }
  /** Marco efectivo de la sonda: el de la pose hundido lo que aprieta el operador (decisión 63). */
  get frame(): ProbeFrame {
    return this.lastFrame;
  }
  /** Contacto de la sonda del último marco (decisión 63): la misma compresión que ven la CPU y la GPU. */
  get contact(): ProbeContact {
    return this.lastContact;
  }

  setPose(p: ProbePose): void {
    this.pose = clampPose(p, this.patient.position ?? 'supine');
  }

  /**
   * Reconstruye el renderizador tras una pérdida de contexto GPU; el estado del paciente se conserva. lus-sim (decisión
   * 13): sin `dispose()` del viejo: sus objetos murieron con el contexto perdido, y borrarlos en el restaurado daba ~90
   * avisos «delete: object does not belong to this context» (lo halló la revisión).
   */
  rebuildRenderer(canvas: HTMLCanvasElement): void {
    this.renderer = new UltrasoundRenderer(canvas, this.scene, this.profile);
  }

  /**
   * Libera los recursos GPU; el simulador no debe usarse después. Con `keepRenderer` (cambio de
   * caso) el renderizador sigue vivo porque ya lo usa el simulador siguiente.
   */
  dispose(opts: { keepRenderer?: boolean } = {}): void {
    if (!opts.keepRenderer) this.renderer.dispose();
  }

  /** Avanza la simulación el tiempo real transcurrido. */
  advance(elapsedSeconds: number): void {
    if (this.frozen) return;
    const clock = this.physiology.clock;
    const steps = clock.requestSteps(elapsedSeconds);
    // la compresión sigue a la sonda (decisión 63): todo el cuadro (CPU y GPU) ve el mismo tejido y el mismo marco,
    // el efectivo (la sonda hundida). Se actualiza aun sin paso fisiológico: un gesto no puede llegar con el marco previo.
    // Con la sonda quieta el contacto no cambia (sale solo de la pose): se reutiliza.
    if (!samePose(this.pose, this.contactPose)) {
      this.lastContact = probeContact(this.pose, this.transducer, this.scene.torso);
      this.contactPose = this.pose;
      this.anatomy.setProbeCompression(this.lastContact);
    }
    this.lastFrame = this.lastContact.frame;
    if (steps === 0) return;
    for (let i = 0; i < steps; i++) this.physiology.step();
  }

  /** Dibuja B y, si se pide, registra su línea M; solo `repeat` es exclusivo del banco de medida. */
  render(measure?: RenderMeasureOptions): void {
    if (this.frozen) return;
    this.renderer.render(
      {
        sample: this.sample,
        frame: this.lastFrame,
        pose: this.pose,
        respiratoryPattern: this.patient.respiratoryPattern,
        compression: this.lastContact,
        transducer: this.transducer,
        bmode: this.bmode,
        seed: this.patient.seed,
        mline: measure?.mline,
      },
      measure?.repeat,
    );
  }

  /**
   * Mapa de tejidos del plano según la GPU (asíncrono; null hasta que haya uno),
   * para el instante indicado (muestra, marco, profundidad): así la comparación
   * TS ↔ GLSL no confunde la respiración con desacuerdo. Solo docente/depuración.
   */
  gpuTissueMap(at: { sample: PhysiologySample; frame: ProbeFrame; depthMm: number }): ReturnType<UltrasoundRenderer['tissueMap']> {
    return this.renderer.tissueMap({
      sample: at.sample,
      frame: at.frame,
      pose: this.pose,
      compression: this.lastContact,
      transducer: this.transducer,
      bmode: { ...this.bmode, depthMm: at.depthMm },
      seed: this.patient.seed,
    });
  }

  /**
   * Consulta la anatomía GLSL en puntos del mundo con el estado fisiológico actual y el
   * plano `frame`. Solo para el gate de equivalencia y la e2e de normales (`normals`); bloqueante.
   * `compression`: el contacto de la sonda que deforma el tejido (decisión 63); por omisión, el del último marco.
   * `allTubes` no cambia nada en el tórax (sin tubos): se conserva la forma de la llamada de VExUS.
   */
  gpuQuery(
    points: Float32Array,
    frame: ProbeFrame,
    allTubes = false,
    opts: { normals?: boolean; compression?: ProbeCompression } = {},
  ): GpuPointQuery {
    return this.renderer.queryPoints(
      points,
      {
        sample: this.sample,
        frame,
        pose: this.pose,
        compression: opts.compression ?? this.lastContact,
        transducer: this.transducer,
        bmode: this.bmode,
        seed: this.patient.seed,
      },
      allTubes,
      opts,
    );
  }
}
