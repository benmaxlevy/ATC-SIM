import { expect, expectTypeOf, test } from "vitest";
import { createWorldFromScenario, loadKdem, loadVideoMapSet } from "@scenario";
import { catalogDctIds, type ProcedureCatalog } from "./types";
import { loadCatalog } from "./loadCatalog";

test("AC1 — ILS27 course 270 and DA 200 from committed JSON", () => {
  const catalog = loadCatalog("kdem");
  const ils27 = catalog.approaches.find((item) => item.id === "ILS27");
  expect(ils27).toBeDefined();
  expect(ils27!.courseDeg).toBe(270);
  expect(ils27!.daFt).toBe(200);
});

test("T04-26 AC3 — ILS09 approach procedure defined with correct geometry and missed approach", () => {
  const catalog = loadCatalog("kdem");
  const ils09 = catalog.approaches.find((item) => item.id === "ILS09");
  expect(ils09).toBeDefined();
  expect(ils09).toMatchObject({
    id: "ILS09",
    type: "ILS",
    runway: "09",
    name: "ILS RWY 09",
    courseDeg: 90,
    lengthNm: 18,
    beamHalfWidthDeg: 2.5,
    gsAngleDeg: 3.0,
    tchFt: 50,
    fafDistanceNm: 6,
    gsInterceptAltFt: 2000,
    daFt: 200,
    fafFixId: "FI09",
    thresholdFixId: "RW09",
    locNavaidId: "IDEM09",
    gsNavaidId: "IDEMGS09",
  });
  expect(ils09!.missed).toEqual({
    headingDeg: 90,
    climbToFt: 3000,
    directFixId: "MISSE",
  });
});

test("T04-26 AC1 — fixes.json contains all RW09 navigation and procedure fixes", () => {
  const catalog = loadCatalog("kdem");
  const expectedFixes = [
    { id: "RW09", kind: "THRESHOLD", xNm: -1.645, yNm: 0 },
    { id: "FI09", kind: "FAF", xNm: -7.645, yNm: 0 },
    { id: "WEMER", kind: "INTERSECTION", xNm: -11.645, yNm: 0 },
    { id: "WEMAX", kind: "INTERSECTION", xNm: -18.645, yNm: 12 },
    { id: "WELBO", kind: "INTERSECTION", xNm: -17.645, yNm: 7 },
    { id: "WENJO", kind: "INTERSECTION", xNm: -13.645, yNm: 4 },
    { id: "SAMAX", kind: "INTERSECTION", xNm: -18.645, yNm: -12 },
    { id: "SALBO", kind: "INTERSECTION", xNm: -17.645, yNm: -7 },
    { id: "SANJO", kind: "INTERSECTION", xNm: -13.645, yNm: -4 },
    { id: "BAYES", kind: "WAYPOINT", xNm: 2.355, yNm: 0 },
    { id: "BAYNE", kind: "WAYPOINT", xNm: 6.355, yNm: 4.5 },
    { id: "BAYSE", kind: "WAYPOINT", xNm: 5.355, yNm: -6 },
    { id: "MISSE", kind: "MAPT", xNm: 6.355, yNm: 6 },
  ];

  for (const exp of expectedFixes) {
    const fix = catalog.fixes.find((item) => item.id === exp.id);
    expect(fix, `fix ${exp.id}`).toBeDefined();
    expect(fix).toMatchObject(exp);
  }
});

test("T04-26 AC2 — ils.json contains all RW09 ILS navaids matching RW09 geometry", () => {
  const catalog = loadCatalog("kdem");
  const loc = catalog.navaids.find((item) => item.id === "IDEM09");
  expect(loc).toBeDefined();
  expect(loc).toMatchObject({
    id: "IDEM09",
    kind: "LOC",
    courseDeg: 90,
    lengthNm: 18,
    beamHalfWidthDeg: 2.5,
    xNm: 0.2,
    yNm: 0,
  });

  const gs = catalog.navaids.find((item) => item.id === "IDEMGS09");
  expect(gs).toBeDefined();
  expect(gs).toMatchObject({
    id: "IDEMGS09",
    kind: "GS",
    gsAngleDeg: 3.0,
    tchFt: 50,
    xNm: -1.465,
    yNm: -0.07,
  });

  const dme = catalog.navaids.find((item) => item.id === "IDEMDME09");
  expect(dme).toBeDefined();
  expect(dme).toMatchObject({
    id: "IDEMDME09",
    kind: "DME",
    pairedWith: "IDEM09",
    xNm: 0.2,
    yNm: 0,
  });

  const om = catalog.navaids.find((item) => item.id === "OM09");
  expect(om).toBeDefined();
  expect(om).toMatchObject({
    id: "OM09",
    kind: "OM",
    xNm: -7.845,
    yNm: 0,
  });

  const mm = catalog.navaids.find((item) => item.id === "MM09");
  expect(mm).toBeDefined();
  expect(mm).toMatchObject({
    id: "MM09",
    kind: "MM",
    xNm: -2.195,
    yNm: 0,
  });
});

test("AC2 — DEM1 north/south/west-north/west-south transitions, VECTORS, alt+speed on every leg", () => {
  const catalog = loadCatalog("kdem");
  const dem1 = catalog.stars.find((item) => item.id === "DEM1");
  expect(dem1).toBeDefined();
  expect(dem1!.termination).toBe("VECTORS");
  expect(dem1!.transitions.map((t) => t.id)).toEqual(["N", "S", "WN", "WS"]);
  const north = dem1!.transitions.find((item) => item.id === "N");
  const south = dem1!.transitions.find((item) => item.id === "S");
  const westNorth = dem1!.transitions.find((item) => item.id === "WN");
  const westSouth = dem1!.transitions.find((item) => item.id === "WS");
  expect(north?.legs).toHaveLength(4);
  expect(south?.legs).toHaveLength(4);
  expect(westNorth?.legs).toHaveLength(4);
  expect(westSouth?.legs).toHaveLength(4);
  const legs = [
    ...(north?.legs ?? []),
    ...(south?.legs ?? []),
    ...(westNorth?.legs ?? []),
    ...(westSouth?.legs ?? []),
    ...dem1!.common,
  ];
  for (const leg of legs) {
    expect(leg.altConstraint, leg.fixId).toBeDefined();
    expect(leg.speedConstraint, leg.fixId).toBeDefined();
  }
});

test("AC4 — ILS 27 loc 18 NM, GS 3°, FAF 6 NM / 2000, missed 270/3000, MISSD exists", () => {
  const catalog = loadCatalog("kdem");
  const ils27 = catalog.approaches.find((item) => item.id === "ILS27");
  expect(ils27).toMatchObject({
    lengthNm: 18,
    gsAngleDeg: 3,
    fafDistanceNm: 6,
    gsInterceptAltFt: 2000,
  });
  expect(ils27!.missed).toEqual({ headingDeg: 270, climbToFt: 3000, directFixId: "MISSD" });
  expect(catalog.fixes.find((item) => item.id === "MISSD")).toMatchObject({
    kind: "MAPT",
    xNm: -8,
    yNm: 6,
  });
});

test("AC5 — DEM/OCT/DMO/IDEM, STAR fixes, BAY1 sid, airportId is a string", () => {
  const catalog = loadCatalog("kdem");
  expectTypeOf<ProcedureCatalog["airportId"]>().toBeString();
  type HardcodedKdem = ProcedureCatalog["airportId"] extends "KDEM" ? true : false;
  expectTypeOf<HardcodedKdem>().toEqualTypeOf<false>();

  const dem = catalog.navaids.find((item) => item.id === "DEM");
  expect(dem).toMatchObject({ kind: "VORDME", freqMhz: 113.0, xNm: 0.4, yNm: 0.8 });
  expect(catalog.navaids.find((item) => item.id === "OCT")).toMatchObject({
    kind: "VORDME",
    freqMhz: 115.9,
  });
  expect(catalog.navaids.find((item) => item.id === "DMO")).toMatchObject({
    kind: "NDB",
    freqKhz: 385,
  });
  expect(catalog.navaids.find((item) => item.id === "IDEM")).toMatchObject({
    kind: "LOC",
    courseDeg: 270,
  });
  for (const id of [
    "NEMAX",
    "SEMAX",
    "MERGE",
    "FI27",
    "RW27",
    "MISSD",
    "SNARF",
    "NORMA",
    "OCTTA",
    "BAYEE",
    "BAYNW",
    "BAYSO",
    "BAYES",
    "BAYNE",
    "BAYSE",
    "WEMER",
    "WEMAX",
    "WELBO",
    "WENJO",
    "SAMAX",
    "SALBO",
    "SANJO",
  ]) {
    expect(
      catalog.fixes.some((item) => item.id === id),
      id,
    ).toBe(true);
  }
  expect(Array.isArray(catalog.sids)).toBe(true);
  expect(catalog.sids).toHaveLength(1);
  const bay1Sid = catalog.sids[0]!;
  expect(bay1Sid.id).toBe("BAY1");
  expect(bay1Sid.name).toBe("BAY ONE DEPARTURE");
  expect(bay1Sid.initialClimbFt).toBe(5000);
  expect(bay1Sid.runwayTransitions?.[0]?.runwayId).toBe("27");
  expect(bay1Sid.runwayTransitions?.[0]?.legs[0]?.fixId).toBe("BAYEE");
  expect(bay1Sid.runwayTransitions?.[1]?.runwayId).toBe("09");
  expect(bay1Sid.runwayTransitions?.[1]?.legs[0]?.fixId).toBe("BAYES");
  expect(bay1Sid.enrouteTransitions?.map((t) => t.id)).toEqual(["NORMA", "OCTTA"]);

  const dct = catalogDctIds(catalog);
  expect(dct.has("DEM")).toBe(true);
  expect(dct.has("OCT")).toBe(true);
  expect(dct.has("DMO")).toBe(true);
  expect(dct.has("NEMAX")).toBe(true);
  expect(dct.has("IDEM")).toBe(true);
  expect(dct.has("IDEM09")).toBe(true);
});

test("AC5b — DEM1 video map is default-on polylines/text; STAR parse does not join MAPS", () => {
  const maps = loadVideoMapSet("KDEM");
  const dem1 = maps.find((item) => item.id === "DEM1_27");
  expect(dem1).toBeDefined();
  expect(dem1!.defaultOn).toBe(true);
  expect(dem1!.dcbNumber).toBe(4);
  expect(
    dem1!.features.every((feature) => feature.type === "polyline" || feature.type === "text"),
  ).toBe(true);
  for (const feature of dem1!.features) {
    expect(feature).not.toHaveProperty("fixIds");
  }

  const catalog = loadCatalog("kdem");
  expect(catalog.stars[0]?.id).toBe("DEM1");

  const loaderSrc = import.meta.glob("./loadCatalog.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = loaderSrc["./loadCatalog.ts"] ?? "";
  expect(src).toMatch(/never joins STAR JSON/);
  expect(src).not.toMatch(/from\s+["'][^"']*loadVideoMaps/);
  expect(src).not.toMatch(/import\.meta\.glob[^;]*video-maps/);
});

test("DEM1 MAPS restriction boxes are stacked alt hundreds / speed kt (authored, not STAR-joined)", () => {
  const maps = loadVideoMapSet("KDEM");
  const dem1 = maps.find((item) => item.id === "DEM1_27");
  expect(dem1).toBeDefined();
  const texts = dem1!.features.flatMap((feature) =>
    feature.type === "text" ? [feature.text] : [],
  );
  expect(texts).toContain("NEMAX");
  expect(texts).toContain("MERGE");
  expect(texts).toContain("------\n100\n250\n------");
  expect(texts).toContain("------\n80\n230\n------");
  expect(texts).toContain("------\n60\n210\n------");
  expect(texts).toContain("------\n40\n210\n------");
  expect(texts.filter((text) => text.startsWith("------\n"))).toHaveLength(7);
});

test("scenario boot attaches catalog with airportId KDEM and navaids (AC integration)", () => {
  const scenario = loadKdem();
  expect(scenario.catalog.airportId).toBe("KDEM");
  expect(scenario.catalog.navaids.some((item) => item.id === "DEM")).toBe(true);
  const world = createWorldFromScenario(scenario);
  expect(world.catalog?.airportId).toBe("KDEM");
  expect(world.catalog?.fieldElevFt).toBe(0);
  expect(world.catalog?.navaids.some((item) => item.id === "DEM")).toBe(true);
  expect(world.aircraft).toHaveLength(6);
});

test("loc/runway map JSON matches catalog threshold and course within 0.01 NM / 0.1°", () => {
  const catalog = loadCatalog("kdem");
  const scenario = loadKdem();
  const rw27 = catalog.fixes.find((item) => item.id === "RW27");
  expect(rw27).toBeDefined();
  expect(Math.abs((scenario.maps.runway?.thresholdEastNm ?? NaN) - rw27!.xNm)).toBeLessThan(0.01);
  expect(Math.abs((scenario.maps.runway?.thresholdNorthNm ?? NaN) - rw27!.yNm)).toBeLessThan(0.01);
  const ils27 = catalog.approaches.find((item) => item.id === "ILS27");
  expect(ils27?.courseDeg).toBeDefined();
  expect(
    Math.abs((scenario.maps.localizer?.courseTrueDeg ?? NaN) - ils27!.courseDeg!),
  ).toBeLessThan(0.1);
  expect(
    Math.abs((scenario.maps.localizer?.halfWidthDeg ?? NaN) - (ils27!.beamHalfWidthDeg ?? NaN)),
  ).toBeLessThan(0.1);
});

test("KDEM navaids omit lat/lon (runtime is xNm/yNm)", () => {
  const catalog = loadCatalog("kdem");
  for (const navaid of catalog.navaids) {
    expect(navaid.latDeg).toBeUndefined();
    expect(navaid.lonDeg).toBeUndefined();
  }
  for (const fix of catalog.fixes) {
    expect(fix.latDeg).toBeUndefined();
    expect(fix.lonDeg).toBeUndefined();
  }
});
