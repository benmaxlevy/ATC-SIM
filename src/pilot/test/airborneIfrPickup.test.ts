import { describe, expect, it, vi } from "vitest";
import {
  createAircraft,
  createWorld,
  saveFlightPlanDraft,
  SessionLog,
  type RadioRequest,
} from "@core";
import { handleRadioText } from "../handleRadioText";
import { createVfrRequestQueue, formatIfrPickupRequest } from "../vfrRequestQueue";
import { datablockSourceFromWorld } from "../../scope/datablock";
import { isVfrAircraft } from "../../scope/systemLists";
import { terminalStripsFromWorld } from "../../ui/strips/terminalStripsFromWorld";
import type { RegionalFacility } from "@scenario";

function setupRegionalWorld(options?: {
  airborne?: boolean;
  altitudeFt?: number;
  identified?: boolean;
  withRequest?: boolean;
  requestedDest?: string;
  alreadyIfr?: boolean;
  manualPlan?: boolean;
}) {
  const airborne =
    options && "airborne" in options ? options.airborne : (options?.altitudeFt ?? 4500) > 0;
  const altitudeFt = options?.altitudeFt ?? 4500;
  const identified = options?.identified ?? true;
  const withRequest = options?.withRequest ?? true;
  const requestedDest = options?.requestedDest ?? "KPDK";
  const alreadyIfr = options?.alreadyIfr ?? false;

  const aircraft = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 10,
    yNm: 15,
    headingDeg: 90,
    altitudeFt,
    speedKt: 140,
    airborne,
    flightRules: alreadyIfr ? "IFR" : "VFR",
    assignedSquawk: "1200",
    squawk: "1200",
    ...(identified
      ? {
          radarContact: {
            mode: "DIRECT_RADAR_POSITION" as const,
            distanceNm: 5,
            referenceId: "KATL",
            verifiedAtSimMs: 1000,
          },
        }
      : {}),
    ambientVfr: {
      mission: "AIRPORT_BOUND",
      zoneId: "zone-1",
      spawnedAtSimMs: 0,
      alertEligibility: "AMBIENT_SUPPRESSED",
      destinationAirportId: requestedDest,
    },
  });

  const requestRecord: RadioRequest | null = withRequest
    ? {
        id: "req-1",
        aircraftId: aircraft.id,
        callsign: aircraft.callsign,
        kind: "IFR_PICKUP",
        status: identified ? "IDENTIFIED" : "PENDING",
        requestedAtSimMs: 1000,
        details: {
          destinationAirportId: requestedDest,
          requestedAltitudeFt: 5000,
        },
      }
    : null;

  const scheduleIfrCancellationCandidate = vi.fn();

  const world = createWorld({
    aircraft: [aircraft],
    radioRequests: requestRecord ? [requestRecord] : [],
    scheduleIfrCancellationCandidate,
    catalog: {
      airportId: "KATL",
      name: "Hartsfield-Jackson Atlanta International Airport",
      spokenAliases: ["Atlanta Airport"],
      fixes: [],
      navaids: [],
      stars: [],
      sids: [],
      approaches: [],
    },
  });

  world.regional = {
    manifest: { centerIcao: "KATL", radiusNm: 40, generatedAtUtc: "2026-01-01" },
    airports: {
      centerAirport: {
        icao: "KATL",
        name: "Hartsfield-Jackson Atlanta International Airport",
        publicUse: true,
        towered: true,
        controlClass: "B",
        runways: [],
        proceduresEmitted: true,
        eligibleForDestination: true,
        arp: { latDeg: 33.64, lonDeg: -84.42, xNm: 0, yNm: 0 },
      },
      destinations: [
        {
          icao: "KPDK",
          name: "DeKalb-Peachtree Airport",
          publicUse: true,
          towered: true,
          controlClass: "D",
          runways: [{ id: "21L", lengthFt: 6000, trueHeadingDeg: 210 }],
          proceduresEmitted: true,
          eligibleForDestination: true,
          arp: { latDeg: 33.87, lonDeg: -84.3, xNm: 12, yNm: 18 },
        },
        {
          icao: "KFTY",
          name: "Fulton County Airport",
          publicUse: true,
          towered: true,
          controlClass: "D",
          runways: [{ id: "08", lengthFt: 5000, trueHeadingDeg: 80 }],
          proceduresEmitted: true,
          eligibleForDestination: true,
          arp: { latDeg: 33.77, lonDeg: -84.52, xNm: -8, yNm: 10 },
        },
        {
          icao: "00GA",
          name: "Private Heliport",
          publicUse: false,
          towered: false,
          controlClass: "G",
          runways: [],
          proceduresEmitted: false,
          eligibleForDestination: false,
          arp: { latDeg: 33.5, lonDeg: -84.2, xNm: 5, yNm: -5 },
        },
      ],
    },
    airspaces: [],
  } as unknown;

  if (options?.manualPlan) {
    const created = saveFlightPlanDraft(world, {
      acid: "DAL123",
      filedRoute: "KPDK",
      flightType: "VFR",
      assignedBeacon: "4521",
    });
    if (!created.ok) throw new Error(created.error.message);
  }

  return { world, aircraft, scheduleIfrCancellationCandidate, requestRecord };
}

describe("T04-74: Airborne VFR-to-IFR pickup", () => {
  describe("AC1: Airborne request gate", () => {
    it("rejects when there is no pending IFR pickup request", async () => {
      const { world, aircraft } = setupRegionalWorld({ withRequest: false });
      const acBefore = structuredClone(aircraft);
      const res = await handleRadioText(
        world,
        "DAL123 CLR TO KPDK VIA RADAR VECTORS",
        new SessionLog(),
      );
      expect(res.accepted).toBe(false);
      expect(res.reason).toBe("CLEARANCE");
      expect(res.detail).toBe("CLEARANCE: no pending IFR pickup request");
      expect(aircraft).toEqual(acBefore);
    });

    it("rejects when aircraft is not airborne", async () => {
      const { world, aircraft } = setupRegionalWorld({ airborne: false });
      const acBefore = structuredClone(aircraft);
      const res = await handleRadioText(
        world,
        "DAL123 CLR TO KPDK VIA RADAR VECTORS",
        new SessionLog(),
      );
      expect(res.accepted).toBe(false);
      expect(res.reason).toBe("CLEARANCE");
      expect(res.detail).toBe("CLEARANCE: airborne IFR pickup required");
      expect(aircraft).toEqual(acBefore);
    });

    it("rejects when aircraft is at 0 ft altitude", async () => {
      const { world, aircraft } = setupRegionalWorld({ altitudeFt: 0, airborne: undefined });
      const acBefore = structuredClone(aircraft);
      const res = await handleRadioText(
        world,
        "DAL123 CLR TO KPDK VIA RADAR VECTORS",
        new SessionLog(),
      );
      expect(res.accepted).toBe(false);
      expect(res.reason).toBe("CLEARANCE");
      expect(res.detail).toBe("CLEARANCE: airborne IFR pickup required");
      expect(aircraft).toEqual(acBefore);
    });

    it("rejects when aircraft has not been radar identified", async () => {
      const { world, aircraft } = setupRegionalWorld({ identified: false });
      const acBefore = structuredClone(aircraft);
      const res = await handleRadioText(
        world,
        "DAL123 CLR TO KPDK VIA RADAR VECTORS",
        new SessionLog(),
      );
      expect(res.accepted).toBe(false);
      expect(res.reason).toBe("CLEARANCE");
      expect(res.detail).toBe("CLEARANCE: radar identification required");
      expect(aircraft).toEqual(acBefore);
    });

    it("rejects when clearance limit does not match requested destination", async () => {
      const { world, aircraft } = setupRegionalWorld({ requestedDest: "KPDK" });
      const acBefore = structuredClone(aircraft);
      const res = await handleRadioText(
        world,
        "DAL123 CLR TO KFTY VIA RADAR VECTORS",
        new SessionLog(),
      );
      expect(res.accepted).toBe(false);
      expect(res.reason).toBe("CLEARANCE");
      expect(res.detail).toBe("CLEARANCE: clearance limit does not match requested destination");
      expect(aircraft).toEqual(acBefore);
    });

    it("rejects when aircraft is already operating IFR", async () => {
      const { world, aircraft } = setupRegionalWorld({ alreadyIfr: true });
      const acBefore = structuredClone(aircraft);
      const res = await handleRadioText(
        world,
        "DAL123 CLR TO KPDK VIA RADAR VECTORS",
        new SessionLog(),
      );
      expect(res.accepted).toBe(false);
      expect(res.reason).toBe("CLEARANCE");
      expect(res.detail).toBe("CLEARANCE: aircraft is already operating IFR");
      expect(aircraft).toEqual(acBefore);
    });
  });

  describe("AC2: Generated destinations", () => {
    it("rejects clearance to an ineligible (private/untowered) airport", async () => {
      const { world, aircraft } = setupRegionalWorld({ requestedDest: "00GA" });
      const acBefore = structuredClone(aircraft);
      const res = await handleRadioText(
        world,
        "DAL123 CLR TO 00GA VIA RADAR VECTORS",
        new SessionLog(),
      );
      expect(res.accepted).toBe(false);
      expect(res.reason).toBe("UNABLE_ROUTE");
      expect(res.detail).toBe(
        "UNABLE_ROUTE: destination airport is not an eligible controlled airport",
      );
      expect(aircraft).toEqual(acBefore);
    });

    it("accepts clearance to an eligible regional destination airport without facility branch", async () => {
      const { world, aircraft } = setupRegionalWorld({ requestedDest: "KPDK" });
      const res = await handleRadioText(
        world,
        "DAL123 CLR TO KPDK VIA RADAR VECTORS ALT 50 FREQ 119.5 SQ 4521",
        new SessionLog(),
      );
      expect(res.accepted).toBe(true);
      expect(aircraft.activeClearance?.limitId).toBe("KPDK");
    });
  });

  describe("AC3: Existing clearance grammar and optional fields", () => {
    it("accepts compact CLR with altitude, frequency, and squawk", async () => {
      const { world, aircraft } = setupRegionalWorld({ requestedDest: "KPDK" });
      const res = await handleRadioText(
        world,
        "DAL123 CLR TO KPDK VIA RADAR VECTORS ALT 50 FREQ 119.5 SQ 4521",
        new SessionLog(),
      );
      expect(res.accepted).toBe(true);
      expect(aircraft.intent.assignedAltitudeFt).toBe(5000);
      expect(aircraft.assignedSquawk).toBe("4521");
    });

    it("rejects CVIA with RADAR VECTORS access", async () => {
      const { world, aircraft } = setupRegionalWorld({ requestedDest: "KPDK" });
      const acBefore = structuredClone(aircraft);
      const res = await handleRadioText(
        world,
        "DAL123 CLR TO KPDK VIA RADAR VECTORS CVIA",
        new SessionLog(),
      );
      expect(res.accepted).toBe(false);
      expect(res.reason).toBe("CLEARANCE");
      expect(res.detail).toContain("CVIA requires a SID route");
      expect(aircraft).toEqual(acBefore);
    });
  });

  describe("AC4: Atomic operational transition", () => {
    it("transitions aircraft atomically to operational IFR, updates MSAW eligibility, and hooks cancellation", async () => {
      const { world, aircraft, requestRecord, scheduleIfrCancellationCandidate } =
        setupRegionalWorld({
          requestedDest: "KPDK",
        });

      const res = await handleRadioText(
        world,
        "DAL123 CLR TO KPDK VIA RADAR VECTORS ALT 50 FREQ 119.5 SQ 4521",
        new SessionLog(),
      );

      expect(res.accepted).toBe(true);
      expect(aircraft.flightRules).toBe("IFR");
      expect(aircraft.maintainVfr).toBe(false);
      expect(aircraft.assignedSquawk).toBe("4521");
      expect(aircraft.intent.assignedAltitudeFt).toBe(5000);
      expect(aircraft.ambientVfr?.alertEligibility).toBe("CONTROLLED");
      expect(aircraft.ambientVfr?.destinationAirportId).toBe("KPDK");
      expect(aircraft.activeClearance).toMatchObject({
        limitId: "KPDK",
        access: { type: "RADAR_VECTORS" },
      });
      expect(aircraft.radarVectorPending).toBe(true);
      expect(requestRecord?.status).toBe("APPROVED");
      expect(scheduleIfrCancellationCandidate).toHaveBeenCalledWith(world, "ac-dal");
    });
  });

  describe("AC5: Plan independence", () => {
    it("preserves manual VFR FlightPlan byte/deep-equal before and after pickup", async () => {
      const { world, aircraft } = setupRegionalWorld({ requestedDest: "KPDK", manualPlan: true });
      const planBefore = structuredClone(world.flightPlans[0]);

      const res = await handleRadioText(
        world,
        "DAL123 CLR TO KPDK VIA RADAR VECTORS ALT 50 FREQ 119.5 SQ 4521",
        new SessionLog(),
      );

      expect(res.accepted).toBe(true);
      expect(world.flightPlans[0]).toEqual(planBefore);
      expect(world.flightPlans[0].flightType).toBe("VFR");
      expect(aircraft.flightRules).toBe("IFR");
    });

    it("succeeds with synthetic compiler input when no manual plan exists", async () => {
      const { world, aircraft } = setupRegionalWorld({ requestedDest: "KPDK", manualPlan: false });
      expect(world.flightPlans).toHaveLength(0);

      const res = await handleRadioText(
        world,
        "DAL123 CLR TO KPDK VIA RADAR VECTORS ALT 50 FREQ 119.5 SQ 4521",
        new SessionLog(),
      );

      expect(res.accepted).toBe(true);
      expect(world.flightPlans).toHaveLength(0);
      expect(aircraft.flightRules).toBe("IFR");
      expect(aircraft.activeClearance?.limitId).toBe("KPDK");
    });
  });

  describe("AC6: Consumer consistency (datablocks, strips, system lists)", () => {
    it("reflects operational IFR in datablock projection even if manual plan is VFR", async () => {
      const { world, aircraft } = setupRegionalWorld({ requestedDest: "KPDK", manualPlan: true });

      // Before pickup: datablock reflects VFR
      const dbBefore = datablockSourceFromWorld(world, aircraft);
      expect(dbBefore.flightRules).toBe("VFR");

      // Apply clearance
      await handleRadioText(
        world,
        "DAL123 CLR TO KPDK VIA RADAR VECTORS ALT 50 FREQ 119.5 SQ 4521",
        new SessionLog(),
      );

      // After pickup: datablock reflects operational IFR
      const dbAfter = datablockSourceFromWorld(world, aircraft);
      expect(dbAfter.flightRules).toBe("IFR");
    });

    it("excludes operational IFR aircraft from VFR system list", async () => {
      const { world, aircraft } = setupRegionalWorld({ requestedDest: "KPDK" });

      expect(isVfrAircraft(aircraft)).toBe(true);

      await handleRadioText(
        world,
        "DAL123 CLR TO KPDK VIA RADAR VECTORS ALT 50 FREQ 119.5 SQ 4521",
        new SessionLog(),
      );

      expect(isVfrAircraft(aircraft)).toBe(false);
    });

    it("reflects operational IFR and clearance limit destination in terminal strips", async () => {
      const { world } = setupRegionalWorld({ requestedDest: "KPDK", manualPlan: true });

      // Before pickup
      const stripsBefore = terminalStripsFromWorld(world);
      const stripBefore = stripsBefore.arrivals.find((s) => s.callsign === "DAL123");
      expect(stripBefore?.flightRules).toBe("VFR");

      // Apply clearance
      await handleRadioText(
        world,
        "DAL123 CLR TO KPDK VIA RADAR VECTORS ALT 50 FREQ 119.5 SQ 4521",
        new SessionLog(),
      );

      // After pickup
      const stripsAfter = terminalStripsFromWorld(world);
      const stripAfter = stripsAfter.arrivals.find((s) => s.callsign === "DAL123");
      expect(stripAfter?.flightRules).toBe("IFR");
      expect(stripAfter?.destinationAirport).toBe("KPDK");
    });
  });
});

describe("T04-84: Cold call check-in and enriched IFR pickup request schema", () => {
  it("initial check-in emits cold call ('Atlanta Approach, <callsign>' or 'Approach, <callsign>') and stores PENDING request with full details", () => {
    const regionalFacility: RegionalFacility = {
      schemaVersion: 1,
      centerAirportId: "KATL",
      facilityName: "Atlanta",
      radiusNm: 40,
      arp: { latDeg: 33.64, lonDeg: -84.42 },
      source: { families: ["CIFP"] },
      airports: [
        {
          icao: "KPDK",
          name: "Peachtree-DeKalb",
          arp: { latDeg: 33.87, lonDeg: -84.3 },
          arpNm: { xNm: 12, yNm: 18 },
          fieldElevFt: 1000,
          magVarDeg: -5,
          publicUse: true,
          towered: true,
          eligible: true,
          serviceMetadata: {
            publicUse: true,
            towered: true,
            sourceFile: "APT.csv",
            sourceRecordId: "KPDK",
          },
          catalogRef: "airports/KPDK",
          hasPublishedApproaches: true,
          runways: [
            {
              id: "21L",
              threshold: { latDeg: 33.87, lonDeg: -84.3 },
              thresholdNm: { xNm: 12, yNm: 18 },
              headingTrueDeg: 210,
              headingMagDeg: 215,
              lengthFt: 6000,
            },
          ],
        },
      ],
      airspaces: [
        {
          id: "KPDK-CLASS-D",
          name: "KPDK Class D",
          type: "CONTROLLED",
          class: "D",
          centerAirportId: "KPDK",
          lowerLimit: { reference: "MSL", unit: "MSL", altitudeFt: 0 },
          upperLimit: { reference: "MSL", unit: "MSL", altitudeFt: 3000 },
          lowerLimitFt: 0,
          upperLimitFt: 3000,
          segments: [],
        },
      ],
      getAirport: (icao) => (icao === "KPDK" ? regionalFacility.airports[0] : undefined),
      hasAirport: (icao) => icao === "KPDK",
      getEligibleDestinations: () => [regionalFacility.airports[0]],
      getEligibleDestination: (icao) => {
        if (icao === "KPDK") return regionalFacility.airports[0];
        throw new Error("not found");
      },
      getAirspaces: () => regionalFacility.airspaces,
    };

    const queue = createVfrRequestQueue({
      config: { flightFollowingPercent: 0, ifrPickupPercent: 100, requestCapPerHour: 10 },
      regional: regionalFacility,
      seed: 1,
      initialSlotOffsetMs: 0,
    });

    const aircraft = createAircraft({
      id: "ac-ifr-test",
      callsign: "C172SP",
      xNm: 10,
      yNm: 15,
      altitudeFt: 5000,
      headingDeg: 120,
      speedKt: 110,
      aircraftType: "C172",
      flightRules: "VFR",
    });
    aircraft.callsign = "Skyhawk 172SP";
    aircraft.ambientVfr = {
      mission: "LOCAL",
      zoneId: "Z1",
      spawnedAtSimMs: 0,
      alertEligibility: "AMBIENT_SUPPRESSED",
      phase: "CRUISE",
    };

    const world = createWorld({
      aircraft: [aircraft],
      regional: regionalFacility,
    });

    const log = new SessionLog();
    const heard: string[] = [];
    let statusText: string | undefined;

    queue.scheduleFromWorld(world, 0);
    queue.drain({
      world,
      log,
      setStatus: (txt) => {
        statusText = txt;
      },
      radio: { isBusy: () => false, play: (t) => void heard.push(t) },
    });

    // 1. Initial check-in emits cold call with facility prefix
    expect(heard).toHaveLength(1);
    expect(heard[0]).toBe("Atlanta Approach, Skyhawk 172SP");
    expect(statusText).toBe("Atlanta Approach, Skyhawk 172SP");

    // 2. Request pushed to world.radioRequests with status PENDING and complete details
    expect(world.radioRequests).toHaveLength(1);
    const radioReq = world.radioRequests![0];
    expect(radioReq.status).toBe("PENDING");
    expect(radioReq.kind).toBe("IFR_PICKUP");
    expect(radioReq.callsign).toBe("Skyhawk 172SP");
    expect(radioReq.details).toMatchObject({
      aircraftType: "C172",
      destinationAirportId: "KPDK",
      positionNm: { xNm: 10, yNm: 15 },
      altitudeFt: 5000,
      headingDeg: 120,
    });
    expect(radioReq.details.requestedAltitudeFt).toBeDefined();

    // 3. Generic fallback without facilityName
    delete regionalFacility.facilityName;
    const aircraft2 = createAircraft({
      id: "ac-ifr-generic",
      callsign: "C182RG",
      xNm: 5,
      yNm: 8,
      altitudeFt: 6000,
      headingDeg: 90,
      speedKt: 120,
      aircraftType: "C182",
      flightRules: "VFR",
    });
    aircraft2.ambientVfr = {
      mission: "LOCAL",
      zoneId: "Z1",
      spawnedAtSimMs: 0,
      alertEligibility: "AMBIENT_SUPPRESSED",
      phase: "CRUISE",
    };
    world.aircraft.push(aircraft2);
    queue.scheduleFromWorld(world, 0);
    world.simTimeMs = 3600000;
    const heard2: string[] = [];
    queue.drain({
      world,
      log,
      radio: { isBusy: () => false, play: (t) => void heard2.push(t) },
    });
    expect(heard2).toHaveLength(1);
    expect(heard2[0]).toBe("Approach, C182RG");
  });

  it("formatIfrPickupRequest produces complete and sparse strings cleanly", () => {
    // Complete string
    const complete = formatIfrPickupRequest({
      callsign: "N12345",
      positionPhrase: "10 miles south of KPDK",
      aircraftType: "C172",
      destinationAirportId: "KPDK",
      requestedAltitudeFt: 4000,
    });
    expect(complete).toBe(
      "N12345, 10 miles south of KPDK, C172, request IFR to KPDK, requested altitude 4000",
    );

    // Sparse: omitted position and aircraft type
    const sparseNoPosNoType = formatIfrPickupRequest({
      callsign: "N12345",
      destinationAirportId: "KPDK",
      requestedAltitudeFt: 5000,
    });
    expect(sparseNoPosNoType).toBe("N12345, request IFR to KPDK, requested altitude 5000");

    // Sparse: omitted altitude
    const sparseNoAlt = formatIfrPickupRequest({
      callsign: "N12345",
      aircraftType: "BE36",
      destinationAirportId: "KFTY",
    });
    expect(sparseNoAlt).toBe("N12345, BE36, request IFR to KFTY");

    // Minimal: callsign only
    const minimal = formatIfrPickupRequest({
      callsign: "N12345",
    });
    expect(minimal).toBe("N12345, request IFR");
  });
});
