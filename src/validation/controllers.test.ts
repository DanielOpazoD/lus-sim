import { describe, expect, it } from 'vitest';
import { ErrorBudget } from '../app/errorBudget';
import { HeartRateDisplay, hudText, type HudInput } from '../ui/controllers/hud';

/**
 * Controladores de la interfaz sin DOM (adaptada de VExUS, docs/PROVENANCE.md). lus-sim (decisión 13): el HUD solo
 * tiene el modo B (sin las líneas del color, del PW ni del modo M, ni el chip de contexto) y el diagnóstico no lleva el
 * lazo cerrado de la circulación, que lus-sim no porta.
 */
describe('Presupuesto de errores del bucle', () => {
  it('pasa a degradado con más de 5 fallos en 2 s y se recupera cuando la ventana se vacía', () => {
    const b = new ErrorBudget(2000, 5);
    for (let i = 0; i < 5; i++) expect(b.fail(i * 100)).toBe(false);
    expect(b.fail(500)).toBe(true);
    // 3 s después los fallos viejos ya no cuentan
    expect(b.fail(3500)).toBe(false);
    // reiniciar vacía la ventana
    for (let i = 0; i < 6; i++) b.fail(4000 + i);
    b.reset();
    expect(b.fail(4010)).toBe(false);
  });
});

describe('HUD', () => {
  const base: HudInput = {
    patientLabel: 'Paciente sintético',
    frozen: false,
    heartRateBpm: 70.4,
    atrialFibrillation: false,
    transducerMHz: 3.5,
    depthMm: 120,
    gainDb: 0,
    dynamicRangeDb: 70,
    compound: false,
    harmonic: false,
  };
  it('esquinas con la FC, la profundidad, la frecuencia del transductor, la ganancia y el rango dinámico', () => {
    const b = hudText(base);
    expect(b.topLeft).toEqual(['Paciente sintético']);
    expect(b.topRight).toEqual(['FC 70 lpm · Sinusal', '12,0 cm · 3,5 MHz · G 0 dB · RD 70']);
    expect(b.bottomRight).toEqual([]);
    const f = hudText({ ...base, frozen: true, atrialFibrillation: true, depthMm: 100, gainDb: -4 });
    expect(f.topLeft[0]).toBe('Paciente sintético · congelada');
    expect(f.topRight).toEqual(['FC 70 lpm · FA', '10,0 cm · 3,5 MHz · G -4 dB · RD 70']);
  });
  it('conserva los pasos de medio centímetro al mostrar la profundidad', () => {
    expect(hudText({ ...base, depthMm: 65 }).topRight[1]).toContain('6,5 cm');
    expect(hudText({ ...base, depthMm: 70 }).topRight[1]).toContain('7,0 cm');
  });
  it('«CX» cuando la composición espacial se forma (decisión 58 de VExUS), y solo entonces', () => {
    expect(hudText({ ...base, compound: true }).topRight[1]).toBe('12,0 cm · 3,5 MHz · G 0 dB · RD 70 · CX');
    expect(hudText({ ...base, compound: false }).topRight[1]).not.toContain('CX');
  });
  it('«THI» delante de la frecuencia con la armónica tisular (decisión 77 de VExUS)', () => {
    expect(hudText({ ...base, harmonic: true, compound: true }).topRight[1]).toBe('12,0 cm · THI 3,5 MHz · G 0 dB · RD 70 · CX');
    expect(hudText(base).topRight[1]).not.toContain('THI');
  });
  it('la FC mostrada se suaviza (media móvil) y arranca en el primer valor', () => {
    const hr = new HeartRateDisplay();
    expect(hr.update(1, 0.016)).toBe(60);
    const next = hr.update(0.5, 0.016); // salto a 120 lpm
    expect(next).toBeGreaterThan(60);
    expect(next).toBeLessThan(62);
  });
});

describe('Diagnóstico exportable (Fase 3)', () => {
  it('reúne versión, GPU, caso, equipo y errores con un formato versionado y un nombre de archivo estable', async () => {
    const { buildDiagnostics, diagnosticsFileName, buildLabel } = await import('../app/diagnostics');
    const { defaultEquipment } = await import('../app/simulator');
    const d = buildDiagnostics(
      {
        version: '0.4.0',
        commit: 'abc1234',
        buildTime: '2026-09-22T00:00:00Z',
        userAgent: 'test',
        gpu: { vendor: 'V', renderer: 'R' },
        viewport: { width: 800, height: 600, devicePixelRatio: 2 },
        caseId: 'adulto-sano',
        simTimeS: 12.5,
        fps: 58,
        gpuMs: { frameMs: 5.7, perPass: { transmission: 1.5, rawField: 4.2 } },
        equipment: defaultEquipment(),
        errors: [{ source: 'gpu', message: 'contexto WebGL perdido', firstAt: 1, lastAt: 2, count: 2 }],
        coverage: {
          met: 1,
          total: 2,
          byRegion: {
            anterior: { met: 1, total: 1 },
            lateral: { met: 0, total: 1 },
            posterior: { met: 0, total: 0 },
            apex: { met: 0, total: 0 },
          },
        },
      },
      new Date('2026-09-22T10:11:12.345Z'),
    );
    expect(d.format).toBe('lus-diagnostico/1');
    expect(d.createdAt).toBe('2026-09-22T10:11:12.345Z');
    expect(d.errors[0].count).toBe(2);
    expect(d.gpuMs?.perPass).toEqual({ transmission: 1.5, rawField: 4.2 });
    // la cobertura de exploración viaja con el informe (requisito de cobertura de docs/MISSION.md)
    expect(d.coverage).toMatchObject({ met: 1, total: 2 });
    // el equipo viaja entero (el preajuste pulmonar: 12 cm)
    expect((JSON.parse(JSON.stringify(d)) as typeof d).equipment.bmode.depthMm).toBe(120);
    expect(diagnosticsFileName(d)).toBe('lus-diagnostico-0.4.0-abc1234-2026-09-22T10-11-12-345Z.json');
    expect(buildLabel('0.4.0', 'abc1234')).toBe('v0.4.0 · abc1234');
    // los errores se copian: el registro puede seguir cambiando después
    const errors = [{ source: 'ui' as const, message: 'x', firstAt: 0, lastAt: 0, count: 1 }];
    const copy = buildDiagnostics({ ...d, errors });
    errors.push({ source: 'ui', message: 'y', firstAt: 1, lastAt: 1, count: 1 });
    expect(copy.errors).toHaveLength(1);
    // las constantes de build existen también en las pruebas (define de Vite)
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('la GPU del diagnóstico: el nombre desenmascarado si el navegador lo da, si no el del contexto, y nada sin contexto', async () => {
    const { gpuInfo } = await import('../app/diagnostics');
    expect(gpuInfo(null)).toBeNull();
    const params: Record<number, string> = { 1: 'Google', 2: 'SwiftShader', 3: 'WebKit', 4: 'WebKit WebGL' };
    const withExt = {
      VENDOR: 3,
      RENDERER: 4,
      getExtension: () => ({ UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 }),
      getParameter: (p: number) => params[p],
    } as unknown as WebGL2RenderingContext;
    expect(gpuInfo(withExt)).toEqual({ vendor: 'Google', renderer: 'SwiftShader' });
    const noExt = { ...withExt, getExtension: () => null } as unknown as WebGL2RenderingContext;
    expect(gpuInfo(noExt)).toEqual({ vendor: 'WebKit', renderer: 'WebKit WebGL' });
  });
});

describe('Notas de release desde el CHANGELOG (Fase 3)', () => {
  it('extrae la sección de la versión y falla si no existe', async () => {
    const { releaseNotes } = await import('../../tools/ci/release-notes');
    const md = '# H\n\n## [Sin publicar]\n\n- x\n\n## [0.4.0] — fecha\n\n### Añadido\n\n- a\n\n## [0.3.0]\n\n- b\n';
    expect(releaseNotes(md, '0.4.0')).toBe('### Añadido\n\n- a');
    expect(releaseNotes(md, '0.3.0')).toBe('- b');
    expect(() => releaseNotes(md, '9.9.9')).toThrow(/no tiene sección/);
  });
});
