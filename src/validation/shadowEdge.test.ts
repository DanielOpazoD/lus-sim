import { describe, expect, it } from 'vitest';
import { shadowEdgeLines } from '../app/testHooks';

/**
 * El núcleo de una sombra costal (lus-sim, decisión 42; `ribShadowStats`): las líneas con hueso lejos del borde de su sombra. Más
 * allá del sector no se supone nada: unas líneas virtuales, clasificadas con la escena de la CPU, dicen si la costilla sigue. Si
 * sigue, la línea del borde puede ser núcleo; si acaba justo fuera, la línea del borde está en el borde de su sombra (su cono de
 * apertura ve la pleura de más allá).
 */
describe('shadowEdgeLines: la distancia de cada línea con hueso al borde de su sombra', () => {
  it('en medio del sector, la distancia a la línea sin hueso más cercana', () => {
    const bone = [false, false, true, true, true, true, true, false, false, false];
    expect(shadowEdgeLines(bone, [false, false], [false, false])).toEqual([-1, -1, 0, 1, 2, 1, 0, -1, -1, -1]);
  });

  it('una sombra que toca el borde del sector y una costilla que acaba justo fuera: la línea del borde, en el borde de su sombra', () => {
    const bone = [true, true, true, true, true, true, false, false];
    // la costilla acaba en la primera línea virtual de la izquierda: la sombra va de ella a la línea 5
    expect(shadowEdgeLines(bone, [true, false, false], [false, false, false])).toEqual([1, 2, 3, 2, 1, 0, -1, -1]);
    // y si no hay hueso fuera, la línea del borde es borde de la sombra (atrapa suponer que la costilla sigue)
    expect(shadowEdgeLines(bone, [false, false, false], [false, false, false])).toEqual([0, 1, 2, 2, 1, 0, -1, -1]);
  });

  it('una costilla que sigue fuera del sector: la línea del borde puede ser núcleo (atrapa suponer que fuera no hay hueso)', () => {
    const bone = [true, true, true, true, true, true, false, false];
    expect(shadowEdgeLines(bone, [true, true, true, true], [false, false])).toEqual([4, 4, 3, 2, 1, 0, -1, -1]);
    // la distancia se corta donde acaban las líneas virtuales
    expect(shadowEdgeLines([true, true, true], [true, true], [true, true])).toEqual([2, 3, 2]);
  });
});
