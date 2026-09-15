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

test("compact CIFP ILS identifiers read back as ILS", () => {
  expect(readback([{ type: "CLEARED_APPROACH", approachId: "I26R" }])).toBe(
    "Delta 123 cleared ILS runway 26R approach",
  );
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

test("IFR route readback keeps zero, one, and three-leg route shapes", () => {
  const cases: Array<{
    name: string;
    access: Extract<Instruction, { type: "IFR_CLEARANCE" }>["access"];
    expected: string;
  }> = [
    {
      name: "zero",
      access: { type: "EXPLICIT_ROUTE", segments: [] },
      expected: "Delta 123 cleared to KATL via direct",
    },
    {
      name: "one",
      access: {
        type: "EXPLICIT_ROUTE",
        segments: [{ type: "DIRECT", fixId: "SWEPT" }],
      },
      expected: "Delta 123 cleared to KATL via direct SWEPT then direct",
    },
    {
      name: "three",
      access: {
        type: "EXPLICIT_ROUTE",
        segments: [
          { type: "DIRECT", fixId: "SWEPT" },
          { type: "DIRECT", fixId: "KIMMY" },
          { type: "DIRECT", fixId: "BLUFF" },
        ],
      },
      expected:
        "Delta 123 cleared to KATL via direct SWEPT then direct KIMMY then direct BLUFF then direct",
    },
  ];

  for (const item of cases) {
    expect(
      readback([{ type: "IFR_CLEARANCE", limitId: "KATL", access: item.access }]),
      item.name,
    ).toBe(item.expected);
  }
});

test("formatRejectReadback speaks speed and altitude unable details with callsign", () => {
  expect(
    formatRejectReadback({
      callsign: "DAL123",
      reason: "SPEED",
      detail: "unable speed 120, minimum is 140",
    }),
  ).toBe("Delta 123 unable speed 120, minimum is 140");

  expect(
    formatRejectReadback({
      callsign: "DAL123",
      reason: "ALTITUDE",
      detail: "unable altitude 45000, ceiling is 41000",
    }),
  ).toBe("Delta 123 unable altitude 45000, ceiling is 41000");

  expect(
    formatRejectReadback({
      callsign: "DAL123",
      reason: "SPEED",
    }),
  ).toBe("Delta 123 unable speed");

  expect(
    formatRejectReadback({
      callsign: "DAL123",
      reason: "ALTITUDE",
    }),
  ).toBe("Delta 123 unable altitude");

  expect(
    formatRejectReadback({
      reason: "SPEED",
      detail: "unable speed 120, minimum is 140",
    }),
  ).toBe("Unable speed 120, minimum is 140");
});

test("formatReadback formats DELETE_SPEED_RESTRICTIONS", () => {
  expect(readback([{ type: "DELETE_SPEED_RESTRICTIONS" }])).toBe(
    "Delta 123 delete speed restrictions",
  );
});

test("formatReadback formats SPEED with until FAF, DME, FIX", () => {
  expect(
    readback([{ type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "FAF" } }]),
  ).toBe("Delta 123 maintain 180 knots until final approach fix");
  expect(
    readback([
      { type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "DME", distanceNm: 7 } },
    ]),
  ).toBe("Delta 123 maintain 180 knots until 7 DME");
  expect(
    readback([
      { type: "SPEED", speedKt: 210, verb: "MAINTAIN", until: { type: "FIX", fixId: "MERGE" } },
    ]),
  ).toBe("Delta 123 maintain 210 knots until MERGE");
});

test("formatRejectReadback formats approach and speed boundary unable details", () => {
  expect(
    formatRejectReadback({
      callsign: "AAL123",
      reason: "ALTITUDE",
      detail: "unable. cleared for the ILS already.",
    }),
  ).toBe("American 123 unable. cleared for the ILS already.");

  expect(
    formatRejectReadback({
      callsign: "AAL123",
      reason: "ALTITUDE",
      detail: "unable. cleared for the approach already.",
    }),
  ).toBe("American 123 unable. cleared for the approach already.");

  expect(
    formatRejectReadback({
      callsign: "AAL123",
      reason: "SPEED",
      detail: "unable. restriction too close to 5 DME",
    }),
  ).toBe("American 123 unable. restriction too close to 5 DME");

  expect(
    formatRejectReadback({
      callsign: "AAL123",
      reason: "SPEED",
      detail: "unable. restriction too close to final approach fix",
    }),
  ).toBe("American 123 unable. restriction too close to final approach fix");

  expect(
    formatRejectReadback({
      reason: "ALTITUDE",
      detail: "unable. cleared for the ILS already.",
    }),
  ).toBe("Unable. cleared for the ILS already.");
});
