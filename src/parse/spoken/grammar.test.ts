/**
 * Path A fixtures follow JO 7110.65 English (R01: descend and maintain,
 * turn left heading). Path B is documented nonstandard salvage, not 7110.65.
 */
import { expect, test } from "vitest";
import { PARSE_ERROR } from "../tokens";
import { parseSpokenGrammar } from "./grammar";
import { normalizeSpoken } from "./normalizer";
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

test("Path B rewrite is nonstandard salvage for bare heading", () => {
  expect(rewriteSpokenToTyped(normalizeSpoken("heading two seven zero"))).toBe("H270");
  expect(rewriteSpokenToTyped(normalizeSpoken("two seven zero"))).toBeNull();
});

function expectOk(text: string, selected: string, instructions: unknown[]): void {
  const result = spoken(text, selected);
  expect(result.ok, text).toBe(true);
  if (result.ok) {
    expect(result.instructions).toEqual(instructions);
  }
}
