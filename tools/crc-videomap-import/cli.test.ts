import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { join } from "node:path";
import { parseVideoMapFile } from "../../src/scenario/loadVideoMaps.ts";
import convertMetadata from "../../testdata/crc-videomaps/convert-metadata.json";
import cleanupGeojson from "../../testdata/crc-videomaps/geojson-cleanup.json";
import emptyGeojson from "../../testdata/crc-videomaps/geojson-empty.json";
import geometryGeojson from "../../testdata/crc-videomaps/geojson-geometry.json";
import { parseCliArgs, runCli, type CliIo } from "./cli.ts";
import { CRC_LOCAL_ARTCC_METADATA_PATH, CRC_LOCAL_VIDEOMAP_DIR } from "./paths.ts";

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

test("parseCliArgs requires metadata, maps, ARP, and out unless dry-run", () => {
  expect(() => parseCliArgs([])).toThrow(/Missing --metadata/);
  expect(() => parseCliArgs(["--metadata", "m.json"])).toThrow(/Missing --maps/);
  expect(() => parseCliArgs(["--metadata", "m.json", "--maps", "maps"])).toThrow(/Missing --arp/);
  expect(() =>
    parseCliArgs(["--metadata", "m.json", "--maps", "maps", "--arp-lat", "33.6367"]),
  ).toThrow(/Missing --arp/);
  expect(() =>
    parseCliArgs([
      "--metadata",
      "m.json",
      "--maps",
      "maps",
      "--arp-lat",
      "33.6367",
      "--arp-lon",
      "-84.4278638888889",
    ]),
  ).toThrow(/Missing --out/);
  expect(
    parseCliArgs([
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
  });
  expect(CRC_LOCAL_ARTCC_METADATA_PATH).toMatch(/ARTCCs\\ZTL\.json$/);
  expect(CRC_LOCAL_VIDEOMAP_DIR).toMatch(/VideoMaps\\ZTL$/);
});

test("CLI dry-run reports map counts, feature counts, skipped data, and NM bounds", () => {
  const files = new Map<string, string>([
    ["meta.json", JSON.stringify(convertMetadata)],
    [join("maps", "01SYNCVT00000000000000001.geojson"), JSON.stringify(geometryGeojson)],
    [join("maps", "01SYNCVT00000000000000002.geojson"), JSON.stringify(cleanupGeojson)],
    [join("maps", "01SYNCVT00000000000000004.geojson"), JSON.stringify(emptyGeojson)],
  ]);
  const { io, stderr } = memoryIo(files);
  runCli(
    ["--metadata", "meta.json", "--maps", "maps", "--arp-lat", "0", "--arp-lon", "0", "--dry-run"],
    io,
  );
  const log = stderr();
  expect(log).toMatch(/maps input=4 converted=2 skipped=2/);
  expect(log).toMatch(/features converted=/);
  expect(log).toMatch(/skipped /);
  expect(log).toMatch(/missing-geojson=1/);
  expect(log).toMatch(/null-geometry=/);
  expect(log).toMatch(/bounds NM east=/);
  expect(
    [...files.keys()].some((path) => path.endsWith(".json") && path.includes("01SYNCVT")),
  ).toBe(false);
});

test("CLI writes ULID-named VideoMapFile JSON and maps A to map, B to mapDim", () => {
  const files = new Map<string, string>([
    ["meta.json", JSON.stringify(convertMetadata)],
    [join("maps", "01SYNCVT00000000000000001.geojson"), JSON.stringify(geometryGeojson)],
    [join("maps", "01SYNCVT00000000000000002.geojson"), JSON.stringify(cleanupGeojson)],
  ]);
  const { io, stderr } = memoryIo(files);
  runCli(
    [
      "--metadata",
      "meta.json",
      "--maps",
      "maps",
      "--arp",
      "33.6367,-84.4278638888889",
      "--out",
      "out",
    ],
    io,
  );
  const bright = JSON.parse(files.get(join("out", "01SYNCVT00000000000000001.json"))!) as {
    id: string;
    name: string;
    note: string;
    features: unknown[];
  };
  const dim = JSON.parse(files.get(join("out", "01SYNCVT00000000000000002.json"))!) as {
    id: string;
    note: string;
  };
  expect(bright.id).toBe("01SYNCVT00000000000000001");
  expect(bright.id).not.toBe("11");
  expect(bright.note).toMatch(/brightness A→map/);
  expect(bright.note).toMatch(/starsId 11/);
  expect(dim.note).toMatch(/brightness B→mapDim/);
  expect(files.has(join("out", "01SYNCVT00000000000000003.json"))).toBe(false);
  expect(files.has(join("out", "01SYNCVT00000000000000004.json"))).toBe(false);
  parseVideoMapFile(bright, bright.id, "out/01SYNCVT00000000000000001.json");
  expect(stderr()).toMatch(/converted=2 skipped=2/);
});
