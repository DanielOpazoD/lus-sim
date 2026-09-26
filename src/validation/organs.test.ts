import { describe, expect, it } from 'vitest';
import { ANATOMY_GLSL } from '../anatomy/gpu/anatomy.glsl';
import { ORGAN_MODULES } from '../anatomy/organs';
import { LUNG_CURTAIN, inLungCurtain, inLungRecess, lungCurtainDistance, lungCurtainEdgeMm } from '../anatomy/organs/lungCurtain';

/**
 * Módulos de órgano (decisión 46): gemelos TS/GLSL juntos y con el mismo nombre.
 *
 * lus-sim (decisiones 10 y 12): los módulos del tórax (pared y cortina pulmonar); el shader ensamblado
 * (`ANATOMY_GLSL`, paso B2) incluye cada gemelo.
 */
describe('Módulos de órgano', () => {
  it('el registro tiene solo los módulos del tórax, en su orden de dependencia GLSL', () => {
    expect(ORGAN_MODULES.map((o) => o.id)).toEqual(['wall', 'lungCurtain']);
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
    const lung = ORGAN_MODULES.find((o) => o.id === 'lungCurtain')!.glsl;
    expect(lung).toContain(`const float PLEURA_X_MAX = ${LUNG_CURTAIN.pleuraXMax.toFixed(1)};`);
  });

  it('las funciones TS del módulo se comportan como documentan', () => {
    // cortina: solo bajo la pared, en el lado derecho y por encima del borde que baja al inspirar
    expect(lungCurtainDistance([-100, 0, 10], 1, 0)).toBeNull();
    expect(lungCurtainDistance([-100, 0, 10], 1, 30)).toBeCloseTo(1, 9);
    expect(lungCurtainDistance([-100, 0, 10], LUNG_CURTAIN.thicknessMm + 1, 30)).toBeNull();
    // fuera del hemitórax derecho (decisión 71: la huella llega a la línea media, delante y detrás)
    expect(lungCurtainDistance([20, 0, 10], 1, 30)).toBeNull();
    // la lámina que baja sobre el hígado sigue solo en el receso lateral y posterior (la pleura anterior no la necesita)
    expect(lungCurtainDistance([-60, 90, 10], 1, 30)).toBeNull();
    expect(inLungCurtain([-100, 0, 10], 1, 30)).toBe(true);
    expect(inLungCurtain([-100, 0, 10], 1, 0)).toBe(false);
  });

  it('la pleura parietal: el receso toca la pared en todo el hemitórax derecho y en ningún punto del izquierdo', () => {
    // bajo la pared, hasta el espesor de la lámina, a la derecha de pleuraXMax (decisión 71 de VExUS)
    expect(inLungRecess([-80, 60, 90], 0.5)).toBe(true);
    expect(inLungRecess([LUNG_CURTAIN.pleuraXMax, 60, 90], 0.5)).toBe(true);
    expect(inLungRecess([LUNG_CURTAIN.pleuraXMax + 0.01, 60, 90], 0.5)).toBe(false);
    expect(inLungRecess([-80, 60, 90], LUNG_CURTAIN.thicknessMm)).toBe(false);
    // limitación `lung-curtain-right-only`: en el hemitórax izquierdo no hay borde del pulmón que toque la pared
    expect(lungCurtainEdgeMm([80, 60, 90], 0, 10)).toBeNull();
    // fuera de la huella de la lámina (pared anterior), el borde es la inserción del diafragma
    expect(lungCurtainEdgeMm([-80, 60, 90], 0, 10)).toBe(80);
    // en la huella de la lámina, el borde baja con el diafragma (z0 − descenso) si queda por debajo de la inserción
    expect(lungCurtainEdgeMm([-100, 0, 10], 0, 40)).toBe(10 - LUNG_CURTAIN.z0);
    expect(lungCurtainEdgeMm([-100, 0, 10], 30, 40)).toBe(10 - (LUNG_CURTAIN.z0 - 30));
  });
});
