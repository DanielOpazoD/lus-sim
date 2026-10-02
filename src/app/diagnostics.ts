import type { EquipmentSettings } from './simulator';
import type { ErrorEntry } from './errorLog';
import type { CoverageRegion } from './coverage';

/**
 * Diagnóstico exportable (Fase 3): lo que un equipo necesita para reproducir un informe de
 * fallo o de fidelidad — versión y commit, navegador y GPU, caso, estado del equipo, fps, tiempo
 * de GPU por pasada y últimos errores. Solo datos técnicos y del paciente sintético; nada del usuario.
 *
 * lus-sim (decisión 13): el formato `lus-diagnostico/1`, sin el lazo cerrado de la circulación de VExUS (que
 * lus-sim no porta); el caso es el id del paciente sintético.
 */
export interface DiagnosticsInput {
  version: string;
  commit: string;
  buildTime: string;
  userAgent: string;
  gpu: { vendor: string; renderer: string } | null;
  viewport: { width: number; height: number; devicePixelRatio: number };
  caseId: string;
  simTimeS: number;
  fps: number;
  /** Tiempo de GPU del cuadro y por pasada si el navegador los separa (ms); null sin temporizadores. */
  gpuMs: { frameMs: number; perPass: Readonly<Record<string, number>> | null } | null;
  equipment: EquipmentSettings;
  errors: readonly ErrorEntry[];
  /**
   * Cobertura de exploración de la escena (lus-sim, `app/coverage.ts`; requisito de cobertura de `docs/MISSION.md`):
   * celdas que la sonda alcanza y que muestran lo que la base pone ahí, en total y por región.
   */
  coverage: { met: number; total: number; byRegion: Readonly<Record<CoverageRegion, { met: number; total: number }>> } | null;
}

export interface Diagnostics extends DiagnosticsInput {
  format: 'lus-diagnostico/1';
  createdAt: string;
}

export function buildDiagnostics(input: DiagnosticsInput, now: Date = new Date()): Diagnostics {
  return { format: 'lus-diagnostico/1', createdAt: now.toISOString(), ...input, errors: [...input.errors] };
}

/** Proveedor y modelo de la GPU si el navegador los expone (WEBGL_debug_renderer_info). */
export function gpuInfo(gl: WebGLRenderingContext | WebGL2RenderingContext | null): { vendor: string; renderer: string } | null {
  if (!gl) return null;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (!ext) return { vendor: String(gl.getParameter(gl.VENDOR)), renderer: String(gl.getParameter(gl.RENDERER)) };
  return {
    vendor: String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)),
    renderer: String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)),
  };
}

/** Nombre de archivo estable para el diagnóstico descargado. */
export function diagnosticsFileName(d: Diagnostics): string {
  return `lus-diagnostico-${d.version}-${d.commit}-${d.createdAt.replace(/[:.]/g, '-')}.json`;
}

/** Versión y commit en una línea (barra superior). */
export function buildLabel(version: string, commit: string): string {
  return `v${version} · ${commit}`;
}
