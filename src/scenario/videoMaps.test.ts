import { expect, test } from "vitest";
import { loadKdem } from "./load";
import {
  loadVideoMapSet,
  parseVideoMapCatalog,
  parseVideoMapFile,
  parseVideoMapGroups,
  starsIdFromNote,
} from "./loadVideoMaps";

test("AC1 — loadKdem videoMapSet is KDEM with RWY, LOC plus extras", () => {
  const maps = loadKdem().maps;
  expect(maps.videoMapSet).toBe("KDEM");
  const ids = maps.videoMaps.map((item) => item.id);
  expect(ids.some((id) => id.includes("RWY"))).toBe(true);
  expect(ids.some((id) => id.includes("LOC"))).toBe(true);
  expect(ids.length).toBeGreaterThan(3);
  expect(ids).toEqual(["RWY", "LOC27", "LOC09", "DEM1_27", "DEM1_09", "BAY1_27", "BAY1_09"]);
});

test("KDEM catalog loads MAPS in ARP ENU NM including DEM1 STAR and BAY1 SID for both runways", () => {
  const maps = loadVideoMapSet("KDEM");
  expect(maps.map((item) => item.id)).toEqual([
    "RWY",
    "LOC27",
    "LOC09",
    "DEM1_27",
    "DEM1_09",
    "BAY1_27",
    "BAY1_09",
  ]);
  expect(maps.every((item) => item.dcbNumber !== undefined && item.dcbNumber >= 1)).toBe(true);
  expect(maps.find((item) => item.id === "DEM1_27")?.color).toBe("map");
  expect(maps.find((item) => item.id === "DEM1_27")?.defaultOn).toBe(true);
  expect(maps.find((item) => item.id === "DEM1_09")?.color).toBe("map");
  expect(maps.find((item) => item.id === "DEM1_09")?.defaultOn).toBe(false);
  expect(maps.find((item) => item.id === "BAY1_27")?.color).toBe("map");
  expect(maps.find((item) => item.id === "BAY1_27")?.defaultOn).toBe(true);
  expect(maps.find((item) => item.id === "BAY1_09")?.color).toBe("map");
  expect(maps.find((item) => item.id === "BAY1_09")?.defaultOn).toBe(false);
});

test("AC2 — loadKdem derives runway and loc from the catalog", () => {
  const maps = loadKdem().maps;
  expect(maps.runway).toMatchObject({
    id: "27",
    thresholdEastNm: 0,
    thresholdNorthNm: 0,
    headingTrueDeg: 270,
    widthNm: 0.025,
  });
  expect(maps.localizer).toMatchObject({
    runwayId: "27",
    courseTrueDeg: 270,
    featherLengthNm: 10,
    halfWidthDeg: 2.5,
  });
  expect(maps.coastline).toBeUndefined();
});

test("T04-39 — catalog dcbNumber is optional layout, not identity", () => {
  const catalog = parseVideoMapCatalog(
    {
      icao: "KBBB",
      frame: "arp-enu-nm",
      maps: [
        {
          id: "01GEOONLY00000000000000001",
          file: "01GEOONLY00000000000000001.json",
          dcbLabel: "136",
          defaultOn: false,
          color: "map",
        },
        {
          id: "RWY",
          file: "001-rwy.json",
          dcbNumber: 1,
          dcbLabel: "RWY",
          defaultOn: true,
          color: "map",
        },
      ],
    },
    "KBBB",
  );
  expect(catalog.maps[0]?.id).toBe("01GEOONLY00000000000000001");
  expect(catalog.maps[0]?.id).not.toBe("1");
  expect(catalog.maps[0]?.dcbNumber).toBeUndefined();
  expect(catalog.maps[1]?.dcbNumber).toBe(1);
  expect(() =>
    parseVideoMapCatalog(
      {
        icao: "KBBB",
        frame: "arp-enu-nm",
        maps: [
          {
            id: "X",
            file: "x.json",
            dcbNumber: 0,
            dcbLabel: "X",
            defaultOn: false,
            color: "map",
          },
        ],
      },
      "KBBB",
    ),
  ).toThrow(/dcbNumber/);
});

test("T04-40 — optional catalog starsId is not identity; KDEM omits it", () => {
  const catalog = parseVideoMapCatalog(
    {
      icao: "KBBB",
      frame: "arp-enu-nm",
      maps: [
        {
          id: "01GEOONLY00000000000000001",
          file: "01GEOONLY00000000000000001.json",
          starsId: 136,
          dcbLabel: "40DME F",
          defaultOn: false,
          color: "map",
        },
      ],
    },
    "KBBB",
  );
  expect(catalog.maps[0]?.id).toBe("01GEOONLY00000000000000001");
  expect(catalog.maps[0]?.starsId).toBe(136);
  expect(catalog.maps[0]?.dcbNumber).toBeUndefined();
  expect(starsIdFromNote("CRC ULID X; starsId 201; foo.geojson")).toBe(201);
  expect(starsIdFromNote("no identity here")).toBeUndefined();
  expect(loadVideoMapSet("KDEM").every((map) => map.starsId === undefined)).toBe(true);
});

test("T04-40 — generic group parser preserves sparse layout and identity", () => {
  const parsed = parseVideoMapGroups(
    {
      facilityId: "X99",
      facilityName: "Demo",
      mapsAbsentFromGroups: ["01ABSENT000000000000000001"],
      groups: [
        {
          id: "G1",
          sourceIndex: 0,
          tcps: ["1N"],
          main: Array.from({ length: 6 }, (_, i) => ({
            position: { groupId: "G1", mainIndex: i },
            starsId: i === 3 ? null : 10 + i,
            ...(i === 3 ? {} : { mapId: `MAP${i}` }),
          })),
          submenu: [
            { position: { groupId: "G1", submenuIndex: 0 }, starsId: 201, mapId: "HIGH" },
            { position: { groupId: "G1", submenuIndex: 1 }, starsId: null },
          ],
        },
      ],
    },
    "KBBB",
  );
  expect(parsed.groups[0]?.main[3]?.starsId).toBeNull();
  expect(parsed.groups[0]?.submenu[0]?.starsId).toBe(201);
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
        name: "Runway 09/27",
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
      "RWY",
      "KDEM/001-rwy.json",
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

test("T04-28 AC1 — KDEM video maps include runway definition, LOC09 feather, and DEM1_09 pattern", () => {
  const maps = loadVideoMapSet("KDEM");
  const rwy = maps.find((item) => item.id === "RWY");
  expect(rwy).toBeDefined();
  expect(rwy?.features.some((f) => f.type === "runway")).toBe(true);

  const loc09 = maps.find((item) => item.id === "LOC09");
  expect(loc09).toBeDefined();
  expect(loc09?.dcbLabel).toBe("LOC09");
  expect(loc09?.role).toBe("localizer");
  expect(loc09?.features[0]).toMatchObject({
    type: "localizerFeather",
    runwayId: "09",
    courseTrueDeg: 90,
    featherLengthNm: 10,
    halfWidthDeg: 2.5,
  });

  const rwyFeatures = rwy?.features.filter((f) => f.type === "runway") ?? [];
  expect(rwyFeatures).toHaveLength(2);
  expect(rwyFeatures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "runway", id: "27", label: "27" }),
      expect.objectContaining({ type: "runway", id: "09", label: "9" }),
    ]),
  );

  const dem09 = maps.find((item) => item.id === "DEM1_09");
  expect(dem09).toBeDefined();
  expect(dem09?.color).toBe("map");
  expect(dem09?.features.some((f) => f.type === "polyline")).toBe(true);
});
