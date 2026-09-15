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

  test("cross fix at and maintain altitude (FAA phraseology)", () => {
    const res = parse("DAL123 cross SEMAX at and maintain three thousand");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.callsignToken).toBe("DAL123");
    expect(res.instructions).toEqual([
      {
        type: "CROSS",
        fixId: "SEMAX",
        altitudeFt: 3000,
        restriction: "AT",
      },
    ]);
  });

  test("cross fix at and maintain flight level", () => {
    const res = parse("DAL123 cross SEMAX at and maintain flight level one niner zero");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.instructions).toEqual([
      {
        type: "CROSS",
        fixId: "SEMAX",
        altitudeFt: 19000,
        restriction: "AT",
      },
    ]);
  });

  test("cross fix at or above / at or below", () => {
    const resAbove = parse("DAL123 cross SEMAX at or above five thousand");
    expect(resAbove.ok).toBe(true);
    if (!resAbove.ok) return;
    expect(resAbove.instructions).toEqual([
      {
        type: "CROSS",
        fixId: "SEMAX",
        altitudeFt: 5000,
        restriction: "AT_OR_ABOVE",
      },
    ]);

    const resBelow = parse("DAL123 cross SEMAX at or below four thousand");
    expect(resBelow.ok).toBe(true);
    if (!resBelow.ok) return;
    expect(resBelow.instructions).toEqual([
      {
        type: "CROSS",
        fixId: "SEMAX",
        altitudeFt: 4000,
        restriction: "AT_OR_BELOW",
      },
    ]);
  });

  test("delete speed restrictions in island parsing", () => {
    const res = parse("DAL123 delete speed restrictions");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.callsignToken).toBe("DAL123");
    expect(res.instructions).toEqual([{ type: "DELETE_SPEED_RESTRICTIONS" }]);
  });

  test("cancel approach clearance is ordered before later vectors", () => {
    const res = parse(
      "DAL123 cancel approach clearance fly heading two seven zero maintain five thousand",
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.instructions).toEqual([
      { type: "CANCEL_APPROACH" },
      { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
      { type: "ALTITUDE", altitudeFt: 5000, verb: "MAINTAIN" },
    ]);
    expect(parse("DAL123 cancel approach").ok).toBe(false);
  });

  test("maintain speed until constraints in island parsing", () => {
    const faf = parse("DAL123 maintain 180 knots until final approach fix");
    expect(faf.ok).toBe(true);
    if (!faf.ok) return;
    expect(faf.instructions).toEqual([
      { type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "FAF" } },
    ]);

    const dme = parse("DAL123 maintain 180 knots until 7 DME");
    expect(dme.ok).toBe(true);
    if (!dme.ok) return;
    expect(dme.instructions).toEqual([
      { type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "DME", distanceNm: 7 } },
    ]);

    const fix = parse("DAL123 maintain 210 knots until MERGE");
    expect(fix.ok).toBe(true);
    if (!fix.ok) return;
    expect(fix.instructions).toEqual([
      { type: "SPEED", speedKt: 210, verb: "MAINTAIN", until: { type: "FIX", fixId: "MERGE" } },
    ]);
  });
});
