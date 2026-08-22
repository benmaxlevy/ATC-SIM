import { expect, test } from "vitest";
import type { Instruction } from "@core";
import { PARSE_ERROR, parseRadioText } from "@parse";

test("AC — DAL123 EXP ILS27 is EXPECT_APPROACH ILS27", () => {
  const result = parseRadioText("DAL123 EXP ILS27");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("DAL123");
  expect(result.instructions).toEqual([{ type: "EXPECT_APPROACH", approachId: "ILS27" }]);
});

test("EXP without an approach id fails; EXPECT English is still unknown", () => {
  expect(errorCode("EXP")).toBe(PARSE_ERROR.MISSING_APPROACH_ID);
  expect(errorCode("EXPECT ILS27")).toBe(PARSE_ERROR.UNKNOWN_TOKEN);
});

test("same-line R240 A20 APP ILS27 sets untilEstablished on the altitude", () => {
  const result = parseRadioText("R240 A20 APP ILS27");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.instructions).toEqual([
    { type: "FLY_HEADING", headingDeg: 240, turn: "RIGHT" },
    { type: "ALTITUDE", altitudeFt: 2000, verb: "MAINTAIN", untilEstablished: true },
    { type: "CLEARED_APPROACH", approachId: "ILS27" },
  ]);
});

test("H240 A20 APP ILS27 also flags untilEstablished; split tokens do not", () => {
  expectOkInstructions("H240 A20 APP ILS27", [
    { type: "FLY_HEADING", headingDeg: 240, turn: "SHORTEST" },
    { type: "ALTITUDE", altitudeFt: 2000, verb: "MAINTAIN", untilEstablished: true },
    { type: "CLEARED_APPROACH", approachId: "ILS27" },
  ]);
  expectOkInstructions("A20 APP ILS27", [
    { type: "ALTITUDE", altitudeFt: 2000, verb: "MAINTAIN" },
    { type: "CLEARED_APPROACH", approachId: "ILS27" },
  ]);
  expectOkInstructions("R240 APP ILS27", [
    { type: "FLY_HEADING", headingDeg: 240, turn: "RIGHT" },
    { type: "CLEARED_APPROACH", approachId: "ILS27" },
  ]);
  expectOkInstructions("A20", [{ type: "ALTITUDE", altitudeFt: 2000, verb: "MAINTAIN" }]);
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
