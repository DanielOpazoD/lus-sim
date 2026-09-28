import type { Simulator } from '../app/simulator';
import type { Store } from '../app/store';
import { controlId, type Syncable } from './controls';
import { bindCollapsible } from './disclosure';
import { buildAcquireTab, type AcquireActions } from './panel/acquireTab';
import { buildImageBasics } from './panel/imageControls';
import type { EquipmentCommand } from '../app/equipment';
import type { PanelContext, SectionOptions } from './panel/context';

/**
 * Equipo junto a la imagen: tres valores siempre visibles; los ajustes de cada uno se abren al tocarlos.
 * Maniobras, orientación fina y avanzado comparten un diálogo contextual con foco nativo.
 */
export class ControlPanel implements PanelContext {
  private syncables: Syncable[] = [];

  constructor(
    root: HTMLElement,
    readonly sim: () => Simulator,
    readonly store: Store,
    readonly dispatch: (cmd: EquipmentCommand) => void,
    actions: AcquireActions,
  ) {
    root.replaceChildren();
    buildImageBasics(this, root);
    const dialog = document.getElementById('acquisition-settings') as HTMLDialogElement;
    const settingsHost = document.getElementById('settings-content')!;
    const settingsToggle = document.getElementById('settings-toggle') as HTMLButtonElement;
    const close = document.getElementById('settings-close') as HTMLButtonElement;
    const scroll = document.createElement('div');
    scroll.className = 'console-scroll';
    settingsHost.replaceChildren(scroll);
    const p = document.createElement('div');
    p.className = 'tab-panel';
    p.setAttribute('aria-label', 'Adquirir');
    scroll.appendChild(p);
    settingsToggle.addEventListener('click', () => {
      dialog.showModal();
      settingsToggle.setAttribute('aria-expanded', 'true');
    });
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      settingsToggle.setAttribute('aria-expanded', 'false');
      settingsToggle.focus();
    });
    dialog.addEventListener('click', (e) => {
      const r = dialog.getBoundingClientRect();
      if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close();
    });

    // Esc descarta el ⓘ que se esté viendo (WCAG 1.4.13) y, si había uno, no sigue hasta los atajos
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const shown = [...dialog.querySelectorAll<HTMLElement>('.info')].filter(
        (i) =>
          !i.classList.contains('dismissed') &&
          (i.classList.contains('show') || i.matches(':hover, :focus-visible') || !!i.nextElementSibling?.matches(':hover')),
      );
      for (const i of shown) {
        i.classList.remove('show');
        i.classList.add('dismissed');
      }
      if (shown.length) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    buildAcquireTab(this, p, actions);
    const syncFrozen = () => {
      const frozen = store.get().frozen;
      const active = document.activeElement as HTMLElement | null;
      for (const host of [root, settingsHost]) {
        for (const el of host.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, [data-acquisition-command]')) {
          el.disabled = frozen;
        }
      }
      for (const id of ['acquisition-lock-note', 'settings-lock-note']) document.getElementById(id)!.hidden = !frozen;
      this.sync();
      if (frozen && active && root.contains(active)) document.getElementById('freeze')!.focus();
      else if (frozen && active && settingsHost.contains(active) && active.matches(':disabled')) close.focus();
    };
    store.subscribe((st, prev) => {
      if (st.frozen !== prev.frozen) syncFrozen();
    });
    syncFrozen();
    bindNavigatorDisclosure();
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
      b.dataset['acquisitionCommand'] = 'true';
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

/** En móvil el tórax se despliega sin enviar los mandos del equipo al final de la página. */
function bindNavigatorDisclosure(): void {
  const toggle = document.getElementById('navigator-toggle') as HTMLButtonElement;
  const content = document.getElementById('navigator-content')!;
  const mobile = window.matchMedia('(max-width: 800px)');
  let expanded = false;
  const sync = () => {
    content.hidden = mobile.matches && !expanded;
    toggle.setAttribute('aria-expanded', String(!content.hidden));
    toggle.textContent = content.hidden ? 'Mostrar tórax' : 'Ocultar tórax';
  };
  toggle.addEventListener('click', () => {
    expanded = !expanded;
    sync();
  });
  mobile.addEventListener('change', sync);
  sync();
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
