import type { RespiratoryPattern } from '../../physiology/patientState';
import type { ProbePose } from '../../probe/probe';
import { button, note, row, slider, type SliderSpec } from '../controls';
import type { PanelContext } from './context';
import { buildImageAdvanced, IMAGE_ADVANCED_INFO } from './imageControls';

/** Ajustes contextuales: maniobras, orientación fina y procesamiento avanzado. */
export interface AcquireActions {
  setPose: (p: ProbePose) => void;
  onResetPatient: () => void;
}

export function buildAcquireTab(ctx: PanelContext, p: HTMLElement, actions: AcquireActions): void {
  const s = ctx.sim;
  const pose = () => (ctx.store.get().frozen ? s().displayedAcquisition.pose : s().pose);
  const move = (patch: Partial<ProbePose>) => actions.setPose({ ...s().pose, ...patch });
  const resp = ctx.section(p, 'Respiración', {
    info: 'Las maniobras cambian la respiración del paciente sintético. En apnea no hay deslizamiento respiratorio.',
  });
  const info = note(resp);
  ctx.track({
    sync: () => (info.textContent = `Paciente sintético · FR ${s().patient.respiratoryRateMin}/min`),
  });
  const maneuvers = ctx.segmented<RespiratoryPattern>(
    resp,
    [
      ['quiet', 'Tranquila'],
      ['deep', 'Profunda'],
      ['apnea-expiratory', 'Apnea espiratoria'],
      ['apnea-inspiratory', 'Apnea inspiratoria'],
    ],
    () => (ctx.store.get().frozen ? s().displayedAcquisition.respiratoryPattern : s().patient.respiratoryPattern),
    (v) => (s().patient.respiratoryPattern = v),
  );
  maneuvers.classList.add('grid2');
  maneuvers.setAttribute('aria-label', 'Maniobra respiratoria');
  ctx.track(button(row(resp), 'Restablecer paciente', actions.onResetPatient));
  note(resp, 'Restablece la respiración y borra el cine. Conserva la ubicación de la sonda y los ajustes del equipo.');

  const probe = ctx.section(p, 'Sonda', {
    collapsed: true,
    info: 'Mueve el transductor sobre el tórax. Estos controles ajustan su orientación y contacto. Con la imagen congelada muestran la pose del cuadro elegido.',
  });
  const deg = (v: number) => `${v.toFixed(0)}°`;
  const orientation: SliderSpec[] = [
    {
      label: 'Rotación',
      min: -180,
      max: 180,
      step: 1,
      get: () => (pose().yaw * 180) / Math.PI,
      set: (v) => move({ yaw: (v * Math.PI) / 180 }),
      format: deg,
    },
    {
      label: 'Inclinación',
      min: -40,
      max: 40,
      step: 1,
      get: () => (pose().tilt * 180) / Math.PI,
      set: (v) => move({ tilt: (v * Math.PI) / 180 }),
      format: deg,
    },
    {
      label: 'Basculación',
      min: -40,
      max: 40,
      step: 1,
      get: () => (pose().rock * 180) / Math.PI,
      set: (v) => move({ rock: (v * Math.PI) / 180 }),
      format: deg,
    },
    {
      label: 'Contacto',
      min: -6,
      max: 6,
      step: 0.5,
      get: () => -pose().lift,
      set: (v) => move({ lift: -v }),
      format: (v) => (v === 0 ? 'Apoyo' : `${v < 0 ? 'Separación' : 'Compresión'} ${Math.abs(v).toFixed(1).replace('.', ',')} mm`),
    },
  ];
  for (const spec of orientation) ctx.track(slider(probe, spec, () => undefined));
  ctx.track(button(row(probe), 'Restablecer orientación y contacto', () => move({ yaw: 0, rock: 0, tilt: 0, lift: 0 })));
  note(probe, 'La ubicación sobre la piel se conserva.');

  buildImageAdvanced(ctx, ctx.section(p, 'Avanzado', { collapsed: true, info: IMAGE_ADVANCED_INFO }));
}
