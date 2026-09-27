import * as chestWall from './chestWall';
import * as lungCurtain from './lungCurtain';
import * as ribcage from './ribcage';
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
 * la vesícula y los ligamentos de VExUS no se portan (el hígado vuelve en la fase 3). La parrilla costal (decisión 16)
 * es propia: usa `wallArc` de la pared, así que va tras ella. La pared torácica por región (decisión 17) va antes que la
 * pared: sus capas (`wallLayersAt`, `wallTotalAt`) las lee la pared.
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
  {
    id: 'chestWall',
    exports: chestWall,
    glsl: chestWall.CHEST_WALL_GLSL,
    gpuOnly: {
      cwTexel: 'lectura de un téxel de la tabla interpolado entre dos columnas (en TS, `texelAt`, privada)',
      cwColumn: 'columna y fracción de la tabla para |u| (en TS, `column`, privada)',
    },
  },
  {
    id: 'wall',
    exports: wall,
    glsl: wall.WALL_GLSL,
    gpuOnly: { wallDepthsOf: 'gemela: `wallDepths` con las capas ya leídas (su cuarto argumento, `L`)' },
  },
  { id: 'ribcage', exports: ribcage, glsl: ribcage.RIBCAGE_GLSL },
  { id: 'lungCurtain', exports: lungCurtain, glsl: lungCurtain.LUNG_CURTAIN_GLSL },
];
