/**
 * GLSL port of `classifyHeart` (heartModel.ts). Mirrors the CPU classifier block by block; the
 * equivalence test (e2e/gpu-equivalence.spec.ts) compares both on the canonical views.
 */
import { LV_PROF_BINS } from '../lvShape';
import {
  PV_INF_Z,
  PV_LEFT_INF_T,
  PV_LEFT_SUP_T,
  PV_COURSE,
  PV_RADIUS,
  PV_RIGHT_T,
  PV_SUP_Z,
} from '../pulmonaryVeins';
import {
  AV_COAPT_HALF,
  ROOT_ASC_T,
  ROOT_EXCURSION,
  ROOT_SINUS_T,
  ROOT_STJ_T,
} from '../heartModel';
import {
  AV_PHI0,
  LVOT_TAPER_CM,
  AV_LATERAL_COAPTATION_HEIGHT,
  AV_LATERAL_PROFILE_RADIUS,
  AV_CROWN_EXPONENT,
  AV_OPEN_EDGE_FRACTION,
  AV_OPEN_WALL_GAP,
} from '../aorticValve';
import {
  AML_ARC_EXTENSION,
  CLOSED_DEPTH,
  CLOSED_REACH,
  MV_BINS,
} from '../mitralValve';
import {
  SKIRT_ABOVE_CM,
  SKIRT_BELOW_CM,
  SKIRT_FIBRE_CLIP,
  SKIRT_LOBE_PERIOD,
  SKIRT_RADIAL_MARGIN_CM,
  SKIRT_TAPER_START,
  SKIRT_TAPER_WIDTH,
  SKIRT_THICK_BASE,
  SKIRT_THICK_BODY,
  SKIRT_THICK_COMMISSURE,
  SKIRT_THICK_EDGE,
  SKIRT_THICK_FLOOR_CM,
  TV_INFLOW_BULGE_CM,
  TV_BUMP_N,
  TV_BUMP_PHI0,
  TV_BUMP_STEP_RAD,
} from '../valveSkirt';

import { FAR_FROM_HEART_CM } from '../classify';
import {
  RA_ANTEROMEDIAL_BLEND_CM,
  RA_ANTEROMEDIAL_FROM,
  RA_ANTEROMEDIAL_R_CM,
  RA_ANTEROMEDIAL_TO,
  RA_CREST_REACH_CM,
  RA_MEMBRANOUS_R_CM,
  RA_MEMBRANOUS_TO,
  RA_SEPTAL_RELEASE_CM,
  RA_SEPTAL_RELEASE_LA_CM,
  RA_SEPTAL_RELEASE_RAMP_CM,
  RA_ROOF_DESCENT_SHARE,
  RA_SLEEVE_MARGIN_CM,
  RA_VESTIBULE_SEPTAL_COS,
  RA_VESTIBULE_SEPTAL_RAMP,
  RA_VESTIBULE_UNION_CM,
} from '../classify/atria';
import { RV_OUTFLOW_BLEND_CM } from '../classify/rightVentricle';

const f = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`);

export const GLSL_HEART = /* glsl */ `
const int et_LV_PROF_BINS = ${LV_PROF_BINS};
const float et_ROOT_SINUS_T = ${f(ROOT_SINUS_T)};
const float et_LVOT_TAPER_CM = ${f(LVOT_TAPER_CM)};
const float et_ROOT_STJ_T = ${f(ROOT_STJ_T)};
const float et_ROOT_ASC_T = ${f(ROOT_ASC_T)};
const float et_AV_COAPT_HALF = ${f(AV_COAPT_HALF)};
const float et_ROOT_EXCURSION = ${f(ROOT_EXCURSION)};
const float et_AV_PHI0 = ${f(AV_PHI0)};
const float et_AV_LATERAL_COAPTATION_HEIGHT = ${f(AV_LATERAL_COAPTATION_HEIGHT)};
const float et_AV_LATERAL_PROFILE_RADIUS = ${f(AV_LATERAL_PROFILE_RADIUS)};
const float et_AV_CROWN_EXPONENT = ${f(AV_CROWN_EXPONENT)};
const float et_AV_OPEN_EDGE_FRACTION = ${f(AV_OPEN_EDGE_FRACTION)};
const float et_AV_OPEN_WALL_GAP = ${f(AV_OPEN_WALL_GAP)};
const float et_RA_ROOF_DESCENT_SHARE = ${f(RA_ROOF_DESCENT_SHARE)};
const float et_RA_SLEEVE_MARGIN_CM = ${f(RA_SLEEVE_MARGIN_CM)};
const float et_RA_VESTIBULE_UNION_CM = ${f(RA_VESTIBULE_UNION_CM)};
const float et_RA_VESTIBULE_SEPTAL_COS = ${f(RA_VESTIBULE_SEPTAL_COS)};
const float et_RA_VESTIBULE_SEPTAL_RAMP = ${f(RA_VESTIBULE_SEPTAL_RAMP)};
const float et_RA_ANTEROMEDIAL_FROM_X = ${f(RA_ANTEROMEDIAL_FROM[0])};
const float et_RA_ANTEROMEDIAL_FROM_Y = ${f(RA_ANTEROMEDIAL_FROM[1])};
const float et_RA_ANTEROMEDIAL_FROM_Z = ${f(RA_ANTEROMEDIAL_FROM[2])};
const float et_RA_ANTEROMEDIAL_TO_X = ${f(RA_ANTEROMEDIAL_TO[0])};
const float et_RA_ANTEROMEDIAL_TO_Y = ${f(RA_ANTEROMEDIAL_TO[1])};
const float et_RA_ANTEROMEDIAL_TO_Z = ${f(RA_ANTEROMEDIAL_TO[2])};
const float et_RA_ANTEROMEDIAL_R_CM = ${f(RA_ANTEROMEDIAL_R_CM)};
const float et_RA_ANTEROMEDIAL_BLEND_CM = ${f(RA_ANTEROMEDIAL_BLEND_CM)};
const float et_RA_MEMBRANOUS_TO_X = ${f(RA_MEMBRANOUS_TO[0])};
const float et_RA_MEMBRANOUS_TO_Y = ${f(RA_MEMBRANOUS_TO[1])};
const float et_RA_MEMBRANOUS_TO_Z = ${f(RA_MEMBRANOUS_TO[2])};
const float et_RA_MEMBRANOUS_R_CM = ${f(RA_MEMBRANOUS_R_CM)};
const float et_RA_CREST_REACH_CM = ${f(RA_CREST_REACH_CM)};
const float et_RA_SEPTAL_RELEASE_LA_CM = ${f(RA_SEPTAL_RELEASE_LA_CM)};
const float et_RA_SEPTAL_RELEASE_RAMP_CM = ${f(RA_SEPTAL_RELEASE_RAMP_CM)};
const float et_RA_SEPTAL_RELEASE_CM = ${f(RA_SEPTAL_RELEASE_CM)};
const int et_MV_BINS = ${MV_BINS};
const float et_AML_ARC_EXTENSION = ${f(AML_ARC_EXTENSION)};
const float et_MV_CLOSED_REACH[3] = float[3](${CLOSED_REACH.map(f).join(', ')});
const float et_MV_CLOSED_DEPTH[3] = float[3](${CLOSED_DEPTH.map(f).join(', ')});
const float et_PV_LEFT_SUP_T = ${f(PV_LEFT_SUP_T)};
const float et_PV_LEFT_INF_T = ${f(PV_LEFT_INF_T)};
const float et_PV_RIGHT_T = ${f(PV_RIGHT_T)};
const float et_PV_SUP_Z = ${f(PV_SUP_Z)};
const float et_PV_INF_Z = ${f(PV_INF_Z)};
const float et_PV_COURSE[12] = float[12](${PV_COURSE.map(f).join(', ')});
const float et_PV_RADIUS = ${f(PV_RADIUS)};
const float et_RV_OUTFLOW_BLEND_CM = ${f(RV_OUTFLOW_BLEND_CM)};
const float et_SKIRT_ABOVE_CM = ${f(SKIRT_ABOVE_CM)};
const float et_TV_INFLOW_BULGE_CM = ${f(TV_INFLOW_BULGE_CM)};
const float et_TV_BUMP_STEP_RAD = ${f(TV_BUMP_STEP_RAD)};
const float et_TV_BUMP_PHI0 = ${f(TV_BUMP_PHI0)};
const int et_TV_BUMP_N = ${TV_BUMP_N};
const float et_FAR_FROM_HEART_CM = ${f(FAR_FROM_HEART_CM)};
const float et_SKIRT_BELOW_CM = ${f(SKIRT_BELOW_CM)};
const float et_SKIRT_RADIAL_MARGIN_CM = ${f(SKIRT_RADIAL_MARGIN_CM)};
const float et_SKIRT_FIBRE_CLIP = ${f(SKIRT_FIBRE_CLIP)};
const float et_SKIRT_TAPER_START = ${f(SKIRT_TAPER_START)};
const float et_SKIRT_TAPER_WIDTH = ${f(SKIRT_TAPER_WIDTH)};
const float et_SKIRT_LOBE_PERIOD = ${f(SKIRT_LOBE_PERIOD)};
const float et_SKIRT_THICK_BASE = ${f(SKIRT_THICK_BASE)};
const float et_SKIRT_THICK_EDGE = ${f(SKIRT_THICK_EDGE)};
const float et_SKIRT_THICK_FLOOR_CM = ${f(SKIRT_THICK_FLOOR_CM)};
const float et_SKIRT_THICK_COMMISSURE = ${f(SKIRT_THICK_COMMISSURE)};
const float et_SKIRT_THICK_BODY = ${f(SKIRT_THICK_BODY)};
struct et_Sample {
  int tissue;
  int structure;
  float sdf;
  vec3 n;
  vec3 m;
  float extra;
  float transmural; // depth across the LV wall, 0 endocardium → 1 epicardium; −1 elsewhere (decision 144)
  int segment; // LV segment code of LV compact myocardium (lvSegments.ts, decision 152); 0 elsewhere
};

void et_setSample(out et_Sample s, int tissue, float sdf, vec3 n, vec3 m, float extra, int structure) {
  float l = length(n);
  s.tissue = tissue;
  s.sdf = sdf;
  s.n = l > 0.0 ? n / l : n;
  s.m = m;
  s.extra = extra;
  s.structure = structure;
  s.transmural = -1.0;
  s.segment = 0;
}

// ---- profile helpers (skirts) ----
float et_profAt(int base, int i) { return et_P(base + i); }
// tricuspid annulus extension (valveSkirt.ts skirtBumpAt / skirtWarpScale, decision 224)
float et_tvBumpAt(float phi) {
  float f = (phi - et_TV_BUMP_PHI0) / et_TV_BUMP_STEP_RAD;
  if (f <= 0.0 || f >= float(et_TV_BUMP_N - 1)) return 0.0;
  int i = int(floor(f));
  return mix(et_P(et_TVS_BUMP_BASE + i), et_P(et_TVS_BUMP_BASE + i + 1), f - float(i));
}
float et_tvWarpScale(vec2 d) {
  float b = dot(d, d) > 1e-12 ? et_tvBumpAt(atan(d.y, d.x)) : 0.0;
  return b > 0.0 ? et_TVS_R / (et_TVS_R + b) : 1.0;
}

// AV-valve skirt: minimum over leaflet zones (radial revolution or parallel-fibre sheets); writes distance, frac, zone, normal
float et_skirtDistance(vec3 p, vec3 c, float R, int zonesBase, int profBase, int nz, float closed, float blend, float thickness, float saddle, out float dOut, out float fracOut, out int zoneOut, out vec3 nOut) {
  vec2 d = p.xy - c.xy;
  d *= et_tvWarpScale(d);
  float zr0 = p.z - c.z;
  float rho = length(d);
  zoneOut = 0;
  nOut = vec3(0.0, 0.0, 1.0);
  if (zr0 > et_SKIRT_ABOVE_CM || zr0 < -et_SKIRT_BELOW_CM || rho > R + et_SKIRT_RADIAL_MARGIN_CM) { dOut = 1e3; fracOut = 0.0; return 0.0; }
  float phi = atan(d.y, d.x);
  // the annulus offset weighs by the distance from the centre, where the closed leaflets meet (valveSkirt.ts, decision 148)
  float zr = zr0 - et_annulusOffset(phi, et_TVS_SADDLE_PHI, saddle, et_TVS_TILTC, et_TVS_TILTS, et_TVS_LIFT) * min(1.0, rho / R);
  float best = 1e9, bestFrac = 0.0, bestW = 0.0;
  int bestZone = 0;
  float bestEx = 0.0, bestEz = 1.0, bestCa = 1.0, bestSa = 0.0, bestKind = 0.0;
  for (int zi = 0; zi < 3; zi++) {
    if (zi >= nz) break;
    int zb = zonesBase + zi * 6;
    float zphi = et_P(zb), zhalf = et_P(zb + 1), zkind = et_P(zb + 2), zlobes = et_P(zb + 3), zc = et_P(zb + 4);
    float w, rhoS, s;
    float ca = cos(zphi), sa = sin(zphi);
    if (zkind > 0.5) {
      float v = d.x * ca + d.y * sa;
      float u = -d.x * sa + d.y * ca;
      float t = abs(u) / R;
      if (t >= et_SKIRT_FIBRE_CLIP) continue;
      float vAtt = sqrt(R * R - u * u);
      rhoS = R - (vAtt - v);
      float tw = (t - et_SKIRT_TAPER_START) / et_SKIRT_TAPER_WIDTH;
      w = tw <= 0.0 ? 1.0 : 1.0 - tw * tw * (3.0 - 2.0 * tw);
      float sc = sqrt(1.0 - t * t) * (1.0 + zc * t * t);
      if (zlobes > 0.0) sc *= 1.0 + zlobes * cos(et_TWO_PI * t / et_SKIRT_LOBE_PERIOD);
      s = 1.0 + (sc - 1.0) * closed;
    } else {
      float dphi = abs(phi - zphi);
      if (dphi > et_PI) dphi = et_TWO_PI - dphi;
      float tw = (dphi - (zhalf - blend)) / (2.0 * blend);
      w = tw <= 0.0 ? 1.0 : (tw >= 1.0 ? 0.0 : 1.0 - tw * tw * (3.0 - 2.0 * tw));
      if (w <= 0.0) continue;
      rhoS = rho;
      float q = dphi / zhalf;
      s = 1.0 - zc * q * q * closed;
    }
    int pb = profBase + zi * 8;
    for (int i = 0; i < 3; i++) {
      float ax = R + (et_P(pb + i * 2) - R) * s, az = et_P(pb + i * 2 + 1) * s;
      float bx = R + (et_P(pb + i * 2 + 2) - R) * s, bz = et_P(pb + i * 2 + 3) * s;
      float ex = bx - ax, ez = bz - az;
      float l2 = ex * ex + ez * ez;
      float uu = l2 > 0.0 ? ((rhoS - ax) * ex + (zr - az) * ez) / l2 : 0.0;
      uu = clamp(uu, 0.0, 1.0);
      float qx = ax + ex * uu - rhoS;
      float qz = az + ez * uu - zr;
      float dd = sqrt(qx * qx + qz * qz);
      if (dd < best) { best = dd; bestFrac = (float(i) + uu) / 3.0; bestW = w; bestZone = zi; bestEx = ex; bestEz = ez; bestCa = ca; bestSa = sa; bestKind = zkind; }
    }
  }
  dOut = best;
  fracOut = bestFrac;
  zoneOut = bestZone;
  // surface normal from the profile edge (like the mitral valve and the CPU skirt): the edge
  // direction in the (rho, z) plane is (ex, ez), so the outward normal is (-ez, ex) rotated into
  // 3D by the radial direction at this point. For radial zones the radial direction is (dx, dy)/rho;
  // for parallel zones it is the zone's perpendicular (-sa, ca).
  float rx, ry;
  if (bestKind > 0.5) {
    rx = -bestSa;
    ry = bestCa;
  } else {
    rx = rho > 1e-6 ? d.x / rho : bestCa;
    ry = rho > 1e-6 ? d.y / rho : bestSa;
  }
  nOut = vec3(-bestEz * rx, -bestEz * ry, bestEx);
  return (thickness * (et_SKIRT_THICK_BASE + et_SKIRT_THICK_EDGE * bestFrac) * 0.5 + et_SKIRT_THICK_FLOOR_CM) * (et_SKIRT_THICK_COMMISSURE + et_SKIRT_THICK_BODY * bestW);
}

// ---- mitral apparatus (mitralValve.ts) ----
float et_mvBin(int tab, int col, float f) {
  float xx = clamp(f - 0.5, 0.0, float(et_MV_BINS - 1));
  int i = min(et_MV_BINS - 2, int(floor(xx)));
  float w = xx - float(i);
  int o = tab + col * et_MV_BINS + i;
  return et_P(o) * (1.0 - w) + et_P(o + 1) * w;
}
// annulus height above the hinge plane at (u, v) around the valve centre: saddle and curtain lift
float et_mvHingeHeight(float u, float v) {
  float theta = atan(abs(u), v);
  float thetaC = atan(sqrt(et_MVL_R * et_MVL_R - et_MVL_D * et_MVL_D), et_MVL_D) + et_AML_ARC_EXTENSION;
  float onCurtain = clamp((thetaC - theta) / et_AML_ARC_EXTENSION, 0.0, 1.0);
  float r2 = u * u + v * v;
  return et_MVL_SADDLE * (u * u / (r2 > 0.0 ? r2 : 1.0)) + et_MVL_LIFT * onCurtain;
}
float et_mvHingeZ(vec2 p) {
  vec2 d = p - vec2(et_MVL_CX, et_MVL_CY);
  return et_MVL_CZ + et_mvHingeHeight(-d.x * et_MVL_UY + d.y * et_MVL_UX, d.x * et_MVL_UX + d.y * et_MVL_UY);
}
float et_mvOutlineSdf(vec2 p) {
  vec2 d = p - vec2(et_MVL_CX, et_MVL_CY);
  return max(length(d) - et_MVL_R, dot(d, vec2(et_MVL_UX, et_MVL_UY)) - et_MVL_D);
}
bool et_mvInsideOutline(vec2 p) {
  vec2 d = p - vec2(et_MVL_CX, et_MVL_CY);
  return dot(d, d) < et_MVL_R * 0.98 * (et_MVL_R * 0.98) && dot(d, vec2(et_MVL_UX, et_MVL_UY)) < et_MVL_D * 0.98;
}
float et_mvInflowTaper(float h) {
  if (h < 0.0) return h < -0.25 ? 2.0 * (-h - 0.25) : 0.0;
  float beyond = h - et_MVL_INFLOW_DEPTH;
  return et_MVL_INFLOW_SLOPE * h + (beyond > 0.0 ? 3.0 * beyond * beyond : 0.0);
}
float et_mvAnnulusDistance(vec3 p, float tube) {
  vec2 d = p.xy - vec2(et_MVL_CX, et_MVL_CY);
  float v = dot(d, vec2(et_MVL_UX, et_MVL_UY));
  float u = -d.x * et_MVL_UY + d.y * et_MVL_UX;
  float uc = sqrt(et_MVL_R * et_MVL_R - et_MVL_D * et_MVL_D);
  float rho = length(vec2(u, v));
  if (rho == 0.0) rho = 1e-6;
  float qu = u / rho * et_MVL_R, qv = v / rho * et_MVL_R;
  float su = clamp(u, -uc, uc);
  if (qv > et_MVL_D || (u - su) * (u - su) + (v - et_MVL_D) * (v - et_MVL_D) < (u - qu) * (u - qu) + (v - qv) * (v - qv)) {
    qu = su;
    qv = et_MVL_D;
  }
  float dPlane = length(vec2(u - qu, v - qv));
  float dzz = p.z - (et_MVL_CZ + et_mvHingeHeight(qu, qv));
  return sqrt(dPlane * dPlane + dzz * dzz) - tube;
}
// one leaflet (fan of fibres from its focus): updates the nearest hit
void et_mvLeaflet(float v, float u, float zr0, int tab, int prof, float focusV, float axisSign, float halfSpan, int leaflet, float openness,
               inout float best, inout float bestFrac, inout int bestLeaflet, inout float bestW, inout vec3 bestN) {
  float dv = v - focusV;
  float rho = length(vec2(dv, u));
  if (rho < 1e-6) return;
  float q = atan(u, dv * axisSign) / halfSpan;
  if (q <= -1.0 || q >= 1.0) return;
  float f = (q + 1.0) * 0.5 * float(et_MV_BINS);
  float hingeS = et_mvBin(tab, 0, f);
  float reach = et_mvBin(tab, 1, f);
  float tent = et_mvBin(tab, 2, f);
  float zr = zr0 - et_mvBin(tab, 3, f);
  float aq = abs(q);
  float tq = (aq - 0.9) / 0.1;
  float w = aq < 0.9 ? 1.0 : 1.0 - tq * tq * (3.0 - 2.0 * tq);
  float openScale = 0.55 + 0.45 * sqrt(max(0.0, 1.0 - q * q));
  float c = 1.0 - openness;
  float rot = openness > 0.0 ? et_mvBin(tab, 4, f) : 0.0;
  float cr = cos(rot), sr = sin(rot);
  float inw = hingeS - rho;
  float ix = -(dv * et_MVL_UX - u * et_MVL_UY) / rho, iy = -(dv * et_MVL_UY + u * et_MVL_UX) / rho;
  float ax = 0.0, az = 0.0;
  for (int i = 0; i < 3; i++) {
    float oa = et_P(prof + i * 2) * openScale, oz = et_P(prof + i * 2 + 1) * openScale;
    float bx = reach * et_MV_CLOSED_REACH[i] * c + (oa * cr + oz * sr) * openness;
    float bz = tent * et_MV_CLOSED_DEPTH[i] * c + (oz * cr - oa * sr) * openness;
    float ex = bx - ax, ez = bz - az;
    float l2 = ex * ex + ez * ez;
    float sg = l2 > 0.0 ? clamp(((inw - ax) * ex + (zr - az) * ez) / l2, 0.0, 1.0) : 0.0;
    float qx = ax + ex * sg - inw, qz = az + ez * sg - zr;
    float dd = sqrt(qx * qx + qz * qz);
    if (dd < best) {
      best = dd;
      bestFrac = (float(i) + sg) / 3.0;
      bestLeaflet = leaflet;
      bestW = w;
      bestN = vec3(-ez * ix, -ez * iy, ex);
    }
    ax = bx;
    az = bz;
  }
}
// distance to the mitral leaflets; returns the local half thickness
float et_mitralDistance(vec3 p, out float dOut, out float fracOut, out int leafletOut, out vec3 nOut) {
  dOut = 1e3;
  fracOut = 0.0;
  leafletOut = 0;
  nOut = vec3(0.0, 0.0, 1.0);
  float dx = p.x - et_MVL_CX, dy = p.y - et_MVL_CY;
  float zr0 = p.z - et_MVL_CZ;
  if (zr0 > 3.5 || zr0 < -2.5 || dx * dx + dy * dy > (et_MVL_R + 2.2) * (et_MVL_R + 2.2)) return 0.0;
  float v = dx * et_MVL_UX + dy * et_MVL_UY;
  float u = -dx * et_MVL_UY + dy * et_MVL_UX;
  float best = 1e9, bestFrac = 0.0, bestW = 1.0;
  int bestLeaflet = 0;
  vec3 bestN = vec3(0.0, 0.0, 1.0);
  et_mvLeaflet(v, u, zr0, et_MVL_A_TAB_BASE, et_MVL_A_PROF_BASE, et_MVL_A_FOCUS, et_MVL_A_AXIS, et_MVL_A_HALF, 0, max(et_MVL_OPEN, et_MVL_SAM), best, bestFrac, bestLeaflet, bestW, bestN);
  et_mvLeaflet(v, u, zr0, et_MVL_P_TAB_BASE, et_MVL_P_PROF_BASE, et_MVL_P_FOCUS, et_MVL_P_AXIS, et_MVL_P_HALF, 1, et_MVL_OPEN, best, bestFrac, bestLeaflet, bestW, bestN);
  if (best >= 1e8) return 0.0;
  dOut = best;
  fracOut = bestFrac;
  leafletOut = bestLeaflet;
  nOut = bestN;
  return (et_MVL_T * (0.6 + 0.4 * bestFrac) * 0.5 + 0.035) * (0.4 + 0.6 * bestW);
}

// ---- aortic root profile and cusps (aorticValve.ts) ----
float et_rootRadiusAt(float t, float phi) {
  float sinusMax = et_SINUS_R * (1.0 + 0.06 * cos(et_CUSP_COUNT * (phi - et_AV_PHI0)) * ((t > 0.0 && t < et_ROOT_STJ_T) ? sin(et_PI * t / et_ROOT_STJ_T) : 0.0));
  float stjR = min(et_ASC_R, et_SINUS_R * 0.88);
  if (t < 0.0) { float u = min(1.0, -t / et_LVOT_TAPER_CM); return et_AV_R * 0.95 + (et_LVOT_D / 2.0 - et_AV_R * 0.95) * u * u * (3.0 - 2.0 * u); }
  if (t < et_ROOT_SINUS_T) return et_AV_R + (sinusMax - et_AV_R) * sin((et_PI / 2.0) * (t / et_ROOT_SINUS_T));
  if (t < et_ROOT_STJ_T) return stjR + (sinusMax - stjR) * 0.5 * (1.0 + cos(et_PI * (t - et_ROOT_SINUS_T) / (et_ROOT_STJ_T - et_ROOT_SINUS_T)));
  if (t < et_ROOT_ASC_T) return stjR + (et_ASC_R - stjR) * 0.5 * (1.0 - cos(et_PI * (t - et_ROOT_STJ_T) / (et_ROOT_ASC_T - et_ROOT_STJ_T)));
  return et_ASC_R;
}
// coaptation band on the line to a commissure: [bottom, top]
vec2 et_aorticBand(float rn) {
  float r = clamp(rn, 0.0, 1.0);
  float margin = et_CUSP_COUNT == 3.0 ? r * r * r : pow(r, 1.5);
  float top = et_AVC_EH + (et_AVC_HCOMM - et_AVC_EH) * margin;
  if (et_CUSP_COUNT != 3.0) return vec2(top - (et_AVC_CH * (1.0 - r) + 0.1 * r), top);
  bool inner = r <= et_AV_LATERAL_PROFILE_RADIUS;
  float u = inner ? r / et_AV_LATERAL_PROFILE_RADIUS : (r - et_AV_LATERAL_PROFILE_RADIUS) / (1.0 - et_AV_LATERAL_PROFILE_RADIUS);
  float blend = u * u * (3.0 - 2.0 * u);
  float height = inner ? et_AVC_CH + (et_AV_LATERAL_COAPTATION_HEIGHT - et_AVC_CH) * blend : et_AV_LATERAL_COAPTATION_HEIGHT + (0.1 - et_AV_LATERAL_COAPTATION_HEIGHT) * blend;
  return vec2(top - height, top);
}
bool et_aorticContactBand(float t, float r, float phi, out vec2 band) {
  float closed = 1.0 - et_AVC_OPEN;
  if (closed <= 0.0) return false;
  float hingeT = et_AVC_HCOMM - 0.1;
  float hingeR = et_rootRadiusAt(hingeT, phi) - 0.05;
  float restT = (t - et_AVC_OPEN * hingeT) / closed;
  float restR = (r - et_AVC_OPEN * hingeR) / closed;
  if (restT < 0.0 || restR < 0.0) return false;
  float wallR = et_rootRadiusAt(restT, phi);
  if (restR >= wallR * 0.97) return false;
  band = closed * et_aorticBand(restR / wallR) + et_AVC_OPEN * hingeT;
  return true;
}
float et_aorticCuspDistance(float t, float rr, float phi, out float dOut, out float fracOut, out vec2 nOut) {
  dOut = 1e3;
  fracOut = 0.0;
  nOut = vec2(0.0, 1.0);
  if (t < -0.5 || t > et_AVC_HCOMM + 0.3) return 0.0;
  float per = et_TWO_PI / et_CUSP_COUNT;
  float psi = mod(phi - et_AV_PHI0, per);
  if (psi > per / 2.0) psi -= per;
  float q = psi / (per / 2.0);
  float aq = min(1.0, abs(q));
  float k = 1.0 - sqrt(max(0.0, 1.0 - pow(aq, et_AV_CROWN_EXPONENT)));
  float tAtt = (et_AVC_HCOMM - 0.1) * k;
  float rw = et_rootRadiusAt(tAtt, phi) - 0.02;
  float tTopOpen = et_AVC_HCOMM - 0.35 + 0.25 * aq * aq;
  float centreWeight = 1.0 - aq * aq;
  float best = 1e9, bestFrac = 0.0;
  vec2 bestN = vec2(0.0, 1.0);
  vec2 a = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    float rn = i == 0 ? 1.0 : (i == 1 ? et_AV_LATERAL_PROFILE_RADIUS : (i == 2 ? 0.29 : 0.0));
    float tMid = (et_AVC_EH - et_AVC_CH) * (1.0 - rn) - et_AVC_SAG * sin(et_PI * rn) * (1.0 - aq);
    float edge = et_aorticBand(rn).x;
    float rc = rw * rn, tc = tMid + (edge - tMid) * k;
    float fo = float(i) / 3.0;
    float to = tAtt + (tTopOpen - tAtt) * fo;
    float wallR = et_rootRadiusAt(to, phi) - et_AV_OPEN_WALL_GAP;
    float hangR = et_AV_R * (1.0 - (1.0 - et_AV_OPEN_EDGE_FRACTION) * fo);
    float ro = min(wallR, wallR + (hangR - wallR) * centreWeight);
    vec2 b = vec2(rc + (ro - rc) * et_AVC_OPEN, tc + (to - tc) * et_AVC_OPEN);
    if (i > 0) {
      vec2 e = b - a;
      float l2 = dot(e, e);
      float sg = l2 > 0.0 ? clamp(dot(vec2(rr, t) - a, e) / l2, 0.0, 1.0) : 0.0;
      float dd = length(a + e * sg - vec2(rr, t));
      if (dd < best) {
        best = dd;
        bestFrac = (float(i - 1) + sg) / 3.0;
        float l = sqrt(l2);
        if (l == 0.0) l = 1.0;
        bestN = vec2(-e.y / l, e.x / l);
      }
    }
    a = b;
  }
  dOut = best;
  fracOut = bestFrac;
  nOut = bestN;
  float tw = (aq - 0.85) / 0.15;
  float w = aq < 0.85 ? 1.0 : 1.0 - tw * tw * (3.0 - 2.0 * tw);
  return (et_CUSP_T * (0.7 + 0.3 * bestFrac) * 0.5 + 0.012) * (0.4 + 0.6 * w);
}

// distance to a 2-segment cusp chain with tapered width
float et_sdCuspChain(vec3 p, int segBase, float segLen, vec3 w, float halfW, float taper, out float fracOut) {
  float best = 1e9;
  float bestFrac = 0.0;
  for (int i = 0; i < 2; i++) {
    float hw = halfW * (1.0 - taper * (float(i) + 0.5) / 2.0);
    int o = segBase + i * 6;
    vec3 s0 = vec3(et_P(o), et_P(o + 1), et_P(o + 2));
    vec3 d = vec3(et_P(o + 3), et_P(o + 4), et_P(o + 5));
    vec3 r = p - s0;
    float a = clamp(dot(r, d), 0.0, segLen);
    float b = clamp(dot(r, w), -hw, hw);
    vec3 q = s0 + d * a + w * b - p;
    float dd = length(q);
    if (dd < best) { best = dd; bestFrac = (float(i) + a / segLen) / 2.0; }
  }
  fracOut = bestFrac;
  return best;
}

// AHA 17 id of the tissue at (az, levelFrac): the shared segment code (lvSegments.ts), the apical cap codes 17–20 read as 17
int et_ahaSegment(float az, float levelFrac) {
  int code = int(et_lvSegmentCode(az, levelFrac, et_RV_AZA, et_RV_AZP) + 0.5);
  return code > 16 ? 17 : code;
}

// ---- LV bullet profile (lvShape.ts) ----
float et_lvProfileG(float zeta) {
  if (zeta < 0.0) {
    float v = zeta / et_LV_ZETATOP;
    return v >= 1.0 ? 0.0 : et_LV_G0 * sqrt(1.0 - v * v);
  }
  if (zeta <= et_LV_ZETAMAX) {
    float u = 1.0 - zeta / et_LV_ZETAMAX;
    return max(0.0, 1.0 - (1.0 - et_LV_G0) * u * u);
  }
  if (zeta >= 1.0) return 0.0;
  float s = (zeta - et_LV_ZETAMAX) / (1.0 - et_LV_ZETAMAX);
  return sqrt(max(0.0, 1.0 - pow(s, et_LV_N)));
}
float et_lvProfileDG(float zeta) {
  if (zeta < 0.0) {
    float v = zeta / et_LV_ZETATOP;
    if (v >= 0.999) return 6.0;
    return -et_LV_G0 * v / et_LV_ZETATOP / sqrt(1.0 - v * v);
  }
  if (zeta <= et_LV_ZETAMAX) {
    float u = 1.0 - zeta / et_LV_ZETAMAX;
    return 2.0 * (1.0 - et_LV_G0) * u / et_LV_ZETAMAX;
  }
  if (zeta >= 1.0) return -6.0;
  float s = (zeta - et_LV_ZETAMAX) / (1.0 - et_LV_ZETAMAX);
  float sn = pow(s, et_LV_N);
  float d = -((et_LV_N / 2.0) * pow(s, et_LV_N - 1.0)) / sqrt(max(1e-9, 1.0 - sn)) / (1.0 - et_LV_ZETAMAX);
  return max(-6.0, d);
}
float et_lvCavityRadius(float az, float z) {
  float zeta = (z - et_ZANN) / max(et_LENGTH_NOW, 1e-3);
  // decision 226
  float w = et_lvNeckWeight(zeta);
  float S = 1.0 + et_LV_NECK_K * w, ox = et_LV_NECK_X * w;
  float rho = et_LV_RMAX * et_lvProfileG(zeta);
  float c = cos(az), sn = sin(az) / et_LV_RATIO;
  float a = c * c * S * S + sn * sn, b = c * ox * S * S;
  return (b + sqrt(max(0.0, b * b - a * (ox * ox * S * S - rho * rho)))) / a;
}
float et_lvRadialOffsetFactor(float az, float z) {
  float zeta = (z - et_ZANN) / max(et_LENGTH_NOW, 1e-3);
  float drdz = et_LV_RMAX * et_lvProfileDG(zeta) * et_ellipseFactor(et_LV_RATIO, az) / max(et_LENGTH_NOW, 1e-3);
  return sqrt(1.0 + min(9.0, drdz * drdz));
}
// signed distance to the tabulated cavity surface (polar table from the centre et_LV_PZC); writes the normal
float et_lvCavitySdf(float xs, float y, float z, out vec3 n) {
  // decision 226
  float w = et_lvNeckWeight((z - et_ZANN) / max(et_LENGTH_NOW, 1e-3));
  float sx = 1.0 + et_LV_NECK_K * w;
  float xr = xs - et_LV_NECK_X * w;
  float xn = xr * sx;
  float ys = y / et_LV_RATIO;
  float rho2 = xn * xn + ys * ys;
  float rho = sqrt(rho2);
  float dz = z - et_LV_PZC;
  float phi = rho > 1e-9 ? atan(rho, dz) : (dz >= 0.0 ? 0.0 : et_PI);
  float rad = sqrt(rho2 + dz * dz);
  float nb = float(et_LV_PROF_BINS - 1);
  float fk = clamp(phi / et_PI * nb, 0.0, nb - 1.0001);
  int k = int(floor(fk));
  float t = fk - float(k);
  float R = et_P(et_LV_PROF_R_BASE + k) + (et_P(et_LV_PROF_R_BASE + k + 1) - et_P(et_LV_PROF_R_BASE + k)) * t;
  float S = et_P(et_LV_PROF_S_BASE + k) + (et_P(et_LV_PROF_S_BASE + k + 1) - et_P(et_LV_PROF_S_BASE + k)) * t;
  float f = 1.0 / sqrt(1.0 + S * S);
  float sinP = rad > 1e-9 ? rho / rad : 0.0;
  float cosP = rad > 1e-9 ? dz / rad : 1.0;
  float nr = sinP - S * cosP, nz = cosP + S * sinP;
  float ir = rho > 1e-9 ? 1.0 / rho : 0.0;
  n = vec3(nr * xn * ir * sx, nr * ys * ir / et_LV_RATIO, nz);
  float q = rho2 > 1e-12 ? sqrt((xr * xr + et_LV_RATIO * et_LV_RATIO * ys * ys) / rho2) : 1.0;
  float corr = 1.0 - (1.0 - q) * sinP * sinP;
  return (rad - R) * f * corr;
}

float et_wallThicknessAt(float az, float levelFrac, float amp) {
  float septalness = 0.5 - 0.5 * cos(az);
  float tBase = et_LV_LVPWD + (et_LV_IVSD - et_LV_LVPWD) * septalness;
  float tED = tBase * et_axialWallFactor(levelFrac, et_APEX_T / tBase);
  float wallMod = 1.0 + 0.28 * (et_lat(vec3(cos(az) * 1.6 + 7.3, sin(az) * 1.6 + 2.1, levelFrac * 2.4), 3) - 0.5) * (1.0 - levelFrac * levelFrac);
  return tED * max(0.6, 1.0 + (et_LV_THICK_K - 1.0) * (0.35 + 0.65 * amp)) * wallMod;
}


// [rIn, u, rOut, t] without trabecular noise
vec4 et_rvRadii(float az, float z, float contraction, float tvZ, float rvCollapse) {
  float L = et_LV_LEN;
  float azN = az < 0.0 ? az + et_TWO_PI : az;
  float u = (azN - et_RV_AZA) / (et_RV_AZP - et_RV_AZA);
  float rCav = et_lvCavityRadius(az, z);
  float levelFrac = clamp((z - et_ZANN) / max(et_LENGTH_NOW, 1.0), 0.0, 1.0);
  float amp = et_P(et_SEG_AMP_BASE + et_ahaSegment(az, levelFrac));
  // decision 223: the crest's lost thickness goes to the cavity below the tricuspid plane, the free wall stays
  float wFull = et_wallThicknessAt(az, levelFrac, amp) * et_lvRadialOffsetFactor(az, z);
  float below = clamp((z - (et_TV_CZ + tvZ - 0.6)) / 0.3, 0.0, 1.0);
  float crestLossR = wFull * (1.0 - et_septalCrestFactor(az, z - et_ZANN)) * below * below * (3.0 - 2.0 * below);
  float rEpi = rCav + wFull - crestLossR;
  float rIn = rEpi - et_septalShiftAt(et_SEPTAL_SHIFT, az, levelFrac) + 0.05;
  if (u <= 0.0 || u >= 1.0) return vec4(rIn, u, rIn, 0.0);
  float tvPlane = et_TV_CZ + tvZ;
  float t = et_RV_T * et_rvAzProfile(et_RV_AZA, et_RV_AZP, u) * et_rvAxialTaper(tvPlane, et_RV_APEX_FRAC * L, z) * (1.0 - et_rvRadialContraction(u) * et_rvRadialState(tvZ, et_RV_TAPSE, contraction) * et_RV_RADIAL_SCALE);
  // decision 243: the free wall hangs from the annulus, which shortens about its septal edge
  float tvR = et_TV_R * (1.0 - et_tvShortening(contraction, et_RV_RADIAL_SCALE));
  float tvCx = et_TV_CX + (et_TV_R - tvR);
  float rc = length(vec2(tvCx, et_TV_CY));
  float dAz = az - atan(et_TV_CY, tvCx);
  dAz = abs(dAz - et_TWO_PI * floor(dAz / et_TWO_PI + 0.5));
  float wH = et_rvHingeWeight(dAz, asin(min(1.0, tvR / rc)), z - tvPlane);
  if (wH > 0.0) t += wH * max(0.0, et_rvHingeRadius(rc, tvR, dAz) - rIn - crestLossR - t);
  if (rvCollapse > 0.0 && u < 0.55) t *= 1.0 - 0.65 * rvCollapse * (1.0 - u / 0.55);
  return vec4(rIn, u, rIn + t + crestLossR, t + crestLossR);
}
// tricuspid inflow column (heartModel.ts et_tvInflowSdf): annular circle narrowing below the hinges, closed on the atrial side
// annulus offset above a point, by its azimuth around the tricuspid centre (valveSkirt.ts skirtOffsetAt)
float et_tvOffsetAt(vec2 q) {
  vec2 d = q - vec2(et_TVS_CX, et_TVS_CY);
  float phi = dot(d, d) > 1e-12 ? atan(d.y, d.x) : 0.0;
  return et_annulusOffset(phi, et_TVS_SADDLE_PHI, et_TVS_SADDLE, et_TVS_TILTC, et_TVS_TILTS, et_TVS_LIFT);
}
float et_tvInflowSdf(vec3 p) {
  vec2 d = p.xy - vec2(et_TVS_CX, et_TVS_CY);
  d *= et_tvWarpScale(d);
  float r2 = dot(d, d);
  float rho = sqrt(r2);
  float phi = r2 > 1e-12 ? atan(d.y, d.x) : 0.0;
  float h = p.z - (et_TVS_CZ + et_annulusOffset(phi, et_TVS_SADDLE_PHI, et_TVS_SADDLE, et_TVS_TILTC, et_TVS_TILTS, et_TVS_LIFT));
  float bulge = et_TV_INFLOW_BULGE_CM * 0.5 * (1.0 - cos(phi - et_P(et_TVS_ZONES_BASE + 6)));
  return rho - et_TVS_R + 0.04 + et_tvInflowTaper(h, 0.25 + 0.3 * et_TVZ, bulge);
}
// RV crescent: returns [signed distance, rIn, rOut]
vec3 et_rvCrescent(vec3 p, float az) {
  vec4 rr = et_rvRadii(az, p.z, et_CONTRACTION, et_TVZ, et_RV_COLLAPSE);
  float rIn = rr.x, u = rr.y;
  if (u <= 0.0 || u >= 1.0) return vec3(1e3, rIn, rIn);
  float L = et_LV_LEN;
  float zApex = et_RV_APEX_FRAC * L;
  float zBase = et_rvFloorZ(et_TV_CZ, et_TVZ, et_PV_Z, u, et_tvOffsetAt(p.xy));
  float t = rr.w;
  if (p.z > 0.25 * L) {
    float w = min(1.0, (p.z - 0.25 * L) / (0.35 * L));
    float rs = 1.0 - 0.3 * et_CONTRACTION;
    float n = et_lat(vec3((p.x / rs) * 1.4 + 3.1, (p.y / rs) * 1.4 + 9.7, p.z * 0.9 + 5.3), 3) - 0.5;
    t += (0.25 + 0.25 * w) * n - 0.12 * w * w;
  }
  float rOut = rIn + max(0.0, t);
  float r = length(p.xy);
  float d = max(max(rIn - r, r - rOut), max(zBase - p.z, p.z - zApex));
  return vec3(d, rIn, rOut);
}

// Shared RV distance for the pericardium block (recomputed; cheap)
bool et_classifyHeart(vec3 p0, out et_Sample s) {
  s.segment = 0;
  vec3 p = vec3(p0.x - et_SWING_X, p0.y, p0.z);
  float x = p.x, y = p.y, z = p.z;
  vec3 bd = p - vec3(et_BOUND_CX, et_BOUND_CY, et_BOUND_CZ);
  if (dot(bd, bd) > et_BOUND_R * et_BOUND_R) { s.sdf = et_FAR_FROM_HEART_CM; return false; }
  // the descending aorta and the vertebral body, which the heart yields to (decision 273)
  float colDist = et_posteriorColumnDistance(p0.x, p0.y, p0.z, et_COL_UX, et_COL_UY, et_COL_UZ, et_COL_AX, et_COL_AY, et_COL_AZ, et_COL_SX, et_COL_SY, et_COL_SZ);
  float zAnn = et_ZANN;

  // ---------- aortic root coordinates ----------
  float rootT = -99.0, rootRr = 0.0, rootR = 0.0, rootPhi = 0.0;
  vec3 rootQ = vec3(0.0);
  vec3 avC = vec3(et_AV_CX, et_AV_CY, et_AV_CZ);
  vec3 ax = vec3(et_AV_AXX, et_AV_AXY, et_AV_AXZ);
  {
    float czz = avC.z + zAnn * et_ROOT_EXCURSION;
    vec3 d = vec3(x - avC.x, y - avC.y, z - czz);
    float t = dot(d, ax);
    if (t > -1.6 && t < 6.5) {
      float bend = et_rootBend(t);
      rootQ = d - ax * t - vec3(et_AV_BX, et_AV_BY, et_AV_BZ) * bend;
      rootRr = length(rootQ);
      rootT = t;
      rootPhi = atan(dot(rootQ, vec3(et_AV_E2X, et_AV_E2Y, et_AV_E2Z)), dot(rootQ, vec3(et_AV_E1X, et_AV_E1Y, et_AV_E1Z)));
      rootR = et_rootRadiusAt(t, rootPhi);
    }
  }
  bool inRootLumen = rootT >= -0.05 && rootRr < rootR;
  bool inOutflowLumen = rootT > -1.6 && rootRr < rootR;

  // ---------- valves ----------
  {
    float dM, fr;
    int lf;
    vec3 nM;
    float t = et_mitralDistance(p, dM, fr, lf, nM);
    if (dM < t) {
      et_setSample(s, et_T_VALVE, dM - t, nM, p, et_MV_CALC, lf == 0 ? et_S_MV_ANT : et_S_MV_POST);
      return true;
    }
  }
  if (rootT > -0.5 && rootRr < rootR + 0.02) {
    float dA, frA;
    vec2 nA;
    float hA = et_aorticCuspDistance(rootT, rootRr, rootPhi, dA, frA, nA);
    if (dA < hA) {
      vec3 u = rootQ / max(rootRr, 1e-6);
      et_setSample(s, et_T_VALVE, dA - hA, u * nA.x + ax * nA.y, p, et_AV_CALC, et_S_AV);
      return true;
    }
  }
  if (et_AVC_OPEN < 1.0 && rootT > 0.0 && rootT < et_AVC_HCOMM && rootRr < rootR * 0.97) {
    vec2 band;
    float axialDistance = 1e3;
    if (et_aorticContactBand(rootT, rootRr, rootPhi, band)) axialDistance = max(max(band.x - rootT, rootT - band.y), 0.0);
    if (axialDistance < et_AV_COAPT_HALF) {
      float n = et_CUSP_COUNT;
      float per = et_TWO_PI / n;
      float dphi = mod(mod(rootPhi - 0.5 - et_PI / n, per) + per, per);
      if (dphi > et_PI / n) dphi = per - dphi;
      float dist = length(vec2(rootRr * sin(dphi), axialDistance));
      if (dist < et_AV_COAPT_HALF) {
        vec3 u = rootQ / max(rootRr, 1e-6);
        et_setSample(s, et_T_VALVE, dist - et_AV_COAPT_HALF, cross(ax, u), p, et_AV_CALC, et_S_AV);
        return true;
      }
    }
  }
  bool outsideAorticRoot = rootT <= -1.6 || rootRr > rootR + 0.22;
  if (outsideAorticRoot && et_sdCapsule(p, vec3(et_RVOT_MX, et_RVOT_MY, et_RVOT_MZ + et_PV_Z), vec3(et_PA_EX, et_PA_EY, et_PA_EZ), et_PA_R + 0.02) < 0.0) {
    for (int i = 0; i < 3; i++) {
      vec3 w = vec3(et_P(et_PV_W_BASE + i * 3), et_P(et_PV_W_BASE + i * 3 + 1), et_P(et_PV_W_BASE + i * 3 + 2));
      float fr;
      float dd = et_sdCuspChain(p, et_PV_SEGS_BASE + i * 12, et_PV_SEGLEN, w, et_PV_HALF, 0.75, fr);
      float t = et_PV_T * (1.0 - 0.3 * fr) * 0.5 + 0.03;
      if (dd < t) {
        int o = et_PV_SEGS_BASE + i * 12 + min(1, int(floor(fr * 2.0))) * 6;
        vec3 d = vec3(et_P(o + 3), et_P(o + 4), et_P(o + 5));
        et_setSample(s, et_T_VALVE, dd - t, cross(d, w), p, 0.0, et_S_PV);
        return true;
      }
    }
  }
  {
    float dS, fr;
    int zn;
    vec3 nS;
    vec3 c = vec3(et_TVS_CX, et_TVS_CY, et_TVS_CZ);
    float t = et_skirtDistance(p, c, et_TVS_R, et_TVS_ZONES_BASE, et_TVS_PROF_BASE, int(et_TVS_NZ + 0.5), et_TVS_CLOSED, et_TVS_BLEND, et_TVS_T, et_TVS_SADDLE, dS, fr, zn, nS);
    if (dS < t) {
      et_setSample(s, et_T_VALVE, dS - t, nS, p, 0.0, int(et_P(et_TVS_ZONES_BASE + zn * 6 + 5) + 0.5));
      return true;
    }
  }
  {
    float dR = et_mvAnnulusDistance(p, 0.11);
    if (dR < 0.0) {
      et_setSample(s, et_T_FIBROUS, dR, vec3(x - et_MVL_CX, y - et_MVL_CY, 0.0), p, 0.15 * et_MV_CALC, et_S_MV_ANN);
      return true;
    }
    vec3 q = vec3(et_TV_RING_X, et_TV_RING_Y, et_TV_RING_Z);
    vec2 dq = p.xy - q.xy;
    float dT = et_sdTorusZ(vec3(q.xy + dq * et_tvWarpScale(dq), z - et_tvOffsetAt(p.xy)), q, et_TV_RING_R, 0.09);
    if (dT < 0.0) {
      et_setSample(s, et_T_FIBROUS, dT, vec3(x - q.x, y - q.y, 0.0), p, 0.0, et_S_TV_ANN);
      return true;
    }
  }
  for (int i = 0; i < 10; i++) {
    int o = et_CHORDAE_BASE + i * 6;
    vec3 ca = vec3(et_P(o), et_P(o + 1), et_P(o + 2)), cb = vec3(et_P(o + 3), et_P(o + 4), et_P(o + 5));
    float d = et_sdCapsule(p, ca, cb, 0.045);
    if (d < 0.0) {
      // decision 227: the cord's axis
      et_setSample(s, et_T_CHORDAE, d, cb - ca, p, 0.0, et_S_CHORDAE);
      return true;
    }
  }

  // ---------- LV cavity & wall ----------
  float az = atan(y, x);
  float levelFrac = clamp((z - zAnn) / max(et_LENGTH_NOW, 1.0), 0.0, 1.0);
  float septalShift = et_septalShiftAt(et_SEPTAL_SHIFT, az, levelFrac);
  float xs = x - septalShift;
  vec3 n0;
  float dProf = et_lvCavitySdf(xs, y, z, n0);
  float dCav = et_smax(dProf, zAnn - z, 0.6);
  int seg = et_ahaSegment(az, levelFrac);
  float amp = et_P(et_SEG_AMP_BASE + seg);
  // an akinetic segment keeps its end-diastolic radius; a hyperkinetic one (amp > 1) adds nothing, as on the CPU
  float regional = amp < 1.0 ? (1.0 - amp) * (et_LV_RMAX_ED - et_LV_RMAX) * et_lvProfileG(levelFrac) : 0.0;
  float rs = et_RADIAL_SCALE, ls = et_LONG_SCALE;
  float trab = levelFrac > 0.45 ? 0.2 * min(1.0, (levelFrac - 0.45) / 0.35) * (et_lat(vec3((x / rs) * 2.6 + 11.3, (y / rs) * 2.6 + 2.9, ((z - et_LV_LEN) / ls) * 1.1 + 6.1), 3) - 0.5) : 0.0;
  float dCavR = dCav - regional + trab;
  float tFull = et_wallThicknessAt(az, levelFrac, amp);
  // decision 223
  float tNow = tFull * et_septalCrestFactor(az, z - zAnn);
  float crestLoss = tFull - tNow;
  // mitral inflow: cavity and wall are the smooth union of the profile with the narrowing annular outline
  bool inRootTube = rootT > -1.6 && rootRr < rootR + 0.2;
  float zHinge = et_mvHingeZ(p.xy);
  float dInflow = inRootTube ? 1e3 : et_mvOutlineSdf(p.xy) + 0.04 + et_mvInflowTaper(z - zHinge);
  float dLvBlood = et_smin(dCavR, dInflow, 0.3);
  if (dLvBlood < 0.0) {
    float dPa = et_sdRoundCone(p, vec3(et_P(et_PAPS_BASE), et_P(et_PAPS_BASE + 1), et_P(et_PAPS_BASE + 2)), vec3(et_P(et_PAPS_BASE + 3), et_P(et_PAPS_BASE + 4), et_P(et_PAPS_BASE + 5)), et_P(et_PAPS_BASE + 6), et_P(et_PAPS_BASE + 7));
    float dPm = et_sdRoundCone(p, vec3(et_P(et_PAPS_BASE + 8), et_P(et_PAPS_BASE + 9), et_P(et_PAPS_BASE + 10)), vec3(et_P(et_PAPS_BASE + 11), et_P(et_PAPS_BASE + 12), et_P(et_PAPS_BASE + 13)), et_P(et_PAPS_BASE + 14), et_P(et_PAPS_BASE + 15));
    float dPap = min(dPa, dPm);
    if (dPap < 0.0) {
      et_setSample(s, et_T_MYO, dPap, vec3(x, y, 0.0), vec3(x / rs, y / rs, z / ls), 0.0, et_S_PAP);
      return true;
    }
    et_setSample(s, et_T_BLOOD, dLvBlood, n0, vec3(x / rs, y / rs, (z - et_LV_LEN) / ls), 0.0, (dCavR >= 0.0 && z < zHinge) ? et_S_LA_CAV : et_S_LV_CAV);
    return true;
  }
  float wallT = tNow;
  float dEllR = et_smin(dProf, dInflow, 0.3) - regional;
  if (dEllR + trab >= 0.0 && dEllR < wallT && z >= zAnn - 0.25 && !inOutflowLumen) {
    // the wall label follows the AHA wall of the segment, bounded by the RV insertions (lvSegments.ts, decision 154)
    float segCode = et_lvSegmentCode(az, levelFrac, et_RV_AZA, et_RV_AZP);
    int wall = int(et_lvWallKind(segCode) + 0.5);
    int structure = wall == 1 ? et_S_LV_SEPT : wall == 2 ? et_S_LV_ANT : wall == 3 ? et_S_LV_INF : et_S_LV_LAT;
    if (z > et_LV_LEN - 0.6) structure = et_S_LV_APEX;
    bool nearEpi = wallT - dEllR < dEllR;
    // only the smooth epicardium reflects coherently; the trabeculated endocardium scatters (decision 144)
    float dIn = nearEpi ? -(wallT - dEllR) : -wallT;
    float sg = nearEpi ? 1.0 : -1.0;
    et_setSample(s, et_T_MYO, dIn, sg * n0, vec3(x / rs, y / rs, (z - et_LV_LEN) / ls), 0.0, structure);
    s.transmural = clamp(dEllR / wallT, 0.0, 1.0);
    s.segment = int(segCode + 0.5);
    return true;
  }
  bool inAnnularRegion = dEllR < 0.0 && z < zAnn && !inRootLumen;
  if (inAnnularRegion) {
    if (et_mvInsideOutline(p.xy)) {
      et_setSample(s, et_T_BLOOD, -0.3, vec3(0.0, 0.0, 1.0), p, 0.0, et_S_LA_CAV);
      return true;
    }
  }

  // ---------- aortic root / LVOT ----------
  if (rootT > -1.6) {
    float wall = 0.2;
    if (rootRr < rootR) {
      et_setSample(s, et_T_BLOOD, rootRr - rootR, rootQ / rootRr, vec3(x, y, z - zAnn * et_ROOT_EXCURSION), 0.0, rootT < 0.0 ? et_S_LVOT : et_S_AO_ROOT);
      return true;
    }
    if (rootRr < rootR + wall) {
      float dIn = -min(rootRr - rootR, rootR + wall - rootRr);
      et_setSample(s, et_T_VESSEL, dIn, rootQ / rootRr, p, 0.0, et_S_AO_ROOT);
      return true;
    }
  }
  if (inAnnularRegion && z > zAnn - 1.2) {
    et_setSample(s, et_T_FIBROUS, -0.15, vec3(0.0, 0.0, 1.0), p, 0.0, et_S_LV_SEPT);
    return true;
  }

  // the base the ventricle vacated as the annulus descended, atrium now (decision 133); read again by the pericardium
  float raSleeve = 1e3;
  // the left atrium's epicardium, read by the pericardium (decision 273)
  float laEpi = 1e3;
  // ---------- atria ----------
  vec3 la = vec3(et_LA_CX, et_LA_CY, et_LA_CZ);
  vec3 lr = vec3(et_LA_RX, et_LA_RY, et_LA_RZ);
  vec3 ra = vec3(et_RA_CX, et_RA_CY, et_RA_CZ);
  vec3 rar = vec3(et_RA_RX, et_RA_RY, et_RA_RZ);
  float bo = et_atrialScale(et_LA_BOOSTER, et_LA_RESERVOIR, et_CONTRACTION);
  float czL, rzL, czR, rzR;
  {
    float zTop = la.z - lr.z;
    float zBottom = zAnn + 0.25;
    czL = (zTop + zBottom) / 2.0;
    rzL = (zBottom - zTop) / 2.0;
    float xIas = et_IAS_X;
    float fo = length(vec2((y - et_FOSSA_Y) / 0.6, (z - et_FOSSA_Z) / 0.7));
    float tIas = et_iasThickness(fo);
    float dEllLa = et_sdEllipsoid(p, vec3(la.x, la.y, czL), vec3(lr.x * bo, lr.y * bo, rzL));
    float dFreeLa = et_smax(et_smax(dEllLa, la.y - 0.72 * lr.y * bo - y, 0.6), zTop + 0.15 * rzL - z, 0.5);
    laEpi = min(dFreeLa - et_LA_WALL_CM, et_sdCapsule(p, vec3(la.x + lr.x * 0.55, la.y + lr.y * 0.55, czL + 0.4), vec3(la.x + lr.x * 0.95, la.y + lr.y * 0.55 + 2.0, czL + 0.9), 0.55 * bo) - et_LAA_WALL_CM);
    float d = et_smax(dFreeLa, xIas + tIas / 2.0 - x, 0.3);
    if (d < 0.0) {
      et_setSample(s, et_T_BLOOD, d, vec3((x - la.x) / lr.x, (y - la.y) / lr.y, (z - czL) / rzL), p, 0.0, et_S_LA_CAV);
      return true;
    }
    if (dFreeLa < et_LA_WALL_CM && x > xIas + tIas / 2.0) {
      et_setSample(s, et_T_MYO, -min(dFreeLa, et_LA_WALL_CM - dFreeLa), vec3((x - la.x) / lr.x, (y - la.y) / lr.y, (z - czL) / rzL), p, 0.0, et_S_LA_WALL);
      return true;
    }
    float zTopR = ra.z - rar.z + et_RA_ROOF_DESCENT_SHARE * et_TVZ;
    // the atrium ends at the annulus (decision 64): mirrors et_classifyHeart
    float tvOff = et_tvOffsetAt(p.xy);
    float zBotR = et_TV_CZ + et_TVZ + tvOff + 0.03;
    czR = (zTopR + zBotR) / 2.0;
    rzR = (zBotR - zTopR) / 2.0;
    float raC = et_raCollapseScale(et_RA_COLLAPSE);
    float dEllRa = et_sdEllipsoid(p, vec3(ra.x, ra.y, czR), vec3(rar.x * bo * raC, rar.y * bo * raC, rzR));
    float dFreeRa = et_smax(dEllRa, ra.y - 0.8 * rar.y * bo - y, 0.6);
    // decision 218
    vec3 amFrom = ra + vec3(et_RA_ANTEROMEDIAL_FROM_X, et_RA_ANTEROMEDIAL_FROM_Y, et_RA_ANTEROMEDIAL_FROM_Z);
    vec3 amTo = vec3(et_AV_CX + et_RA_ANTEROMEDIAL_TO_X, et_AV_CY + et_RA_ANTEROMEDIAL_TO_Y, et_AV_CZ + zAnn * et_ROOT_EXCURSION + et_RA_ANTEROMEDIAL_TO_Z);
    dFreeRa = et_smin(dFreeRa, et_sdCapsule(p, amFrom, amTo, et_RA_ANTEROMEDIAL_R_CM * bo), et_RA_ANTEROMEDIAL_BLEND_CM);
    // decision 222
    vec3 msTo = vec3(et_AV_CX + et_RA_MEMBRANOUS_TO_X, et_AV_CY + et_RA_MEMBRANOUS_TO_Y, et_AV_CZ + zAnn * et_ROOT_EXCURSION + et_RA_MEMBRANOUS_TO_Z);
    float dMs = et_smax(et_sdCapsule(p, amTo, msTo, et_RA_MEMBRANOUS_R_CM * bo), z - zBotR, 0.1);
    dMs = et_smax(dMs, -max(dEllR - wallT - 0.05, zAnn - 0.25 - z), 0.1);
    dFreeRa = et_smin(dFreeRa, dMs, 0.3);
    // decision 223
    if (crestLoss > 0.0) {
      float dEpiC = dEllR - wallT;
      dFreeRa -= crestLoss * clamp(dEpiC / 0.05, 0.0, 1.0) * clamp(1.0 - dEpiC / et_RA_CREST_REACH_CM, 0.0, 1.0);
    }
    if (et_TVZ > 0.05) {
      vec4 rr0 = et_rvRadii(az, z, 0.0, 0.0, 0.0);
      float u0 = rr0.y;
      if (u0 > 0.0 && u0 < 1.0) {
        float r0 = length(p.xy);
        // decision 220
        vec2 dT = vec2(x - et_TVS_CX, y - et_TVS_CY);
        float rhoT = length(dT);
        float tvOffEd = tvOff - et_TVS_LIFT - (rhoT > 1e-6 ? et_TVS_TILTC * (x - et_TVS_CX) / rhoT : et_TVS_TILTC);
        raSleeve = max(max(max(rr0.x + 0.1 - r0, r0 - (rr0.z - et_RV_FW)), max(et_rvFloorZ(et_TV_CZ, 0.0, 0.0, u0, tvOffEd) - z, z - et_rvFloorZ(et_TV_CZ, et_TVZ, et_PV_Z, u0, tvOff))), rhoT * et_tvWarpScale(dT) - (et_TVS_R + et_RA_SLEEVE_MARGIN_CM));
      }
    }
    dFreeRa = min(dFreeRa, raSleeve);
    // decision 222
    float qRel = clamp((dFreeLa - et_RA_SEPTAL_RELEASE_LA_CM) / et_RA_SEPTAL_RELEASE_RAMP_CM, 0.0, 1.0);
    float relL = qRel * qRel * (3.0 - 2.0 * qRel);
    float septumPlane = x - (xIas - tIas / 2.0) - et_RA_SEPTAL_RELEASE_CM * relL;
    float dR = et_smax(dFreeRa, septumPlane, 0.3);
    if (dR < 0.0) {
      et_setSample(s, et_T_BLOOD, dR, vec3((x - ra.x) / rar.x, (y - ra.y) / rar.y, (z - czR) / rzR), p, 0.0, et_S_RA_CAV);
      return true;
    }
    // decision 219
    float dSvc = et_sdCapsule(p, vec3(et_SVC_AX, et_SVC_AY, et_SVC_AZ), vec3(et_SVC_BX, et_SVC_BY, et_SVC_BZ), et_SVC_R);
    float dIvc = et_sdCapsule(p, vec3(et_IVC_AX, et_IVC_AY, et_IVC_AZ), vec3(et_IVC_BX, et_IVC_BY, et_IVC_BZ), et_IVC_R);
    if (dFreeRa < 0.22 && septumPlane < 0.0 && dSvc >= 0.0 && dIvc >= 0.0) {
      // no wall across the tricuspid orifice (decision 64): atrial blood up to the annular plane, ventricular past it
      // decision 219
      // decision 226
      vec2 dO = vec2(x - et_TVS_CX, y - et_TVS_CY);
      float sepS = clamp((dO.x / max(1e-6, length(dO)) - et_RA_VESTIBULE_SEPTAL_COS) / et_RA_VESTIBULE_SEPTAL_RAMP, 0.0, 1.0);
      if (z > czR && et_smin(dFreeRa, length(dO) - et_TVS_R / et_tvWarpScale(dO), 1e-3 + et_RA_VESTIBULE_UNION_CM * sepS) < 0.0) {
        et_setSample(s, et_T_BLOOD, dFreeRa - 0.22, vec3((x - ra.x) / rar.x, (y - ra.y) / rar.y, (z - czR) / rzR), p, 0.0, z > et_TV_CZ + et_TVZ + tvOff ? et_S_RV_CAV : et_S_RA_CAV);
        return true;
      }
      et_setSample(s, et_T_MYO, -min(dFreeRa, 0.22 - dFreeRa), vec3((x - ra.x) / rar.x, (y - ra.y) / rar.y, (z - czR) / rzR), p, 0.0, et_S_RA_WALL);
      return true;
    }
    if (abs(x - xIas) <= tIas / 2.0 && z < zAnn + 0.4 && relL < 0.5) {
      if (et_sdEllipsoid(vec3(xIas, y, z), vec3(la.x, la.y, czL), vec3(lr.x * bo, lr.y * bo, rzL)) < 0.45 || et_sdEllipsoid(vec3(xIas, y, z), vec3(ra.x, ra.y, czR), vec3(rar.x * bo * raC, rar.y * bo * raC, rzR)) < 0.45) {
        et_setSample(s, et_T_MYO, -(tIas / 2.0 - abs(x - xIas)), vec3(1.0, 0.0, 0.0), p, 0.0, et_S_IAS);
        return true;
      }
    }
    // appendage
    {
      vec3 a0 = vec3(la.x + lr.x * 0.55, la.y + lr.y * 0.55, czL + 0.4);
      vec3 a1 = vec3(la.x + lr.x * 0.95, a0.y + 2.0, czL + 0.9);
      float lob = 0.12 * (et_lat(vec3(x * 2.3 + 1.7, y * 2.3 + 4.2, z * 2.3 + 8.8), 3) - 0.5);
      float dApp = et_sdCapsule(p, a0, a1, 0.55 * bo + lob);
      if (dApp < 0.0) {
        et_setSample(s, et_T_BLOOD, dApp, vec3(0.0, 1.0, 0.0), p, 0.0, et_S_LAA);
        return true;
      }
      if (dApp < et_LAA_WALL_CM) {
        et_setSample(s, et_T_MYO, -min(dApp, et_LAA_WALL_CM - dApp), vec3(0.0, 1.0, 0.0), p, 0.0, et_S_LA_WALL);
        return true;
      }
    }
    // pulmonary veins: towards the hila from the lateral wall (left) and the posteromedial corner (right); mirror of
    // pulmonaryVeins.ts (decision 143)
    for (int i = 0; i < 4; i++) {
      float sx = (i == 0 || i == 2) ? -1.0 : 1.0;
      bool sup = i < 2;
      float dzN = sup ? et_PV_SUP_Z : et_PV_INF_Z;
      float kz = sqrt(1.0 - dzN * dzN);
      float t = sx > 0.0 ? (sup ? et_PV_LEFT_SUP_T : et_PV_LEFT_INF_T) : et_PV_RIGHT_T;
      float px = la.x + sx * lr.x * bo * kz * cos(t);
      float py0 = la.y - lr.y * bo * kz * sin(t);
      float pz = czL + dzN * rzL;
      float dPv = et_smax(et_sdCapsule(p, vec3(px, py0, pz), vec3(px + et_PV_COURSE[3 * i], py0 + et_PV_COURSE[3 * i + 1], pz + et_PV_COURSE[3 * i + 2]), et_PV_RADIUS), 0.12 - colDist, 0.2);
      if (dPv < 0.0) {
        et_setSample(s, et_T_BLOOD, dPv, vec3(0.0, -1.0, 0.0), p, 0.0, et_S_PVEIN);
        return true;
      }
      if (dPv < 0.12) {
        et_setSample(s, et_T_VESSEL, -min(dPv, 0.12 - dPv), vec3(0.0, -1.0, 0.0), p, 0.0, et_S_PVEIN);
        return true;
      }
    }
    // venae cavae and hepatic vein
    {
      if (dSvc < 0.0) { et_setSample(s, et_T_BLOOD, dSvc, vec3(0.0, 0.0, -1.0), p, 0.0, et_S_SVC); return true; }
      if (dSvc < 0.12) { et_setSample(s, et_T_VESSEL, -min(dSvc, 0.12 - dSvc), vec3(0.0, 0.0, -1.0), p, 0.0, et_S_SVC); return true; }
      float dHv = et_sdCapsule(p, vec3(et_HV_AX, et_HV_AY, et_HV_AZ), vec3(et_HV_BX, et_HV_BY, et_HV_BZ), 0.4);
      if (dIvc < 0.0) { et_setSample(s, et_T_BLOOD, dIvc, vec3(0.0, 0.0, 1.0), p, 0.0, et_S_IVC); return true; }
      if (dIvc < 0.12 && dHv >= 0.0) { et_setSample(s, et_T_VESSEL, -min(dIvc, 0.12 - dIvc), vec3(0.0, 0.0, 1.0), p, 0.0, et_S_IVC); return true; }
      if (dHv < 0.0) { et_setSample(s, et_T_BLOOD, dHv, vec3(0.0, 0.0, 1.0), p, 0.0, et_S_HV); return true; }
      if (dHv < 0.08) { et_setSample(s, et_T_VESSEL, -min(dHv, 0.08 - dHv), vec3(0.0, 0.0, 1.0), p, 0.0, et_S_HV); return true; }
    }
    // coronary sinus
    {
      float rInflow = -et_MVL_CY + sqrt(max(0.0, et_MVL_R * et_MVL_R - et_MVL_CX * et_MVL_CX)) - et_mvInflowTaper(0.6);
      float gy = -(max(et_lvCavityRadius(-et_PI / 2.0, zAnn + 0.6), rInflow) + et_LV_LVPWD * et_LV_THICK_K + 0.4);
      float dCs = et_sdCapsule(p, vec3(2.2, gy * 0.85, zAnn + 0.35), vec3(ra.x + rar.x * 0.4, gy * 0.7, zAnn + 0.1), 0.33);
      if (dCs < 0.0) {
        et_setSample(s, et_T_BLOOD, dCs, vec3(0.0, -1.0, 0.0), p, 0.0, et_S_CS);
        return true;
      }
      if (dCs < 0.1) {
        et_setSample(s, et_T_VESSEL, -min(dCs, 0.1 - dCs), vec3(0.0, -1.0, 0.0), p, 0.0, et_S_CS);
        return true;
      }
    }
  }

  // ---------- RV ----------
  vec3 rvc = et_rvCrescent(p, az);
  float dRv = rvc.x;
  // decision 243: the inflow column inside the free wall below the hinges (rv.ts rvInflowSdf)
  float dIn = max(et_tvInflowSdf(p), length(p.xy) - rvc.z - et_rvInflowSlack(p.z - (et_TVS_CZ + et_tvOffsetAt(p.xy))));
  float dRvU = et_smin(dRv, dIn, 0.3);
  {
    float sc = et_CONTRACTION;
    float fw = et_rvFreeWallNow(et_RV_FW, sc);
    float k = et_rvOutflowScale(sc);
    // the outflow tract and the pulmonary root move with the base; the bifurcation stays (decision 111)
    vec3 rvotA = vec3(et_RVOT_AX, et_RVOT_AY, et_RVOT_AZ + et_PV_Z);
    vec3 rvotM = vec3(et_RVOT_MX, et_RVOT_MY, et_RVOT_MZ + et_PV_Z);
    vec3 rvotB = vec3(et_RVOT_BX, et_RVOT_BY, et_RVOT_BZ + et_PV_Z);
    vec3 paEnd = vec3(et_PA_EX, et_PA_EY, et_PA_EZ);
    float dRvot = min(et_sdRoundCone(p, rvotA, rvotM, et_RVOT_RA * k, et_RVOT_RM * k), et_sdRoundCone(p, rvotM, rvotB, et_RVOT_RM * k, et_RVOT_R * k));
    vec3 paStj = vec3(et_PA_SX, et_PA_SY, et_PA_SZ + et_PV_Z);
    float dPa = min(et_sdRoundCone(p, rvotB, paStj, et_PA_ROOT_R, et_PA_R), et_sdCapsule(p, paStj, paEnd, et_PA_R));
    float dRpa = et_sdCapsule(p, paEnd, vec3(et_RPA_EX, et_RPA_EY, et_RPA_EZ), et_RPA_R);
    float dLpa = et_sdCapsule(p, paEnd, vec3(et_LPA_EX, et_LPA_EY, et_LPA_EZ), et_LPA_R);
    float dTrunk = min(dPa, min(dRpa, dLpa));
    vec3 v = p - rvotB;
    if (dTrunk < 0.0) {
      et_setSample(s, et_T_BLOOD, dTrunk, v, p, 0.0, et_S_PA);
      return true;
    }
    if (dTrunk < 0.18 && dRvot > 0.0 && dRvU > 0.0) {
      et_setSample(s, et_T_VESSEL, -min(dTrunk, 0.18 - dTrunk), v, p, 0.0, et_S_PA);
      return true;
    }
    float dCavRv = et_smin(dRvU, dRvot, et_RV_OUTFLOW_BLEND_CM);
    float sc3 = 1.0 - 0.3 * sc;
    if (dCavRv < 0.0) {
      if (dRv < 0.0) {
        float L = et_LV_LEN;
        float rIn = rvc.y, rOut = rvc.z;
        vec3 b0 = vec3(-(rIn + 0.12), -0.2, L * 0.6);
        float rB = rOut - fw * 1.2;
        vec3 b1 = vec3(rB * cos(et_RV_PAP_AZ), rB * sin(et_RV_PAP_AZ), L * 0.68);
        float dBand = et_sdCapsule(p, b0, b1, 0.28);
        if (dBand < 0.0) {
          et_setSample(s, et_T_MYO, dBand, vec3(0.0, 0.0, 1.0), p, 0.0, et_S_MOD_BAND);
          return true;
        }
        float dRp = et_sdRoundCone(p, vec3(et_P(et_RVPAP_BASE), et_P(et_RVPAP_BASE + 1), et_P(et_RVPAP_BASE + 2)), vec3(et_P(et_RVPAP_BASE + 3), et_P(et_RVPAP_BASE + 4), et_P(et_RVPAP_BASE + 5)), et_P(et_RVPAP_BASE + 6), et_P(et_RVPAP_BASE + 7));
        if (dRp < 0.0) {
          et_setSample(s, et_T_MYO, dRp, vec3(x, y, 0.0), p, 0.0, et_S_RV_PAP);
          return true;
        }
      }
      float rr = length(p.xy); if (rr == 0.0) rr = 1.0;
      et_setSample(s, et_T_BLOOD, dCavRv, vec3(x / rr, y / rr, 0.0), vec3(x / sc3, y / sc3, z), 0.0, dRvot < dRvU ? et_S_RVOT : ((dRv >= 0.0 && z <= et_TV_CZ + et_TVZ + et_tvOffsetAt(p.xy)) ? et_S_RA_CAV : et_S_RV_CAV));
      return true;
    }
    if (dCavRv < fw) {
      float rr = length(p.xy); if (rr == 0.0) rr = 1.0;
      et_setSample(s, et_T_MYO, -min(dCavRv, fw - dCavRv), vec3(x / rr, y / rr, 0.0), vec3(x / sc3, y / sc3, z), 0.0, et_S_RV_WALL);
      return true;
    }
  }

  // ---------- pericardium & effusion ----------
  {
    float dLvEpi = dEllR - wallT - crestLoss;
    float fw = et_RV_FW;
    float dRvEpi = dRvU - fw;
    float dLaEpi = laEpi;
    float dRaEpi = min(et_sdEllipsoid(p, ra, rar + 0.22), raSleeve + 0.22);
    // the sac around the outflow tract and the trunk stays where the pericardium is anchored (decision 111)
    vec3 rvotA = vec3(et_RVOT_AX, et_RVOT_AY, et_RVOT_AZ);
    vec3 rvotB = vec3(et_RVOT_BX, et_RVOT_BY, et_RVOT_BZ);
    vec3 paEnd = vec3(et_PA_EX, et_PA_EY, et_PA_EZ);
    float dRvotEpi = et_sdCapsule(p, rvotA, rvotB, et_RVOT_RA + fw);
    vec3 paStj = vec3(et_PA_SX, et_PA_SY, et_PA_SZ);
    float dPaEpi = min(et_sdRoundCone(p, rvotB, paStj, et_PA_ROOT_R + 0.2, et_PA_R + 0.2), et_sdCapsule(p, paStj, paEnd, et_PA_R + 0.2));
    float dEpi = et_smax(et_smin(et_smin(et_smin(dLvEpi, dRvEpi, 0.8), et_smin(dLaEpi, dRaEpi, 0.8), 0.8), et_smin(dRvotEpi, dPaEpi, 0.8), 0.8), et_PERICARDIUM_CM - colDist, 0.2);
    // decision 255: the effusion thins over the left atrium
    float eff = et_EFFUSION > 0.0 ? min(et_effusionAt(et_EFFUSION, et_sdEllipsoid(p, la, lr + 0.25), min(min(min(dLvEpi, dRvEpi), min(dRaEpi, dRvotEpi)), dPaEpi)), max(0.0, dEpi + colDist - 2.0 * et_PERICARDIUM_CM)) : 0.0;
    vec3 nEpi = n0;
    if (dEpi < 0.0) {
      et_setSample(s, et_T_FAT, dEpi, nEpi, p, 0.0, et_S_EPI_FAT);
      return true;
    }
    if (dEpi < et_PERICARDIUM_CM) {
      float de = max(dEpi, 0.0);
      et_setSample(s, et_T_PERI, -min(de, 0.12 - de), nEpi, p, 0.0, et_S_PERI);
      return true;
    }
    if (eff > 0.0 && dEpi < 0.12 + eff) {
      et_setSample(s, et_T_FLUID, dEpi - 0.12 - eff, nEpi, p, 0.0, et_S_EFFUSION);
      return true;
    }
    if (eff > 0.0 && dEpi < 0.12 + eff + 0.12) {
      et_setSample(s, et_T_PERI, 0.0, nEpi, p, 0.0, et_S_PERI);
      return true;
    }
    // outside the sac: distance beyond the parietal pericardium or the wall of the ascending aorta (decision 144)
    float dSac = dEpi - 0.12 - (eff > 0.0 ? eff + 0.12 : 0.0);
    float dRoot = rootT > -90.0 ? rootRr - rootR - 0.2 : dSac;
    s.sdf = min(dSac, dRoot);
  }
  return false;
}
`;
