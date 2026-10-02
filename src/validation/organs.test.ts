import { describe, expect, it } from 'vitest';
import { ANATOMY_GLSL } from '../anatomy/gpu/anatomy.glsl';
import { ORGAN_MODULES } from '../anatomy/organs';
import { LUNG_CURTAIN, inLungCurtain, inLungRecess, lungCurtainDistance, lungCurtainEdgeMm } from '../anatomy/organs/lungCurtain';
import { LUNG_BORDER, LUNG_SLIDING, zoaThicknessMm } from '../anatomy/organs/lungBorder';

/**
 * Módulos de órgano (decisión 46): gemelos TS/GLSL juntos y con el mismo nombre.
 *
 * lus-sim (decisiones 10 y 12): los módulos del tórax (pared y cortina pulmonar); el shader ensamblado
 * (`ANATOMY_GLSL`, paso B2) incluye cada gemelo.
 */
describe('Módulos de órgano', () => {
  it('el registro tiene solo los módulos del tórax, en su orden de dependencia GLSL', () => {
    // lus-sim (decisión 16): la parrilla costal, propia, tras la pared (usa su `wallArc`); (decisión 17) la pared torácica
    // por región, antes de la pared (la pared lee sus capas); (decisión 18) los bordes del pulmón y el corazón, antes de la
    // cortina (que los lee); (cobertura torácica) la cúpula pleural, antes de la pared torácica (que suma su grosor)
    // (decisión 29) las apófisis espinosas, tras la parrilla (usan la altura de sus vértebras)
    expect(ORGAN_MODULES.map((o) => o.id)).toEqual([
      'lungApex',
      'chestWall',
      'wall',
      'ribcage',
      'spine',
      'lungBorder',
      'heart',
      'lungPulse',
      'lungCurtain',
    ]);
  });

  for (const o of ORGAN_MODULES) {
    it(`${o.id}: cada función GLSL tiene su gemela TS exportada y el shader la incluye`, () => {
      const fns = [...o.glsl.matchAll(/^\s*(?:float|vec[234]|bool|int)\s+(\w+)\s*\(/gm)].map((m) => m[1]);
      expect(fns.length).toBeGreaterThan(0);
      const gpuOnly = Object.keys(o.gpuOnly ?? {});
      for (const f of fns.filter((f) => !gpuOnly.includes(f)))
        expect(typeof o.exports[f], `${o.id}: falta la gemela TS de ${f}`).toBe('function');
      // la lista de excepciones no se queda vieja: nombra funciones GLSL que existen y no tienen gemela
      for (const f of gpuOnly) {
        expect(fns, `${o.id}: gpuOnly nombra ${f}, que no está en el GLSL`).toContain(f);
        expect(o.exports[f], `${o.id}: ${f} ya tiene gemela TS; sácala de gpuOnly`).toBeUndefined();
      }
      expect(ANATOMY_GLSL).toContain(o.glsl);
    });
  }

  it('las constantes del shader salen del módulo, no de literales copiados', () => {
    const border = ORGAN_MODULES.find((o) => o.id === 'lungBorder')!.glsl;
    const P = LUNG_BORDER.params;
    expect(border).toContain(`#define LB_RIM_MM ${P.rimBlendMm.value.toFixed(4)}`);
    expect(border).toContain(`#define LB_ZOA_FRC ${P.zoaFrcMm.value.toFixed(4)}`);
    expect(border).toContain(`#define LB_ZOA_TLC ${P.zoaTlcMm.value.toFixed(4)}`);
    expect(border).toContain(`#define LB_ZOA_TLC_CAUDAL ${P.zoaTlcCaudalMm.value.toFixed(4)}`);
    expect(border).toContain(`#define LB_ZOA_BELOW ${P.zoaBelowReflectionMm.value.toFixed(4)}`);
    expect(border).toContain(`#define LB_SLIDE_BASE ${LUNG_SLIDING.params.baseAboveBorderMm.value.toFixed(4)}`);
    // el deslizamiento por región (decisión 19), letra a letra: la gemela TS (`lungSlideMm`) hace la misma cuenta
    expect(border.replace(/\s+/g, ' ')).toContain(
      'float lungSlideMm(vec3 m) { vec4 b = lungBorderAt(wallArc(m)); float base = b.x + LB_SLIDE_BASE; return min(uCurtain.x, b.x - b.y) * clamp((b.w - m.z) / (b.w - base), 0.0, 1.0); }',
    );
    // el espesor de la lámina, del uniform (uCurtain.y = LUNG_CURTAIN.thicknessMm)
    expect(ORGAN_MODULES.find((o) => o.id === 'lungCurtain')!.glsl).toContain('if (insideWall >= uCurtain.y) return -1.0;');
  });

  it('las funciones TS del módulo se comportan como documentan', () => {
    // cortina: solo bajo la pared (el espesor de la lámina) y por encima del borde de su columna (el que baja al inspirar)
    expect(lungCurtainDistance([-100, 0, 10], 1, 12)).toBeNull();
    expect(lungCurtainDistance([-100, 0, 10], 1, -20)).toBeCloseTo(1, 9);
    expect(lungCurtainDistance([-100, 0, 10], 2.5, -20)).toBeCloseTo(0.5, 9);
    expect(lungCurtainDistance([-100, 0, 10], 1, 9.5)).toBeCloseTo(0.5, 9);
    expect(lungCurtainDistance([-100, 0, 10], LUNG_CURTAIN.thicknessMm + 1, -20)).toBeNull();
    // lus-sim (decisión 18): a los dos lados y delante (en VExUS, solo el receso lateral y posterior derecho)
    expect(lungCurtainDistance([100, 0, 10], 1, -20)).toBeCloseTo(1, 9);
    expect(lungCurtainDistance([-60, 90, 10], 1, -20)).toBeCloseTo(1, 9);
    expect(inLungCurtain([-100, 0, 10], 1, -20)).toBe(true);
    expect(inLungCurtain([-100, 0, 10], 1, 12)).toBe(false);
    // la ZOA engruesa al inspirar: de FRC a TLC (el descenso que se toma por TLC), sin pasar de TLC
    const P = LUNG_BORDER.params;
    expect(zoaThicknessMm(0)).toBe(P.zoaFrcMm.value);
    expect(zoaThicknessMm(P.zoaTlcCaudalMm.value)).toBeCloseTo(P.zoaTlcMm.value, 9);
    expect(zoaThicknessMm(2 * P.zoaTlcCaudalMm.value)).toBeCloseTo(P.zoaTlcMm.value, 9);
  });

  it('la pleura parietal: el pulmón toca la pared en los dos hemitórax', () => {
    // bajo la pared, hasta el espesor de la lámina (lus-sim, decisión 18: sin el límite x ≤ 10 de la decisión 71 de VExUS)
    expect(inLungRecess([-80, 60, 90], 0.5)).toBe(true);
    expect(inLungRecess([80, 60, 90], 0.5)).toBe(true);
    expect(inLungRecess([-80, 60, 90], LUNG_CURTAIN.thicknessMm)).toBe(false);
    // el borde del pulmón que toca la pared: z menos el de su columna
    expect(lungCurtainEdgeMm([80, 60, 90], 10)).toBe(80);
    expect(lungCurtainEdgeMm([-100, 0, 10], -20)).toBe(30);
  });
});
