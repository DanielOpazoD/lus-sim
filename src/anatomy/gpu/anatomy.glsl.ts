/**
 * Fragmento GLSL compartido: la misma anatomía implícita que `anatomy/scene.ts`,
 * evaluada en la GPU a partir de los mismos datos declarativos. Las primitivas viajan en
 * uniformes y la tabla de la compresión de la sonda en una textura de datos RGBA32F (`uSceneTex`,
 * decisión 24). Mantener las dos implementaciones sincronizadas es una regla del proyecto (ver
 * docs/DECISIONS.md); el test `anatomy.test.ts` fija la versión TS.
 *
 * lus-sim (decisión 12): la escena del tórax del paso A (pared, costillas, columna, cortina, pulmón y
 * cúpulas), con el mismo orden de clasificación que `AnatomyScene.classify`: pared → costillas → columna →
 * cortina pulmonar → tórax/diafragma → el «resto» bajo el diafragma. Sin los tubos (vasos y conductos) ni su
 * lista por cuadro, la aurícula, la vesícula, los riñones, el hígado, sus ligamentos ni el gas intestinal de
 * VExUS. Las costillas son la parrilla costal del adulto promedio (decisión 16, `organs/ribcage.ts`).
 *
 * Disposición de la textura (índice lineal i → texel (i % SCENE_TEX_W, i / SCENE_TEX_W)):
 *   tabla de la compresión de la sonda desde COMPRESSION_BASE (decisión 63, `anatomy/compression.ts`): un téxel
 *   por nodo de la cara, (s₀ mm, s_D mm, D mm, R mm);
 *   tabla de las alturas de las costillas desde RIB_TABLE_BASE (decisión 16): por lado y columna de |u|, tres téxeles
 *   con las z de las líneas medias de las costillas 1–4, 5–8 y 9–12;
 *   tabla de la pared torácica desde CHEST_WALL_BASE (decisión 17, `organs/chestWall.ts`): por columna de |u|, tres téxeles
 *   (grosores alto y bajo, reborde costal, peso inspiratorio; y las capas altas y bajas);
 *   tabla de los bordes del pulmón desde LUNG_BORDER_BASE (decisión 18, `organs/lungBorder.ts`): por columna de |u|, un
 *   téxel (borde del pulmón en FRC, reflexión pleural, grosor de la pared en el borde, altura a la que se apaga el
 *   deslizamiento: decisión 19)
 */
import { BOWEL_BD_CAP_MM, DIAPHRAGM_THICKNESS_MM, TISSUE_GLSL_NAME } from '../tissues';
import {
  FACE_GRADIENT_EPS_MM,
  FIRST_WALL_INTERFACE,
  INTERFACE_COUNT,
  INTERFACE_GLSL_NAME,
  LAST_TUBE_INTERFACE,
  LAST_WALL_INTERFACE,
} from '../interfaces';
import { COMPRESSION_GLSL, PROBE_COMPRESSION } from '../compression';
import { ORGAN_MODULES } from '../organs';
import { RIB_TABLE_BASE } from '../organs/ribcage';
import { LUNG_BORDER_BASE, LUNG_BORDER_TEXELS } from '../organs/lungBorder';
import { MAX_RIBS, SCENE_UNIFORMS_GLSL } from './sceneUniforms';

export const SCENE_TEX_W = 256;
/** Primer téxel de la tabla de compresión de la sonda (decisión 63): sin tubos, el primero de la textura. */
export const COMPRESSION_BASE = 0;
if (RIB_TABLE_BASE < COMPRESSION_BASE + PROBE_COMPRESSION.nodes) throw new Error('la tabla costal pisa la de la compresión');
export const SCENE_TEX_H = Math.ceil((LUNG_BORDER_BASE + LUNG_BORDER_TEXELS) / SCENE_TEX_W);
export { MAX_RIBS } from './sceneUniforms';

const TISSUE_DEFINES = Object.entries(TISSUE_GLSL_NAME)
  .map(([index, name]) => `#define ${name} ${index}`)
  .join('\n');
/** Caras de interfaz (`anatomy/interfaces.ts`): `#define IF_… índice`. */
const INTERFACE_DEFINES = Object.entries(INTERFACE_GLSL_NAME)
  .map(([index, name]) => `#define ${name} ${index}`)
  .join('\n');

export const ANATOMY_GLSL = /* glsl */ `
#define SCENE_TEX_W ${SCENE_TEX_W}
#define COMP_BASE ${COMPRESSION_BASE}
#define MAX_RIBS ${MAX_RIBS}
${TISSUE_DEFINES}
${INTERFACE_DEFINES}
#define IFACE_COUNT ${INTERFACE_COUNT}
#define IF_LAST_TUBE ${LAST_TUBE_INTERFACE}
#define IF_FIRST_WALL ${FIRST_WALL_INTERFACE}
#define IF_LAST_WALL ${LAST_WALL_INTERFACE}
#define FACE_GRAD_EPS ${FACE_GRADIENT_EPS_MM.toFixed(3)}
#define DIAPHRAGM_MM ${DIAPHRAGM_THICKNESS_MM.toFixed(3)}
#define BOWEL_BD_CAP_MM ${BOWEL_BD_CAP_MM.toFixed(3)}

${SCENE_UNIFORMS_GLSL}

struct Cls {
  int tissue;
  float bd;       // distancia a la interfaz (mm)
  vec3 n;         // normal de la interfaz; en los tubos, el gradiente de su distancia SIN normalizar
  int iface;      // cara que dibuja esta muestra (Interface, decisión 57) o IF_NONE
  float ifd;      // valor (mm) de la distancia de esa cara en la muestra; 1e3 sin cara. Por la normal es
                  // ifd/|∇| (faceGradient): la VCI elíptica tiene |∇| = 1/apScale en sus paredes AP
  int vessel;     // índice de tubo o -1
  float rho;      // fracción radial
  vec3 tangent;   // eje del tubo o, en la cara de una costilla, de la costilla (decisión 62)
  float kc;       // curvatura circunferencial (1/mm) de la cara de un tubo (tubeQuery) o de la sección costal
  float uRef;
  float rRef;
  float profN;
};

vec4 sceneTexel(int i) { return texelFetch(uSceneTex, ivec2(i % SCENE_TEX_W, i / SCENE_TEX_W), 0); }

float torsoDepth(vec3 p) {
  float u = p.x / uTorso.x;
  float v = p.y / uTorso.y;
  float rho = sqrt(u * u + v * v);
  float localR = rho > 0.0 ? length(p.xy) / rho : min(uTorso.x, uTorso.y);
  return (rho - 1.0) * localR;
}

vec3 torsoNormal(vec3 p) {
  vec2 n = vec2(p.x / (uTorso.x * uTorso.x), p.y / (uTorso.y * uTorso.y));
  float l = length(n);
  return l > 0.0 ? vec3(n / l, 0.0) : vec3(0.0, 1.0, 0.0);
}

float wallTotalMm(vec3 m);
float heartStillWeight(vec3 m);
float respWeight(vec3 m) {
  // lus-sim (decisión 17): más hondo que la pared más gruesa (uChestWall.w) + 25 mm el peso de la pared es 1 sin leerla
  float d = -torsoDepth(m);
  float inside = d >= uChestWall.w + 25.0 ? 25.0 : d - wallTotalMm(m);
  float wWall = smoothstep(0.0, 25.0, inside);
  float dSpine = length(m.xy - uSpine.xy);
  float wSpine = smoothstep(uSpine.z + 5.0, uSpine.z + 35.0, dSpine);
  // lus-sim (decisión 18): el corazón y su ventana no respiran
  return wWall * wSpine * heartStillWeight(m);
}

vec3 respDisplacement(vec3 m) {
  return uResp.yzw * (uResp.x * respWeight(m));
}

${COMPRESSION_GLSL}
// Mundo → material: la compresión de la sonda (decisión 63) y después la respiración (deformation.ts)
vec3 toMaterial(vec3 p) {
  vec3 q = uncompress(p);
  vec3 m = q;
  for (int i = 0; i < 2; i++) m = q - respDisplacement(m);
  return m;
}

float domeLift(float x, float y, vec4 dome) {
  float u = (x - dome.x) / dome.z;
  float v = (y - dome.y) / dome.w;
  float rho2 = u * u + v * v;
  return sqrt(max(0.0, 1.0 - rho2 * rho2));
}

// Altura del diafragma: inserción costal (0 en el xifoides, −50 en flancos y espalda) +
// la hemicúpula más alta (misma construcción que primitives.diaphragmHeight); lus-sim (decisión 18): junto a la pared,
// la rampa al borde del pulmón (domeRim, organs/lungBorder.ts)
float domeRim(float x, float y, float D);
float domeHeight(float x, float y) {
  float phi = atan(y / uTorso.y, x / uTorso.x);
  float edge = uDiaphragm.z + uDiaphragm.w * pow(max(0.0, sin(phi)), 1.5);
  float zr = edge + max(0.0, uDiaphragm.x - edge) * domeLift(x, y, uDomeR);
  float zl = edge + max(0.0, uDiaphragm.y - edge) * domeLift(x, y, uDomeL);
  return domeRim(x, y, max(edge, max(zr, zl)));
}

// Distancia con signo al diafragma (negativa en el tórax) y normal hacia el abdomen.
float sdDome(vec3 p, out vec3 n) {
  float zd = domeHeight(p.x, p.y);
  float h = 0.5;
  float gx = (domeHeight(p.x + h, p.y) - domeHeight(p.x - h, p.y)) / (2.0 * h);
  float gy = (domeHeight(p.x, p.y + h) - domeHeight(p.x, p.y - h)) / (2.0 * h);
  float slope = sqrt(1.0 + gx * gx + gy * gy);
  n = normalize(vec3(gx, gy, -1.0)); // apunta hacia abajo (hacia el hígado)
  return (zd - p.z) / slope;
}

// Módulos de órgano (anatomy/organs/*): gemelos GLSL de sus funciones TS
${ORGAN_MODULES.map((o) => o.glsl).join('\n')}

// Profundidad bajo la cara interna de la pared (mm; 0 en la pleura parietal). Gemelo: AnatomyScene.insideWallMm
float insideWallMm(vec3 m) { return -torsoDepth(m) - wallTotalMm(m); }

// La pared de classify: fuera del torso (aire), piel, costillas y las capas de la pared con sus caras (grasa
// subcutánea, músculo y grasa preperitoneal, decisión 62). true si la muestra queda decidida (en c); si no,
// depth y tn (profundidad y normal del torso) sirven al resto de classifyWith. La serie de la pleura (decisión
// 61) remuestrea la pared solo con ella: sin órganos ni tubos. Gemelo: la classifyWall privada de AnatomyScene
bool classifyWall(vec3 m, out Cls c, out float depth, out vec3 tn, out float wall, out float u) {
  c.tissue = T_AIR; c.bd = 1e3; c.n = vec3(0.0, 1.0, 0.0); c.iface = IF_NONE; c.ifd = 1e3; c.vessel = -1;
  c.rho = 10.0; c.tangent = vec3(0.0, 0.0, 1.0); c.kc = 0.0; c.uRef = 0.0; c.rRef = 1.0; c.profN = 2.0;
  depth = torsoDepth(m);
  tn = vec3(0.0, 1.0, 0.0);
  wall = 0.0;
  u = 0.0;
  if (m.z < uTorso.z || m.z > uTorso.w || depth > 0.0) return true;
  // lus-sim (decisión 17): la pared por región en el (u, z) de la muestra (organs/chestWall.ts); sus capas, solo dentro. Más
  // hondo que la pared más gruesa (uChestWall.w) más lo que miran la cortina (3 mm), el «resto» (su tope, con la ZOA más
  // gruesa, decisión 18) y el tapón de la ventana cardiaca (su fondo) no hace falta leerla: el grosor máximo da lo mismo en
  // todo lo que sigue (la muestra no está en la pared, ni en la lámina, ni en la ZOA, ni en el tapón, y la distancia del
  // «resto» a la pared pasa de su tope)
  float d = -depth;
  float far = uChestWall.w + max(max(uCurtain.y, BOWEL_BD_CAP_MM + LB_ZOA_TLC + 1.0), uHeartC.w);
  u = d < far ? wallArc(m) : 0.0;
  wall = d < far ? wallTotalAt(u, m.z) : uChestWall.w;
  vec4 wx = vec4(0.0);
  vec4 wl = vec4(0.0);
  if (d < wall) wl = wallLayersAt(u, m.z, wx);
  float skin = wl.x;
  tn = torsoNormal(m);
  // Capas de la pared (decisión 62, organs/wall.ts): cada muestra dibuja la cara de su capa más cercana
  if (d < skin) { c.tissue = T_SKIN; c.bd = skin - d; c.n = tn; c.iface = IF_SKIN_FAT; c.ifd = skin - d; return true; }
  // La parrilla costal (lus-sim, decisión 16, organs/ribcage.ts), antes de la grasa subcutánea donde puede llegar (la
  // grasa no la corta): el esternón y las costillas del lado de la muestra; el hueso más cercano da la cortical al tejido
  // blando de fuera, el cartílago su pericondrio
  float inD; bool cart; float ribD; int ribI; float ribAny;
  int ri = ribScan(m, d, u, wall, inD, cart, ribD, ribI, ribAny);
  if (ri >= 0) {
    c.tissue = cart ? T_CARTILAGE : T_BONE; c.bd = -inD;
    c.n = normalize(vec3(-tn.xy * sign(d - ribCenterDepth(m)), 0.0) + vec3(0.0, 0.0, 1e-4));
    if (cart) { c.iface = IF_PERICHONDRIUM; c.ifd = -inD; c.tangent = ribTangent(m, ri); c.kc = ribCurvature(m, ri); }
    return true;
  }
  if (d < wall) {
    // debajo de la fascia, músculo hasta la transversalis y la grasa preperitoneal hasta el peritoneo
    vec4 wd = wallDepthsOf(u, m.z, wl, wx.z);
    c.tissue = d < wd.y ? T_FAT : (d < wd.z ? T_MUSCLE : T_FAT);
    c.bd = d < wd.y ? min(d - skin, wd.y - d) : (d < wd.z ? min(d - wd.y, wd.z - d) : min(d - wd.z, wall - d));
    c.bd = min(c.bd, ribAny / 1.1);
    c.n = tn;
    vec2 wf = wallFace(d, u, m.z, ribD);
    c.iface = int(wf.x + 0.5); c.ifd = wf.y;
    if (c.iface == IF_RIB) { c.tangent = ribTangent(m, ribI); c.kc = ribCurvature(m, ribI); }
    return true;
  }
  return false;
}

// withCurtain = false: sin la cortina (decisión 61), lo de detrás de la lámina; gemelo classify(m, cal, false)
Cls classifyWith(vec3 m, bool withCurtain) {
  Cls c;
  float depth;
  vec3 tn;
  float wall;
  float u;
  if (classifyWall(m, c, depth, tn, wall, u)) return c;
  // Columna
  float dBody = length(m.xy - uSpine.xy) - uSpine.z;
  float ax = abs(m.x - uSpine.x) - uSpineArch.x;
  float acy = 0.5 * (uSpineArch.y + uSpineArch.z);
  float ay = abs(m.y - acy) - 0.5 * (uSpineArch.z - uSpineArch.y);
  float dArch = length(max(vec2(ax, ay), 0.0)) + min(max(ax, ay), 0.0);
  float dSpine = min(dBody, dArch);
  if (dSpine < 0.0) {
    c.tissue = T_VERTEBRA; c.bd = -dSpine;
    c.n = dBody < dArch ? normalize(vec3(m.xy - uSpine.xy, 0.0)) : (ax > ay ? vec3(sign(m.x - uSpine.x), 0.0, 0.0) : vec3(0.0, sign(m.y - acy), 0.0));
    return c;
  }
  // lus-sim (decisión 18): el arco de la muestra (el de classifyWall: lo calcula donde lo miran el tapón de la ventana
  // cardiaca, la lámina de la cortina, la ZOA y la cota de su cara para el «resto»; más hondo, ninguno depende de él)
  float inside = -depth - wall;
  // El corazón y el tapón de la ventana (organs/heart.ts), sobre la cúpula (se apoya en ella)
  bool blood;
  float dHeart = heartDistance(m, inside, u, blood);
  if (dHeart >= 0.0) {
    vec3 hn;
    float dHeartDome = sdDome(m, hn);
    if (dHeartDome < 0.0) {
      // la cúpula corta el corazón: su cara inferior es pared (la cavidad no llega al diafragma)
      float floorD = -dHeartDome - HEART_SIDE_WALL;
      if (blood && floorD > 0.0) { c.tissue = T_BLOOD; c.bd = min(dHeart, floorD); c.n = tn; return c; }
      c.tissue = T_MYOCARDIUM; c.bd = blood ? min(-floorD, -dHeartDome) : min(min(dHeart, -dHeartDome), abs(floorD)); c.n = tn;
      return c;
    }
  }
  float clear = heartClearance(m, inside, u);
  // Cortina pulmonar (módulo de órgano: anatomy/organs/lungCurtain.ts; decisión 18, los dos hemitórax)
  if (withCurtain) {
    float dCurtain = lungCurtainDistance(m, inside, u);
    if (dCurtain >= 0.0) { c.tissue = T_LUNG; c.bd = min(dCurtain, clear); c.n = torsoNormal(m); return c; }
  }
  // La zona de aposición (decisión 18, organs/lungBorder.ts): el diafragma contra la pared bajo el borde del pulmón; su
  // mitad de dentro dibuja la cara abdominal con la normal de la pared (c.kc = 1: faceGradient la distingue de la cúpula)
  float dZoa = zoaDistance(m, inside, u);
  if (dZoa >= 0.0) {
    float tz = zoaThicknessMm(uResp.x);
    c.tissue = T_DIAPHRAGM; c.bd = min(dZoa, clear); c.n = tn; c.kc = 1.0;
    if (inside > 0.5 * tz) { c.iface = IF_DIAPHRAGM_LIVER; c.ifd = tz - inside; }
    return c;
  }
  // Tórax y diafragma (lus-sim, decisión 12: sin vasos, conductos ni aurícula de VExUS entre la cortina y la cúpula); por
  // encima de la cúpula más alta (uCurtain.w) más el tope de la distancia del pulmón, pulmón sin evaluarla (decisión 18)
  if (m.z > uCurtain.w + LB_LUNG_CAP) { c.tissue = T_LUNG; c.bd = min(LB_LUNG_CAP, clear); c.n = vec3(0.0, 0.0, 1.0); return c; }
  vec3 dn;
  float dDome = sdDome(m, dn);
  if (dDome < 0.0) { c.tissue = T_LUNG; c.bd = min(min(-dDome, LB_LUNG_CAP), clear); c.n = dn; return c; }
  if (dDome < DIAPHRAGM_MM) {
    c.tissue = T_DIAPHRAGM; c.bd = min(dDome, DIAPHRAGM_MM - dDome); c.n = dn;
    // la mitad abdominal dibuja la cara hepática; la pleural la dibuja el espejo exacto de la pasada A
    if (dDome > 0.5 * DIAPHRAGM_MM) { c.iface = IF_DIAPHRAGM_LIVER; c.ifd = DIAPHRAGM_MM - dDome; }
    return c;
  }
  // Bajo el diafragma, el «resto» (abdomen-generic-tissue): sin vesícula, riñones, hígado ni gas. Su distancia a
  // la frontera es la de las interfaces que ganan antes (misma fórmula que scene.classify)
  float bdBowel = min(min(min(BOWEL_BD_CAP_MM, dDome - DIAPHRAGM_MM), inside), min(zoaGap(m, inside, u), clear));
  c.tissue = T_BOWEL; c.bd = max(bdBowel, 0.0); c.n = tn;
  return c;
}

Cls classify(vec3 m) { return classifyWith(m, true); }

// Distancia de la cúpula sin su normal (el gradiente numérico de faceGradient)
float domeSd(vec3 m) { vec3 n; return sdDome(m, n); }
// Distancia a la cara abdominal de la ZOA, positiva hacia el abdomen (decisión 18). Gemelo: faceSdf(m, 'zoa')
float zoaSd(vec3 m) { return insideWallMm(m) - zoaThicknessMm(uResp.x); }

// Gradiente de la distancia de la cara que dibuja una muestra (decisión 57): xyz es su dirección, la
// normal de la cara, y w su norma, que pasa ifd (el valor de esa distancia) a distancia por la normal,
// ifd/w. En el diafragma, diferencias centrales de FACE_GRAD_EPS mm (las del banco) de la misma distancia que
// decide la clasificación (la norma se aparta de 1 lejos de la pleura); en las caras de la pared y de las costillas,
// la de su capa o su costilla (decisión 62). Cuesta 6–8 evaluaciones: la pasada B solo lo pide en las muestras al
// alcance de su cara. lus-sim (decisión 12): sin las ramas de la cápsula hepática, el riñón, la grasa perirrenal
// ni la vesícula. Gemelo TS: AnatomyScene.faceGradient.
vec4 faceGradient(Cls c, vec3 m) {
  vec2 h = vec2(FACE_GRAD_EPS, 0.0);
  vec3 g;
  if (c.tissue == T_DIAPHRAGM && c.kc > 0.5) {
    // la cara abdominal de la ZOA (decisión 18): la de su lámina, paralela a la pared
    g = vec3(zoaSd(m + h.xyy) - zoaSd(m - h.xyy),
             zoaSd(m + h.yxy) - zoaSd(m - h.yxy),
             zoaSd(m + h.yyx) - zoaSd(m - h.yyx));
  } else if (c.tissue == T_DIAPHRAGM) {
    g = vec3(domeSd(m + h.xyy) - domeSd(m - h.xyy),
             domeSd(m + h.yxy) - domeSd(m - h.yxy),
             domeSd(m + h.yyx) - domeSd(m - h.yyx));
  } else if (c.iface >= IF_FIRST_WALL && c.iface <= IF_LAST_WALL) {
    // capas de la pared (decisión 62): la distancia de su capa (wallFaceSd)
    g = vec3(wallFaceSd(m + h.xyy, c.iface) - wallFaceSd(m - h.xyy, c.iface),
             wallFaceSd(m + h.yxy, c.iface) - wallFaceSd(m - h.yxy, c.iface),
             wallFaceSd(m + h.yyx, c.iface) - wallFaceSd(m - h.yyx, c.iface));
  } else if (c.iface == IF_RIB || c.iface == IF_PERICHONDRIUM) {
    // cortical o pericondrio: la distancia de la costilla (o del esternón) cuya cara es, la de la clasificación (faceRib,
    // organs/ribcage.ts: la que contiene el punto o el hueso más cercano)
    int k = faceRib(m);
    g = vec3(ribSd(m + h.xyy, k) - ribSd(m - h.xyy, k),
             ribSd(m + h.yxy, k) - ribSd(m - h.yxy, k),
             ribSd(m + h.yyx, k) - ribSd(m - h.yyx, k));
  } else {
    // tejidos sin cara (normal unitaria)
    float l = length(c.n);
    return l > 0.0 ? vec4(c.n / l, l) : vec4(0.0, 1.0, 0.0, 1.0);
  }
  float lg = length(g);
  if (lg > 0.0) return vec4(g / lg, lg / (2.0 * FACE_GRAD_EPS));
  float ln = length(c.n);
  return ln > 0.0 ? vec4(c.n / ln, 1.0) : vec4(0.0, 1.0, 0.0, 1.0);
}

// Velocidad de la sangre (mm/s, marco material) para una clasificación de sangre.
// Velocidad media UNIFORME a lo largo del vaso (decisión 6, misma ley que
// AnatomyQuery.classifyWorld): Q = cte en un tubo afilado dispararía la periferia.
// lus-sim (decisión 12): el tórax no tiene vasos (c.vessel siempre −1): da siempre 0, como
// WorldQuery.bloodVelocity es siempre null en TS; se conserva la función para la consulta de la e2e.
vec3 bloodVelocity(Cls c) {
  if (c.vessel < 0) return vec3(0.0);
  float uLocal = c.uRef;
  float n = c.profN;
  float rho = min(1.0, c.rho);
  float profile = ((n + 2.0) / n) * (1.0 - pow(rho, n));
  return c.tangent * (uLocal * profile);
}

// Hash espacial → campo complejo de dispersores persistente en coordenadas materiales.
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

vec2 latticeValue(vec3 cell, float salt) {
  float a = hash13(cell + vec3(salt, 0.0, 0.0));
  float b = hash13(cell + vec3(0.0, salt + 17.1, 0.0));
  // Gaussiana aproximada (Box–Muller) para estadística de speckle plenamente desarrollada.
  float r = sqrt(-2.0 * log(max(1e-6, a)));
  float ph = 6.2831853 * b;
  return r * vec2(cos(ph), sin(ph));
}

// Interpolación trilineal del campo complejo en una retícula de paso h (mm), con fundido
// smoothstep (derivada nula en los nodos, como el ruido de valor clásico).
vec2 scattererField(vec3 m, float h, float salt) {
  vec3 q = m / h;
  vec3 c0 = floor(q);
  vec3 f = q - c0;
  f = f * f * (3.0 - 2.0 * f);
  vec2 v000 = latticeValue(c0 + vec3(0,0,0), salt);
  vec2 v100 = latticeValue(c0 + vec3(1,0,0), salt);
  vec2 v010 = latticeValue(c0 + vec3(0,1,0), salt);
  vec2 v110 = latticeValue(c0 + vec3(1,1,0), salt);
  vec2 v001 = latticeValue(c0 + vec3(0,0,1), salt);
  vec2 v101 = latticeValue(c0 + vec3(1,0,1), salt);
  vec2 v011 = latticeValue(c0 + vec3(0,1,1), salt);
  vec2 v111 = latticeValue(c0 + vec3(1,1,1), salt);
  vec2 x00 = mix(v000, v100, f.x);
  vec2 x10 = mix(v010, v110, f.x);
  vec2 x01 = mix(v001, v101, f.x);
  vec2 x11 = mix(v011, v111, f.x);
  vec2 y0 = mix(x00, x10, f.y);
  vec2 y1 = mix(x01, x11, f.y);
  return mix(y0, y1, f.z);
}
`;
