import { describe, expect, it } from "vitest";
import { SessionLog, createAircraft, createWorld, type RadioRequest } from "@core";
import { handleRadioText } from "../../src/pilot/handleRadioText";

function makeWorld(status: RadioRequest["status"] = "PENDING") {
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
    },
  };
  return {
    aircraft,
    request,
    world: createWorld({ aircraft: [aircraft], radioRequests: [request], simTimeMs: 1000 }),
  };
}

describe("VFR Class B pilot-request runtime", () => {
  it("reports, stands by, and clears the pending request without leaving VFR", async () => {
    const { aircraft, request, world } = makeWorld();
    const log = new SessionLog();

    const details = await handleRadioText(world, "N12345 say request", log);
    expect(details.accepted).toBe(true);
    expect(details.readback).toContain("request VFR arrival into Bravo to KATL");
    expect(request.status).toBe("PENDING");

    const standby = await handleRadioText(world, "N12345 stand by", log);
    expect(standby.accepted).toBe(true);
    expect(request.status).toBe("STANDBY");

    const approval = await handleRadioText(world, "N12345 cleared as requested", log);
    expect(approval.accepted).toBe(true);
    expect(request.status).toBe("CLEARED");
    expect(request.clearedClassBOperation).toBe("TO_ENTER");
    expect(aircraft.flightRules).toBe("VFR");
    expect(aircraft.classBClearance?.operation).toBe("TO_ENTER");
  });

  it("declines Class B access without mutating aircraft state", async () => {
    const { aircraft, request, world } = makeWorld();
    const before = structuredClone(aircraft.intent);
    const result = await handleRadioText(
      world,
      "N12345 unable class b clearance",
      new SessionLog(),
    );

    expect(result.accepted).toBe(true);
    expect(request.status).toBe("DECLINED");
    expect(aircraft.flightRules).toBe("VFR");
    expect(aircraft.intent).toEqual(before);
    expect(aircraft.classBClearance).toBeUndefined();
  });

  it("rejects approval when no pending Class B request exists", async () => {
    const { world } = makeWorld("CLEARED");
    const result = await handleRadioText(world, "N12345 cleared as requested", new SessionLog());

    expect(result.accepted).toBe(false);
    expect(result.detail).toBe("REQUEST: no pending Class B request");
  });
});
