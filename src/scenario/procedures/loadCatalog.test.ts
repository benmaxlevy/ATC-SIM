import { expect, test } from "vitest";
import atpaVolumesJson from "../data/kdem/atpa-volumes.json";
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
    atpaVolumes: atpaVolumesJson,
  });
}

test("parseCatalogFiles accepts the committed KDEM set", () => {
  const catalog = parseCatalogFiles(kdemFiles());
  expect(catalog.airportId).toBe("KDEM");
  expect(catalog.sids).toHaveLength(1);
  expect(catalog.sids[0]?.id).toBe("BAY1");
  expect(catalog.atpaVolumes.map((volume) => volume.id)).toEqual(["ATPA27", "ATPA09"]);
});

test("AC1 — loadCatalog parses KDEM sids.json with BAY1 procedure for RW27 and RW09", () => {
  const catalog = loadCatalog("src/scenario/data/kdem");
  expect(catalog.sids).toHaveLength(1);
  const bay1 = catalog.sids[0]!;
  expect(bay1.id).toBe("BAY1");
  expect(bay1.name).toBe("BAY ONE DEPARTURE");
  expect(bay1.runwayTransitions).toHaveLength(2);
  expect(bay1.runwayTransitions?.[0]?.runwayId).toBe("27");
  expect(bay1.runwayTransitions?.[0]?.legs[0]?.fixId).toBe("BAYEE");
  expect(bay1.runwayTransitions?.[1]?.runwayId).toBe("09");
  expect(bay1.runwayTransitions?.[1]?.legs[0]?.fixId).toBe("BAYES");
  expect(bay1.enrouteTransitions?.map((t) => t.id)).toEqual(["NORMA", "OCTTA"]);
});

test("AC3 — dangling STAR fixId throws; no partial catalog is returned", () => {
  const files = kdemFiles();
  const procedures = files.procedures as {
    stars: Array<{ transitions: Array<{ legs: Array<{ fixId: string }> }> }>;
  };
  procedures.stars[0]!.transitions[0]!.legs[0]!.fixId = "NOPE";
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
    sids: Array<{
      enrouteTransitions: Array<{
        legs?: Array<{ fixId: string }>;
        runwayTransitions?: Array<{ legs: Array<{ fixId: string }> }>;
      }>;
    }>;
  };
  sids.sids[0]!.enrouteTransitions[0]!.runwayTransitions![0]!.legs[0]!.fixId = "NOPE";
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

function sampleAtpaVolume(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "ATPA27",
    approachId: "ILS27",
    enabled: true,
    lengthNm: 15,
    halfWidthNm: 1.5,
    floorFt: 0,
    ceilingFt: 6000,
    courseToleranceDeg: 30,
    basicSeparationNm: 3,
    reducedSeparationNm: 2.5,
    reducedWithinNm: 10,
    ...overrides,
  };
}

function withAtpaVolumes(volumes: unknown[], airportId = "KDEM"): CatalogFileSet {
  const files = kdemFiles();
  const catalog = files.catalog as { files: Record<string, string> };
  catalog.files.atpaVolumes = "atpa-volumes.json";
  files.atpaVolumes = { airportId, atpaVolumes: volumes };
  return files;
}

test("T02-43 AC2 — omitting files.atpaVolumes still loads with atpaVolumes []", () => {
  const files = kdemFiles();
  const catalogJson = files.catalog as { files: Record<string, unknown> };
  delete catalogJson.files.atpaVolumes;
  files.atpaVolumes = undefined;
  const catalog = parseCatalogFiles(files);
  expect(catalog.atpaVolumes).toEqual([]);
});

test("T02-43 AC3 — duplicate volume id throws; no partial catalog", () => {
  expect(() =>
    parseCatalogFiles(withAtpaVolumes([sampleAtpaVolume(), sampleAtpaVolume({ id: "ATPA27" })])),
  ).toThrow(/duplicate id ATPA27/);
});

test("T02-43 AC3 — unknown approachId throws; no partial catalog", () => {
  expect(() =>
    parseCatalogFiles(withAtpaVolumes([sampleAtpaVolume({ approachId: "NOPE" })])),
  ).toThrow(/unknown id NOPE/);
});

test("T02-43 AC3 — reducedSeparationNm greater than basicSeparationNm throws", () => {
  expect(() =>
    parseCatalogFiles(
      withAtpaVolumes([sampleAtpaVolume({ basicSeparationNm: 3, reducedSeparationNm: 4 })]),
    ),
  ).toThrow(/reducedSeparationNm must be <= basicSeparationNm/);
});

test("T02-43 AC3 — non-positive lengthNm throws", () => {
  expect(() => parseCatalogFiles(withAtpaVolumes([sampleAtpaVolume({ lengthNm: 0 })]))).toThrow(
    /lengthNm must be positive/,
  );
  expect(() => parseCatalogFiles(withAtpaVolumes([sampleAtpaVolume({ lengthNm: -1 })]))).toThrow(
    /lengthNm must be positive/,
  );
});

test("T02-43 — omitted minima default to 3 / 2.5 / 10", () => {
  const files = withAtpaVolumes([
    sampleAtpaVolume({
      basicSeparationNm: undefined,
      reducedSeparationNm: undefined,
      reducedWithinNm: undefined,
    }),
  ]);
  const catalog = parseCatalogFiles(files);
  expect(catalog.atpaVolumes).toHaveLength(1);
  expect(catalog.atpaVolumes[0]).toMatchObject({
    id: "ATPA27",
    approachId: "ILS27",
    basicSeparationNm: 3,
    reducedSeparationNm: 2.5,
    reducedWithinNm: 10,
  });
});

test("T02-43 — atpaVolumes airportId mismatch throws", () => {
  expect(() => parseCatalogFiles(withAtpaVolumes([sampleAtpaVolume()], "KJFK"))).toThrow(
    /does not match catalog.airportId/,
  );
});

test("T02-43 AC1 — loadCatalog(kdem) returns ATPA27 and ATPA09 on ILS27/ILS09", () => {
  const catalog = loadCatalog("kdem");
  expect(catalog.atpaVolumes).toHaveLength(2);
  const atpa27 = catalog.atpaVolumes.find((volume) => volume.id === "ATPA27");
  const atpa09 = catalog.atpaVolumes.find((volume) => volume.id === "ATPA09");
  expect(atpa27).toBeDefined();
  expect(atpa09).toBeDefined();
  const ils27 = catalog.approaches.find((approach) => approach.id === atpa27!.approachId);
  const ils09 = catalog.approaches.find((approach) => approach.id === atpa09!.approachId);
  expect(ils27?.id).toBe("ILS27");
  expect(ils27?.thresholdFixId).toBe("RW27");
  expect(ils27?.courseDeg).toBe(270);
  expect(ils09?.id).toBe("ILS09");
  expect(ils09?.thresholdFixId).toBe("RW09");
  expect(ils09?.courseDeg).toBe(90);
  for (const volume of catalog.atpaVolumes) {
    expect(volume.enabled).toBe(true);
    expect(volume.lengthNm).toBe(15);
    expect(volume.halfWidthNm).toBe(1.5);
    expect(volume.floorFt).toBe(0);
    expect(volume.ceilingFt).toBe(6000);
    expect(volume.courseToleranceDeg).toBe(30);
    expect(volume.basicSeparationNm).toBe(3);
    expect(volume.reducedSeparationNm).toBe(2.5);
    expect(volume.reducedWithinNm).toBe(10);
    expect(volume.note).toMatch(/authored trainer adaptation/i);
  }
});
