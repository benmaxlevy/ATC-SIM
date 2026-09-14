import { expect, test } from "vitest";
import { rankFixCandidates, retrieveFix } from "@parse";
import {
  catalogFixEntriesFromCatalog,
  groundFixPhraseToCatalog,
  groundFixToCatalog,
  sanitizeCatalogFixEntries,
} from "../spoken/catalog-ground";

test("ranked candidates expose the shared deterministic match tiers", () => {
  expect(rankFixCandidates("FIX1", ["FIX1", "FIX2"])[0]).toMatchObject({
    id: "FIX1",
    score: 1,
    tier: "exact",
    method: "exact",
  });
  expect(rankFixCandidates("SEE MAX", ["SEMAX"])[0]).toMatchObject({
    id: "SEMAX",
    score: 0.9,
    tier: "alias",
    method: "alias",
  });
  expect(rankFixCandidates("HAYNZ", ["HAINZ"])[0]).toMatchObject({
    id: "HAINZ",
    score: 0.8,
    tier: "folded-alias",
    method: "folded",
  });
  expect(rankFixCandidates("FIXI", ["FIX1"])[0]).toMatchObject({
    id: "FIX1",
    score: 0.6,
    tier: "near",
    method: "levenshtein",
    distance: 1,
  });
  expect(rankFixCandidates("HAYNES", ["HAINZ"])[0]).toMatchObject({
    id: "HAINZ",
    score: 0.5,
    tier: "folded-near",
    method: "levenshtein",
    distance: 1,
  });
});

test("grounding rejects ties and keeps distance two retrieval-only", () => {
  expect(rankFixCandidates("FIXC", ["FIXA", "FIXB"])).toHaveLength(2);
  expect(groundFixToCatalog("FIXC", ["FIXA", "FIXB"])).toBeNull();
  expect(groundFixToCatalog("FIX99", ["FIX01"])).toBeNull();
  expect(rankFixCandidates("FIX99", ["FIX01"])).toEqual([]);
  expect(rankFixCandidates("FIX99", ["FIX01"], { includeDistanceTwo: true })).toMatchObject([
    { id: "FIX01", score: 0.45, tier: "far", method: "levenshtein", distance: 2 },
  ]);
  expect(retrieveFix("FIX99", ["FIX01"])).toEqual([{ id: "FIX01", score: 0.45 }]);
});

test("route grounding preserves token boundaries while scalar grounding stays compact", () => {
  expect(groundFixToCatalog("AB CD", ["ABCD"])).toBe("ABCD");
  expect(groundFixPhraseToCatalog(["AB", "CD"], ["ABCD"])).toBeNull();
  expect(groundFixPhraseToCatalog(["SEE", "MAX"], ["SEMAX"])).toBe("SEMAX");
});

test("structured entries preserve canonical ids and navaid aliases", () => {
  const entries = sanitizeCatalogFixEntries([
    "fix1",
    { id: "ahn", kind: "NAVAID", aliases: ["Athens"] },
  ]);

  expect(entries).toEqual([
    { id: "FIX1", kind: "FIX" },
    { id: "AHN", kind: "NAVAID", aliases: ["Athens"] },
  ]);
  expect(groundFixToCatalog("ATHENS", entries)).toBe("AHN");
  expect(rankFixCandidates("ATHENS", entries)[0]).toMatchObject({
    id: "AHN",
    kind: "NAVAID",
    score: 0.9,
  });
});

test("duplicate structured aliases remain ambiguous", () => {
  const entries = [
    { id: "AHN", kind: "NAVAID" as const, aliases: ["Athens"] },
    { id: "ATHX", kind: "FIX" as const, aliases: ["Athens"] },
  ];

  expect(groundFixToCatalog("ATHENS", entries)).toBeNull();
  expect(groundFixPhraseToCatalog(["ATHENS"], entries)).toBeNull();
});

test("catalog vocabulary keeps navaids and fixes, excludes the airport, and preserves aliases", () => {
  const entries = catalogFixEntriesFromCatalog({
    airportId: "KATL",
    navaids: [
      { id: "KATL", name: "Atlanta International" },
      { id: "AHN", name: "Athens" },
    ],
    fixes: [{ id: "SWEPT" }],
  });

  expect(entries).toEqual([
    { id: "AHN", kind: "NAVAID", aliases: ["Athens"] },
    { id: "SWEPT", kind: "FIX" },
  ]);
  expect(entries.some((entry) => entry.id === "KATL")).toBe(false);
});
