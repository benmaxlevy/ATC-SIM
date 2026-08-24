/**
 * Snap noisy ASR / Path C fix and procedure tokens onto the facility catalog.
 * Same idea as roster callsign grounding: not a vector DB, never invent an id.
 *
 * SEMAX is often heard as "see max" / "C-Max". Do not send kinematics.
 * DEMO ONE / demo 1 snaps to DEM1. Never invent an id that is not listed.
 */

import type { Instruction } from "@core";

export const MAX_CATALOG_FIXES = 64;
const FIX_ID = /^[A-Z]{2,6}[0-9]{0,2}$/;

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

export function sanitizeFixIds(raw: readonly string[] | undefined | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw ?? []) {
    const up = item.trim().toUpperCase();
    if (!up || seen.has(up) || !FIX_ID.test(up)) {
      continue;
    }
    seen.add(up);
    out.push(up);
    if (out.length >= MAX_CATALOG_FIXES) {
      break;
    }
  }
  return out;
}

/** Letters/digits only, so `C-Max` and `see max` share a key with catalog ids. */
export function normalizeFixKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Spoken aliases for a catalog id. `SEMAX` → `CMAX` / `SEEMAX` because ASR
 * writes the "see" in Sierra-Echo as the letter C.
 */
export function catalogFixAliases(id: string): string[] {
  const key = normalizeFixKey(id);
  const aliases = new Set<string>([key]);
  if (key.startsWith("SE") && key.length >= 4) {
    const rest = key.slice(2);
    aliases.add(`C${rest}`);
    aliases.add(`SEE${rest}`);
    aliases.add(`SEA${rest}`);
  }
  return [...aliases];
}

/**
 * Unique catalog id for a noisy token, or null if nothing unique matches.
 * Empty catalog → null (caller keeps the raw token).
 */
export function groundFixToCatalog(
  token: string | null | undefined,
  catalog: readonly string[],
): string | null {
  const list = sanitizeFixIds(catalog);
  if (list.length === 0) {
    return null;
  }
  const key = normalizeFixKey(token ?? "");
  if (key.length < 2) {
    return null;
  }

  const exact = list.find((id) => id === key || normalizeFixKey(id) === key);
  if (exact) {
    return exact;
  }

  const aliasHits = list.filter((id) => catalogFixAliases(id).includes(key));
  if (aliasHits.length === 1) {
    return aliasHits[0]!;
  }

  if (key.length >= 3) {
    const near = list.filter((id) => levenshtein(key, normalizeFixKey(id)) <= 1);
    if (near.length === 1) {
      return near[0]!;
    }
  }

  return null;
}

export function groundInstructionFixes(
  instructions: readonly Instruction[],
  catalog: readonly string[],
): Instruction[] {
  if (catalog.length === 0) {
    return [...instructions];
  }
  return instructions.map((inst) => {
    if (inst.type === "DIRECT") {
      const fixId = groundFixToCatalog(inst.fixId, catalog) ?? inst.fixId;
      return fixId === inst.fixId ? inst : { ...inst, fixId };
    }
    if (inst.type === "CROSS") {
      const fixId = groundFixToCatalog(inst.fixId, catalog) ?? inst.fixId;
      return fixId === inst.fixId ? inst : { ...inst, fixId };
    }
    return inst;
  });
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
