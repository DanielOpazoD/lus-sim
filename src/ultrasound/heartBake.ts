import { HEART_PHASES, type CardiacRuntime } from '../anatomy/organs/heart';
import { GLProgram, createTexture, drawFullscreen, linkError, shader, texture3d } from './gl';
import { VERT } from './shaders/passes.glsl';

/**
 * El horneado del volumen del corazón de EchoTwin en la GPU (decisión 49), en su propio chunk: lo pide la aplicación con el corazón
 * (`app/session.ts`) y lo registra en el renderizador (`registerHeartBaker`), que lo lleva paso a paso (`bakeHeart`).
 *
 * El programa (la GLSL de EchoTwin, `bakeFragment`) se enlaza en los hilos del navegador (`linkLater`) y dibuja
 * capas de la rejilla por paso, cada paso tras la valla del anterior, en una textura RGBA16UI 3D con las palabras de cada vóxel
 * (`packHeartVoxel`); los parámetros del modelo (RGBA32F, una fila por fase fina) y la retícula de su pared (R8 3D) solo los usa
 * este programa. Ninguna lectura: con SwiftShader un `readPixels` final paraba la página ≈ 46 s.
 *
 * Dos horneados (fase 2 del corazón): el de telediástole, en una textura nueva (`HEART_BAKE_LAYERS` capas por paso, una evaluación
 * por vóxel), y el del latido, que reescribe en la misma textura las capas que se le piden con su línea de tiempo
 * (`HEART_BEAT_LAYERS` por paso: de 16 a 80 evaluaciones por vóxel) tras subir las 256 filas de parámetros, unas pocas por paso.
 * Mientras el latido no entra en la escena la imagen lee la fase 0, que en las capas reescritas es su tejido en telediástole.
 */

/**
 * Capas del volumen por paso: 238 capas en 8 pasos. Con 4 capas por paso (60 pasos) el horneado con SwiftShader tardó 333 s
 * (carga ≈ 15–20; de una vez, 46 s): entre paso y paso la imagen dibuja sus cuadros, de ≈ 0,6 s con SwiftShader.
 */
export const HEART_BAKE_LAYERS = 30;
/** Capas por paso del horneado del latido: una (de 16 a 80 evaluaciones del clasificador por vóxel). */
export const HEART_BEAT_LAYERS = 1;
/** Filas de parámetros (poses por fase fina, ≈ 2,6 ms cada una en la CPU) por paso del horneado del latido. */
export const HEART_BEAT_ROWS = 16;

/** Un horneado en curso. */
export interface HeartBakeJob {
  /** Un paso, sin bloquear: espera al enlace y a la valla del anterior o dibuja las capas siguientes; true con el volumen entero. Lanza si falla. */
  step(): boolean;
  /** El volumen que se hornea (entero cuando `step` devuelve true). */
  readonly volume: WebGLTexture;
  /** Libera lo que usa el horneado; con `dropVolume`, también el volumen. */
  release(dropVolume: boolean): void;
}

/**
 * Empieza a hornear el volumen de `c` (lo que se crea aquí ya no lanza: los errores llegan en `step`): sin `beat`, el de
 * telediástole en una textura nueva; con `beat`, la línea de tiempo de las capas k0 ≤ k < k1 en la textura `beat.volume`.
 */
export function startHeartBake(
  gl: WebGL2RenderingContext,
  c: CardiacRuntime,
  beat: { volume: WebGLTexture; k0: number; k1: number } | null = null,
): HeartBakeJob {
  const [nx, ny, nz] = c.vol.dims;
  const volume = beat ? beat.volume : texture3d(gl, nx, ny, nz, gl.RGBA16UI, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, null);
  const rows = beat ? HEART_PHASES : 1;
  const params = createTexture(gl, c.paramTexels, rows, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
  let rowsDone = 1;
  const noise = texture3d(gl, 128, 128, 128, gl.R8, gl.RED, gl.UNSIGNED_BYTE, c.noise);
  const fbo = gl.createFramebuffer();
  let link: ReturnType<typeof linkLater> | null = null;
  let program: GLProgram | null = null;
  let sync: WebGLSync | null = null;
  let next = beat ? beat.k0 : 0;
  const last = beat ? beat.k1 : nz;
  let pending: Error | null = null;
  try {
    gl.bindTexture(gl.TEXTURE_2D, params);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, c.paramTexels, 1, gl.RGBA, gl.FLOAT, c.params);
    link = linkLater(gl, VERT, beat ? c.beatFragment : c.bakeFragment, beat ? 'heartBeat' : 'heartBake');
  } catch (e) {
    pending = e instanceof Error ? e : new Error(`heartBake: ${String(e)}`);
  }
  return {
    volume,
    step() {
      if (pending) throw pending;
      if (sync) {
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) return false;
        if (status === gl.WAIT_FAILED) throw new Error('heartBake: la valla falló');
        gl.deleteSync(sync);
        sync = null;
      }
      if (rowsDone < rows) {
        gl.bindTexture(gl.TEXTURE_2D, params);
        const end = Math.min(rows, rowsDone + HEART_BEAT_ROWS);
        for (let f = rowsDone; f < end; f++) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, f, c.paramTexels, 1, gl.RGBA, gl.FLOAT, c.paramsAt(f));
        rowsDone = end;
        return false;
      }
      if (!program) {
        if (!link!.ready()) return false;
        const l = link!;
        link = null;
        program = l.finish();
      }
      if (next >= last) return true;
      program.use();
      program.tex('uHeartTex', 0, params);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, noise);
      program.i('uHeartNoise', 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, nx, ny);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      const end = Math.min(last, next + (beat ? HEART_BEAT_LAYERS : HEART_BAKE_LAYERS));
      for (let k = next; k < end; k++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, volume, 0, k);
        if (k === (beat ? beat.k0 : 0) && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
          throw new Error('heartBake: FBO incompleto');
        program.i('uLayer', k);
        drawFullscreen(gl);
      }
      next = end;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      return false;
    },
    release(dropVolume) {
      if (gl.isContextLost()) return;
      if (sync) gl.deleteSync(sync);
      link?.abandon();
      program?.dispose();
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(params);
      gl.deleteTexture(noise);
      if (dropVolume && !beat) gl.deleteTexture(volume);
    },
  };
}

/**
 * Encarga un programa sin esperarlo. `ready()` dice, sin bloquear, si su enlace terminó (`COMPLETION_STATUS_KHR` de
 * KHR_parallel_shader_compile; sin la extensión, siempre sí); `finish()` lo comprueba como `GLProgram.linkAll` (lanza con el registro
 * si falló) y lo devuelve; `abandon()` lo libera sin comprobarlo.
 */
function linkLater(
  gl: WebGL2RenderingContext,
  vert: string,
  frag: string,
  name: string,
): { ready(): boolean; finish(): GLProgram; abandon(): void } {
  const vs = shader(gl, gl.VERTEX_SHADER, vert);
  const fs = shader(gl, gl.FRAGMENT_SHADER, frag);
  const p = gl.createProgram();
  if (!p) throw new Error('createProgram');
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  const ext = gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null;
  const drop = () => {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  };
  return {
    ready: () => !ext || gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR) === true,
    finish: () => {
      const error = gl.getProgramParameter(p, gl.LINK_STATUS) ? null : linkError(gl, { name, vs, fs, p }, vert, frag);
      drop();
      if (error) {
        gl.deleteProgram(p);
        throw error;
      }
      return GLProgram.adopt(gl, p, name, frag);
    },
    abandon: () => {
      drop();
      gl.deleteProgram(p);
    },
  };
}
