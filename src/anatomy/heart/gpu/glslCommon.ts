import { Structure, Tissue } from '../tissue';
import { paramDefinesGlsl } from './paramLayout';
import { GLSL_GENERATED } from './glslGenerated';
import {
  DESC_AORTA_MAX_OUTER_R,
  SPINE_R,
} from '../thoraxModel';
import {
  RV_BODY_RADIAL_CONTRACTION,
  RV_INFLOW_REACH_CM,
  RV_HINGE_CM,
  RV_HINGE_PLATEAU_CM,
  RV_HINGE_FADE_RAD,
} from '../rv';
import { TV_SYSTOLIC_SHORTENING } from '../valveSkirt';
import {
  LA_WALL_CM,
  LAA_WALL_CM,
  OBLIQUE_SINUS_EFFUSION_CM,
  OBLIQUE_SINUS_TAPER_CM,
  PERICARDIUM_CM,
} from '../classify/pericardium';
import { LV_NECK_ZETA } from '../lvShape';
import {
  SEPTAL_CREST_AZ,
  SEPTAL_CREST_HALF_WIDTH,
  SEPTAL_CREST_Z_CM,
} from '../lvWall';

const gf = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`);

/** GLSL defines for the tissue and structure ids used by the shaders (kept in sync with tissue.ts). */
export function enumDefinesGlsl(): string {
  const T: Record<string, number> = {
    T_NONE: Tissue.None,
    T_BLOOD: Tissue.Blood,
    T_MYO: Tissue.Myocardium,
    T_VALVE: Tissue.Valve,
    T_PERI: Tissue.Pericardium,
    T_FAT: Tissue.Fat,
    T_MUSCLE: Tissue.Muscle,
    T_BONE: Tissue.Bone,
    T_CART: Tissue.Cartilage,
    T_LUNG: Tissue.Lung,
    T_FLUID: Tissue.Fluid,
    T_VESSEL: Tissue.VesselWall,
    T_CALC: Tissue.Calcium,
    T_SKIN: Tissue.Skin,
    T_LIVER: Tissue.Liver,
    T_SPINE: Tissue.Spine,
    T_FIBROUS: Tissue.Fibrous,
    T_CHORDAE: Tissue.Chordae,
  };
  const S: Record<string, number> = {
    S_NONE: Structure.None,
    S_LV_CAV: Structure.LvCavity,
    S_LV_SEPT: Structure.LvWallSeptal,
    S_LV_LAT: Structure.LvWallLateral,
    S_LV_ANT: Structure.LvWallAnterior,
    S_LV_INF: Structure.LvWallInferior,
    S_LV_APEX: Structure.LvApex,
    S_PAP: Structure.PapillaryMuscle,
    S_RV_CAV: Structure.RvCavity,
    S_RV_WALL: Structure.RvWall,
    S_RVOT: Structure.Rvot,
    S_LA_CAV: Structure.LaCavity,
    S_LA_WALL: Structure.LaWall,
    S_RA_CAV: Structure.RaCavity,
    S_RA_WALL: Structure.RaWall,
    S_MV_ANT: Structure.MitralAnterior,
    S_MV_POST: Structure.MitralPosterior,
    S_TV: Structure.TricuspidValve,
    S_AV: Structure.AorticValve,
    S_AO_ROOT: Structure.AorticRoot,
    S_LVOT: Structure.Lvot,
    S_PV: Structure.PulmonaryValve,
    S_IAS: Structure.InteratrialSeptum,
    S_MV_ANN: Structure.MitralAnnulus,
    S_TV_ANN: Structure.TricuspidAnnulus,
    S_CHORDAE: Structure.Chordae,
    S_PERI: Structure.Pericardium,
    S_EFFUSION: Structure.PericardialEffusion,
    S_MOD_BAND: Structure.ModeratorBand,
    S_LAA: Structure.LaAppendage,
    S_PVEIN: Structure.PulmonaryVein,
    S_CS: Structure.CoronarySinus,
    S_PA: Structure.PulmonaryArtery,
    S_RV_PAP: Structure.RvPapillary,
    S_SVC: Structure.Svc,
    S_IVC: Structure.Ivc,
    S_HV: Structure.HepaticVein,
    S_DIAPH: Structure.Diaphragm,
    S_EPI_FAT: Structure.EpicardialFat,
    S_CHEST: Structure.ChestWall,
    S_STERNUM: Structure.Sternum,
    S_RIB: Structure.Rib,
    S_LIVER: Structure.Liver,
    S_STOMACH: Structure.Stomach,
    S_SPINE: Structure.Spine,
    S_DESC_AO: Structure.DescendingAorta,
    S_LUNG: Structure.Lung,
  };
  return [...Object.entries(T), ...Object.entries(S)]
    .map(([k, v]) => `#define et_${k} ${v}`)
    .join('\n');
}

/**
 * Shared GLSL: parameter access, lattice noise, signed-distance primitives.
 *
 * lus-sim (decisión 49; adaptado de EchoTwin, origen y commit en docs/PROVENANCE.md): solo lo que lee el corazón. Sin las
 * precisiones (las pone cada programa de lus-sim), sin las constantes de la acústica, de la PSF ni del tórax de EchoTwin, con la
 * textura de parámetros del corazón (`uHeartTex`) y su retícula de ruido de un canal (`uHeartNoise`, R8: el canal 3 de `uNoise`,
 * el único que lee el corazón). `organs/heart.ts` le pone a todo un prefijo para que no choque con la GLSL de lus-sim.
 */
export const GLSL_COMMON = /* glsl */ `
// uHeartTex (RGBA32F, 4 floats per texel) and uHeartNoise (R8 128^3: wallNoise) come from lus-sim's uniform scheme
float et_P(int i) { return texelFetch(uHeartTex, ivec2(i >> 2, 0), 0)[i & 3]; }
${paramDefinesGlsl()}
${enumDefinesGlsl()}
const float et_PI = 3.14159265358979;
const float et_TWO_PI = 6.28318530717959;
// descending aorta (thoraxModel.ts, decision 213): read by the generated et_posteriorColumnDistance
const float et_DESC_AORTA_MAX_OUTER_R = ${gf(DESC_AORTA_MAX_OUTER_R)};
// left atrial and pericardial layers against the posterior column (classify/pericardium.ts, decision 273)
const float et_LA_WALL_CM = ${gf(LA_WALL_CM)};
const float et_LAA_WALL_CM = ${gf(LAA_WALL_CM)};
const float et_PERICARDIUM_CM = ${gf(PERICARDIUM_CM)};
// vertebral body (thoraxModel.ts)
const float et_SPINE_R = ${gf(SPINE_R)};
// right ventricular body contraction (rv.ts, decision 220): read by the generated et_rvRadialContraction
const float et_RV_BODY_RADIAL_CONTRACTION = ${gf(RV_BODY_RADIAL_CONTRACTION)};
// free wall hung from the tricuspid annulus and reach of the inflow column (rv.ts, decision 243)
const float et_RV_HINGE_PLATEAU_CM = ${gf(RV_HINGE_PLATEAU_CM)};
const float et_RV_HINGE_CM = ${gf(RV_HINGE_CM)};
const float et_RV_HINGE_FADE_RAD = ${gf(RV_HINGE_FADE_RAD)};
const float et_TV_SYSTOLIC_SHORTENING = ${gf(TV_SYSTOLIC_SHORTENING)};
// the effusion over the left atrium (pericardium.ts, decision 255)
const float et_OBLIQUE_SINUS_EFFUSION_CM = ${gf(OBLIQUE_SINUS_EFFUSION_CM)};
const float et_OBLIQUE_SINUS_TAPER_CM = ${gf(OBLIQUE_SINUS_TAPER_CM)};
const float et_RV_INFLOW_REACH_CM = ${gf(RV_INFLOW_REACH_CM)};
// septal crest (lvWall.ts, decision 223): read by the generated et_septalCrestFactor
const float et_SEPTAL_CREST_AZ = ${gf(SEPTAL_CREST_AZ)};
const float et_SEPTAL_CREST_HALF_WIDTH = ${gf(SEPTAL_CREST_HALF_WIDTH)};
const float et_SEPTAL_CREST_Z_CM = ${gf(SEPTAL_CREST_Z_CM)};
// lateral neck of the LV (lvShape.ts, decision 226): read by the generated et_lvNeckWeight
const float et_LV_NECK_ZETA = ${gf(LV_NECK_ZETA)};

// value noise on a 128^3 lattice with smoothstep weights (same as core/noise.ts latticeNoise3); lus-sim: one channel
// (the heart reads channel 3, wallNoise, of the RGBA8 lattice of EchoTwin), ch kept for the callers
float et_lat(vec3 p, int ch) {
  vec3 p0 = floor(p);
  vec3 f = p - p0;
  vec3 u = f * f * (3.0 - 2.0 * f);
  ivec3 i0 = ivec3(p0) & 127;
  ivec3 i1 = (i0 + 1) & 127;
  float c000 = texelFetch(uHeartNoise, ivec3(i0.x, i0.y, i0.z), 0).r;
  float c100 = texelFetch(uHeartNoise, ivec3(i1.x, i0.y, i0.z), 0).r;
  float c010 = texelFetch(uHeartNoise, ivec3(i0.x, i1.y, i0.z), 0).r;
  float c110 = texelFetch(uHeartNoise, ivec3(i1.x, i1.y, i0.z), 0).r;
  float c001 = texelFetch(uHeartNoise, ivec3(i0.x, i0.y, i1.z), 0).r;
  float c101 = texelFetch(uHeartNoise, ivec3(i1.x, i0.y, i1.z), 0).r;
  float c011 = texelFetch(uHeartNoise, ivec3(i0.x, i1.y, i1.z), 0).r;
  float c111 = texelFetch(uHeartNoise, ivec3(i1.x, i1.y, i1.z), 0).r;
  float x00 = mix(c000, c100, u.x);
  float x10 = mix(c010, c110, u.x);
  float x01 = mix(c001, c101, u.x);
  float x11 = mix(c011, c111, u.x);
  float y0 = mix(x00, x10, u.y);
  float y1 = mix(x01, x11, u.y);
  return mix(y0, y1, u.z);
}

float et_sdEllipsoid(vec3 p, vec3 c, vec3 r) {
  vec3 d = (p - c) / r;
  float k0 = length(d);
  float k1 = length(d / r);
  if (k1 < 1e-9) return -min(r.x, min(r.y, r.z));
  return k0 * (k0 - 1.0) / k1;
}
float et_sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float bb = dot(ba, ba);
  float h = bb > 0.0 ? clamp(dot(pa, ba) / bb, 0.0, 1.0) : 0.0;
  return length(pa - ba * h) - r;
}
float et_sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a;
  float l2 = dot(ba, ba);
  float rr = r1 - r2;
  float a2 = l2 - rr * rr;
  float il2 = 1.0 / l2;
  vec3 pa = p - a;
  float y = dot(pa, ba);
  float z = y - l2;
  vec3 x = pa * l2 - ba * y;
  float x2 = dot(x, x);
  float y2 = y * y * l2;
  float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
float et_sdTorusZ(vec3 p, vec3 c, float R, float r) {
  float q = length(p.xy - c.xy) - R;
  float dz = p.z - c.z;
  return sqrt(q * q + dz * dz) - r;
}
float et_smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float et_smax(float a, float b, float k) { return -et_smin(-a, -b, k); }
${GLSL_GENERATED}
`;
