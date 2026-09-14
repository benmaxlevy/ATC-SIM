import { expect, test } from "vitest";
import type { Instruction } from "@core";
import { formatCallsignSpeech, formatReadback, formatRejectReadback } from "../readback";

const snapshot = { headingDeg: 100, altitudeFt: 8000 };

function readback(instructions: Instruction[]): string {
  return formatReadback({ callsign: "DAL123", instructions, aircraft: snapshot });
}

test("DAL123 is Delta 123", () => {
  expect(formatCallsignSpeech("DAL123")).toBe("Delta 123");
});

test("shortest heading 270 has no turn word", () => {
  const text = readback([{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }]);
  expect(text).toContain("heading 270");
  expect(text).not.toMatch(/turn left|turn right/);
});

test("ambiguous callsign reject", () => {
  expect(formatRejectReadback({ reason: "AMBIGUOUS_CALLSIGN" })).toMatch(/ambiguous callsign/i);
});

test("canonical IFR clearance readback preserves every route segment", () => {
  const text = readback([
    {
      type: "IFR_CLEARANCE",
      limitId: "KATL",
      access: {
        type: "EXPLICIT_ROUTE",
        segments: [
          { type: "DIRECT", fixId: "SWEPT" },
          { type: "PROCEDURE", procedureId: "SID1", transitionId: "NORTH" },
        ],
      },
    },
  ]);
  expect(text).toBe("Delta 123 cleared to KATL via direct SWEPT then SID1 NORTH then direct");
});
