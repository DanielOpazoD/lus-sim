import { lungBorderAt } from '../anatomy/organs/lungBorder';
import { wallArc } from '../anatomy/organs/wall';
import { torsoSkinPoint } from '../anatomy/primitives';
import { ribLineArc, ribTableZ } from '../anatomy/organs/ribcage';
import { thoraxLinePhi } from '../anatomy/thoraxLines';
import { SUBPLEURAL_NODES, subpleuralNode } from '../physiology/lungAeration';
import {
  aerationFromExcess,
  depthBelowLaCm,
  globalEvlwi,
  relaxExcess,
  steadyExcess,
  DEFAULT_CALIBRATION,
  type HemodynamicCalibration,
  type HemodynamicInput,
} from '../physiology/hemodynamics';
import {
  evaluateProtocol,
  protocolSites,
  siteKey,
  type Protocol,
  type ProtocolResult,
  type Site,
  type SiteObservation,
} from '../lus/protocols';
import type { ProbePose } from '../probe/probe';
import { bLineClip } from './bLineClip';
import type { Simulator } from './simulator';

/**
 * El mando hemodinámico en la aplicación (lus-sim, decisión 52): lleva la cadena de `physiology/hemodynamics.ts` al paciente
 * del simulador. Cada región de la rejilla de la aireación (`lungAeration.ts`) tiene su agua de más, que tiende a su equilibrio
 * con la cinética; el resultado es la aireación subpleural del paciente (`patient.lung`) y la tabla de la escena: las trampas,
 * la imagen y el detector hacen el resto. El tiempo del agua avanza con el reloj del simulador (`step`, con el tiempo que avanzó
 * el reloj único) y con los saltos explícitos de la interfaz («esperar 30 min»: `wait`), que no mueven la respiración.
 */
export class HeartFailureModel {
  input: HemodynamicInput = { control: { kind: 'pcwp', mmHg: 12 }, phenotype: 'hfpef', rapMmHg: 6 };
  /** Agua de más por nodo (mL/kg) y su equilibrio. */
  excess: number[] = new Array<number>(SUBPLEURAL_NODES).fill(0);
  target: number[] = new Array<number>(SUBPLEURAL_NODES).fill(0);
  /** Minutos simulados del agua desde el último cambio del mando. */
  minutesSinceChange = 0;
  /** Solo el banco de calibración la cambia (decisión 52). */
  calibration: Readonly<HemodynamicCalibration> = DEFAULT_CALIBRATION;
  private depth: number[] = [];
  private lung: boolean[] = [];
  private position: 'supine' | 'sitting' | null = null;

  constructor(private readonly sim: () => Simulator) {}

  /** Profundidad bajo la aurícula izquierda de cada nodo (con la posición del paciente) y si el nodo es pulmón. */
  private geometry(): void {
    const s = this.sim();
    const pos = s.patient.position ?? 'supine';
    if (this.position === pos && this.depth.length) return;
    const t = s.scene.torso;
    this.depth = [];
    this.lung = [];
    for (let i = 0; i < SUBPLEURAL_NODES; i++) {
      const { u, z } = subpleuralNode(i);
      // el punto de la piel con ese arco (bisección en el ángulo φ de la elipse, x = a·cos φ, y = b·sin φ: el arco, desde la
      // línea media anterior, decrece con φ en (−π/2, 3π/2))
      let lo = -Math.PI / 2;
      let hi = (3 * Math.PI) / 2;
      for (let k = 0; k < 50; k++) {
        const mid = 0.5 * (lo + hi);
        if (wallArc(torsoSkinPoint(mid, z, t), t) < u) hi = mid;
        else lo = mid;
      }
      const p = torsoSkinPoint(0.5 * (lo + hi), z, t);
      this.depth.push(depthBelowLaCm(p[1], z, pos));
      const border = lungBorderAt(s.scene.lungBorder, Math.abs(u));
      this.lung.push(z >= border[0] - 10 && z <= s.scene.domeTopZ + 200);
    }
    this.position = pos;
  }

  /** El EVLWI global actual y el de equilibrio (mL/kg). */
  evlwi(): { now: number; steady: number } {
    this.geometry();
    return { now: globalEvlwi(this.excess, this.lung), steady: globalEvlwi(this.target, this.lung) };
  }

  /** Cambia el mando; con `equilibrate`, el agua salta a su equilibrio (el estado estable de la fuente). */
  setInput(input: HemodynamicInput, equilibrate = false): void {
    this.input = input;
    this.geometry();
    this.target = steadyExcess(input, this.depth, this.lung, this.calibration);
    this.minutesSinceChange = 0;
    if (equilibrate) this.excess = [...this.target];
    this.apply();
  }

  /** Avanza el agua `seconds` segundos (el reloj del simulador o un salto de la interfaz). */
  step(seconds: number): void {
    if (seconds <= 0) return;
    this.geometry();
    this.target = steadyExcess(this.input, this.depth, this.lung, this.calibration);
    this.excess = relaxExcess(this.excess, this.target, seconds);
    this.minutesSinceChange += seconds / 60;
    this.apply();
  }

  /** «Esperar»: el agua avanza `minutes` minutos sin mover la respiración. */
  wait(minutes: number): void {
    this.step(minutes * 60);
  }

  /** Vuelve al pulmón normal (sin mando). */
  reset(): void {
    this.excess.fill(0);
    this.target.fill(0);
    const s = this.sim();
    s.patient.lung = undefined;
    s.scene.setLungAeration(undefined);
  }

  private apply(): void {
    const s = this.sim();
    const lung = aerationFromExcess(this.excess, this.calibration);
    s.patient.lung = lung;
    s.scene.setLungAeration(lung);
  }
}

/** La pose ideal de un sitio: el centro del espacio intercostal en su línea, longitudinal o paralela a las costillas. */
export function sitePose(sim: Simulator, s: Site, orientation: Protocol['orientation']): ProbePose {
  const side = s.side === 'right' ? -1 : 1;
  // el centro del EIC n en la línea (entre las costillas n y n + 1 bajo su piel; como `icsCenter` de la equivalencia)
  const phi = thoraxLinePhi(s.line, sim.scene.torso, side);
  const au = ribLineArc(phi, sim.scene.torso, sim.scene.ribCage);
  const k = (m: number) => sim.scene.ribs.findIndex((r) => r.number === m && r.side === side);
  const c = { phi, z: 0.5 * (ribTableZ(sim.scene.ribCage, k(s.ics), au) + ribTableZ(sim.scene.ribCage, k(s.ics + 1), au)) };
  return { phi: c.phi, z: c.z, lift: 0, yaw: orientation === 'intercostal' ? Math.PI / 2 : 0, rock: 0, tilt: 0 };
}

export interface SiteMeasurement {
  site: Site;
  observation: SiteObservation;
  /** Conteos de cada cuadro del clip. */
  counts: number[];
}

/**
 * La «verdad del modelo» de un protocolo (modo docente, `docs/HEART_FAILURE.md` §7): cada sitio medido con la misma física y el
 * mismo detector en su pose ideal, un clip de `frames` cuadros. Devuelve la sonda a donde estaba. No es un atajo para el alumno:
 * lo que el alumno adquiere se registra con `measureHere`.
 */
export function measureProtocol(
  sim: Simulator,
  protocol: Protocol,
  opts: { frames?: number; intervalS?: number } = {},
): { result: ProtocolResult; sites: SiteMeasurement[] } {
  const pose0 = { ...sim.pose };
  const obs = new Map<string, SiteObservation>();
  const sites: SiteMeasurement[] = [];
  try {
    for (const s of protocolSites(protocol)) {
      const c = bLineClip(sim, {
        pose: sitePose(sim, s, protocol.orientation),
        frames: opts.frames ?? 3,
        intervalS: opts.intervalS ?? 0.4,
      });
      const o: SiteObservation = { count: c.clip.count, confluent: c.clip.confluent };
      obs.set(siteKey(s), o);
      sites.push({ site: s, observation: o, counts: c.counts });
    }
  } finally {
    sim.setPose(pose0);
  }
  return { result: evaluateProtocol(protocol, obs), sites };
}

/** El sitio del protocolo más cercano a la sonda (a ≤ `maxMm` de su pose ideal en la piel), o null. */
export function nearestSite(sim: Simulator, protocol: Protocol, maxMm = 15): Site | null {
  const t = sim.scene.torso;
  const here = torsoSkinPoint(sim.pose.phi, sim.pose.z, t);
  let best: Site | null = null;
  let dBest = maxMm;
  for (const s of protocolSites(protocol)) {
    const p = sitePose(sim, s, protocol.orientation);
    const q = torsoSkinPoint(p.phi, p.z, t);
    const d = Math.hypot(q[0] - here[0], q[1] - here[1], q[2] - here[2]);
    if (d < dBest) {
      dBest = d;
      best = s;
    }
  }
  return best;
}

/** Lo que adquirió el alumno en el sitio bajo la sonda: un clip en la pose actual, medido con el detector. */
export function measureHere(sim: Simulator, protocol: Protocol): SiteMeasurement | null {
  const s = nearestSite(sim, protocol);
  if (!s) return null;
  const c = bLineClip(sim, { frames: 3, intervalS: 0.4 });
  return { site: s, observation: { count: c.clip.count, confluent: c.clip.confluent }, counts: c.counts };
}
