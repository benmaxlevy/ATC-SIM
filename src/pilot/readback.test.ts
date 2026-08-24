import { expect, test } from "vitest";
import type { Instruction } from "@core";
import {
  formatCallsignSpeech,
  formatReadback,
  formatRejectReadback,
  type ReadbackAircraft,
} from "./readback";
import { formatAltitude, speakAltitude, speakHeading } from "./telephony";

const snapshot: ReadbackAircraft = { headingDeg: 100, altitudeFt: 8000 };

function readback(instructions: Instruction[], aircraft: ReadbackAircraft = snapshot): string {
  return formatReadback({ callsign: "DAL123", instructions, aircraft });
}

test("AC1 — DAL123 is Delta 123", () => {
  expect(formatCallsignSpeech("DAL123")).toBe("Delta 123");
  expect(formatCallsignSpeech("dal123")).toBe("Delta 123");
});

test("AC2 — shortest heading 270 has callsign and heading, no turn word", () => {
  const text = readback([{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }]);
  expect(text).toContain("Delta 123");
  expect(text).toContain("heading 270");
  expect(text).not.toMatch(/turn left|turn right/);
});

test("AC3 — left heading 90 includes turn left heading 090", () => {
  const text = readback([{ type: "FLY_HEADING", headingDeg: 90, turn: "LEFT" }]);
  expect(text).toContain("turn left heading 090");
  expect(text).not.toContain("ninety");
  expect(text).not.toContain("zero niner zero");
});

test("AC4 — descend 3000 is descend and maintain three thousand (3000)", () => {
  const text = readback([{ type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }]);
  expect(text).toContain("descend and maintain three thousand (3000)");
  expect(text).not.toContain("go down to");
});

test("AC5 — combined heading, descend, and speed: callsign once, commas", () => {
  const text = readback([
    { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
    { type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" },
    { type: "SPEED", speedKt: 210, verb: "MAINTAIN" },
  ]);
  expect(text).toBe(
    "Delta 123 heading 270, descend and maintain three thousand (3000), maintain 210 knots",
  );
  expect(text.split("Delta 123").length).toBe(2);
});

test("AC6 — SAY_HEADING uses current snapshot heading, not an assigned field", () => {
  const text = readback([{ type: "SAY_HEADING" }], { headingDeg: 45, altitudeFt: 8000 });
  expect(text).toBe("Delta 123 heading 045");
});

test("AC7 — AMBIGUOUS_CALLSIGN reject is Unable, ambiguous callsign", () => {
  expect(formatRejectReadback({ reason: "AMBIGUOUS_CALLSIGN" })).toBe("Unable, ambiguous callsign");
});

test("AC8 — readback modules are DOM-free", () => {
  const sources = import.meta.glob("./!(*.test).ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  expect(Object.keys(sources).length).toBeGreaterThan(0);
  for (const [path, src] of Object.entries(sources)) {
    expect(src, path).not.toMatch(/\bdocument\b|\bwindow\b|\bHTMLElement\b/);
    expect(src, path).not.toMatch(/from\s+["']react["']/);
    expect(src, path).not.toMatch(/stepWorld/);
  }
});

test("AC9 — templates cite JO 7110.65 (R01) vs vice tokens (R08)", () => {
  const sources = import.meta.glob("./readback.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./readback.ts"];
  expect(src).toMatch(/7110\.65/);
  expect(src).toMatch(/R01/);
  expect(src).toMatch(/R08/);
  expect(src).toMatch(/descend and maintain/);
});

const telephonyTable: [string, string][] = [
  ["AAL1", "American 1"],
  ["UAL456", "United 456"],
  ["SWA99", "Southwest 99"],
  ["JBU12", "JetBlue 12"],
  ["NKS7", "Spirit 7"],
  ["FFT88", "Frontier 88"],
  ["ASA9", "Alaska 9"],
  ["FDX10", "FedEx 10"],
  ["UPS42", "UPS 42"],
  ["XYZ99", "X-ray Yankee Zulu 99"],
];

test.each(telephonyTable)("telephony %s → %s", (callsign, expected) => {
  expect(formatCallsignSpeech(callsign)).toBe(expected);
});

const headingTable: [number, string][] = [
  [0, "three six zero"],
  [90, "zero niner zero"],
  [270, "two seven zero"],
  [5, "zero zero five"],
];

test.each(headingTable)("heading speech %i → %s", (deg, expected) => {
  expect(speakHeading(deg)).toBe(expected);
});

test("FLY_HEADING 0 SHORTEST is heading 360", () => {
  const text = readback([{ type: "FLY_HEADING", headingDeg: 0, turn: "SHORTEST" }]);
  expect(text).toBe("Delta 123 heading 360");
});

test("FLY_HEADING RIGHT uses turn right heading", () => {
  const text = readback([{ type: "FLY_HEADING", headingDeg: 180, turn: "RIGHT" }]);
  expect(text).toBe("Delta 123 turn right heading 180");
});

const altitudeSpeechTable: [number, string][] = [
  [3000, "three thousand"],
  [4500, "four thousand five hundred"],
  [10000, "one-zero thousand"],
  [11000, "one-one thousand"],
  [10500, "one-zero thousand five hundred"],
];

test.each(altitudeSpeechTable)("altitude speech %i → %s", (ft, expected) => {
  expect(speakAltitude(ft)).toBe(expected);
});

const altitudeDisplayTable: [number, string][] = [
  [3000, "three thousand (3000)"],
  [4500, "four thousand five hundred (4500)"],
  [10000, "one-zero thousand (10000)"],
  [11000, "one-one thousand (11000)"],
  [10500, "one-zero thousand five hundred (10500)"],
  [18000, "FL 180"],
  [18049, "FL 180"],
  [18500, "FL 185"],
  [11047, "one-one thousand (11000)"],
];

test.each(altitudeDisplayTable)("altitude display %i → %s", (ft, expected) => {
  expect(formatAltitude(ft)).toBe(expected);
});

test("climb and maintain / maintain altitude wording", () => {
  expect(readback([{ type: "ALTITUDE", altitudeFt: 3000, verb: "CLIMB" }])).toBe(
    "Delta 123 climb and maintain three thousand (3000)",
  );
  expect(readback([{ type: "ALTITUDE", altitudeFt: 4500, verb: "MAINTAIN" }])).toBe(
    "Delta 123 maintain four thousand five hundred (4500)",
  );
  expect(readback([{ type: "ALTITUDE", altitudeFt: 18000, verb: "CLIMB" }])).toBe(
    "Delta 123 climb and maintain FL 180",
  );
});

test("TURN_DEGREES twenty left is 20", () => {
  expect(readback([{ type: "TURN_DEGREES", direction: "LEFT", degrees: 20 }])).toBe(
    "Delta 123 turn left 20 degrees",
  );
  expect(readback([{ type: "TURN_DEGREES", direction: "RIGHT", degrees: 20 }])).toBe(
    "Delta 123 turn right 20 degrees",
  );
});

test("PRESENT_HEADING is fly present heading", () => {
  expect(readback([{ type: "PRESENT_HEADING" }])).toBe("Delta 123 fly present heading");
});

test("IDENT is ident", () => {
  expect(readback([{ type: "IDENT" }])).toBe("Delta 123 ident");
});

test("SAY_ALTITUDE speaks current altitude without say", () => {
  expect(readback([{ type: "SAY_ALTITUDE" }], { headingDeg: 90, altitudeFt: 3000 })).toBe(
    "Delta 123 three thousand (3000)",
  );
});

test("CLEARED_APPROACH ILS27 is ILS runway 27", () => {
  expect(readback([{ type: "CLEARED_APPROACH", approachId: "ILS27" }])).toBe(
    "Delta 123 cleared ILS runway 27 approach",
  );
});

test("INTERCEPT_LOCALIZER ILS27 is intercept the runway 27 localizer", () => {
  expect(readback([{ type: "INTERCEPT_LOCALIZER", approachId: "ILS27" }])).toBe(
    "Delta 123 intercept the runway 27 localizer",
  );
});

test("EXPECT_APPROACH ILS27 is expect ILS runway 27", () => {
  expect(readback([{ type: "EXPECT_APPROACH", approachId: "ILS27" }])).toBe(
    "Delta 123 expect ILS runway 27",
  );
});

test("GO_AROUND is going around", () => {
  expect(readback([{ type: "GO_AROUND" }])).toBe("Delta 123 going around");
});

test("combined ILS vector includes until established and turn right heading", () => {
  expect(
    readback([
      { type: "FLY_HEADING", headingDeg: 240, turn: "RIGHT" },
      { type: "ALTITUDE", altitudeFt: 2000, verb: "MAINTAIN", untilEstablished: true },
      { type: "CLEARED_APPROACH", approachId: "ILS27" },
    ]),
  ).toBe(
    "Delta 123 turn right heading 240, maintain two thousand (2000) until established, cleared ILS runway 27 approach",
  );
});

test("JOIN_PROCEDURE uses the published STAR name", () => {
  expect(
    formatReadback({
      callsign: "DAL123",
      instructions: [{ type: "JOIN_PROCEDURE", procedureId: "DEM1" }],
      aircraft: snapshot,
      procedureNames: { DEM1: "DEMO ONE" },
    }),
  ).toBe("Delta 123 join DEMO ONE");
});

test("DESCEND_VIA uses the published STAR name", () => {
  expect(
    formatReadback({
      callsign: "DAL123",
      instructions: [{ type: "DESCEND_VIA", procedureId: "DEM1" }],
      aircraft: snapshot,
      procedureNames: { DEM1: "DEMO ONE" },
    }),
  ).toBe("Delta 123 descend via DEMO ONE");
});

const rejectTable: [{ callsign?: string; reason: string; detail?: string }, string][] = [
  [{ reason: "UNKNOWN_CALLSIGN" }, "Unable, unknown callsign"],
  [{ reason: "AMBIGUOUS_CALLSIGN" }, "Unable, ambiguous callsign"],
  [{ reason: "NO_CALLSIGN_OR_SELECTION" }, "Unable, no aircraft selected"],
  [{ callsign: "DAL123", reason: "HEADING" }, "Delta 123 unable heading"],
  [{ callsign: "DAL123", reason: "ALTITUDE" }, "Delta 123 unable altitude"],
  [{ callsign: "DAL123", reason: "SPEED" }, "Delta 123 unable speed"],
  [{ reason: "EMPTY" }, "Unable, say again"],
  [{ callsign: "DAL123", reason: "CLIMB_NOT_ABOVE" }, "Delta 123 unable altitude"],
  [{ callsign: "DAL123", reason: "DESCEND_NOT_BELOW" }, "Delta 123 unable altitude"],
  [{ callsign: "DAL123", reason: "UNKNOWN_FIX" }, "Delta 123 unable, unknown fix"],
  [{ callsign: "DAL123", reason: "UNKNOWN_PROCEDURE" }, "Delta 123 unable, unknown procedure"],
  [
    { callsign: "DAL123", reason: "NOT_ON_COURSE", detail: "NEMAX" },
    "Delta 123 unable, not on course to NEMAX",
  ],
  [{ callsign: "DAL123", reason: "UNKNOWN_APPROACH" }, "Delta 123 unable, unknown approach"],
  [{ callsign: "DAL123", reason: "NOT_ON_APPROACH" }, "Delta 123 unable, not on approach"],
  [{ reason: "PARSE" }, "Unable, say again"],
  [{ reason: "HEADING" }, "Unable heading"],
];

test.each(rejectTable)("reject %j → %s", (args, expected) => {
  expect(formatRejectReadback(args)).toBe(expected);
});

test("speed uses numerals; FL 190 is flight level not niner speech", () => {
  expect(readback([{ type: "SPEED", speedKt: 190, verb: "MAINTAIN" }])).toBe(
    "Delta 123 maintain 190 knots",
  );
  expect(speakAltitude(19000)).toBe("one-niner thousand");
  expect(formatAltitude(19000)).toBe("FL 190");
});
