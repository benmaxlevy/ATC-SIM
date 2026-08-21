import { expect, test } from "vitest";
import catalogJson from "../data/kdem/catalog.json";
import fixesJson from "../data/kdem/fixes.json";
import ilsJson from "../data/kdem/ils.json";
import ndbsJson from "../data/kdem/ndbs.json";
import proceduresJson from "../data/kdem/procedures.json";
import sidsJson from "../data/kdem/sids.json";
import vorsJson from "../data/kdem/vors.json";
import { loadCatalog, parseCatalogFiles, type CatalogFileSet } from "./loadCatalog";

function kdemFiles(): CatalogFileSet {
  return structuredClone({
    catalog: catalogJson,
    vors: vorsJson,
    ndbs: ndbsJson,
    ils: ilsJson,
    fixes: fixesJson,
    procedures: proceduresJson,
    sids: sidsJson,
  });
}

test("parseCatalogFiles accepts the committed KDEM set", () => {
  const catalog = parseCatalogFiles(kdemFiles());
  expect(catalog.airportId).toBe("KDEM");
  expect(catalog.sids).toEqual([]);
});

test("AC3 — dangling STAR fixId throws; no partial catalog is returned", () => {
  const files = kdemFiles();
  const procedures = files.procedures as { stars: Array<{ common: Array<{ fixId: string }> }> };
  procedures.stars[0]!.common[0]!.fixId = "NOPE";
  expect(() => parseCatalogFiles(files)).toThrow(/unknown id NOPE/);
});

test("duplicate navaid/fix id DEM fails load", () => {
  const files = kdemFiles();
  const fixes = files.fixes as { fixes: Array<Record<string, unknown>> };
  fixes.fixes.push({
    id: "DEM",
    kind: "WAYPOINT",
    xNm: 0,
    yNm: 0,
  });
  expect(() => parseCatalogFiles(files)).toThrow(/duplicate id DEM/);
});

test("empty STAR fails load", () => {
  const files = kdemFiles();
  const procedures = files.procedures as {
    stars: Array<{ transitions: unknown[]; common: unknown[] }>;
  };
  procedures.stars[0]!.transitions = [];
  procedures.stars[0]!.common = [];
  expect(() => parseCatalogFiles(files)).toThrow(/empty/);
});

test("schema accepts empty sids and a non-ILS approach type string", () => {
  const files = kdemFiles();
  const procedures = files.procedures as { approaches: Array<Record<string, unknown>> };
  procedures.approaches.push({
    id: "RNAV27",
    type: "RNAV",
    runway: "27",
    name: "RNAV RWY 27",
    fafFixId: "FI27",
    thresholdFixId: "RW27",
  });
  const catalog = parseCatalogFiles(files);
  expect(catalog.sids).toEqual([]);
  expect(catalog.approaches.some((item) => item.id === "RNAV27" && item.type === "RNAV")).toBe(
    true,
  );
});

test("loadCatalog takes a directory path, not a KDEM-only name", () => {
  expect(loadCatalog("kdem").airportId).toBe("KDEM");
  expect(loadCatalog("src/scenario/data/kdem").airportId).toBe("KDEM");
});

test("missing catalog directory throws", () => {
  expect(() => loadCatalog("kjfk")).toThrow(/Missing catalog file/);
});
