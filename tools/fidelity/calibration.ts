import { buildReferenceStats, type ReferenceStats } from './reference';

export interface CalibrationGroup {
  subjects: readonly string[];
  clips: readonly string[];
}

/** Reagrega solo el grupo indicado, con las mismas compuertas y censura del banco original. */
export function calibrationReference(stats: ReferenceStats, group: CalibrationGroup): ReferenceStats {
  const clips = stats.clips.filter((clip) => group.clips.includes(clip.id));
  if (clips.length !== group.clips.length || new Set(group.clips).size !== group.clips.length)
    throw new Error('calibración: clips ausentes o duplicados en la partición');
  const subjects = [...new Set(clips.map((clip) => clip.subject))].sort();
  if (JSON.stringify(subjects) !== JSON.stringify([...group.subjects].sort()))
    throw new Error('calibración: los sujetos no corresponden a los clips del grupo');
  return buildReferenceStats(
    stats.manifest_version,
    clips.map((clip) => ({ stats: clip })),
    [],
    stats.generated,
  );
}
