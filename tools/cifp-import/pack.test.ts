import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
// @ts-expect-error tsconfig has no @types/node
import { dirname, join } from "node:path";
// @ts-expect-error tsconfig has no @types/node
import { fileURLToPath } from "node:url";
import { parseCatalogFiles } from "../../src/scenario/procedures/loadCatalog.ts";
import { buildFixedWidthSubset, buildIcaoFixedWidthSubset } from "./fixedWidthRecords.ts";
import {
  CATALOG_PACK_FILES,
  closurePolicyFromPackArgs,
  formatPackReport,
  packFromText,
  parsePackCliArgs,
  parseSourceForPack,
  radiusSeedToClosureSeed,
  runPackCli,
  writeCatalogPack,
  type PackCliArgs,
  type PackIo,
} from "./pack.ts";
import { selectByRadius } from "./spatialIndex.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");

function ksynArgs(extra: Partial<PackCliArgs> = {}): PackCliArgs {
  return {
    inPath: "in.cifp",
    airportId: "KSYN",
    radiusNm: 40,
    outDir: "out/ksyn",
    dryRun: false,
    ...extra,
  };
}

function memoryIo(
  files: Map<string, string>,
  writes: string[] = [],
): PackIo & { stderrText: () => string } {
  let stderr = "";
  return {
    readFile: (path) => {
      const body = files.get(path);
      if (body === undefined) {
        throw new Error(`missing ${path}`);
      }
      return body;
    },
    writeFile: (path, body) => {
      writes.push(path);
      files.set(path, body);
    },
    stdout: () => {
      throw new Error("stdout should not be used by pack");
    },
    stderr: (body) => {
      stderr += body;
    },
    stderrText: () => stderr,
  };
}

test("parsePackCliArgs requires --in --airport --radius --out and accepts --sids", () => {
  expect(
    parsePackCliArgs([
      "--in",
      "a.cifp",
      "--airport",
      "ksyn",
      "--radius",
      "40",
      "--out",
      "out/ksyn",
      "--sids",
      "DEP1",
      "--stars",
      "DEM1",
      "--approaches",
      "ILS27",
    ]),
  ).toEqual({
    inPath: "a.cifp",
    airportId: "KSYN",
    radiusNm: 40,
    sidIds: ["DEP1"],
    starIds: ["DEM1"],
    approachIds: ["ILS27"],
    outDir: "out/ksyn",
    dryRun: false,
  });
});

test("parsePackCliArgs accepts comma and repeated --sids lists", () => {
  const parsed = parsePackCliArgs([
    "--in",
    "a.cifp",
    "--airport",
    "KSYN",
    "--radius",
    "20",
    "--out",
    "out",
    "--sids",
    "DEP1,dep2",
    "--sids",
    "DEP3",
  ]);
  expect(parsed.sidIds).toEqual(["DEP1", "DEP2", "DEP3"]);
});

test("negative — missing --in, invalid airport, invalid radius", () => {
  expect(() => parsePackCliArgs(["--airport", "KSYN", "--radius", "40", "--out", "o"])).toThrow(
    /Missing --in/,
  );
  expect(() =>
    parsePackCliArgs(["--in", "a.cifp", "--airport", "12", "--radius", "40", "--out", "o"]),
  ).toThrow(/Invalid airport/);
  expect(() =>
    parsePackCliArgs(["--in", "a.cifp", "--airport", "TOOLONGX", "--radius", "40", "--out", "o"]),
  ).toThrow(/Invalid airport/);
  expect(() =>
    parsePackCliArgs(["--in", "a.cifp", "--airport", "KSYN", "--radius", "-1", "--out", "o"]),
  ).toThrow(/Invalid radius/);
  expect(() =>
    parsePackCliArgs(["--in", "a.cifp", "--airport", "KSYN", "--radius", "nope", "--out", "o"]),
  ).toThrow(/Invalid radius/);
});

test("explicit --sids/--stars/--approaches use ClosurePolicy.kind explicit", () => {
  expect(closurePolicyFromPackArgs(ksynArgs()).kind).toBe("airport-all");
  expect(
    closurePolicyFromPackArgs(
      ksynArgs({ sidIds: ["DEP1"], starIds: ["DEM1"], approachIds: ["ILS27"] }),
    ),
  ).toEqual({
    kind: "explicit",
    sidIds: ["DEP1"],
    starIds: ["DEM1"],
    approachIds: ["ILS27"],
    onError: "fail",
  });
});

test("radiusSeedToClosureSeed wraps selected arrays", () => {
  const source = parseSourceForPack(buildFixedWidthSubset());
  const seed = selectByRadius(source, { airportId: "KSYN", radiusNm: 40 });
  const closureSeed = radiusSeedToClosureSeed(seed);
  expect(closureSeed.airportId).toBe("KSYN");
  expect(closureSeed.radiusNm).toBe(40);
  expect(closureSeed.selected.airports).toEqual(seed.airports);
  expect(closureSeed.selected.sids).toEqual(seed.sids);
  expect(closureSeed.selected.stars).toEqual(seed.stars);
  expect(closureSeed.selected.approaches).toEqual(seed.approaches);
});

test("AC1 — generic pack writes a valid SID/STAR/approach catalog for a synthetic second airport", () => {
  const text = buildIcaoFixedWidthSubset("KBBB");
  const result = packFromText(text, {
    inPath: "in.cifp",
    airportId: "KBBB",
    radiusNm: 40,
    outDir: "out/kbbb",
    dryRun: false,
  });
  expect(result.pack.catalog.airportId).toBe("KBBB");
  expect(result.pack.catalog.sids.some((row) => row.id === "DEP1")).toBe(true);
  expect(result.pack.catalog.stars.some((row) => row.id === "DEM1")).toBe(true);
  expect(result.pack.catalog.approaches.some((row) => row.id === "ILS27")).toBe(true);
  const loaded = parseCatalogFiles(result.pack.files);
  expect(loaded.airportId).toBe("KBBB");
  expect(loaded.sids).toHaveLength(1);
  expect(loaded.stars).toHaveLength(1);
  expect(loaded.approaches).toHaveLength(1);
  const names = Object.keys(result.pack.serialized).sort();
  for (const file of CATALOG_PACK_FILES) {
    expect(names).toContain(file);
  }
});

test("AC1 — pack has no ICAO conditional; KBBB and KSYN share one pipeline", () => {
  const a = packFromText(buildIcaoFixedWidthSubset("KBBB"), {
    inPath: "in.cifp",
    airportId: "KBBB",
    radiusNm: 40,
    outDir: "out/kbbb",
    dryRun: false,
  });
  const b = packFromText(buildFixedWidthSubset(), ksynArgs());
  expect(a.pack.catalog.airportId).toBe("KBBB");
  expect(b.pack.catalog.airportId).toBe("KSYN");
  expect(a.pack.catalog.sids[0]?.id).toBe(b.pack.catalog.sids[0]?.id);
  expect(a.pack.catalog.stars[0]?.id).toBe(b.pack.catalog.stars[0]?.id);
});

test("AC2 — KATL-shaped fixture packs through the generic pipeline", () => {
  const text = buildIcaoFixedWidthSubset("KATL");
  const result = packFromText(text, {
    inPath: "in.cifp",
    airportId: "KATL",
    radiusNm: 40,
    outDir: "out/katl",
    dryRun: false,
    sidIds: ["DEP1"],
    starIds: ["DEM1"],
    approachIds: ["ILS27"],
  });
  expect(result.policy.kind).toBe("explicit");
  expect(result.pack.catalog.airportId).toBe("KATL");
  expect(result.pack.catalog.stars.map((row) => row.id)).toEqual(["DEM1"]);
  expect(result.pack.catalog.approaches.map((row) => row.id)).toEqual(["ILS27"]);
  expect(result.pack.catalog.sids.map((row) => row.id)).toEqual(["DEP1"]);
  const packed = readFileSync(join(here, "pack.ts"), "utf8");
  expect(packed).not.toMatch(/if\s*\([^)]*(icao|airportId)\s*===\s*["']KATL["']/);
  expect(packed).not.toMatch(/["']KATL["']\s*===\s*(icao|airportId)/);
});

test("AC3 — dry-run reports seed vs closure counts and unsupported records without writing", () => {
  const files = new Map<string, string>([["in.cifp", buildFixedWidthSubset()]]);
  const writes: string[] = [];
  const io = memoryIo(files, writes);
  runPackCli(
    ["--in", "in.cifp", "--airport", "KSYN", "--radius", "40", "--out", "out/ksyn", "--dry-run"],
    io,
  );
  expect(writes).toEqual([]);
  const report = io.stderrText();
  expect(report).toMatch(/cifp-pack: dry-run/);
  expect(report).toMatch(/seed: /);
  expect(report).toMatch(/added: /);
  expect(report).toMatch(/unsupported records: /);
  expect(report).toMatch(/ER=/);
  expect(report).toMatch(/GARBAGE=/);
  expect(report).toMatch(/out\/ksyn\/catalog\.json/);
});

test("AC3 — two writes are byte-identical", () => {
  const text = buildFixedWidthSubset();
  const a = packFromText(text, ksynArgs());
  const b = packFromText(text, ksynArgs());
  expect(a.pack.serialized).toEqual(b.pack.serialized);
  const files = new Map<string, string>();
  writeCatalogPack(a.pack.serialized, "out/ksyn", (path, body) => {
    files.set(path, body);
  });
  writeCatalogPack(b.pack.serialized, "out/ksyn-b", (path, body) => {
    files.set(path, body);
  });
  for (const file of CATALOG_PACK_FILES) {
    expect(files.get(`out/ksyn/${file}`)).toBe(files.get(`out/ksyn-b/${file}`));
  }
});

test("formatPackReport lists output paths", () => {
  const result = packFromText(buildFixedWidthSubset(), ksynArgs({ dryRun: true }));
  const report = formatPackReport(result, true);
  expect(report).toContain("out/ksyn/sids.json");
  expect(report).toContain("policy: airport-all");
});

test("comma-separated CIFP is rejected by pack", () => {
  const comma = readFileSync(join(repoRoot, "testdata/cifp/frozen-subset.cifp"), "utf8");
  expect(() => parseSourceForPack(comma)).toThrow(/fixed-width/);
});

test("airport missing from source is invalid", () => {
  expect(() => packFromText(buildFixedWidthSubset(), ksynArgs({ airportId: "KZZZ" }))).toThrow(
    /airport KZZZ not in source/,
  );
});

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

test("AC5 — KDEM stays default and no committed KATL pack exists", () => {
  const playable = JSON.parse(
    readFileSync(join(repoRoot, "src/scenario/playable-scenarios.json"), "utf8"),
  ) as { scenarios: { airportIcao: string; default: boolean }[] };
  expect(playable.scenarios.some((row) => row.default && row.airportIcao === "KDEM")).toBe(true);
  expect(playable.scenarios.some((row) => row.airportIcao === "KATL")).toBe(false);
  expect(existsSync(join(repoRoot, "src/scenario/data/katl"))).toBe(false);
});

test("AC4 — pack testdata is synthetic and src does not import the tool", () => {
  const fixture = readFileSync(join(repoRoot, "testdata/cifp/fixed-width-subset.cifp"), "utf8");
  expect(fixture.length).toBeLessThan(20_000);
  expect(fixture).toMatch(/NOT a real cycle/);
  for (const file of walkTs(join(repoRoot, "src"))) {
    const text = readFileSync(file, "utf8");
    expect(text.includes("cifp-import") || text.includes("tools/cifp"), file).toBe(false);
  }
});

test("runPackCli writes the files layout", () => {
  const files = new Map<string, string>([["in.cifp", buildFixedWidthSubset()]]);
  const writes: string[] = [];
  const io = memoryIo(files, writes);
  runPackCli(["--in", "in.cifp", "--airport", "KSYN", "--radius", "40", "--out", "out/ksyn"], io);
  expect(writes.sort()).toEqual(CATALOG_PACK_FILES.map((name) => `out/ksyn/${name}`).sort());
  const catalog = JSON.parse(files.get("out/ksyn/catalog.json")!) as { airportId: string };
  expect(catalog.airportId).toBe("KSYN");
});
