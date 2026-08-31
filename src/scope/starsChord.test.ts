import { expect, test } from "vitest";
import {
  STARS_CHORD_NM_MAX,
  STARS_CHORD_NM_MIN,
  parseStarsChord,
  type StarsChordAction,
  type StarsChordResult,
} from "./starsChord";

function action(expected: StarsChordAction): StarsChordResult {
  return { kind: "action", action: expected };
}

test("table-driven STARS TPA/ATPA chords", () => {
  const table: { buffer: string; result: StarsChordResult }[] = [
    { buffer: "*", result: { kind: "incomplete" } },
    { buffer: "*J3", result: action({ type: "jRing", target: "slewed", radiusNm: 3 }) },
    { buffer: "**J", result: action({ type: "jRingClear", target: "all" }) },
    { buffer: "*P2.5", result: action({ type: "cone", target: "slewed", lengthNm: 2.5 }) },
    { buffer: "*AE", result: action({ type: "atpaWarningAlert", mode: "enable" }) },
    { buffer: "*T", result: { kind: "invalid", reason: "unknown * chord" } },
  ];
  for (const row of table) {
    expect(parseStarsChord(row.buffer), row.buffer).toEqual(row.result);
  }
});

test("*P0.5 and 31 NM are invalid; 1–30 inclusive", () => {
  expect(STARS_CHORD_NM_MIN).toBe(1);
  expect(STARS_CHORD_NM_MAX).toBe(30);
  expect(parseStarsChord("*P0.5").kind).toBe("invalid");
  expect(parseStarsChord("*J31").kind).toBe("invalid");
  expect(parseStarsChord("*J1").kind).toBe("action");
  expect(parseStarsChord("*J30").kind).toBe("action");
});
