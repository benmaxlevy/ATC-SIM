import { describe, expect, test } from "vitest";
import { normalizeSpoken } from "../normalizer";
import { matchSpokenPatterns } from "../pattern-matcher";

describe("pattern-matcher", () => {
  function parse(text: string, selected?: string | null) {
    return matchSpokenPatterns(
      normalizeSpoken(text),
      selected,
      text,
      ["SEMAX", "NOBBI", "MERGE"],
      [
        { id: "DEM1", name: "DEMO ONE" },
        { id: "SID1", name: "SID ONE" },
      ],
      [{ id: "ILS27", name: "ILS RWY 27", runway: "27" }],
    );
  }

  test("multi-command transmission", () => {
    const res = parse("DAL123 turn left 20 degrees descend 4000 slow to 210");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.callsignToken).toBe("DAL123");
    expect(res.instructions).toEqual([
      { type: "TURN_DEGREES", direction: "LEFT", degrees: 20 },
      { type: "ALTITUDE", altitudeFt: 4000, verb: "DESCEND" },
      { type: "SPEED", speedKt: 210, verb: "REDUCE" },
    ]);
  });

  test("trailing callsign", () => {
    const res = parse(
      "heading two seven zero descend and maintain three thousand delta one two three",
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.callsignToken).toBe("DAL123");
  });

  test("empty text is a miss", () => {
    const res = parse("");
    expect(res.ok).toBe(false);
  });

  test("direct to a catalog fix", () => {
    const res = parse("DAL123 proceed direct SEMAX");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.instructions.some((i) => i.type === "DIRECT")).toBe(true);
  });
});
