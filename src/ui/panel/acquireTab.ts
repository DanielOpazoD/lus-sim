import type { RespiratoryPattern } from '../../physiology/patientState';
import type { PatientPosition, ProbePose } from '../../probe/probe';
import { button, note, row, slider, type SliderSpec } from '../controls';
import type { PanelContext } from './context';
import { buildImageAdvanced, IMAGE_ADVANCED_INFO } from './imageControls';

/** Ajustes contextuales: maniobras, orientación fina y procesamiento avanzado. */
export interface AcquireActions {
  setPose: (p: ProbePose) => void;
  /** lus-sim (decisión 33): sentar o tumbar al paciente. */
  setPosition: (position: PatientPosition) => void;
  onResetPatient: () => void;
  /** lus-sim (decisión 52): abre el panel de insuficiencia cardiaca (se carga al pedirlo). */
  openHeartFailure: () => void;
}

export function buildAcquireTab(ctx: PanelContext, p: HTMLElement, actions: AcquireActions): void {
  const s = ctx.sim;
  const pose = () => (ctx.store.get().frozen ? s().displayedAcquisition.pose : s().pose);
  const move = (patch: Partial<ProbePose>) => actions.setPose({ ...s().pose, ...patch });
  // lus-sim (decisión 33): la posición del paciente; sentado se explora la espalda
  const patient = ctx.section(p, 'Paciente', {
    info: 'En supino la sonda llega hasta por detrás de la línea axilar posterior (el PLAPS). Sentado, a toda la espalda.',
  });
  const position = ctx.segmented<PatientPosition>(
    patient,
    [
      ['supine', 'Supino'],
      ['sitting', 'Sentado'],
    ],
    // congelada, la del cuadro mostrado (como la maniobra)
    () => (ctx.store.get().frozen ? s().displayedAcquisition.position : (s().patient.position ?? 'supine')),
    (v) => actions.setPosition(v),
  );
  position.setAttribute('aria-label', 'Posición del paciente');
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
  note(
    resp,
    'Restablece la respiración y borra el cine. Conserva la ubicación de la sonda, la posición del paciente y los ajustes del equipo.',
  );

  // lus-sim (decisión 52): el mando hemodinámico y los protocolos de IC, en un panel que se carga al abrirlo
  const hf = ctx.section(p, 'Insuficiencia cardiaca', {
    collapsed: true,
    info: 'Elige una presión de llenado o el agua extravascular: el pulmón pierde aire donde se acumula el agua y las líneas B salen de la física. El mapa del protocolo cuenta lo que mide el detector sobre la imagen.',
  });
  ctx.track(button(row(hf), 'Abrir el panel de IC', actions.openHeartFailure));

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
