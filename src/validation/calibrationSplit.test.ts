import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import split from '../../docs/reference-bank/calibration-split.json';
import type { Manifest, ReferenceStats } from '../../tools/fidelity/reference';
import { calibrationReference } from '../../tools/fidelity/calibration';

const ROOT = resolve(__dirname, '../..');
const MANIFEST_PATH = join(ROOT, 'docs/reference-bank/MANIFEST.json');
const STATS_PATH = join(ROOT, 'docs/reference-bank/reference-stats.json');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
const stats = JSON.parse(readFileSync(STATS_PATH, 'utf8')) as ReferenceStats;
const byId = new Map(manifest.items.map((item) => [item.id, item]));
const statsById = new Map(stats.clips.map((clip) => [clip.id, clip]));
const groups = [split.exploration, split.checking];
const hash = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

/** La partición protege la comprobación por sujeto; no valida el modelo ni define rangos clínicos. */
describe('partición del banco normal convexo para C3b-A', () => {
  it('las métricas reservadas no influyen en la referencia usada para ajustar', () => {
    const before = calibrationReference(stats, split.exploration);
    const altered = structuredClone(stats);
    for (const clip of altered.clips.filter((clip) => split.checking.clips.includes(clip.id)))
      for (const metric of Object.values(clip.metrics)) metric.median = 1e9;
    expect(calibrationReference(altered, split.exploration)).toEqual(before);
    expect(before.strata[0].subjects).toEqual([...split.exploration.subjects].sort());
    expect(before.clips.map((clip) => clip.id).sort()).toEqual([...split.exploration.clips].sort());
  });

  it('rechaza una partición incompleta, duplicada o con sujetos ajenos', () => {
    expect(() => calibrationReference(stats, { ...split.exploration, clips: ['ausente'] })).toThrow(/ausentes/);
    expect(() =>
      calibrationReference(stats, { ...split.exploration, clips: [split.exploration.clips[0], split.exploration.clips[0]] }),
    ).toThrow(/duplicados/);
    expect(() => calibrationReference(stats, { ...split.exploration, subjects: ['ajeno'] })).toThrow(/sujetos/);
  });
  it('fija la versión de los datos antes de explorar ajustes', () => {
    expect(split.baseline_commit).toMatch(/^[0-9a-f]{40}$/);
    expect(Number.isFinite(Date.parse(split.created_utc))).toBe(true);
    expect(hash(MANIFEST_PATH)).toBe(split.manifest_sha256);
    expect(hash(STATS_PATH)).toBe(split.reference_stats_sha256);
  });

  it('mantiene cada sujeto y sus clips en un único grupo, sin duplicados', () => {
    expect(split.exploration.subjects.filter((id) => split.checking.subjects.includes(id))).toEqual([]);
    const allClips = groups.flatMap((group) => group.clips);
    expect(new Set(allClips).size).toBe(allClips.length);
    for (const group of groups) {
      expect(group.subjects.length).toBeGreaterThan(0);
      expect(new Set(group.subjects).size).toBe(group.subjects.length);
      const actualSubjects = [...new Set(group.clips.map((id) => byId.get(id)?.subject))].sort();
      expect(actualSubjects).toEqual([...group.subjects].sort());
    }
  });

  it('cubre todos los convexos normales aptos, sin incluir clips no elegibles', () => {
    const eligible = manifest.items.filter(
      (item) =>
        item.pattern === split.scope.pattern &&
        item.probe === split.scope.probe &&
        item.qa.usable === split.scope.qa_usable &&
        statsById.get(item.id)?.gate_failures.length === split.scope.gate_failures,
    );
    expect(groups.flatMap((group) => group.clips).sort()).toEqual(eligible.map((item) => item.id).sort());
    for (const group of groups) {
      const expected = eligible.filter((item) => group.subjects.includes(item.subject)).map((item) => item.id);
      expect([...group.clips].sort()).toEqual(expected.sort());
    }
  });
});
