import { expect, test } from "vitest";
import type { Instruction } from "@core";
import { PARSE_ERROR, parseRadioText } from "@parse";

test("AC1 — DAL123 H270 is callsign plus shortest heading 270", () => {
  const result = parseRadioText("DAL123 H270");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("DAL123");
  expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }]);
  expect(result.sourceText).toBe("DAL123 H270");
});

test("AC2 — H 270 has no callsign and the same heading instruction", () => {
  const result = parseRadioText("H 270");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBeNull();
  expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }]);
});

const tokenTable: [string, Instruction][] = [
  ["L090", { type: "FLY_HEADING", headingDeg: 90, turn: "LEFT" }],
  ["R180", { type: "FLY_HEADING", headingDeg: 180, turn: "RIGHT" }],
  ["T20L", { type: "TURN_DEGREES", direction: "LEFT", degrees: 20 }],
  ["C30", { type: "ALTITUDE", altitudeFt: 3000, verb: "CLIMB" }],
  ["D30", { type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }],
  ["A30", { type: "ALTITUDE", altitudeFt: 3000, verb: "MAINTAIN" }],
  ["S210", { type: "SPEED", speedKt: 210, verb: "MAINTAIN" }],
  ["PH", { type: "PRESENT_HEADING" }],
  ["I", { type: "IDENT" }],
  ["SH", { type: "SAY_HEADING" }],
  ["SA", { type: "SAY_ALTITUDE" }],
  ["APP ILS27", { type: "CLEARED_APPROACH", approachId: "ILS27" }],
  ["IL ILS27", { type: "INTERCEPT_LOCALIZER", approachId: "ILS27" }],
  ["GA", { type: "GO_AROUND" }],
  ["CAPP", { type: "CANCEL_APPROACH" }],
];

test.each(tokenTable)("AC3 — %s produces the phase-1 IR", (source, instruction) => {
  const result = parseRadioText(source);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBeNull();
  expect(result.instructions).toEqual([instruction]);
});

test("AC4 — mixed case combines callsign and three instructions in order", () => {
  const result = parseRadioText("dal123 h270 d30 s210");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("DAL123");
  expect(result.instructions).toEqual([
    { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
    { type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" },
    { type: "SPEED", speedKt: 210, verb: "MAINTAIN" },
  ]);
  expect(result.sourceText).toBe("dal123 h270 d30 s210");
});

test("AC5 — H360 stores heading 0; H361 is a parse error", () => {
  const wrap = parseRadioText("H360");
  expect(wrap.ok).toBe(true);
  if (wrap.ok) {
    expect(wrap.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 0, turn: "SHORTEST" }]);
  }
  const bad = parseRadioText("H361");
  expect(bad.ok).toBe(false);
  if (!bad.ok) {
    expect(bad.error).toContain(PARSE_ERROR.BAD_HEADING);
    expect(bad.sourceText).toBe("H361");
  }
});

test.each(["", "   ", "H", "XYZ", "APP"])("AC6 — %j is a parse error without World", (source) => {
  const result = parseRadioText(source);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.sourceText).toBe(source);
  }
});

test("AC6 — empty, missing number, unknown, and missing approach id use stable codes", () => {
  expect(errorCode("")).toBe(PARSE_ERROR.EMPTY);
  expect(errorCode("   ")).toBe(PARSE_ERROR.EMPTY);
  expect(errorCode("H")).toBe(PARSE_ERROR.MISSING_NUMBER);
  expect(errorCode("XYZ")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
  expect(errorCode("APP")).toBe(PARSE_ERROR.MISSING_APPROACH_ID);
});

test("AC7 — numeric suffix 123 is a callsign token, not resolved here", () => {
  const result = parseRadioText("123 H270");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("123");
  expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }]);
});

test("AC8 — parse tests run without a DOM", () => {
  expect(typeof document).toBe("undefined");
  expect(typeof window).toBe("undefined");
});

test("spacing variants match the compact token table", () => {
  expectOkInstructions("L 090", [{ type: "FLY_HEADING", headingDeg: 90, turn: "LEFT" }]);
  expectOkInstructions("R 180", [{ type: "FLY_HEADING", headingDeg: 180, turn: "RIGHT" }]);
  expectOkInstructions("T 20 L", [{ type: "TURN_DEGREES", direction: "LEFT", degrees: 20 }]);
  expectOkInstructions("T 20 R", [{ type: "TURN_DEGREES", direction: "RIGHT", degrees: 20 }]);
  expectOkInstructions("T20R", [{ type: "TURN_DEGREES", direction: "RIGHT", degrees: 20 }]);
  expectOkInstructions("C 30", [{ type: "ALTITUDE", altitudeFt: 3000, verb: "CLIMB" }]);
  expectOkInstructions("S 210", [{ type: "SPEED", speedKt: 210, verb: "MAINTAIN" }]);
  expectOkInstructions("H090", [{ type: "FLY_HEADING", headingDeg: 90, turn: "SHORTEST" }]);
});

test("altitude hundreds and speed integers are not range-checked here", () => {
  expectOkInstructions("C5", [{ type: "ALTITUDE", altitudeFt: 500, verb: "CLIMB" }]);
  expectOkInstructions("C100", [{ type: "ALTITUDE", altitudeFt: 10000, verb: "CLIMB" }]);
  expectOkInstructions("C180", [{ type: "ALTITUDE", altitudeFt: 18000, verb: "CLIMB" }]);
  expectOkInstructions("S400", [{ type: "SPEED", speedKt: 400, verb: "MAINTAIN" }]);
});

test("unknown tokens including DIRECT and EXPECT_APPROACH fail", () => {
  expect(errorCode("DIRECT FIX01")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
  expect(errorCode("EXPECT ILS27")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
  expect(errorCode("H270 XYZ")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
  expect(errorCode("heading two seven zero")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
});

test("CAPP is a zero-argument first-prefix command", () => {
  expectOkInstructions("CAPP H270 A50", [
    { type: "CANCEL_APPROACH" },
    { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
    { type: "ALTITUDE", altitudeFt: 5000, verb: "MAINTAIN" },
  ]);
  expect(errorCode("H270 CAPP")).toBe(PARSE_ERROR.BAD_CLEARANCE);
  expect(errorCode("CAPP ILS27")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
  expect(errorCode("CAPP APP ILS27")).toBe(PARSE_ERROR.BAD_CLEARANCE);
  expect(errorCode("CA H270")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
});

test("I is IDENT never a callsign; H270 is an instruction not a callsign", () => {
  const ident = parseRadioText("I");
  expect(ident.ok).toBe(true);
  if (ident.ok) {
    expect(ident.callsignToken).toBeNull();
    expect(ident.instructions).toEqual([{ type: "IDENT" }]);
  }
  const heading = parseRadioText("H270");
  expect(heading.ok).toBe(true);
  if (heading.ok) {
    expect(heading.callsignToken).toBeNull();
  }
});

test("non-integer numeric tokens and incomplete turns fail", () => {
  expect(errorCode("H 270.5")).toBe(PARSE_ERROR.MISSING_NUMBER);
  expect(errorCode("T20")).toBe(PARSE_ERROR.MISSING_NUMBER);
  expect(errorCode("T0L")).toBe(PARSE_ERROR.BAD_TURN_DEGREES);
  expect(errorCode("T361R")).toBe(PARSE_ERROR.BAD_TURN_DEGREES);
});

function errorCode(source: string): string {
  const result = parseRadioText(source);
  expect(result.ok).toBe(false);
  if (result.ok) {
    return "";
  }
  return result.error.split(":", 1)[0] ?? result.error;
}

function expectOkInstructions(source: string, instructions: Instruction[]): void {
  const result = parseRadioText(source);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.instructions).toEqual(instructions);
}

test("T04-63: parseRadioText parses DSR as DELETE_SPEED_RESTRICTIONS", () => {
  const res = parseRadioText("AAL123 DSR");
  expect(res.ok).toBe(true);
  if (res.ok) {
    expect(res.callsignToken).toBe("AAL123");
    expect(res.instructions).toEqual([{ type: "DELETE_SPEED_RESTRICTIONS" }]);
  }
});

test("T04-63: parseRadioText parses speed with until constraints (FAF, DME, FIX)", () => {
  expectOkInstructions("AAL123 S180/FAF", [
    { type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "FAF" } },
  ]);
  expectOkInstructions("S180/7DME", [
    { type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "DME", distanceNm: 7 } },
  ]);
  expectOkInstructions("S180/7", [
    { type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "DME", distanceNm: 7 } },
  ]);
  expectOkInstructions("S210/MERGE", [
    { type: "SPEED", speedKt: 210, verb: "MAINTAIN", until: { type: "FIX", fixId: "MERGE" } },
  ]);
  expectOkInstructions("S 180 /FAF", [
    { type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "FAF" } },
  ]);
});

test("T04-63: parseRadioText rejects malformed speed until constraints", () => {
  expect(errorCode("S180/")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
  expect(errorCode("S180/-5")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
  expect(errorCode("H270/FAF")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
});

test("T04-82: parseRadioText parses VIS <rwy>", () => {
  expectOkInstructions("VIS 27L", [{ type: "CLEARED_VISUAL", runwayId: "27L" }]);
  expectOkInstructions("VIS 21L", [{ type: "CLEARED_VISUAL", runwayId: "21L" }]);
  expectOkInstructions("VIS 08", [{ type: "CLEARED_VISUAL", runwayId: "08" }]);
  expectOkInstructions("VIS RW27L", [{ type: "CLEARED_VISUAL", runwayId: "27L" }]);
  expect(errorCode("VIS")).toBe(PARSE_ERROR.MISSING_APPROACH_ID);
  expect(errorCode("VIS FOOBAR")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
});
