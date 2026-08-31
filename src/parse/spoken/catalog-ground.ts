/**
 * Snap noisy ASR / Path C fix and procedure tokens onto the facility catalog.
 * Same idea as roster callsign grounding: not a vector DB, never invent an id.
 *
 * SEMAX is often heard as "see max" / "C-Max". Do not send kinematics.
 * DEMO ONE / demo 1 snaps to DEM1. Never invent an id that is not listed.
 */

import type { Instruction } from "@core";
import { snapFix, type RankedCatalogHit } from "./catalog-snap";

/**
 * Local snap needs the full facility (CIFP packs are hundreds of fixes).
 * Path C prompt lists are retrieved candidates (`MAX_PATH_C_FIXES` in path-c).
 */
export const MAX_CATALOG_FIXES = 4096;
const FIX_ID = /^[A-Z]{2,6}[0-9]{0,2}$/;

export const MAX_CATALOG_PROCEDURES = 256;
const PROCEDURE_ID = /^[A-Z]{2,8}[0-9]{0,2}$/;

export const MAX_CATALOG_APPROACHES = 256;
/** Authored `ILS27` and CIFP `I26R` / `H26RZ` / `H28-Z`. */
const APPROACH_ID = /^[A-Z]{1,8}\d{1,2}[LRC]?(?:-?[A-Z])?$/;

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

export function levenshtein(a: string, b: string): number {
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
 * Collapse doubles and fold Z/Y so ASR "Haynes" / "AJ" can match HAINZ / AJAAY.
 */
export function foldSpokenFix(raw: string): string {
  return normalizeFixKey(raw)
    .replace(/(.)\1+/g, "$1")
    .replace(/Z/g, "S")
    .replace(/Y/g, "I");
}

/**
 * Spoken aliases for a catalog id. `SEMAX` → `CMAX` / `SEEMAX` because ASR
 * writes the "see" in Sierra-Echo as the letter C. `AJAAY` → `AJ` because
 * controllers say the published word, not five letters.
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
  const collapsed = key.replace(/(.)\1+/g, "$1");
  aliases.add(collapsed);
  aliases.add(collapsed.replace(/Z/g, "S"));
  aliases.add(foldSpokenFix(id));
  const ay = collapsed.match(/^([A-Z]{2,4})(AY|EY|EE)$/);
  if (ay) {
    aliases.add(ay[1]!);
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

  const folded = foldSpokenFix(key);
  if (folded !== key) {
    const foldAliasHits = list.filter((id) => catalogFixAliases(id).includes(folded));
    if (foldAliasHits.length === 1) {
      return foldAliasHits[0]!;
    }
  }

  if (key.length >= 3) {
    const near = list.filter((id) => levenshtein(key, normalizeFixKey(id)) <= 1);
    if (near.length === 1) {
      return near[0]!;
    }
  }

  if (folded.length >= 3) {
    const foldNear = list.filter((id) => levenshtein(folded, foldSpokenFix(id)) <= 1);
    if (foldNear.length === 1) {
      return foldNear[0]!;
    }
  }

  return null;
}

export interface GroundedFixInstructions {
  instructions: Instruction[];
  ungroundedFixes: string[];
}

function groundDirectOrCrossFix(
  token: string,
  catalog: readonly string[],
  opts?: {
    preferIds?: ReadonlySet<string>;
    rankedFor?: (token: string) => readonly RankedCatalogHit[];
  },
): { fixId: string; ungrounded: boolean } {
  const unique = groundFixToCatalog(token, catalog);
  if (unique !== null) {
    return { fixId: unique, ungrounded: false };
  }
  const ranked = opts?.rankedFor?.(token) ?? [];
  const snapped = snapFix(token, ranked, opts?.preferIds);
  if (snapped.kind === "snap") {
    return { fixId: snapped.id, ungrounded: false };
  }
  return { fixId: token, ungrounded: true };
}

/**
 * Unique exact/alias/near-miss first, then T03-16 retrieve → snapFix.
 * Tie / weak / none keep the raw token and list it in `ungroundedFixes`.
 */
export function groundInstructionFixes(
  instructions: readonly Instruction[],
  catalog: readonly string[],
  opts?: {
    preferIds?: ReadonlySet<string>;
    rankedFor?: (token: string) => readonly RankedCatalogHit[];
  },
): GroundedFixInstructions {
  if (catalog.length === 0) {
    return { instructions: [...instructions], ungroundedFixes: [] };
  }
  const ungroundedFixes: string[] = [];
  const next = instructions.map((inst) => {
    if (inst.type !== "DIRECT" && inst.type !== "CROSS") {
      return inst;
    }
    const grounded = groundDirectOrCrossFix(inst.fixId, catalog, opts);
    if (grounded.ungrounded) {
      ungroundedFixes.push(inst.fixId);
      return inst;
    }
    return grounded.fixId === inst.fixId ? inst : { ...inst, fixId: grounded.fixId };
  });
  return { instructions: next, ungroundedFixes };
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

export interface CatalogApproach {
  id: string;
  name?: string;
  runway?: string;
  type?: string;
}

export function sanitizeCatalogApproaches(
  raw: readonly CatalogApproach[] | undefined | null,
): CatalogApproach[] {
  const out: CatalogApproach[] = [];
  const seen = new Set<string>();
  for (const item of raw ?? []) {
    const id = item.id.trim().toUpperCase();
    if (!id || seen.has(id) || !APPROACH_ID.test(id)) {
      continue;
    }
    seen.add(id);
    const name = item.name?.trim();
    const runway = item.runway?.trim();
    const type = item.type?.trim().toUpperCase();
    const entry: CatalogApproach = { id };
    if (name) {
      entry.name = name;
    }
    if (runway) {
      entry.runway = runway;
    }
    if (type) {
      entry.type = type;
    }
    out.push(entry);
    if (out.length >= MAX_CATALOG_APPROACHES) {
      break;
    }
  }
  return out;
}

function cifpApproachKind(id: string): string {
  const key = normalizeFixKey(id);
  if (key.startsWith("ILS")) {
    return "ILS";
  }
  if (key.startsWith("LOC")) {
    return "LOC";
  }
  if (key.startsWith("RNAV")) {
    return "RNAV";
  }
  if (key.startsWith("VOR")) {
    return "VOR";
  }
  if (key.startsWith("NDB")) {
    return "NDB";
  }
  const letter = key.match(/^([ILRHVN])\d/);
  if (letter === null) {
    return "";
  }
  const prefix = letter[1]!;
  if (prefix === "I") {
    return "ILS";
  }
  if (prefix === "L" || prefix === "B") {
    return "LOC";
  }
  if (prefix === "R" || prefix === "H") {
    return "RNAV";
  }
  if (prefix === "V") {
    return "VOR";
  }
  return "NDB";
}

function approachKind(app: CatalogApproach): string {
  const typed = app.type?.trim().toUpperCase();
  if (typed) {
    return typed;
  }
  return cifpApproachKind(app.id);
}

export function catalogApproachAliases(app: CatalogApproach): string[] {
  const key = normalizeFixKey(app.id);
  const aliases = new Set<string>([key]);
  if (app.name) {
    aliases.add(normalizeFixKey(app.name));
  }
  const match = app.id.match(/^([A-Z]+)(\d{1,2}[LRC]?)(?:-?[A-Z])?$/);
  if (match) {
    const type = match[1]!;
    const rwy = match[2]!;
    aliases.add(rwy);
    aliases.add(`RW${rwy}`);
    aliases.add(`RWY${rwy}`);
    aliases.add(`RUNWAY${rwy}`);
    if (type === "ILS") {
      aliases.add(`IL${rwy}`);
      aliases.add(`LOC${rwy}`);
    }
  }
  if (app.runway) {
    const rwyNorm = normalizeFixKey(app.runway);
    aliases.add(rwyNorm);
    aliases.add(`RW${rwyNorm}`);
    aliases.add(`RWY${rwyNorm}`);
    aliases.add(`RUNWAY${rwyNorm}`);
    const kind = approachKind(app);
    if (kind === "ILS") {
      aliases.add(`ILS${rwyNorm}`);
      aliases.add(`IL${rwyNorm}`);
      aliases.add(`LOC${rwyNorm}`);
    } else if (kind === "LOC") {
      aliases.add(`LOC${rwyNorm}`);
    } else if (kind === "RNAV") {
      aliases.add(`RNAV${rwyNorm}`);
      aliases.add(`GPS${rwyNorm}`);
    }
  }
  return [...aliases];
}

/**
 * Unique catalog approach id for a noisy token (e.g. IL27 / RW27 -> ILS27), or null.
 */
export function groundApproachToCatalog(
  token: string | null | undefined,
  catalog: readonly CatalogApproach[],
): string | null {
  const list = sanitizeCatalogApproaches(catalog);
  if (list.length === 0) {
    return null;
  }
  const key = normalizeFixKey(token ?? "");
  if (key.length < 2) {
    if (key.length === 0) {
      return null;
    }
    if (list.length === 1) {
      return list[0]!.id;
    }
    return null;
  }

  const exact = list.find((app) => normalizeFixKey(app.id) === key);
  if (exact) {
    return exact.id;
  }

  const aliasHits = list.filter((app) => catalogApproachAliases(app).includes(key));
  if (aliasHits.length === 1) {
    return aliasHits[0]!.id;
  }

  if (key.length >= 3) {
    const near = list.filter((app) => levenshtein(key, normalizeFixKey(app.id)) <= 1);
    if (near.length === 1) {
      return near[0]!.id;
    }
  }

  if ((key === "ILS" || key === "APPROACH") && list.length === 1) {
    return list[0]!.id;
  }

  return null;
}

export function groundInstructionApproaches(
  instructions: readonly Instruction[],
  catalog: readonly CatalogApproach[],
): Instruction[] {
  if (catalog.length === 0) {
    return [...instructions];
  }
  return instructions.map((inst) => {
    if (
      inst.type !== "CLEARED_APPROACH" &&
      inst.type !== "INTERCEPT_LOCALIZER" &&
      inst.type !== "EXPECT_APPROACH"
    ) {
      return inst;
    }
    const approachId = groundApproachToCatalog(inst.approachId, catalog) ?? inst.approachId;
    return approachId === inst.approachId ? inst : { ...inst, approachId };
  });
}

export function approachesFromCatalog(
  catalog?: {
    approaches?: ReadonlyArray<{
      id: string;
      name?: string;
      runway?: string;
      runwayId?: string;
      type?: string;
    }>;
  } | null,
): CatalogApproach[] {
  if (!catalog) {
    return [];
  }
  return sanitizeCatalogApproaches(
    (catalog.approaches ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      runway: item.runway ?? item.runwayId,
      type: item.type,
    })),
  );
}
