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
  "ils",
  "dct",
  "x",
  "join",
  "app",
  "il",
  "exp",
  "cvia",
]);

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

function matchApproachesForTokens(
  tokens: readonly string[],
  approaches: readonly CatalogApproach[],
): CatalogApproach[] {
  const out: CatalogApproach[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const id = groundApproachToCatalog(token, approaches);
    if (id === null || seen.has(id)) {
      continue;
    }
    const row = approaches.find((item) => item.id === id);
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

function pathCApproachList(
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
  if (queryTokens.length > 0) {
    return [];
  }
  if (approaches.length <= MAX_PATH_C_FIXES) {
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
