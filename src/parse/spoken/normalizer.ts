/**
 * Light spoken normalizer (phase 3 README §3.3). Deterministic, no ML.
 * Order is frozen for tests: lowercase → punctuation → fillers → ICAO aliases
 * → number-slot homophones. Does not emit Command IR.
 *
 * Number-slot `to` after `heading` is ASR noise (`heading to two seven zero` →
 * 270), not ICAO Doc 4444 “climb to” (R10). Climb/descend `to` stays a preposition.
 */

import { countNumberWordsFrom, isNumberish } from "./numbers";

const FILLERS = new Set(["uh", "um", "er", "ah", "please", "now"]);

const ICAO_ALWAYS: Readonly<Record<string, string>> = {
  niner: "nine",
  tree: "three",
  fife: "five",
  till: "until",
};

const NUMBER_SLOT_TRIGGERS = new Set([
  "heading",
  "speed",
  "knots",
  "degrees",
  "fly",
  "slow",
  "increase",
  "reduce",
]);

const ALTITUDE_PREP_PREV = new Set(["descend", "climb"]);

function tokenize(raw: string): string[] {
  const lower = raw.toLowerCase().trim();
  const stripped = lower.replace(/-/g, " ").replace(/[^a-z0-9\s]/g, " ");
  return stripped.split(/\s+/).filter((tok) => tok.length > 0);
}

function dropFillers(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i]!;
    if (tok === "for" && tokens[i + 1] === "me") {
      i += 1;
      continue;
    }
    if (FILLERS.has(tok)) {
      continue;
    }
    out.push(tok);
  }
  return out;
}

function inDigitContext(tokens: readonly string[], i: number): boolean {
  return (
    isNumberish(tokens[i - 1]) ||
    isNumberish(tokens[i + 1]) ||
    NUMBER_SLOT_TRIGGERS.has(tokens[i - 1] ?? "")
  );
}

function applyIcaoAliases(tokens: string[]): string[] {
  return tokens.map((tok, i) => {
    if (tok in ICAO_ALWAYS) {
      return ICAO_ALWAYS[tok]!;
    }
    if ((tok === "oh" || tok === "owe") && inDigitContext(tokens, i)) {
      return "zero";
    }
    return tok;
  });
}

function inNumberSlot(tokens: readonly string[], i: number): boolean {
  const prev = tokens[i - 1];
  if (prev !== undefined && ALTITUDE_PREP_PREV.has(prev)) {
    return false;
  }
  if (prev !== undefined && NUMBER_SLOT_TRIGGERS.has(prev)) {
    return true;
  }
  return isNumberish(prev) || isNumberish(tokens[i + 1]);
}

function applyHomophones(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i]!;
    if ((tok === "to" || tok === "too") && inNumberSlot(tokens, i)) {
      if (countNumberWordsFrom(tokens, i + 1) >= 3) {
        continue;
      }
      out.push("two");
      continue;
    }
    if (tok === "for" && inNumberSlot(tokens, i)) {
      if (countNumberWordsFrom(tokens, i + 1) >= 3) {
        continue;
      }
      out.push("four");
      continue;
    }
    if (tok === "ate" && inNumberSlot(tokens, i)) {
      out.push("eight");
      continue;
    }
    out.push(tok);
  }
  return out;
}

/** Canonical spoken string for Path A / B. Typed tokens like `H270` survive lowercased. */
export function normalizeSpoken(text: string): string {
  const tokens = applyHomophones(applyIcaoAliases(dropFillers(tokenize(text))));
  return tokens.join(" ");
}
