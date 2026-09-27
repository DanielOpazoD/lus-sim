import { TISSUES, Tissue, attenuationDbPerCm } from '../anatomy/tissues';
import { RIBCAGE } from '../anatomy/organs/ribcage';
import { defineParameters } from '../core/evidence';
import { CONVEX_C35 } from '../probe/probe';
import { AXIAL_SIGMA_MM } from './beamModel';
import { C_RECONSTRUCTION_M_S } from '../core/units';

/**
 * Transmisión por el hueso (lus-sim, ciclo 2, decisión 20). La pasada A atenúa cada tejido a la frecuencia B efectiva del
 * perfil (`bEffectiveMHz`, 2,5 MHz), la banda que queda tras el desplazamiento a bajas que el tejido blando produce en el
 * campo profundo. Una costilla está a 8–15 mm de la piel: el pulso le llega casi sin desplazar, centrado en la frecuencia
 * del transductor, y es el propio hueso, que atenúa 40 veces más que el músculo, el que lo desplaza al cruzarlo. Con un
 * espectro gaussiano de energía (centro f₀, σ_E) y una atenuación lineal en f (α' en Np/mm/MHz de amplitud), la energía
 * que vuelve tras un recorrido de ida y vuelta ℓ por el hueso es exp(−2α'ℓ·(f₀ − α'ℓσ_E²)): la de una atenuación a la
 * frecuencia f₀ − α'ℓσ_E². Con la costilla del avatar esa frecuencia es 3,26 MHz, no 2,5: la costilla deja pasar 14 dB
 * menos de ida y vuelta por su centro que con la frecuencia del campo profundo.
 *
 * La pasada A suma pérdidas por segmento, lineales en el recorrido, así que el desplazamiento se toma con el recorrido de
 * referencia de la costilla del avatar (su grosor, ida y vuelta); una costilla más fina lo desplaza menos y una más gruesa,
 * más (aproximación declarada en `docs/APPROXIMATIONS.md`). Solo el hueso (el que la tabla de tejidos marca `bone`: la
 * costilla, el esternón y la vértebra); el cartílago, que atenúa como un tejido blando grueso, sigue a la frecuencia B.
 */

/**
 * Pérdida de las caras de la costilla en el eco que la cruza (dB): entrar y salir de la cortical, a la ida y a la vuelta,
 * cuatro cruces músculo ↔ hueso cortical con la transmisión de intensidad T = 4·Z₁Z₂/(Z₁ + Z₂)² de la tabla de tejidos
 * (IT'IS: 0,652, −1,86 dB por cruce). `docs/knowledge/physics.md` §2.10: «4 cruces de interfaz (≈ −7,4 dB)».
 */
const MUSCLE_Z = TISSUES[Tissue.Muscle].rho * TISSUES[Tissue.Muscle].c;
const BONE_Z = TISSUES[Tissue.Bone].rho * TISSUES[Tissue.Bone].c;
const BONE_CROSSING_DB = -10 * Math.log10((4 * MUSCLE_Z * BONE_Z) / (MUSCLE_Z + BONE_Z) ** 2);

/** Recorrido de ida y vuelta por la costilla del avatar (mm): su grosor, de la cresta a su cara interna, dos veces. */
const RIB_ROUND_TRIP_MM = 2 * (RIBCAGE.params.crestToPleuraMm.value - RIBCAGE.params.pleuraComplexMm.value);
/** Atenuación de amplitud del hueso (Np por mm y MHz), de la tabla de tejidos. */
const BONE_NP_PER_MM_MHZ = TISSUES[Tissue.Bone].alpha1 / 10 / (20 / Math.LN10);
/** σ del espectro de energía del pulso de dos vías de la pasada C (MHz): σ_t = 2σ/c, σ_E = 1/(2π·√2·σ_t). */
const PULSE_SIGMA_E_MHZ = 1 / (2 * Math.PI * Math.SQRT2 * ((2 * AXIAL_SIGMA_MM * 1e-3) / C_RECONSTRUCTION_M_S)) / 1e6;

export const BONE_TRANSMISSION = defineParameters('ultrasound.boneTransmission', {
  interfaceLossDb: {
    value: 4 * BONE_CROSSING_DB,
    unit: 'dB',
    evidence: 'derivado',
    sources: ['itis-base-2024'],
    note:
      'Ida y vuelta por una costilla: cuatro cruces músculo ↔ hueso cortical (entrar y salir, dos veces), cada uno con la ' +
      "transmisión de intensidad 4·Z₁Z₂/(Z₁ + Z₂)² = 0,652 (−1,86 dB) de las impedancias de IT'IS (músculo 1,73 MRayl, hueso " +
      'cortical 6,71: `docs/knowledge/physics.md`, R7 y §2.10, «≈ −7,4 dB»): 7,42 dB. VExUS cobraba 6 dB una sola vez al entrar',
  },
  attenuationMHz: {
    value: CONVEX_C35.f0B / 1e6 - BONE_NP_PER_MM_MHZ * RIB_ROUND_TRIP_MM * PULSE_SIGMA_E_MHZ ** 2,
    unit: 'MHz',
    range: [2.5, 3.5],
    evidence: 'estimado',
    sources: ['lichtenstein-luci-2014'],
    note:
      'Frecuencia a la que atenúa el hueso: la central del transductor (3,5 MHz) menos el desplazamiento que el propio hueso ' +
      'produce en un pulso gaussiano, α′ℓσ_E², con α′ = 20 dB/cm/MHz de la tabla de tejidos (0,230 Np/mm/MHz), ℓ = 9,4 mm (la ' +
      'costilla del avatar, 4,7 mm, de ida y vuelta: la pleura a 5 mm de la cresta, Lichtenstein, menos el complejo pleural) y ' +
      'σ_E = 0,333 MHz (la banda del pulso de la pasada C); el desplazamiento del tejido blando que hay encima (1 cm) es ' +
      '< 0,05 MHz. Estimado: la sección real no es una elipse de hueso homogéneo y el desplazamiento depende del recorrido. ' +
      'Rango: entre la frecuencia B efectiva del campo profundo y la del transductor. Se calibra con el banco de referencia ' +
      '(decisión 5): el contraste entre la línea pleural intercostal y la sombra costal en clips de convexa de 3,5 MHz',
  },
});

/**
 * Atenuación de un tejido en la transmisión de la pasada A (dB/cm, de ida): el hueso a `BONE_TRANSMISSION.attenuationMHz`,
 * el resto a la frecuencia B efectiva `fMHz`. La usan la tabla de la pasada A (`renderer.ts`) y sus gemelos
 * (`rayAttenuationDb`, `segmentDb`).
 */
export function transmissionAlphaDbPerCm(t: Tissue, fMHz: number): number {
  return attenuationDbPerCm(t, TISSUES[t].bone ? BONE_TRANSMISSION.params.attenuationMHz.value : fMHz);
}
