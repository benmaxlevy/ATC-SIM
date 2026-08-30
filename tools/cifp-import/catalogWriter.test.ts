import { expect, test } from "vitest";
import { parseCatalogFiles } from "../../src/scenario/procedures/loadCatalog.ts";
import { catalogDctIds } from "../../src/scenario/procedures/types.ts";
import { catalogToFileSet, emitClosedCatalogPack, serializeCatalogFiles } from "./catalogWriter.ts";
import { fixtureSource, radiusSeed } from "./closureFixture.ts";

test("writer emits the existing catalog files layout", () => {
  const source = fixtureSource();
  const pack = emitClosedCatalogPack(source, radiusSeed(source), { kind: "airport-all" });
  expect(Object.keys(pack.serialized).sort()).toEqual([
    "catalog.json",
    "fixes.json",
    "ils.json",
    "ndbs.json",
    "procedures.json",
    "sids.json",
    "vors.json",
  ]);
  expect(pack.serialized["atpa-volumes.json"]).toBeUndefined();
  const catalogJson = pack.files.catalog as { files: Record<string, string> };
  expect(catalogJson.files).toEqual({
    vors: "vors.json",
    ndbs: "ndbs.json",
    ils: "ils.json",
    fixes: "fixes.json",
    procedures: "procedures.json",
    sids: "sids.json",
  });
});

test("written pack reloads through parseCatalogFiles with source lat/lon", () => {
  const source = fixtureSource();
  const pack = emitClosedCatalogPack(source, radiusSeed(source), { kind: "airport-all" });
  const loaded = parseCatalogFiles(pack.files);
  expect(loaded.airportId).toBe("KAAA");
  expect(loaded.sids[0]?.runwayTransitions?.[0]?.legs[0]?.fixId).toBe("FARRW");
  const farrw = loaded.fixes.find((row) => row.id === "FARRW");
  expect(farrw?.latDeg).toBe(1);
  expect(farrw?.lonDeg).toBe(0);
  expect(loaded.stars.some((row) => row.id === "BBB1")).toBe(false);
  expect(loaded.atpaVolumes).toEqual([]);
});

test("AC2 — every file-layout ref resolves after closure", () => {
  const source = fixtureSource();
  const pack = emitClosedCatalogPack(source, radiusSeed(source), { kind: "airport-all" });
  const loaded = parseCatalogFiles(pack.files);
  const ids = catalogDctIds(loaded);
  for (const sid of loaded.sids) {
    for (const transition of sid.runwayTransitions ?? []) {
      for (const leg of transition.legs) {
        expect(ids.has(leg.fixId), leg.fixId).toBe(true);
      }
    }
  }
  const ils = loaded.approaches[0];
  expect(ids.has(ils!.locNavaidId!)).toBe(true);
  expect(ids.has(ils!.gsNavaidId!)).toBe(true);
  expect(ids.has(ils!.fafFixId!)).toBe(true);
  expect(ids.has(ils!.missed!.directFixId!)).toBe(true);
});

test("pack JSON is deterministic across two closure writes", () => {
  const source = fixtureSource();
  const a = emitClosedCatalogPack(source, radiusSeed(source), { kind: "airport-all" });
  const b = emitClosedCatalogPack(source, radiusSeed(source), { kind: "airport-all" });
  expect(a.serialized).toEqual(b.serialized);
  expect(serializeCatalogFiles(catalogToFileSet(a.catalog))).toEqual(a.serialized);
});
