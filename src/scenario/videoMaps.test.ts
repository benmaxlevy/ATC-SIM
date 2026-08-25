import { expect, test } from "vitest";
import { loadKdem } from "./load";
import { loadVideoMapSet, parseVideoMapFile } from "./loadVideoMaps";

test("AC1 — loadKdem videoMapSet is KDEM with RWY, LOC, COAST plus extras", () => {
  const maps = loadKdem().maps;
  expect(maps.videoMapSet).toBe("KDEM");
  const ids = maps.videoMaps.map((item) => item.id);
  expect(ids.some((id) => id.includes("RWY"))).toBe(true);
  expect(ids.some((id) => id.includes("LOC"))).toBe(true);
  expect(ids).toContain("COAST");
  expect(ids.length).toBeGreaterThan(3);
  expect(ids).toEqual(["RWY27", "LOC27", "COAST", "DWNWND", "CLASS_B", "DEM1", "BAY1_SID"]);
});

test("KDEM catalog loads MAPS in ARP ENU NM including DEM1 STAR and BAY1 SID", () => {
  const maps = loadVideoMapSet("KDEM");
  expect(maps.map((item) => item.id)).toEqual([
    "RWY27",
    "LOC27",
    "COAST",
    "DWNWND",
    "CLASS_B",
    "DEM1",
    "BAY1_SID",
  ]);
  expect(maps.every((item) => item.dcbNumber >= 1)).toBe(true);
  const coast = maps.find((item) => item.id === "COAST");
  expect(coast?.note?.toLowerCase()).toMatch(/fictional/);
  expect(maps.find((item) => item.id === "DWNWND")?.color).toBe("mapDim");
  expect(maps.find((item) => item.id === "CLASS_B")?.color).toBe("mapDim");
  expect(maps.find((item) => item.id === "DEM1")?.color).toBe("map");
  expect(maps.find((item) => item.id === "DEM1")?.defaultOn).toBe(true);
  expect(maps.find((item) => item.id === "BAY1_SID")?.color).toBe("map");
  expect(maps.find((item) => item.id === "BAY1_SID")?.defaultOn).toBe(true);
});

test("AC2 — loadKdem derives runway / loc / coast from the catalog", () => {
  const maps = loadKdem().maps;
  expect(maps.runway).toMatchObject({
    id: "27",
    thresholdEastNm: 0,
    thresholdNorthNm: 0,
    lengthNm: 1.5,
    headingTrueDeg: 270,
    widthNm: 0.025,
  });
  expect(maps.localizer).toMatchObject({
    runwayId: "27",
    courseTrueDeg: 270,
    featherLengthNm: 10,
    halfWidthDeg: 2.5,
  });
  expect(maps.coastline?.enabled).toBe(true);
  expect(maps.coastline?.polyline.length).toBeGreaterThan(3);
});

test("AC4 — missing video-maps/KJFK/catalog.json throws", () => {
  expect(() => loadVideoMapSet("KJFK")).toThrow(/Missing video map file/);
  expect(() => loadVideoMapSet("KJFK")).toThrow(/video-maps\/KJFK\/catalog\.json/);
});

test("AC4 — catalog id mismatch throws", () => {
  expect(() =>
    parseVideoMapFile(
      {
        id: "WRONG",
        name: "Runway 27",
        features: [
          {
            type: "polyline",
            pointsNm: [
              [0, 0],
              [1, 0],
            ],
          },
        ],
      },
      "RWY27",
      "KDEM/001-rwy27.json",
    ),
  ).toThrow(/does not match catalog id/);
});

test("AC6 — loader comments say video map / MAPS, not tiles; Not OSM", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const loader = sources["./loadVideoMaps.ts"] ?? "";
  expect(loader).toMatch(/MAPS/);
  expect(loader).toMatch(/video-map/i);
  expect(loader).toMatch(/Not OSM/);
  expect(loader).toMatch(/tiles/);
  expect(loader.toLowerCase()).not.toMatch(/openstreetmap/);
  expect(loader.toLowerCase()).not.toMatch(/mapbox/);
});
