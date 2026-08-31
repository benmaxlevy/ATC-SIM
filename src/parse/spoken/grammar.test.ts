/**
 * Path A fixtures follow JO 7110.65 English (R01: descend and maintain,
 * turn left heading). Path B is documented nonstandard salvage, not 7110.65.
 */
import { expect, test } from "vitest";
import { PARSE_ERROR } from "../tokens";
import type { CatalogProcedure } from "./catalog-ground";
import { parseSpokenGrammar } from "./grammar";
import { normalizeSpoken } from "./normalizer";
import { groundCallsignToRoster } from "./telephony";
import { rewriteSpokenToTyped } from "./typed-fuzzy";

function spoken(
  text: string,
  selected?: string | null,
  catalog?: readonly string[],
  procedures?: readonly CatalogProcedure[],
) {
  return parseSpokenGrammar(normalizeSpoken(text), selected ?? null, text, catalog, procedures);
}

test("AC1 fixture — Delta one two three descend and maintain three thousand (R01)", () => {
  const result = spoken("Delta one two three descend and maintain three thousand");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("DAL123");
  expect(result.instructions).toEqual([{ type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }]);
});

test("AC2 fixture — turn left heading two seven zero uses selection (R01)", () => {
  const result = spoken("turn left heading two seven zero", "DAL123");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("DAL123");
  expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }]);
});

test("AC3 fixture — combined heading then altitude, one callsign (R01)", () => {
  const result = spoken(
    "Delta one two three turn left heading two seven zero descend and maintain three thousand",
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("DAL123");
  expect(result.instructions).toEqual([
    { type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" },
    { type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" },
  ]);
});

test("Path A does not parse bare heading (that is Path B salvage)", () => {
  const result = spoken("heading two seven zero", "DAL123");
  expect(result.ok).toBe(false);
});

test("niner/tree and one one thousand", () => {
  const heading = spoken("fly heading two niner zero", "DAL123");
  expect(heading.ok).toBe(true);
  if (heading.ok) {
    expect(heading.instructions).toEqual([
      { type: "FLY_HEADING", headingDeg: 290, turn: "SHORTEST" },
    ]);
  }
  const alt = spoken("climb and maintain one one thousand", "DAL123");
  expect(alt.ok).toBe(true);
  if (alt.ok) {
    expect(alt.instructions).toEqual([{ type: "ALTITUDE", altitudeFt: 11000, verb: "CLIMB" }]);
  }
});

test("three six zero heading stores 0", () => {
  const result = spoken("fly heading three six zero", "DAL123");
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 0, turn: "SHORTEST" }]);
  }
});

test("ASR compact heading 270/360/090 is FLY_HEADING not TURN_DEGREES (R01)", () => {
  const left = spoken("Southwest 203 turn left heading 270.");
  expect(left.ok).toBe(true);
  if (left.ok) {
    expect(left.callsignToken).toBe("SWA203");
    expect(left.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }]);
  }
  const north = spoken("fly heading 360", "DAL123");
  expect(north.ok).toBe(true);
  if (north.ok) {
    expect(north.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 0, turn: "SHORTEST" }]);
  }
  const zeroNiner = spoken("turn right heading 090", "DAL123");
  expect(zeroNiner.ok).toBe(true);
  if (zeroNiner.ok) {
    expect(zeroNiner.instructions).toEqual([
      { type: "FLY_HEADING", headingDeg: 90, turn: "RIGHT" },
    ]);
  }
  expect(spoken("turn right heading 90", "DAL123").ok).toBe(false);
});

test("ASR leftening is not Path A; fused heading is Path C salvage", () => {
  const result = spoken(
    "Delta one twenty three, turn leftening one five zero, maintain five thousand, maintain two one zero knots.",
  );
  expect(result.ok).toBe(false);
});

test("turn left twenty degrees stays TURN_DEGREES when degrees is spoken", () => {
  const result = spoken("turn left twenty degrees", "DAL123");
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.instructions).toEqual([{ type: "TURN_DEGREES", direction: "LEFT", degrees: 20 }]);
  }
});

test("fly present heading is PRESENT_HEADING (R01)", () => {
  expectOk("fly present heading", "DAL123", [{ type: "PRESENT_HEADING" }]);
  expectOk("maintain present heading", "DAL123", [{ type: "PRESENT_HEADING" }]);
});

test("unknown telephony misses without guessing ICAO", () => {
  const result = spoken("Blargh one two three fly heading two seven zero");
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toContain(PARSE_ERROR.UNKNOWN_TELEPHONY);
  }
});

test("v1 phrase table: present heading, turn degrees, speed, ident, say, ils", () => {
  expectOk("continue present heading", "DAL123", [{ type: "PRESENT_HEADING" }]);
  expectOk("turn left twenty degrees", "DAL123", [
    { type: "TURN_DEGREES", direction: "LEFT", degrees: 20 },
  ]);
  expectOk("maintain two one zero knots", "DAL123", [
    { type: "SPEED", speedKt: 210, verb: "MAINTAIN" },
  ]);
  expectOk("reduce speed to two zero zero", "DAL123", [
    { type: "SPEED", speedKt: 200, verb: "REDUCE" },
  ]);
  expectOk("ident", "DAL123", [{ type: "IDENT" }]);
  expectOk("say heading", "DAL123", [{ type: "SAY_HEADING" }]);
  expectOk("say altitude", "DAL123", [{ type: "SAY_ALTITUDE" }]);
  expectOk("cleared ils runway two seven approach", "DAL123", [
    { type: "CLEARED_APPROACH", approachId: "ILS27" },
  ]);
  expectOk("cleared ils approach runway two seven", "DAL123", [
    { type: "CLEARED_APPROACH", approachId: "ILS27" },
  ]);
  expectOk("proceed direct kdem", "DAL123", [{ type: "DIRECT", fixId: "KDEM" }]);
  expectOk("direct semax", "DAL123", [{ type: "DIRECT", fixId: "SEMAX" }]);
  expectOk("intercept the runway two seven localizer", "DAL123", [
    { type: "INTERCEPT_LOCALIZER", approachId: "ILS27" },
  ]);
  expectOk("intercept runway two seven localizer", "DAL123", [
    { type: "INTERCEPT_LOCALIZER", approachId: "ILS27" },
  ]);
  expectOk("intercept the localizer runway two seven", "DAL123", [
    { type: "INTERCEPT_LOCALIZER", approachId: "ILS27" },
  ]);
});

test("T04-05 Path A — combined ILS vector until established (R01)", () => {
  const canonical =
    "turn right heading two four zero maintain two thousand until established cleared ils approach runway two seven";
  const withLoc =
    "turn right heading two four zero maintain two thousand until established on the localizer cleared ils runway two seven approach";
  const expected: unknown[] = [
    { type: "FLY_HEADING", headingDeg: 240, turn: "RIGHT" },
    { type: "ALTITUDE", altitudeFt: 2000, verb: "MAINTAIN", untilEstablished: true },
    { type: "CLEARED_APPROACH", approachId: "ILS27" },
  ];
  expectOk(canonical, "DAL123", expected);
  expectOk(withLoc, "DAL123", expected);
});

test("expedite attaches to climb/descend", () => {
  const result = spoken("descend and maintain three thousand expedite", "DAL123");
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.instructions).toEqual([
      { type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND", expedite: true },
    ]);
  }
});

test("ASR compact callsign and altitude: Southwest 203 / 5,000 / without delay", () => {
  const result = spoken("Southwest 203 descend and maintain 5,000 without delay.");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("SWA203");
  expect(result.instructions).toEqual([
    { type: "ALTITUDE", altitudeFt: 5000, verb: "DESCEND", expedite: true },
  ]);
});

test("ASR glued telephony American201 is AAL201", () => {
  const result = spoken("American201 ident");
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("AAL201");
  expect(result.instructions).toEqual([{ type: "IDENT" }]);
});

test("ASR iden is IDENT", () => {
  const result = spoken("iden", "DAL123");
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.instructions).toEqual([{ type: "IDENT" }]);
  }
});

test("giblet 204 snaps to unique roster suffix SWA204", () => {
  expect(
    groundCallsignToRoster(null, normalizeSpoken("giblet 204 iden"), ["DAL123", "SWA204", "JBU17"]),
  ).toBe("SWA204");
  expect(
    groundCallsignToRoster(null, normalizeSpoken("giblet 204 iden"), ["DAL123", "JBU17"]),
  ).toBeNull();
});

test("digit-by-digit flight number still wins over compact grouping", () => {
  const result = spoken("Southwest two zero three descend and maintain five thousand");
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.callsignToken).toBe("SWA203");
    expect(result.instructions).toEqual([{ type: "ALTITUDE", altitudeFt: 5000, verb: "DESCEND" }]);
  }
});

test("Path B rewrite is nonstandard salvage for bare heading", () => {
  expect(rewriteSpokenToTyped(normalizeSpoken("heading two seven zero"))).toBe("H270");
  expect(rewriteSpokenToTyped(normalizeSpoken("heading 270"))).toBe("H270");
  expect(rewriteSpokenToTyped(normalizeSpoken("two seven zero"))).toBeNull();
});

test("catalog grounding maps ASR C-Max / see max onto SEMAX", () => {
  const catalog = ["NEMAX", "SEMAX", "MERGE", "FI27"];
  const hyphen = spoken("proceed direct C-Max", "DAL123", catalog);
  expect(hyphen.ok).toBe(true);
  if (hyphen.ok) {
    expect(hyphen.instructions).toEqual([{ type: "DIRECT", fixId: "SEMAX" }]);
  }
  const split = spoken("direct c max", "DAL123", catalog);
  expect(split.ok).toBe(true);
  if (split.ok) {
    expect(split.instructions).toEqual([{ type: "DIRECT", fixId: "SEMAX" }]);
  }
  const see = spoken("proceed direct to see max", "DAL123", catalog);
  expect(see.ok).toBe(true);
  if (see.ok) {
    expect(see.instructions).toEqual([{ type: "DIRECT", fixId: "SEMAX" }]);
  }
});

test("catalog glue uses reserved join: S Join / N Join are SJOIN / NJOIN", () => {
  const catalog = ["SEMAX", "SJOIN", "NJOIN", "NELBO", "MERGE"];
  const south = spoken("direct s join", "DAL123", catalog);
  expect(south.ok).toBe(true);
  if (south.ok) {
    expect(south.instructions).toEqual([{ type: "DIRECT", fixId: "SJOIN" }]);
  }
  const north = spoken("proceed direct to n join", "DAL123", catalog);
  expect(north.ok).toBe(true);
  if (north.ok) {
    expect(north.instructions).toEqual([{ type: "DIRECT", fixId: "NJOIN" }]);
  }
  const thenJoin = spoken("proceed direct s join then join demo one", "DAL123", catalog, [
    { id: "DEM1", name: "DEMO ONE" },
  ]);
  expect(thenJoin.ok).toBe(true);
  if (thenJoin.ok) {
    expect(thenJoin.instructions).toEqual([
      { type: "DIRECT", fixId: "SJOIN" },
      { type: "JOIN_PROCEDURE", procedureId: "DEM1" },
    ]);
  }
});

test("join the demo one arrival is JOIN_PROCEDURE; then-join after direct", () => {
  const procedures = [{ id: "DEM1", name: "DEMO ONE" }];
  const joinOnly = spoken("join the demo one arrival", "DAL123", undefined, procedures);
  expect(joinOnly.ok).toBe(true);
  if (joinOnly.ok) {
    expect(joinOnly.instructions).toEqual([{ type: "JOIN_PROCEDURE", procedureId: "DEM1" }]);
  }
  const combined = spoken(
    "proceed direct nelbo then join demo one",
    "DAL123",
    ["NELBO"],
    procedures,
  );
  expect(combined.ok).toBe(true);
  if (combined.ok) {
    expect(combined.instructions).toEqual([
      { type: "DIRECT", fixId: "NELBO" },
      { type: "JOIN_PROCEDURE", procedureId: "DEM1" },
    ]);
  }
});

test("descend via demo 1 snaps onto catalog DEM1", () => {
  const procedures = [{ id: "DEM1", name: "DEMO ONE" }];
  const compact = spoken("descend via demo 1", "DAL123", undefined, procedures);
  expect(compact.ok).toBe(true);
  if (compact.ok) {
    expect(compact.instructions).toEqual([{ type: "DESCEND_VIA", procedureId: "DEM1" }]);
  }
  const words = spoken("descend via demo one", "DAL123", undefined, procedures);
  expect(words.ok).toBe(true);
  if (words.ok) {
    expect(words.instructions).toEqual([{ type: "DESCEND_VIA", procedureId: "DEM1" }]);
  }
  const viaOnly = spoken("via the demo one arrival", "DAL123", undefined, procedures);
  expect(viaOnly.ok).toBe(true);
  if (viaOnly.ok) {
    expect(viaOnly.instructions).toEqual([{ type: "DESCEND_VIA", procedureId: "DEM1" }]);
  }
});

test("descend via SYN ONE north / runway niner transition normalizes catalog transition ids", () => {
  const procedures = [
    {
      id: "SYN1",
      name: "SYN ONE",
      transitions: [
        { id: "N", name: "NORTH" },
        { id: "S", name: "SOUTH" },
        { id: "RW09", name: "RUNWAY NINE", runwayId: "09" },
      ],
    },
  ];
  const bare = spoken("descend via syn one", "DAL123", undefined, procedures);
  expect(bare.ok).toBe(true);
  if (bare.ok) {
    expect(bare.instructions).toEqual([{ type: "DESCEND_VIA", procedureId: "SYN1" }]);
  }
  const north = spoken("descend via SYN ONE, north transition", "DAL123", undefined, procedures);
  expect(north.ok).toBe(true);
  if (north.ok) {
    expect(north.instructions).toEqual([
      { type: "DESCEND_VIA", procedureId: "SYN1", transitionId: "N" },
    ]);
  }
  const rwy = spoken(
    "descend via SYN ONE, runway niner transition",
    "DAL123",
    undefined,
    procedures,
  );
  expect(rwy.ok).toBe(true);
  if (rwy.ok) {
    expect(rwy.instructions).toEqual([
      { type: "DESCEND_VIA", procedureId: "SYN1", transitionId: "RW09" },
    ]);
  }
  const join = spoken("join the syn one arrival north transition", "DAL123", undefined, procedures);
  expect(join.ok).toBe(true);
  if (join.ok) {
    expect(join.instructions).toEqual([
      { type: "JOIN_PROCEDURE", procedureId: "SYN1", transitionId: "N" },
    ]);
  }
});

test("climb via BAY ONE NORMA transition normalizes catalog transition id", () => {
  const procedures = [
    {
      id: "BAY1",
      name: "BAY ONE DEPARTURE",
      transitions: [
        { id: "NORMA", name: "NORMA" },
        { id: "OCTTA", name: "OCTTA" },
      ],
    },
  ];
  const bare = spoken("climb via bay one", "DAL123", undefined, procedures);
  expect(bare.ok).toBe(true);
  if (bare.ok) {
    expect(bare.instructions).toEqual([{ type: "CLIMB_VIA", procedureId: "BAY1" }]);
  }
  const named = spoken("climb via BAY ONE, NORMA transition", "DAL123", undefined, procedures);
  expect(named.ok).toBe(true);
  if (named.ok) {
    expect(named.instructions).toEqual([
      { type: "CLIMB_VIA", procedureId: "BAY1", transitionId: "NORMA" },
    ]);
  }
});

test("go around and going around are GO_AROUND (T04-07)", () => {
  expectOk("go around", "DAL123", [{ type: "GO_AROUND" }]);
  expectOk("going around", "DAL123", [{ type: "GO_AROUND" }]);
  expect(rewriteSpokenToTyped(normalizeSpoken("go around"))).toBe("GA");
});

test("grouped flight numbers resolve correctly in Path A", () => {
  const dal = spoken("Delta one twenty three descend and maintain three thousand");
  expect(dal.ok).toBe(true);
  if (dal.ok) {
    expect(dal.callsignToken).toBe("DAL123");
    expect(dal.instructions).toEqual([{ type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }]);
  }

  const spirit = spoken("Spirit three ten turn left heading two seven zero");
  expect(spirit.ok).toBe(true);
  if (spirit.ok) {
    expect(spirit.callsignToken).toBe("NKS310");
    expect(spirit.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }]);
  }

  const swa = spoken("Southwest twenty zero three fly heading 360");
  expect(swa.ok).toBe(true);
  if (swa.ok) {
    expect(swa.callsignToken).toBe("SWA2003");
    expect(swa.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 0, turn: "SHORTEST" }]);
  }

  const dal300 = spoken("Delta three hundred climb and maintain 5000");
  expect(dal300.ok).toBe(true);
  if (dal300.ok) {
    expect(dal300.callsignToken).toBe("DAL300");
    expect(dal300.instructions).toEqual([{ type: "ALTITUDE", altitudeFt: 5000, verb: "CLIMB" }]);
  }
});

test("PTAC position advisory phraseology is tolerated as context", () => {
  const ptac1 = spoken(
    "Delta 123, you are six miles from the airport. Maintain 3000 until established on the localizer cleared ILS runway 27 approach.",
  );
  expect(ptac1.ok).toBe(true);
  if (ptac1.ok) {
    expect(ptac1.callsignToken).toBe("DAL123");
    expect(ptac1.instructions).toEqual([
      { type: "ALTITUDE", altitudeFt: 3000, verb: "MAINTAIN", untilEstablished: true },
      { type: "CLEARED_APPROACH", approachId: "ILS27" },
    ]);
  }

  const ptacTill = spoken(
    "Spirit 310 10 miles from the airport maintain 5000 till established on the localizer cleared ILS runway 27 approach.",
  );
  expect(ptacTill.ok).toBe(true);
  if (ptacTill.ok) {
    expect(ptacTill.callsignToken).toBe("NKS310");
    expect(ptacTill.instructions).toEqual([
      { type: "ALTITUDE", altitudeFt: 5000, verb: "MAINTAIN", untilEstablished: true },
      { type: "CLEARED_APPROACH", approachId: "ILS27" },
    ]);
  }

  const hyphenatedCallsign = spoken(
    "American forty-five you are one five miles from merge maintain four thousand until established on the localizer cleared ILS runway two seven approach",
    undefined,
    ["MERGE"],
  );
  expect(hyphenatedCallsign.ok).toBe(true);
  if (hyphenatedCallsign.ok) {
    expect(hyphenatedCallsign.callsignToken).toBe("AAL45");
    expect(hyphenatedCallsign.instructions).toEqual([
      { type: "ALTITUDE", altitudeFt: 4000, verb: "MAINTAIN", untilEstablished: true },
      { type: "CLEARED_APPROACH", approachId: "ILS27" },
    ]);
  }

  const ptac2 = spoken(
    "Delta one two three 6 miles from MERGE turn right heading 240 maintain 2000 until established cleared ils approach runway 27",
    undefined,
    ["MERGE"],
  );
  expect(ptac2.ok).toBe(true);
  if (ptac2.ok) {
    expect(ptac2.callsignToken).toBe("DAL123");
    expect(ptac2.instructions).toEqual([
      { type: "FLY_HEADING", headingDeg: 240, turn: "RIGHT" },
      { type: "ALTITUDE", altitudeFt: 2000, verb: "MAINTAIN", untilEstablished: true },
      { type: "CLEARED_APPROACH", approachId: "ILS27" },
    ]);
  }

  const ptac3 = spoken(
    "Spirit 310 you are eight miles north of the field intercept runway two seven localizer",
  );
  expect(ptac3.ok).toBe(true);
  if (ptac3.ok) {
    expect(ptac3.callsignToken).toBe("NKS310");
    expect(ptac3.instructions).toEqual([{ type: "INTERCEPT_LOCALIZER", approachId: "ILS27" }]);
  }
});

function expectOk(text: string, selected: string, instructions: unknown[]): void {
  const result = spoken(text, selected);
  expect(result.ok, text).toBe(true);
  if (result.ok) {
    expect(result.instructions).toEqual(instructions);
  }
}
