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
import { repairSpokenLexemes } from "./spoken/lexical-repair";
import { groundCallsignToRoster, spokenCallsignToken } from "./spoken/telephony";
import { rewriteSpokenToTyped } from "./spoken/typed-fuzzy";
import { matchSpokenPatterns } from "./spoken/pattern-matcher";
import {
  groundApproachToCatalog,
  groundAirportToCatalog,
  groundInstructionApproaches,
  groundInstructionFixes,
  groundInstructionProcedures,
  groundProcedureToCatalog,
  rankFixCandidates,
  sanitizeCatalogAirports,
  normalizeFixKey,
  catalogFixAliases,
  catalogProcedureAliases,
  compactProcedureKey,
  catalogFixAliasesForEntry,
  sanitizeCatalogFixEntries,
  sanitizeCatalogApproaches,
  sanitizeCatalogProcedures,
  type CatalogApproach,
  type CatalogAirport,
  type CatalogFixMatchMethod,
  type CatalogFixInput,
  type CatalogProcedure,
  type CatalogStarTransitionVocab,
} from "./spoken/catalog-ground";
import { routeWindowBounds } from "./ifr-clearance-route-window";
import { retrieveFix } from "./spoken/catalog-retrieve";
import {
  MAX_PATH_C_FIXES,
  PATH_C_SCHEMA_VERSION,
  fetchParsePathC,
  schemaCheckPathC,
  pathCResultIsComplete,
  type ParsePathCFn,
  type PathCContext,
  type PathCProcedureCandidate,
  type PathCRouteCandidate,
  type PathCRouteCandidateInput,
  type PathCRouteFixMatch,
  type PathCRouteFixMatchCandidate,
  type PathCRouteWindow,
  type PathCTranscriptSpan,
  routePathCOutputIsGrounded,
} from "./path-c";

export interface ParseCommandOpts {
  source: "text" | "voice";
  selectedCallsign?: string | null;
  /** Live ICAO roster for Path C prompt grounding. Parse stays World-free. */
  callsigns?: readonly string[];
  /**
   * Facility fix/navaid vocabulary for DIRECT/CROSS snap and Path C `fixes=`
   * prompt grounding. Not kinematics. Parse stays World-free.
   */
  fixes?: readonly CatalogFixInput[];
  /** Optional typed fix/navaid catalog projection for route-window Path C. */
  routeCandidates?: readonly PathCRouteCandidateInput[];
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
  /** Airport identity vocabulary; clearance-limit namespace only. */
  airports?: readonly CatalogAirport[];
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

function isIfrClearanceCandidate(normalized: string): boolean {
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return (
    tokens.includes("clr") ||
    tokens.some(
      (token, index) => (token === "cleared" || token === "clear") && tokens[index + 1] === "to",
    )
  );
}

function isSoleIfrClearance(result: Extract<ParseResult, { ok: true }>): boolean {
  return result.instructions.length === 1 && result.instructions[0]?.type === "IFR_CLEARANCE";
}

function attachCallsign(parsed: ParseResult, selected: string | null): ParseResult {
  if (!parsed.ok) return parsed;
  return { ...parsed, callsignToken: parsed.callsignToken ?? selected };
}

function airportKey(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Replace only the airport-limit slot; airport ids never enter fix grounding. */
function rewriteIfrAirportLimit(normalized: string, airports: readonly CatalogAirport[]): string {
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const start = tokens.findIndex(
    (token, index) =>
      (token === "clr" || token === "clear" || token === "cleared") && tokens[index + 1] === "to",
  );
  if (start < 0) return normalized;
  const limitStart = start + 2;
  const access = new Set(["via", "asfiled", "as"]);
  const limitEnd = tokens.findIndex((token, index) => index >= limitStart && access.has(token));
  const end = limitEnd < 0 ? tokens.length : limitEnd;
  let winner: { icao: string; length: number } | null = null;
  for (const airport of sanitizeCatalogAirports(airports)) {
    for (const name of [airport.icao, airport.name, ...(airport.aliases ?? [])]) {
      const parts = normalizeSpoken(name).split(" ").filter(Boolean);
      if (parts.length === 0 || limitStart + parts.length > end) continue;
      const phrase = tokens.slice(limitStart, limitStart + parts.length).join(" ");
      if (airportKey(phrase) !== airportKey(name)) continue;
      const hit = { icao: airport.icao, length: parts.length };
      if (winner === null || hit.length > winner.length) winner = hit;
      else if (hit.length === winner.length && hit.icao !== winner.icao) return normalized;
    }
  }
  if (winner === null) return normalized;
  return [
    ...tokens.slice(0, limitStart),
    winner.icao,
    ...tokens.slice(limitStart + winner.length),
  ].join(" ");
}

function localIfrClearanceSyntaxIsValid(
  normalized: string,
  selected: string | null,
  catalog: readonly CatalogFixInput[],
  procedures: readonly CatalogProcedure[],
  clearanceLimitIds: ReadonlySet<string>,
): boolean {
  const typed = attachCallsign(
    parseRadioText(normalized, { fixes: catalog, procedures }),
    selected,
  );
  if (typed.ok && isSoleIfrClearance(typed)) return true;
  const spoken = parseSpokenGrammar(
    normalized,
    selected,
    normalized,
    catalog,
    procedures,
    clearanceLimitIds,
  );
  return spoken.ok && isSoleIfrClearance(spoken);
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

function mergeRetrievedFixes(
  tokens: readonly string[],
  catalog: readonly CatalogFixInput[],
): string[] {
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

function cloneCatalogEntries<T extends object>(list: readonly T[]): T[] {
  return list.slice(0, MAX_PATH_C_FIXES).map((item) => ({ ...item }));
}

/**
 * Path C `fixes=` is the retrieved cluster for this transcript, never
 * `opts.fixes.slice(0, 64)` file-order padding.
 */
function pathCFixIds(
  catalog: readonly CatalogFixInput[],
  queryTokens: readonly string[],
  retrieved: readonly string[],
): string[] {
  if (catalog.length === 0) {
    return [];
  }
  if (retrieved.length > 0) {
    if (catalog.length <= MAX_PATH_C_FIXES) {
      return sanitizeCatalogFixEntries(catalog).map((entry) => entry.id);
    }
    return [...retrieved];
  }
  if (queryTokens.length > 0) {
    return [];
  }
  if (catalog.length <= MAX_PATH_C_FIXES) {
    return sanitizeCatalogFixEntries(catalog).map((entry) => entry.id);
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
      return cloneCatalogEntries(procedures);
    }
    return matched;
  }
  if (queryTokens.length > 0) {
    return [];
  }
  if (procedures.length <= MAX_PATH_C_FIXES) {
    return cloneCatalogEntries(procedures);
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
      return cloneCatalogEntries(approaches);
    }
    return matched;
  }
  if (hasApproachCue(queryTokens) || approaches.length <= MAX_PATH_C_FIXES) {
    return cloneCatalogEntries(approaches);
  }
  return [];
}

function routeAliasList(id: string, aliases: readonly string[] = []): string[] {
  return [
    ...new Set(
      [id, ...catalogFixAliases(id), ...aliases].map((value) => value.trim()).filter(Boolean),
    ),
  ];
}

function routeFixAliasList(entry: CatalogFixInput): string[] {
  return [
    ...new Set(
      catalogFixAliasesForEntry(entry)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function tokenSpans(
  tokens: readonly string[],
  startIndex: number,
  endIndex: number,
  aliases: readonly string[],
): PathCTranscriptSpan[] {
  const offsets: number[] = [];
  let offset = 0;
  for (let i = startIndex; i < endIndex; i += 1) {
    offsets.push(offset);
    offset += tokens[i]!.length + 1;
  }
  const out: PathCTranscriptSpan[] = [];
  const seen = new Set<string>();
  for (let i = startIndex; i < endIndex; i += 1) {
    for (let length = 1; i + length <= endIndex; length += 1) {
      const phrase = tokens.slice(i, i + length).join(" ");
      const phraseKey = compactProcedureKey(phrase);
      if (!phraseKey) continue;
      if (!aliases.some((alias) => compactProcedureKey(alias) === phraseKey)) continue;
      const localStart = offsets[i - startIndex]!;
      const localEnd = localStart + phrase.length;
      const key = `${localStart}:${localEnd}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ start: localStart, end: localEnd, text: phrase });
    }
  }
  return out;
}

function routeFixMatchCandidates(
  phraseTokens: readonly string[],
  inputs: readonly CatalogFixInput[],
): PathCRouteFixMatchCandidate[] {
  const phrase = phraseTokens.join(" ");
  const phraseKey = normalizeFixKey(phrase);
  const ranked = rankFixCandidates(phrase, inputs, { includeDistanceTwo: true });
  const allowedIds =
    phraseTokens.length === 1
      ? null
      : new Set(
          inputs.flatMap((input) => {
            const entry = sanitizeCatalogFixEntries([input])[0];
            if (!entry) return [];
            return catalogFixAliasesForEntry(entry).some(
              (alias) =>
                alias.trim().split(/\s+/).length === phraseTokens.length &&
                normalizeFixKey(alias) === phraseKey,
            )
              ? [entry.id]
              : [];
          }),
        );
  return ranked
    .filter((candidate) => allowedIds === null || allowedIds.has(candidate.id))
    .slice(0, MAX_PATH_C_FIXES)
    .map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      score: candidate.score,
      method: candidate.method as CatalogFixMatchMethod,
      ...(candidate.distance !== undefined ? { distance: candidate.distance } : {}),
    }));
}

const ROUTE_EVIDENCE_CONTROL_WORDS = new Set([
  "direct",
  "then",
  "alt",
  "maintain",
  "cvia",
  "freq",
  "frequency",
  "sq",
  "squawk",
  "climb",
  "descend",
  "contact",
  "expect",
]);

function routeFixMatches(
  tokens: readonly string[],
  startIndex: number,
  endIndex: number,
  inputs: readonly CatalogFixInput[],
): PathCRouteFixMatch[] {
  const offsets: number[] = [];
  let offset = 0;
  for (let i = startIndex; i < endIndex; i += 1) {
    offsets.push(offset);
    offset += tokens[i]!.length + 1;
  }
  const out: PathCRouteFixMatch[] = [];
  for (let i = startIndex; i < endIndex; i += 1) {
    for (let length = 1; i + length <= endIndex && length <= 6; length += 1) {
      const phraseTokens = tokens.slice(i, i + length);
      if (phraseTokens.some((token) => isRouteEvidenceControlWord(token))) continue;
      const candidates = routeFixMatchCandidates(phraseTokens, inputs);
      if (candidates.length === 0) continue;
      const text = phraseTokens.join(" ");
      const start = offsets[i - startIndex]!;
      out.push({
        span: { start, end: start + text.length, text },
        candidates,
      });
    }
  }
  return out;
}

function isRouteEvidenceControlWord(token: string): boolean {
  return ROUTE_EVIDENCE_CONTROL_WORDS.has(token.toLowerCase());
}

function procedureRouteCandidate(
  procedure: CatalogProcedure,
  tokens: readonly string[],
  startIndex: number,
  endIndex: number,
): PathCProcedureCandidate {
  const aliases = catalogProcedureAliases(procedure);
  const transitions = (procedure.transitions ?? []).map(
    (transition: CatalogStarTransitionVocab) => ({
      id: transition.id.trim().toUpperCase(),
      aliases: routeAliasList(transition.id, transition.name ? [transition.name] : []),
      spans: tokenSpans(
        tokens,
        startIndex,
        endIndex,
        routeAliasList(transition.id, transition.name ? [transition.name] : []),
      ),
    }),
  );
  return {
    id: procedure.id,
    aliases,
    spans: tokenSpans(tokens, startIndex, endIndex, aliases),
    transitions,
  };
}

function routeWindowContext(
  normalized: string,
  catalog: readonly CatalogFixInput[],
  routeCandidates: readonly PathCRouteCandidateInput[],
  procedures: readonly CatalogProcedure[],
  airports: readonly CatalogAirport[],
): { routeWindow: PathCRouteWindow; startIndex: number; endIndex: number } | null {
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const clearanceStart = tokens.findIndex(
    (token, index) =>
      (token === "clr" || token === "clear" || token === "cleared") && tokens[index + 1] === "to",
  );
  if (clearanceStart < 0) return null;
  const viaIndex = tokens.findIndex(
    (token, index) => index > clearanceStart + 1 && token === "via",
  );
  if (viaIndex < 0) return null;
  const bounds = routeWindowBounds(tokens, viaIndex + 1);
  if (bounds === null) return null;
  const inputs = routeCandidates.length > 0 ? routeCandidates : catalog;
  const airportIds = new Set(airports.map((airport) => airport.icao));
  const routeInputs = sanitizeCatalogFixEntries(inputs, { excludeIds: airportIds });
  const fixMatches = routeFixMatches(tokens, bounds.startIndex, bounds.endIndex, routeInputs);
  const procedureRows = procedures
    .map((procedure) =>
      procedureRouteCandidate(procedure, tokens, bounds.startIndex, bounds.endIndex),
    )
    .filter((procedure) => procedure.spans.length > 0);
  if (fixMatches.length === 0 && procedureRows.length === 0) return null;
  return {
    startIndex: bounds.startIndex,
    endIndex: bounds.endIndex,
    routeWindow: {
      transcript: tokens.slice(bounds.startIndex, bounds.endIndex).join(" "),
      fixMatches,
      procedures: procedureRows,
    },
  };
}

function clearanceLimitCandidates(
  normalized: string,
  catalog: readonly CatalogFixInput[],
  routeCandidates: readonly PathCRouteCandidateInput[],
  airports: readonly CatalogAirport[],
): { limits: PathCRouteCandidate[]; airportMatches: CatalogAirport[] } {
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const clearanceStart = tokens.findIndex(
    (token, index) =>
      (token === "clr" || token === "clear" || token === "cleared") && tokens[index + 1] === "to",
  );
  if (clearanceStart < 0) return { limits: [], airportMatches: [] };
  const viaIndex = tokens.findIndex(
    (token, index) => index > clearanceStart + 1 && token === "via",
  );
  const limitEnd = viaIndex < 0 ? tokens.length : viaIndex;
  const spans = (aliases: readonly string[]) =>
    tokenSpans(tokens, clearanceStart + 2, limitEnd, aliases);
  const inputs = [...routeCandidates, ...catalog];
  const limits: PathCRouteCandidate[] = [];
  const airportIds = new Set(airports.map((airport) => airport.icao));
  const seen = new Set<string>();
  for (const input of inputs) {
    const entry = sanitizeCatalogFixEntries([input])[0];
    if (!entry || airportIds.has(entry.id) || seen.has(entry.id)) continue;
    const aliases = routeFixAliasList(entry);
    const evidence = spans(aliases);
    if (evidence.length > 0) {
      seen.add(entry.id);
      limits.push({ id: entry.id, kind: entry.kind, aliases, spans: evidence });
    }
  }
  const airportMatches = airports.filter(
    (airport) => spans([airport.icao, airport.name, ...(airport.aliases ?? [])]).length > 0,
  );
  return { limits, airportMatches };
}

function pathCContext(
  roster: readonly string[],
  selected: string | null,
  catalog: readonly CatalogFixInput[],
  procedures: readonly CatalogProcedure[],
  approaches: readonly CatalogApproach[],
  airports: readonly CatalogAirport[],
  queryTokens: readonly string[],
  route: PathCRouteWindow | undefined = undefined,
  limits: readonly PathCRouteCandidate[] = [],
  clearanceAirports: readonly CatalogAirport[] = [],
): PathCContext | undefined {
  const retrieved = mergeRetrievedFixes(queryTokens, catalog);
  const fixes = pathCFixIds(catalog, queryTokens, retrieved);
  const pathProcedures = pathCProcedureList(procedures, queryTokens);
  const pathApproaches = pathCApproachList(approaches, queryTokens);
  const pathAirports = (route ? clearanceAirports : airports)
    .filter(
      (airport) =>
        route !== undefined ||
        queryTokens.some((token) => groundAirportToCatalog(token, [airport]) !== null),
    )
    .slice(0, MAX_PATH_C_FIXES)
    .map((item) => ({ ...item }));
  if (
    roster.length === 0 &&
    !selected &&
    fixes.length === 0 &&
    pathProcedures.length === 0 &&
    pathApproaches.length === 0 &&
    pathAirports.length === 0 &&
    route === undefined &&
    limits.length === 0
  ) {
    return undefined;
  }
  if (route !== undefined) {
    return {
      callsigns: [...roster],
      selectedCallsign: selected,
      routeWindow: route,
      ...(limits.length > 0 ? { clearanceLimits: [...limits] } : {}),
      ...(pathAirports.length > 0 ? { airports: pathAirports } : {}),
    };
  }
  return {
    callsigns: [...roster],
    selectedCallsign: selected,
    ...(fixes.length > 0 ? { fixes } : {}),
    ...(pathProcedures.length > 0 ? { procedures: pathProcedures } : {}),
    ...(pathApproaches.length > 0 ? { approaches: pathApproaches } : {}),
    ...(pathAirports.length > 0 ? { airports: pathAirports } : {}),
  };
}

function groundLocalCallsign(
  parsed: ParseResult,
  normalized: string,
  roster: readonly string[],
  selected: string | null,
): ParseResult {
  if (!parsed.ok || !parsed.callsignToken) {
    return parsed.ok ? { ...parsed, callsignToken: selected } : parsed;
  }
  if (roster.length === 0) {
    return parsed;
  }
  const grounded = groundCallsignToRoster(parsed.callsignToken, normalized, roster);
  if (grounded === null) {
    return {
      ok: false,
      error: formatParseError(PARSE_ERROR.PARSE_MISS),
      sourceText: parsed.sourceText,
    };
  }
  return { ...parsed, callsignToken: grounded };
}

function airportFixSlotTokens(
  instructions: readonly Instruction[],
  airports: readonly CatalogAirport[],
): string[] {
  const ids = new Set(airports.map((airport) => airport.icao));
  const tokens: string[] = [];
  for (const instruction of instructions) {
    if (
      (instruction.type === "DIRECT" || instruction.type === "CROSS") &&
      ids.has(instruction.fixId)
    ) {
      tokens.push(instruction.fixId);
    }
    if (instruction.type === "IFR_CLEARANCE") {
      if (instruction.access.type === "FIX_THEN_DIRECT" && ids.has(instruction.access.fixId)) {
        tokens.push(instruction.access.fixId);
      }
      if (instruction.access.type === "EXPLICIT_ROUTE") {
        for (const segment of instruction.access.segments) {
          if (segment.type === "DIRECT" && ids.has(segment.fixId)) {
            tokens.push(segment.fixId);
          }
        }
      }
    }
  }
  return tokens;
}

function ungroundedIdentifierTokens(
  instructions: readonly Instruction[],
  catalog: readonly CatalogFixInput[],
  procedures: readonly CatalogProcedure[],
  approaches: readonly CatalogApproach[],
  airports: readonly CatalogAirport[],
): string[] {
  const groundedFixes = groundInstructionFixes(instructions, catalog, {
    rankedFor: (token) => retrieveFix(token, catalog),
    clearanceLimitIds: new Set(airports.map((airport) => airport.icao)),
  });
  const ungrounded = [
    ...new Set([...groundedFixes.ungroundedFixes, ...airportFixSlotTokens(instructions, airports)]),
  ];
  const next = groundInstructionApproaches(
    groundInstructionProcedures(groundedFixes.instructions, procedures),
    approaches,
  );
  for (const inst of next) {
    if (inst.type === "IFR_CLEARANCE" && inst.access.type === "SID") {
      if (
        procedures.length > 0 &&
        groundProcedureToCatalog(inst.access.procedureId, procedures) === null
      ) {
        ungrounded.push(inst.access.procedureId);
      }
    }
    if (inst.type === "IFR_CLEARANCE" && inst.access.type === "EXPLICIT_ROUTE") {
      for (const segment of inst.access.segments) {
        if (
          segment.type === "PROCEDURE" &&
          procedures.length > 0 &&
          groundProcedureToCatalog(segment.procedureId, procedures) === null
        ) {
          ungrounded.push(segment.procedureId);
        }
      }
    }
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
  catalog: readonly CatalogFixInput[],
  procedures: readonly CatalogProcedure[],
  approaches: readonly CatalogApproach[],
  airports: readonly CatalogAirport[],
): Extract<ParseResult, { ok: true }> {
  const groundedFixes = groundInstructionFixes(parsed.instructions, catalog, {
    rankedFor: (token) => retrieveFix(token, catalog),
    clearanceLimitIds: new Set(airports.map((airport) => airport.icao)),
  });
  const ungroundedFixes = [
    ...new Set([
      ...groundedFixes.ungroundedFixes,
      ...airportFixSlotTokens(parsed.instructions, airports),
    ]),
  ];
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
    ...(ungroundedFixes.length > 0 ? { ungroundedFixes } : {}),
  };
}

function tryGroundedLocal(
  parsed: ParseResult,
  sourceText: string,
  parseStage: ParseStage,
  source: "text" | "voice",
  selected: string | null,
  catalog: readonly CatalogFixInput[],
  procedures: readonly CatalogProcedure[],
  approaches: readonly CatalogApproach[],
  airports: readonly CatalogAirport[],
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
    airports,
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
    airports,
  );
  if (ungrounded.length === 0) {
    return { kind: "hit", result };
  }
  const unknownAirportLikeLimit =
    airports.length > 0 &&
    parsed.instructions.some((instruction) => instruction.type === "IFR_CLEARANCE") &&
    ungrounded.some((token) => /^[A-Z]{4}$/.test(token));
  const airportUsedOutsideLimit =
    airports.length > 0 &&
    parsed.instructions.some(
      (instruction) =>
        (instruction.type === "DIRECT" || instruction.type === "CROSS") &&
        airports.some((airport) => airport.icao === instruction.fixId),
    );
  if (parseStage === "typed" && !unknownAirportLikeLimit && !airportUsedOutsideLimit) {
    return { kind: "hit", result };
  }
  return { kind: "ungrounded", tokens: ungrounded };
}

function pathCIdentifierListed(
  instructions: readonly Instruction[],
  context: PathCContext | undefined,
): boolean {
  if (context?.routeWindow !== undefined) {
    const route = context.routeWindow;
    const airports = new Set((context.airports ?? []).map((airport) => airport.icao));
    const limits = new Set([
      ...airports,
      ...(context.clearanceLimits ?? []).map((candidate) => candidate.id),
    ]);
    const fixes = new Set(
      route.fixMatches.flatMap((match) => match.candidates.map((candidate) => candidate.id)),
    );
    const procedures = new Map(route.procedures.map((procedure) => [procedure.id, procedure]));
    for (const inst of instructions) {
      if (inst.type !== "IFR_CLEARANCE") return false;
      if (!limits.has(inst.limitId)) return false;
      if (inst.access.type !== "EXPLICIT_ROUTE" || inst.access.segments.length === 0) return false;
      for (const segment of inst.access.segments) {
        if (segment.type === "DIRECT") {
          if (!fixes.has(segment.fixId) || airports.has(segment.fixId)) return false;
        } else {
          const procedure = procedures.get(segment.procedureId);
          if (procedure === undefined) return false;
          if (
            segment.transitionId !== undefined &&
            !procedure.transitions.some((transition) => transition.id === segment.transitionId)
          ) {
            return false;
          }
        }
      }
    }
    return true;
  }
  const fixes = new Set(context?.fixes ?? []);
  const procedures = new Set((context?.procedures ?? []).map((item) => item.id));
  const approaches = new Set((context?.approaches ?? []).map((item) => item.id));
  const airports = new Set((context?.airports ?? []).map((item) => item.icao));
  for (const inst of instructions) {
    if (inst.type === "IFR_CLEARANCE") {
      if (!fixes.has(inst.limitId) && !airports.has(inst.limitId)) return false;
      if (
        inst.access.type === "FIX_THEN_DIRECT" &&
        (airports.has(inst.access.fixId) || !fixes.has(inst.access.fixId))
      )
        return false;
      if (inst.access.type === "SID" && !procedures.has(inst.access.procedureId)) return false;
    }
    if (inst.type === "DIRECT" || inst.type === "CROSS") {
      if (airports.has(inst.fixId) || !fixes.has(inst.fixId)) {
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
  const procedures = sanitizeCatalogProcedures(opts.procedures);
  const approaches = sanitizeCatalogApproaches(opts.approaches);
  const airports = sanitizeCatalogAirports(opts.airports);
  const clearanceLimitIds = new Set(airports.map((airport) => airport.icao));
  const catalog = sanitizeCatalogFixEntries(opts.fixes, {
    excludeIds: new Set(airports.map((airport) => airport.icao)),
  });
  const normalized = rewriteIfrAirportLimit(
    repairSpokenLexemes(normalizeSpoken(sourceText)),
    airports,
  );
  const ifrCandidate = isIfrClearanceCandidate(normalized);
  const routeInfo = ifrCandidate
    ? routeWindowContext(normalized, catalog, opts.routeCandidates ?? [], procedures, airports)
    : null;
  const limitInfo = ifrCandidate
    ? clearanceLimitCandidates(normalized, catalog, opts.routeCandidates ?? [], airports)
    : { limits: [], airportMatches: [] };
  const extraTokens: string[] = [];
  const acceptLocalStage = (stage: ReturnType<typeof tryGroundedLocal>): ParseResult | null => {
    if (stage?.kind === "hit") {
      if (ifrCandidate && !isSoleIfrClearance(stage.result)) {
        return { ok: false, error: formatParseError(PARSE_ERROR.BAD_CLEARANCE), sourceText };
      }
      return stage.result;
    }
    if (stage?.kind === "ungrounded") {
      extraTokens.push(...stage.tokens);
    }
    return null;
  };

  const typed = tryGroundedLocal(
    groundLocalCallsign(
      parseRadioText(normalized, { fixes: catalog, procedures, airports }),
      normalized,
      roster,
      selected,
    ),
    sourceText,
    "typed",
    opts.source,
    selected,
    catalog,
    procedures,
    approaches,
    airports,
  );
  const typedResult = acceptLocalStage(typed);
  if (typedResult !== null) return typedResult;

  const spoken = parseSpokenGrammar(
    normalized,
    selected,
    sourceText,
    catalog,
    procedures,
    clearanceLimitIds,
    airports,
  );
  const pathA = tryGroundedLocal(
    groundLocalCallsign(spoken, normalized, roster, selected),
    sourceText,
    "spoken_a",
    opts.source,
    selected,
    catalog,
    procedures,
    approaches,
    airports,
  );
  const pathAResult = acceptLocalStage(pathA);
  if (pathAResult !== null) return pathAResult;

  const rewritten = rewriteSpokenToTyped(normalized);
  if (rewritten !== null) {
    const pathB = tryGroundedLocal(
      groundLocalCallsign(
        parseRadioText(rewritten, { fixes: catalog, procedures, airports }),
        normalized,
        roster,
        selected,
      ),
      sourceText,
      "spoken_b",
      opts.source,
      selected,
      catalog,
      procedures,
      approaches,
      airports,
    );
    const pathBResult = acceptLocalStage(pathB);
    if (pathBResult !== null) return pathBResult;
  }

  const islandParsed = matchSpokenPatterns(
    normalized,
    selected,
    sourceText,
    catalog,
    procedures,
    approaches,
    clearanceLimitIds,
    airports,
  );
  const island = tryGroundedLocal(
    groundLocalCallsign(islandParsed, normalized, roster, selected),
    sourceText,
    "spoken_b",
    opts.source,
    selected,
    catalog,
    procedures,
    approaches,
    airports,
  );
  const islandResult = acceptLocalStage(island);
  if (islandResult !== null) return islandResult;

  const queryTokens = [...identifierSlotTokens(normalized), ...extraTokens];
  const retrievedFixes = mergeRetrievedFixes(queryTokens, catalog);
  const matchedProcedures = matchProceduresForTokens(queryTokens, procedures);
  const matchedApproaches = matchApproachesForTokens(queryTokens, approaches);
  const matchedAirports = airports.filter((airport) =>
    queryTokens.some((token) => groundAirportToCatalog(token, [airport]) !== null),
  );
  const identifierQuery = queryTokens.length > 0;
  const emptyIdentifierRetrieve =
    identifierQuery &&
    retrievedFixes.length === 0 &&
    matchedProcedures.length === 0 &&
    matchedApproaches.length === 0 &&
    matchedAirports.length === 0;
  const routeEvidence = routeInfo?.routeWindow;
  const routeFallbackHasEvidence =
    routeEvidence !== undefined &&
    (routeEvidence.fixMatches.length > 0 || routeEvidence.procedures.length > 0) &&
    (limitInfo.limits.length > 0 || limitInfo.airportMatches.length > 0);

  if (
    opts.pathC &&
    (routeFallbackHasEvidence || !emptyIdentifierRetrieve) &&
    (!ifrCandidate ||
      routeFallbackHasEvidence ||
      localIfrClearanceSyntaxIsValid(normalized, selected, catalog, procedures, clearanceLimitIds))
  ) {
    const run = opts.parsePathC ?? fetchParsePathC;
    const context = pathCContext(
      roster,
      selected,
      catalog,
      procedures,
      approaches,
      airports,
      queryTokens,
      routeEvidence,
      limitInfo.limits,
      limitInfo.airportMatches,
    );
    try {
      const hit = await run({
        text: sourceText,
        source: opts.source,
        schemaVersion: PATH_C_SCHEMA_VERSION,
        context,
      });
      const checkedHit =
        hit === null
          ? null
          : schemaCheckPathC({
              ok: true,
              callsignToken: hit.callsignToken,
              instructions: hit.instructions,
            });
      if (
        checkedHit !== null &&
        checkedHit.instructions.length > 0 &&
        pathCResultIsComplete(sourceText, checkedHit.instructions)
      ) {
        const rawCallsign = checkedHit.callsignToken ?? spokenCallsignToken(normalized) ?? selected;
        const grounded = groundCallsignToRoster(rawCallsign, normalized, roster);
        const callsignSafe =
          roster.length === 0 ||
          (grounded !== null && roster.includes(grounded)) ||
          (rawCallsign === null && selected === null);
        const pathFixes = [
          ...(context?.fixes ?? []),
          ...(context?.routeWindow?.fixMatches.flatMap((match) =>
            match.candidates.map((candidate) => candidate.id),
          ) ?? []),
          ...(context?.clearanceLimits?.map((candidate) => candidate.id) ?? []),
        ];
        const pathProcedures = context?.routeWindow?.procedures ?? context?.procedures ?? [];
        const pathApproaches = context?.approaches ?? [];
        const pathAirports = context?.airports ?? [];
        const salvaged = okStage(
          {
            ok: true,
            callsignToken: grounded,
            instructions: repairHeadingVsTurnDegrees(normalized, checkedHit.instructions),
            sourceText,
          },
          sourceText,
          "llm_c",
          opts.source,
          selected,
          pathFixes,
          pathProcedures,
          pathApproaches,
          pathAirports,
        );
        const ungrounded = salvaged.ungroundedFixes ?? [];
        if (
          callsignSafe &&
          ungrounded.length === 0 &&
          (!ifrCandidate || isSoleIfrClearance(salvaged)) &&
          pathCIdentifierListed(salvaged.instructions, context) &&
          routePathCOutputIsGrounded(salvaged.instructions, context)
        ) {
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
