import { chai, describe, expect, it } from 'vitest';
import { AnatomyScene } from '../anatomy/scene';
import { thoraxLinePhi } from '../anatomy/thoraxLines';
import { Tissue } from '../anatomy/tissues';
import { defaultPatient } from '../physiology/patientState';
import {
  BORDER_MARGIN_MM,
  SITTING_REACH,
  SUPINE_REACH,
  baseBorderZ,
  explorationCoverage,
  probeCenterContent,
  vertebraZ,
  organOk,
  KIDNEY_TISSUES,
  type CoverageCell,
  type PositionReach,
} from '../app/coverage';
import { longitudinalPose } from './support/chestView';

/**
 * Cobertura de exploración (decisión 26; requisito de cobertura de `docs/MISSION.md`: el pulmón se explora entero, meta del
 * 100 % en la versión 0.2.0). `app/coverage.ts` recorre, por hemitórax, los EIC 1.º–11.º de las líneas paraesternal,
 * medioclavicular, axilares, escapular y paravertebral, el vértice (en todo el corte, bajo el tercio medial de la clavícula y
 * fuera de él) y la fosa supraclavicular; en cada celda pregunta si la sonda se apoya ahí en alguna posición del paciente
 * admitida y si bajo la pared está lo que la base pone ahí.
 *
 * Cada celda es una prueba: las que se cumplen protegen lo logrado (`it`); las que aún no, `notYetMet` con su motivo, que
 * exige el fallo por la aserción y falla cuando alguien la arregla, para pasarla a `it` en el mismo cambio.
 */
const scene = new AnatomyScene(defaultPatient());
const report = explorationCoverage(scene);

const BOTH = ['D', 'I'] as const;

/**
 * Celdas que aún no se cumplen (03-10-2026, medido: 136 de 138; antes del estómago, los riñones y el bazo normal de la decisión 43,
 * 127; antes del hígado y el bazo de la decisión 37, 106), con su motivo: el bazo es el de un adulto normal (decisión 43: 11 × 6,5
 * × 4 cm, en el sitio de la TC, entre la 10.ª y la 12.ª costilla y con el eje en la 11.ª), y no se deforma para cubrir lo que las
 * marcas de superficie de Gray le piden:
 *  - la escapular izquierda en el EIC10: Gray pone ahí su polo posterior (a 4 cm de la línea media en T9), que un bazo normal no
 *    alcanza en el avatar;
 *  - la axilar posterior izquierda en el EIC9: el bazo llega ahí desde la 9.ª costilla en 4 de cada 10 adultos (Shen y cols.); el
 *    del modelo, en la banda más frecuente, empieza en la 10.ª.
 * La axilar posterior izquierda en el EIC11, que en la primera versión de la decisión 43 quedaba bajo el bazo (el ángulo esplénico
 * del colon), la cubre el bazo normal.
 */
const NOT_YET_MET: ReadonlySet<string> = new Set(['I LAP EIC9', 'I LE EIC10']);

function notYetMet(title: string, body: () => void): void {
  it(`${title} [aún no se cumple]`, () => {
    expect(body).toThrow(chai.AssertionError);
  });
}

function describeCell(c: CoverageCell): string {
  return `${c.id}: se espera ${c.expected}${c.content ? `, hay ${c.content}` : ''}${c.position ? ` (${c.position})` : ''}: ${c.reason}`;
}

describe('cobertura de exploración: cada celda', () => {
  for (const c of report.cells) {
    const body = () => {
      expect(c.reason, describeCell(c)).toBeNull();
      expect(c.met, describeCell(c)).toBe(true);
    };
    if (NOT_YET_MET.has(c.id)) notYetMet(c.id, body);
    else it(c.id, body);
  }

  it('la lista de lo pendiente nombra celdas que existen', () => {
    const ids = new Set(report.cells.map((c) => c.id));
    for (const id of NOT_YET_MET) expect(ids.has(id), id).toBe(true);
  });
});

describe('cobertura de exploración: el total', () => {
  // medido (03-10-2026): 136/138 (anterior 28/28, lateral 59/60, posterior 43/44, vértice 6/6); con la decisión 37, 127/138
  // (anterior 25/28, lateral 56/60, posterior 40/44); antes, 106/138 (anterior 20/28, lateral 42/60, posterior 38/44)
  it('el total y las regiones: lo medido con el estómago, los riñones y el bazo normal (decisión 43)', () => {
    expect(`${report.met}/${report.total}`).toBe('136/138');
    expect(report.byRegion).toEqual({
      anterior: { met: 28, total: 28 },
      lateral: { met: 59, total: 60 },
      posterior: { met: 43, total: 44 },
      apex: { met: 6, total: 6 },
    });
  });
  notYetMet('la cobertura es completa (meta v0.2.0: 100 %)', () => {
    expect(`${report.met}/${report.total}`).toBe(`${report.total}/${report.total}`);
  });

  it('el informe cuenta las celdas por región sin perder ninguna', () => {
    const sum = Object.values(report.byRegion).reduce((a, r) => a + r.total, 0);
    expect(sum).toBe(report.total);
    expect(Object.values(report.byRegion).reduce((a, r) => a + r.met, 0)).toBe(report.met);
    expect(report.met).toBe(report.cells.filter((c) => c.met).length);
  });
});

describe('cobertura de exploración: las celdas son las de la anatomía', () => {
  const cell = (id: string) => report.cells.find((c) => c.id === id)!;

  it('cada línea tiene los espacios que cruza la parrilla del adulto promedio (decisión 16), en los dos lados', () => {
    // espacios por línea: uno menos que las costillas que la cruzan (7, 9, 10, 11 y 12 en la paraesternal, la LMC, la LAA,
    // la LAM y la LAP; 12 en la escapular y la paravertebral), del 1.º hacia abajo y sin huecos
    const want: Record<string, number> = { PE: 6, LMC: 8, LAA: 9, LAM: 10, LAP: 11, LE: 11, PV: 11 };
    for (const s of BOTH)
      for (const [l, n] of Object.entries(want)) {
        const got = report.cells.filter((c) => c.kind === 'ics' && c.id.startsWith(`${s} ${l} EIC`)).map((c) => c.ics);
        expect(got, `${s} ${l}`).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      }
    expect(report.cells.filter((c) => c.kind === 'supraclavicular')).toHaveLength(2);
    expect(report.cells.filter((c) => c.kind === 'aboveApex')).toHaveLength(4);
  });

  it('el borde de Gray en FRC: la LMC con pulmón hasta el EIC5 y la LAM hasta el EIC7, lo de debajo después', () => {
    for (const s of BOTH) {
      expect(cell(`${s} LMC EIC5`).expected).toBe('lung');
      expect(cell(`${s} LMC EIC6`).expected).toBe('below');
      expect(cell(`${s} LAM EIC7`).expected).toBe('lung');
      expect(cell(`${s} LAM EIC8`).expected).toBe('below');
      // detrás, T11 (la punta de la apófisis de T10): el EIC10 paravertebral es borde (su centro, a 4,2 mm del de Gray desde que
      // las costillas acaban junto a la transversa de 29,3 mm, decisión 29; antes, a 8,5: pulmón) y el 11, lo de debajo
      expect(cell(`${s} PV EIC10`).expected).toBe('border');
      expect(cell(`${s} PV EIC11`).expected).toBe('below');
    }
  });

  it('entre anclajes, el intervalo de sus alturas (no el mismo número de costilla en otra línea)', () => {
    for (const s of [-1, 1] as const) {
      const lam = baseBorderZ(scene, 'midaxillary', s)[0];
      const back = vertebraZ(11);
      for (const line of ['posteriorAxillary', 'scapular'] as const) {
        const [lo, hi] = baseBorderZ(scene, line, s);
        expect(lo).toBeCloseTo(Math.min(lam, back), 9);
        expect(hi).toBeCloseTo(Math.max(lam, back), 9);
        // las dos alturas de Gray caen a pocos mm (la 8.ª costilla en la LAM y T11): el borde no puede subir detrás
        expect(hi - lo).toBeLessThan(BORDER_MARGIN_MM);
      }
    }
  });

  it('lo esperado baja monótono por cada línea y con a lo sumo dos espacios de borde', () => {
    const rank: Record<string, number> = { lung: 0, scapula: 0, heart: 1, border: 2, heartOrBelow: 2, below: 3 };
    for (const s of [-1, 1] as const)
      for (const line of [
        'parasternal',
        'midclavicular',
        'anteriorAxillary',
        'midaxillary',
        'posteriorAxillary',
        'scapular',
        'paravertebral',
      ]) {
        const cells = report.cells.filter((c) => c.kind === 'ics' && c.side === s && c.line === line);
        const r = cells.map((c) => rank[c.expected]);
        for (let i = 1; i < r.length; i++) expect(r[i], `${s} ${line} EIC${i + 1}`).toBeGreaterThanOrEqual(r[i - 1]);
        expect(cells.filter((c) => c.expected === 'border').length, `${s} ${line}`).toBeLessThanOrEqual(2);
      }
    // la ventana cardiaca de A-T16: paraesternal izquierda, EIC 4.º–5.º, y su borde caudal en el 6.º
    expect(report.cells.filter((c) => c.expected === 'heart').map((c) => c.id)).toEqual(['I PE EIC4', 'I PE EIC5']);
    expect(cell('I PE EIC6').expected).toBe('heartOrBelow');
  });

  it('la escápula con los brazos a los lados: la línea escapular del ángulo inferior (apófisis de T8) a la altura del superior', () => {
    for (const s of BOTH) {
      expect(cell(`${s} LE EIC1`).expected).toBe('lung');
      for (let n = 2; n <= 8; n++) expect(cell(`${s} LE EIC${n}`).expected, `${s} LE EIC${n}`).toBe('scapula');
      expect(cell(`${s} LE EIC9`).expected).toBe('lung');
      // la paravertebral, a 6 cm de la línea media, queda por dentro del borde medial (≈ 9 cm, Pontin): pulmón
      for (let n = 1; n <= 9; n++) expect(cell(`${s} PV EIC${n}`).expected).toBe('lung');
    }
  });
});

describe('cobertura de exploración: el medidor mira lo que hay', () => {
  it('ve el pulmón con su pleura en el punto BLUE superior, el corazón en la ventana cardiaca y el hueso sobre una costilla', () => {
    const lmc = thoraxLinePhi('midclavicular', scene.torso);
    const blue = probeCenterContent(scene, longitudinalPose(lmc, 83.7));
    expect(blue.content).toBe('lung');
    // A-T1: la pleura a 12–20 mm
    expect(blue.pleuraMm!).toBeGreaterThan(12);
    expect(blue.pleuraMm!).toBeLessThan(20);
    const window = report.cells.find((c) => c.id === 'I PE EIC4')!;
    expect(probeCenterContent(scene, longitudinalPose(window.phi, window.z)).content).toBe('heart');
    expect(probeCenterContent(scene, longitudinalPose(lmc, 99.7)).content).toBe('bone');
  });

  it('el cartílago costal deja pasar el haz (A-T17): sobre él, el pulmón de debajo', () => {
    // el 3.er cartílago izquierdo en la paraesternal (z ≈ 80): sin calcificar, el haz sigue hasta la pleura
    const ps = thoraxLinePhi('parasternal', scene.torso, 1);
    const m = probeCenterContent(scene, longitudinalPose(ps, 80));
    expect(m.content).toBe('lung');
  });

  it('bajo el borde, el diafragma y el órgano: el hígado a la derecha, el bazo, el estómago y los riñones (decisión 43)', () => {
    const at = (id: string) => report.cells.find((x) => x.id === id)!;
    for (const id of ['D LAM EIC9', 'D LMC EIC7', 'I PE EIC6']) {
      expect(at(id).content, id).toBe('below');
      expect([Tissue.Liver, Tissue.LiverCapsule], id).toContain(at(id).organ);
      expect(at(id).met, id).toBe(true);
    }
    // el bazo normal, en la axilar media y la posterior
    for (const id of ['I LAM EIC10', 'I LAP EIC10', 'I LAP EIC11']) {
      expect(at(id).organ, id).toBe(Tissue.Spleen);
      expect(at(id).met, id).toBe(true);
    }
    // en el espacio de Traube, el estómago: su pared (el tejido del «resto») dentro de su forma
    for (const id of ['I LMC EIC6', 'I LMC EIC7', 'I LMC EIC8', 'I LAA EIC7', 'I LAA EIC8', 'I LAA EIC9', 'I LAM EIC8', 'I LAM EIC9']) {
      expect(at(id).content, id).toBe('below');
      expect(at(id).organ, id).toBe(Tissue.Bowel);
      expect(at(id).stomach, id).toBe(true);
      expect(at(id).met, id).toBe(true);
    }
    // detrás, el riñón (con su grasa), tras la grasa retroperitoneal que el medidor cruza
    for (const id of ['D PV EIC11', 'I LE EIC11', 'I PV EIC11']) {
      expect(KIDNEY_TISSUES.has(at(id).organ!), id).toBe(true);
      expect(at(id).met, id).toBe(true);
    }
    // en la escapular derecha, el lóbulo derecho del hígado, que rodea por fuera el polo superior del riñón (la sombra del riñón
    // solo quita lo que tiene su grasa delante; decisión 43)
    expect([Tissue.Liver, Tissue.LiverCapsule]).toContain(at('D LE EIC11').organ);
    expect(at('D LE EIC11').met).toBe(true);

    // sobre el bazo normal, en la axilar posterior, y su polo posterior en la escapular: no los hay
    for (const id of ['I LAP EIC9', 'I LE EIC10']) {
      expect(at(id).content, id).toBe('below');
      expect(at(id).organ, id).not.toBe(Tissue.Spleen);
      expect(at(id).met, id).toBe(false);
    }
  });

  it('el órgano cuenta solo en su lado: el bazo y el estómago no valen a la derecha, ni el «resto» en ninguno', () => {
    expect(organOk(1, Tissue.Spleen)).toBe(true);
    expect(organOk(-1, Tissue.Spleen)).toBe(false);
    expect(organOk(1, Tissue.Bowel, true)).toBe(true);
    expect(organOk(-1, Tissue.Bowel, true)).toBe(false);
    for (const s of [-1, 1] as const) {
      expect(organOk(s, Tissue.Liver)).toBe(true);
      expect(organOk(s, Tissue.LiverCapsule)).toBe(true);
      for (const t of KIDNEY_TISSUES) expect(organOk(s, t)).toBe(true);
      expect(organOk(s, Tissue.Bowel)).toBe(false);
      expect(organOk(s, Tissue.RetroperitonealFat)).toBe(false);
      expect(organOk(s, null)).toBe(false);
    }
  });

  it('el motivo de cada celda pendiente dice lo que pone ahí la base', () => {
    const reason = (id: string) => report.cells.find((x) => x.id === id)!.reason!;
    expect(reason('I LAP EIC9')).toContain('Shen');
    expect(reason('I LE EIC10')).toContain('polo posterior');
  });

  it('con la sonda en cualquier sitio (sin posición que la limite), la espalda muestra el pulmón y la base lo de debajo', () => {
    // mutación de la posición: lo que falla detrás es solo el alcance, no el medidor
    const anywhere: PositionReach = { id: 'cualquiera', admit: (p) => p };
    const all = explorationCoverage(scene, [anywhere]);
    const back = all.cells.filter((c) => c.kind === 'ics' && (c.line === 'scapular' || c.line === 'paravertebral'));
    expect(back.length).toBe(44);
    for (const c of back) expect(c.position, c.id).toBe('cualquiera');
    for (const c of back.filter((x) => x.expected === 'lung')) expect(c.content, c.id).toBe('lung');
    for (const c of back.filter((x) => x.expected === 'below')) expect(c.content, c.id).toBe('below');
  });

  it('sentado (decisión 29) alcanza la espalda; cada celda dice la primera posición que la alcanza (supino antes)', () => {
    const pv = thoraxLinePhi('paravertebral', scene.torso, -1);
    expect(SITTING_REACH.admit(longitudinalPose(pv, 0))).not.toBeNull();
    expect(SITTING_REACH.admit(longitudinalPose(thoraxLinePhi('paravertebral', scene.torso, 1), 0))).not.toBeNull();
    expect(SITTING_REACH.admit(longitudinalPose(1.5 * Math.PI, 0))).not.toBeNull();
    expect(SITTING_REACH.admit(longitudinalPose(Math.PI / 2, 250))).toBeNull();
    for (const c of report.cells.filter((x) => x.kind === 'ics')) {
      const back = c.line === 'scapular' || c.line === 'paravertebral';
      expect(c.position, c.id).toBe(back ? 'sitting' : 'supine');
    }
    // solo en supino, la espalda vuelve a quedar fuera
    const supine = explorationCoverage(scene, [SUPINE_REACH]);
    expect(supine.byRegion.posterior.met).toBe(0);
  });

  it('en supino no alcanza la espalda: el límite es el de clampPose', () => {
    const pv = thoraxLinePhi('paravertebral', scene.torso, -1);
    expect(SUPINE_REACH.admit(longitudinalPose(pv, 0))).toBeNull();
    expect(SUPINE_REACH.admit(longitudinalPose(1.15 * Math.PI, 0))).not.toBeNull();
    expect(SUPINE_REACH.admit(longitudinalPose(Math.PI / 2, 250))).toBeNull();
    // la izquierda también se alcanza en otra vuelta del ángulo
    expect(SUPINE_REACH.admit(longitudinalPose(-0.15 * Math.PI + 2 * Math.PI, 0))).not.toBeNull();
  });
});
