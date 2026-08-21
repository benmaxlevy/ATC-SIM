/**
 * Ordered parse stages for text and voice (`phases/_shared/parse-pipeline.md`):
 * normalize → typed tokenizer → Path A → Path B. Path C is T03-14 (off here).
 *
 * `source` is the channel. `parseStage` is which compiler won.
 * Speech must not construct Instruction objects — only this module + Path A/B do.
 */

import type { ParseStage } from "@core";
import { parseRadioText, type ParseResult } from "./parseRadioText";
import { formatParseError, PARSE_ERROR } from "./tokens";
import { parseSpokenGrammar } from "./spoken/grammar";
import { normalizeSpoken } from "./spoken/normalizer";
import { rewriteSpokenToTyped } from "./spoken/typed-fuzzy";

export interface ParseCommandOpts {
  source: "text" | "voice";
  selectedCallsign?: string | null;
  /** Default false. T03-14 may fetch when true; this ticket never calls fetch. */
  pathC?: boolean;
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
): ParseResult {
  return {
    ok: true,
    callsignToken: parsed.callsignToken ?? selected,
    instructions: parsed.instructions,
    sourceText,
    parseStage,
    source,
  };
}

/**
 * First complete stage wins. `sourceText` on the result is the pre-normalize original.
 */
export async function parseCommand(
  sourceText: string,
  opts: ParseCommandOpts,
): Promise<ParseResult> {
  const selected = opts.selectedCallsign ?? null;
  const normalized = normalizeSpoken(sourceText);

  const typed = attachCallsign(parseRadioText(normalized), selected);
  if (typed.ok && typed.instructions.length > 0) {
    return okStage(typed, sourceText, "typed", opts.source, selected);
  }

  const spoken = parseSpokenGrammar(normalized, selected, sourceText);
  if (spoken.ok) {
    return okStage(spoken, sourceText, "spoken_a", opts.source, selected);
  }

  const rewritten = rewriteSpokenToTyped(normalized);
  if (rewritten !== null) {
    const pathB = attachCallsign(parseRadioText(rewritten), selected);
    if (pathB.ok && pathB.instructions.length > 0) {
      return okStage(pathB, sourceText, "spoken_b", opts.source, selected);
    }
  }

  // Path C stays off. Do not fetch even when pathC is true (T03-14).
  void opts.pathC;

  const error =
    !spoken.ok && spoken.error.startsWith(PARSE_ERROR.UNKNOWN_TELEPHONY)
      ? spoken.error
      : formatParseError(PARSE_ERROR.PARSE_MISS);
  return { ok: false, error, sourceText };
}
