/**
 * Conservative repairs for recurring ASR words. These are phrase repairs,
 * not a second parser: they only fire in recognizable command/callsign slots.
 * Numeric tokens and catalog identifiers are never rewritten here.
 */

const NUMBER_WORDS = new Set([
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
]);

function looksLikeFlightNumber(tokens: readonly string[], start: number): boolean {
  return NUMBER_WORDS.has(tokens[start] ?? "") || /^\d{1,4}$/.test(tokens[start] ?? "");
}

/** Apply only high-confidence lexical repairs to a normalized transcript. */
export function repairSpokenLexemes(normalized: string): string {
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;

    // HAR: "climber maintain ...". Keep CLIMBER untouched in an identifier slot.
    if (
      token === "climber" &&
      !["direct", "proceed", "cross"].includes(out.at(-1) ?? "") &&
      (tokens[i + 1] === "maintain" || tokens[i + 1] === "and" || tokens[i + 1] === "to")
    ) {
      out.push("climb");
      continue;
    }

    // HAR: "interceptor ... localizer".
    if (token === "interceptor" && tokens.slice(i + 1, i + 10).includes("localizer")) {
      out.push("intercept");
      continue;
    }

    // FAA phraseology is DESCEND/CLIMB VIA; ASR sometimes says BY.
    if (token === "by" && (out.at(-1) === "descend" || out.at(-1) === "climb")) {
      out.push("via");
      continue;
    }

    // HAR carrier corruption: "chine/try 27..." means the existing GIANT
    // telephony entry. Require a number immediately after it; never rewrite
    // ordinary verbs in other positions.
    if (i === 0 && (token === "chine" || token === "try") && looksLikeFlightNumber(tokens, i + 1)) {
      out.push("giant");
      continue;
    }

    // HAR shorthand in position reports; this is not applied near numbers or
    // identifier slots, so it cannot alter altitude, heading, or speed.
    if (token === "u" && tokens[i + 1] === "r" && tokens[i + 2] === "one") {
      out.push("you", "are");
      i += 1;
      continue;
    }

    out.push(token);
  }
  return out.join(" ");
}
