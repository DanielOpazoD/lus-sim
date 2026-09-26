import { Interface } from '../anatomy/interfaces';
import { Tissue } from '../anatomy/tissues';
import { contactCoupling } from '../probe/contact';
import { pointOnLine } from '../probe/probe';
import { muscleStriation } from '../ultrasound/wallTexture';
import type { Simulator } from './simulator';

/**
 * Estadística del speckle del modo B (Fase 3), como guarda de fidelidad de imagen: sobre la
 * envolvente detectada (antes de la compresión) en un tejido sin estructura, la relación señal/ruido
 * media/desviación de un speckle plenamente desarrollado es la de Rayleigh, √(π/(4−π)) ≈ 1,91
 * (Burckhardt 1978; Wagner 1983).
 *
 * Se estima por parches (muestras × líneas) y se promedia. El tamaño importa: un segmento de
 * 16 muestras en una sola línea abarca ~4 células de speckle axiales y la desviación sale
 * sesgada a la baja (SNR ≈ 2,5 sobre la misma imagen); parches grandes mezclan la TGC, el foco
 * y la heterogeneidad lenta del parénquima (SNR < 1,7).
 *
 * lus-sim (decisión 12): el tejido del tórax es el músculo de la pared (VExUS medía el hígado, que el tórax no tiene;
 * bajo la pleura no hay tejido, solo la serie de reverberaciones y el deslizamiento). El músculo tiene estructura
 * propia (las estrías del perimisio, `wallTexture.ts`, y los dos planos intermusculares), así que la máscara deja
 * fuera las muestras al alcance de una estría o de una cara según el gemelo TS; queda el moteado del músculo con su
 * heterogeneidad lenta, como el hígado de VExUS. La grasa (grumos, decisión 56 de VExUS) y el «resto» del abdomen
 * (grumos, decisión 74) no son de Rayleigh.
 */
export const RAYLEIGH_SNR = Math.sqrt(Math.PI / (4 - Math.PI));

/**
 * Parche por defecto: 16 muestras de profundidad × 8 líneas, el de VExUS (≈ 1,9 mm × 4 mm en el músculo de la pared a
 * 2 cm con 12 cm de profundidad). En la pared lateral el músculo tiene dos planos intermusculares cada ~2,5 mm y no
 * caben parches: la guarda mide en la zona paraesternal, donde el músculo es una sola capa de ~7 mm (la del recto de
 * VExUS, |u| < 50 mm de la línea media anterior, `organs/wall.ts`).
 */
export const SPECKLE_PATCH = { axial: 16, lateral: 8 } as const;
/** Distancia mínima (mm) de las muestras del parche a una cara de la pared o a otro tejido (`boundaryDistance`). */
export const SPECKLE_CLEARANCE_MM = 1;
/** Alcance (mm, a lo largo del haz) dentro del cual una estría del perimisio deja fuera la muestra. */
export const STRIATION_REACH_MM = 1;
/** Peso de estría (gaussiana por máscara de su tramo) por encima del cual una muestra cuenta como estriada. */
const STRIATION_WEIGHT_MAX = 0.02;
/** Acoplamiento mínimo de una línea del parche (el del banco de VExUS). */
const MIN_COUPLING = 0.95;

export interface SpeckleStats {
  /** Muestras de tejido usadas. */
  samples: number;
  /** SNR = media/desviación promedio de los parches. */
  snr: number;
  /** Parches que entraron en el promedio. */
  patches: number;
}

export interface SpeckleOptions {
  /** Muestras en profundidad por parche. */
  axial?: number;
  /** Líneas por parche. */
  lateral?: number;
}

/** Envolvente de un cuadro: `data[muestra · lines + línea]`. */
export interface EnvelopeFrame {
  lines: number;
  samples: number;
  data: Float32Array;
}

/**
 * SNR media de los parches cuyas muestras cumplen TODAS `inside(línea, muestra)`. Antes bastaban
 * nueve de control (esquinas, centros de lado y centro) y un vaso de 2 mm entre ellas entraba en el
 * parche. Pura: la prueban campos sintéticos sin WebGL.
 */
export function patchSnr(env: EnvelopeFrame, inside: (line: number, sample: number) => boolean, opts: SpeckleOptions = {}): SpeckleStats {
  const AX = opts.axial ?? SPECKLE_PATCH.axial;
  const LAT = opts.lateral ?? SPECKLE_PATCH.lateral;
  let snrSum = 0;
  let patches = 0;
  let used = 0;
  for (let u0 = 0; u0 + LAT <= env.lines; u0 += LAT) {
    for (let v0 = 0; v0 + AX <= env.samples; v0 += AX) {
      let ok = true;
      for (let u = u0; ok && u < u0 + LAT; u++) for (let v = v0; ok && v < v0 + AX; v++) if (!inside(u, v)) ok = false;
      if (!ok) continue;
      let m = 0;
      let m2 = 0;
      for (let u = u0; u < u0 + LAT; u++)
        for (let v = v0; v < v0 + AX; v++) {
          const x = env.data[v * env.lines + u];
          m += x;
          m2 += x * x;
        }
      const n = AX * LAT;
      m /= n;
      const sd = Math.sqrt(Math.max(1e-30, m2 / n - m * m));
      snrSum += m / sd;
      patches++;
      used += n;
    }
  }
  return { samples: used, snr: patches ? snrSum / patches : Number.NaN, patches };
}

/**
 * Máscara de la guarda de Rayleigh en el plano actual: la muestra (línea u, muestra v) está en el músculo de la pared
 * a ≥ `SPECKLE_CLEARANCE_MM` de otro tejido (`boundaryDistance`) y de cualquier cara de la pared (`interfaceDistance`),
 * sin estría del perimisio a ±`STRIATION_REACH_MM` a lo largo del haz (el gemelo TS de la textura,
 * `muscleStriation`), en una línea con contacto. Sin hueso: la costilla y su sombra quedan fuera porque no son músculo
 * y porque la transmisión tras ella no es la del tejido de fuera.
 */
export function speckleMask(sim: Simulator, env: EnvelopeFrame): (line: number, sample: number) => boolean {
  const tr = sim.transducer;
  const depth = sim.bmode.depthMm;
  const torso = sim.scene.torso;
  const thetaOf = (u: number) => -tr.halfSector + (2 * tr.halfSector * (u + 0.5)) / env.lines;
  // la primera costilla (o cartílago) de cada línea: por debajo, sombra
  const shadowFrom = Float32Array.from({ length: env.lines }, (_, u) => {
    for (let r = 0.25; r <= 60; r += 0.25) {
      const t = sim.anatomy.classifyWorld(pointOnLine(sim.frame, tr, thetaOf(u), r), sim.sample).tissue;
      if (t === Tissue.Bone || t === Tissue.Cartilage) return r;
    }
    return Infinity;
  });
  const coupled = Array.from({ length: env.lines }, (_, u) => contactCoupling(sim.contact, thetaOf(u)) >= MIN_COUPLING);
  const cache = new Map<number, boolean>();
  return (u, v) => {
    const key = v * env.lines + u;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const r = ((v + 0.5) / env.samples) * depth;
    let ok = coupled[u] && r < shadowFrom[u];
    if (ok) {
      const theta = thetaOf(u);
      const q = sim.anatomy.classifyWorld(pointOnLine(sim.frame, tr, theta, r), sim.sample);
      ok =
        q.tissue === Tissue.Muscle &&
        q.boundaryDistance >= SPECKLE_CLEARANCE_MM &&
        (q.interface === Interface.None || q.interfaceDistance >= SPECKLE_CLEARANCE_MM);
      for (let dr = -STRIATION_REACH_MM; ok && dr <= STRIATION_REACH_MM; dr += 0.25) {
        const m = sim.anatomy.deformation.toMaterial(pointOnLine(sim.frame, tr, theta, r + dr), sim.sample.resp);
        if (muscleStriation(m, torso)[3] > STRIATION_WEIGHT_MAX) ok = false;
      }
    }
    cache.set(key, ok);
    return ok;
  };
}

/** SNR del speckle en el músculo de la pared del plano actual del simulador, con la máscara de `speckleMask`. */
export function speckleStats(sim: Simulator, env: EnvelopeFrame, opts: SpeckleOptions = {}): SpeckleStats {
  return patchSnr(env, speckleMask(sim, env), opts);
}
