/**
 * T04-35: CIFP pack interchange with authored catalogs.
 * Pack pipeline → parseCatalogFiles (same parser as loadCatalog).
 * No committed KATL dump. No src/ import of this tool.
 */
import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
// @ts-expect-error tsconfig has no @types/node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
// @ts-expect-error tsconfig has no @types/node
import { tmpdir } from "node:os";
// @ts-expect-error tsconfig has no @types/node
import { dirname, join } from "node:path";
// @ts-expect-error tsconfig has no @types/node
import { fileURLToPath } from "node:url";
import { parseCatalogFiles } from "../../src/scenario/procedures/loadCatalog.ts";
import { catalogDctIds } from "../../src/scenario/procedures/types.ts";
import { starRouteFixIds } from "../../src/scenario/starSpawn.ts";
import { sidRouteFixIds } from "../../src/scenario/procedures/sidHelpers.ts";
import {
  applyKatlPackDefaults,
  KATL_DEFAULT_AIRPORT,
  KATL_DEFAULT_RADIUS_NM,
} from "./extract-katl-slice.ts";
import { pa, pc, pd, pe, pf, pg, pi } from "./fixedWidthRecords.ts";
import { CATALOG_PACK_FILES, packFromText, writeCatalogPack } from "./pack.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");

/** Far packed DMS ≈ 1° (~60 NM). Near packed DMS ≈ 0.1° (~6 NM). */
function buildFarRefSubset(icao: string): string {
  return [
    "# T04-35 synthetic. NOT a real cycle. Far SID/STAR/approach refs sit outside 20 NM.",
    pa({ icao, name: "Bravo Field", lat: "N00000000", lon: "E000000000" }),
    pc({ icao, id: "NEARX", lat: "N00010000", lon: "E000010000" }),
    pc({ icao, id: "FARST", lat: "N01000000", lon: "E000000000" }),
    pc({ icao, id: "FARSD", lat: "N00000000", lon: "E001000000" }),
    pc({ icao, id: "FIBB", lat: "S01000000", lon: "E000000000", type: "  F" }),
    pc({ icao, id: "FARMS", lat: "N00000000", lon: "W001000000" }),
    pc({ icao, id: "RW27", lat: "N00000000", lon: "E000000000", type: "  G" }),
    pg({ icao, rwy: "RW27", lat: "N00000000", lon: "E000000000" }),
    pi({
      icao,
      locId: "IBBB",
      lat: "N00000000",
      lon: "W000015100",
      gsLat: "S00000420",
      gsLon: "E000001080",
    }),
    pe({
      icao,
      starId: "BBB1",
      routeType: "1",
      trans: "N",
      seq: "010",
      fixId: "FARST",
      path: "IF",
    }),
    pe({
      icao,
      starId: "BBB1",
      routeType: "2",
      seq: "010",
      fixId: "NEARX",
      path: "TF",
    }),
    pd({
      icao,
      sidId: "OUT1",
      routeType: "1",
      trans: "RW27",
      seq: "010",
      fixId: "FARSD",
      path: "IF",
    }),
    pd({
      icao,
      sidId: "OUT1",
      routeType: "2",
      seq: "010",
      fixId: "NEARX",
      path: "TF",
    }),
    pf({
      icao,
      appId: "ILSBB",
      routeType: "I",
      trans: "RW27",
      seq: "010",
      fixId: "FIBB",
      path: "IF",
      recNav: "IBBB",
    }),
    pf({
      icao,
      appId: "ILSBB",
      routeType: "I",
      trans: "RW27",
      seq: "020",
      fixId: "RW27",
      path: "CF",
      recNav: "IBBB",
    }),
    pf({
      icao,
      appId: "ILSBB",
      routeType: "Z",
      seq: "010",
      path: "VA",
      course: "2700",
      altDesc: "+",
      alt: "03000",
      desc: "E  M",
    }),
    pf({
      icao,
      appId: "ILSBB",
      routeType: "Z",
      seq: "020",
      fixId: "FARMS",
      path: "DF",
      desc: "E  M",
    }),
    "",
  ].join("\n");
}

function walkTs(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walkTs(path, acc);
      continue;
    }
    if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      acc.push(path);
    }
  }
  return acc;
}

test("T04-35 AC4 — SID, STAR, and approach refs outside seed radius stay after pack", () => {
  const text = buildFarRefSubset("KBBB");
  const result = packFromText(text, {
    inPath: "in.cifp",
    airportId: "KBBB",
    radiusNm: 20,
    outDir: "out/kbbb",
    dryRun: false,
  });
  expect(result.seed.fixes.map((row) => row.id).sort()).toEqual(["NEARX", "RW27"]);
  expect(result.seed.fixes.some((row) => row.id === "FARST")).toBe(false);
  expect(result.seed.fixes.some((row) => row.id === "FARSD")).toBe(false);
  expect(result.seed.fixes.some((row) => row.id === "FIBB")).toBe(false);
  expect(result.seed.fixes.some((row) => row.id === "FARMS")).toBe(false);

  const loaded = parseCatalogFiles(result.pack.files);
  expect(loaded.airportId).toBe("KBBB");
  expect(loaded.atpaVolumes).toEqual([]);
  expect(starRouteFixIds(loaded, "BBB1", "N")).toEqual(["FARST", "NEARX"]);
  expect(sidRouteFixIds(loaded, "OUT1", "27")).toEqual(["FARSD", "NEARX"]);
  const dct = catalogDctIds(loaded);
  expect(dct.has("FARST")).toBe(true);
  expect(dct.has("FARSD")).toBe(true);
  expect(dct.has("FIBB")).toBe(true);
  expect(dct.has("FARMS")).toBe(true);
  const ils = loaded.approaches.find((row) => row.id === "ILSBB");
  expect(ils?.fafFixId).toBe("FIBB");
  expect(ils?.thresholdFixId).toBe("RW27");
  expect(ils?.missed?.directFixId).toBe("FARMS");
  expect(ils?.locNavaidId).toBe("IBBB");
});

test("T04-35 AC4 — pack written to a temp dir reloads through parseCatalogFiles", () => {
  const text = buildFarRefSubset("KCCC");
  const result = packFromText(text, {
    inPath: "in.cifp",
    airportId: "KCCC",
    radiusNm: 20,
    outDir: "out/kccc",
    dryRun: false,
  });
  const dir = mkdtempSync(join(tmpdir(), "t04-35-pack-"));
  try {
    writeCatalogPack(result.pack.serialized, dir, (path, body) => {
      writeFileSync(path, body);
    });
    for (const file of CATALOG_PACK_FILES) {
      expect(existsSync(join(dir, file))).toBe(true);
    }
    expect(existsSync(join(dir, "atpa-volumes.json"))).toBe(false);
    const files = {
      catalog: JSON.parse(readFileSync(join(dir, "catalog.json"), "utf8")),
      vors: JSON.parse(readFileSync(join(dir, "vors.json"), "utf8")),
      ndbs: JSON.parse(readFileSync(join(dir, "ndbs.json"), "utf8")),
      ils: JSON.parse(readFileSync(join(dir, "ils.json"), "utf8")),
      fixes: JSON.parse(readFileSync(join(dir, "fixes.json"), "utf8")),
      procedures: JSON.parse(readFileSync(join(dir, "procedures.json"), "utf8")),
      sids: JSON.parse(readFileSync(join(dir, "sids.json"), "utf8")),
    };
    const loaded = parseCatalogFiles(files);
    expect(loaded.airportId).toBe("KCCC");
    expect(loaded.fixes.some((row) => row.id === "FARST")).toBe(true);
    expect(loaded.fixes.some((row) => row.id === "FARSD")).toBe(true);
    expect(loaded.fixes.some((row) => row.id === "FIBB")).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("T04-35 AC5 — pack emit is catalog-only; maps/spawns/MVA/ATPA stay separate", () => {
  const result = packFromText(buildFarRefSubset("KBBB"), {
    inPath: "in.cifp",
    airportId: "KBBB",
    radiusNm: 20,
    outDir: "out/kbbb",
    dryRun: false,
  });
  const names = Object.keys(result.pack.serialized);
  expect(names.sort()).toEqual([...CATALOG_PACK_FILES].sort());
  expect(names.some((name) => name.includes("map") || name.includes("mva"))).toBe(false);
  expect(result.pack.serialized["atpa-volumes.json"]).toBeUndefined();
  const catalogJson = result.pack.files.catalog as { files: Record<string, string> };
  expect(catalogJson.files.atpaVolumes).toBeUndefined();
  const blob = Object.values(result.pack.serialized).join("\n");
  expect(blob).not.toMatch(/videoMapSet|spawns|mva/);
});

test("T04-35 AC5 — src does not import cifp-import; no committed KATL pack", () => {
  expect(existsSync(join(repoRoot, "src/scenario/data/katl"))).toBe(false);
  const playable = JSON.parse(
    readFileSync(join(repoRoot, "src/scenario/playable-scenarios.json"), "utf8"),
  ) as { scenarios: { airportIcao: string; default: boolean }[] };
  expect(playable.scenarios.some((row) => row.default && row.airportIcao === "KDEM")).toBe(true);
  expect(playable.scenarios.some((row) => row.airportIcao === "KATL")).toBe(false);
  for (const file of walkTs(join(repoRoot, "src"))) {
    if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) {
      continue;
    }
    const text = readFileSync(file, "utf8");
    expect(text.includes("cifp-import") || text.includes("tools/cifp"), file).toBe(false);
  }
});

test("T04-35 — extract-katl-slice stays a thin default-flag wrapper", () => {
  const applied = applyKatlPackDefaults(["--in", "local.cifp", "--out", "out/katl"]);
  expect(applied).toEqual(
    expect.arrayContaining([
      "--in",
      "local.cifp",
      "--out",
      "out/katl",
      "--airport",
      KATL_DEFAULT_AIRPORT,
      "--radius",
      String(KATL_DEFAULT_RADIUS_NM),
    ]),
  );
  const src = readFileSync(join(here, "extract-katl-slice.ts"), "utf8");
  expect(src).not.toMatch(/parseFixedWidth|parseCifpSubset|selectByRadius|closeProcedure/);
  expect(src).not.toMatch(/if\s*\([^)]*KATL/);
});
