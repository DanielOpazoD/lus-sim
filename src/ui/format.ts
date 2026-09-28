/** Profundidad en centímetros: conserva los pasos de 5 mm del equipo. */
export function formatDepthMm(mm: number): string {
  return `${(mm / 10).toFixed(1).replace('.', ',')} cm`;
}
