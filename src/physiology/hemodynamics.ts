import { defineParameters } from '../core/evidence';
import { SUBPLEURAL_AERATION, SUBPLEURAL_NODES, type LungAeration } from './lungAeration';

/**
 * De la presión de llenado izquierda al agua pulmonar y a la aireación subpleural (lus-sim, decisión 52; la propuesta de
 * `docs/HEART_FAILURE.md`, capas 0–3 y el paso de la capa 4 al estado del paciente). El modelo nunca fija un número de líneas B
 * ni un puntaje (guía §5): calcula el agua extravascular de cada región y, de ella, la fracción de gas subpleural
 * (`lungAeration.ts`); las trampas, la imagen y la medida hacen el resto (decisión 51).
 *
 *  - **Capa 0, el mando.** PAI, PD2VI o PCWP, tratadas como una sola presión de llenado izquierda Pfill [SUPUESTO, la interfaz lo
 *    dice], o directamente el EVLWI. Fenotipo (FE preservada, reducida o sano) y presión auricular derecha (PAD).
 *  - **Capa 1, el agua en equilibrio.** Por región, EVLW_ss = EVLWI_0 + k·sp(Pc − P*), con sp la bisagra suavizada
 *    w·ln(1 + e^(x/w)) [SUPUESTO: no hay ajuste publicado], P* la de Imanishi (19 mmHg con FE preservada y 25 con FE reducida;
 *    el sano, [SUPUESTO]) y la PAD, que la baja (la presión venosa como poscarga linfática: asociación de Reddy, mecanismo en
 *    ovejas: `extrapolacion`).
 *  - **Capa 2, la cinética.** Cada región tiende a su equilibrio con un primer orden, τ de subida y τ de bajada distintas: la
 *    presión que sube no cambia las líneas B en el primer minuto (P-T8) y el agua sigue alta un rato tras bajar la presión.
 *  - **Capa 3, la gravedad.** La presión capilar de cada región es Pfill + g·d, con d la profundidad bajo la aurícula izquierda
 *    en la dirección de la gravedad (de delante atrás en supino, del vértice a la base sentado) y g = 0,77 mmHg/cm amortiguado.
 *  - **Capa 4, al estado físico.** El agua de más de cada región quita gas al pulmón subpleural: φ = φ0 − β·ΔEVLW [SUPUESTO
 *    lineal, β calibrable contra Mayr: P-T1].
 *
 * Lo que no se encontró (`docs/HEART_FAILURE.md` §6) queda como parámetro estimado con rango, no como dato.
 */
export const HEMODYNAMICS = defineParameters('physiology.hemodynamics', {
  evlwiNormal: {
    value: 7.4,
    unit: 'mL/kg',
    range: [4.1, 10.7],
    evidence: 'documentado',
    sources: ['tagami-evlwnormal-2010'],
    note: 'Agua pulmonar extravascular indexada normal: 7,4 ± 3,3 mL/kg (30 autopsias, Tagami 2010)',
  },
  hingeHfpef: {
    value: 19,
    unit: 'mmHg',
    evidence: 'documentado',
    sources: ['imanishi-pcwp-2023'],
    note: 'Pivote de la PCWP a partir del cual suben las líneas B con FE preservada (texto de Imanishi 2023, 116 pacientes con IC aguda)',
  },
  hingeHfref: {
    value: 25,
    unit: 'mmHg',
    evidence: 'documentado',
    sources: ['imanishi-pcwp-2023'],
    note: 'Pivote con FE reducida (Imanishi 2023): los autores lo atribuyen a la remodelación linfática y vascular crónica',
  },
  hingeHealthy: {
    value: 22,
    unit: 'mmHg',
    range: [18, 26],
    evidence: 'estimado',
    sources: ['picano-aguapulmonar-2016'],
    note:
      'Pivote del sano [SUPUESTO, sin dato humano]: entre los de la IC; el umbral animal clásico de la PAI (Guyton y Lindsey, perros, ' +
      '≈ 23–24 mmHg) solo se leyó en fuente secundaria y no se usa',
  },
  slopeHfpef: {
    value: 1.2,
    unit: 'mL/kg por mmHg',
    range: [0.3, 3],
    evidence: 'estimado',
    sources: ['imanishi-pcwp-2023', 'mayr-evlw-2022'],
    note:
      'k por encima de la bisagra, FE preservada: sin valor publicado. Calibrado con la GPU real (decisión 52): con 1,2, 10 líneas en 8 ' +
      'zonas con PCWP 22 (P-T30: ≈ 8 con 19–24 mmHg) y 0 con 16',
  },
  slopeHfref: {
    value: 2.4,
    unit: 'mL/kg por mmHg',
    range: [0.3, 3],
    evidence: 'estimado',
    sources: ['imanishi-pcwp-2023', 'mayr-evlw-2022'],
    note:
      'k por encima de la bisagra, FE reducida: sin valor publicado. Calibrado con la GPU real (decisión 52): con 1,8 la suma de 8 zonas ' +
      'daba 17 con PCWP 28; con 2,4, la de P-T30 (≈ 24 con ≥ 25 mmHg)',
  },
  slopeHealthy: {
    value: 1.2,
    unit: 'mL/kg por mmHg',
    range: [0.3, 3],
    evidence: 'estimado',
    sources: ['picano-aguapulmonar-2016'],
    note: 'k del sano [SUPUESTO]: la de la FE preservada',
  },
  hingeWidth: {
    value: 1.5,
    unit: 'mmHg',
    range: [0.5, 4],
    evidence: 'estimado',
    sources: ['imanishi-pcwp-2023'],
    note: 'Ancho de la bisagra suavizada [SUPUESTO]: no hay ajuste publicado (bisagra, sigmoide ni logarítmico)',
  },
  rapHingeShift: {
    value: 0.3,
    unit: 'mmHg de pivote por mmHg de PAD',
    range: [0, 0.6],
    evidence: 'extrapolacion',
    sources: ['reddy-hfpef-2019', 'picano-aguapulmonar-2016'],
    note:
      'Cuánto baja el pivote cada mmHg de PAD por encima de 8: la PAD se asocia a las líneas B de esfuerzo (Reddy 2019: PAD ≥ 19 en ' +
      'el pico) y la presión venosa es la poscarga de la linfa (ovejas: extrapolación). Magnitud [SUPUESTO]',
  },
  tauUpMin: {
    value: 15,
    unit: 'min',
    range: [3, 60],
    evidence: 'extrapolacion',
    sources: ['reddy-hfpef-2019', 'gargani-oleico-2007'],
    note: 'Constante de subida: las líneas B aparecen en minutos de esfuerzo (Reddy); primera subida a los 15 min en el cerdo (Gargani)',
  },
  tauDownMin: {
    value: 180,
    unit: 'min',
    range: [70, 1900],
    evidence: 'estimado',
    sources: ['martindale-vni-2018', 'cortellaro-cinetica-2017'],
    note:
      'Constante de bajada: las t½ derivadas de los puntajes van de ≈ 48 min (VNI y nitratos, Martindale; τ ≈ 70 min) a ≈ 2,7 h y ' +
      'luego ≈ 22 h (Cortellaro; τ ≈ 3,9 h y 32 h). Son de puntajes, no del agua: se calibran contra P-T21',
  },
  hydrostaticGradient: {
    value: 0.77,
    unit: 'mmHg/cm',
    evidence: 'derivado',
    sources: ['picano-aguapulmonar-2016'],
    note: 'ρ·g de la sangre (1,05 g/mL): 1,05 × 980,7 / 1333 = 0,77 mmHg por cm de altura (cálculo físico)',
  },
  gravityDamping: {
    value: 1,
    unit: 'fracción',
    range: [0, 1],
    evidence: 'estimado',
    sources: ['picano-aguapulmonar-2016', 'cortellaro-cinetica-2017'],
    note:
      'Fracción del gradiente hidrostático que llega a la presión capilar efectiva [SUPUESTO]. Calibrada con la GPU real (decisión ' +
      '50): con menos gradiente el agua se reparte más igual, todas las regiones cruzan el umbral de las trampas a la vez y la suma ' +
      'de 28 sitios salta de 0 a la saturación; con el gradiente entero el reparto es el más gradual. Sus anclas propias (25 % más de ' +
      'líneas B en supino que sentado, C-T31; los ápices que se aclaran antes, P-T21) quedan por medir',
  },
  gasPerEvlwi: {
    value: 0.035,
    unit: 'fracción por mL/kg',
    range: [0.013, 0.05],
    evidence: 'estimado',
    sources: ['mayr-evlw-2022', 'cressoni-tacnormal-2013'],
    note:
      'Gas subpleural que quita cada mL/kg de agua de más en la región: con el agua desplazando gas en un pulmón de ≈ 75 mL/kg ' +
      '(tejido normal ≈ 15 g/kg, Cressoni, a φ0 = 0,80) sería 0,013. Calibrado con la GPU real contra Mayr (BL28 ≈ 2,23·EVLWI − 8,4, ' +
      'P-T1), medido con el detector en los 28 sitios: con 0,035, 0 / 23 / 127 líneas con EVLWI 10 / 15 / 20 (Mayr: 14 / 25 / 36). ' +
      'Coincide en 15; por debajo no hay líneas hasta ≈ 12 mL/kg y por encima satura antes (decisión 52, `hf-partial-calibration`)',
  },
  laHeightMm: {
    value: 60,
    unit: 'mm',
    range: [30, 90],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note: 'Altura de la aurícula izquierda sobre el xifoides (detrás del cuerpo del esternón, T6–T8) [SUPUESTO]',
  },
  laDepthMm: {
    value: -20,
    unit: 'mm',
    range: [-50, 10],
    evidence: 'estimado',
    sources: ['gray-anatomia-1918'],
    note: 'Coordenada anteroposterior de la aurícula izquierda (y; el centro del tronco es 0, la piel anterior +113) [SUPUESTO]',
  },
});

const HP = HEMODYNAMICS.params;

export type Phenotype = 'hfpef' | 'hfref' | 'healthy';
export type FillingControl = { kind: 'lap' | 'lvedp' | 'pcwp'; mmHg: number } | { kind: 'evlwi'; mlKg: number };

/** El mando hemodinámico (capa 0). */
export interface HemodynamicInput {
  control: FillingControl;
  phenotype: Phenotype;
  /** Presión auricular derecha (mmHg). */
  rapMmHg: number;
}

/** El pivote de la bisagra del fenotipo, bajado por la PAD sobre 8 mmHg. */
export function hingeMmHg(phenotype: Phenotype, rapMmHg: number): number {
  const base = phenotype === 'hfpef' ? HP.hingeHfpef.value : phenotype === 'hfref' ? HP.hingeHfref.value : HP.hingeHealthy.value;
  return base - HP.rapHingeShift.value * Math.max(0, rapMmHg - 8);
}

export function slopeMlKgPerMmHg(phenotype: Phenotype): number {
  return phenotype === 'hfpef' ? HP.slopeHfpef.value : phenotype === 'hfref' ? HP.slopeHfref.value : HP.slopeHealthy.value;
}

/** Bisagra suavizada: w·ln(1 + e^(x/w)), estable para x grande. */
export function softHinge(x: number, w = HP.hingeWidth.value): number {
  const t = x / w;
  return w * (t > 30 ? t : Math.log1p(Math.exp(t)));
}

/**
 * Valores de calibración (solo el banco de calibración de la decisión 52 los cambia; por omisión, los del registro): la
 * amortiguación de la gravedad, el gas por mL/kg y un factor de las pendientes k.
 */
export interface HemodynamicCalibration {
  gravityDamping: number;
  gasPerEvlwi: number;
  slopeScale: number;
}
export const DEFAULT_CALIBRATION: Readonly<HemodynamicCalibration> = Object.freeze({
  gravityDamping: HP.gravityDamping.value,
  gasPerEvlwi: HP.gasPerEvlwi.value,
  slopeScale: 1,
});

/** El agua de más en equilibrio (mL/kg) de una región con presión capilar `pc` (capa 1). */
export function regionalExcessSs(
  pc: number,
  phenotype: Phenotype,
  rapMmHg: number,
  cal: Readonly<HemodynamicCalibration> = DEFAULT_CALIBRATION,
): number {
  return cal.slopeScale * slopeMlKgPerMmHg(phenotype) * softHinge(pc - hingeMmHg(phenotype, rapMmHg));
}

/** La presión capilar de una región a `dCm` cm bajo la aurícula izquierda (capa 3). */
export function regionalPressure(pfill: number, dCm: number, cal: Readonly<HemodynamicCalibration> = DEFAULT_CALIBRATION): number {
  return pfill + HP.hydrostaticGradient.value * cal.gravityDamping * dCm;
}

/** EVLWI global de un reparto regional (la media de las regiones de pulmón, equiponderadas). */
export function globalEvlwi(excess: readonly number[], lungNodes: readonly boolean[]): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < excess.length; i++)
    if (lungNodes[i]) {
      s += excess[i];
      n++;
    }
  return HP.evlwiNormal.value + (n ? s / n : 0);
}

/**
 * El agua de más en equilibrio de cada nodo de la rejilla. Con una presión, la de su bisagra a su altura; con el EVLWI, la
 * presión equivalente (bisección) que da ese EVLWI global con el mismo reparto por la gravedad.
 */
export function steadyExcess(
  input: HemodynamicInput,
  depthCm: readonly number[],
  lungNodes: readonly boolean[],
  cal: Readonly<HemodynamicCalibration> = DEFAULT_CALIBRATION,
): number[] {
  const at = (pfill: number) => depthCm.map((d) => regionalExcessSs(regionalPressure(pfill, d, cal), input.phenotype, input.rapMmHg, cal));
  const c = input.control;
  if (c.kind !== 'evlwi') return at(c.mmHg);
  const target = c.mlKg;
  if (target <= HP.evlwiNormal.value) {
    // por debajo del normal no se quita agua: el reparto normal
    return depthCm.map(() => 0);
  }
  let lo = -40;
  let hi = 120;
  for (let k = 0; k < 60; k++) {
    const mid = 0.5 * (lo + hi);
    if (globalEvlwi(at(mid), lungNodes) < target) lo = mid;
    else hi = mid;
  }
  return at(0.5 * (lo + hi));
}

/** Un paso de la cinética (capa 2): cada nodo tiende a su equilibrio con τ de subida o de bajada; `dtS` en segundos. */
export function relaxExcess(current: readonly number[], target: readonly number[], dtS: number): number[] {
  return current.map((e, i) => {
    const tau = (target[i] > e ? HP.tauUpMin.value : HP.tauDownMin.value) * 60;
    return target[i] + (e - target[i]) * Math.exp(-Math.max(0, dtS) / tau);
  });
}

/** La aireación subpleural del paciente con ese agua de más (capa 4). */
export function aerationFromExcess(excess: readonly number[], cal: Readonly<HemodynamicCalibration> = DEFAULT_CALIBRATION): LungAeration {
  if (excess.length !== SUBPLEURAL_NODES) throw new RangeError(`aerationFromExcess: ${excess.length} nodos`);
  const g0 = SUBPLEURAL_AERATION.params.normalGasFraction.value;
  return { gas: excess.map((e) => Math.min(g0, Math.max(0.05, g0 - cal.gasPerEvlwi * Math.max(0, e)))) };
}

/** Profundidad (cm) de un punto bajo la aurícula izquierda en la dirección de la gravedad: supino, de delante atrás; sentado, hacia abajo. */
export function depthBelowLaCm(y: number, z: number, position: 'supine' | 'sitting'): number {
  return position === 'supine' ? (HP.laDepthMm.value - y) / 10 : (HP.laHeightMm.value - z) / 10;
}
