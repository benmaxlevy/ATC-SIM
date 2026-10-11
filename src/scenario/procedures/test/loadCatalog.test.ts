import { expect, test } from "vitest";
import atpaVolumesJson from "../../data/kdem/atpa-volumes.json";
import catalogJson from "../../data/kdem/catalog.json";
import fixesJson from "../../data/kdem/fixes.json";
import ilsJson from "../../data/kdem/ils.json";
import ndbsJson from "../../data/kdem/ndbs.json";
import proceduresJson from "../../data/kdem/procedures.json";
import sidsJson from "../../data/kdem/sids.json";
import vorsJson from "../../data/kdem/vors.json";
import { loadCatalog, parseCatalogFiles, type CatalogFileSet } from "../loadCatalog";

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
  expect(catalog.spokenAliases).toEqual(["DEMO FIELD", "DEMO AIRPORT"]);
  expect(catalog.sids[0]?.id).toBe("BAY1");
  expect(catalog.approaches.find((approach) => approach.id === "ILS27")).toMatchObject({
    locFullScaleHalfWidthFtAtThreshold: 350,
    gsBeamFullWidthDeg: 1.4,
  });
  expect(catalog.approaches.find((approach) => approach.id === "ILS09")).toMatchObject({
    locFullScaleHalfWidthFtAtThreshold: 350,
    gsBeamFullWidthDeg: 1.4,
  });
});

test("omitted ILS envelope fields normalize for a second airport", () => {
  const files = kdemFiles();
  const catalog = files.catalog as { airportId: string; name: string };
  const procedures = files.procedures as {
    airportId: string;
    approaches: Array<Record<string, unknown>>;
  };
  catalog.airportId = "KBBB";
  catalog.name = "Bravo";
  for (const file of [
    files.vors,
    files.ndbs,
    files.ils,
    files.fixes,
    files.procedures,
    files.sids,
  ]) {
    (file as { airportId: string }).airportId = "KBBB";
  }
  (files.atpaVolumes as { airportId: string }).airportId = "KBBB";
  for (const approach of procedures.approaches) {
    delete approach.locFullScaleHalfWidthFtAtThreshold;
    delete approach.gsBeamFullWidthDeg;
  }
  const parsed = parseCatalogFiles(files);
  expect(parsed.airportId).toBe("KBBB");
  expect(parsed.approaches[0]).toMatchObject({
    locFullScaleHalfWidthFtAtThreshold: 350,
    gsBeamFullWidthDeg: 1.4,
  });
});

test("dangling STAR fixId throws", () => {
  const files = kdemFiles();
  const procedures = files.procedures as {
    stars: Array<{ transitions: Array<{ legs: Array<{ fixId: string }> }> }>;
  };
  procedures.stars[0]!.transitions[0]!.legs[0]!.fixId = "NOPE";
  expect(() => parseCatalogFiles(files)).toThrow(/unknown id NOPE/);
});

test("airport identity requires a usable spoken alias set", () => {
  const files = kdemFiles();
  delete (files.catalog as { spokenAliases?: unknown }).spokenAliases;
  expect(() => parseCatalogFiles(files)).toThrow(/spokenAliases/);
  const withBlank = kdemFiles();
  (withBlank.catalog as { spokenAliases: string[] }).spokenAliases = [" "];
  expect(() => parseCatalogFiles(withBlank)).toThrow(/spokenAliases/);
});

test("loadCatalog has no facility-id branch", () => {
  const catalog = loadCatalog("src/scenario/data/kdem");
  expect(catalog.airportId).toBe("KDEM");
  const loaderSrc = import.meta.glob("../loadCatalog.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = loaderSrc["../loadCatalog.ts"] ?? "";
  expect(src).not.toMatch(/["']KATL["']/);
});

test("catalog-owned FMA overrides validate paths, finite geometry and positive monitoring values", () => {
  const files = kdemFiles();
  (files.catalog as Record<string, unknown>).fmaOverrides = {
    groups: [
      {
        id: "PARALLEL",
        approachIds: ["ILS27"],
        runwayAliases: { "27": ["R27"] },
        ntzWidthFt: 2000,
        monitoring: { cautionHorizonS: 12 },
      },
    ],
  };
  expect(parseCatalogFiles(files).fmaOverrides?.groups?.[0]).toMatchObject({
    id: "PARALLEL",
    approachIds: ["ILS27"],
    runwayAliases: { "27": ["R27"] },
    ntzWidthFt: 2000,
    monitoring: { cautionHorizonS: 12 },
  });

  const malformed = kdemFiles();
  (malformed.catalog as Record<string, unknown>).fmaOverrides = {
    groups: [
      {
        id: "BAD",
        geometry: { amzBoundary: [{ xNm: Number.NaN, yNm: 0 }], runways: [], ntzs: [] },
      },
    ],
  };
  expect(() => parseCatalogFiles(malformed)).toThrow(
    /fmaOverrides\.groups\[0\]\.geometry\.amzBoundary\[0\]\.xNm/,
  );

  const invalidMonitoring = kdemFiles();
  (invalidMonitoring.catalog as Record<string, unknown>).fmaOverrides = {
    groups: [{ id: "BAD", monitoring: { maximumPtlS: 0 } }],
  };
  expect(() => parseCatalogFiles(invalidMonitoring)).toThrow(/maximumPtlS must be positive/);
});
