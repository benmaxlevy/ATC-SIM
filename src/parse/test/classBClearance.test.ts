import { describe, expect, it } from "vitest";
import { parseCommand } from "@parse";
import { formatReadback } from "@pilot";
import { isLegalInstruction, pathCResultIsComplete, schemaCheckPathC } from "../path-c";
import { matchSpokenPatterns } from "../spoken/pattern-matcher";
import { parseSpokenGrammar } from "../spoken/grammar";

const FIXES = ["DEM", "KPDK"];

const TO_ENTER_ALIASES = [
  "cleared to enter bravo airspace",
  "cleared into bravo airspace",
  "cleared to enter class bravo airspace",
  "cleared into class bravo airspace",
  "cleared to enter the bravo airspace",
  "cleared into the bravo airspace",
  "cleared to enter the class bravo airspace",
  "cleared into the class bravo airspace",
];

describe("T04-94 VFR Class B Command IR", () => {
  it.each(TO_ENTER_ALIASES)("accepts TO_ENTER alias: %s", async (phrase) => {
    await expect(
      parseCommand(`DAL123 ${phrase}`, { source: "text", pathC: false, fixes: FIXES }),
    ).resolves.toMatchObject({
      ok: true,
      parseStage: "spoken_a",
      instructions: [{ type: "CLASS_B_CLEARANCE", operation: "TO_ENTER" }],
    });
  });

  it("accepts canonical THROUGH and OUT_OF with ordered route and altitude suffixes", async () => {
    await expect(
      parseCommand(
        "DAL123 cleared through bravo airspace via dem then kpdk maintain three thousand while in bravo airspace",
        { source: "voice", pathC: false, fixes: FIXES },
      ),
    ).resolves.toMatchObject({
      ok: true,
      instructions: [
        {
          type: "CLASS_B_CLEARANCE",
          operation: "THROUGH",
          route: [
            { type: "DIRECT", fixId: "DEM" },
            { type: "DIRECT", fixId: "KPDK" },
          ],
          altitudeFt: 3000,
        },
      ],
    });

    await expect(
      parseCommand("DAL123 cleared out of bravo airspace", {
        source: "text",
        pathC: false,
        fixes: FIXES,
      }),
    ).resolves.toMatchObject({
      ok: true,
      instructions: [{ type: "CLASS_B_CLEARANCE", operation: "OUT_OF" }],
    });
  });

  it("rejects bare, fuzzy, and non-canonical Class B variants", async () => {
    for (const phrase of [
      "cleared into bravo",
      "cleared to enter bravo",
      "cleared thru bravo airspace",
      "cleared outta bravo airspace",
      "cleared into class bravo",
      "cleared through class bravo airspace",
    ]) {
      await expect(
        parseCommand(`DAL123 ${phrase}`, { source: "voice", pathC: false, fixes: FIXES }),
      ).resolves.toMatchObject({ ok: false });
    }
  });

  it("rejects route and altitude order violations or ungrounded route names", () => {
    const bad = [
      "cleared through bravo airspace via",
      "cleared through bravo airspace maintain 3000 while in bravo airspace via dem",
      "cleared through bravo airspace via nope",
      "cleared through bravo airspace via dem then",
    ];
    for (const phrase of bad) {
      expect(parseSpokenGrammar(phrase, undefined, phrase, FIXES), phrase).toMatchObject({
        ok: false,
      });
      expect(matchSpokenPatterns(phrase, undefined, phrase, FIXES), phrase).toMatchObject({
        ok: false,
      });
    }
  });

  it("keeps the resume command zero-argument and source-parallel", async () => {
    const expected = {
      type: "RESUME_APPROPRIATE_VFR_ALTITUDES",
    } as const;
    await expect(
      parseCommand("DAL123 resume appropriate VFR altitudes", {
        source: "text",
        pathC: false,
      }),
    ).resolves.toMatchObject({ ok: true, instructions: [expected] });
    await expect(
      parseCommand("resume appropriate VFR altitudes", { source: "voice", pathC: false }),
    ).resolves.toMatchObject({ ok: true, instructions: [expected] });
    await expect(
      parseCommand("resume appropriate VFR altitudes 3000", { source: "voice", pathC: false }),
    ).resolves.toMatchObject({ ok: false });
  });

  it("keeps Path C closed and parity-safe", () => {
    expect(isLegalInstruction({ type: "CLASS_B_CLEARANCE", operation: "TO_ENTER" })).toBe(true);
    expect(
      isLegalInstruction({
        type: "CLASS_B_CLEARANCE",
        operation: "THROUGH",
        route: [{ type: "DIRECT", fixId: "DEM" }],
        altitudeFt: 3000,
      }),
    ).toBe(true);
    expect(isLegalInstruction({ type: "REMAIN_OUTSIDE_BRAVO" })).toBe(true);
    expect(isLegalInstruction({ type: "RESUME_APPROPRIATE_VFR_ALTITUDES" })).toBe(true);
    expect(isLegalInstruction({ type: "RESUME_APPROPRIATE_VFR_ALTITUDES", altitudeFt: 3000 })).toBe(
      false,
    );
    expect(
      schemaCheckPathC({
        ok: true,
        callsignToken: "DAL123",
        instructions: [{ type: "RESUME_APPROPRIATE_VFR_ALTITUDES" }],
      }),
    ).toEqual({
      callsignToken: "DAL123",
      instructions: [{ type: "RESUME_APPROPRIATE_VFR_ALTITUDES" }],
    });
  });

  it("keeps Path C Class B evidence canonical and atomic", () => {
    const clearance = { type: "CLASS_B_CLEARANCE", operation: "TO_ENTER" } as const;
    expect(pathCResultIsComplete("DAL123 clear into bravo airspace", [clearance])).toBe(false);
    expect(pathCResultIsComplete("DAL123 cleared through bravo airspace via", [clearance])).toBe(
      false,
    );
    expect(
      schemaCheckPathC({
        ok: true,
        callsignToken: "DAL123",
        instructions: [clearance, { type: "ALTITUDE", altitudeFt: 4000, verb: "MAINTAIN" }],
      }),
    ).toBeNull();
    expect(
      schemaCheckPathC({
        ok: true,
        callsignToken: "DAL123",
        instructions: [
          { type: "CLASS_B_CLEARANCE_AS_REQUESTED" },
          { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
        ],
      }),
    ).toBeNull();
  });

  it("formats deterministic readbacks without changing flight-rule semantics", () => {
    expect(
      formatReadback({
        callsign: "DAL123",
        instructions: [
          {
            type: "CLASS_B_CLEARANCE",
            operation: "TO_ENTER",
            route: [{ type: "DIRECT", fixId: "DEM" }],
            altitudeFt: 3000,
          },
        ],
        aircraft: { headingDeg: 90, altitudeFt: 2000, wakeCategory: "L" },
      }),
    ).toBe(
      "Delta 123 cleared to enter Bravo airspace via DEM, maintain three thousand (3000) while in Bravo airspace",
    );
    expect(
      formatReadback({
        callsign: "DAL123",
        instructions: [{ type: "REMAIN_OUTSIDE_BRAVO" }],
        aircraft: { headingDeg: 90, altitudeFt: 2000, wakeCategory: "L" },
      }),
    ).toBe("Delta 123 remain outside Bravo airspace");
  });
});
