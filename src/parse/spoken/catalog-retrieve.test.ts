import { expect, test } from "vitest";
import {
  MAX_RETRIEVE_CANDIDATES as PARSE_MAX_RETRIEVE_CANDIDATES,
  retrieveFix as parseRetrieveFix,
} from "@parse";
import { groundFixToCatalog } from "./catalog-ground";
import { MAX_RETRIEVE_CANDIDATES, retrieveFix, type RetrieveHit } from "./catalog-retrieve";

/** Valid 3-letter ids so file-order 64 would miss anything appended after. */
function padFixes(count: number, extra: readonly string[]): string[] {
  const padding = Array.from({ length: count }, (_, i) => {
    const tens = String.fromCharCode(65 + Math.floor(i / 26));
    const ones = String.fromCharCode(65 + (i % 26));
    return `Z${tens}${ones}`;
  });
  return [...padding, ...extra];
}

function topId(hits: RetrieveHit[]): string | undefined {
  return hits[0]?.id;
}

function expectUnitScores(hits: RetrieveHit[]): void {
  for (const hit of hits) {
    expect(hit.score).toBeGreaterThan(0);
    expect(hit.score).toBeLessThanOrEqual(1);
  }
}

test("AC1 — Haynes ranks HAINZ first when the id sits past index 70", () => {
  const catalog = padFixes(70, ["HAINZ"]);
  expect(catalog.indexOf("HAINZ")).toBe(70);
  const hits = retrieveFix("Haynes", catalog);
  expectUnitScores(hits);
  expect(topId(hits)).toBe("HAINZ");
  expect(hits.filter((hit) => hit.id === "HAINZ")).toHaveLength(1);
  expect(hits[0]!.score).toBeGreaterThan(hits[1]?.score ?? 0);
});

test("AC2 — AJ and Ajay rank AJAAY first among padded ids", () => {
  const catalog = padFixes(70, ["AJAAY", "HAINZ"]);
  const aj = retrieveFix("AJ", catalog);
  const ajay = retrieveFix("Ajay", catalog);
  expectUnitScores(aj);
  expectUnitScores(ajay);
  expect(topId(aj)).toBe("AJAAY");
  expect(topId(ajay)).toBe("AJAAY");
  expect(aj.filter((hit) => hit.id === "AJAAY")).toHaveLength(1);
  expect(ajay.filter((hit) => hit.id === "AJAAY")).toHaveLength(1);
  expect(aj[0]!.score).toBeGreaterThan(aj[1]?.score ?? 0);
  expect(ajay[0]!.score).toBeGreaterThan(ajay[1]?.score ?? 0);
});

test("AC3 — unknown or empty tokens return no ids", () => {
  const catalog = padFixes(70, ["HAINZ", "AJAAY", "SEMAX"]);
  expect(retrieveFix("NOPE", catalog)).toEqual([]);
  expect(retrieveFix("", catalog)).toEqual([]);
  expect(retrieveFix("   ", catalog)).toEqual([]);
  expect(retrieveFix(null, catalog)).toEqual([]);
  expect(retrieveFix(undefined, catalog)).toEqual([]);
  expect(retrieveFix("x", catalog)).toEqual([]);
  const known = new Set(catalog);
  for (const hit of retrieveFix("Haynes", catalog)) {
    expect(known.has(hit.id)).toBe(true);
  }
});

test("AC4 — tied fold-matches keep both ids; unique snap stays null", () => {
  const catalog = ["HAINZ", "HAYNZ"];
  const hits = retrieveFix("Haynes", catalog);
  expectUnitScores(hits);
  expect(hits.map((hit) => hit.id).sort()).toEqual(["HAINZ", "HAYNZ"]);
  expect(hits).toHaveLength(2);
  expect(hits[0]!.score).toBe(hits[1]!.score);
  expect(groundFixToCatalog("Haynes", catalog)).toBeNull();
});

test("AC5 — C-Max still unique-snaps to SEMAX; retrieve ranks it first", () => {
  const catalog = padFixes(70, ["SEMAX", "NEMAX"]);
  expect(groundFixToCatalog("C-Max", catalog)).toBe("SEMAX");
  const hits = retrieveFix("C-Max", catalog);
  expectUnitScores(hits);
  expect(topId(hits)).toBe("SEMAX");
  expect(hits[0]!.score).toBeGreaterThan(hits[1]?.score ?? 0);
});

test("retrieve scores are on [0, 1], exact match is 1", () => {
  const catalog = padFixes(70, ["HAINZ", "AJAAY"]);
  expect(retrieveFix("HAINZ", catalog)[0]).toEqual({ id: "HAINZ", score: 1 });
  const haynes = retrieveFix("Haynes", catalog);
  expectUnitScores(haynes);
  expect(haynes[0]!.score).toBeLessThan(1);
});

test("retrieve caps the returned list, not the index", () => {
  expect(MAX_RETRIEVE_CANDIDATES).toBe(16);
  const catalog = padFixes(70, ["HAINZ"]);
  expect(retrieveFix("Haynes", catalog).length).toBeLessThanOrEqual(MAX_RETRIEVE_CANDIDATES);
  expect(retrieveFix("Haynes", catalog, { limit: 1 })).toEqual([
    expect.objectContaining({ id: "HAINZ" }),
  ]);
});

test("AC6/AC7 — retrieve is local and cites 7110.65 analog vs trainer ids", () => {
  const sources = import.meta.glob("./catalog-retrieve.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./catalog-retrieve.ts"] ?? "";
  expect(src).toMatch(/7110\.65/);
  expect(src).toMatch(/HAINZ/);
  expect(src).toMatch(/Haynes/);
  expect(src).toMatch(/AJAAY/);
  expect(src).toMatch(/Trainer delta/);
  expect(src).not.toMatch(/openai\.com|api\.groq\.com|api-inference\.huggingface/);
});

test("retrieveFix and MAX_RETRIEVE_CANDIDATES are exported from @parse", () => {
  expect(parseRetrieveFix).toBe(retrieveFix);
  expect(PARSE_MAX_RETRIEVE_CANDIDATES).toBe(MAX_RETRIEVE_CANDIDATES);
});
