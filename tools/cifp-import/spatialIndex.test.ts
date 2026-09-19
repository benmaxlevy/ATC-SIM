import { expect, test } from "vitest";
import {
  airspaceIntersectsRadius,
  buildSpatialIndex,
  EARTH_RADIUS_NM,
  greatCircleDistanceNm,
  initialBearingDeg,
  minDistanceToSegmentNm,
  pointInRadius,
  selectAirspacesByRadius,
  selectByRadius,
  serializeRadiusSeed,
  type CifpRadiusSeed,
} from "./spatialIndex.ts";
import type {
  CifpRecordIdentity,
  NormalizedAirspace,
  NormalizedAirport,
  NormalizedApproach,
  NormalizedBoundarySegment,
  NormalizedCifpSource,
  NormalizedFix,
  NormalizedNavaid,
  NormalizedProcedureLeg,
  NormalizedRunway,
  NormalizedSid,
  NormalizedStar,
  SourceLatLon,
} from "./types.ts";

const ORIGIN: SourceLatLon = { latDeg: 0, lonDeg: 0 };
const DEG_LAT_NM = EARTH_RADIUS_NM * (Math.PI / 180);

function ident(
  section: string,
  airportId: string | undefined,
  recordId: string,
): CifpRecordIdentity {
  return {
    key: `${section}:${airportId ?? "_"}:${recordId}`,
    section,
    ...(airportId !== undefined ? { airportId } : {}),
    recordId,
  };
}

function airport(
  airportId: string,
  arp: SourceLatLon,
  extras: Partial<NormalizedAirport> = {},
): NormalizedAirport {
  return {
    identity: ident("PA", airportId, airportId),
    airportId,
    name: airportId,
    magVarDeg: 0,
    fieldElevFt: 0,
    arp,
    lineNo: 1,
    ...extras,
  };
}

function runway(airportId: string, runwayId: string, threshold: SourceLatLon): NormalizedRunway {
  return {
    identity: ident("PG", airportId, runwayId),
    airportId,
    runwayId,
    threshold,
    lineNo: 1,
  };
}

function navaid(id: string, position: SourceLatLon, airportId?: string): NormalizedNavaid {
  return {
    identity: ident("D", airportId, id),
    airportId,
    id,
    kind: "VOR",
    position,
    lineNo: 1,
  };
}

function fix(id: string, position: SourceLatLon, airportId?: string): NormalizedFix {
  return {
    identity: ident("PC", airportId, id),
    airportId,
    id,
    kind: "WAYPOINT",
    position,
    lineNo: 1,
  };
}

function leg(sequence: number, fixId: string, lineNo: number): NormalizedProcedureLeg {
  return {
    sequence,
    fixId,
    pathTerminator: "TF",
    supported: true,
    missed: false,
    lineNo,
    routeType: "2",
    transitionId: "",
  };
}

function sid(airportId: string, id: string, fixIds: string[]): NormalizedSid {
  return {
    identity: ident("PD", airportId, id),
    airportId,
    id,
    name: id,
    runwayTransitions: [],
    common: fixIds.map((fixId, i) => leg(i + 1, fixId, 10 + i)),
    enrouteTransitions: [],
  };
}

function star(airportId: string, id: string, fixIds: string[]): NormalizedStar {
  return {
    identity: ident("PE", airportId, id),
    airportId,
    id,
    name: id,
    transitions: [],
    common: fixIds.map((fixId, i) => leg(i + 1, fixId, 20 + i)),
  };
}

function approach(airportId: string, id: string, thresholdFixId: string): NormalizedApproach {
  return {
    identity: ident("PF", airportId, id),
    airportId,
    id,
    type: "ILS",
    runway: "27",
    name: id,
    thresholdFixId,
    legs: [leg(1, thresholdFixId, 30)],
  };
}

function source(partial: Partial<NormalizedCifpSource>): NormalizedCifpSource {
  return {
    dialect: "fixed-width",
    airports: [],
    runways: [],
    navaids: [],
    fixes: [],
    stars: [],
    sids: [],
    approaches: [],
    airspaces: [],
    diagnostics: [],
    skippedByType: {},
    ...partial,
  };
}

function seedIds(
  rows: ReadonlyArray<{ identity: CifpRecordIdentity; id?: string; airportId?: string }>,
): string[] {
  return rows.map((row) => row.identity.key);
}

test("great-circle 1° latitude is mean Earth radius * 1°", () => {
  const nm = greatCircleDistanceNm(ORIGIN, { latDeg: 1, lonDeg: 0 });
  expect(nm).toBeCloseTo(DEG_LAT_NM, 8);
});

test("AC2 — dateline wrap is ~1° not ~359°", () => {
  const west = { latDeg: 0, lonDeg: 179.5 };
  const east = { latDeg: 0, lonDeg: -179.5 };
  const wrapped = greatCircleDistanceNm(west, east);
  expect(wrapped).toBeCloseTo(DEG_LAT_NM, 5);
  expect(wrapped).toBeLessThan(70);
  expect(pointInRadius(west, east, 70)).toBe(true);
  expect(pointInRadius(west, { latDeg: 0, lonDeg: 0 }, 70)).toBe(false);
});

test("AC2 — ±180° longitudes are the same meridian", () => {
  expect(
    greatCircleDistanceNm({ latDeg: 10, lonDeg: 180 }, { latDeg: 10, lonDeg: -180 }),
  ).toBeCloseTo(0, 8);
});

test("initialBearingDeg calculates cardinal bearings accurately", () => {
  expect(initialBearingDeg(ORIGIN, { latDeg: 1, lonDeg: 0 })).toBeCloseTo(0, 4);
  expect(initialBearingDeg(ORIGIN, { latDeg: 0, lonDeg: 1 })).toBeCloseTo(90, 4);
  expect(initialBearingDeg(ORIGIN, { latDeg: -1, lonDeg: 0 })).toBeCloseTo(180, 4);
  expect(initialBearingDeg(ORIGIN, { latDeg: 0, lonDeg: -1 })).toBeCloseTo(270, 4);
});

test("minDistanceToSegmentNm computes perpendicular distance to segment midpoint", () => {
  const a = { latDeg: 1, lonDeg: -1 };
  const b = { latDeg: 1, lonDeg: 1 };
  const point = { latDeg: 0, lonDeg: 0 };
  const dist = minDistanceToSegmentNm(point, a, b);
  // Distance to great circle arc bowing slightly north of 1° lat
  expect(dist).toBeCloseTo(DEG_LAT_NM, 1);
});

test("AC2 — exact-boundary points are included (distance <= radiusNm)", () => {
  const point = { latDeg: 1, lonDeg: 0 };
  const radiusNm = greatCircleDistanceNm(ORIGIN, point);
  expect(pointInRadius(ORIGIN, point, radiusNm)).toBe(true);
  expect(pointInRadius(ORIGIN, point, radiusNm - 1e-9)).toBe(false);
});

test("empty source with no airports throws", () => {
  expect(() => selectByRadius(source({}), { airportId: "KAAA", radiusNm: 20 })).toThrow(
    /airport KAAA not in source/,
  );
});

test("invalid radius is rejected", () => {
  const src = source({ airports: [airport("KAAA", ORIGIN)] });
  expect(() => selectByRadius(src, { airportId: "KAAA", radiusNm: -1 })).toThrow(/radiusNm/);
  expect(() => selectByRadius(src, { airportId: "KAAA", radiusNm: Number.NaN })).toThrow(
    /radiusNm/,
  );
});

test("airport-only source yields an empty-point seed", () => {
  const src = source({ airports: [airport("KAAA", ORIGIN)] });
  const seed = selectByRadius(src, { airportId: "KAAA", radiusNm: 40 });
  expect(seed.airportId).toBe("KAAA");
  expect(seed.radiusNm).toBe(40);
  expect(seed.arp).toEqual(ORIGIN);
  expect(seed.airports).toHaveLength(1);
  expect(seed.fixes).toEqual([]);
  expect(seed.navaids).toEqual([]);
  expect(seed.runways).toEqual([]);
  expect(seed.sids).toEqual([]);
  expect(seed.stars).toEqual([]);
  expect(seed.approaches).toEqual([]);
});

test("AC1 — points inside radius are selected; points outside are not", () => {
  const near = { latDeg: 0.1, lonDeg: 0 };
  const far = { latDeg: 2, lonDeg: 0 };
  const src = source({
    airports: [airport("KCCC", far), airport("KAAA", ORIGIN), airport("KBBB", near)],
    fixes: [fix("FARFIX", far, "KAAA"), fix("NEAR", near, "KAAA")],
    navaids: [navaid("FARVOR", far), navaid("NEARVOR", near, "KAAA")],
    runways: [runway("KCCC", "09", far), runway("KAAA", "27", near)],
  });
  const seed = selectByRadius(src, { airportId: "KAAA", radiusNm: 20 });
  expect(seedIds(seed.airports)).toEqual(["PA:KAAA:KAAA", "PA:KBBB:KBBB"]);
  expect(seedIds(seed.fixes)).toEqual(["PC:KAAA:NEAR"]);
  expect(seedIds(seed.navaids)).toEqual(["D:KAAA:NEARVOR"]);
  expect(seedIds(seed.runways)).toEqual(["PG:KAAA:27"]);
  expect(seedIds(seed.airports)).not.toContain("PA:KCCC:KCCC");
  expect(seedIds(seed.fixes)).not.toContain("PC:KAAA:FARFIX");
  expect(seed.fixes.every((row) => !("xNm" in row) && !("yNm" in row))).toBe(true);
  expect(seed.arp).toEqual({ latDeg: 0, lonDeg: 0 });
});

test("AC3 — selection is deterministic and preserves identity, coords, ownership", () => {
  const near = { latDeg: 0.05, lonDeg: 0 };
  const srcA = source({
    airports: [airport("KZZZ", near), airport("KAAA", ORIGIN)],
    fixes: [fix("ZULU", near, "KAAA"), fix("ALPHA", near, "KAAA")],
  });
  const srcB = source({
    airports: [airport("KAAA", ORIGIN), airport("KZZZ", near)],
    fixes: [fix("ALPHA", near, "KAAA"), fix("ZULU", near, "KAAA")],
  });
  const a = selectByRadius(srcA, { airportId: "KAAA", radiusNm: 20 });
  const b = selectByRadius(srcB, { airportId: "KAAA", radiusNm: 20 });
  expect(seedIds(a.airports)).toEqual(seedIds(b.airports));
  expect(seedIds(a.fixes)).toEqual(["PC:KAAA:ALPHA", "PC:KAAA:ZULU"]);
  expect(a.fixes[0]?.id).toBe("ALPHA");
  expect(a.fixes[0]?.airportId).toBe("KAAA");
  expect(a.fixes[0]?.position).toEqual(near);
  expect(a.fixes[0]?.identity.key).toBe("PC:KAAA:ALPHA");
  expect(serializeRadiusSeed(a)).toBe(serializeRadiusSeed(b));
  expect(serializeRadiusSeed(a)).toBe(
    serializeRadiusSeed(selectByRadius(srcA, { airportId: "KAAA", radiusNm: 20 })),
  );
});

test("AC4 — CifpRadiusSeed is the typed object T04-33 imports", () => {
  const src = source({ airports: [airport("KAAA", ORIGIN)] });
  const seed: CifpRadiusSeed = selectByRadius(src, { airportId: "KAAA", radiusNm: 10 });
  expect(seed.airportId).toBe("KAAA");
  expect(seed.radiusNm).toBe(10);
  expect(seed.arp).toEqual(ORIGIN);
  const index = buildSpatialIndex(src);
  expect(index.byAirportId.get("KAAA")?.airportId).toBe("KAAA");
  expect(index.byKey.get("PA:KAAA:KAAA")?.kind).toBe("airport");
});

test("AC5 — radius seed does not contain later out-of-radius procedure fixes", () => {
  const near = { latDeg: 0.1, lonDeg: 0 };
  const far = { latDeg: 2, lonDeg: 0 };
  const src = source({
    airports: [airport("KAAA", ORIGIN)],
    fixes: [fix("NEAR", near, "KAAA"), fix("FARFIX", far, "KAAA")],
    sids: [sid("KAAA", "DEP1", ["NEAR", "FARFIX"])],
    stars: [star("KAAA", "STAR1", ["NEAR", "FARFIX"])],
    approaches: [approach("KAAA", "ILS27", "NEAR")],
  });
  const seed = selectByRadius(src, { airportId: "KAAA", radiusNm: 20 });
  expect(seed.sids.map((row) => row.id)).toEqual(["DEP1"]);
  expect(seed.stars.map((row) => row.id)).toEqual(["STAR1"]);
  expect(seed.approaches.map((row) => row.id)).toEqual(["ILS27"]);
  expect(seed.fixes.map((row) => row.id)).toEqual(["NEAR"]);
  expect(seed.fixes.map((row) => row.id)).not.toContain("FARFIX");
  expect(seed.sids[0]?.common.map((row) => row.fixId)).toEqual(["NEAR", "FARFIX"]);
});

test("dateline airport selects the wrapped-near fix only", () => {
  const arp = { latDeg: 0, lonDeg: 179.5 };
  const wrappedNear = { latDeg: 0, lonDeg: -179.5 };
  const far = { latDeg: 0, lonDeg: 0 };
  const src = source({
    airports: [airport("KDAT", arp)],
    fixes: [fix("WRAP", wrappedNear, "KDAT"), fix("ZERO", far, "KDAT")],
  });
  const seed = selectByRadius(src, { airportId: "KDAT", radiusNm: 70 });
  expect(seed.fixes.map((row) => row.id)).toEqual(["WRAP"]);
  expect(seed.arp).toEqual(arp);
});

function makeAirspace(
  id: string,
  segments: NormalizedBoundarySegment[],
  centerAirportId?: string,
  extras: Partial<NormalizedAirspace> = {},
): NormalizedAirspace {
  return {
    identity: ident("UC", centerAirportId, id),
    type: "CONTROLLED",
    class: "B",
    name: id,
    centerAirportId,
    lowerLimit: {
      rawAltitude: "000",
      rawUnit: "M",
      altitudeFt: 0,
      unit: "MSL",
      reference: "MSL",
    },
    upperLimit: {
      rawAltitude: "100",
      rawUnit: "M",
      altitudeFt: 10000,
      unit: "MSL",
      reference: "MSL",
    },
    segments,
    sourceLineNo: 1,
    ...extras,
  };
}

function seg(
  seq: number,
  pos: SourceLatLon,
  boundaryVia = "G",
  boundaryViaType: NormalizedBoundarySegment["boundaryViaType"] = "GREAT_CIRCLE",
  arcOrigin?: SourceLatLon,
  arcDistanceNm?: number,
): NormalizedBoundarySegment {
  return {
    sequence: seq,
    boundaryVia,
    boundaryViaType,
    position: pos,
    arcOrigin,
    arcDistanceNm,
    lineNo: seq,
  };
}

function nmToDegLat(nm: number): number {
  return nm / DEG_LAT_NM;
}

test("AC4 — line boundary intersects radius when NO vertex is inside", () => {
  const lat15 = nmToDegLat(15);
  const lat35 = nmToDegLat(35);
  const lon20 = nmToDegLat(20);

  const v1 = { latDeg: lat15, lonDeg: -lon20 };
  const v2 = { latDeg: lat15, lonDeg: lon20 };
  const v3 = { latDeg: lat35, lonDeg: lon20 };
  const v4 = { latDeg: lat35, lonDeg: -lon20 };

  expect(pointInRadius(ORIGIN, v1, 20)).toBe(false);
  expect(pointInRadius(ORIGIN, v2, 20)).toBe(false);
  expect(pointInRadius(ORIGIN, v3, 20)).toBe(false);
  expect(pointInRadius(ORIGIN, v4, 20)).toBe(false);

  const airspace = makeAirspace("POLY-CROSS", [seg(1, v1), seg(2, v2), seg(3, v3), seg(4, v4)]);

  expect(airspaceIntersectsRadius(airspace, ORIGIN, 20)).toBe(true);
  expect(airspaceIntersectsRadius(airspace, ORIGIN, 10)).toBe(false);
});

test("AC4 — arc boundary intersects radius when NO vertex is inside", () => {
  const arcCenter = { latDeg: nmToDegLat(30), lonDeg: 0 };
  const arcDistNm = 12;

  const lat24 = nmToDegLat(24);
  const lon10 = nmToDegLat(10.3923);

  const startPoint = { latDeg: lat24, lonDeg: lon10 };
  const endPoint = { latDeg: lat24, lonDeg: -lon10 };

  expect(pointInRadius(ORIGIN, startPoint, 20)).toBe(false);
  expect(pointInRadius(ORIGIN, endPoint, 20)).toBe(false);

  const airspace = makeAirspace("ARC-CROSS", [
    seg(1, startPoint),
    seg(2, endPoint, "R", "CLOCKWISE_ARC", arcCenter, arcDistNm),
  ]);

  expect(airspaceIntersectsRadius(airspace, ORIGIN, 20)).toBe(true);
  expect(airspaceIntersectsRadius(airspace, ORIGIN, 15)).toBe(false);
});

test("AC4 — circular airspace overlap selection", () => {
  const circleCenter = { latDeg: nmToDegLat(25), lonDeg: 0 };
  const airspace = makeAirspace("CIRC-1", [seg(1, circleCenter, "C", "CIRCLE", circleCenter, 10)]);

  expect(airspaceIntersectsRadius(airspace, ORIGIN, 20)).toBe(true);
  expect(airspaceIntersectsRadius(airspace, ORIGIN, 10)).toBe(false);
});

test("AC4 — point-in-polygon selects volume when search center is inside but all vertices outside", () => {
  const lat30 = nmToDegLat(30);
  const lon30 = nmToDegLat(30);

  const airspace = makeAirspace("CONTAINING", [
    seg(1, { latDeg: -lat30, lonDeg: -lon30 }),
    seg(2, { latDeg: lat30, lonDeg: -lon30 }),
    seg(3, { latDeg: lat30, lonDeg: lon30 }),
    seg(4, { latDeg: -lat30, lonDeg: lon30 }),
  ]);

  expect(airspaceIntersectsRadius(airspace, ORIGIN, 5)).toBe(true);
});

test("AC4 — preserves centerAirportId and deterministic ordering under input reordering", () => {
  const vNear = { latDeg: nmToDegLat(5), lonDeg: 0 };
  const a1 = makeAirspace("AIR-Z", [seg(1, vNear)], "KATL");
  const a2 = makeAirspace("AIR-A", [seg(1, vNear)], "KATL");
  const a3 = makeAirspace("AIR-M", [seg(1, vNear)], "KATL");

  const ordered = selectAirspacesByRadius([a1, a2, a3], ORIGIN, 20);
  const reordered = selectAirspacesByRadius([a3, a1, a2], ORIGIN, 20);

  expect(ordered.map((a) => a.identity.key)).toEqual([
    "UC:KATL:AIR-A",
    "UC:KATL:AIR-M",
    "UC:KATL:AIR-Z",
  ]);
  expect(reordered.map((a) => a.identity.key)).toEqual(ordered.map((a) => a.identity.key));
  expect(ordered[0]?.centerAirportId).toBe("KATL");
});

test("AC4 — unsupported geometry and empty segments are excluded", () => {
  const vNear = { latDeg: nmToDegLat(5), lonDeg: 0 };
  const emptyAirspace = makeAirspace("EMPTY", []);
  const unsupportedAirspace = makeAirspace("UNSUPP", [seg(1, vNear, "XX", "UNSUPPORTED")]);

  expect(airspaceIntersectsRadius(emptyAirspace, ORIGIN, 20)).toBe(false);
  expect(airspaceIntersectsRadius(unsupportedAirspace, ORIGIN, 20)).toBe(false);
  expect(selectAirspacesByRadius([emptyAirspace, unsupportedAirspace], ORIGIN, 20)).toEqual([]);
});
