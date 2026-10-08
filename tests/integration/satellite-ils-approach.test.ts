/**
 * Integration tests: Arrival-airport approach context resolver and satellite ILS parity (T04-81).
 *
 * Contract verification:
 * 1. DAL123 (dest KATL) APP I26R accepted; APP I21L rejected UNKNOWN_APPROACH.
 * 2. N123AB (dest KPDK) APP I21L accepted, captures localizer & GS, tracks, lands, despawns with nav.landed.
 * 3. N123AB (dest KPDK) APP H21LZ rejected UNKNOWN_APPROACH (fail-closed RNAV guard).
 * 4. N123AB with fix clearance limit CLR TO SIITH falls through to destination airport KPDK.
 * 5. Satellite arrival within 4 NM of threshold does not trigger nuisance MSAW alert;
 *    arrival outside FAF below floor triggers MSAW.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  createAircraft,
  createFlightPlan,
  createWorld,
  DEFAULT_MSAW_INHIBIT,
  evaluateMsaw,
  isMsawInhibited,
  resolveApproachContext,
  resolveDestinationAirportIcao,
  SessionLog,
  SIM_DT_S,
  stepWorld,
  type Aircraft,
  type AircraftInit,
  type MvaChart,
} from "@core";
import { handleRadioText } from "@pilot";
import { loadPlayableScenario, loadRegionalPack, type RegionalFacility } from "@scenario";

function makeTestAircraft(init: Partial<AircraftInit> & { callsign: string }): Aircraft {
  return createAircraft({
    xNm: 0,
    yNm: 0,
    headingDeg: 360,
    altitudeFt: 5000,
    speedKt: 150,
    ...init,
  });
}

describe("T04-81 satellite ILS approach integration", () => {
  let regional: RegionalFacility;
  let katlScenario: ReturnType<typeof loadPlayableScenario>;

  beforeEach(() => {
    katlScenario = loadPlayableScenario("katl");
    const pack = loadRegionalPack("katl");
    if (!pack) {
      throw new Error("Failed to load katl regional pack");
    }
    regional = pack;
  });

  it("DAL123 (dest KATL): accepts center approach APP I26R and rejects satellite approach APP I21L", async () => {
    const log = new SessionLog();
    const world = createWorld({
      catalog: katlScenario.catalog,
      regional,
      sessionLog: log,
    });

    const dal = makeTestAircraft({
      id: "ac-dal",
      callsign: "DAL123",
      destination: "KATL",
      xNm: 0,
      yNm: 15,
      altitudeFt: 6000,
      headingDeg: 260,
      speedKt: 210,
    });
    world.aircraft = [dal];

    // Center approach I26R is accepted
    const acceptedRes = await handleRadioText(world, "DAL123 APP I26R", log);
    expect(acceptedRes.accepted).toBe(true);
    expect(dal.intent.clearedApproachId).toBe("I26R");

    // Clear intent to reset
    dal.intent.clearedApproachId = null;
    dal.intent.locInterceptApproachId = null;

    // Satellite approach I21L (KPDK) must be rejected for a KATL-bound arrival
    const rejectedRes = await handleRadioText(world, "DAL123 APP I21L", log);
    expect(rejectedRes.accepted).toBe(false);
    expect(rejectedRes.reason).toMatch(/UNKNOWN_APPROACH|APPROACH/i);
    expect(dal.intent.clearedApproachId).toBeNull();
  });

  it("N123AB (dest KPDK): accepts APP I21L, captures localizer & GS, tracks down to threshold, and despawns with nav.landed", async () => {
    const log = new SessionLog();
    const world = createWorld({
      catalog: katlScenario.catalog,
      regional,
      sessionLog: log,
    });

    const acCtx = resolveApproachContext(
      makeTestAircraft({ id: "temp", callsign: "N123AB", destination: "KPDK" }),
      world,
    );
    expect(acCtx.airportIcao).toBe("KPDK");
    expect(acCtx.catalog).toBeDefined();
    expect(acCtx.fixRegistry).toBeDefined();

    // KPDK 21L threshold location
    const rw21L = acCtx.fixRegistry?.get("RW21L");
    expect(rw21L).toBeDefined();
    const threshX = rw21L!.xNm;
    const threshY = rw21L!.yNm;

    // Runway 21L course is ~205.5 deg.
    // Place aircraft 2 NM out on final approach course 205.5 deg
    const courseRad = (205.5 * Math.PI) / 180;
    const distNm = 2.0;
    const initX = threshX - distNm * Math.sin(courseRad);
    const initY = threshY - distNm * Math.cos(courseRad);

    const ac = makeTestAircraft({
      id: "ac-pdk-1",
      callsign: "N123AB",
      destination: "KPDK",
      xNm: initX,
      yNm: initY,
      altitudeFt: 1500,
      headingDeg: 205.5,
      speedKt: 120,
    });
    world.aircraft = [ac];

    // Issue approach command via radio
    const appRes = await handleRadioText(world, "N123AB APP I21L", log);
    expect(appRes.accepted).toBe(true);
    expect(ac.intent.clearedApproachId).toBe("I21L");
    expect(ac.intent.lateral?.type).toBe("INTERCEPT_LOC");

    // Clear for landing
    ac.intent.landingCleared = true;

    // Step world until aircraft lands and despawns or max 120 seconds
    const maxSteps = 120 * 20; // 120 seconds at 20 Hz
    for (let step = 0; step < maxSteps; step++) {
      stepWorld(world, SIM_DT_S);
      if (world.aircraft.length === 0) {
        break;
      }
    }

    // Aircraft should have landed and despawned
    expect(world.aircraft.find((a) => a.id === ac.id)).toBeUndefined();
    const landedEvents = log.byType("nav.landed");
    expect(landedEvents.length).toBeGreaterThan(0);
    expect(landedEvents[0]?.callsign).toBe("N123AB");
    expect(landedEvents[0]?.approachId).toBe("I21L");
  });

  it("N123AB (dest KPDK): rejects RNAV approach APP H21LZ with fail-closed guard", async () => {
    const log = new SessionLog();
    const world = createWorld({
      catalog: katlScenario.catalog,
      regional,
      sessionLog: log,
    });

    const ac = makeTestAircraft({
      id: "ac-rnav",
      callsign: "N123AB",
      destination: "KPDK",
      xNm: 10,
      yNm: 20,
      altitudeFt: 3000,
      headingDeg: 200,
      speedKt: 150,
    });
    world.aircraft = [ac];

    // RNAV approach H21LZ (or R21LY) must be rejected with UNKNOWN_APPROACH
    const res = await handleRadioText(world, "N123AB APP H21LZ", log);
    expect(res.accepted).toBe(false);
    expect(res.reason).toMatch(/UNKNOWN_APPROACH|APPROACH/i);
    expect(ac.intent.clearedApproachId).toBeNull();

    // Verify R21LY is also rejected
    const res2 = await handleRadioText(world, "N123AB APP R21LY", log);
    expect(res2.accepted).toBe(false);
    expect(res2.reason).toMatch(/UNKNOWN_APPROACH|APPROACH/i);
  });

  it("Aircraft with fix clearance limit CLR TO SIITH falls through limit to flight plan destination", async () => {
    const log = new SessionLog();
    const world = createWorld({
      catalog: katlScenario.catalog,
      regional,
      sessionLog: log,
    });

    const planRes = createFlightPlan({
      id: "fp-siith",
      acid: "N987CD",
      airportId: "KPDK",
      fixes: ["SIITH"],
      assignedBeacon: "4321",
      scratchpads: [],
    });
    expect(planRes.ok).toBe(true);
    if (!planRes.ok) return;
    world.flightPlans = [planRes.value];

    const ac = makeTestAircraft({
      id: "ac-siith",
      callsign: "N987CD",
      squawk: "4321",
      reportedSquawk: "4321",
      activeClearance: {
        limitId: "SIITH", // Fix limit, NOT an airport
        route: {
          route: { text: "SIITH", segments: [] },
          nextIndex: 0,
          revision: 1,
          lifecycle: "active",
        },
        access: { type: "RADAR_VECTORS" },
        issuedAtSimMs: 0,
      },
      destination: "KPDK",
    });
    world.aircraft = [ac];

    // Resolves to destination KPDK despite limitId being SIITH
    expect(resolveDestinationAirportIcao(ac, world)).toBe("KPDK");

    // Satellite approach I21L accepted because destination is KPDK
    const appRes = await handleRadioText(world, "N987CD APP I21L", log);
    expect(appRes.accepted).toBe(true);
    expect(ac.intent.clearedApproachId).toBe("I21L");
  });

  it("Satellite arrival MSAW alert behavior: inhibited inside 4 NM of threshold; triggers outside FAF below floor", () => {
    const world = createWorld({
      catalog: katlScenario.catalog,
      regional,
    });

    const acCtx = resolveApproachContext(
      makeTestAircraft({ id: "dummy", callsign: "N123AB", destination: "KPDK" }),
      world,
    );
    const rw21L = acCtx.fixRegistry?.get("RW21L");
    expect(rw21L).toBeDefined();
    const threshX = rw21L!.xNm;
    const threshY = rw21L!.yNm;

    // Artificial MVA chart with 2500 ft floor
    const mockMva: MvaChart = {
      airportId: "KATL",
      defaultMinAltitudeFt: 2500,
      polygons: [],
    };
    world.mvaChart = mockMva;

    // 1. Aircraft on final approach within 2 NM of KPDK RW21L threshold, established on LOC/GS
    const onFinalAc = makeTestAircraft({
      id: "ac-final",
      callsign: "N123AB",
      destination: "KPDK",
      xNm: threshX + 1.0,
      yNm: threshY + 1.0,
      altitudeFt: 1400, // Below 2500 ft MVA floor
    });
    onFinalAc.intent.clearedApproachId = "I21L";
    onFinalAc.intent.lateral = { type: "LOC", approachId: "I21L" };
    onFinalAc.intent.vertical = { type: "GS", approachId: "I21L" };
    world.aircraft = [onFinalAc];

    // Check MSAW inhibit geometry with thresholdOverride
    const thresholdOverride = {
      xNm: threshX,
      yNm: threshY,
      fafDistanceNm: 6.0,
    };
    expect(
      isMsawInhibited(
        onFinalAc,
        { thresholdXNm: 0, thresholdYNm: 0, fafDistanceNm: 5.0 },
        thresholdOverride,
      ),
    ).toBe(true);

    // evaluateMsaw in world:
    const overrideMap = new Map([[onFinalAc.id, thresholdOverride]]);
    const alertsFinal = evaluateMsaw(world.aircraft, world.mvaChart, DEFAULT_MSAW_INHIBIT, (a) =>
      overrideMap.get(a.id),
    );
    expect(alertsFinal.find((a) => a.callsign === "N123AB")).toBeUndefined();

    // 2. Aircraft outside FAF (15 NM away) below floor (1200 ft vs 2500 ft floor)
    const lowAc = makeTestAircraft({
      id: "ac-low",
      callsign: "N456CD",
      destination: "KPDK",
      xNm: threshX + 15.0,
      yNm: threshY + 15.0,
      altitudeFt: 1200,
    });
    lowAc.intent.clearedApproachId = "I21L";
    lowAc.intent.lateral = { type: "LOC", approachId: "I21L" };
    lowAc.intent.vertical = { type: "GS", approachId: "I21L" };
    world.aircraft = [lowAc];
    const lowOverrideMap = new Map([[lowAc.id, thresholdOverride]]);
    const alertsLow = evaluateMsaw(world.aircraft, world.mvaChart, DEFAULT_MSAW_INHIBIT, (a) =>
      lowOverrideMap.get(a.id),
    );
    const lowAlert = alertsLow.find((a) => a.callsign === "N456CD");
    expect(lowAlert).toBeDefined();
    expect(lowAlert?.severity).toBe("alert");
  });
});
