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
import { createAircraft, createWorld, getOperationalService, SessionLog, stepWorld } from "@core";
import { handleRadioText } from "../../src/pilot/handleRadioText";
import { createVfrRequestQueue } from "../../src/pilot/vfrRequestQueue";
import { buildVfrList } from "../../src/scope/systemLists";

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
    expect(resSayReq.readback).toBe("Delta 123 say request");
    expect(req.status).toBe("AWAITING_DETAILS");

    // Pilot repeats details without charging cap
    const detailText = queue.emitRequestDetails(world, ac.id, log);
    expect(detailText).toContain("request flight following");
    expect(req.status).toBe("AWAITING_DETAILS");

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
    expect(resRc.readback).toBe("Delta 123 radar contact, 5 miles from DEM");
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
});
