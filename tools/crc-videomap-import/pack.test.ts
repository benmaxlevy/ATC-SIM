import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { join } from "node:path";
import { parseVideoMapCatalog, parseVideoMapFile } from "../../src/scenario/loadVideoMaps.ts";
import cleanupGeojson from "../../testdata/crc-videomaps/geojson-cleanup.json";
import emptyGeojson from "../../testdata/crc-videomaps/geojson-empty.json";
import geometryGeojson from "../../testdata/crc-videomaps/geojson-geometry.json";
import packMetadata from "../../testdata/crc-videomaps/pack-metadata.json";
import { parseCrcArtccMaps } from "./parse.ts";
import {
  buildFacilityVideoMapPack,
  formatPackReport,
  PACK_ATTRIBUTION_FILE,
  PACK_CATALOG_FILE,
  PACK_GROUPS_FILE,
  PACK_MANIFEST_FILE,
  parsePackCliArgs,
  prettyJson,
  selectFacilityStarsInventory,
  writeFacilityVideoMapPack,
} from "./pack.ts";
import { CRC_A80_FACILITY_ID } from "./paths.ts";
import { runCli, type CliIo } from "./cli.ts";

const KATL_WEST = { latDeg: 33.6367, lonDeg: -84.4278638888889 };

function memoryIo(files: Map<string, string>): { io: CliIo; stderr: () => string } {
  let stderr = "";
  return {
    stderr: () => stderr,
    io: {
      readFile: (path) => {
        const body = files.get(path);
        if (body === undefined) {
          throw new Error(`missing ${path}`);
        }
        return body;
      },
      writeFile: (path, body) => {
        files.set(path, body);
      },
      stdout: () => {
        throw new Error("stdout should not be used");
      },
      stderr: (body) => {
        stderr += body;
      },
    },
  };
}

function geometryById(): Map<string, unknown> {
  return new Map<string, unknown>([
    ["01SYNCVT00000000000000001", geometryGeojson],
    ["01SYNCVT00000000000000002", cleanupGeojson],
    ["01SYNCVT00000000000000004", emptyGeojson],
    ["01SYNCVT00000000000000136", geometryGeojson],
    ["01SYNCVT00000000000000TAG", geometryGeojson],
    ["01SYNCVT0000000000000ZTLX", geometryGeojson],
  ]);
}

test("selectFacilityStarsInventory unions assigned ULIDs with A80+STARS tags; not DCB-only", () => {
  const artcc = parseCrcArtccMaps(packMetadata);
  const selected = selectFacilityStarsInventory(artcc, CRC_A80_FACILITY_ID);
  expect(selected.assigned.map((row) => row.id)).toEqual([
    "01SYNCVT00000000000000001",
    "01SYNCVT00000000000000002",
    "01SYNCVT00000000000000003",
    "01SYNCVT00000000000000004",
    "01SYNCVT00000000000000136",
  ]);
  expect(selected.taggedExtras.map((row) => row.id)).toEqual(["01SYNCVT00000000000000TAG"]);
  expect(selected.inventory.map((row) => row.id)).toEqual([
    "01SYNCVT00000000000000001",
    "01SYNCVT00000000000000002",
    "01SYNCVT00000000000000003",
    "01SYNCVT00000000000000004",
    "01SYNCVT00000000000000136",
    "01SYNCVT00000000000000TAG",
  ]);
  expect(selected.inventory.some((row) => row.id === "01SYNCVT0000000000000ZTLX")).toBe(false);
  expect(selected.groups.mapsAbsentFromGroups.map((row) => row.starsId)).toEqual([13, 14, 136]);
  expect(selected.inventory.map((row) => row.id)).not.toEqual(["1", "2", "3", "4", "5", "6"]);
});

test("pack keeps GEO-only maps, omits dcbNumber, and records empty-geometry failures", () => {
  const artcc = parseCrcArtccMaps(packMetadata);
  const pack = buildFacilityVideoMapPack(artcc, geometryById(), {
    facilityId: CRC_A80_FACILITY_ID,
    icao: "KATL",
    arp: KATL_WEST,
  });
  expect(pack.manifest.sourceCount).toBe(6);
  expect(pack.manifest.assignedCount).toBe(5);
  expect(pack.manifest.taggedUnionExtraCount).toBe(1);
  expect(pack.manifest.outputCount).toBe(4);
  expect(pack.manifest.skippedMaps).toBe(2);
  expect(pack.manifest.outputIds).toEqual([
    "01SYNCVT00000000000000001",
    "01SYNCVT00000000000000002",
    "01SYNCVT00000000000000136",
    "01SYNCVT00000000000000TAG",
  ]);
  expect(pack.manifest.outputIds).not.toContain("1");
  expect(pack.manifest.failures.map((row) => row.mapId)).toEqual([
    "01SYNCVT00000000000000003",
    "01SYNCVT00000000000000004",
  ]);
  expect(pack.manifest.failures[0]?.reason).toBe("missing-geojson");
  expect(pack.manifest.failures[1]?.reason).toBe("no-valid-features");
  expect(pack.manifest.mapsAbsentFromGroups).toContain("01SYNCVT00000000000000136");
  expect(pack.manifest.skippedByReason["no-valid-features"]).toBeGreaterThan(0);
  expect(pack.catalog.icao).toBe("KATL");
  expect(pack.catalog.frame).toBe("arp-enu-nm");
  expect(pack.catalog.maps.every((entry) => !("dcbNumber" in entry))).toBe(true);
  expect(pack.catalog.maps.map((entry) => entry.id)).toEqual(pack.manifest.outputIds);
  const geo = pack.catalog.maps.find((entry) => entry.id === "01SYNCVT00000000000000136");
  expect(geo?.dcbLabel).toBe("136");
  expect(geo?.defaultOn).toBe(false);
  const lines = pack.catalog.maps.find((entry) => entry.id === "01SYNCVT00000000000000001");
  expect(lines?.dcbLabel).toBe("LINES");
  expect(lines?.defaultOn).toBe(true);
  expect(lines?.color).toBe("map");
  const dim = pack.catalog.maps.find((entry) => entry.id === "01SYNCVT00000000000000002");
  expect(dim?.color).toBe("mapDim");
  expect(
    pack.catalog.maps.find((entry) => entry.id === "01SYNCVT00000000000000TAG")?.dcbLabel,
  ).toBe("TAGEXTRA");
  expect(pack.groups.mapsAbsentFromGroups).toContain("01SYNCVT00000000000000136");
  expect(pack.groups.groups[0]?.main.map((slot) => slot.starsId)).toEqual([
    11,
    12,
    null,
    null,
    null,
    null,
  ]);
  expect(pack.groups.groups[0]?.main[0]?.mapId).toBe("01SYNCVT00000000000000001");
  expect(pack.attribution).toMatch(/permitted local CRC\/vNAS STARS A80/);
  expect(pack.attribution).toMatch(/runtime does not read CRC/i);
  const parsedCatalog = parseVideoMapCatalog(JSON.parse(prettyJson(pack.catalog)), "KATL");
  expect(parsedCatalog.maps[0]?.dcbNumber).toBeUndefined();
  expect(parsedCatalog.maps[0]?.id).toBe("01SYNCVT00000000000000001");
  for (const converted of pack.maps) {
    parseVideoMapFile(converted.file, converted.file.id, `${converted.file.id}.json`);
    expect(converted.file.note).toMatch(/CRC ULID/);
    expect(converted.file.note).toMatch(/frame arp-enu-nm/);
  }
  const report = formatPackReport(pack);
  expect(report).toMatch(/source=6/);
  expect(report).toMatch(/output=4/);
  expect(report).toMatch(/skippedMaps=2/);
  expect(report).toMatch(/mapsAbsentFromGroups=3/);
});

test("parsePackCliArgs defaults facility A80 and icao KATL; dry-run skips --out", () => {
  expect(() => parsePackCliArgs([])).toThrow(/Missing --metadata/);
  expect(
    parsePackCliArgs([
      "--metadata",
      "m.json",
      "--maps",
      "maps",
      "--arp",
      "33.6367,-84.4278638888889",
      "--dry-run",
    ]),
  ).toEqual({
    metadataPath: "m.json",
    mapsDir: "maps",
    arpLat: 33.6367,
    arpLon: -84.4278638888889,
    outDir: null,
    dryRun: true,
    icao: "KATL",
    facilityId: "A80",
  });
});

test("pack CLI dry-run reports counts and writes nothing; write emits catalog without dcbNumber", () => {
  const files = new Map<string, string>([
    ["meta.json", JSON.stringify(packMetadata)],
    [join("maps", "01SYNCVT00000000000000001.geojson"), JSON.stringify(geometryGeojson)],
    [join("maps", "01SYNCVT00000000000000002.geojson"), JSON.stringify(cleanupGeojson)],
    [join("maps", "01SYNCVT00000000000000004.geojson"), JSON.stringify(emptyGeojson)],
    [join("maps", "01SYNCVT00000000000000136.geojson"), JSON.stringify(geometryGeojson)],
    [join("maps", "01SYNCVT00000000000000TAG.geojson"), JSON.stringify(geometryGeojson)],
    [join("maps", "01SYNCVT0000000000000ZTLX.geojson"), JSON.stringify(geometryGeojson)],
  ]);
  const { io, stderr } = memoryIo(files);
  runCli(
    [
      "pack",
      "--metadata",
      "meta.json",
      "--maps",
      "maps",
      "--arp-lat",
      "33.6367",
      "--arp-lon",
      "-84.4278638888889",
      "--dry-run",
    ],
    io,
  );
  const log = stderr();
  expect(log).toMatch(/crc-videomaps pack: facility A80 icao KATL/);
  expect(log).toMatch(/source=6 assigned=5 taggedExtra=1 output=4 skippedMaps=2/);
  expect(log).toMatch(/missing-geojson=1/);
  expect(log).toMatch(/no-valid-features=/);
  expect([...files.keys()].some((path) => path.includes("catalog.json"))).toBe(false);
  expect(files.has(join("maps", "01SYNCVT0000000000000ZTLX.geojson"))).toBe(true);

  const artcc = parseCrcArtccMaps(packMetadata);
  const pack = buildFacilityVideoMapPack(artcc, geometryById(), {
    facilityId: CRC_A80_FACILITY_ID,
    icao: "KATL",
    arp: KATL_WEST,
  });
  writeFacilityVideoMapPack(pack, "out", io);
  const catalog = JSON.parse(files.get(join("out", PACK_CATALOG_FILE))!) as {
    maps: Array<{ id: string; dcbNumber?: number }>;
  };
  expect(catalog.maps.every((entry) => entry.dcbNumber === undefined)).toBe(true);
  expect(files.has(join("out", PACK_GROUPS_FILE))).toBe(true);
  expect(files.has(join("out", PACK_MANIFEST_FILE))).toBe(true);
  expect(files.get(join("out", PACK_ATTRIBUTION_FILE))).toMatch(/Not NAS-certified/);
  expect(files.has(join("out", "01SYNCVT00000000000000001.json"))).toBe(true);
  expect(files.has(join("out", "01SYNCVT00000000000000003.json"))).toBe(false);
  expect(files.has(join("out", "01SYNCVT00000000000000004.json"))).toBe(false);
  expect(files.has(join("out", "01SYNCVT0000000000000ZTLX.json"))).toBe(false);
  const written = JSON.parse(files.get(join("out", "01SYNCVT00000000000000001.json"))!) as {
    id: string;
    note: string;
  };
  expect(written.id).toBe("01SYNCVT00000000000000001");
  expect(written.note).toMatch(/starsId 11/);
  expect(written.note).toMatch(/LINES\.geojson/);
  expect(written.note).toMatch(/brightness A→map/);
});
