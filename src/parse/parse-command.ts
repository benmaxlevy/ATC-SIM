/**
 * Ordered parse stages for text and voice (`phases/_shared/parse-pipeline.md`):
 * normalize → typed tokenizer → Path A → Path B → configured Path C (`llm_c`).
 *
 * `source` is the channel. `parseStage` is which compiler won.
 * Speech must not construct Instruction objects — only this module + Path A/B
 * and the Path C schema check do.
 *
 * Ungrounded / tied identifier tokens on DIRECT / CROSS / VIA / approach
 * instructions convert a would-be local hit into a miss so Path C can run
 * with retrieved candidates. Unique T03-17 margin snap still wins locally.
 * Typed `DCT NOPE` stays an ok-parse (pilot `UNKNOWN_FIX`).
 */

import type { Instruction, ParseStage } from "@core";
import { parseRadioText, type ParseResult } from "./parseRadioText";
import { formatParseError, PARSE_ERROR } from "./tokens";
import { parseSpokenGrammar, repairHeadingVsTurnDegrees } from "./spoken/grammar";
import { normalizeSpoken } from "./spoken/normalizer";
import { groundCallsignToRoster, spokenCallsignToken } from "./spoken/telephony";
import { rewriteSpokenToTyped } from "./spoken/typed-fuzzy";
import { matchSpokenPatterns } from "./spoken/pattern-matcher";
import {
  groundApproachToCatalog,
  groundInstructionApproaches,
  groundInstructionFixes,
  groundInstructionProcedures,
  groundProcedureToCatalog,
  normalizeFixKey,
  sanitizeCatalogApproaches,
  sanitizeCatalogProcedures,
  sanitizeFixIds,
  type CatalogApproach,
  type CatalogProcedure,
} from "./spoken/catalog-ground";
import { retrieveFix } from "./spoken/catalog-retrieve";
import {
  MAX_PATH_C_FIXES,
  PATH_C_SCHEMA_VERSION,
  fetchParsePathC,
  type ParsePathCFn,
  type PathCContext,
} from "./path-c";

export interface ParseCommandOpts {
  source: "text" | "voice";
  selectedCallsign?: string | null;
  /** Live ICAO roster for Path C prompt grounding. Parse stays World-free. */
  callsigns?: readonly string[];
  /**
   * Facility catalog ids (fixes + navaids) for DIRECT/CROSS snap and Path C
   * `fixes=` prompt grounding. Not kinematics. Parse stays World-free.
   */
  fixes?: readonly string[];
  /**
   * STAR/SID catalog for DESCEND_VIA / CLIMB_VIA / JOIN_PROCEDURE snap (`demo 1` → `DEM1`)
   * and Path C `procedures=` grounding.
   */
  procedures?: readonly CatalogProcedure[];
  /**
   * Approach catalog for CLEARED_APPROACH / INTERCEPT_LOCALIZER snap (`RW27` / `IL27` → `ILS27`)
   * and Path C `approaches=` grounding.
   */
  approaches?: readonly CatalogApproach[];
  /** Explicit opt-in. When true, stage 4 may fetch after a local miss. */
  pathC?: boolean;
  /** Injected fetch. Default POSTs to our speech-api `/parse`. */
  parsePathC?: ParsePathCFn;
}

const MAX_ROSTER = 64;

const IDENT_TRIGGERS = new Set([
  "direct",
  "cross",
  "from",
  "via",
  "cleared",
  "clear",
  "ils",
  "dct",
  "x",
  "join",
  "app",
  "il",
  "exp",
  "cvia",
]);

const APPROACH_CUES = new Set([
  "ils",
  "approach",
  "localizer",
  "runway",
  "cleared",
  "clear",
  "intercept",
]);

function hasApproachCue(tokens: readonly string[]): boolean {
  return tokens.some((tok) => APPROACH_CUES.has(tok.toLowerCase()));
}

const SLOT_SKIP = new Set([
  "to",
  "the",
  "a",
  "an",
  "on",
  "approach",
  "runway",
  "rwy",
  "and",
  "then",
]);

function rosterFromOpts(opts: ParseCommandOpts): string[] {
  const raw = opts.callsigns ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const cs of raw) {
    const up = cs.trim().toUpperCase();
    if (!up || seen.has(up)) {
      continue;
    }
    seen.add(up);
    out.push(up);
    if (out.length >= MAX_ROSTER) {
      break;
    }
  }
  return out;
}

function isIdentPart(tok: string): boolean {
  if (IDENT_TRIGGERS.has(tok) || SLOT_SKIP.has(tok)) {
    return false;
  }
  return /^[a-z0-9]{1,8}$/.test(tok);
}

/**
 * Identifier slot tokens from normalizeSpoken text (after direct / cross /
 * from / via / cleared / ils and typed DCT / X / VIA / APP / IL / EXP / JOIN).
 */
function identifierSlotTokens(normalized: string): string[] {
  const tokens = normalized.split(/\s+/).filter((tok) => tok.length > 0);
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const key = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (key.length < 2 || seen.has(key)) {
      return;
    }
    seen.add(key);
    out.push(key);
  };
  for (let i = 0; i < tokens.length; i += 1) {
    if (!IDENT_TRIGGERS.has(tokens[i]!)) {
      continue;
    }
    let j = i + 1;
    while (j < tokens.length && SLOT_SKIP.has(tokens[j]!)) {
      j += 1;
    }
    const parts: string[] = [];
    while (j < tokens.length && parts.length < 3 && isIdentPart(tokens[j]!)) {
      parts.push(tokens[j]!);
      j += 1;
    }
    if (parts.length === 0) {
      continue;
    }
    push(parts.join(""));
    for (const part of parts) {
      push(part);
    }
    if (parts.length > 1) {
      push(parts[parts.length - 1]!);
    }
  }
  return out;
}

function mergeRetrievedFixes(tokens: readonly string[], catalog: readonly string[]): string[] {
  const best = new Map<string, number>();
  for (const token of tokens) {
    for (const hit of retrieveFix(token, catalog, { limit: MAX_PATH_C_FIXES })) {
      const prev = best.get(hit.id);
      if (prev === undefined || hit.score > prev) {
        best.set(hit.id, hit.score);
      }
    }
  }
  return [...best.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_PATH_C_FIXES)
    .map(([id]) => id);
}

function matchProceduresForTokens(
  tokens: readonly string[],
  procedures: readonly CatalogProcedure[],
): CatalogProcedure[] {
  const out: CatalogProcedure[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const id = groundProcedureToCatalog(token, procedures);
    if (id === null || seen.has(id)) {
      continue;
    }
    const row = procedures.find((item) => item.id === id);
    if (row === undefined) {
      continue;
    }
    seen.add(id);
    out.push({ ...row });
    if (out.length >= MAX_PATH_C_FIXES) {
      break;
    }
  }
  return out;
}

const RUNWAY_ONES: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

const RUNWAY_TEENS: Readonly<Record<string, number>> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const RUNWAY_TENS: Readonly<Record<string, number>> = {
  twenty: 20,
  thirty: 30,
};

const RUNWAY_SIDES: Readonly<Record<string, string>> = {
  left: "L",
  l: "L",
  lima: "L",
  right: "R",
  r: "R",
  romeo: "R",
  center: "C",
  centre: "C",
  c: "C",
  charlie: "C",
};

function parseRunwaySide(tok: string | undefined): string | null {
  if (!tok) return null;
  return RUNWAY_SIDES[tok.toLowerCase()] ?? null;
}

interface ParsedSpokenRunway {
  runway: string;
  unpadded: string;
}

function parseSpokenRunwayTokens(tokens: readonly string[]): ParsedSpokenRunway[] {
  const results: ParsedSpokenRunway[] = [];
  const seen = new Set<string>();
  const add = (num: number, side: string) => {
    if (num < 1 || num > 36) return;
    const padded = `${String(num).padStart(2, "0")}${side}`;
    const unpadded = `${num}${side}`;
    if (!seen.has(padded)) {
      seen.add(padded);
      results.push({ runway: padded, unpadded });
    }
  };

  for (const token of tokens) {
    const raw = token.trim();
    const compact = raw.match(/^(?:RW|RWY|ILS|I|LOC)?(\d{1,2})([LRC])?$/i);
    if (compact) {
      add(Number(compact[1]), compact[2]?.toUpperCase() ?? "");
    }
    const upper = raw.toUpperCase();
    const joined = upper.match(
      /^(ZERO|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN|SEVENTEEN|EIGHTEEN|NINETEEN|TWENTY|THIRTY)(ZERO|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE)?(LEFT|RIGHT|CENTER|CENTRE|L|R|C)?$/,
    );
    if (joined) {
      const p1 = joined[1]!.toLowerCase();
      const p2 = joined[2]?.toLowerCase();
      const p3 = joined[3]?.toLowerCase();
      let num: number | null = null;
      if (p1 in RUNWAY_TENS && (p2 || p3)) {
        const base = RUNWAY_TENS[p1]!;
        const addDigit = p2 && p2 in RUNWAY_ONES ? RUNWAY_ONES[p2]! : 0;
        num = base + addDigit;
      } else if (p1 in RUNWAY_ONES && p2 && p2 in RUNWAY_ONES) {
        num = RUNWAY_ONES[p1]! * 10 + RUNWAY_ONES[p2]!;
      } else if (p1 in RUNWAY_TEENS && (p2 || p3)) {
        num = RUNWAY_TEENS[p1]!;
      } else if (p1 in RUNWAY_ONES && p3) {
        num = RUNWAY_ONES[p1]!;
      }
      if (num !== null) {
        const side = p3 ? (RUNWAY_SIDES[p3] ?? "") : "";
        add(num, side);
      }
    }
  }

  let i = 0;
  while (i < tokens.length) {
    let cursor = i;
    const hasRunwayPrefix =
      tokens[cursor]?.toLowerCase() === "runway" || tokens[cursor]?.toLowerCase() === "rwy";
    if (hasRunwayPrefix) {
      cursor += 1;
    }
    const t0 = tokens[cursor]?.toLowerCase();
    const t1 = tokens[cursor + 1]?.toLowerCase();
    const t2 = tokens[cursor + 2]?.toLowerCase();

    // Guard against 3-digit headings (e.g. "two six zero")
    if (t0 && t1 && t2 && t0 in RUNWAY_ONES && t1 in RUNWAY_ONES && t2 in RUNWAY_ONES) {
      i = cursor + 3;
      continue;
    }

    // Case 1: Two single digits: "two" + "six" (+ optional side)
    if (t0 && t1 && t0 in RUNWAY_ONES && t1 in RUNWAY_ONES) {
      const num = RUNWAY_ONES[t0]! * 10 + RUNWAY_ONES[t1]!;
      const side = parseRunwaySide(t2) ?? "";
      add(num, side);
      i = cursor + 2 + (side ? 1 : 0);
      continue;
    }

    // Case 2: Tens + single digit: "twenty" + "six" (+ optional side)
    if (t0 && t0 in RUNWAY_TENS && t1 && t1 in RUNWAY_ONES && RUNWAY_ONES[t1]! > 0) {
      const num = RUNWAY_TENS[t0]! + RUNWAY_ONES[t1]!;
      const side = parseRunwaySide(t2) ?? "";
      add(num, side);
      i = cursor + 2 + (side ? 1 : 0);
      continue;
    }

    // Case 3: Tens alone: "twenty" (+ optional side)
    if (t0 && t0 in RUNWAY_TENS) {
      const num = RUNWAY_TENS[t0]!;
      const side = parseRunwaySide(t1) ?? "";
      if (side !== "" || hasRunwayPrefix) {
        add(num, side);
        i = cursor + 1 + (side ? 1 : 0);
        continue;
      }
    }

    // Case 4: Teens: "ten" ... "nineteen" (+ optional side)
    if (t0 && t0 in RUNWAY_TEENS) {
      const num = RUNWAY_TEENS[t0]!;
      const side = parseRunwaySide(t1) ?? "";
      if (side !== "" || hasRunwayPrefix) {
        add(num, side);
        i = cursor + 1 + (side ? 1 : 0);
        continue;
      }
    }

    // Case 5: Single digit: "four" (+ optional side)
    if (t0 && t0 in RUNWAY_ONES && RUNWAY_ONES[t0]! > 0) {
      const side = parseRunwaySide(t1) ?? "";
      if (side !== "" || hasRunwayPrefix) {
        add(RUNWAY_ONES[t0]!, side);
        i = cursor + 1 + (side ? 1 : 0);
        continue;
      }
    }

    i += 1;
  }

  return results;
}

export function matchApproachesForTokens(
  tokens: readonly string[],
  approaches: readonly CatalogApproach[],
): CatalogApproach[] {
  const out: CatalogApproach[] = [];
  const seen = new Set<string>();

  const tryAdd = (id: string | null) => {
    if (id === null || seen.has(id)) {
      return false;
    }
    const row = approaches.find((item) => item.id === id);
    if (row === undefined) {
      return false;
    }
    seen.add(id);
    out.push({ ...row });
    return out.length >= MAX_PATH_C_FIXES;
  };

  // 1. Direct token match
  for (const token of tokens) {
    const id = groundApproachToCatalog(token, approaches);
    if (tryAdd(id)) {
      return out;
    }
  }

  // 2. Map number words to runway numbers (e.g. "two six right" or "twenty six right" -> "26R")
  const spokenRunways = parseSpokenRunwayTokens(tokens);
  for (const { runway, unpadded } of spokenRunways) {
    // First, check approaches that directly have this runway
    for (const app of approaches) {
      if (
        (app.runway && normalizeFixKey(app.runway) === runway) ||
        normalizeFixKey(app.id).endsWith(runway)
      ) {
        if (tryAdd(app.id)) {
          return out;
        }
      }
    }

    const candidates = [
      runway,
      `ILS${runway}`,
      `I${runway}`,
      `RW${runway}`,
      `RWY${runway}`,
      `RUNWAY${runway}`,
      unpadded,
      `ILS${unpadded}`,
      `I${unpadded}`,
      `RW${unpadded}`,
      `LOC${runway}`,
      `RNAV${runway}`,
      `GPS${runway}`,
    ];
    for (const cand of candidates) {
      const id = groundApproachToCatalog(cand, approaches);
      if (tryAdd(id)) {
        return out;
      }
    }
  }

  return out;
}

function cloneProcedures(list: readonly CatalogProcedure[]): CatalogProcedure[] {
  return list.slice(0, MAX_PATH_C_FIXES).map((item) => ({ ...item }));
}

function cloneApproaches(list: readonly CatalogApproach[]): CatalogApproach[] {
  return list.slice(0, MAX_PATH_C_FIXES).map((item) => ({ ...item }));
}

/**
 * Path C `fixes=` is the retrieved cluster for this transcript, never
 * `opts.fixes.slice(0, 64)` file-order padding.
 */
function pathCFixIds(
  catalog: readonly string[],
  queryTokens: readonly string[],
  retrieved: readonly string[],
): string[] {
  if (catalog.length === 0) {
    return [];
  }
  if (retrieved.length > 0) {
    if (catalog.length <= MAX_PATH_C_FIXES) {
      return [...catalog];
    }
    return [...retrieved];
  }
  if (queryTokens.length > 0) {
    return [];
  }
  if (catalog.length <= MAX_PATH_C_FIXES) {
    return [...catalog];
  }
  return [];
}

function pathCProcedureList(
  procedures: readonly CatalogProcedure[],
  queryTokens: readonly string[],
): CatalogProcedure[] {
  if (procedures.length === 0) {
    return [];
  }
  const matched = matchProceduresForTokens(queryTokens, procedures);
  if (matched.length > 0) {
    if (procedures.length <= MAX_PATH_C_FIXES) {
      return cloneProcedures(procedures);
    }
    return matched;
  }
  if (queryTokens.length > 0) {
    return [];
  }
  if (procedures.length <= MAX_PATH_C_FIXES) {
    return cloneProcedures(procedures);
  }
  return [];
}

export function pathCApproachList(
  approaches: readonly CatalogApproach[],
  queryTokens: readonly string[],
): CatalogApproach[] {
  if (approaches.length === 0) {
    return [];
  }
  const matched = matchApproachesForTokens(queryTokens, approaches);
  if (matched.length > 0) {
    if (approaches.length <= MAX_PATH_C_FIXES) {
      return cloneApproaches(approaches);
    }
    return matched;
  }
  if (hasApproachCue(queryTokens) || approaches.length <= MAX_PATH_C_FIXES) {
    return cloneApproaches(approaches);
  }
  return [];
}

function pathCContext(
  roster: readonly string[],
  selected: string | null,
  catalog: readonly string[],
  procedures: readonly CatalogProcedure[],
  approaches: readonly CatalogApproach[],
  queryTokens: readonly string[],
): PathCContext | undefined {
  const retrieved = mergeRetrievedFixes(queryTokens, catalog);
  const fixes = pathCFixIds(catalog, queryTokens, retrieved);
  const pathProcedures = pathCProcedureList(procedures, queryTokens);
  const pathApproaches = pathCApproachList(approaches, queryTokens);
  if (
    roster.length === 0 &&
    !selected &&
    fixes.length === 0 &&
    pathProcedures.length === 0 &&
    pathApproaches.length === 0
  ) {
    return undefined;
  }
  return {
    callsigns: [...roster],
    selectedCallsign: selected,
    ...(fixes.length > 0 ? { fixes } : {}),
    ...(pathProcedures.length > 0 ? { procedures: pathProcedures } : {}),
    ...(pathApproaches.length > 0 ? { approaches: pathApproaches } : {}),
  };
}

function attachCallsign(parsed: ParseResult, selected: string | null): ParseResult {
  if (!parsed.ok) {
    return parsed;
  }
  return {
    ...parsed,
    callsignToken: parsed.callsignToken ?? selected,
  };
}

function ungroundedIdentifierTokens(
  instructions: readonly Instruction[],
  catalog: readonly string[],
  procedures: readonly CatalogProcedure[],
  approaches: readonly CatalogApproach[],
): string[] {
  const groundedFixes = groundInstructionFixes(instructions, catalog, {
    rankedFor: (token) => retrieveFix(token, catalog),
  });
  const ungrounded = [...groundedFixes.ungroundedFixes];
  const next = groundInstructionApproaches(
    groundInstructionProcedures(groundedFixes.instructions, procedures),
    approaches,
  );
  for (const inst of next) {
    if (
      inst.type === "DESCEND_VIA" ||
      inst.type === "CLIMB_VIA" ||
      inst.type === "JOIN_PROCEDURE"
    ) {
      if (
        procedures.length > 0 &&
        groundProcedureToCatalog(inst.procedureId, procedures) === null
      ) {
        ungrounded.push(inst.procedureId);
      }
    }
    if (
      inst.type === "CLEARED_APPROACH" ||
      inst.type === "INTERCEPT_LOCALIZER" ||
      inst.type === "EXPECT_APPROACH"
    ) {
      if (approaches.length > 0 && groundApproachToCatalog(inst.approachId, approaches) === null) {
        ungrounded.push(inst.approachId);
      }
    }
  }
  return ungrounded;
}

function okStage(
  parsed: Extract<ParseResult, { ok: true }>,
  sourceText: string,
  parseStage: ParseStage,
  source: "text" | "voice",
  selected: string | null,
  catalog: readonly string[],
  procedures: readonly CatalogProcedure[],
  approaches: readonly CatalogApproach[],
): Extract<ParseResult, { ok: true }> {
  const groundedFixes = groundInstructionFixes(parsed.instructions, catalog, {
    rankedFor: (token) => retrieveFix(token, catalog),
  });
  return {
    ok: true,
    callsignToken: parsed.callsignToken ?? selected,
    instructions: groundInstructionApproaches(
      groundInstructionProcedures(groundedFixes.instructions, procedures),
      approaches,
    ),
    sourceText,
    parseStage,
    source,
    ...(groundedFixes.ungroundedFixes.length > 0
      ? { ungroundedFixes: groundedFixes.ungroundedFixes }
      : {}),
  };
}

function tryGroundedLocal(
  parsed: ParseResult,
  sourceText: string,
  parseStage: ParseStage,
  source: "text" | "voice",
  selected: string | null,
  catalog: readonly string[],
  procedures: readonly CatalogProcedure[],
  approaches: readonly CatalogApproach[],
):
  | { kind: "hit"; result: Extract<ParseResult, { ok: true }> }
  | { kind: "ungrounded"; tokens: string[] }
  | null {
  if (!parsed.ok || parsed.instructions.length === 0) {
    return null;
  }
  const ungrounded = ungroundedIdentifierTokens(
    parsed.instructions,
    catalog,
    procedures,
    approaches,
  );
  const result = okStage(
    parsed,
    sourceText,
    parseStage,
    source,
    selected,
    catalog,
    procedures,
    approaches,
  );
  if (ungrounded.length === 0) {
    return { kind: "hit", result };
  }
  if (parseStage === "typed") {
    return { kind: "hit", result };
  }
  return { kind: "ungrounded", tokens: ungrounded };
}

function pathCIdentifierListed(
  instructions: readonly Instruction[],
  context: PathCContext | undefined,
): boolean {
  const fixes = new Set(context?.fixes ?? []);
  const procedures = new Set((context?.procedures ?? []).map((item) => item.id));
  const approaches = new Set((context?.approaches ?? []).map((item) => item.id));
  for (const inst of instructions) {
    if (inst.type === "DIRECT" || inst.type === "CROSS") {
      if (!fixes.has(inst.fixId)) {
        return false;
      }
    }
    if (
      inst.type === "DESCEND_VIA" ||
      inst.type === "CLIMB_VIA" ||
      inst.type === "JOIN_PROCEDURE"
    ) {
      if (!procedures.has(inst.procedureId)) {
        return false;
      }
    }
    if (
      inst.type === "CLEARED_APPROACH" ||
      inst.type === "INTERCEPT_LOCALIZER" ||
      inst.type === "EXPECT_APPROACH"
    ) {
      if (!approaches.has(inst.approachId)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * First complete **grounded** stage wins. `sourceText` on the result is the
 * pre-normalize original. Path C runs only after typed/A/B miss, including
 * ungrounded identifier tokens. A unique local snap is never overridden.
 */
export async function parseCommand(
  sourceText: string,
  opts: ParseCommandOpts,
): Promise<ParseResult> {
  const selected = opts.selectedCallsign ?? null;
  const roster = rosterFromOpts(opts);
  const catalog = sanitizeFixIds(opts.fixes);
  const procedures = sanitizeCatalogProcedures(opts.procedures);
  const approaches = sanitizeCatalogApproaches(opts.approaches);
  const normalized = normalizeSpoken(sourceText);
  const extraTokens: string[] = [];

  const typed = tryGroundedLocal(
    attachCallsign(parseRadioText(normalized), selected),
    sourceText,
    "typed",
    opts.source,
    selected,
    catalog,
    procedures,
    approaches,
  );
  if (typed?.kind === "hit") {
    return typed.result;
  }
  if (typed?.kind === "ungrounded") {
    extraTokens.push(...typed.tokens);
  }

  const spoken = parseSpokenGrammar(normalized, selected, sourceText, catalog, procedures);
  const pathA = tryGroundedLocal(
    spoken,
    sourceText,
    "spoken_a",
    opts.source,
    selected,
    catalog,
    procedures,
    approaches,
  );
  if (pathA?.kind === "hit") {
    return pathA.result;
  }
  if (pathA?.kind === "ungrounded") {
    extraTokens.push(...pathA.tokens);
  }

  const rewritten = rewriteSpokenToTyped(normalized);
  if (rewritten !== null) {
    const pathB = tryGroundedLocal(
      attachCallsign(parseRadioText(rewritten), selected),
      sourceText,
      "spoken_b",
      opts.source,
      selected,
      catalog,
      procedures,
      approaches,
    );
    if (pathB?.kind === "hit") {
      return pathB.result;
    }
    if (pathB?.kind === "ungrounded") {
      extraTokens.push(...pathB.tokens);
    }
  }

  const islandParsed = matchSpokenPatterns(
    normalized,
    selected,
    sourceText,
    catalog,
    procedures,
    approaches,
  );
  const island = tryGroundedLocal(
    islandParsed,
    sourceText,
    "spoken_b",
    opts.source,
    selected,
    catalog,
    procedures,
    approaches,
  );
  if (island?.kind === "hit") {
    return island.result;
  }
  if (island?.kind === "ungrounded") {
    extraTokens.push(...island.tokens);
  }

  const queryTokens = [...identifierSlotTokens(normalized), ...extraTokens];
  const retrievedFixes = mergeRetrievedFixes(queryTokens, catalog);
  const matchedProcedures = matchProceduresForTokens(queryTokens, procedures);
  const matchedApproaches = matchApproachesForTokens(queryTokens, approaches);
  const identifierQuery = queryTokens.length > 0;
  const emptyIdentifierRetrieve =
    identifierQuery &&
    retrievedFixes.length === 0 &&
    matchedProcedures.length === 0 &&
    matchedApproaches.length === 0;

  if (opts.pathC && !emptyIdentifierRetrieve) {
    const run = opts.parsePathC ?? fetchParsePathC;
    const context = pathCContext(roster, selected, catalog, procedures, approaches, queryTokens);
    try {
      const hit = await run({
        text: sourceText,
        source: opts.source,
        schemaVersion: PATH_C_SCHEMA_VERSION,
        context,
      });
      if (hit !== null && hit.instructions.length > 0) {
        const grounded =
          groundCallsignToRoster(
            hit.callsignToken ?? spokenCallsignToken(normalized),
            normalized,
            roster,
            selected,
          ) ??
          hit.callsignToken ??
          spokenCallsignToken(normalized);
        const pathFixes = context?.fixes ?? [];
        const pathProcedures = context?.procedures ?? [];
        const pathApproaches = context?.approaches ?? [];
        const salvaged = okStage(
          {
            ok: true,
            callsignToken: grounded,
            instructions: repairHeadingVsTurnDegrees(normalized, hit.instructions),
            sourceText,
          },
          sourceText,
          "llm_c",
          opts.source,
          selected,
          pathFixes,
          pathProcedures,
          pathApproaches,
        );
        const ungrounded = salvaged.ungroundedFixes ?? [];
        if (ungrounded.length === 0 && pathCIdentifierListed(salvaged.instructions, context)) {
          return salvaged;
        }
      }
    } catch {
      // Timeout / network / injected throw → miss. Never through the tick.
    }
  }

  const error =
    !spoken.ok && spoken.error.startsWith(PARSE_ERROR.UNKNOWN_TELEPHONY)
      ? spoken.error
      : !islandParsed.ok && islandParsed.error.startsWith(PARSE_ERROR.UNKNOWN_TELEPHONY)
        ? islandParsed.error
        : formatParseError(PARSE_ERROR.PARSE_MISS);
  return { ok: false, error, sourceText };
}
