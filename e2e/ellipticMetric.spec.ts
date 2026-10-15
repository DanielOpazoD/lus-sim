import { expect, test } from '@playwright/test';
import { ANATOMY_GLSL } from '../src/anatomy/gpu/anatomy.glsl';
import type { Vec3 } from '../src/core/vec3';

test('anatomía GLSL ensamblada: profundidad idéntica y métrica costal con las tres componentes físicas', async ({ page }) => {
  const productionMetric = 'EllipticMetric torsoMetric() { return EllipticMetric(uTorso.xy, vec2(0.0), vec2(0.0)); }';
  expect(ANATOMY_GLSL).toContain(productionMetric);
  // Solo en este shader de prueba: derivadas locales sintéticas, no un perfil habilitado en el paciente.
  const source = ANATOMY_GLSL.replace(
    productionMetric,
    'uniform vec4 metricDerivative; EllipticMetric torsoMetric() { return EllipticMetric(uTorso.xy, metricDerivative.xy, metricDerivative.zw); }',
  );
  const cases = [
    [160, 113],
    [32, 256],
    [256, 32],
  ].flatMap(([a, b]) =>
    [
      [0, 0, 0, 0],
      [-1.7, 0.6, 1.1, -0.9],
      [0.7, -0.5, -1.3, 1.7],
    ].map((derivative) => ({
      a,
      b,
      derivative,
      points: Array.from({ length: 40 }, (_, j) => -Math.PI + (2 * Math.PI * j) / 39).flatMap((phi) =>
        [0.25, 0.6, 1, 1.3].map((rho): Vec3 => [Math.fround(a * rho * Math.cos(phi)), Math.fround(b * rho * Math.sin(phi)), 0]),
      ),
    })),
  );
  const actual = await page.evaluate(
    ({ source, cases }) => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) throw new Error('ellipticMetric: falta WebGL2');
      const compile = (kind: number, code: string) => {
        const shader = gl.createShader(kind)!;
        gl.shaderSource(shader, code);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader no compilado');
        return shader;
      };
      const vs = compile(
        gl.VERTEX_SHADER,
        `#version 300 es
precision highp float;
precision highp int;
${source}
layout(location=0) in vec3 point;
out vec4 gradientMetric;
out float depth;
void main() {
  gradientMetric = vec4(ellipticRadialGradient(point.xy, length(point.xy), length(point.xy/uTorso.xy), torsoMetric()), ribMetric(point));
  depth = torsoDepth(point);
  gl_Position = vec4(0.0);
}`,
      );
      const fs = compile(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float; out vec4 color; void main() { color=vec4(0.0); }');
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.transformFeedbackVaryings(program, ['gradientMetric', 'depth'], gl.INTERLEAVED_ATTRIBS);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'programa no enlazado');
      const vao = gl.createVertexArray();
      const input = gl.createBuffer();
      const output = gl.createBuffer();
      const feedback = gl.createTransformFeedback();
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, input);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
      gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, output);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, output);
      gl.enable(gl.RASTERIZER_DISCARD);
      try {
        return cases.map(({ a, b, derivative, points }) => {
          gl.uniform4f(gl.getUniformLocation(program, 'uTorso'), a, b, -300, 300);
          gl.uniform4fv(gl.getUniformLocation(program, 'metricDerivative'), derivative);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points.flat()), gl.STATIC_DRAW);
          gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, points.length * 5 * 4, gl.STREAM_READ);
          gl.beginTransformFeedback(gl.POINTS);
          gl.drawArrays(gl.POINTS, 0, points.length);
          gl.endTransformFeedback();
          const data = new Float32Array(points.length * 5);
          gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, data);
          if (gl.getError() !== gl.NO_ERROR) throw new Error('ellipticMetric: error de WebGL');
          return Array.from(data);
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
    { source, cases },
  );
  let maxDepthError = 0;
  let maxGradientError = 0;
  let maxMetricError = 0;
  for (const [
    i,
    {
      a,
      b,
      derivative: [da, db, dx, dy],
      points,
    },
  ] of cases.entries()) {
    const depth = (p: Vec3) => {
      const x = p[0] - dx * p[2];
      const y = p[1] - dy * p[2];
      const rho = Math.hypot(x / (a + da * p[2]), y / (b + db * p[2]));
      return (Math.hypot(x, y) * (rho - 1)) / rho;
    };
    for (const [j, p] of points.entries()) {
      const h = 1e-3;
      const g = [0, 1, 2].map((k) => {
        const l: Vec3 = [...p];
        const u: Vec3 = [...p];
        l[k] -= h;
        u[k] += h;
        return (depth(u) - depth(l)) / (2 * h);
      });
      const row = actual[i].slice(j * 5, j * 5 + 5);
      maxDepthError = Math.max(maxDepthError, Math.abs(row[4] - depth(p)));
      maxMetricError = Math.max(maxMetricError, Math.abs(row[3] - Math.hypot(...g)));
      for (let k = 0; k < 3; k++) maxGradientError = Math.max(maxGradientError, Math.abs(row[k] - g[k]));
    }
  }
  console.log({ points: cases.reduce((n, c) => n + c.points.length, 0), maxDepthError, maxGradientError, maxMetricError });
  // Float32 más truncamiento de diferencias centrales; no validación antropométrica ni clínica.
  expect(maxDepthError).toBeLessThan(0.001);
  expect(maxGradientError).toBeLessThan(0.001);
  expect(maxMetricError).toBeLessThan(0.001);
});
