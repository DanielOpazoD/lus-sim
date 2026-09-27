import type { Vec3 } from '../../core/vec3';

/**
 * Cortina pulmonar (decisión 43) como módulo de órgano (decisión 46): el pulmón entra en el seno costofrénico como una
 * lámina de 3 mm pegada a la cara interna de la pared, desde el borde del pulmón en FRC hasta él menos el descenso del
 * diafragma, sin pasar de la reflexión pleural. En inspiración baja y tapa la parte alta del diafragma y del abdomen. Su
 * cara superior es la pleura parietal: la imagen la dibuja con su eco, la serie de reverberaciones de la pared y el
 * deslizamiento (decisión 61, `ultrasound/pleura.ts`), no con el espejo del diafragma.
 *
 * lus-sim (decisión 18, paso C3): los dos hemitórax, alrededor de todo el tronco, con el borde de cada columna de |u| de
 * `organs/lungBorder.ts` (`lungEdgeZ`); en VExUS, una lámina del receso lateral y posterior derecho (x ≤ −45, y ≤ 40) con
 * el borde en z = 18 y la huella de la pleura hasta la línea media (decisión 71). La ventana cardiaca no tiene pulmón: el
 * corazón, que se clasifica antes (`organs/heart.ts`).
 * TS y GLSL (uniform `uCurtain` del esquema único) viven aquí juntos.
 */
export const LUNG_CURTAIN = { thicknessMm: 3 } as const;

/**
 * Distancia a la frontera si el punto está dentro de la lámina, `null` si no. `insideWallMm` es la profundidad bajo la cara
 * interna de la pared; `edgeZ`, el borde caudal del pulmón en su columna (`lungEdgeZ`, con el descenso del diafragma).
 */
export function lungCurtainDistance(m: Vec3, insideWallMm: number, edgeZ: number): number | null {
  const c = LUNG_CURTAIN;
  if (insideWallMm >= c.thicknessMm || m[2] < edgeZ) return null;
  return Math.min(insideWallMm, c.thicknessMm - insideWallMm, m[2] - edgeZ);
}

/**
 * Pulmón de la cortina (decisión 61): un punto que `classify` da como pulmón es de la lámina bajo la pared y no del tórax
 * bajo la cúpula. La cortina se mira antes que la cúpula en `classify`, así que basta con que el punto esté en la lámina.
 * Solo TS (pruebas y banco): la GPU usa `inLungRecess`.
 */
export function inLungCurtain(m: Vec3, insideWallMm: number, edgeZ: number): boolean {
  return lungCurtainDistance(m, insideWallMm, edgeZ) !== null;
}

/**
 * Pulmón que toca la pared (decisión 61): un punto que `classify` da como pulmón y que está a menos del espesor de la
 * cortina bajo la cara interna de la pared: el de la lámina o el del tórax por encima del borde. Allí empieza la pleura
 * parietal (A0). lus-sim (decisión 18): en los dos hemitórax (en VExUS, hasta la línea media, decisión 71).
 */
export function inLungRecess(_m: Vec3, insideWallMm: number): boolean {
  return insideWallMm < LUNG_CURTAIN.thicknessMm;
}

/**
 * Distancia con signo (mm) de un punto de la cara interna de la pared al borde caudal del pulmón que la toca, positiva hacia
 * el pulmón: z − `edgeZ` (el de su columna con el descenso del diafragma; la cúpula toca la pared en el borde de FRC, más
 * arriba). La pasada A0 la evalúa en el cruce de la pleura de cada línea: el borde blando de la cortina (decisión 61) sale
 * de ella. La ventana cardiaca la resta la escena (`AnatomyScene.lungEdgeMm`).
 */
export function lungCurtainEdgeMm(m: Vec3, edgeZ: number): number {
  return m[2] - edgeZ;
}

/**
 * Gemelo GLSL: `lungCurtainDistance` devuelve la distancia a la frontera (≥ 0) o −1 fuera de la cortina; `u` es el arco de
 * la muestra (`wallArc`). `lungCurtainEdgeMm` da −1e3 en la ventana cardiaca (`heartAtWall`, `organs/heart.ts`).
 */
export const LUNG_CURTAIN_GLSL = /* glsl */ `
float lungCurtainDistance(vec3 m, float insideWall, float u) {
  if (insideWall >= uCurtain.y) return -1.0;
  float edge = lungEdgeZ(u);
  if (m.z < edge) return -1.0;
  return min(min(insideWall, uCurtain.y - insideWall), m.z - edge);
}
bool inLungRecess(vec3 m, float insideWall) { return insideWall < uCurtain.y; }
float lungCurtainEdgeMm(vec3 m) {
  if (heartAtWall(m)) return -1e3;
  return m.z - lungEdgeZ(wallArc(m));
}
`;
