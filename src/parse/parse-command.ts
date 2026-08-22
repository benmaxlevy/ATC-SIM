/**
 * Ordered parse stages for text and voice (`phases/_shared/parse-pipeline.md`):
 * normalize → typed tokenizer → Path A → Path B → optional Path C (`llm_c`).
 *
 * `source` is the channel. `parseStage` is which compiler won.
 * Speech must not construct Instruction objects — only this module + Path A/B
 * and the Path C schema check do.
 */

import type { ParseStage } from "@core";
import { parseRadioText, type ParseResult } from "./parseRadioText";
import { formatParseError, PARSE_ERROR } from "./tokens";
import { parseSpokenGrammar, repairHeadingVsTurnDegrees } from "./spoken/grammar";
import { normalizeSpoken } from "./spoken/normalizer";
import { groundCallsignToRoster, spokenCallsignToken } from "./spoken/telephony";
import { rewriteSpokenToTyped } from "./spoken/typed-fuzzy";
import {
  groundInstructionFixes,
  sanitizeFixIds,
} from "./spoken/fix-ground";
import {
  groundInstructionProcedures,
  sanitizeCatalogProcedures,
  type CatalogProcedure,
} from "./spoken/procedure-ground";
import {
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
   * STAR/SID catalog for DESCEND_VIA / CLIMB_VIA snap (`demo 1` → `DEM1`)
   * and Path C `procedures=` grounding.
   */
  procedures?: readonly CatalogProcedure[];
  /** Default false. When true, stage 4 may fetch after a local miss. */
  pathC?: boolean;
  /** Injected fetch. Default POSTs to our speech-api `/parse`. */
  parsePathC?: ParsePathCFn;
}

const MAX_ROSTER = 64;

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

function pathCContext(
  roster: readonly string[],
  selected: string | null,
  fixes: readonly string[],
  procedures: readonly CatalogProcedure[],
): PathCContext | undefined {
  if (roster.length === 0 && !selected && fixes.length === 0 && procedures.length === 0) {
    return undefined;
  }
  return {
    callsigns: [...roster],
    selectedCallsign: selected,
    ...(fixes.length > 0 ? { fixes: [...fixes] } : {}),
    ...(procedures.length > 0 ? { procedures: procedures.map((item) => ({ ...item })) } : {}),
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

function okStage(
  parsed: Extract<ParseResult, { ok: true }>,
  sourceText: string,
  parseStage: ParseStage,
  source: "text" | "voice",
  selected: string | null,
  catalog: readonly string[],
  procedures: readonly CatalogProcedure[],
): ParseResult {
  return {
    ok: true,
    callsignToken: parsed.callsignToken ?? selected,
    instructions: groundInstructionProcedures(
      groundInstructionFixes(parsed.instructions, catalog),
      procedures,
    ),
    sourceText,
    parseStage,
    source,
  };
}

/**
 * First complete stage wins. `sourceText` on the result is the pre-normalize original.
 * Path C runs only after typed/A/B miss. A local hit is never overridden.
 */
export async function parseCommand(
  sourceText: string,
  opts: ParseCommandOpts,
): Promise<ParseResult> {
  const selected = opts.selectedCallsign ?? null;
  const roster = rosterFromOpts(opts);
  const catalog = sanitizeFixIds(opts.fixes);
  const procedures = sanitizeCatalogProcedures(opts.procedures);
  const normalized = normalizeSpoken(sourceText);

  const typed = attachCallsign(parseRadioText(normalized), selected);
  if (typed.ok && typed.instructions.length > 0) {
    return okStage(typed, sourceText, "typed", opts.source, selected, catalog, procedures);
  }

  const spoken = parseSpokenGrammar(normalized, selected, sourceText, catalog, procedures);
  if (spoken.ok) {
    return okStage(spoken, sourceText, "spoken_a", opts.source, selected, catalog, procedures);
  }

  const rewritten = rewriteSpokenToTyped(normalized);
  if (rewritten !== null) {
    const pathB = attachCallsign(parseRadioText(rewritten), selected);
    if (pathB.ok && pathB.instructions.length > 0) {
      return okStage(pathB, sourceText, "spoken_b", opts.source, selected, catalog, procedures);
    }
  }

  if (opts.pathC) {
    const run = opts.parsePathC ?? fetchParsePathC;
    try {
      const hit = await run({
        text: sourceText,
        source: opts.source,
        schemaVersion: PATH_C_SCHEMA_VERSION,
        context: pathCContext(roster, selected, catalog, procedures),
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
        return okStage(
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
          catalog,
          procedures,
        );
      }
    } catch {
      // Timeout / network / injected throw → miss. Never through the tick.
    }
  }

  const error =
    !spoken.ok && spoken.error.startsWith(PARSE_ERROR.UNKNOWN_TELEPHONY)
      ? spoken.error
      : formatParseError(PARSE_ERROR.PARSE_MISS);
  return { ok: false, error, sourceText };
}
