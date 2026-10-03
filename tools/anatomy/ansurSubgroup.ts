/**
 * Las cifras del subgrupo de IMC 18,5–25 de ANSUR II (lus-sim, decisiones 28 y 42): el ancho de la mano (`anatomy.hands`) y la
 * profundidad del tórax (`anatomy.torso`) de los varones con el IMC del avatar, de los datos públicos de la encuesta
 * [@gordon-ansur-2014]. Los CSV viven fuera del repo (`ANSUR_II_MALE_Public.csv` y `ANSUR_II_FEMALE_Public.csv`, del sitio que
 * cita `docs/REFERENCES.md`); la ruta de la carpeta, en el primer argumento o en `LUS_ANSUR_DIR`.
 *
 *   npx tsx tools/anatomy/ansurSubgroup.ts ~/datos/lus-referencia/antropometria
 *
 * Unidades de los CSV: longitudes en mm, `weightkg` en décimas de kg, `stature` en mm.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? process.env.LUS_ANSUR_DIR;
if (!dir) {
  console.error('ansurSubgroup: falta la carpeta de los CSV de ANSUR II (argumento o LUS_ANSUR_DIR)');
  process.exit(2);
}

function rows(file: string): Record<string, string>[] {
  const text = readFileSync(join(dir, file), 'latin1').trim().split(/\r?\n/);
  // el primer encabezado puede llevar la marca de orden de bytes (en latin1, caracteres no alfanuméricos)
  const head = text[0].split(',').map((h) => h.replace(/^\W+/, '').trim());
  return text.slice(1).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(head.map((h, i) => [h, cells[i]]));
  });
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v: number[]) => {
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
};
const corr = (a: number[], b: number[]) => {
  const ma = mean(a);
  const mb = mean(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / ((a.length - 1) * sd(a) * sd(b));
};
const f1 = (x: number) => x.toFixed(1);

for (const [label, file] of [
  ['varones', 'ANSUR_II_MALE_Public.csv'],
  ['mujeres', 'ANSUR_II_FEMALE_Public.csv'],
] as const) {
  const all = rows(file).map((r) => ({
    bmi: Number(r.weightkg) / 10 / (Number(r.stature) / 1000) ** 2,
    handbreadth: Number(r.handbreadth),
    handlength: Number(r.handlength),
    chestdepth: Number(r.chestdepth),
  }));
  const sub = all.filter((r) => r.bmi >= 18.5 && r.bmi < 25);
  const hb = sub.map((r) => r.handbreadth);
  const cd = sub.map((r) => r.chestdepth);
  console.log(
    `${label}: n ${all.length} (IMC ${f1(mean(all.map((r) => r.bmi)))}); IMC 18,5–25: n ${sub.length}, IMC ${f1(mean(sub.map((r) => r.bmi)))}`,
  );
  console.log(
    `  ancho de la mano ${f1(mean(hb))} ± ${f1(sd(hb))} mm (todos: ${f1(mean(all.map((r) => r.handbreadth)))} ± ${f1(sd(all.map((r) => r.handbreadth)))})`,
  );
  console.log(`  profundidad del tórax ${f1(mean(cd))} ± ${f1(sd(cd))} mm`);
  console.log(
    `  correlación ancho–largo de la mano en el subgrupo: r = ${corr(
      hb,
      sub.map((r) => r.handlength),
    ).toFixed(2)}`,
  );
}
