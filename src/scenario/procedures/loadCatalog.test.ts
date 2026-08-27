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
  expect(catalog.sids).toHaveLength(1);
  expect(catalog.sids[0]?.id).toBe("BAY1");
});

test("AC1 — loadCatalog parses KDEM sids.json with BAY1 procedure", () => {
  const catalog = loadCatalog("src/scenario/data/kdem");
  expect(catalog.sids).toHaveLength(1);
  const bay1 = catalog.sids[0]!;
  expect(bay1.id).toBe("BAY1");
  expect(bay1.name).toBe("BAY ONE DEPARTURE");
  expect(bay1.runwayTransitions?.[0]?.runwayId).toBe("27");
  expect(bay1.runwayTransitions?.[0]?.legs[0]?.fixId).toBe("BAYEE");
  expect(bay1.enrouteTransitions?.map((t) => t.id)).toEqual(["NORMA", "OCTTA"]);
});

test("AC3 — dangling STAR fixId throws; no partial catalog is returned", () => {
  const files = kdemFiles();
  const procedures = files.procedures as { stars: Array<{ common: Array<{ fixId: string }> }> };
  procedures.stars[0]!.common[0]!.fixId = "NOPE";
  expect(() => parseCatalogFiles(files)).toThrow(/unknown id NOPE/);
});

test("AC3 — dangling SID runway transition fixId throws", () => {
  const files = kdemFiles();
  const sids = files.sids as {
    sids: Array<{ runwayTransitions: Array<{ legs: Array<{ fixId: string }> }> }>;
  };
  sids.sids[0]!.runwayTransitions[0]!.legs[0]!.fixId = "NOPE";
  expect(() => parseCatalogFiles(files)).toThrow(/unknown id NOPE/);
});

test("AC3 — dangling SID common fixId throws", () => {
  const files = kdemFiles();
  const sids = files.sids as { sids: Array<{ common: Array<{ fixId: string }> }> };
  sids.sids[0]!.common = [{ fixId: "NOPE" }];
  expect(() => parseCatalogFiles(files)).toThrow(/unknown id NOPE/);
});

test("AC3 — dangling SID enroute transition fixId throws", () => {
  const files = kdemFiles();
  const sids = files.sids as {
    sids: Array<{ enrouteTransitions: Array<{ legs: Array<{ fixId: string }> }> }>;
  };
  sids.sids[0]!.enrouteTransitions[0]!.legs[0]!.fixId = "NOPE";
  expect(() => parseCatalogFiles(files)).toThrow(/unknown id NOPE/);
});

test("empty SID legs fails load", () => {
  const files = kdemFiles();
  const sids = files.sids as {
    sids: Array<{ runwayTransitions: unknown[]; common: unknown[]; enrouteTransitions: unknown[] }>;
  };
  sids.sids[0]!.runwayTransitions = [];
  sids.sids[0]!.common = [];
  sids.sids[0]!.enrouteTransitions = [];
  expect(() => parseCatalogFiles(files)).toThrow(/empty/);
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
  files.sids = { airportId: "KDEM", sids: [] };
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

test("T04-26 AC4 — loadCatalog parses both ILS27 and ILS09 with all associated navaids and fixes", () => {
  const catalog = loadCatalog("kdem");
  expect(catalog.approaches.map((a) => a.id)).toEqual(["ILS27", "ILS09"]);
  const ils09 = catalog.approaches.find((a) => a.id === "ILS09")!;
  expect(ils09).toBeDefined();
  expect(ils09.runway).toBe("09");
  expect(ils09.locNavaidId).toBe("IDEM09");
  expect(ils09.gsNavaidId).toBe("IDEMGS09");
  expect(ils09.fafFixId).toBe("FI09");
  expect(ils09.thresholdFixId).toBe("RW09");
  expect(ils09.missed?.directFixId).toBe("MISSE");

  // Verify all approach referenced items exist in catalog
  expect(catalog.navaids.some((n) => n.id === "IDEM09")).toBe(true);
  expect(catalog.navaids.some((n) => n.id === "IDEMGS09")).toBe(true);
  expect(catalog.fixes.some((f) => f.id === "FI09")).toBe(true);
  expect(catalog.fixes.some((f) => f.id === "RW09")).toBe(true);
  expect(catalog.fixes.some((f) => f.id === "MISSE")).toBe(true);
});

test("AC3 — dangling approach locNavaidId, gsNavaidId, fafFixId, thresholdFixId, missed directFixId throws", () => {
  {
    const files = kdemFiles();
    const procedures = files.procedures as { approaches: Array<{ locNavaidId?: string }> };
    procedures.approaches[1]!.locNavaidId = "NOPE";
    expect(() => parseCatalogFiles(files)).toThrow(/unknown id NOPE/);
  }
  {
    const files = kdemFiles();
    const procedures = files.procedures as { approaches: Array<{ gsNavaidId?: string }> };
    procedures.approaches[1]!.gsNavaidId = "NOPE";
    expect(() => parseCatalogFiles(files)).toThrow(/unknown id NOPE/);
  }
  {
    const files = kdemFiles();
    const procedures = files.procedures as { approaches: Array<{ fafFixId?: string }> };
    procedures.approaches[1]!.fafFixId = "NOPE";
    expect(() => parseCatalogFiles(files)).toThrow(/unknown id NOPE/);
  }
  {
    const files = kdemFiles();
    const procedures = files.procedures as { approaches: Array<{ thresholdFixId?: string }> };
    procedures.approaches[1]!.thresholdFixId = "NOPE";
    expect(() => parseCatalogFiles(files)).toThrow(/unknown id NOPE/);
  }
  {
    const files = kdemFiles();
    const procedures = files.procedures as {
      approaches: Array<{ missed?: { directFixId?: string } }>;
    };
    procedures.approaches[1]!.missed!.directFixId = "NOPE";
    expect(() => parseCatalogFiles(files)).toThrow(/unknown id NOPE/);
  }
});

test("missing catalog directory throws", () => {
  expect(() => loadCatalog("kjfk")).toThrow(/Missing catalog file/);
});
