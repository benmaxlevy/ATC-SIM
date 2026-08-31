import { expect, test } from "vitest";
import { makeTestAircraft } from "../../aircraft";
import type { LateralMode, VerticalMode } from "../../aircraft";
import kdemMvaJson from "../../../scenario/data/kdem-mva.json";
import {
  MSAW_FAF_DISTANCE_NM,
  MSAW_RED_BELOW_FT,
  evaluateMsaw,
  isMsawInhibited,
  msawFloorFt,
  msawSeverityForAltitude,
  polygonContains,
  type MvaChart,
  type MsawInhibitGeom,
} from "../../alerts/msaw";

function kdemChart(): MvaChart {
  return {
    airportId: kdemMvaJson.airportId,
    defaultMinAltitudeFt: kdemMvaJson.defaultMinAltitudeFt,
    polygons: kdemMvaJson.polygons.map((poly) => ({
      id: poly.id,
      minAltitudeFt: poly.minAltitudeFt,
      verticesNm: poly.verticesNm.map((v) => ({ xNm: v.xNm, yNm: v.yNm })),
    })),
  };
}

const kdem = kdemChart();

const inhibit: MsawInhibitGeom = {
  thresholdXNm: 0,
  thresholdYNm: 0,
  fafDistanceNm: MSAW_FAF_DISTANCE_NM,
};

const inner = kdem.polygons.find((poly) => poly.id === "inner");
const outerEast = kdem.polygons.find((poly) => poly.id === "outer-east");

function stubLateral(type: string): LateralMode {
  switch (type) {
    case "DIRECT":
      return { type: "DIRECT", fixId: "NEMAX" };
    case "PROCEDURE":
      return { type: "PROCEDURE", starId: "DEM1", toFixIndex: 0, routeFixIds: [] };
    case "INTERCEPT_LOC":
      return { type: "INTERCEPT_LOC", approachId: "ILS27" };
    case "LOC":
      return { type: "LOC", approachId: "ILS27" };
    case "MISSED":
      return { type: "MISSED", approachId: "ILS27" };
    case "LANDING":
      return { type: "LANDING", approachId: "ILS27" };
    default:
      return { type: "HEADING", headingDeg: 270 };
  }
}

function stubVertical(type: string): VerticalMode {
  switch (type) {
    case "GS":
      return { type: "GS", approachId: "ILS27" };
    case "VIA_STAR":
      return { type: "VIA_STAR", starId: "DEM1" };
    case "MISSED_CLIMB":
      return { type: "MISSED_CLIMB", altitudeFt: 3000 };
    default:
      return { type: "ASSIGNED" };
  }
}

function aircraftAt(
  overrides: Parameters<typeof makeTestAircraft>[0] & { lateral?: string; vertical?: string },
) {
  const ac = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    headingDeg: 270,
    speedKt: 0,
    xNm: 0,
    yNm: 0,
    altitudeFt: 8000,
    ...overrides,
  });
  if (overrides.lateral) {
    ac.intent.lateral = stubLateral(overrides.lateral);
  }
  if (overrides.vertical) {
    ac.intent.vertical = stubVertical(overrides.vertical);
  }
  return ac;
}

test("MSAW_RED_BELOW_FT is the frozen 300 ft band", () => {
  expect(MSAW_RED_BELOW_FT).toBe(300);
});

test("PIP: triangle has a clear interior and an outside vertex", () => {
  const triangle = [
    { xNm: 0, yNm: 0 },
    { xNm: 4, yNm: 0 },
    { xNm: 0, yNm: 4 },
  ];
  expect(polygonContains(triangle, 1, 1)).toBe(true);
  expect(polygonContains(triangle, 3, 3)).toBe(false);
  expect(polygonContains(triangle, -1, 0)).toBe(false);
});

test("overlapping polygons use the maximum minAltitudeFt", () => {
  const chart: MvaChart = {
    airportId: "TEST",
    defaultMinAltitudeFt: 1000,
    polygons: [
      {
        id: "low",
        minAltitudeFt: 2000,
        verticesNm: [
          { xNm: 0, yNm: 0 },
          { xNm: 10, yNm: 0 },
          { xNm: 10, yNm: 10 },
          { xNm: 0, yNm: 10 },
        ],
      },
      {
        id: "high",
        minAltitudeFt: 3000,
        verticesNm: [
          { xNm: 2, yNm: 2 },
          { xNm: 8, yNm: 2 },
          { xNm: 8, yNm: 8 },
          { xNm: 2, yNm: 8 },
        ],
      },
    ],
  };
  expect(msawFloorFt(5, 5, chart)).toBe(3000);
  expect(msawFloorFt(1, 1, chart)).toBe(2000);
  expect(msawFloorFt(50, 50, chart)).toBe(1000);
});

test("AC1 — KDEM JSON floors: F-100 caution, F-400 alert (no hard-coded 2500)", () => {
  expect(inner).toBeDefined();
  expect(outerEast).toBeDefined();
  const innerF = inner!.minAltitudeFt;
  const outerF = outerEast!.minAltitudeFt;
  expect(msawFloorFt(0, 0, kdem)).toBe(innerF);
  expect(msawFloorFt(20, 0, kdem)).toBe(outerF);
  expect(msawFloorFt(50, 0, kdem)).toBe(kdem.defaultMinAltitudeFt);

  expect(msawSeverityForAltitude(innerF - 100, innerF)).toBe("caution");
  expect(msawSeverityForAltitude(innerF - 400, innerF)).toBe("alert");
  expect(msawSeverityForAltitude(outerF - 100, outerF)).toBe("caution");
  expect(msawSeverityForAltitude(outerF - 400, outerF)).toBe("alert");
  expect(msawSeverityForAltitude(innerF, innerF)).toBeNull();

  const caution = evaluateMsaw([aircraftAt({ xNm: 0, yNm: 0, altitudeFt: innerF - 100 })], kdem);
  expect(caution).toEqual([
    { callsign: "DAL123", severity: "caution", altFt: innerF - 100, floorFt: innerF },
  ]);
  const alert = evaluateMsaw([aircraftAt({ xNm: 0, yNm: 0, altitudeFt: innerF - 400 })], kdem);
  expect(alert[0]?.severity).toBe("alert");
  expect(alert[0]?.floorFt).toBe(innerF);
});

test("AC2 — inner polygon floor 1500: 1400 caution, 1000 alert", () => {
  expect(inner!.minAltitudeFt).toBe(1500);
  expect(msawFloorFt(0, 0, kdem)).toBe(1500);
  const caution = evaluateMsaw([aircraftAt({ xNm: 2, yNm: 2, altitudeFt: 1400 })], kdem);
  expect(caution[0]?.severity).toBe("caution");
  expect(caution[0]?.floorFt).toBe(1500);
  const alert = evaluateMsaw([aircraftAt({ xNm: 2, yNm: 2, altitudeFt: 1000 })], kdem);
  expect(alert[0]?.severity).toBe("alert");
  expect(alert[0]?.altFt).toBe(1000);
});

test("AC3 — LOC or GS inside 6 NM at 1200 ft is inhibited", () => {
  const loc = aircraftAt({ xNm: 5, yNm: 0, altitudeFt: 1200, lateral: "LOC" });
  const gs = aircraftAt({ xNm: 5, yNm: 0, altitudeFt: 1200, vertical: "GS" });
  const landing = aircraftAt({ xNm: 5, yNm: 0, altitudeFt: 1200, lateral: "LANDING" });
  expect(isMsawInhibited(loc, inhibit)).toBe(true);
  expect(isMsawInhibited(gs, inhibit)).toBe(true);
  expect(isMsawInhibited(landing, inhibit)).toBe(true);
  expect(evaluateMsaw([loc], kdem, inhibit)).toEqual([]);
  expect(evaluateMsaw([gs], kdem, inhibit)).toEqual([]);
  expect(evaluateMsaw([landing], kdem, inhibit)).toEqual([]);
});

test("AC4 — same point/alt on HEADING fires MSAW; DIRECT/STAR/MISSED never inhibit", () => {
  const heading = aircraftAt({ xNm: 5, yNm: 0, altitudeFt: 1200, lateral: "HEADING" });
  const omitted = aircraftAt({ xNm: 5, yNm: 0, altitudeFt: 1200 });
  const direct = aircraftAt({ xNm: 5, yNm: 0, altitudeFt: 1200, lateral: "DIRECT" });
  const star = aircraftAt({ xNm: 5, yNm: 0, altitudeFt: 1200, lateral: "PROCEDURE" });
  const missed = aircraftAt({ xNm: 5, yNm: 0, altitudeFt: 1200, lateral: "MISSED" });
  for (const ac of [heading, omitted, direct, star, missed]) {
    expect(isMsawInhibited(ac, inhibit)).toBe(false);
    const alerts = evaluateMsaw([ac], kdem, inhibit);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.severity).toBe("caution");
    expect(alerts[0]?.floorFt).toBe(1500);
  }
});

test("LOC outside FAF is not inhibited", () => {
  const loc = aircraftAt({ xNm: 10, yNm: 0, altitudeFt: 1200, lateral: "LOC" });
  expect(isMsawInhibited(loc, inhibit)).toBe(false);
  expect(evaluateMsaw([loc], kdem, inhibit)).toHaveLength(1);
});
