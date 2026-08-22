/**
 * Analog: vice ATC instruction keyboard tokens (R08, pharr.org/vice).
 * Trainer delta: SH/SA are phase-1 tokens; `DCT <FIX>` is T04-03 (D stays
 * descend); `VIA` / `CVIA` / `X` are T04-04. `EXP ILS27` is EXPECT_APPROACH
 * (T04-05). `GA` is GO_AROUND (T04-07). Not vice-compatible.
 * Tokens only — no spoken English (Path A is phase 3).
 */

export const PARSE_ERROR = {
  EMPTY: "EMPTY",
  UNKNOWN_TOKEN: "UNKNOWN_TOKEN",
  BAD_HEADING: "BAD_HEADING",
  MISSING_NUMBER: "MISSING_NUMBER",
  MISSING_APPROACH_ID: "MISSING_APPROACH_ID",
  MISSING_FIX_ID: "MISSING_FIX_ID",
  MISSING_PROCEDURE_ID: "MISSING_PROCEDURE_ID",
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
/** Typed DCT fix: 2–5 letters after uppercase (`NEMAX`, `DEM`). */
const FIX_ID_TOKEN = /^[A-Z]{2,5}$/;
/** STAR / SID id: letters plus optional digits (`DEM1`). `D` stays descend. */
const PROCEDURE_ID_TOKEN = /^[A-Z]{2,8}[0-9]{0,2}$/;
/** CROSS altitude hundreds with optional A/B suffix (`40`, `40A`, `40B`). */
const CROSS_ALT_TOKEN = /^(\d+)([AB])?$/;

export function isCallsignToken(token: string): boolean {
  return FULL_CALLSIGN.test(token) || SUFFIX_CALLSIGN.test(token);
}

export function isTurnDirLetter(token: string): token is "L" | "R" {
  return TURN_DIR_LETTER.test(token);
}

export function isFixIdToken(token: string): boolean {
  return FIX_ID_TOKEN.test(token);
}

export function isProcedureIdToken(token: string): boolean {
  return PROCEDURE_ID_TOKEN.test(token);
}

export type CrossRestriction = "AT" | "AT_OR_ABOVE" | "AT_OR_BELOW";

/** Hundreds of feet, same as `C30`. `40A` / `40B` are AOA / AOB. */
export function parseCrossAltitudeToken(
  raw: string,
): { altitudeFt: number; restriction: CrossRestriction } | null {
  const match = CROSS_ALT_TOKEN.exec(raw);
  if (!match) {
    return null;
  }
  const hundreds = parseUnsignedInt(match[1]!);
  if (hundreds === null) {
    return null;
  }
  const suffix = match[2];
  const restriction: CrossRestriction =
    suffix === "A" ? "AT_OR_ABOVE" : suffix === "B" ? "AT_OR_BELOW" : "AT";
  return { altitudeFt: hundreds * 100, restriction };
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
