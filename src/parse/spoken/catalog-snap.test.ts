import { expect, test } from "vitest";
import {
  SNAP_SCORE_FLOOR as PARSE_SNAP_SCORE_FLOOR,
  SNAP_SCORE_MARGIN as PARSE_SNAP_SCORE_MARGIN,
  snapFix as parseSnapFix,
} from "@parse";
import {
  SNAP_SCORE_FLOOR,
  SNAP_SCORE_MARGIN,
  snapFix,
  type RankedCatalogHit,
} from "./catalog-snap";

test("AC7 — SNAP_SCORE_FLOOR and SNAP_SCORE_MARGIN are the frozen T03-17 values", () => {
  expect(SNAP_SCORE_FLOOR).toBe(0.8);
  expect(SNAP_SCORE_MARGIN).toBe(0.05);
  expect(PARSE_SNAP_SCORE_FLOOR).toBe(SNAP_SCORE_FLOOR);
  expect(PARSE_SNAP_SCORE_MARGIN).toBe(SNAP_SCORE_MARGIN);
  expect(parseSnapFix).toBe(snapFix);
});

test("AC1 — Haynes unique above floor with margin snaps to HAINZ", () => {
  const ranked: RankedCatalogHit[] = [
    { id: "HAINZ", score: SNAP_SCORE_FLOOR + SNAP_SCORE_MARGIN },
    { id: "NEMAX", score: SNAP_SCORE_FLOOR },
    { id: "SEMAX", score: 0.5 },
  ];
  expect(snapFix("Haynes", ranked)).toEqual({ kind: "snap", id: "HAINZ" });
  expect(snapFix("HAYNES", ranked)).toEqual({ kind: "snap", id: "HAINZ" });
});

test("AC1 — sole candidate above floor snaps even when the numeric gap is small", () => {
  const ranked: RankedCatalogHit[] = [
    { id: "HAINZ", score: SNAP_SCORE_FLOOR },
    { id: "NEMAX", score: SNAP_SCORE_FLOOR - 0.01 },
  ];
  expect(snapFix("Haynes", ranked)).toEqual({ kind: "snap", id: "HAINZ" });
});

test("AC2 — equal scores above floor are a tie and do not snap", () => {
  const ranked: RankedCatalogHit[] = [
    { id: "HAINZ", score: SNAP_SCORE_FLOOR + 0.1 },
    { id: "HAYNZ", score: SNAP_SCORE_FLOOR + 0.1 },
  ];
  expect(snapFix("Haynes", ranked)).toEqual({ kind: "tie", ids: ["HAINZ", "HAYNZ"] });
  expect(snapFix("Haynes", ranked, new Set())).toEqual({ kind: "tie", ids: ["HAINZ", "HAYNZ"] });
});

test("AC2 — 0.91 vs 0.89 is a tie under SNAP_SCORE_MARGIN", () => {
  expect(0.91 - 0.89).toBeLessThan(SNAP_SCORE_MARGIN);
  expect(0.91).toBeGreaterThanOrEqual(SNAP_SCORE_FLOOR);
  expect(0.89).toBeGreaterThanOrEqual(SNAP_SCORE_FLOOR);
  expect(
    snapFix("Haynes", [
      { id: "HAINZ", score: 0.91 },
      { id: "HAYNZ", score: 0.89 },
    ]),
  ).toEqual({ kind: "tie", ids: ["HAINZ", "HAYNZ"] });
});

test("AC3 — best below floor is weak; do not snap the least-bad id", () => {
  expect(snapFix("NOPE", [{ id: "NEMAX", score: SNAP_SCORE_FLOOR - 0.01 }])).toEqual({
    kind: "weak",
  });
  expect(
    snapFix("AL", [
      { id: "ALBEE", score: 0.62 },
      { id: "ALBON", score: 0.61 },
      { id: "ALTAR", score: 0.6 },
    ]),
  ).toEqual({ kind: "weak" });
});

test("empty ranked or tiny token is none", () => {
  expect(snapFix("Haynes", [])).toEqual({ kind: "none" });
  expect(snapFix("x", [{ id: "HAINZ", score: 1 }])).toEqual({ kind: "none" });
  expect(snapFix("", [{ id: "HAINZ", score: 1 }])).toEqual({ kind: "none" });
});

test("AL-like short collision within margin does not argmax the first id", () => {
  const ranked: RankedCatalogHit[] = [
    { id: "ALBEE", score: 0.91 },
    { id: "ALBON", score: 0.89 },
    { id: "ALTAR", score: 0.7 },
  ];
  const result = snapFix("AL", ranked);
  expect(result.kind).toBe("tie");
  if (result.kind === "tie") {
    expect(result.ids).toEqual(["ALBEE", "ALBON"]);
  }
  expect(result).not.toEqual({ kind: "snap", id: "ALBEE" });
});

test("preferIds snaps a within-margin cluster only when exactly one member matches", () => {
  const ranked: RankedCatalogHit[] = [
    { id: "HAINZ", score: 0.91 },
    { id: "HAYNZ", score: 0.89 },
  ];
  expect(snapFix("Haynes", ranked, new Set(["HAINZ"]))).toEqual({ kind: "snap", id: "HAINZ" });
  expect(snapFix("Haynes", ranked, new Set(["HAINZ", "HAYNZ"]))).toEqual({
    kind: "tie",
    ids: ["HAINZ", "HAYNZ"],
  });
  expect(snapFix("Haynes", ranked, new Set(["NEMAX"]))).toEqual({
    kind: "tie",
    ids: ["HAINZ", "HAYNZ"],
  });
});

test("AC6 — uniquely better off-route id wins; preferIds is not a filter", () => {
  const ranked: RankedCatalogHit[] = [
    { id: "HAINZ", score: SNAP_SCORE_FLOOR + SNAP_SCORE_MARGIN },
    { id: "ONRTE", score: SNAP_SCORE_FLOOR },
  ];
  expect(snapFix("Haynes", ranked, new Set(["ONRTE"]))).toEqual({ kind: "snap", id: "HAINZ" });
});

test("AC8 — snapFix cites R01 published identifiers and trainer ASR repair", () => {
  const sources = import.meta.glob("./catalog-snap.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./catalog-snap.ts"] ?? "";
  expect(src).toMatch(/R01 proceed direct uses published identifiers/);
  expect(src).toMatch(/trainer ASR repair with floor\+margin, not NAS/s);
  expect(src).not.toMatch(/openai\.com|api\.groq\.com|api-inference\.huggingface/);
});
