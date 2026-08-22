/**
 * Snap a spoken STAR/SID name onto a catalog procedure id.
 * `DEMO ONE` / `demo 1` → `DEM1`. Never invent an id that is not listed.
 */

import type { Instruction } from "@core";

export const MAX_CATALOG_PROCEDURES = 32;
const PROCEDURE_ID = /^[A-Z]{2,8}[0-9]{0,2}$/;

const WORD_DIGIT: Readonly<Record<string, string>> = {
  ZERO: "0",
  ONE: "1",
  TWO: "2",
  THREE: "3",
  FOUR: "4",
  FIVE: "5",
  SIX: "6",
  SEVEN: "7",
  EIGHT: "8",
  NINE: "9",
};

export interface CatalogProcedure {
  id: string;
  name?: string;
}

export function sanitizeCatalogProcedures(
  raw: readonly CatalogProcedure[] | undefined | null,
): CatalogProcedure[] {
  const out: CatalogProcedure[] = [];
  const seen = new Set<string>();
  for (const item of raw ?? []) {
    const id = item.id.trim().toUpperCase();
    if (!id || seen.has(id) || !PROCEDURE_ID.test(id)) {
      continue;
    }
    seen.add(id);
    const name = item.name?.trim();
    out.push(name ? { id, name } : { id });
    if (out.length >= MAX_CATALOG_PROCEDURES) {
      break;
    }
  }
  return out;
}

export function compactProcedureKey(raw: string): string {
  const parts = raw
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((part) => part.length > 0);
  return parts.map((part) => WORD_DIGIT[part] ?? part).join("");
}

export function catalogProcedureAliases(proc: CatalogProcedure): string[] {
  const aliases = new Set<string>([compactProcedureKey(proc.id)]);
  const name = proc.name?.trim();
  if (name) {
    aliases.add(compactProcedureKey(name));
  }
  return [...aliases];
}

function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }
  const row: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost);
      prev = saved;
    }
  }
  return row[b.length]!;
}

/**
 * Unique catalog procedure id for a noisy token, or null.
 * Empty catalog → null (caller keeps the raw token).
 */
export function groundProcedureToCatalog(
  token: string | null | undefined,
  catalog: readonly CatalogProcedure[],
): string | null {
  const list = sanitizeCatalogProcedures(catalog);
  if (list.length === 0) {
    return null;
  }
  const key = compactProcedureKey(token ?? "");
  if (key.length < 2) {
    return null;
  }

  const exact = list.find((proc) => compactProcedureKey(proc.id) === key);
  if (exact) {
    return exact.id;
  }

  const aliasHits = list.filter((proc) => catalogProcedureAliases(proc).includes(key));
  if (aliasHits.length === 1) {
    return aliasHits[0]!.id;
  }

  if (key.length >= 3) {
    const near = list.filter((proc) => levenshtein(key, compactProcedureKey(proc.id)) <= 1);
    if (near.length === 1) {
      return near[0]!.id;
    }
  }

  return null;
}

export function groundInstructionProcedures(
  instructions: readonly Instruction[],
  catalog: readonly CatalogProcedure[],
): Instruction[] {
  if (catalog.length === 0) {
    return [...instructions];
  }
  return instructions.map((inst) => {
    if (
      inst.type !== "DESCEND_VIA" &&
      inst.type !== "CLIMB_VIA" &&
      inst.type !== "JOIN_PROCEDURE"
    ) {
      return inst;
    }
    const procedureId = groundProcedureToCatalog(inst.procedureId, catalog) ?? inst.procedureId;
    return procedureId === inst.procedureId ? inst : { ...inst, procedureId };
  });
}

export function proceduresFromCatalog(
  catalog?: {
    stars?: ReadonlyArray<{ id: string; name?: string }>;
    sids?: ReadonlyArray<{ id: string; name?: string }>;
  } | null,
): CatalogProcedure[] {
  if (!catalog) {
    return [];
  }
  return sanitizeCatalogProcedures([
    ...(catalog.stars ?? []).map((item) => ({ id: item.id, name: item.name })),
    ...(catalog.sids ?? []).map((item) => ({ id: item.id, name: item.name })),
  ]);
}
