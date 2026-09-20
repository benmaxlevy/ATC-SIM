import { describe, expect, it, vi } from "vitest";
import { parseCommand } from "../parse-command";
import { parseRadioText } from "../parseRadioText";
import { parseSpokenGrammar } from "../spoken/grammar";
import { matchSpokenPatterns } from "../spoken/pattern-matcher";
import {
  isLegalInstruction,
  pathCResultIsComplete,
  schemaCheckPathC,
  type ParsePathCFn,
} from "../path-c";
import { INSTRUCTION_TYPES, type Instruction } from "../../core/command/types";
import { formatReadback } from "../../pilot/readback";

const tower: Instruction = { type: "CONTACT_TOWER", facilityName: "ATLANTA" };
const center: Instruction = { type: "CONTACT_CENTER", facilityName: "ATLANTA" };

describe("CONTACT tower/center Command IR parity", () => {
  it("registers both closed-union types", () => {
    expect(INSTRUCTION_TYPES).toContain("CONTACT_TOWER");
    expect(INSTRUCTION_TYPES).toContain("CONTACT_CENTER");
  });

  it.each([
    ["DAL123 CONTACT ATLANTA TOWER", tower],
    ["DAL123 CONTACT ATLANTA CENTER", center],
    [
      "CONTACT NEW YORK APPROACH TOWER",
      { type: "CONTACT_TOWER", facilityName: "NEW YORK APPROACH" },
    ],
  ])("parses typed %s", (text, expected) => {
    const result = parseRadioText(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.instructions).toEqual([expected]);
  });

  it.each([
    ["delta one two three contact atlanta tower", tower],
    ["delta one two three contact atlanta center", center],
  ])("parses Path A and Path B %s", (text, expected) => {
    const raw = text.replace("delta one two three", "Delta 123");
    const a = parseSpokenGrammar(text, undefined, raw);
    const b = matchSpokenPatterns(text, undefined, raw);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok) expect(a.instructions).toEqual([expected]);
    if (b.ok) expect(b.instructions).toEqual([expected]);
  });

  it("rejects incomplete, frequency, and bundled typed forms", () => {
    for (const text of [
      "DAL123 CONTACT TOWER",
      "DAL123 CONTACT ATLANTA",
      "DAL123 CONTACT ATLANTA TOWER 118.5",
      "DAL123 CONTACT ATLANTA TOWER SQ 1200",
    ]) {
      expect(parseRadioText(text).ok, text).toBe(false);
    }
  });

  it("keeps Path C closed, canonical, and atomic", () => {
    expect(isLegalInstruction(tower)).toBe(true);
    expect(isLegalInstruction({ type: "CONTACT_TOWER", facilityName: "A B C D E" })).toBe(false);
    expect(
      isLegalInstruction({ type: "CONTACT_TOWER", facilityName: "ATLANTA", frequency: "118.5" }),
    ).toBe(false);
    expect(
      schemaCheckPathC({
        ok: true,
        callsignToken: "DAL123",
        instructions: [{ type: "CONTACT_TOWER", facilityName: "atlanta" }],
      }),
    ).toEqual({
      callsignToken: "DAL123",
      instructions: [tower],
    });
    expect(pathCResultIsComplete("DAL123 contact Atlanta tower", [tower])).toBe(true);
    expect(pathCResultIsComplete("DAL123 contact Atlanta tower 118.5", [tower])).toBe(false);
    expect(pathCResultIsComplete("DAL123 contact Atlanta tower", [center])).toBe(false);
  });

  it("rejects a Path C frequency suffix", async () => {
    const parsePathC = vi.fn<ParsePathCFn>(async () => ({
      callsignToken: "DAL123",
      instructions: [{ type: "CONTACT_CENTER", facilityName: "ATLANTA" }],
    }));
    const result = await parseCommand("DAL123 contact Atlanta center 118.5", {
      source: "voice",
      callsigns: ["DAL123"],
      pathC: true,
      parsePathC,
    });
    expect(parsePathC).toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it("uses deterministic no-frequency readback", () => {
    expect(
      formatReadback({
        callsign: "DAL123",
        instructions: [tower],
        aircraft: { headingDeg: 0, altitudeFt: 0 },
      }),
    ).toBe("Delta 123 contact atlanta tower");
    expect(
      formatReadback({
        callsign: "DAL123",
        instructions: [center],
        aircraft: { headingDeg: 0, altitudeFt: 0 },
      }),
    ).toBe("Delta 123 contact atlanta center");
  });
});
