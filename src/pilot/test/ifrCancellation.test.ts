import { describe, expect, it } from "vitest";
import {
  createAircraft,
  createFlightPlanRoute,
  createWorld,
  saveFlightPlanDraft,
  SessionLog,
  type Aircraft,
  type RadioRequest,
  type World,
} from "@core";
import type { RegionalAirspaceVolume, RegionalFacility } from "../../scenario/regional";
import { defaultIfrCancellationValidator, VfrRequestQueue } from "../vfrRequestQueue";
import { validateInstructions } from "../validate";
import { handleRadioText } from "../handleRadioText";
import { datablockSourceFromWorld } from "../../scope/datablock";
import { isVfrAircraft } from "../../scope/systemLists";
import { terminalStripsFromWorld } from "../../ui/strips/terminalStripsFromWorld";

const SYNTHETIC_CLASS_B_VOLUME: RegionalAirspaceVolume = {
  id: "UC:KATL:B_CORE",
  name: "ATLANTA BRAVO CORE",
  type: "CONTROLLED",
  class: "B",
  centerAirportId: "KATL",
  lowerLimit: { altitudeFt: 0, unit: "MSL", reference: "MSL" },
  upperLimit: { altitudeFt: 12500, unit: "MSL", reference: "MSL" },
  lowerLimitFt: 0,
  upperLimitFt: 12500,
  segments: [
    {
      sequence: 1,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 33.7, lonDeg: -84.5 },
      positionNm: { xNm: -6, yNm: -6 },
    },
    {
      sequence: 2,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 33.7, lonDeg: -84.3 },
      positionNm: { xNm: 6, yNm: -6 },
    },
    {
      sequence: 3,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 33.5, lonDeg: -84.3 },
      positionNm: { xNm: 6, yNm: 6 },
    },
    {
      sequence: 4,
      boundaryVia: "G",
      boundaryViaType: "GREAT_CIRCLE",
      position: { latDeg: 33.5, lonDeg: -84.5 },
      positionNm: { xNm: -6, yNm: 6 },
    },
  ],
};

function setupTestWorld(options?: {
  xNm?: number;
  yNm?: number;
  altitudeFt?: number;
  flightRules?: "IFR" | "VFR";
  airborne?: boolean;
  cancellationPending?: boolean;
  withActiveClearance?: boolean;
  withFlightFollowing?: boolean;
  squawk?: string;
  clearedApproachId?: string | null;
  lateralType?: "HEADING" | "LOC" | "INTERCEPT_LOC";
  verticalType?: "ASSIGNED" | "GS";
  destinationAirportId?: string;
  withBravoAirspace?: boolean;
}): { world: World; aircraft: Aircraft } {
  const xNm = options?.xNm ?? 20;
  const yNm = options?.yNm ?? 20;
  const altitudeFt = options?.altitudeFt ?? 4500;
  const flightRules = options?.flightRules ?? "IFR";
  const airborne = options?.airborne ?? true;
  const cancellationPending = options?.cancellationPending ?? true;
  const withActiveClearance = options?.withActiveClearance ?? true;
  const withFlightFollowing = options?.withFlightFollowing ?? true;
  const squawk = options?.squawk ?? "4721";
  const clearedApproachId = options?.clearedApproachId ?? null;
  const lateralType = options?.lateralType ?? "HEADING";
  const verticalType = options?.verticalType ?? "ASSIGNED";
  const destinationAirportId = options?.destinationAirportId ?? "KPDK";

  const aircraft = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm,
    yNm,
    headingDeg: 360,
    altitudeFt,
    speedKt: 140,
    airborne,
    flightRules,
    assignedSquawk: squawk,
    squawk,
    cancellationPending,
    ...(withFlightFollowing
      ? {
          flightFollowing: {
            active: true,
            approvedAtSimMs: 5000,
            requestId: "req-ff-1",
          },
        }
      : {}),
    ...(withActiveClearance
      ? {
          activeClearance: {
            route: createFlightPlanRoute({ text: "KPDK", segments: [] }),
            limitId: destinationAirportId,
            access: { type: "RADAR_VECTORS" },
            issuedAtSimMs: 6000,
          },
        }
      : {}),
    ambientVfr: {
      mission: "AIRPORT_BOUND",
      zoneId: "zone-north",
      spawnedAtSimMs: 1000,
      alertEligibility: "CONTROLLED",
      destinationAirportId,
      waypoints: [
        { xNm: 20, yNm: 22, altitudeFt: 4500 },
        { xNm: 15, yNm: 20, altitudeFt: 4000 },
      ],
      waypointIndex: 0,
    },
  });

  aircraft.intent.clearedApproachId = clearedApproachId;
  if (lateralType === "LOC") {
    aircraft.intent.lateral = { type: "LOC", approachId: clearedApproachId ?? "ILS27" };
  } else if (lateralType === "INTERCEPT_LOC") {
    aircraft.intent.lateral = { type: "INTERCEPT_LOC", approachId: clearedApproachId ?? "ILS27" };
  } else {
    aircraft.intent.lateral = { type: "HEADING", headingDeg: 360 };
  }

  if (verticalType === "GS") {
    aircraft.intent.vertical = { type: "GS", approachId: clearedApproachId ?? "ILS27" };
  } else {
    aircraft.intent.vertical = { type: "ASSIGNED" };
  }

  const world = createWorld({
    aircraft: [aircraft],
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
    schemaVersion: 1,
    centerAirportId: "KATL",
    radiusNm: 40,
    arp: { latDeg: 33.64, lonDeg: -84.42, xNm: 0, yNm: 0 },
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
          arp: { latDeg: 33.87, lonDeg: -84.3, xNm: 15, yNm: 20 },
        },
      ],
    },
    airspaces: options?.withBravoAirspace !== false ? [SYNTHETIC_CLASS_B_VOLUME] : [],
  } as unknown as RegionalFacility;

  saveFlightPlanDraft(world, {
    acid: "DAL123",
    filedRoute: "KPDK",
    flightType: "VFR",
    assignedBeacon: squawk,
  });

  return { world, aircraft };
}

describe("Ticket T04-75: Pilot IFR Cancellation and VFR Continuation", () => {
  describe("1. defaultIfrCancellationValidator candidate pre-conditions (AC1)", () => {
    it("withdraws candidate if aircraft is not operating IFR", () => {
      const { world, aircraft } = setupTestWorld({ flightRules: "VFR" });
      const result = defaultIfrCancellationValidator(aircraft, world);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("ALREADY_VFR");
      }
    });

    it("withdraws candidate if aircraft has no active IFR clearance", () => {
      const { world, aircraft } = setupTestWorld({ withActiveClearance: false });
      const result = defaultIfrCancellationValidator(aircraft, world);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("NO_ACTIVE_IFR");
      }
    });

    it("withdraws candidate if aircraft is on the ground", () => {
      const { world, aircraft } = setupTestWorld({ airborne: false, altitudeFt: 0 });
      const result = defaultIfrCancellationValidator(aircraft, world);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("ON_GROUND");
      }
    });

    it("withdraws candidate if aircraft is on approach final", () => {
      const { world, aircraft } = setupTestWorld({
        clearedApproachId: "ILS27",
        lateralType: "LOC",
      });
      const result = defaultIfrCancellationValidator(aircraft, world);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("ON_APPROACH_FINAL");
      }
    });

    it("withdraws candidate if aircraft is inside Class B airspace", () => {
      // (0, 0, 4500) is inside SYNTHETIC_CLASS_B_VOLUME ([-6,6]x[-6,6], [0, 12500])
      const { world, aircraft } = setupTestWorld({ xNm: 0, yNm: 0, altitudeFt: 4500 });
      const result = defaultIfrCancellationValidator(aircraft, world);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("INSIDE_CLASS_B");
      }
    });

    it("withdraws candidate if aircraft is inside surface Bravo ring of center airport", () => {
      // (2, 2, 15000) is outside 3D volume ceiling 12500 ft, but inside 2D surface ring polygon
      const { world, aircraft } = setupTestWorld({
        xNm: 2,
        yNm: 2,
        altitudeFt: 15000,
      });
      const result = defaultIfrCancellationValidator(aircraft, world);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("INSIDE_SURFACE_BRAVO");
      }
    });

    it("passes candidate when airborne IFR outside Class B with safe continuation", () => {
      const { world, aircraft } = setupTestWorld({ xNm: 20, yNm: 20, altitudeFt: 4500 });
      const result = defaultIfrCancellationValidator(aircraft, world);
      expect(result.ok).toBe(true);
    });
  });

  describe("2. VfrRequestQueue candidate schedule and transmission (AC1)", () => {
    it("sets aircraft.cancellationPending = true and emits report on transmission", () => {
      const { world, aircraft } = setupTestWorld({
        xNm: 20,
        yNm: 20,
        altitudeFt: 4500,
        cancellationPending: false,
      });
      const log = new SessionLog();
      const queue = new VfrRequestQueue({
        config: { ifrCancellationPercent: 100 },
        regional: (world.regional as RegionalFacility) ?? undefined,
      });

      queue.scheduleIfrCancellationCandidate(aircraft, 1000, {
        delayMs: 2000,
        log,
      });

      // Advance sim time to 3000 ms (due)
      world.simTimeMs = 3000;
      queue.drain({ world, log });

      expect(aircraft.cancellationPending).toBe(true);
      const reported = log.byType("pilot.cancel_ifr.reported")[0];
      expect(reported).toBeDefined();
      expect(reported?.callsign).toBe("DAL123");
      expect(reported?.text).toBe("DAL123, canceling IFR");
    });
  });

  describe("3. Controller acknowledgment validation & rejections (AC4, AC7)", () => {
    it("rejects ACKNOWLEDGE_IFR_CANCELLATION when no pending cancellation", () => {
      const { world, aircraft } = setupTestWorld({ cancellationPending: false });
      const result = validateInstructions(aircraft, [{ type: "ACKNOWLEDGE_IFR_CANCELLATION" }], {
        regional: (world.regional as RegionalFacility) ?? null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("CANCELLATION");
        expect(result.detail).toBe("CANCELLATION: no pending pilot IFR cancellation");
      }
    });

    it("rejects when aircraft is not operating IFR", () => {
      const { world, aircraft } = setupTestWorld({
        flightRules: "VFR",
        cancellationPending: true,
      });
      const result = validateInstructions(aircraft, [{ type: "ACKNOWLEDGE_IFR_CANCELLATION" }], {
        regional: (world.regional as RegionalFacility) ?? null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("CANCELLATION");
        expect(result.detail).toBe("CANCELLATION: aircraft is not operating IFR");
      }
    });

    it("rejects when aircraft is on the ground", () => {
      const { world, aircraft } = setupTestWorld({
        airborne: false,
        altitudeFt: 0,
        cancellationPending: true,
      });
      const result = validateInstructions(aircraft, [{ type: "ACKNOWLEDGE_IFR_CANCELLATION" }], {
        regional: (world.regional as RegionalFacility) ?? null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("CANCELLATION");
        expect(result.detail).toBe("CANCELLATION: aircraft is on ground");
      }
    });

    it("rejects when aircraft is inside Class B airspace", () => {
      const { world, aircraft } = setupTestWorld({
        xNm: 0,
        yNm: 0,
        altitudeFt: 4500,
        cancellationPending: true,
      });
      const result = validateInstructions(aircraft, [{ type: "ACKNOWLEDGE_IFR_CANCELLATION" }], {
        regional: (world.regional as RegionalFacility) ?? null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("CANCELLATION");
        expect(result.detail).toBe("CANCELLATION: cannot cancel IFR inside Class B airspace");
      }
    });

    it("rejects when safe VFR continuation cannot be established", () => {
      const { world, aircraft } = setupTestWorld({
        xNm: 20,
        yNm: 20,
        altitudeFt: 4500,
        cancellationPending: true,
      });
      const result = validateInstructions(aircraft, [{ type: "ACKNOWLEDGE_IFR_CANCELLATION" }], {
        regional: (world.regional as RegionalFacility) ?? null,
        vfrContinuationValidator: () => false,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("CANCELLATION");
        expect(result.detail).toBe("CANCELLATION: unable to establish safe VFR continuation");
      }
    });

    it("rejects when ACKNOWLEDGE_IFR_CANCELLATION is bundled with another instruction", () => {
      const { world, aircraft } = setupTestWorld({
        xNm: 20,
        yNm: 20,
        altitudeFt: 4500,
        cancellationPending: true,
      });
      const result = validateInstructions(
        aircraft,
        [
          { type: "ACKNOWLEDGE_IFR_CANCELLATION" },
          { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
        ],
        { regional: (world.regional as RegionalFacility) ?? null },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("CANCELLATION");
        expect(result.detail).toBe("cancellation instruction must be the only instruction");
      }
    });
  });

  describe("4. Operational transition and readback (AC2, AC3)", () => {
    it("accepts typed and spoken acknowledgment and executes atomic operational reversion to VFR", async () => {
      const { world, aircraft } = setupTestWorld({
        xNm: 20,
        yNm: 20,
        altitudeFt: 4500,
        cancellationPending: true,
        clearedApproachId: "ILS27",
        lateralType: "INTERCEPT_LOC",
        verticalType: "GS",
      });
      const log = new SessionLog();

      const res = await handleRadioText(world, "DAL123 IFR cancellation received", log);
      expect(res.accepted).toBe(true);
      expect(res.readback).toBe("Delta 123 IFR cancellation received");

      // Operational rules revert to VFR
      expect(aircraft.flightRules).toBe("VFR");
      expect(aircraft.maintainVfr).toBe(true);
      expect(aircraft.activeClearance).toBeUndefined();
      expect(aircraft.cancellationPending).toBeUndefined();

      // Approach guidance cleared
      expect(aircraft.intent.clearedApproachId).toBeNull();
      expect(aircraft.intent.locInterceptApproachId).toBeNull();
      expect(aircraft.intent.expectedApproachId).toBeNull();
      expect(aircraft.intent.vertical?.type).toBe("ASSIGNED");
      expect(aircraft.intent.lateral?.type).toBe("HEADING");

      // Alert eligibility reset to AMBIENT_SUPPRESSED
      expect(aircraft.ambientVfr?.alertEligibility).toBe("AMBIENT_SUPPRESSED");

      // Acknowledged log event recorded
      const ackEvent = log.all().find((e) => e.type === "pilot.cancel_ifr.acknowledged");
      expect(ackEvent).toBeDefined();
    });

    it("accepts spoken comma format: DAL123, IFR cancellation received", async () => {
      const { world, aircraft } = setupTestWorld({
        xNm: 20,
        yNm: 20,
        altitudeFt: 4500,
        cancellationPending: true,
      });
      const log = new SessionLog();

      const res = await handleRadioText(world, "DAL123, IFR cancellation received", log, 0, {
        source: "voice",
      });
      expect(res.accepted).toBe(true);
      expect(res.readback).toBe("Delta 123 IFR cancellation received");
      expect(aircraft.flightRules).toBe("VFR");
    });
  });

  describe("5. Service separation and flight plan independence (AC5, AC6)", () => {
    it("preserves flight following and discrete beacon squawk unchanged", async () => {
      const { world, aircraft } = setupTestWorld({
        xNm: 20,
        yNm: 20,
        altitudeFt: 4500,
        cancellationPending: true,
        withFlightFollowing: true,
        squawk: "4721",
      });
      const log = new SessionLog();

      await handleRadioText(world, "DAL123 IFR cancellation received", log);

      // Flight following remains active
      expect(aircraft.flightFollowing?.active).toBe(true);
      // Beacon code is NOT reset to 1200
      expect(aircraft.squawk).toBe("4721");
      expect(aircraft.assignedSquawk).toBe("4721");
    });

    it("preserves world.flightPlans byte/deep-equal before and after cancellation", async () => {
      const { world } = setupTestWorld({
        xNm: 20,
        yNm: 20,
        altitudeFt: 4500,
        cancellationPending: true,
      });
      const log = new SessionLog();

      const planBefore = JSON.parse(JSON.stringify(world.flightPlans));

      await handleRadioText(world, "DAL123 IFR cancellation received", log);

      const planAfter = JSON.parse(JSON.stringify(world.flightPlans));
      expect(planAfter).toEqual(planBefore);
    });
  });

  describe("6. Datablock and Strip presentation updates (AC3)", () => {
    it("updates datablock and terminal strip to reflect operational VFR rules", async () => {
      const { world, aircraft } = setupTestWorld({
        xNm: 20,
        yNm: 20,
        altitudeFt: 4500,
        cancellationPending: true,
      });
      const log = new SessionLog();

      // Before cancellation: operational rules are IFR
      expect(isVfrAircraft(aircraft, undefined, world)).toBe(false);

      await handleRadioText(world, "DAL123 IFR cancellation received", log);

      // After cancellation: operational rules are VFR
      expect(isVfrAircraft(aircraft, undefined, world)).toBe(true);

      const db = datablockSourceFromWorld(world, aircraft);
      expect(db).toBeDefined();
      expect(db.flightRules).toBe("VFR");

      const strips = terminalStripsFromWorld(world);
      const strip = strips.arrivals.find((s) => s.acid === aircraft.callsign);
      expect(strip).toBeDefined();
      expect(strip?.flightRules).toBe("VFR");
    });
  });

  describe("7. End-to-end integration: pickup -> schedule -> report -> cancel (AC1-AC8)", () => {
    it("executes full lifecycle from airborne VFR to IFR pickup, pilot cancellation report, and controller acknowledgment", async () => {
      const { world, aircraft } = setupTestWorld({
        xNm: 20,
        yNm: 20,
        altitudeFt: 4500,
        flightRules: "VFR",
        cancellationPending: false,
        withActiveClearance: false,
        withFlightFollowing: true,
        squawk: "4721",
      });
      const log = new SessionLog();
      const queue = new VfrRequestQueue({
        config: { ifrCancellationPercent: 100 },
        regional: (world.regional as RegionalFacility) ?? undefined,
      });
      world.vfrRequestQueue = queue;

      // Add IFR pickup request
      const pickupReq: RadioRequest = {
        id: "req-pickup-1",
        aircraftId: aircraft.id,
        callsign: aircraft.callsign,
        kind: "IFR_PICKUP",
        status: "IDENTIFIED",
        requestedAtSimMs: 1000,
        details: {
          destinationAirportId: "KPDK",
          requestedAltitudeFt: 5000,
        },
      };
      world.radioRequests = [pickupReq];
      aircraft.radarContact = {
        distanceNm: 10,
        referenceId: "KATL",
        referenceKind: "FIX",
        reportedAtSimMs: 1000,
      };

      // 1. Controller issues IFR clearance (T04-74)
      const clearRes = await handleRadioText(
        world,
        "DAL123 CLR TO KPDK VIA RADAR VECTORS ALT 50",
        log,
      );
      expect(clearRes.accepted).toBe(true);
      expect(aircraft.flightRules).toBe("IFR");
      expect(aircraft.activeClearance).toBeDefined();
      expect(aircraft.ambientVfr?.alertEligibility).toBe("CONTROLLED");

      // 2. Schedule cancellation candidate
      queue.scheduleIfrCancellationCandidate(aircraft, world.simTimeMs, {
        delayMs: 5000,
        log,
      });

      // 3. Sim advances to trigger time
      world.simTimeMs += 5000;
      queue.drain({ world, log });

      expect(aircraft.cancellationPending).toBe(true);

      // 4. Controller acknowledges pilot cancellation
      const cancelRes = await handleRadioText(world, "DAL123 IFR cancellation received", log);
      expect(cancelRes.accepted).toBe(true);
      expect(cancelRes.readback).toBe("Delta 123 IFR cancellation received");

      // 5. Verify final state
      expect(aircraft.flightRules).toBe("VFR");
      expect(aircraft.activeClearance).toBeUndefined();
      expect(aircraft.cancellationPending).toBeUndefined();
      expect(aircraft.flightFollowing?.active).toBe(true);
      expect(aircraft.squawk).toBe("4721");
      expect(aircraft.ambientVfr?.alertEligibility).toBe("AMBIENT_SUPPRESSED");
    });
  });
});
