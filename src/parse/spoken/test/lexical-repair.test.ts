import { describe, expect, test } from "vitest";
import { parseCommand } from "../../parse-command";
import { normalizeSpoken } from "../normalizer";
import { repairSpokenLexemes } from "../lexical-repair";

describe("catalog-aware ASR lexical repair", () => {
  test.each([
    [
      "never eleven fifty five climber maintain flight level one eight zero",
      "never eleven fifty five climb maintain flight level one eight zero",
    ],
    [
      "united eighty four thirty one interceptor there on a two six right localizer",
      "united eighty four thirty one intercept there on a two six right localizer",
    ],
    ["descend by the arrival", "descend via the arrival"],
  ])("repairs only the recognized phrase: %s", (raw, expected) => {
    expect(repairSpokenLexemes(normalizeSpoken(raw))).toBe(expected);
  });

  test("HAR carrier corruption is repaired only in a callsign slot", () => {
    expect(repairSpokenLexemes("chine seven nine zero eight maintain two thousand")).toBe(
      "giant seven nine zero eight maintain two thousand",
    );
    expect(repairSpokenLexemes("try five hundred knots")).toBe("giant five hundred knots");
    expect(repairSpokenLexemes("turn try heading two seven zero")).toBe(
      "turn try heading two seven zero",
    );
  });

  test("HAR-derived phrase parses without changing numeric values", async () => {
    const result = await parseCommand(
      "united eighty four thirty one interceptor runway two six right localizer",
      {
        source: "voice",
        callsigns: ["UAL8431"],
        approaches: [{ id: "I26R", runway: "26R", type: "ILS" }],
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.instructions).toEqual([{ type: "INTERCEPT_LOCALIZER", approachId: "I26R" }]);
  });

  test("does not rewrite numbers or a catalog identifier named CLIMBER", async () => {
    expect(repairSpokenLexemes("direct climber maintain two one zero knots")).toBe(
      "direct climber maintain two one zero knots",
    );
    const result = await parseCommand("DAL123 proceed direct CLIMBER", {
      source: "text",
      fixes: ["CLIMBER"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.instructions).toEqual([{ type: "DIRECT", fixId: "CLIMBER" }]);
  });
});
