import { describe, expect, it } from "vitest";
import { SessionLog, createAircraft, createWorld, type RadioRequest } from "@core";
import { handleRadioText } from "../../src/pilot/handleRadioText";
import type { RegionalFacility } from "../../src/scenario/regional";

const syntheticClassB = {
  schemaVersion: 1,
  centerAirportId: "KATL",
  facilityName: "SYNTHETIC APPROACH",
  radiusNm: 40,
  arp: { latDeg: 0, lonDeg: 0 },
  source: { families: [] },
  airports: [],
  airspaces: [
    {
      id: "SYNTHETIC-BRAVO",
      name: "SYNTHETIC BRAVO",
      type: "CONTROLLED",
      class: "B",
      centerAirportId: "KATL",
      lowerLimit: { altitudeFt: 0, unit: "MSL", reference: "MSL" },
      upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
      lowerLimitFt: 0,
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
          positionNm: { xNm: 15, yNm: -5 },
        },
        {
          sequence: 3,
          boundaryVia: "G",
          boundaryViaType: "GREAT_CIRCLE",
          position: { latDeg: 0, lonDeg: 0 },
          positionNm: { xNm: 15, yNm: 15 },
        },
        {
          sequence: 4,
          boundaryVia: "G",
          boundaryViaType: "GREAT_CIRCLE",
          position: { latDeg: 0, lonDeg: 0 },
          positionNm: { xNm: -5, yNm: 15 },
        },
      ],
    },
  ],
} as unknown as RegionalFacility;

function makeWorld(
  status: RadioRequest["status"] = "PENDING",
  detailOverrides: Partial<RadioRequest["details"]> = {},
  regional?: RegionalFacility,
) {
  const aircraft = createAircraft({
    id: "ac-vfr-bravo",
    callsign: "N12345",
    xNm: 10,
    yNm: 5,
    headingDeg: 90,
    altitudeFt: 3500,
    speedKt: 110,
    aircraftType: "C172",
    flightRules: "VFR",
    squawk: "1200",
    flightFollowing: { active: true, approvedAtSimMs: 0, requestId: "ff-bravo" },
  });
  const request: RadioRequest = {
    id: "req-bravo",
    aircraftId: aircraft.id,
    callsign: aircraft.callsign,
    kind: "CLASS_B_ACCESS",
    requestedAtSimMs: 1000,
    status,
    details: {
      aircraftType: "C172",
      altitudeFt: 3500,
      headingDeg: 90,
      classBOperation: "TO_ENTER",
      classBIntent: "ARRIVAL",
      destinationAirportId: "KATL",
      ...detailOverrides,
    },
  };
  return {
    aircraft,
    request,
    world: createWorld({
      aircraft: [aircraft],
      radioRequests: [request],
      regional,
      simTimeMs: 1000,
    }),
  };
}

describe("VFR Class B pilot-request runtime", () => {
  it("reports and clears a primary-airport arrival without leaving VFR", async () => {
    const { aircraft, request, world } = makeWorld();
    const log = new SessionLog();

    const details = await handleRadioText(world, "N12345 say request", log);
    expect(details.accepted).toBe(true);
    expect(details.readback).toContain("request VFR arrival into Bravo to KATL");
    expect(request.details).toMatchObject({
      classBIntent: "ARRIVAL",
      classBOperation: "TO_ENTER",
      destinationAirportId: "KATL",
    });
    expect(request.status).toBe("PENDING");

    const standby = await handleRadioText(world, "N12345 stand by", log);
    expect(standby.accepted).toBe(true);
    expect(request.status).toBe("STANDBY");

    const approval = await handleRadioText(world, "N12345 cleared as requested", log);
    expect(approval.accepted).toBe(true);
    expect(request.status).toBe("CLEARED");
    expect(request.clearedClassBOperation).toBe("TO_ENTER");
    expect(aircraft.flightRules).toBe("VFR");
    expect(aircraft.flightFollowing).toEqual({
      active: true,
      approvedAtSimMs: 0,
      requestId: "ff-bravo",
    });
    expect(aircraft.squawk).toBe("1200");
    expect(aircraft.classBClearance?.operation).toBe("TO_ENTER");
  });

  it("preserves underlying-airport departure origin and destination details", async () => {
    const { request, world } = makeWorld("PENDING", {
      classBIntent: "DEPARTURE",
      originAirportId: "KPDK",
      destinationAirportId: "KATL",
    });

    const result = await handleRadioText(world, "N12345 say request", new SessionLog());

    expect(result.accepted).toBe(true);
    expect(result.readback).toContain("request VFR departure into Bravo from KPDK to KATL");
    expect(request.details).toMatchObject({
      classBIntent: "DEPARTURE",
      originAirportId: "KPDK",
      destinationAirportId: "KATL",
    });
    expect(request.status).toBe("PENDING");
  });

  it("associates an explicit clearance with only the matching aircraft request", async () => {
    const { aircraft, request, world } = makeWorld();
    const unrelated: RadioRequest = {
      ...request,
      id: "req-other-aircraft",
      aircraftId: "ac-other",
      callsign: "N99999",
    };
    world.radioRequests = [...(world.radioRequests ?? []), unrelated];

    const result = await handleRadioText(
      world,
      "N12345 cleared into class bravo airspace",
      new SessionLog(),
    );

    expect(result.accepted).toBe(true);
    expect(request.status).toBe("CLEARED");
    expect(request.clearedClassBOperation).toBe("TO_ENTER");
    expect(unrelated.status).toBe("PENDING");
    expect(aircraft.classBClearance?.operation).toBe("TO_ENTER");
    expect(aircraft.flightRules).toBe("VFR");
  });

  it.each([
    ["unable class b clearance", false],
    ["remain outside bravo airspace", true],
  ] as const)("declines a pending request with %s without leaving VFR", async (text, remains) => {
    const { aircraft, request, world } = makeWorld();
    const beforeIntent = structuredClone(aircraft.intent);
    const beforeFollowing = structuredClone(aircraft.flightFollowing);

    const result = await handleRadioText(world, `N12345 ${text}`, new SessionLog());

    expect(result.accepted).toBe(true);
    expect(request.status).toBe("DECLINED");
    expect(aircraft.flightRules).toBe("VFR");
    expect(aircraft.intent).toEqual(beforeIntent);
    expect(aircraft.flightFollowing).toEqual(beforeFollowing);
    expect(aircraft.squawk).toBe("1200");
    expect(aircraft.classBClearance).toBeUndefined();
    expect(aircraft.remainOutsideBravo?.active ?? false).toBe(remains);
  });

  it("keeps controller OUT_OF clearance out of the pilot-request lifecycle", async () => {
    const { aircraft, request, world } = makeWorld("PENDING", {}, syntheticClassB);

    const result = await handleRadioText(
      world,
      "N12345 cleared out of bravo airspace",
      new SessionLog(),
    );

    expect(result.accepted).toBe(true);
    expect(request.status).toBe("PENDING");
    expect(request.clearedClassBOperation).toBeUndefined();
    expect(request.details.classBOperation).not.toBe("OUT_OF");
    expect(aircraft.classBClearance?.operation).toBe("OUT_OF");
    expect(aircraft.flightRules).toBe("VFR");
  });

  it("rejects approval when no pending Class B request exists", async () => {
    const { world } = makeWorld("CLEARED");
    const result = await handleRadioText(world, "N12345 cleared as requested", new SessionLog());

    expect(result.accepted).toBe(false);
    expect(result.detail).toBe("REQUEST: no pending Class B request");
  });
});
