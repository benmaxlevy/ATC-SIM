import { expect, test } from "vitest";
import atpaVolumesJson from "../../data/kdem/atpa-volumes.json";
import catalogJson from "../../data/kdem/catalog.json";
import fixesJson from "../../data/kdem/fixes.json";
import ilsJson from "../../data/kdem/ils.json";
import ndbsJson from "../../data/kdem/ndbs.json";
import proceduresJson from "../../data/kdem/procedures.json";
import sidsJson from "../../data/kdem/sids.json";
import vorsJson from "../../data/kdem/vors.json";
import { loadCatalog, parseCatalogFiles, type CatalogFileSet } from "../../procedures/loadCatalog";

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
  const loaderSrc = import.meta.glob("../../procedures/loadCatalog.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = loaderSrc["../../procedures/loadCatalog.ts"] ?? "";
  expect(src).not.toMatch(/["']KATL["']/);
});
