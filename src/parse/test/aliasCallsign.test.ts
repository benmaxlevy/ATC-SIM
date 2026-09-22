import { expect, test } from "vitest";
import { PARSE_ERROR, parseCommand } from "@parse";

const roster = [
  { callsign: "N123", aliases: ["Skyhawk"] },
  { callsign: "N456", aliases: ["Archer"] },
] as const;

function expectMiss(result: Awaited<ReturnType<typeof parseCommand>>): void {
  expect(result).toEqual(expect.objectContaining({ ok: false, error: PARSE_ERROR.PARSE_MISS }));
}

test.each([
  ["Skyhawk 123 H270", "N123", "typed"],
  ["Skyhawk one two three turn left heading two seven zero", "N123", "spoken_a"],
] as const)("alias form %s grounds to canonical %s", async (text, callsign, parseStage) => {
  const result = await parseCommand(text, { source: "voice", callsigns: roster, pathC: false });
  expect(result).toMatchObject({ ok: true, callsignToken: callsign, parseStage });
  if (result.ok) {
    expect(result.callsignToken).toBe("N123");
    expect(result.instructions).toEqual([
      { type: "FLY_HEADING", headingDeg: 270, turn: parseStage === "typed" ? "SHORTEST" : "LEFT" },
    ]);
  }
});

test("canonical callsign wins over selected aircraft", async () => {
  const result = await parseCommand("N123 H270", {
    source: "text",
    selectedCallsign: "N456",
    callsigns: roster,
    pathC: false,
  });
  expect(result).toMatchObject({ ok: true, callsignToken: "N123" });
});

test("unique airline suffix behavior remains unchanged", async () => {
  const result = await parseCommand("123 H270", {
    source: "text",
    callsigns: ["DAL123", "N456"],
    pathC: false,
  });
  expect(result).toMatchObject({ ok: true, callsignToken: "DAL123" });
});

test("spoken five-digit N-number preserves full registration", async () => {
  const result = await parseCommand(
    "November one two three four five turn left heading two seven zero",
    {
      source: "voice",
      callsigns: ["N12345"],
      pathC: false,
    },
  );
  expect(result).toMatchObject({ ok: true, callsignToken: "N12345" });
});

test.each(["Skyhawk", "Skyhawk 12X H270", "Citation 123 H270"])(
  "incomplete, malformed, or unknown alias %s fails closed",
  async (text) => {
    const result = await parseCommand(text, {
      source: "voice",
      selectedCallsign: "N456",
      callsigns: roster,
      pathC: false,
    });
    expectMiss(result);
  },
);

test("duplicate live aliases are ambiguous even when an aircraft is selected", async () => {
  const result = await parseCommand("Skyhawk 123 H270", {
    source: "voice",
    selectedCallsign: "N456",
    callsigns: [
      { callsign: "N123", aliases: ["Skyhawk"] },
      { callsign: "N456", aliases: ["Skyhawk"] },
    ],
    pathC: false,
  });
  expectMiss(result);
});

test("alias inside arbitrary text is not a callsign slot", async () => {
  const result = await parseCommand("say Skyhawk 123 heading 270", {
    source: "voice",
    callsigns: roster,
    pathC: false,
  });
  expectMiss(result);
});

test.each([
  ["Cirrus 834 turn left heading 270", "N834SP"],
  ["Sir 834 turn left heading 270", "N834SP"],
  ["Sirius eight three four turn left heading two seven zero", "N834SP"],
  ["Serious 834SP heading 270", "N834SP"],
  ["Cirrus eight three four Sierra Papa turn left heading 270", "N834SP"],
  ["Skyhawk 123 H270", "N123"],
] as const)("GA alias variant %s matches canonical callsign %s", async (text, expectedCallsign) => {
  const gaRoster = [
    { callsign: "N834SP", aliases: ["Cirrus"] },
    { callsign: "N123", aliases: ["Skyhawk"] },
  ] as const;
  const result = await parseCommand(text, {
    source: "voice",
    callsigns: gaRoster,
    pathC: false,
  });
  expect(result).toMatchObject({ ok: true, callsignToken: expectedCallsign });
});
