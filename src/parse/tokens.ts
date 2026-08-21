/**
 * Analog: vice ATC instruction keyboard tokens (R08, pharr.org/vice).
 * Trainer delta: SH/SA are phase-1 tokens; DIRECT and EXPECT_APPROACH are not.
 * Not vice-compatible. Tokens only — no spoken English (Path A is phase 3).
 */

export const PARSE_ERROR = {
  EMPTY: "EMPTY",
  UNKNOWN_TOKEN: "UNKNOWN_TOKEN",
  BAD_HEADING: "BAD_HEADING",
  MISSING_NUMBER: "MISSING_NUMBER",
  MISSING_APPROACH_ID: "MISSING_APPROACH_ID",
  BAD_TURN_DEGREES: "BAD_TURN_DEGREES",
  UNKNOWN_TELEPHONY: "unknown_telephony",
  PARSE_MISS: "PARSE_MISS",
} as const;

export type ParseErrorCode = (typeof PARSE_ERROR)[keyof typeof PARSE_ERROR];

/** Full callsign: three-letter ICAO prefix + 1–4 digits + optional letter. */
export const FULL_CALLSIGN = /^[A-Z]{3}[0-9]{1,4}[A-Z]?$/;

/** Numeric suffix used when a track is later resolved (T01-06). */
export const SUFFIX_CALLSIGN = /^[0-9]{1,4}[A-Z]?$/;

const UNSIGNED_INT = /^\d+$/;
const TURN_DIR_LETTER = /^[LR]$/;

export function isCallsignToken(token: string): boolean {
  return FULL_CALLSIGN.test(token) || SUFFIX_CALLSIGN.test(token);
}

export function isTurnDirLetter(token: string): token is "L" | "R" {
  return TURN_DIR_LETTER.test(token);
}

/** Parser requires an integer token; rejects decimals and non-finite values. */
export function parseUnsignedInt(raw: string): number | null {
  if (!UNSIGNED_INT.test(raw)) {
    return null;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    return null;
  }
  return n;
}

export function formatParseError(code: ParseErrorCode, detail?: string): string {
  return detail ? `${code}: ${detail}` : code;
}
