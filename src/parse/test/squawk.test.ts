import { describe, expect, it } from "vitest";
import { parseCommand, parseRadioText } from "@parse";

describe("T02-176 squawk parsing", () => {
  it.each([
    ["DAL123 SQ 4721", { type: "ASSIGN_SQUAWK", code: "4721", source: "DISCRETE" }],
    ["SQ 0342", { type: "ASSIGN_SQUAWK", code: "0342", source: "DISCRETE" }],
    ["DAL123 SQ VFR", { type: "ASSIGN_SQUAWK", code: "1200", source: "VFR" }],
  ])("parses %s as an exact IR", (text, instruction) => {
    expect(parseRadioText(text)).toMatchObject({ ok: true, instructions: [instruction] });
  });

  it.each(["SQ 1289", "SQ 472", "SQ 47210", "SQ", "SQ VFR 4721"])(
    "rejects malformed typed form %s",
    (text) => {
      expect(parseRadioText(text)).toMatchObject({ ok: false });
    },
  );

  it.each([
    ["squawk four seven two one", "4721", "DISCRETE"],
    ["squawk zero three four two", "0342", "DISCRETE"],
    ["squawk VFR", "1200", "VFR"],
  ])("spoken %s shares the assignment shape", async (text, code, source) => {
    const result = await parseCommand(text, { source: "voice", pathC: false });
    expect(result).toMatchObject({
      ok: true,
      instructions: [{ type: "ASSIGN_SQUAWK", code, source }],
    });
  });
});
