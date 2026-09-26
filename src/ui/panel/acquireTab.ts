import type { RespiratoryPattern } from '../../physiology/patientState';
import type { ProbePose } from '../../probe/probe';
import { button, note, row, slider } from '../controls';
import type { PanelContext } from './context';
import { buildImageAdvanced, buildImageBasics, IMAGE_ADVANCED_INFO } from './imageControls';

/**
 * Pestaña Adquirir: lo que se toca mientras se busca y se sostiene la ventana — la imagen (profundidad,
 * ganancia, foco), la sonda (ángulos y presión) y la respiración —, con los mandos avanzados de la imagen
 * plegados. Las ventanas (puntos de partida) están en el carril izquierdo.
 *
 * lus-sim (decisión 13): sin la sección del modo M ni el rótulo del caso (aún no hay casos: el paciente sintético por
 * omisión); «Reiniciar paciente» está en la sección de la respiración (en VExUS, en la pestaña Docente). Los mandos de
 * la sonda la mueven con `actions.setPose`, el mismo camino que el ratón (cancela la animación hacia un punto de
 * partida y no mueve nada con la imagen congelada), y se deshabilitan mientras la imagen está congelada.
 */
export interface AcquireActions {
  setPose: (p: ProbePose) => void;
  onResetPatient: () => void;
}

export function buildAcquireTab(ctx: PanelContext, p: HTMLElement, actions: AcquireActions): void {
  const s = ctx.sim;
  const move = (patch: Partial<ProbePose>) => actions.setPose({ ...s().pose, ...patch });
  buildImageBasics(ctx, ctx.section(p, 'Imagen', { info: 'También con el teclado: [ ] profundidad · − + ganancia.' }));

  const probe = ctx.section(p, 'Sonda', {
    info: 'Arrastra sobre la imagen para mover la sonda; los deslizadores la afinan. Teclado: W A S D deslizar · Q E rotar · ← → bascular · ↑ ↓ inclinar · R F presión · ⇧ fino.',
  });
  const deg = (v: number) => `${v.toFixed(0)}°`;
  ctx.track(
    slider(
      probe,
      {
        label: 'Rotación',
        min: -180,
        max: 180,
        step: 1,
        get: () => (s().pose.yaw * 180) / Math.PI,
        set: (v) => move({ yaw: (v * Math.PI) / 180 }),
        format: deg,
      },
      () => undefined,
    ),
  );
  ctx.track(
    slider(
      probe,
      {
        label: 'Inclinación',
        min: -40,
        max: 40,
        step: 1,
        get: () => (s().pose.tilt * 180) / Math.PI,
        set: (v) => move({ tilt: (v * Math.PI) / 180 }),
        format: deg,
      },
      () => undefined,
    ),
  );
  ctx.track(
    slider(
      probe,
      {
        label: 'Basculación',
        min: -40,
        max: 40,
        step: 1,
        get: () => (s().pose.rock * 180) / Math.PI,
        set: (v) => move({ rock: (v * Math.PI) / 180 }),
        format: deg,
      },
      () => undefined,
    ),
  );
  ctx.track(
    slider(
      probe,
      {
        label: 'Presión',
        // hasta lo que deja apretar `clampPose` (lift ≥ −6 mm; VExUS llegaba a 12 y el valor volvía a 6)
        min: -6,
        max: 6,
        step: 0.5,
        get: () => -s().pose.lift,
        set: (v) => move({ lift: -v }),
        format: (v) => `${v.toFixed(1)} mm`,
      },
      () => undefined,
    ),
  );
  const pos = note(probe);
  ctx.track({
    sync: () =>
      (pos.textContent = `φ ${((s().pose.phi * 180) / Math.PI).toFixed(0)}° · z ${(s().pose.z / 10).toFixed(1)} cm · acoplamiento ${(s().renderer.meanCoupling() * 100).toFixed(0)} %`),
  });
  ctx.track(button(row(probe), 'Reiniciar sonda', () => move({ yaw: 0, rock: 0, tilt: 0, lift: 0 })));
  // con la imagen congelada la sonda no se mueve: sus mandos, deshabilitados (dicen por qué)
  const freezeProbe = (frozen: boolean) => {
    for (const el of probe.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')) {
      el.disabled = frozen;
      el.title = frozen ? 'La imagen está congelada: descongela para mover la sonda' : '';
    }
  };
  freezeProbe(ctx.store.get().frozen);
  ctx.store.subscribe((st, prev) => {
    if (st.frozen !== prev.frozen) freezeProbe(st.frozen);
  });

  const resp = ctx.section(p, 'Respiración', {
    info: 'La maniobra cambia presiones y movimiento; no reinicia el ciclo cardíaco. En apnea no hay deslizamiento.',
  });
  const info = note(resp);
  ctx.track({
    sync: () => (info.textContent = `Paciente sintético · FC ${s().patient.heartRateBpm} lpm · resp ${s().patient.respiratoryRateMin}/min`),
  });
  ctx
    .segmented<RespiratoryPattern>(
      resp,
      [
        ['quiet', 'Tranquila'],
        ['deep', 'Profunda'],
        ['apnea-expiratory', 'Apnea espiratoria'],
        ['apnea-inspiratory', 'Apnea inspiratoria'],
      ],
      () => s().patient.respiratoryPattern,
      (v) => (s().patient.respiratoryPattern = v),
    )
    .classList.add('grid2');
  ctx.track(button(row(resp), 'Reiniciar paciente', actions.onResetPatient));

  buildImageAdvanced(ctx, ctx.section(p, 'Avanzado', { collapsed: true, info: IMAGE_ADVANCED_INFO }));
}
