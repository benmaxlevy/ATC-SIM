import { describe, expect, test } from "vitest";
import { normalizeSpoken } from "./normalizer";
import { matchSpokenPatterns } from "./pattern-matcher";

describe("pattern-matcher (island parser)", () => {
  const catalogFixes = ["SEMAX", "NOBBI", "MERGE", "BOSOX"];
  const catalogProcedures = [
    { id: "DEM1", name: "DEMO ONE" },
    { id: "SID1", name: "SID ONE" },
  ];
  const catalogApproaches = [
    { id: "ILS27", name: "ILS RWY 27", runway: "27" },
    { id: "ILS27R", name: "ILS RWY 27R", runway: "27R" },
    { id: "ILS09L", name: "ILS RWY 09L", runway: "09L" },
  ];

  function parse(
    text: string,
    opts?: {
      selected?: string | null;
      fixes?: string[];
      procedures?: typeof catalogProcedures;
      approaches?: typeof catalogApproaches;
    },
  ) {
    const normalized = normalizeSpoken(text);
    return matchSpokenPatterns(
      normalized,
      opts?.selected,
      text,
      opts?.fixes ?? catalogFixes,
      opts?.procedures ?? catalogProcedures,
      opts?.approaches ?? catalogApproaches,
    );
  }

  describe("Multi-command transmissions", () => {
    test("DAL123 turn left 20 degrees descend 4000 slow to 210", () => {
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

    test("Delta 123 fly heading 270 climb 5000 speed 250", () => {
      const res = parse("Delta one two three fly heading 270 climb 5000 speed 250");
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("DAL123");
      expect(res.instructions).toEqual([
        { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
        { type: "ALTITUDE", altitudeFt: 5000, verb: "CLIMB" },
        { type: "SPEED", speedKt: 250, verb: "MAINTAIN" },
      ]);
    });

    test("AAL456 turn right heading 090 descend and maintain 3000 expedite slow to 180 knots", () => {
      const res = parse(
        "American four five six turn right heading 090 descend and maintain 3000 expedite slow to 180 knots",
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("AAL456");
      expect(res.instructions).toEqual([
        { type: "FLY_HEADING", headingDeg: 90, turn: "RIGHT" },
        { type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND", expedite: true },
        { type: "SPEED", speedKt: 180, verb: "REDUCE" },
      ]);
    });
  });

  describe("Reordered instructions and trailing callsigns", () => {
    test("heading 270 descend and maintain 3000 delta 123", () => {
      const res = parse(
        "heading two seven zero descend and maintain three thousand delta one two three",
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("DAL123");
      expect(res.instructions).toEqual([
        { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
        { type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" },
      ]);
    });

    test("descend 4000 turn left heading 180 southwest 201", () => {
      const res = parse("descend 4000 turn left heading 180 southwest 201");
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("SWA201");
      expect(res.instructions).toEqual([
        { type: "ALTITUDE", altitudeFt: 4000, verb: "DESCEND" },
        { type: "FLY_HEADING", headingDeg: 180, turn: "LEFT" },
      ]);
    });

    test("slow to 210 heading 090 DAL123", () => {
      const res = parse("slow to 210 heading 090 DAL123");
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("DAL123");
      expect(res.instructions).toEqual([
        { type: "SPEED", speedKt: 210, verb: "REDUCE" },
        { type: "FLY_HEADING", headingDeg: 90, turn: "SHORTEST" },
      ]);
    });

    test("maintain 5000 turn 30 right november 1 2 3 4 alfa", () => {
      const res = parse("maintain 5000 turn 30 right november 1 2 3 4 alfa");
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("N1234A");
      expect(res.instructions).toEqual([
        { type: "ALTITUDE", altitudeFt: 5000, verb: "MAINTAIN" },
        { type: "TURN_DEGREES", direction: "RIGHT", degrees: 30 },
      ]);
    });

    test("callsign in middle: turn right 090 delta 123 descend 3000", () => {
      const res = parse("turn right heading 090 delta 123 descend 3000");
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("DAL123");
      expect(res.instructions).toEqual([
        { type: "FLY_HEADING", headingDeg: 90, turn: "RIGHT" },
        { type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" },
      ]);
    });
  });

  describe("Conversational fillers and noise phrases", () => {
    test("delta 123 uh please turn right heading 090 for traffic", () => {
      const res = parse("delta 123 uh please turn right heading 090 for traffic");
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("DAL123");
      expect(res.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 90, turn: "RIGHT" }]);
    });

    test("good morning delta 123 turn left heading 270 radar contact", () => {
      const res = parse("good morning delta 123 turn left heading 270 radar contact");
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("DAL123");
      expect(res.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }]);
    });

    test("delta 123 roger turn 20 degrees left for sequencing", () => {
      const res = parse("delta 123 roger turn 20 degrees left for sequencing");
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("DAL123");
      expect(res.instructions).toEqual([{ type: "TURN_DEGREES", direction: "LEFT", degrees: 20 }]);
    });
  });

  describe("Fix, navigation, procedure, and cross matching", () => {
    test("proceed direct SEMAX", () => {
      const res = parse("proceed direct SEMAX", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "DIRECT", fixId: "SEMAX" }]);
    });

    test("direct NOBBI", () => {
      const res = parse("direct NOBBI", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "DIRECT", fixId: "NOBBI" }]);
    });

    test("cleared direct SEMAX", () => {
      const res = parse("cleared direct SEMAX", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "DIRECT", fixId: "SEMAX" }]);
    });

    test("direct sierra echo mike alpha x-ray", () => {
      const res = parse("direct sierra echo mike alpha x-ray", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "DIRECT", fixId: "SEMAX" }]);
    });

    test("join DEM1 arrival", () => {
      const res = parse("join DEM1 arrival", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "JOIN_PROCEDURE", procedureId: "DEM1" }]);
    });

    test("join the DEM1", () => {
      const res = parse("join the DEM1", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "JOIN_PROCEDURE", procedureId: "DEM1" }]);
    });

    test("descend via DEM1 arrival", () => {
      const res = parse("descend via DEM1 arrival", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "DESCEND_VIA", procedureId: "DEM1" }]);
    });

    test("climb via SID1 departure", () => {
      const res = parse("climb via SID1 departure", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "CLIMB_VIA", procedureId: "SID1" }]);
    });

    test("cross SEMAX at 3000", () => {
      const res = parse("cross SEMAX at 3000", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([
        { type: "CROSS", fixId: "SEMAX", altitudeFt: 3000, restriction: "AT" },
      ]);
    });

    test("cross NOBBI at or above 5000", () => {
      const res = parse("cross NOBBI at or above 5000", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([
        { type: "CROSS", fixId: "NOBBI", altitudeFt: 5000, restriction: "AT_OR_ABOVE" },
      ]);
    });

    test("cross SEMAX at or below 4000", () => {
      const res = parse("cross SEMAX at or below 4000", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([
        { type: "CROSS", fixId: "SEMAX", altitudeFt: 4000, restriction: "AT_OR_BELOW" },
      ]);
    });
  });

  describe("Approach and utility matching", () => {
    test("cleared ILS runway 27 right", () => {
      const res = parse("cleared ILS runway 27 right", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "CLEARED_APPROACH", approachId: "ILS27R" }]);
    });

    test("cleared ILS approach runway 27", () => {
      const res = parse("cleared ILS approach runway 27", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "CLEARED_APPROACH", approachId: "ILS27" }]);
    });

    test("expect ILS 27", () => {
      const res = parse("expect ILS 27", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "EXPECT_APPROACH", approachId: "ILS27" }]);
    });

    test("intercept runway 27 localizer", () => {
      const res = parse("intercept runway 27 localizer", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "INTERCEPT_LOCALIZER", approachId: "ILS27" }]);
    });

    test("intercept the localizer", () => {
      const res = parse("intercept the localizer", {
        selected: "DAL123",
        approaches: [{ id: "ILS27", name: "ILS RWY 27", runway: "27" }],
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "INTERCEPT_LOCALIZER", approachId: "ILS27" }]);
    });

    test("go around", () => {
      const res = parse("go around", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "GO_AROUND" }]);
    });

    test("squawk ident / ident", () => {
      const res = parse("squawk ident", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "IDENT" }]);
    });

    test("say heading / say altitude", () => {
      const resH = parse("say heading", { selected: "DAL123" });
      expect(resH.ok).toBe(true);
      if (resH.ok) {
        expect(resH.instructions).toEqual([{ type: "SAY_HEADING" }]);
      }

      const resA = parse("say altitude", { selected: "DAL123" });
      expect(resA.ok).toBe(true);
      if (resA.ok) {
        expect(resA.instructions).toEqual([{ type: "SAY_ALTITUDE" }]);
      }
    });
  });

  describe("Heading, Turn, Altitude, and Speed variations", () => {
    test("turn 20 degrees left", () => {
      const res = parse("turn 20 degrees left", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "TURN_DEGREES", direction: "LEFT", degrees: 20 }]);
    });

    test("30 right", () => {
      const res = parse("30 right", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "TURN_DEGREES", direction: "RIGHT", degrees: 30 }]);
    });

    test("turn 30 right", () => {
      const res = parse("turn 30 right", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "TURN_DEGREES", direction: "RIGHT", degrees: 30 }]);
    });

    test("fly heading 180 / present heading", () => {
      const res1 = parse("fly heading 180", { selected: "DAL123" });
      expect(res1.ok).toBe(true);
      if (res1.ok) {
        expect(res1.instructions).toEqual([
          { type: "FLY_HEADING", headingDeg: 180, turn: "SHORTEST" },
        ]);
      }

      const res2 = parse("present heading", { selected: "DAL123" });
      expect(res2.ok).toBe(true);
      if (res2.ok) {
        expect(res2.instructions).toEqual([{ type: "PRESENT_HEADING" }]);
      }
    });

    test("maintain 4000 until established", () => {
      const res = parse("maintain 4000 until established", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([
        { type: "ALTITUDE", altitudeFt: 4000, verb: "MAINTAIN", untilEstablished: true },
      ]);
    });

    test("maintain 3000 until established on the localizer", () => {
      const res = parse("maintain 3000 until established on the localizer", { selected: "DAL123" });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([
        { type: "ALTITUDE", altitudeFt: 3000, verb: "MAINTAIN", untilEstablished: true },
      ]);
    });

    test("climb 5000 expedite / without delay", () => {
      const res1 = parse("climb 5000 expedite", { selected: "DAL123" });
      expect(res1.ok).toBe(true);
      if (res1.ok) {
        expect(res1.instructions).toEqual([
          { type: "ALTITUDE", altitudeFt: 5000, verb: "CLIMB", expedite: true },
        ]);
      }

      const res2 = parse("expedite climb 5000", { selected: "DAL123" });
      expect(res2.ok).toBe(true);
      if (res2.ok) {
        expect(res2.instructions).toEqual([
          { type: "ALTITUDE", altitudeFt: 5000, verb: "CLIMB", expedite: true },
        ]);
      }
    });

    test("maintain 250 knots / slow to 210 / reduce speed 180 knots / increase speed to 250", () => {
      const res1 = parse("maintain 250 knots", { selected: "DAL123" });
      expect(res1.ok).toBe(true);
      if (res1.ok) {
        expect(res1.instructions).toEqual([{ type: "SPEED", speedKt: 250, verb: "MAINTAIN" }]);
      }

      const res2 = parse("slow to 210", { selected: "DAL123" });
      expect(res2.ok).toBe(true);
      if (res2.ok) {
        expect(res2.instructions).toEqual([{ type: "SPEED", speedKt: 210, verb: "REDUCE" }]);
      }

      const res3 = parse("reduce speed 180 knots", { selected: "DAL123" });
      expect(res3.ok).toBe(true);
      if (res3.ok) {
        expect(res3.instructions).toEqual([{ type: "SPEED", speedKt: 180, verb: "REDUCE" }]);
      }

      const res4 = parse("increase speed to 250", { selected: "DAL123" });
      expect(res4.ok).toBe(true);
      if (res4.ok) {
        expect(res4.instructions).toEqual([{ type: "SPEED", speedKt: 250, verb: "INCREASE" }]);
      }
    });
  });

  describe("Overlap prevention and edge cases", () => {
    test("empty text returns empty error", () => {
      const res = parse("");
      expect(res.ok).toBe(false);
    });

    test("unknown telephony returns unknown telephony error", () => {
      const res = parse("foobarairline 123 turn left heading 270");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("unknown_telephony");
      }
    });

    test("unparsed command keyword causes miss", () => {
      const res = parse("turn foobar 123 maintain 5000", { selected: "DAL123" });
      expect(res.ok).toBe(false);
    });
  });
});
