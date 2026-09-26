import type { Simulator } from '../app/simulator';

/**
 * Superposición de la imagen: regla de profundidad, marcador de orientación y foco.
 *
 * lus-sim (decisión 13): solo el modo B; sin el cuadro y la escala del color, la línea M, el cursor del PW, el ECG
 * ni el espectrograma de VExUS.
 */
export function drawOverlay(canvas: HTMLCanvasElement, sim: Simulator): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const tr = sim.transducer;
  const shown = sim.displayed;
  const depth = shown.bmode.depthMm;
  // Regla de profundidad (cada cm) en el borde derecho del sector
  ctx.strokeStyle = '#9aa7b4';
  ctx.fillStyle = '#9aa7b4';
  ctx.lineWidth = 1;
  ctx.font = '11px sans-serif';
  const edgeTheta = -tr.halfSector;
  for (let cm = 0; cm <= depth / 10; cm++) {
    const r = cm * 10;
    const p = sim.renderer.beamToPixel(edgeTheta, r, tr);
    const big = cm % 5 === 0;
    ctx.beginPath();
    ctx.moveTo(p.x + 6, p.y);
    ctx.lineTo(p.x + (big ? 14 : 10), p.y);
    ctx.stroke();
    if (big) ctx.fillText(`${cm}`, p.x + 17, p.y + 4);
  }
  // Marcador de orientación (izquierda de pantalla)
  const mk = sim.renderer.beamToPixel(tr.halfSector, 0, tr);
  ctx.fillStyle = '#3fb6a8';
  ctx.beginPath();
  ctx.arc(mk.x - 10, mk.y - 6, 5, 0, Math.PI * 2);
  ctx.fill();
  // Foco
  const fp = sim.renderer.beamToPixel(edgeTheta, shown.bmode.focusMm, tr);
  ctx.fillStyle = '#e0a33b';
  ctx.beginPath();
  ctx.moveTo(fp.x + 2, fp.y);
  ctx.lineTo(fp.x - 5, fp.y - 4);
  ctx.lineTo(fp.x - 5, fp.y + 4);
  ctx.closePath();
  ctx.fill();
}
