import * as lungCurtain from './lungCurtain';
import * as wall from './wall';

/**
 * Registro de módulos de órgano (decisión 46). Cada módulo reúne en UN archivo la geometría,
 * sus funciones TS y su gemelo GLSL (mismos nombres); `ANATOMY_GLSL` incluye todos los gemelos.
 * `organs.test.ts` exige que cada función GLSL tenga su gemela TS exportada con el mismo nombre,
 * salvo las declaradas en `gpuOnly` con su motivo.
 * El ORDEN es el de dependencia en GLSL (el hígado usa riñón, vesícula y fisura). Los tubos
 * (árbol vascular en textura de datos) y las primitivas genéricas siguen en `primitives.ts`.
 *
 * lus-sim (decisión 10): solo los módulos del tórax, la pared y la cortina pulmonar; el hígado, el riñón,
 * la vesícula y los ligamentos de VExUS no se portan (el hígado vuelve en la fase 3).
 */
export interface OrganModule {
  id: string;
  /** Exportaciones TS del módulo (para comprobar los gemelos por nombre). */
  exports: Record<string, unknown>;
  glsl: string;
  /** Funciones GLSL sin gemela TS (nombre → motivo), p. ej. normales que solo usa el shader. */
  gpuOnly?: Readonly<Record<string, string>>;
}

export const ORGAN_MODULES: readonly OrganModule[] = [
  { id: 'wall', exports: wall, glsl: wall.WALL_GLSL },
  { id: 'lungCurtain', exports: lungCurtain, glsl: lungCurtain.LUNG_CURTAIN_GLSL },
];
