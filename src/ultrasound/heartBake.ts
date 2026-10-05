import type { CardiacRuntime } from '../anatomy/organs/heart';
import { GLProgram, createTexture, drawFullscreen, texture3d } from './gl';
import { VERT } from './shaders/passes.glsl';

/**
 * El horneado del volumen del corazón de EchoTwin en la GPU (decisión 49), en su propio chunk: lo pide la aplicación con el corazón
 * (`app/session.ts`) y lo registra en el renderizador (`registerHeartBaker`), que lo lleva paso a paso (`bakeHeart`).
 *
 * El programa (la GLSL de EchoTwin, `bakeFragment`) se enlaza en los hilos del navegador (`GLProgram.linkLater`) y dibuja
 * `HEART_BAKE_LAYERS` capas de la rejilla por paso, cada paso tras la valla del anterior, en una textura RG8UI 3D nueva con lo que su
 * clasificador dice en el centro de cada vóxel; los parámetros del modelo (RGBA32F) y la retícula de su pared (R8 3D) solo los usa
 * este programa. Ninguna lectura: con SwiftShader un `readPixels` final paraba la página ≈ 46 s.
 */

/**
 * Capas del volumen por paso: 238 capas en 8 pasos. Con 4 capas por paso (60 pasos) el horneado con SwiftShader tardó 333 s
 * (carga ≈ 15–20; de una vez, 46 s): entre paso y paso la imagen dibuja sus cuadros, de ≈ 0,6 s con SwiftShader.
 */
export const HEART_BAKE_LAYERS = 30;

/** Un horneado en curso. */
export interface HeartBakeJob {
  /** Un paso, sin bloquear: espera al enlace y a la valla del anterior o dibuja las capas siguientes; true con el volumen entero. Lanza si falla. */
  step(): boolean;
  /** El volumen que se hornea (entero cuando `step` devuelve true). */
  readonly volume: WebGLTexture;
  /** Libera lo que usa el horneado; con `dropVolume`, también el volumen. */
  release(dropVolume: boolean): void;
}

/** Empieza a hornear el volumen de `c` (lo que se crea aquí ya no lanza: los errores llegan en `step`). */
export function startHeartBake(gl: WebGL2RenderingContext, c: CardiacRuntime): HeartBakeJob {
  const [nx, ny, nz] = c.vol.dims;
  const volume = texture3d(gl, nx, ny, nz, gl.RG8UI, gl.RG_INTEGER, gl.UNSIGNED_BYTE, null);
  const params = createTexture(gl, c.paramTexels, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
  const noise = texture3d(gl, 128, 128, 128, gl.R8, gl.RED, gl.UNSIGNED_BYTE, c.noise);
  const fbo = gl.createFramebuffer();
  let link: ReturnType<typeof GLProgram.linkLater> | null = null;
  let program: GLProgram | null = null;
  let sync: WebGLSync | null = null;
  let next = 0;
  let pending: Error | null = null;
  try {
    gl.bindTexture(gl.TEXTURE_2D, params);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, c.paramTexels, 1, gl.RGBA, gl.FLOAT, c.params);
    link = GLProgram.linkLater(gl, VERT, c.bakeFragment, 'heartBake');
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
      if (!program) {
        if (!link!.ready()) return false;
        const l = link!;
        link = null;
        program = l.finish();
      }
      if (next >= nz) return true;
      program.use();
      program.tex('uHeartTex', 0, params);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, noise);
      program.i('uHeartNoise', 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, nx, ny);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      const end = Math.min(nz, next + HEART_BAKE_LAYERS);
      for (let k = next; k < end; k++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, volume, 0, k);
        if (k === 0 && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('heartBake: FBO incompleto');
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
      if (dropVolume) gl.deleteTexture(volume);
    },
  };
}
