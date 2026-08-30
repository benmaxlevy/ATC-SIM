import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readdirSync, readFileSync, statSync } from "node:fs";
// @ts-expect-error tsconfig has no @types/node
import { dirname, join } from "node:path";
// @ts-expect-error tsconfig has no @types/node
import { fileURLToPath } from "node:url";
import {
  loadPlayableScenario,
  listPlayableScenarios,
} from "../../src/scenario/playableScenarios.ts";
import { loadVideoMapSet } from "../../src/scenario/loadVideoMaps.ts";
import {
  assignedVideoMaps,
  crcBrightnessToVideoMapColor,
  crcDcbPositionFromSlotIndex,
  crcInternalMapId,
  mapHasAllTags,
  mapsAbsentFromGroups,
} from "./identity.ts";
import { parseCrcArtccMaps, parseCrcVideoMap, starsFacilityById } from "./parse.ts";
import { CRC_A80_FACILITY_ID, CRC_A80_STARS_TAGS, CRC_LOCAL_ARTCC_METADATA_PATH } from "./paths.ts";
import { CRC_DCB_MAIN_COUNT, CRC_DCB_SLOT_COUNT, type NormalizedCrcVideoMap } from "./types.ts";
import fixture from "../../testdata/crc-videomaps/source-schema-fixture.json";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");

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

function byId(maps: readonly NormalizedCrcVideoMap[], id: string): NormalizedCrcVideoMap {
  const hit = maps.find((row) => row.id === id);
  if (hit === undefined) {
    throw new Error(`missing ${id}`);
  }
  return hit;
}

test("normalized record preserves ULID, starsId, title, short name, source, A/B, TDM, tags", () => {
  const fetchWas = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("CRC videomap import must not fetch");
  };
  try {
    const artcc = parseCrcArtccMaps(fixture);
    const bright = byId(artcc.videoMaps, "01SYNMAPA00000000000000001");
    expect(bright).toMatchObject({
      id: "01SYNMAPA00000000000000001",
      starsId: 1,
      title: "SYN CLASS B",
      shortName: "CLASS B",
      sourceFilename: "BRAVO.geojson",
      brightness: "B",
      tdm: false,
      tags: ["STARS", "A80"],
    });
    expect(crcBrightnessToVideoMapColor(bright.brightness ?? "A")).toBe("mapDim");
    const tdm = byId(artcc.videoMaps, "01SYNMAPA00000000000000998");
    expect(tdm.tdm).toBe(true);
    expect(tdm.alwaysVisible).toBe(true);
    expect(tdm.starsId).toBe(998);
    expect(tdm.tags).toEqual(["TDM", "STARS"]);
  } finally {
    globalThis.fetch = fetchWas;
  }
});

test("sparse starsIds, duplicate short names, missing source metadata, and TDM flags", () => {
  const artcc = parseCrcArtccMaps(fixture);
  const starsIds = artcc.videoMaps
    .map((row) => row.starsId)
    .filter((id): id is number => id !== undefined);
  expect(starsIds).toEqual([1, 3, 7, 136, 998, 998]);
  expect(starsIds).not.toEqual([1, 2, 3, 4, 5, 6]);
  const shortNames = artcc.videoMaps.map((row) => row.shortName);
  expect(shortNames.filter((name) => name === "CLASS B")).toHaveLength(2);
  const missingSource = byId(artcc.videoMaps, "01SYNMAPA00000000000000003");
  expect(missingSource.sourceFilename).toBeUndefined();
  expect(missingSource.title).toBe("SYN MVA");
  expect(missingSource.brightness).toBe("A");
  expect(artcc.videoMaps.filter((row) => row.tdm).map((row) => row.id)).toEqual([
    "01SYNMAPA00000000000000998",
    "01SYNMAPB00000000000000998",
  ]);
  const duplicateStars = artcc.videoMaps.filter((row) => row.starsId === 998);
  expect(duplicateStars.map((row) => row.id)).toEqual([
    "01SYNMAPA00000000000000998",
    "01SYNMAPB00000000000000998",
  ]);
  expect(crcInternalMapId(duplicateStars[0]!)).not.toBe(crcInternalMapId(duplicateStars[1]!));
});

test("internal identity stays ULID; DCB group position is optional layout", () => {
  const artcc = parseCrcArtccMaps(fixture);
  const facility = starsFacilityById(artcc, CRC_A80_FACILITY_ID);
  const assigned = assignedVideoMaps(artcc.videoMaps, facility.videoMapIds);
  expect(assigned.map((row) => row.id)).toEqual(facility.videoMapIds);
  expect(assigned.some((row) => row.id === "01SYNMAPB00000000000000998")).toBe(false);

  const group = facility.mapGroups[0]!;
  expect(group.mapIds).toHaveLength(CRC_DCB_SLOT_COUNT);
  expect(group.mapIds[2]).toBeNull();
  expect(group.mapIds.slice(0, CRC_DCB_MAIN_COUNT)).toEqual([3, 1, null, 998, 3, 1]);
  const mainSlot = crcDcbPositionFromSlotIndex(group.id, 0);
  const submenuSlot = crcDcbPositionFromSlotIndex(group.id, CRC_DCB_MAIN_COUNT);
  const geoOnly = mapsAbsentFromGroups(assigned, facility.mapGroups);
  expect(geoOnly.map((row) => row.starsId)).toEqual([136]);
  for (const row of assigned) {
    expect(crcInternalMapId(row)).toBe(row.id);
    expect(crcInternalMapId(row)).not.toBe(String(row.starsId));
    expect(crcInternalMapId(row)).not.toBe(`${mainSlot.groupId}:${mainSlot.mainIndex}`);
    expect(crcInternalMapId(row)).not.toBe(`${submenuSlot.groupId}:${submenuSlot.submenuIndex}`);
  }
  expect(assigned.filter((row) => mapHasAllTags(row, CRC_A80_STARS_TAGS))).toHaveLength(4);
  expect(CRC_LOCAL_ARTCC_METADATA_PATH).toMatch(/ARTCCs\\ZTL\.json$/);
});

test("schema keeps facility inventory independent of group layout", () => {
  const artcc = parseCrcArtccMaps(fixture);
  const facility = starsFacilityById(artcc, "A80");
  expect(facility.facilityName).toBe("Synthetic TRACON");
  expect(facility.facilityType).toBe("Tracon");
  expect(facility.videoMapIds).toHaveLength(5);
  expect(facility.mapGroups[0]?.tcps).toEqual(["1N", "1S"]);
  expect(facility.mapGroups[0]?.mapIds.includes(136)).toBe(false);
  expect(facility.videoMapIds).toContain("01SYNMAPA00000000000000136");
});

test("malformed source rows throw with a path; duplicate ULIDs are rejected", () => {
  expect(() => parseCrcVideoMap({ name: "NO ID" }, "videoMaps[0]")).toThrow(/videoMaps\[0\]\.id/);
  expect(() =>
    parseCrcVideoMap({ id: "U1", name: "X", starsBrightnessCategory: "C" }, "videoMaps[0]"),
  ).toThrow(/must be "A" or "B"/);
  expect(() =>
    parseCrcArtccMaps({
      videoMaps: [
        { id: "U1", name: "A" },
        { id: "U1", name: "B" },
      ],
    }),
  ).toThrow(/duplicate ULID U1/);
  expect(() =>
    parseCrcArtccMaps({
      videoMaps: [],
      facility: {
        childFacilities: [
          {
            id: "A80",
            name: "X",
            starsConfiguration: { videoMapIds: [1], mapGroups: [] },
          },
        ],
      },
    }),
  ).toThrow(/ULID/);
  expect(() =>
    parseCrcArtccMaps({
      videoMaps: [{ id: "U1", name: "A" }],
      facility: {
        childFacilities: [
          {
            id: "A80",
            name: "X",
            starsConfiguration: {
              videoMapIds: ["U1"],
              mapGroups: [{ id: "G1", mapIds: ["U1"] }],
            },
          },
        ],
      },
    }),
  ).toThrow(/starsId integer or null/);
});

test("src does not import tools/crc-videomap-import", () => {
  const srcRoot = join(repoRoot, "src");
  for (const file of walkTs(srcRoot)) {
    const text = readFileSync(file, "utf8");
    expect(text.includes("crc-videomap-import") || text.includes("tools/crc"), file).toBe(false);
  }
});

test("existing KDEM and KATL video-map loading remains unchanged", () => {
  expect(loadVideoMapSet("KDEM").map((row) => row.id)).toEqual([
    "RWY",
    "LOC27",
    "LOC09",
    "DEM1_27",
    "DEM1_09",
    "BAY1_27",
    "BAY1_09",
  ]);
  const listed = listPlayableScenarios();
  const katl = listed.filter((row) => row.airportIcao === "KATL");
  expect(katl.length).toBeGreaterThan(0);
  for (const entry of katl) {
    const scenario = loadPlayableScenario(entry.id);
    expect(scenario.maps.videoMapSet).toBeUndefined();
    expect(scenario.maps.videoMaps).toEqual([]);
    expect(scenario.maps.loadedVideoMaps).toEqual([]);
  }
});
