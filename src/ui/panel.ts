import type { Simulator } from '../app/simulator';
import type { Store } from '../app/store';
import { controlId, type Syncable } from './controls';
import { bindCollapsible } from './disclosure';
import { buildAcquireTab } from './panel/acquireTab';
import type { EquipmentCommand } from '../app/equipment';
import type { PanelContext, SectionOptions } from './panel/context';

/**
 * Consola derecha (guía §16–§17): cada control actúa en su etapa física. Se ordena en secciones plegables: lo
 * básico arriba y abierto, lo avanzado plegado, y las explicaciones largas detrás del ⓘ de la sección.
 *
 * lus-sim (decisión 13): una sola pestaña, Adquirir (la imagen, la sonda y la respiración), sin la barra de pestañas
 * ni las de Doppler, Medir y Docente de VExUS; «Reiniciar paciente» llega como `onResetPatient`.
 */
export class ControlPanel implements PanelContext {
  private syncables: Syncable[] = [];

  constructor(
    root: HTMLElement,
    readonly sim: () => Simulator,
    readonly store: Store,
    readonly dispatch: (cmd: EquipmentCommand) => void,
    onResetPatient: () => void,
  ) {
    root.replaceChildren();
    const scroll = document.createElement('div');
    scroll.className = 'console-scroll';
    root.append(scroll);
    const p = document.createElement('div');
    p.className = 'tab-panel';
    p.setAttribute('aria-label', 'Adquirir');
    scroll.appendChild(p);

    // Esc descarta el ⓘ que se esté viendo (WCAG 1.4.13) y, si había uno, no sigue hasta los atajos
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const shown = [...root.querySelectorAll<HTMLElement>('.info')].filter(
        (i) =>
          !i.classList.contains('dismissed') &&
          (i.classList.contains('show') || i.matches(':hover, :focus-visible') || !!i.nextElementSibling?.matches(':hover')),
      );
      for (const i of shown) {
        i.classList.remove('show');
        i.classList.add('dismissed');
      }
      if (shown.length) e.stopPropagation();
    });

    buildAcquireTab(this, p, onResetPatient);
    this.sync();
  }

  sync(): void {
    for (const s of this.syncables) s.sync();
  }

  track<T extends Syncable>(s: T): T {
    this.syncables.push(s);
    return s;
  }

  section(parent: HTMLElement, title: string, opts: SectionOptions = {}): HTMLElement {
    const s = document.createElement('section');
    s.className = 'section';
    const head = document.createElement('div');
    head.className = 'section-head';
    // patrón acordeón: el encabezado contiene el botón que pliega (un botón no admite un encabezado dentro)
    const h = document.createElement('h3');
    h.className = 'section-title';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'section-toggle';
    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.setAttribute('aria-hidden', 'true');
    toggle.append(chevron, title);
    h.appendChild(toggle);
    head.appendChild(h);
    if (opts.info) head.append(...infoTip(title, opts.info));
    const body = document.createElement('div');
    body.className = 'section-body';
    body.id = controlId(`seccion-${title}`);
    toggle.setAttribute('aria-controls', body.id);
    s.append(head, body);
    parent.appendChild(s);
    bindCollapsible(toggle, s, !opts.collapsed);
    return body;
  }

  segmented<T extends string>(parent: HTMLElement, options: Array<[T, string]>, get: () => T, set: (v: T) => void): HTMLElement {
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.setAttribute('role', 'group');
    const buttons: HTMLButtonElement[] = [];
    for (const [v, label] of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => {
        set(v);
        this.sync();
      });
      seg.appendChild(b);
      buttons.push(b);
    }
    parent.appendChild(seg);
    this.track({
      sync: () =>
        buttons.forEach((b, i) => {
          const on = options[i][0] === get();
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', String(on));
        }),
    });
    return seg;
  }
}

/**
 * ⓘ con la explicación larga de una sección: el texto se ve al pasar el ratón o con el foco (teclado) y un
 * clic lo fija hasta perder el foco (pantallas táctiles). Es la descripción accesible del botón
 * (`aria-describedby`); el nombre queda corto, «Ayuda: <sección>».
 */
function infoTip(title: string, text: string): [HTMLButtonElement, HTMLElement] {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.id = controlId(`ayuda-${title}`);
  tip.setAttribute('role', 'tooltip');
  tip.textContent = text;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'info';
  b.textContent = 'i';
  b.setAttribute('aria-label', `Ayuda: ${title}`);
  b.setAttribute('aria-describedby', tip.id);
  b.addEventListener('click', () => {
    b.classList.remove('dismissed');
    b.classList.toggle('show');
  });
  b.addEventListener('blur', () => b.classList.remove('show', 'dismissed'));
  b.addEventListener('pointerenter', () => b.classList.remove('dismissed'));
  return [b, tip];
}
