import * as chestWall from './chestWall';
import * as heart from './heart';
import * as lungApex from './lungApex';
import * as lungBorder from './lungBorder';
import * as lungCurtain from './lungCurtain';
import * as kidney from './kidney';
import * as liver from './liver';
import * as lungPulse from './lungPulse';
import * as retroperitoneum from './retroperitoneum';
import * as ribcage from './ribcage';
import * as spine from './spine';
import * as spleen from './spleen';
import * as stomach from './stomach';
import * as supraclavicular from './supraclavicular';
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
 * pared: sus capas (`wallLayersAt`, `wallTotalAt`) las lee la pared. Los bordes del pulmón (decisión 18) usan las columnas de
 * la pared torácica y `wallArc`, y la cortina los lee; el corazón (decisión 18) va antes que la cortina (la ventana cardiaca
 * no tiene pleura con pulmón).
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
  // lus-sim (cobertura torácica): la cúpula pleural, que la pared torácica suma a su grosor
  { id: 'lungApex', exports: lungApex, glsl: lungApex.LUNG_APEX_GLSL },
  // lus-sim (decisión 50): la fosa supraclavicular, que la pared torácica resta a su grosor y cuyas capas del cuello lee
  { id: 'supraclavicular', exports: supraclavicular, glsl: supraclavicular.SUPRACLAVICULAR_GLSL },
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
  // lus-sim (decisión 29): las apófisis espinosas, que la pared y la columna leen
  { id: 'spine', exports: spine, glsl: spine.SPINE_GLSL },
  {
    id: 'lungBorder',
    exports: lungBorder,
    glsl: lungBorder.LUNG_BORDER_GLSL,
    gpuOnly: { domeRim: 'gemela: `diaphragmRim` (la tabla y el tronco van en argumentos; la GPU los lee de uniforms)' },
  },
  { id: 'heart', exports: heart, glsl: heart.HEART_GLSL },
  // lus-sim (decisión 32): el pulso pulmonar, el deslizamiento del pulmón junto al corazón con el latido (usa el corazón)
  { id: 'lungPulse', exports: lungPulse, glsl: lungPulse.LUNG_PULSE_GLSL },
  { id: 'lungCurtain', exports: lungCurtain, glsl: lungCurtain.LUNG_CURTAIN_GLSL },
  // lus-sim (decisión 43): los riñones (portados de VExUS), cuya grasa marca la impresión renal del hígado y del bazo; su GLSL
  // define smoothMin, smoothMax y sdEllipsoidLocal, que usan los de después
  { id: 'kidney', exports: kidney, glsl: kidney.KIDNEY_GLSL },
  // lus-sim (decisión 43): el retroperitoneo de VExUS (psoas, cuadrado lumbar y grasa), el lecho del riñón (usa sdRoundCone)
  {
    id: 'retroperitoneum',
    exports: retroperitoneum,
    glsl: retroperitoneum.RETROPERITONEUM_GLSL,
    gpuOnly: {
      retroBack: 'gemela: `RetroFrame.back` (−b del tronco, que la GPU lee de uTorso)',
      retroFront: 'gemela: `RetroFrame.front` (de la y de los centros de los riñones, `kidneyCenter`)',
    },
  },
  // lus-sim (decisión 37): el hígado (portado de VExUS) y el bazo
  { id: 'liver', exports: liver, glsl: liver.LIVER_GLSL },
  { id: 'spleen', exports: spleen, glsl: spleen.SPLEEN_GLSL },
  // lus-sim (decisión 43): el estómago, en el espacio de Traube
  { id: 'stomach', exports: stomach, glsl: stomach.STOMACH_GLSL },
];
