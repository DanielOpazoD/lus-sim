/**
 * Propuesta y revisión de la geometría de los clips del banco de referencia (decisión 21):
 *
 *   npm run fidelity:geometry -- --out /carpeta/fuera/del/repo [--dir …] [--only LUS-01]
 *
 * Para cada clip del manifiesto: el detector propone la geometría del sector sobre el clip entero (`detectSector`), las marcas
 * quemadas fijas dentro del sector (texto, puntos de profundidad: píxeles quietos y brillantes) y el negro del vídeo; y deja en
 * `--out` una hoja de contacto por clip (el cuadro medio con la geometría del manifiesto en verde, la propuesta en magenta, las
 * zonas excluidas en azul, y la pleura en rojo, las líneas A en amarillo y las superficies costales en cian detectadas en el
 * cuadro medio y, a la derecha, en un cuadro del medio del clip, que es como mide el banco) y `proposals.json`. Una persona
 * revisa las hojas y fija la geometría en el manifiesto: la medición usa la fijada, nunca la propuesta. `--out` debe quedar
 * fuera del repositorio (las hojas son imagen de pacientes), y en las hojas todo lo que está fuera del sector fijado o en sus
 * zonas excluidas sale en negro: el texto quemado (LUS-03 trae el número de registro, la institución y la fecha) no llega a
 * ninguna hoja.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import {
  beamSampler,
  detectSector,
  GREY_8BIT,
  insideSector,
  outsideBlack,
  temporalStats,
  type Rect,
  type SectorGeometry,
} from '../../src/measure/fidelity/sector';
import { detectStructures } from '../../src/measure/fidelity/structures';
import { decodeGrey, locateFile, type Manifest } from './reference';

/**
 * Marcas quemadas dentro del sector: componentes de píxeles quietos (σ temporal ≤ 1 gris) y brillantes (≥ 60 grises sobre el
 * negro) de al menos 4 px, como rectángulos con 2 px de margen. Solo una propuesta: una persona la revisa.
 */
export function staticMarks(
  mean: ArrayLike<number>,
  std: ArrayLike<number>,
  W: number,
  H: number,
  g: SectorGeometry,
  black: number,
): Rect[] {
  const mark = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (insideSector(g, x, y) && std[i] <= 1 && mean[i] >= black + 60) mark[i] = 1;
    }
  const seen = new Uint8Array(W * H);
  const rects: Rect[] = [];
  for (let s = 0; s < W * H; s++) {
    if (!mark[s] || seen[s]) continue;
    const stack = [s];
    seen[s] = 1;
    let n = 0;
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    while (stack.length) {
      const i = stack.pop()!;
      n++;
      const x = i % W;
      const y = (i - x) / W;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const k = yy * W + xx;
          if (mark[k] && !seen[k]) {
            seen[k] = 1;
            stack.push(k);
          }
        }
    }
    if (n >= 4) rects.push({ x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2 });
  }
  return rects;
}

function writePng(path: string, W: number, H: number, rgb: Uint8Array, ffmpeg: string): void {
  const ppm = `${path}.ppm`;
  writeFileSync(ppm, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), Buffer.from(rgb)]));
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-i', ppm, `${path}.png`]);
  rmSync(ppm, { force: true });
  if (r.status !== 0) throw new Error(`ffmpeg no escribió ${path}.png: ${r.stderr?.toString()}`);
}

const isMain = process.argv[1]?.endsWith('geometry.ts');
if (isMain) {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1] ?? '');
  const out = args.get('out');
  if (!out) throw new Error('fidelity:geometry — falta --out (una carpeta fuera del repositorio)');
  const outDir = resolve(out);
  if (!relative(process.cwd(), outDir).startsWith('..'))
    throw new Error(`fidelity:geometry — ${outDir} está dentro del repositorio: las hojas son imagen de pacientes`);
  mkdirSync(outDir, { recursive: true });
  const dir = resolve(args.get('dir') ?? process.env.LUS_REFERENCE_DIR ?? join(homedir(), 'datos', 'lus-referencia'));
  const ffmpeg = args.get('ffmpeg') ?? '/opt/homebrew/bin/ffmpeg';
  const only = args.get('only');
  const manifest = JSON.parse(readFileSync(args.get('manifest') ?? 'docs/reference-bank/MANIFEST.json', 'utf8')) as Manifest;
  const proposals: Record<string, unknown> = {};
  for (const item of manifest.items) {
    if (only && item.id !== only) continue;
    const path = locateFile(dir, item.file);
    if (!path) {
      console.log(`${item.id}: no está`);
      continue;
    }
    const d = decodeGrey(path, ffmpeg);
    const det = detectSector(d.frames, GREY_8BIT);
    const fixed = item.sector?.geometry ?? det.geometry;
    const black = outsideBlack(d.frames, fixed, item.sector?.exclude ?? []) ?? 0;
    const { mean, std } = temporalStats(d.frames);
    const marks = staticMarks(mean, std, d.width, d.height, fixed, black);
    proposals[item.id] = { detected: det, black, marks };
    // hoja de contacto: el cuadro medio con las geometrías y la detección, y un cuadro del medio sin tocar
    const W = d.width;
    const H = d.height;
    const rgb = new Uint8Array(W * 2 * H * 3);
    const put = (x: number, y: number, c: [number, number, number]): void => {
      const xi = Math.round(x);
      const yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= 2 * W || yi >= H) return;
      rgb.set(c, (yi * 2 * W + xi) * 3);
    };
    const mid = d.frames[Math.floor(d.frames.length / 2)];
    const hidden = [...(item.sector?.exclude ?? []), ...marks];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        // fuera del sector fijado y en las zonas excluidas, negro: ni texto quemado ni interfaz en la hoja
        if (!insideSector(fixed, x, y) || hidden.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)) continue;
        const v = Math.min(255, Math.round(mean[y * W + x]));
        rgb.set([v, v, v], (y * 2 * W + x) * 3);
        const m = mid.data[y * W + x];
        rgb.set([m, m, m], (y * 2 * W + W + x) * 3);
      }
    const outline = (g: SectorGeometry, c: [number, number, number]): void => {
      const s = beamSampler(g, W, H);
      for (let j = 0; j < s.cols; j++) for (const i of [0, s.rows - 1]) put(s.position(i, j).x, s.position(i, j).y, c);
      for (let i = 0; i < s.rows; i++) for (const j of [0, s.cols - 1]) put(s.position(i, j).x, s.position(i, j).y, c);
    };
    outline(det.geometry, [255, 0, 255]);
    outline(fixed, [0, 255, 0]);
    for (const r of [...(item.sector?.exclude ?? []), ...marks])
      for (let x = r.x0; x <= r.x1; x++)
        for (const y of [r.y0, r.y1]) {
          put(x, y, [60, 120, 255]);
          for (let yy = r.y0; yy <= r.y1; yy++) for (const xx of [r.x0, r.x1]) put(xx, yy, [60, 120, 255]);
        }
    const s = beamSampler(fixed, W, H, item.sector?.exclude ?? []);
    // la detección en el cuadro medio (izquierda) y en el cuadro del medio del clip (derecha), que es la que mide el banco
    const meanSt = detectStructures({ rows: s.rows, cols: s.cols, data: s.sample({ width: W, height: H, data: mean }) });
    const overlay = (data: ArrayLike<number>, dx: number, prior?: { dPlPx: number }): void => {
      const st = detectStructures({ rows: s.rows, cols: s.cols, data: s.sample({ width: W, height: H, data }) }, prior);
      const at = (i: number, j: number, c: [number, number, number]): void => put(s.position(i, j).x + dx, s.position(i, j).y, c);
      for (const j of st.intercostal) {
        at(st.pleuraPx[j], j, [255, 0, 0]);
        for (const a of st.aLines.slice(1)) if (a.visible) at(a.u * st.pleuraPx[j], j, [255, 255, 0]);
      }
      for (const r of st.shadows) for (let j = r.from; j <= r.to; j++) at(r.ribTopPx, j, [0, 255, 255]);
    };
    overlay(mean, 0);
    overlay(mid.data, W, { dPlPx: meanSt.dPlPx });
    writePng(join(outDir, item.id), 2 * W, H, rgb, ffmpeg);
    console.log(
      `${item.id}: ${det.geometry.kind} (${det.maskSource}), negro ${black}, ${marks.length} marcas → ${join(outDir, item.id)}.png`,
    );
  }
  writeFileSync(join(outDir, 'proposals.json'), JSON.stringify(proposals, null, 1));
}
