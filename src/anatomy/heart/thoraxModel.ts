/**
 * La columna posterior del tórax de EchoTwin (lus-sim, decisión 49; adaptado de EchoTwin, `src/simulator/anatomy/thoraxModel.ts`,
 * origen y commit en docs/PROVENANCE.md): solo las constantes de la aorta descendente y del cuerpo vertebral que el corazón lee
 * para no meterse en ellas (anclajes y saco pericárdico, decisión 273 de EchoTwin). El tórax de EchoTwin (mapa de alturas
 * anterior, costillas, pulmones) no se porta: el de lus-sim es otro (decisiones 16–18). Marco del torso de EchoTwin (cm): x
 * izquierda, y superior, z anterior, origen en la piel sobre el esternón en el 4.º EIC (`core/units.ts`, `lusToEchoTwinCm`).
 */
/**
 * Descending thoracic aorta (decision 213): a vertical tube left-anterolateral to the vertebral body, behind the left atrium
 * near the atrioventricular groove, where the parasternal long axis shows it in cross-section (Goldstein et al., JASE
 * 2015;28:119-182) and against the posterior atrial wall (MRI, 2.8 mm between the inner walls, Hopman et al., Radiol
 * Cardiothorac Imaging 2022;4:e210192). Lumen 2.0 cm (MRI at the pulmonary artery, men 20.6 and women 18.9 mm, Davis et
 * al., JCMR 2014;16:9) and a 2 mm wall. It used to lie 1 cm right of the midline with a 2.2 cm lumen, and the long axis cut
 * it behind the upper atrium on the side of the aortic root, 14 cm deep and 2.6 × 3.8 cm across.
 */
export const DESC_AORTA_X = 2.6;
export const DESC_AORTA_Z = -14.5;
export const DESC_AORTA_R = 1.0;
export const DESC_AORTA_WALL = 0.2;
/**
 * Outer radius (cm) of the descending aorta at the largest systolic distension the model gives it (decision 272, the
 * area strain of the twenties): what the heart keeps clear of (decision 273).
 */
export const DESC_AORTA_MAX_OUTER_R = DESC_AORTA_R * Math.sqrt(1.33) + DESC_AORTA_WALL;
/** Vertebral body: a vertical cylinder in the midline. */
export const SPINE_Z = -17.3;
export const SPINE_R = 2.2;
