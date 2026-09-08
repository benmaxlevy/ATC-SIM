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
