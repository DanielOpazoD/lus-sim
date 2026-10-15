import { expect, test } from '@playwright/test';
import {
  AXIAL_REST_MAP_GLSL,
  axialRestForward,
  axialRestGradient,
  axialRestInverse,
  axialRestInverseBound,
  axialRestTangent,
  createAxialRestMap,
} from '../src/anatomy/axialRestMap';
import type { Vec3 } from '../src/core/vec3';

test('contrato de reposo: mapas, tangentes, gradientes y cota TS ↔ WebGL2', async ({ page }) => {
  // Solo el núcleo geométrico, no una imagen clínica: perfiles sintéticos y shader sin la escena del paciente.
  const maps = [
    createAxialRestMap({ zStart: 10, zEnd: 90, scaleX: 1, scaleY: 1, shiftX: 0, shiftY: 0 }),
    createAxialRestMap({ zStart: 10, zEnd: 90, scaleX: 0.3, scaleY: 0.7, shiftX: 3, shiftY: -12 }),
    createAxialRestMap({ zStart: 10, zEnd: 90, scaleX: 1.4, scaleY: 2, shiftX: -5, shiftY: 6 }),
    createAxialRestMap({ zStart: 10, zEnd: 90, scaleX: 0.6, scaleY: 1.3, shiftX: 20, shiftY: 30 }),
  ];
  const points: Vec3[] = [];
  for (const z of [-80, 10, 10.001, 25, 50, 75, 89.999, 90, 150])
    for (const x of [-160, 0, 160]) for (const y of [-110, 0, 110]) points.push([x, y, z]);
  const vector: Vec3 = [2, -3, 4];
  const gpu = await page.evaluate(
    ({ source, maps, points, vector }) => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) throw new Error('axialRestMap: falta WebGL2');
      const shader = (type: number, text: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, text);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader sin compilar');
        return s;
      };
      const vs = shader(
        gl.VERTEX_SHADER,
        `#version 300 es
precision highp float;
layout(location = 0) in vec3 point;
uniform vec2 zRange, scale, shift;
uniform vec3 vector;
uniform int mode;
out vec4 result;
${source}
void main() {
  AxialRestMap map = AxialRestMap(zRange, scale, shift);
  vec3 v;
  if (mode == 0) v = axialRestForward(point, map);
  else if (mode == 1) v = axialRestInverse(point, map);
  else if (mode == 2) v = axialRestTangent(point, vector, map);
  else v = axialRestGradient(point, vector, map);
  result = vec4(v, axialRestInverseBound(map, vec2(160., 110.)));
  gl_Position = vec4(0., 0., 0., 1.);
}`,
      );
      const fs = shader(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float; out vec4 c; void main() { c = vec4(0.); }');
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.transformFeedbackVaryings(program, ['result'], gl.INTERLEAVED_ATTRIBS);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'programa sin enlazar');
      const vao = gl.createVertexArray();
      const input = gl.createBuffer();
      const output = gl.createBuffer();
      const feedback = gl.createTransformFeedback();
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, input);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points.flat()), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
      gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, output);
      gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, points.length * 4 * 4, gl.STREAM_READ);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, output);
      gl.uniform3fv(gl.getUniformLocation(program, 'vector'), vector);
      gl.enable(gl.RASTERIZER_DISCARD);
      try {
        return maps.map((map) => {
          gl.uniform2f(gl.getUniformLocation(program, 'zRange'), map.zStart, map.zEnd);
          gl.uniform2f(gl.getUniformLocation(program, 'scale'), map.scaleX, map.scaleY);
          gl.uniform2f(gl.getUniformLocation(program, 'shift'), map.shiftX, map.shiftY);
          return [0, 1, 2, 3].map((mode) => {
            gl.uniform1i(gl.getUniformLocation(program, 'mode'), mode);
            gl.beginTransformFeedback(gl.POINTS);
            gl.drawArrays(gl.POINTS, 0, points.length);
            gl.endTransformFeedback();
            const values = new Float32Array(points.length * 4);
            gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, values);
            if (gl.getError() !== gl.NO_ERROR) throw new Error('axialRestMap: error WebGL');
            return Array.from(values);
          });
        });
      } finally {
        gl.disable(gl.RASTERIZER_DISCARD);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
        gl.bindVertexArray(null);
        gl.deleteTransformFeedback(feedback);
        gl.deleteBuffer(input);
        gl.deleteBuffer(output);
        gl.deleteVertexArray(vao);
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      }
    },
    { source: AXIAL_REST_MAP_GLSL, maps, points, vector },
  );
  let maxCoordinateError = 0;
  let maxDerivativeError = 0;
  let maxBoundError = 0;
  for (const [i, map] of maps.entries()) {
    const bound = axialRestInverseBound(map, 160, 110);
    for (const [j, p] of points.entries()) {
      const expected = [
        axialRestForward(p, map),
        axialRestInverse(p, map),
        axialRestTangent(p, vector, map),
        axialRestGradient(p, vector, map),
      ];
      for (let mode = 0; mode < 4; mode++) {
        for (let k = 0; k < 3; k++) {
          const error = Math.abs(gpu[i][mode][j * 4 + k] - expected[mode][k]);
          if (mode < 2) maxCoordinateError = Math.max(maxCoordinateError, error);
          else maxDerivativeError = Math.max(maxDerivativeError, error);
        }
        maxBoundError = Math.max(maxBoundError, Math.abs(gpu[i][mode][j * 4 + 3] - bound));
      }
    }
  }
  console.log({ points: points.length * maps.length, maxCoordinateError, maxDerivativeError, maxBoundError });
  // Redondeo float32 frente a float64, no tolerancias clínicas; máximo recorrido sintético < 700 mm.
  expect(maxCoordinateError).toBeLessThan(1e-4);
  expect(maxDerivativeError).toBeLessThan(1e-5);
  expect(maxBoundError).toBeLessThan(1e-5);
});
