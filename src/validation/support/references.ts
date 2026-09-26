/**
 * Lectura de la bibliografía (docs/REFERENCES.md) y de las citas de los documentos. Formato de una
 * entrada: una línea que empieza por «- `clave` — », seguida de la referencia completa con DOI, PMID o
 * URL. Formato de una cita en los documentos: `[@clave]` (varias: `[@a; @b]`).
 */
export interface ReferenceEntry {
  key: string;
  text: string;
  line: number;
}

const ENTRY = /^- `([a-z0-9]+(?:-[a-z0-9]+)*)` — (.+)$/;

export function parseReferences(md: string): ReferenceEntry[] {
  const out: ReferenceEntry[] = [];
  md.split('\n').forEach((line, i) => {
    const m = ENTRY.exec(line);
    if (m) out.push({ key: m[1], text: m[2], line: i + 1 });
  });
  return out;
}

export function referenceKeys(md: string): Set<string> {
  return new Set(parseReferences(md).map((e) => e.key));
}

/** Claves citadas con `[@clave]` o `[@a; @b]` en un texto. */
export function citedKeys(md: string): string[] {
  const out: string[] = [];
  // Lo que va en código en línea (`[@clave]`) es un ejemplo del formato, no una cita
  const prose = md.replace(/`[^`\n]*`/g, '');
  for (const m of prose.matchAll(/\[(@[^\]]+)\]/g)) {
    for (const part of m[1].split(';')) {
      const k = /^\s*@([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/.exec(part);
      if (k) out.push(k[1]);
    }
  }
  return out;
}

/** Una entrada es localizable si lleva DOI, PMID o una URL. */
export function isLocatable(text: string): boolean {
  return /\bdoi:\s*10\.\d{4,9}\/\S+|\bPMID:?\s*\d+|https?:\/\/\S+/i.test(text);
}
