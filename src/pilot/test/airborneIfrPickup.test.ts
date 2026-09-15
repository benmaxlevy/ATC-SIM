import { describe, expect, it, vi } from "vitest";
import {
  createAircraft,
  createWorld,
  saveFlightPlanDraft,
  SessionLog,
  type RadioRequest,
} from "@core";
import { handleRadioText } from "../handleRadioText";
import { datablockSourceFromWorld } from "../../scope/datablock";
import { isVfrAircraft } from "../../scope/systemLists";
import { terminalStripsFromWorld } from "../../ui/strips/terminalStripsFromWorld";

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
