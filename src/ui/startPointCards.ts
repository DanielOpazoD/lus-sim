import type { Torso } from '../anatomy/primitives';
import { START_POINTS, type StartPoint, type StartPointId } from '../app/startPoints';
import type { ProbePose } from '../probe/probe';

/**
 * La línea de cada tarjeta con lo que muestra su ventana. El nombre es el `label` del punto de partida; la
 * explicación completa (`hint`) queda en el tooltip.
 *
 * lus-sim (decisión 13): los puntos del protocolo BLUE derecho, con su lugar y no con un hallazgo (el hallazgo sale
 * del paciente, guía §5); sin el color del anillo del navegador 3D de VExUS.
 */
const CARD_SUB: Record<string, string> = {
  blueUpper: 'Anterior',
  blueLower: 'Anterolateral',
  // lus-sim (decisión 41): el punto frénico de la regla de las manos
  phrenic: 'Lateral',
  plaps: 'Posterolateral',
  // lus-sim (decisión 33): la espalda, sentado
  posteriorUpper: 'Posterior · sentado',
  posteriorMiddle: 'Posterior · sentado',
  posteriorBasal: 'Posterior · sentado',
};

/** La línea de la tarjeta: la región del punto, la misma en los dos lados (decisión 41). */
export function cardSub(id: StartPointId): string {
  return CARD_SUB[id.replace(/Left$/, '')];
}

/**
 * Radio (mm, sobre la piel) dentro del cual la sonda «está» en una ventana: el de VExUS, donde las dos más próximas
 * distaban 24 mm; en el tórax, los puntos BLUE superior e inferior distan 57 mm.
 */
export const CURRENT_WINDOW_MM = 20;

/** Distancia (mm) entre la sonda y un punto de partida: cuerda sobre la elipse del tronco y eje craneocaudal. */
export function startPointDistanceMm(pose: Pick<ProbePose, 'phi' | 'z'>, sp: StartPoint, torso: Pick<Torso, 'a' | 'b'>): number {
  const dx = torso.a * (Math.cos(pose.phi) - Math.cos(sp.phi));
  const dy = torso.b * (Math.sin(pose.phi) - Math.sin(sp.phi));
  return Math.hypot(dx, dy, pose.z - sp.z);
}

/** La ventana en la que está la sonda: el punto de partida más cercano a ≤ `maxMm`, o ninguno. */
export function currentStartPoint(
  pose: Pick<ProbePose, 'phi' | 'z'>,
  torso: Pick<Torso, 'a' | 'b'>,
  maxMm = CURRENT_WINDOW_MM,
): StartPointId | null {
  let best: StartPointId | null = null;
  let bestMm = maxMm;
  for (const sp of START_POINTS) {
    const d = startPointDistanceMm(pose, sp, torso);
    if (d <= bestMm) {
      best = sp.id;
      bestMm = d;
    }
  }
  return best;
}

export interface StartPointCardsDeps {
  /** Lleva la sonda al punto de partida (se desliza: decisión 17 de VExUS). */
  onPick: (sp: StartPoint) => void;
  getPose: () => ProbePose;
  getTorso: () => Pick<Torso, 'a' | 'b'>;
  /** La sonda se está deslizando hacia la ventana elegida. */
  animating: () => boolean;
  /** lus-sim (decisión 13): con la imagen congelada la sonda no se mueve y las tarjetas se deshabilitan. */
  locked?: () => boolean;
}

/**
 * Ventanas del carril izquierdo: una tarjeta por punto de partida. Resalta la ventana actual: la elegida
 * mientras la sonda se desliza hacia ella y, después, aquella en cuyo punto de partida está la sonda.
 */
export class StartPointCards {
  private readonly cards = new Map<StartPointId, HTMLButtonElement>();
  private target: StartPointId | null = null;

  constructor(
    host: HTMLElement,
    private readonly deps: StartPointCardsDeps,
  ) {
    // lus-sim (decisión 41): un grupo por hemitórax, con su título
    const groups = new Map<StartPoint['side'], HTMLElement>();
    for (const side of ['right', 'left'] as const) {
      const group = document.createElement('div');
      group.className = 'windows-side';
      const title = document.createElement('h4');
      title.className = 'windows-side-title';
      title.textContent = side === 'right' ? 'Hemitórax derecho' : 'Hemitórax izquierdo';
      const grid = document.createElement('div');
      grid.className = 'windows';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', title.textContent);
      group.append(title, grid);
      host.appendChild(group);
      groups.set(side, grid);
    }
    for (const sp of START_POINTS) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'win-card';
      card.title = sp.hint;
      card.dataset['startPoint'] = sp.id;
      const name = document.createElement('span');
      name.className = 'win-name';
      name.textContent = sp.label;
      const sub = document.createElement('span');
      sub.className = 'win-sub';
      sub.textContent = cardSub(sp.id);
      card.append(name, sub);
      card.addEventListener('click', () => {
        this.target = sp.id;
        deps.onPick(sp);
        this.sync();
      });
      groups.get(sp.side)!.appendChild(card);
      this.cards.set(sp.id, card);
    }
  }

  sync(): void {
    const current = this.target && this.deps.animating() ? this.target : currentStartPoint(this.deps.getPose(), this.deps.getTorso());
    const locked = this.deps.locked?.() ?? false;
    for (const [id, card] of this.cards) {
      card.disabled = locked;
      card.classList.toggle('current', id === current);
      if (id === current) card.setAttribute('aria-current', 'true');
      else card.removeAttribute('aria-current');
    }
  }
}
