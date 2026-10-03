import { describe, expect, it } from 'vitest';
import { shadowEdgeLines } from '../app/testHooks';

/**
 * El núcleo de una sombra costal (lus-sim, decisión 42; `ribShadowStats`): las líneas con hueso lejos del borde de su sombra. Fuera
 * del sector no se sabe si la costilla sigue, así que su borde cuenta como un borde de la sombra: una línea del borde bajo una
 * costilla que acaba justo fuera no es núcleo (su cono de apertura ve la pleura de más allá).
 */
describe('shadowEdgeLines: la distancia de cada línea con hueso al borde de su sombra o del sector', () => {
  it('en medio del sector, la distancia a la línea sin hueso más cercana', () => {
    const bone = [false, false, true, true, true, true, true, false, false, false];
    expect(shadowEdgeLines(bone)).toEqual([-1, -1, 0, 1, 2, 1, 0, -1, -1, -1]);
  });

  it('una sombra que toca el borde del sector: la línea del borde está en el borde de su sombra, no en su núcleo', () => {
    // la costilla acaba fuera del sector, a la izquierda; su sombra ocupa las líneas 0–5
    const bone = [true, true, true, true, true, true, false, false];
    expect(shadowEdgeLines(bone)).toEqual([0, 1, 2, 2, 1, 0, -1, -1]);
    // y el sector entero bajo hueso: el núcleo es el centro
    expect(shadowEdgeLines([true, true, true, true, true])).toEqual([0, 1, 2, 1, 0]);
  });
});
