import { expect, test } from "vitest";
import type { Instruction } from "@core";
import { PARSE_ERROR, parseRadioText } from "@parse";

test("DAL123 IL ILS27 is INTERCEPT_LOCALIZER ILS27", () => {
  const result = parseRadioText("DAL123 IL ILS27");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("DAL123");
  expect(result.instructions).toEqual([{ type: "INTERCEPT_LOCALIZER", approachId: "ILS27" }]);
});

test("IL without an approach id fails", () => {
  const result = parseRadioText("IL");
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain(PARSE_ERROR.MISSING_APPROACH_ID);
  }
});

test("R240 IL ILS27 is heading plus loc intercept, not untilEstablished", () => {
  const result = parseRadioText("R240 IL ILS27");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.instructions).toEqual([
    { type: "FLY_HEADING", headingDeg: 240, turn: "RIGHT" },
    { type: "INTERCEPT_LOCALIZER", approachId: "ILS27" },
  ]);
});

function expectOkInstructions(source: string, instructions: Instruction[]): void {
  const result = parseRadioText(source);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.instructions).toEqual(instructions);
}

test("spacing variants match IL ILS27", () => {
  expectOkInstructions("il ils27", [{ type: "INTERCEPT_LOCALIZER", approachId: "ILS27" }]);
  expectOkInstructions("IL  ILS27", [{ type: "INTERCEPT_LOCALIZER", approachId: "ILS27" }]);
});
