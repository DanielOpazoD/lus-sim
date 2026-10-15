import { expect, test } from '@playwright/test';
import { AXIAL_REST_NUMERICS, axialRestForward } from '../src/anatomy/axialRestMap';
import {
  AXIAL_REST_SURFACE_GLSL,
  AXIAL_SURFACE_NUMERICS,
  axialSurfaceDepth,
  axialSurfaceDepthGradient,
  axialSurfacePhi,
  axialSurfacePhiGradient,
  axialSurfaceSkinPoint,
  axialSurfaceSkinTangents,
  createAxialRestSurface,
} from '../src/anatomy/axialRestSurface';
import type { Vec3 } from '../src/core/vec3';

for (const boundary of [false, true])
  test(`superficie física TS ↔ WebGL2: ${boundary ? 'límites numéricos' : 'perfiles moderados'}`, async ({ page }) => {
    const identity = { zStart: 10, zEnd: 90, scaleX: 1, scaleY: 1, shiftX: 0, shiftY: 0 };
    const surfaces = boundary
      ? [
          [-512, -480],
          [-16, 16],
          [480, 512],
        ].flatMap(([zStart, zEnd]) =>
          [
            [32, 32],
            [32, 256],
            [256, 32],
            [256, 256],
          ].flatMap(([a, b]) =>
            [
              [0.25, 4],
              [4, 0.25],
              [0.25, 0.25],
              [4, 4],
            ]
              .filter(
                ([sx, sy]) =>
                  (a * sx) / (b * sy) >= 1 / AXIAL_SURFACE_NUMERICS.maxAspect && (a * sx) / (b * sy) <= AXIAL_SURFACE_NUMERICS.maxAspect,
              )
              .map(([scaleX, scaleY]) => createAxialRestSurface(a, b, { zStart, zEnd, scaleX, scaleY, shiftX: 128, shiftY: -128 })),
          ),
        )
      : [
          createAxialRestSurface(160, 110, identity),
          createAxialRestSurface(160, 110, { ...identity, scaleX: 0.3, scaleY: 0.7, shiftX: 3, shiftY: -12 }),
          createAxialRestSurface(160, 110, { ...identity, scaleX: 1.4, scaleY: 2, shiftX: -5, shiftY: 6 }),
          createAxialRestSurface(160, 110, { ...identity, scaleX: 0.6, scaleY: 1.3, shiftX: 20, shiftY: 30 }),
        ];
    const cases = surfaces.map((surface) => {
      const m = surface.map;
      const heights = boundary
        ? [
            m.zStart,
            m.zStart + 1e-5,
            m.zStart + 0.001,
            m.zStart + 8.00001,
            (m.zStart + m.zEnd) / 2 + 1e-5,
            m.zEnd - 8.00001,
            m.zEnd - 0.001,
            m.zEnd - 1e-5,
            m.zEnd,
          ]
        : [-80, 10, 10.001, 25, 50, 75, 89.999, 90, 150];
      const points: { p: Vec3; phi: number }[] = [];
      for (const z of heights) {
        for (const phi of [-Math.PI, -2.4, -Math.PI / 2, -0.4, 0, 0.7, Math.PI / 2, 2.6, Math.PI])
          for (const rho of [0.25, 0.7, 1, 1.8])
            points.push({ p: axialRestForward([surface.a * rho * Math.cos(phi), surface.b * rho * Math.sin(phi), z], m), phi });
        if (boundary)
          for (const x of [-512, 512])
            for (const y of [-512, 512]) points.push({ p: axialRestForward([x, y, z], m), phi: Math.atan2(y / surface.b, x / surface.a) });
      }
      return { surface, points };
    });
    const gpu = await page.evaluate(
      ({ source, cases }) => {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) throw new Error('axialRestSurface: falta WebGL2');
        const shader = (type: number, source: string) => {
          const s = gl.createShader(type)!;
          gl.shaderSource(s, source);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader sin compilar');
          return s;
        };
        const vs = shader(
          gl.VERTEX_SHADER,
          `#version 300 es
precision highp float;
layout(location = 0) in vec4 point;
uniform vec2 zRange, scale, shift, radius;
uniform int mode;
out vec4 result;
${source}
void main() {
  AxialRestSurface surface = AxialRestSurface(radius, AxialRestMap(zRange, scale, shift));
  if (mode == 0) result = vec4(axialSurfaceDepthGradient(point.xyz, surface), axialSurfaceDepth(point.xyz, surface));
  else if (mode == 1) result = vec4(axialSurfacePhiGradient(point.xyz, surface), axialSurfacePhi(point.xyz, surface));
  else if (mode == 2) result = vec4(axialSurfaceSkinPoint(point.w, point.z, surface), 0.0);
  else if (mode == 3) result = vec4(axialSurfaceSkinPhiTangent(point.w, point.z, surface), 0.0);
  else result = vec4(axialSurfaceSkinZTangent(point.w, point.z, surface), 0.0);
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
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, output);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, output);
        gl.enable(gl.RASTERIZER_DISCARD);
        try {
          return cases.map(({ surface, points }) => {
            const map = surface.map;
            gl.uniform2f(gl.getUniformLocation(program, 'zRange'), map.zStart, map.zEnd);
            gl.uniform2f(gl.getUniformLocation(program, 'scale'), map.scaleX, map.scaleY);
            gl.uniform2f(gl.getUniformLocation(program, 'shift'), map.shiftX, map.shiftY);
            gl.uniform2f(gl.getUniformLocation(program, 'radius'), surface.a, surface.b);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points.flatMap(({ p, phi }) => [...p, phi])), gl.STATIC_DRAW);
            gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, points.length * 4 * 4, gl.STREAM_READ);
            return [0, 1, 2, 3, 4].map((mode) => {
              gl.uniform1i(gl.getUniformLocation(program, 'mode'), mode);
              gl.beginTransformFeedback(gl.POINTS);
              gl.drawArrays(gl.POINTS, 0, points.length);
              gl.endTransformFeedback();
              const values = new Float32Array(points.length * 4);
              gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, values);
              if (gl.getError() !== gl.NO_ERROR) throw new Error('axialRestSurface: error WebGL');
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
      { source: AXIAL_REST_SURFACE_GLSL, cases },
    );
    let maxCoordinateError = 0;
    let maxDerivativeError = 0;
    let maxAngleError = 0;
    let maxArcError = 0;
    let worst: unknown;
    for (const [i, { surface, points }] of cases.entries())
      for (const [j, { p, phi }] of points.entries()) {
        const t = axialSurfaceSkinTangents(phi, p[2], surface);
        const expected = [
          [...axialSurfaceDepthGradient(p, surface), axialSurfaceDepth(p, surface)],
          [...axialSurfacePhiGradient(p, surface), axialSurfacePhi(p, surface)],
          [...axialSurfaceSkinPoint(phi, p[2], surface), 0],
          [...t.phi, 0],
          [...t.z, 0],
        ];
        for (let mode = 0; mode < 5; mode++)
          for (let k = 0; k < 4; k++) {
            const delta = gpu[i][mode][j * 4 + k] - expected[mode][k];
            if (mode === 1 && k === 3) {
              const angleError = Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
              maxAngleError = Math.max(maxAngleError, angleError);
              maxArcError = Math.max(maxArcError, angleError * Math.hypot(...t.phi));
            } else if (mode === 2 || (mode === 0 && k === 3)) {
              if (Math.abs(delta) > maxCoordinateError)
                worst = { i, j, mode, k, p, phi, actual: gpu[i][mode][j * 4 + k], expected: expected[mode][k] };
              maxCoordinateError = Math.max(maxCoordinateError, Math.abs(delta));
            } else maxDerivativeError = Math.max(maxDerivativeError, Math.abs(delta));
          }
      }
    console.log({
      points: cases.reduce((n, c) => n + c.points.length, 0),
      maxCoordinateError,
      maxDerivativeError,
      maxAngleError,
      maxArcError,
      worst,
    });
    // Errores de cálculo float32, no tolerancias anatómicas ni clínicas. Las guardas moderadas no se relajan.
    expect(maxCoordinateError).toBeLessThan(boundary ? AXIAL_REST_NUMERICS.coordinateToleranceMm : 0.001);
    expect(maxDerivativeError).toBeLessThan(boundary ? AXIAL_REST_NUMERICS.derivativeTolerance : 0.001);
    expect(maxAngleError).toBeLessThan(boundary ? 0.0001 : 0.00001);
    expect(maxArcError).toBeLessThan(boundary ? AXIAL_REST_NUMERICS.coordinateToleranceMm : 0.001);
  });
