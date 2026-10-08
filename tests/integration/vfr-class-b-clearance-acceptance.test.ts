import { describe, expect, test } from "vitest";
import { createAircraft, createWorld, handleClassBBoundary, SessionLog } from "@core";
import { handleRadioText } from "@pilot";
import type { RegionalAirspaceVolume, RegionalFacility } from "../../src/scenario/regional";

const volume: RegionalAirspaceVolume = {
  id: "UC:KSYN:B_CORE",
  name: "SYNTHETIC BRAVO CORE",
  type: "CONTROLLED",
  class: "B",
  centerAirportId: "KSYN",
  lowerLimit: { altitudeFt: 3000, unit: "MSL", reference: "MSL" },
  upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
  lowerLimitFt: 3000,
  upperLimitFt: 10000,
  segments: [
    {
      sequence: 1,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 0, lonDeg: 0 },
      positionNm: { xNm: -5, yNm: -5 },
    },
    {
      sequence: 2,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 0, lonDeg: 0 },
      positionNm: { xNm: 5, yNm: -5 },
    },
    {
      sequence: 3,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 0, lonDeg: 0 },
      positionNm: { xNm: 5, yNm: 5 },
    },
    {
      sequence: 4,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 0, lonDeg: 0 },
      positionNm: { xNm: -5, yNm: 5 },
    },
  ],
};

const regional = {
  schemaVersion: 1,
  centerAirportId: "KSYN",
  facilityName: "KSYN APPROACH",
  radiusNm: 40,
  arp: { latDeg: 0, lonDeg: 0 },
  source: { families: [] },
  airports: [],
  airspaces: [volume],
} as unknown as RegionalFacility;

function makeWorld(callsign: string, xNm = -10, altitudeFt = 2500) {
  const aircraft = createAircraft({
    id: callsign,
    callsign,
    xNm,
    yNm: 0,
    headingDeg: 90,
    altitudeFt,
    speedKt: 110,
    flightRules: "VFR",
    squawk: "1200",
    flightFollowing: { active: true, approvedAtSimMs: 0, requestId: `ff-${callsign}` },
  });
  const sessionLog = new SessionLog();
  const world = createWorld({
    aircraft: [aircraft],
    regional,
    mvaChart: { airportId: "KSYN", defaultMinAltitudeFt: 3000, polygons: [] },
    sessionLog,
    catalog: {
      airportId: "KSYN",
      fixes: [
        { id: "DEM", xNm: 0, yNm: 0, kind: "fix" },
        { id: "KPDK", xNm: 10, yNm: 0, kind: "fix" },
      ],
      navaids: [],
      stars: [],
      sids: [],
      approaches: [],
    },
  });
  return { world, aircraft, sessionLog };
}

describe("VFR Class B clearance workflow", () => {
  test("enters, transits, exits, and preserves VFR services and squawk", async () => {
    const { world, aircraft, sessionLog } = makeWorld("N12345");
    const entry = await handleRadioText(
      world,
      "N12345 cleared into class bravo airspace",
      sessionLog,
    );
    expect(entry.accepted).toBe(true);
    expect(aircraft.flightRules).toBe("VFR");
    expect(aircraft.flightFollowing?.active).toBe(true);
    expect(aircraft.squawk).toBe("1200");

    aircraft.xNm = 0;
    handleClassBBoundary(world, aircraft, false, true);
    expect(sessionLog.byType("class_b.entered")).toHaveLength(1);

    const exit = await handleRadioText(world, "N12345 cleared out of bravo airspace", sessionLog);
    expect(exit.accepted).toBe(true);
    aircraft.xNm = 10;
    handleClassBBoundary(world, aircraft, true, false);
    expect(sessionLog.byType("class_b.exited")[0]?.notification).toBe(
      "LEAVING KSYN APPROACH BRAVO AIRSPACE",
    );
    expect(aircraft.flightFollowing?.active).toBe(true);
    expect(aircraft.squawk).toBe("1200");
    expect(sessionLog.byType("class_b.exited")[0]).not.toHaveProperty("serviceTerminated");
  });

  test("accepts a catalog-grounded THROUGH route and active REMAIN OUTSIDE", async () => {
    const through = makeWorld("N23456", -10, 4000);
    const result = await handleRadioText(
      through.world,
      "N23456 cleared through bravo airspace via dem then kpdk",
      through.sessionLog,
    );
    expect(result.accepted).toBe(true);
    expect(through.aircraft.classBClearance).toMatchObject({
      operation: "THROUGH",
      routeMode: "CATALOG_ROUTE",
      routeFixIds: ["DEM", "KPDK"],
    });

    const remain = makeWorld("N34567", -10, 2000);
    const remainResult = await handleRadioText(
      remain.world,
      "N34567 remain outside bravo airspace",
      remain.sessionLog,
    );
    expect(remainResult.accepted).toBe(true);
    expect(remain.aircraft.remainOutsideBravo?.active).toBe(true);
    expect(remain.aircraft.classBClearance).toBeUndefined();
  });

  test("restores the prior VFR altitude and keeps route amendments VFR-only", async () => {
    const { world, aircraft, sessionLog } = makeWorld("N45678", -10, 2500);
    const entry = await handleRadioText(
      world,
      "N45678 cleared into bravo airspace maintain four thousand while in bravo airspace",
      sessionLog,
    );
    expect(entry.accepted).toBe(true);
    expect(aircraft.intent.assignedAltitudeFt).toBe(4000);

    const heading = await handleRadioText(world, "N45678 H 180", sessionLog);
    expect(heading.accepted).toBe(true);
    expect(aircraft.flightRules).toBe("VFR");
    expect(aircraft.classBClearance?.active).toBe(true);

    const resume = await handleRadioText(
      world,
      "N45678 resume appropriate VFR altitudes",
      sessionLog,
    );
    expect(resume.accepted).toBe(true);
    expect(aircraft.intent.assignedAltitudeFt).toBe(2500);
    expect(aircraft.intent.controllerAssignedAltitudeFt).toBeUndefined();
    expect(sessionLog.byType("class_b.altitude.resumed")).toHaveLength(1);
  });

  test("rejects entry without VFR clearance and leaves unrelated state unchanged", async () => {
    const { world, aircraft, sessionLog } = makeWorld("N56789");
    const initialHeading = aircraft.intent.assignedHeadingDeg;
    const rejected = await handleRadioText(world, "N56789 cleared into bravo", sessionLog);
    expect(rejected.accepted).toBe(false);
    expect(aircraft.intent.assignedHeadingDeg).toBe(initialHeading);
    expect(aircraft.classBClearance).toBeUndefined();
    expect(aircraft.flightFollowing?.active).toBe(true);
    expect(aircraft.squawk).toBe("1200");
    expect(sessionLog.byType("class_b.entered")).toHaveLength(0);
  });
});
