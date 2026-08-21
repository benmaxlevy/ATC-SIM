import { expect, test } from "vitest";
import type { Instruction } from "@core";
import {
  formatCallsignSpeech,
  formatReadback,
  formatRejectReadback,
  type ReadbackAircraft,
} from "./readback";
import { speakAltitude, speakHeading } from "./digits";

function speech(actual: string): string {
  return actual.toLowerCase();
}

const snapshot: ReadbackAircraft = { headingDeg: 100, altitudeFt: 8000 };

function readback(instructions: Instruction[], aircraft: ReadbackAircraft = snapshot): string {
  return speech(formatReadback({ callsign: "DAL123", instructions, aircraft }));
}

test("AC1 — DAL123 is delta one two three", () => {
  expect(speech(formatCallsignSpeech("DAL123"))).toBe("delta one two three");
  expect(speech(formatCallsignSpeech("dal123"))).toBe("delta one two three");
});

test("AC2 — shortest heading 270 has callsign and heading, no turn word", () => {
  const text = readback([{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }]);
  expect(text).toContain("delta one two three");
  expect(text).toContain("heading two seven zero");
  expect(text).not.toMatch(/turn left|turn right/);
});

test("AC3 — left heading 90 includes turn left heading zero niner zero", () => {
  const text = readback([{ type: "FLY_HEADING", headingDeg: 90, turn: "LEFT" }]);
  expect(text).toContain("turn left heading zero niner zero");
});

test("AC4 — descend 3000 is descend and maintain three thousand", () => {
  const text = readback([{ type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }]);
  expect(text).toContain("descend and maintain three thousand");
  expect(text).not.toContain("go down to");
});

test("AC5 — combined heading, descend, and speed: callsign once, commas", () => {
  const text = readback([
    { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
    { type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" },
    { type: "SPEED", speedKt: 210, verb: "MAINTAIN" },
  ]);
  expect(text).toBe(
    "delta one two three heading two seven zero, descend and maintain three thousand, maintain two one zero knots",
  );
  expect(text.split("delta one two three").length).toBe(2);
});

test("AC6 — SAY_HEADING uses current snapshot heading, not an assigned field", () => {
  const text = readback([{ type: "SAY_HEADING" }], { headingDeg: 45, altitudeFt: 8000 });
  expect(text).toBe("delta one two three heading zero four five");
});

test("AC7 — AMBIGUOUS_CALLSIGN reject is unable, ambiguous callsign", () => {
  expect(speech(formatRejectReadback({ reason: "AMBIGUOUS_CALLSIGN" }))).toBe(
    "unable, ambiguous callsign",
  );
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
  ["AAL1", "american one"],
  ["UAL456", "united four five six"],
  ["SWA99", "southwest niner niner"],
  ["JBU12", "jetblue one two"],
  ["NKS7", "spirit seven"],
  ["FFT88", "frontier eight eight"],
  ["ASA9", "alaska niner"],
  ["FDX10", "fedex one zero"],
  ["UPS42", "u p s four two"],
  ["XYZ99", "x-ray yankee zulu niner niner"],
];

test.each(telephonyTable)("telephony %s → %s", (callsign, expected) => {
  expect(speech(formatCallsignSpeech(callsign))).toBe(expected);
});

const headingTable: [number, string][] = [
  [0, "three six zero"],
  [90, "zero niner zero"],
  [270, "two seven zero"],
  [5, "zero zero five"],
];

test.each(headingTable)("heading %i → %s", (deg, expected) => {
  expect(speech(speakHeading(deg))).toBe(expected);
});

test("FLY_HEADING 0 SHORTEST is spoken three six zero", () => {
  const text = readback([{ type: "FLY_HEADING", headingDeg: 0, turn: "SHORTEST" }]);
  expect(text).toBe("delta one two three heading three six zero");
});

test("FLY_HEADING RIGHT uses turn right heading", () => {
  const text = readback([{ type: "FLY_HEADING", headingDeg: 180, turn: "RIGHT" }]);
  expect(text).toBe("delta one two three turn right heading one eight zero");
});

const altitudeTable: [number, string][] = [
  [3000, "three thousand"],
  [4500, "four thousand five hundred"],
  [10000, "one zero thousand"],
  [11000, "one one thousand"],
  [10500, "one zero thousand five hundred"],
];

test.each(altitudeTable)("altitude %i → %s", (ft, expected) => {
  expect(speech(speakAltitude(ft))).toBe(expected);
});

test("climb and maintain / maintain altitude wording", () => {
  expect(readback([{ type: "ALTITUDE", altitudeFt: 3000, verb: "CLIMB" }])).toBe(
    "delta one two three climb and maintain three thousand",
  );
  expect(readback([{ type: "ALTITUDE", altitudeFt: 4500, verb: "MAINTAIN" }])).toBe(
    "delta one two three maintain four thousand five hundred",
  );
});

test("TURN_DEGREES twenty left is two zero", () => {
  expect(readback([{ type: "TURN_DEGREES", direction: "LEFT", degrees: 20 }])).toBe(
    "delta one two three turn left two zero degrees",
  );
  expect(readback([{ type: "TURN_DEGREES", direction: "RIGHT", degrees: 20 }])).toBe(
    "delta one two three turn right two zero degrees",
  );
});

test("PRESENT_HEADING is fly present heading", () => {
  expect(readback([{ type: "PRESENT_HEADING" }])).toBe("delta one two three fly present heading");
});

test("IDENT is ident", () => {
  expect(readback([{ type: "IDENT" }])).toBe("delta one two three ident");
});

test("SAY_ALTITUDE speaks current altitude without say", () => {
  expect(readback([{ type: "SAY_ALTITUDE" }], { headingDeg: 90, altitudeFt: 3000 })).toBe(
    "delta one two three three thousand",
  );
});

test("CLEARED_APPROACH ILS27 spells i l s two seven", () => {
  expect(readback([{ type: "CLEARED_APPROACH", approachId: "ILS27" }])).toBe(
    "delta one two three cleared i l s two seven approach",
  );
});

const rejectTable: [{ callsign?: string; reason: string }, string][] = [
  [{ reason: "UNKNOWN_CALLSIGN" }, "unable, unknown callsign"],
  [{ reason: "AMBIGUOUS_CALLSIGN" }, "unable, ambiguous callsign"],
  [{ reason: "NO_CALLSIGN_OR_SELECTION" }, "unable, no aircraft selected"],
  [{ callsign: "DAL123", reason: "HEADING" }, "delta one two three unable heading"],
  [{ callsign: "DAL123", reason: "ALTITUDE" }, "delta one two three unable altitude"],
  [{ callsign: "DAL123", reason: "SPEED" }, "delta one two three unable speed"],
  [{ reason: "EMPTY" }, "unable, say again"],
  [{ callsign: "DAL123", reason: "CLIMB_NOT_ABOVE" }, "delta one two three unable altitude"],
  [{ callsign: "DAL123", reason: "DESCEND_NOT_BELOW" }, "delta one two three unable altitude"],
  [{ reason: "PARSE" }, "unable, say again"],
  [{ reason: "HEADING" }, "unable heading"],
];

test.each(rejectTable)("reject %j → %s", (args, expected) => {
  expect(speech(formatRejectReadback(args))).toBe(expected);
});

test("niner is used for 9 in speed and high altitude", () => {
  expect(readback([{ type: "SPEED", speedKt: 190, verb: "MAINTAIN" }])).toBe(
    "delta one two three maintain one niner zero knots",
  );
  expect(speech(speakAltitude(19000))).toBe("one niner thousand");
});
