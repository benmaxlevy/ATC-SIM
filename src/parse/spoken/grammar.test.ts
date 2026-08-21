/**
 * Path A fixtures follow JO 7110.65 English (R01: descend and maintain,
 * turn left heading). Path B is documented nonstandard salvage, not 7110.65.
 */
import { expect, test } from "vitest";
import { PARSE_ERROR } from "../tokens";
import { parseSpokenGrammar } from "./grammar";
import { normalizeSpoken } from "./normalizer";
import { groundCallsignToRoster } from "./telephony";
import { rewriteSpokenToTyped } from "./typed-fuzzy";

function spoken(text: string, selected?: string | null) {
  return parseSpokenGrammar(normalizeSpoken(text), selected ?? null, text);
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
    expect(zeroNiner.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 90, turn: "RIGHT" }]);
  }
  expect(spoken("turn right heading 90", "DAL123").ok).toBe(false);
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
  expectOk("proceed direct kdem", "DAL123", [{ type: "DIRECT", fixId: "KDEM" }]);
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
  expect(groundCallsignToRoster(null, normalizeSpoken("giblet 204 iden"), ["DAL123", "JBU17"])).toBeNull();
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

function expectOk(text: string, selected: string, instructions: unknown[]): void {
  const result = spoken(text, selected);
  expect(result.ok, text).toBe(true);
  if (result.ok) {
    expect(result.instructions).toEqual(instructions);
  }
}
