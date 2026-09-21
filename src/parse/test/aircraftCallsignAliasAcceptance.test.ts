import { createAircraft, createWorld, SessionLog, setSelectedAircraft } from "@core";
import { PARSE_ERROR, parseCommand } from "@parse";
import { describe, expect, test } from "vitest";
import { handleRadioText } from "../../pilot/handleRadioText";
import { formatCallsignSpeech } from "../../pilot/telephony";

const DIGIT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];

const VFR_ALIASES = [
  ["BE36", "Bonanza", "N101"],
  ["C172", "Skyhawk", "N102"],
  ["C182", "Skylane", "N103"],
  ["C208", "Caravan", "N104"],
  ["DA40", "Diamond", "N105"],
  ["PA28", "Archer", "N106"],
  ["SR22", "Cirrus", "N107"],
] as const;

type Roster = Array<{ callsign: string; aliases: readonly string[] }>;

function roster(): Roster {
  return VFR_ALIASES.map(([, alias, callsign]) => ({ callsign, aliases: [alias] }));
}

function spokenTail(callsign: string): string {
  return callsign
    .slice(1)
    .split("")
    .map((digit) => DIGIT_WORDS[Number(digit)])
    .join(" ");
}

function makeAircraft(aircraftType: string, alias: string, callsign: string) {
  return createAircraft({
    id: `acceptance-${callsign}`,
    callsign,
    spokenAliases: [alias],
    aircraftType,
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 5000,
    speedKt: 120,
  });
}

function expectParseMiss(result: Awaited<ReturnType<typeof parseCommand>>): void {
  expect(result).toEqual(expect.objectContaining({ ok: false, error: PARSE_ERROR.PARSE_MISS }));
}

describe("T03-31 synthetic aircraft callsign alias acceptance", () => {
  test.each(VFR_ALIASES)(
    "canonical, typed alias, and spoken alias forms preserve %s identity",
    async (_aircraftType, alias, callsign) => {
      const candidates = roster();
      const canonical = await parseCommand(`${callsign} H270`, {
        source: "text",
        callsigns: candidates,
        pathC: false,
      });
      const typedAlias = await parseCommand(`${alias} ${callsign.slice(1)} H270`, {
        source: "text",
        callsigns: candidates,
        pathC: false,
      });
      const spokenAlias = await parseCommand(
        `${alias} ${spokenTail(callsign)} turn left heading two seven zero`,
        {
          source: "voice",
          callsigns: candidates,
          pathC: false,
        },
      );

      expect(canonical).toMatchObject({ ok: true, callsignToken: callsign, parseStage: "typed" });
      expect(typedAlias).toMatchObject({ ok: true, callsignToken: callsign, parseStage: "typed" });
      expect(spokenAlias).toMatchObject({
        ok: true,
        callsignToken: callsign,
        parseStage: "spoken_a",
      });
      if (spokenAlias.ok) {
        expect(spokenAlias.instructions).toEqual([
          { type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" },
        ]);
      }
    },
  );

  test.each(VFR_ALIASES)(
    "controller alias command dispatches to canonical %s",
    async (aircraftType, alias, callsign) => {
      const aircraft = makeAircraft(aircraftType, alias, callsign);
      const world = createWorld({ aircraft: [aircraft] });
      const result = await handleRadioText(
        world,
        `${alias} ${callsign.slice(1)} H270`,
        new SessionLog(),
      );

      expect(result.accepted).toBe(true);
      expect(result.command).toMatchObject({ callsign, instructions: [{ type: "FLY_HEADING" }] });
      expect(result.readback).toContain(`${alias} ${spokenTail(callsign)}`);
      expect(result.readback).toContain("heading 270");
      expect(aircraft.callsign).toBe(callsign);
      expect(aircraft.intent.assignedHeadingDeg).toBe(270);
    },
  );

  test("unknown and incomplete aliases are PARSE_MISS and selected aircraft is not used", async () => {
    const candidates = roster();
    const unknown = await parseCommand("Citation 101 H270", {
      source: "voice",
      selectedCallsign: "N102",
      callsigns: candidates,
      pathC: false,
    });
    const incomplete = await parseCommand("Skyhawk", {
      source: "voice",
      selectedCallsign: "N102",
      callsigns: candidates,
      pathC: false,
    });

    expectParseMiss(unknown);
    expectParseMiss(incomplete);
  });

  test("ambiguous alias is PARSE_MISS with no mutation", async () => {
    const first = makeAircraft("C172", "Skyhawk", "N201");
    const second = makeAircraft("C182", "Skyhawk", "N202");
    const world = createWorld({ aircraft: [first, second] });
    setSelectedAircraft(world, second.id);
    const before = world.aircraft.map((aircraft) => aircraft.intent.assignedHeadingDeg);
    const log = new SessionLog();
    const result = await handleRadioText(world, "Skyhawk 201 H270", log);

    expect(result).toMatchObject({ accepted: false, reason: "PARSE" });
    expect(first.intent.assignedHeadingDeg).toBe(before[0]);
    expect(second.intent.assignedHeadingDeg).toBe(before[1]);
    expect(log.byType("command.rejected")[0]?.command).toBeNull();
  });

  test("five-digit N-number remains complete in parser and pilot readback", async () => {
    const candidates = [{ callsign: "N12345", aliases: ["Skyhawk"] }];
    const canonical = await parseCommand(
      "November one two three four five turn left heading two seven zero",
      { source: "voice", callsigns: candidates, pathC: false },
    );
    const alias = await parseCommand("Skyhawk 12345 H270", {
      source: "text",
      callsigns: candidates,
      pathC: false,
    });

    expect(canonical).toMatchObject({ ok: true, callsignToken: "N12345" });
    expect(alias).toMatchObject({ ok: true, callsignToken: "N12345" });
    expect(formatCallsignSpeech("N12345", { spokenAliases: ["Skyhawk"] })).toBe(
      "Skyhawk one two three four five",
    );
  });
});
