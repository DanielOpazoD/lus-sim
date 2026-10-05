import { C_RECONSTRUCTION_MM_S } from '../core/units';
import { defaultPatient, type PatientState } from '../physiology/patientState';
import { EquipmentController } from './equipment';
import { errorLog } from './errorLog';
import { registerCardiac } from '../anatomy/organs/heart';
import { Simulator, defaultEquipment } from './simulator';
import { HeartBakeAborted, registerHeartBaker } from '../ultrasound/renderer';

/**
 * Sesión de simulación (Fase 1): dueña del `Simulator` vivo y del estado del equipo, que
 * sobrevive a los cambios de caso. El cambio de caso es transaccional: el simulador nuevo
 * se construye antes de tocar nada; si falla, sigue el anterior y se devuelve el error. El
 * renderizador (programas GLSL compilados) pasa al simulador nuevo con su escena.
 *
 * lus-sim (decisión 13): todavía no hay casos (fase 4): la sesión arranca con el paciente por omisión
 * (`defaultPatient`) y «Reiniciar paciente» lo vuelve a construir; sin el audio ni la cadena del PW de VExUS.
 */
type Listener = (next: Simulator, prev: Simulator) => void;

export class SimulationSession {
  private current: Simulator;
  readonly equipment: EquipmentController;
  private listeners = new Set<Listener>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly makePatient: () => PatientState = defaultPatient,
  ) {
    this.current = new Simulator(makePatient(), canvas);
    this.equipment = new EquipmentController(defaultEquipment(), {
      halfSectorRad: this.current.transducer.halfSector,
      cMmS: C_RECONSTRUCTION_MM_S,
    });
    this.current.equipment = this.equipment.state;
    this.equipment.subscribe((next) => {
      this.current.equipment = next;
    });
  }

  /**
   * Carga el corazón de EchoTwin en su propio chunk (decisión 49) y lo pone en el simulador vivo y en los que vengan. La aplicación
   * lo pide tras construir la sesión (el primer cuadro es el BLUE superior derecho, sin corazón a la vista); un fallo lo dice.
   */
  loadCardiac(): Promise<void> {
    // el corazón y su horneado, en un chunk diferido (`app/cardiacRuntime.ts`)
    return import('./cardiacRuntime').then(
      (m) => {
        registerHeartBaker(m.startHeartBake);
        registerCardiac(m.attachEchoTwinHeart);
        // se cumple con el volumen horneado y el corazón en la escena; un horneado fallido se informa y la escena sigue sin él
        return this.current.attachCardiac(m.attachEchoTwinHeart).catch((e: unknown) => {
          if (!(e instanceof HeartBakeAborted)) errorLog.report('gpu', e);
        });
      },
      (e: unknown) => {
        errorLog.report('caso', e);
      },
    );
  }

  get sim(): Simulator {
    return this.current;
  }

  /**
   * «Reiniciar paciente»: vuelve a construir el paciente desde su definición, sin la respiración cambiada; la
   * sonda y el equipo se conservan. Devuelve el error si no se pudo (el simulador anterior sigue activo).
   */
  resetPatient(): unknown {
    const prev = this.current;
    let next: Simulator;
    try {
      next = new Simulator(this.makePatient(), this.canvas, prev.renderer);
    } catch (e) {
      errorLog.report('caso', e);
      // si llegó a cambiarse la escena del renderizador compartido, vuelve a la del simulador anterior
      if (prev.renderer.scene !== prev.scene) {
        try {
          prev.renderer.setScene(prev.scene);
        } catch (e2) {
          errorLog.report('caso', e2);
        }
      }
      return e;
    }
    // lus-sim (decisión 33): la posición del paciente se conserva, como la ubicación de la sonda
    next.patient.position = prev.patient.position;
    next.setPose(prev.pose);
    next.equipment = this.equipment.state;
    next.frozen = prev.frozen;
    this.current = next;
    prev.dispose({ keepRenderer: true });
    for (const l of this.listeners) l(next, prev);
    return null;
  }

  onSimulatorChanged(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
