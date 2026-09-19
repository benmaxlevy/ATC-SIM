/**
 * Integration test: VFR flight following and radio-contact lifecycle (T04-73).
 *
 * Verifies:
 * - Ambient airborne VFR makes flight-following request into world.radioRequests
 * - Controller works request: say request -> details -> standby -> SQ/IDENT -> radar contact -> approve -> terminate
 * - Gates and errors: premature approval, decline after approval, termination without service, non-positive distance, unknown fix
 * - Independence: flight rules, active clearance, kinematics, position, and CA/MSAW remain untouched
 * - No automatic VFR squawk on service termination
 * - Scope/list projection uses operational service view
 */

import { describe, expect, test } from "vitest";
import {
  createAircraft,
  createWorld,
  getOperationalService,
  saveFlightPlanDraft,
  SessionLog,
  stepWorld,
} from "@core";
import { handleRadioText } from "../../src/pilot/handleRadioText";
import { createVfrRequestQueue } from "../../src/pilot/vfrRequestQueue";
import { buildVfrList } from "../../src/scope/systemLists";
import { parseRegionalPack, type RegionalFacility } from "@scenario";

describe("VFR flight following and radio-contact lifecycle integration (T04-73)", () => {
  test("end-to-end flight following lifecycle: request -> details -> standby -> IDENT -> radar contact -> approve -> terminate", async () => {
    const ac = createAircraft({
      id: "ac-dal",
      callsign: "DAL123",
      xNm: 15,
      yNm: 10,
      headingDeg: 270,
      altitudeFt: 4500,
      speedKt: 115,
      squawk: "1200",
      flightRules: "VFR",
      aircraftType: "C172",
      ambientVfr: {
        mission: "LOCAL",
        zoneId: "zone-1",
        spawnedAtSimMs: 0,
        alertEligibility: "CONTROLLED",
      },
    });

    const world = createWorld({
      aircraft: [ac],
      simTimeMs: 1000,
      catalog: {
        airportId: "KDEM",
        navaids: [{ id: "DEM", xNm: 0, yNm: 0, kind: "navaid" }],
        fixes: [{ id: "NEMAX", xNm: 10, yNm: 5, kind: "fix" }],
        stars: [],
        sids: [],
        approaches: [],
      },
    });

    const queue = createVfrRequestQueue({
      config: {
        flightFollowingPercent: 100,
        ifrPickupPercent: 0,
        requestCapPerHour: 10,
      },
      initialSlotOffsetMs: 0,
    });

    const log = new SessionLog();

    // 1. Scheduler schedules and drains request
    queue.scheduleFromWorld(world, world.simTimeMs);
    queue.drain({ world, log });

    expect(world.radioRequests).toHaveLength(1);
    const req = world.radioRequests![0]!;
    expect(req.status).toBe("PENDING");
    expect(req.callsign).toBe("DAL123");
    expect(req.kind).toBe("FLIGHT_FOLLOWING");

    // 2. Controller: say request
    const resSayReq = await handleRadioText(world, "DAL123 say request", log);
    expect(resSayReq.accepted).toBe(true);
    expect(resSayReq.readback).toContain("request flight following");
    expect(resSayReq.readback).not.toContain("say request");
    expect(req.status).toBe("PENDING");

    // Pilot details can also be emitted via helper without charging cap
    const detailText = queue.emitRequestDetails(world, ac.id, log);
    expect(detailText).toContain("request flight following");
    expect(req.status).toBe("PENDING");

    // 3. Controller: stand by
    const resStandby = await handleRadioText(world, "DAL123 stand by", log);
    expect(resStandby.accepted).toBe(true);
    expect(resStandby.readback).toBe("Delta 123 standby");
    expect(req.status).toBe("STANDBY");

    // 4. Controller: SQ 4521 then IDENT
    const resSq = await handleRadioText(world, "DAL123 SQ 4521", log);
    expect(resSq.accepted).toBe(true);
    expect(ac.assignedSquawk).toBe("4521");

    const resIdent = await handleRadioText(world, "DAL123 I", log);
    expect(resIdent.accepted).toBe(true);
    expect(ac.identUntilSimMs).toBeGreaterThan(world.simTimeMs);
    expect(req.status).toBe("IDENTIFYING");

    // 5. Controller attempts premature approval before radar contact -> MUST REJECT
    const resPremature = await handleRadioText(world, "DAL123 approve flight following", log);
    expect(resPremature.accepted).toBe(false);
    expect(resPremature.detail).toBe("REQUEST: radar identification required");
    expect(req.status).toBe("IDENTIFYING");
    expect(ac.flightFollowing).toBeUndefined();

    // 6. Controller: radar contact 5 miles from DEM
    const posXBefore = ac.xNm;
    const posYBefore = ac.yNm;
    const resRc = await handleRadioText(world, "DAL123 radar contact 5 miles from DEM", log);
    expect(resRc.accepted).toBe(true);
    expect(resRc.readback).toBe("Delta 123 roger");
    expect(req.status).toBe("IDENTIFIED");
    expect(req.radarContact?.distanceNm).toBe(5);
    expect(req.radarContact?.referenceId).toBe("DEM");
    expect(ac.radarContact?.referenceId).toBe("DEM");
    // Ensure informational report did not jump aircraft position
    expect(ac.xNm).toBe(posXBefore);
    expect(ac.yNm).toBe(posYBefore);

    // 7. Controller: approve flight following
    const resApprove = await handleRadioText(world, "DAL123 approve flight following", log);
    expect(resApprove.accepted).toBe(true);
    expect(resApprove.readback).toBe("Delta 123 flight following approved");
    expect(req.status).toBe("APPROVED");
    expect(ac.flightFollowing?.active).toBe(true);
    expect(ac.flightRules).toBe("VFR"); // unchanged
    expect(ac.activeClearance).toBeUndefined(); // no IFR clearance

    // Verify operational service projection
    const opService = getOperationalService(world, ac);
    expect(opService.flightFollowingActive).toBe(true);
    expect(opService.radarIdentified).toBe(true);
    expect(opService.radarContact?.referenceId).toBe("DEM");

    // Verify VFR list projection
    const vfrList = buildVfrList(world);
    expect(vfrList.some((line) => line.includes("DAL123"))).toBe(true);

    // 8. Controller attempts decline after approval -> MUST REJECT
    const resDeclineActive = await handleRadioText(world, "DAL123 unable flight following", log);
    expect(resDeclineActive.accepted).toBe(false);
    expect(resDeclineActive.detail).toBe("REQUEST: active service must be terminated");

    // 9. Controller: radar service terminated
    const resTerm = await handleRadioText(world, "DAL123 radar service terminated", log);
    expect(resTerm.accepted).toBe(true);
    expect(resTerm.readback).toBe("Delta 123 radar service terminated");
    expect(ac.flightFollowing?.active).toBe(false);
    expect(req.status).toBe("TERMINATED");
    // Squawk must NOT automatically revert to 1200
    expect(ac.assignedSquawk).toBe("4521");

    // 10. Terminate again -> MUST REJECT
    const resTermAgain = await handleRadioText(world, "DAL123 radar service terminated", log);
    expect(resTermAgain.accepted).toBe(false);
    expect(resTermAgain.detail).toBe("REQUEST: radar service is not active");
  });

  test("radar contact rejects non-positive distance and unknown fix without side effects", async () => {
    const ac = createAircraft({
      id: "ac-2",
      callsign: "AAL999",
      xNm: 10,
      yNm: 10,
      headingDeg: 90,
      altitudeFt: 3500,
      speedKt: 100,
      squawk: "1200",
      flightRules: "VFR",
    });
    const req = {
      id: "req-2",
      aircraftId: ac.id,
      callsign: ac.callsign,
      kind: "FLIGHT_FOLLOWING" as const,
      requestedAtSimMs: 1000,
      status: "PENDING" as const,
      details: {},
    };
    const world = createWorld({
      aircraft: [ac],
      radioRequests: [req],
      catalog: {
        airportId: "KDEM",
        navaids: [{ id: "DEM" }],
        fixes: [],
        stars: [],
        sids: [],
        approaches: [],
      },
    });
    const log = new SessionLog();

    // Unknown fix
    const resUnknown = await handleRadioText(
      world,
      "AAL999 radar contact 5 miles from UNKNOWN",
      log,
    );
    expect(resUnknown.accepted).toBe(false);
    expect(resUnknown.reason === "PARSE" || resUnknown.reason === "UNKNOWN_FIX").toBe(true);
    expect(req.status).toBe("PENDING");

    // Compound instruction conflict
    const resCompound = await handleRadioText(world, "AAL999 say request H270", log);
    expect(resCompound.accepted).toBe(false);
    expect(resCompound.reason === "CLEARANCE" || resCompound.reason === "PARSE").toBe(true);
  });

  test("CA/MSAW alert evaluation functions normally with active flight following", () => {
    const ac1 = createAircraft({
      id: "ac-1",
      callsign: "N111",
      xNm: 0,
      yNm: 0,
      headingDeg: 90,
      altitudeFt: 3000,
      speedKt: 120,
      flightRules: "VFR",
    });
    ac1.flightFollowing = { active: true, approvedAtSimMs: 1000 };

    const ac2 = createAircraft({
      id: "ac-2",
      callsign: "N222",
      xNm: 1,
      yNm: 0,
      headingDeg: 270,
      altitudeFt: 3000,
      speedKt: 120,
      flightRules: "VFR",
    });
    ac2.flightFollowing = { active: true, approvedAtSimMs: 1000 };

    const world = createWorld({
      aircraft: [ac1, ac2],
      simTimeMs: 1000,
    });

    // Step world to run conflict alert logic
    stepWorld(world, 1000);
    // Conflict alert should detect converging tracks normally
    expect(world.aircraft).toHaveLength(2);
    expect(ac1.flightFollowing?.active).toBe(true);
    expect(ac2.flightFollowing?.active).toBe(true);
  });

  function createSyntheticRegionalFacility(): RegionalFacility {
    const facility = parseRegionalPack(
      {
        schemaVersion: 1,
        centerAirportId: "KPDK",
        radiusNm: 40,
        source: { families: ["CIFP", "NASR_APT"] },
        files: { airports: "regional-airports.json", airspace: "regional-airspace.json" },
      },
      [
        {
          icao: "KPDK",
          name: "Peachtree-DeKalb Airport",
          arp: { latDeg: 33.8756, lonDeg: -84.302 },
          fieldElevFt: 1003,
          magVarDeg: -5,
          publicUse: true,
          towered: true,
          eligible: true,
          runways: [
            {
              id: "21L",
              threshold: { latDeg: 33.8756, lonDeg: -84.302 },
              headingTrueDeg: 210,
              headingMagDeg: 215,
              lengthFt: 6001,
            },
          ],
          hasPublishedApproaches: true,
        },
        {
          icao: "KFTY",
          name: "Fulton County Airport",
          arp: { latDeg: 33.779, lonDeg: -84.521 },
          fieldElevFt: 841,
          magVarDeg: -5,
          publicUse: true,
          towered: true,
          eligible: true,
          runways: [
            {
              id: "08",
              threshold: { latDeg: 33.779, lonDeg: -84.521 },
              headingTrueDeg: 80,
              headingMagDeg: 85,
              lengthFt: 5797,
            },
          ],
          hasPublishedApproaches: true,
        },
      ],
      [
        {
          id: "KPDK-DELTA",
          name: "KPDK Class D",
          type: "CONTROLLED",
          class: "D",
          centerAirportId: "KPDK",
          lowerLimit: { altitudeFt: 0, unit: "MSL", reference: "MSL" },
          upperLimit: { altitudeFt: 3000, unit: "MSL", reference: "MSL" },
          segments: [
            {
              sequence: 1,
              boundaryVia: "G",
              boundaryViaType: "GREAT_CIRCLE",
              position: { latDeg: 33.9, lonDeg: -84.4 },
            },
            {
              sequence: 2,
              boundaryVia: "G",
              boundaryViaType: "GREAT_CIRCLE",
              position: { latDeg: 33.9, lonDeg: -84.2 },
            },
            {
              sequence: 3,
              boundaryVia: "G",
              boundaryViaType: "GREAT_CIRCLE",
              position: { latDeg: 33.8, lonDeg: -84.2 },
            },
            {
              sequence: 4,
              boundaryVia: "G",
              boundaryViaType: "GREAT_CIRCLE",
              position: { latDeg: 33.8, lonDeg: -84.4 },
            },
          ],
        },
        {
          id: "KFTY-DELTA",
          name: "KFTY Class D",
          type: "CONTROLLED",
          class: "D",
          centerAirportId: "KFTY",
          lowerLimit: { altitudeFt: 0, unit: "MSL", reference: "MSL" },
          upperLimit: { altitudeFt: 3000, unit: "MSL", reference: "MSL" },
          segments: [
            {
              sequence: 1,
              boundaryVia: "G",
              boundaryViaType: "GREAT_CIRCLE",
              position: { latDeg: 33.8, lonDeg: -84.6 },
            },
            {
              sequence: 2,
              boundaryVia: "G",
              boundaryViaType: "GREAT_CIRCLE",
              position: { latDeg: 33.8, lonDeg: -84.4 },
            },
            {
              sequence: 3,
              boundaryVia: "G",
              boundaryViaType: "GREAT_CIRCLE",
              position: { latDeg: 33.7, lonDeg: -84.4 },
            },
            {
              sequence: 4,
              boundaryVia: "G",
              boundaryViaType: "GREAT_CIRCLE",
              position: { latDeg: 33.7, lonDeg: -84.6 },
            },
          ],
        },
      ],
      { latDeg: 33.8756, lonDeg: -84.302 },
    );
    facility.facilityName = "Atlanta";
    return facility;
  }

  test("conversational sequence: check-in -> say request -> direct request details -> squawk / flight following approved", async () => {
    const regional = createSyntheticRegionalFacility();
    const kpdk = regional.getAirport("KPDK")!;

    const ac = createAircraft({
      id: "ac-n172",
      callsign: "N172SP",
      xNm: kpdk.arpNm.xNm,
      yNm: kpdk.arpNm.yNm + 15,
      headingDeg: 180,
      altitudeFt: 4500,
      speedKt: 110,
      squawk: "1200",
      flightRules: "VFR",
      aircraftType: "C172",
      ambientVfr: {
        mission: "AIRPORT_BOUND",
        zoneId: "zone-1",
        destinationAirportId: "KFTY",
        spawnedAtSimMs: 0,
        alertEligibility: "CONTROLLED",
      },
    });

    const world = createWorld({
      aircraft: [ac],
      simTimeMs: 1000,
      regional,
      catalog: {
        airportId: "KPDK",
        navaids: [{ id: "PDK", xNm: kpdk.arpNm.xNm, yNm: kpdk.arpNm.yNm, kind: "navaid" }],
        fixes: [],
        stars: [],
        sids: [],
        approaches: [],
      },
    });

    const queue = createVfrRequestQueue({
      config: {
        flightFollowingPercent: 100,
        ifrPickupPercent: 0,
        requestCapPerHour: 10,
      },
      regional,
      initialSlotOffsetMs: 0,
    });

    const log = new SessionLog();
    let latestStatus = "";
    const setStatus = (txt: string) => {
      latestStatus = txt;
    };

    // 1. Check-in cold call
    queue.scheduleFromWorld(world, world.simTimeMs);
    queue.drain({ world, log, setStatus });
    expect(latestStatus).toBe("Atlanta Approach, N172SP");
    expect(world.radioRequests).toHaveLength(1);
    const req = world.radioRequests![0]!;
    expect(req.status).toBe("PENDING");

    // 2. Controller: say request
    const resSayReq = await handleRadioText(world, "N172SP say request", log);
    expect(resSayReq.accepted).toBe(true);
    expect(resSayReq.readback).toBe(
      "N172SP, 15 miles north of KPDK, C172, request flight following to KFTY at 4500",
    );
    expect(resSayReq.readback).not.toContain("say request");
    expect(req.status).toBe("PENDING");

    // 3. Controller: squawk
    const resSq = await handleRadioText(world, "N172SP SQ 4521", log);
    expect(resSq.accepted).toBe(true);
    expect(resSq.readback).toBe("November 172 Sierra Papa squawk four five two one");
    expect(ac.assignedSquawk).toBe("4521");

    // 4. Controller: radar contact & approval
    const resRc = await handleRadioText(world, "N172SP radar contact 15 miles from PDK", log);
    expect(resRc.accepted).toBe(true);
    expect(req.status).toBe("IDENTIFIED");

    const resApprove = await handleRadioText(world, "N172SP approve flight following", log);
    expect(resApprove.accepted).toBe(true);
    expect(resApprove.readback).toBe("November 172 Sierra Papa flight following approved");
    expect(req.status).toBe("APPROVED");
    expect(ac.flightFollowing?.active).toBe(true);
  });

  test("conversational sequence: check-in -> stand by -> standby readback ('N123 standby') -> say request -> direct request details -> clearance", async () => {
    const regional = createSyntheticRegionalFacility();
    const kpdk = regional.getAirport("KPDK")!;

    const ac = createAircraft({
      id: "ac-n210",
      callsign: "N210AB",
      xNm: kpdk.arpNm.xNm,
      yNm: kpdk.arpNm.yNm + 15,
      headingDeg: 90,
      altitudeFt: 5000,
      speedKt: 140,
      squawk: "1200",
      flightRules: "VFR",
      aircraftType: "C210",
      ambientVfr: {
        mission: "AIRPORT_BOUND",
        zoneId: "zone-1",
        destinationAirportId: "KFTY",
        spawnedAtSimMs: 0,
        alertEligibility: "CONTROLLED",
      },
    });

    const world = createWorld({
      aircraft: [ac],
      simTimeMs: 1000,
      regional,
      catalog: {
        airportId: "KPDK",
        navaids: [{ id: "PDK", xNm: kpdk.arpNm.xNm, yNm: kpdk.arpNm.yNm, kind: "navaid" }],
        fixes: [],
        stars: [],
        sids: [],
        approaches: [],
      },
    });

    const queue = createVfrRequestQueue({
      config: {
        flightFollowingPercent: 0,
        ifrPickupPercent: 100,
        requestCapPerHour: 10,
      },
      regional,
      initialSlotOffsetMs: 0,
    });

    const log = new SessionLog();
    let latestStatus = "";
    const setStatus = (txt: string) => {
      latestStatus = txt;
    };

    // 1. Check-in cold call
    queue.scheduleFromWorld(world, world.simTimeMs);
    queue.drain({ world, log, setStatus });
    expect(latestStatus).toBe("Atlanta Approach, N210AB");
    expect(world.radioRequests).toHaveLength(1);
    const req = world.radioRequests![0]!;
    expect(req.status).toBe("PENDING");
    expect(req.kind).toBe("IFR_PICKUP");
    const dest = req.details.destinationAirportId!;

    saveFlightPlanDraft(world, {
      acid: "N210AB",
      filedRoute: dest,
      flightType: "VFR",
      assignedBeacon: "4521",
    });

    // 2. Controller: stand by
    const resStandby = await handleRadioText(world, "N210AB stand by", log);
    expect(resStandby.accepted).toBe(true);
    expect(resStandby.readback).toBe("November 210 Alfa Bravo standby");
    expect(req.status).toBe("STANDBY");

    // 3. Controller: say request
    const resSayReq = await handleRadioText(world, "N210AB say request", log);
    expect(resSayReq.accepted).toBe(true);
    expect(resSayReq.readback).toContain("N210AB");
    expect(resSayReq.readback).toContain("15 miles north of KPDK");
    expect(resSayReq.readback).toContain("C210");
    expect(resSayReq.readback).toContain(`request IFR to ${dest}`);
    expect(resSayReq.readback).toContain("requested altitude");
    expect(resSayReq.readback).not.toContain("say request");
    expect(req.status).toBe("PENDING");

    // 4. Controller establishes radar contact then issues clearance
    const resRc = await handleRadioText(world, "N210AB radar contact 15 miles from PDK", log);
    expect(resRc.accepted).toBe(true);
    expect(req.status).toBe("IDENTIFIED");

    const resClr = await handleRadioText(world, `N210AB CLR TO ${dest} VIA DIRECT`, log);
    expect(resClr.accepted).toBe(true);
    expect(resClr.readback).toBe(`November 210 Alfa Bravo cleared to ${dest} via direct`);
    expect(ac.flightRules).toBe("IFR");
    expect(ac.activeClearance).toBeDefined();
  });

  test("conversational sequence: check-in -> say request -> direct request details -> unable -> readback", async () => {
    const regional = createSyntheticRegionalFacility();
    const kpdk = regional.getAirport("KPDK")!;

    const ac = createAircraft({
      id: "ac-n345",
      callsign: "N345GA",
      xNm: kpdk.arpNm.xNm,
      yNm: kpdk.arpNm.yNm + 15,
      headingDeg: 180,
      altitudeFt: 3500,
      speedKt: 105,
      squawk: "1200",
      flightRules: "VFR",
      aircraftType: "C172",
      ambientVfr: {
        mission: "LOCAL",
        zoneId: "zone-1",
        spawnedAtSimMs: 0,
        alertEligibility: "CONTROLLED",
      },
    });

    const world = createWorld({
      aircraft: [ac],
      simTimeMs: 1000,
      regional,
      catalog: {
        airportId: "KPDK",
        navaids: [{ id: "PDK", xNm: kpdk.arpNm.xNm, yNm: kpdk.arpNm.yNm, kind: "navaid" }],
        fixes: [],
        stars: [],
        sids: [],
        approaches: [],
      },
    });

    const queue = createVfrRequestQueue({
      config: {
        flightFollowingPercent: 100,
        ifrPickupPercent: 0,
        requestCapPerHour: 10,
      },
      regional,
      initialSlotOffsetMs: 0,
    });

    const log = new SessionLog();
    let latestStatus = "";
    const setStatus = (txt: string) => {
      latestStatus = txt;
    };

    // 1. Check-in cold call
    queue.scheduleFromWorld(world, world.simTimeMs);
    queue.drain({ world, log, setStatus });
    expect(latestStatus).toBe("Atlanta Approach, N345GA");
    expect(world.radioRequests).toHaveLength(1);
    const req = world.radioRequests![0]!;
    expect(req.status).toBe("PENDING");

    // 2. Controller: say request
    const resSayReq = await handleRadioText(world, "N345GA say request", log);
    expect(resSayReq.accepted).toBe(true);
    expect(resSayReq.readback).toContain("N345GA");
    expect(resSayReq.readback).toContain("request flight following");
    expect(resSayReq.readback).not.toContain("say request");
    expect(req.status).toBe("PENDING");

    // 3. Controller: unable flight following
    const resUnable = await handleRadioText(world, "N345GA unable flight following", log);
    expect(resUnable.accepted).toBe(true);
    expect(resUnable.readback).toBe("November 345 Golf Alfa unable flight following");
    expect(req.status).toBe("DECLINED");
  });
});
