import { describe, expect, it } from "vitest";
import {
  findLatestRadioRequest,
  findOpenRadioRequest,
  getOperationalService,
  isOpenRadioRequest,
  isTerminalRadioRequest,
  transitionRequestToApproved,
  transitionRequestToAwaitingDetails,
  transitionRequestToCleared,
  transitionRequestToDeclined,
  transitionRequestToIdentified,
  transitionRequestToIdentifying,
  transitionRequestToStandby,
  transitionRequestToTerminated,
  type RadioRequest,
} from "../index";
import { createAircraft, createWorld } from "../../index";

describe("RadioRequest lifecycle and state transitions (T04-73)", () => {
  function makeSampleRequest(overrides?: Partial<RadioRequest>): RadioRequest {
    return {
      id: "req-1",
      aircraftId: "ac-1",
      callsign: "N12345",
      kind: "FLIGHT_FOLLOWING",
      requestedAtSimMs: 1000,
      status: "PENDING",
      details: {
        aircraftType: "C172",
        altitudeFt: 4500,
        headingDeg: 270,
        positionNm: { xNm: 10, yNm: 5 },
      },
      ...overrides,
    };
  }

  it("identifies open vs terminal requests correctly", () => {
    const pending = makeSampleRequest({ status: "PENDING" });
    expect(isOpenRadioRequest(pending)).toBe(true);
    expect(isTerminalRadioRequest(pending)).toBe(false);

    const approved = makeSampleRequest({ status: "APPROVED" });
    expect(isOpenRadioRequest(approved)).toBe(true);
    expect(isTerminalRadioRequest(approved)).toBe(false);

    const cleared = makeSampleRequest({ kind: "CLASS_B_ACCESS", status: "CLEARED" });
    expect(isOpenRadioRequest(cleared)).toBe(false);
    expect(isTerminalRadioRequest(cleared)).toBe(true);

    const declined = makeSampleRequest({ status: "DECLINED" });
    expect(isOpenRadioRequest(declined)).toBe(false);
    expect(isTerminalRadioRequest(declined)).toBe(true);

    const terminated = makeSampleRequest({ status: "TERMINATED" });
    expect(isOpenRadioRequest(terminated)).toBe(false);
    expect(isTerminalRadioRequest(terminated)).toBe(true);

    const withdrawn = makeSampleRequest({ status: "WITHDRAWN" });
    expect(isOpenRadioRequest(withdrawn)).toBe(false);
    expect(isTerminalRadioRequest(withdrawn)).toBe(true);
  });

  it("transitions PENDING -> AWAITING_DETAILS and STANDBY", () => {
    const req = makeSampleRequest();
    const awaitRes = transitionRequestToAwaitingDetails(req, 2000);
    expect(awaitRes.ok).toBe(true);
    expect(req.status).toBe("AWAITING_DETAILS");
    expect(req.awaitingDetailsAtSimMs).toBe(2000);

    const standbyRes = transitionRequestToStandby(req, 3000);
    expect(standbyRes.ok).toBe(true);
    expect(req.status).toBe("STANDBY");
    expect(req.standbyAtSimMs).toBe(3000);
  });

  it("transitions through IDENTIFYING -> IDENTIFIED -> APPROVED", () => {
    const req = makeSampleRequest();
    transitionRequestToIdentifying(req, 2000);
    expect(req.status).toBe("IDENTIFYING");

    // Approve before identification must fail
    const prematureApprove = transitionRequestToApproved(req, 2500);
    expect(prematureApprove.ok).toBe(false);
    if (!prematureApprove.ok) {
      expect(prematureApprove.error).toBe("REQUEST: radar identification required");
    }

    const identRes = transitionRequestToIdentified(
      req,
      {
        distanceNm: 5,
        referenceId: "DEM",
        referenceKind: "NAVAID",
        reportedAtSimMs: 3000,
      },
      3000,
    );
    expect(identRes.ok).toBe(true);
    expect(req.status).toBe("IDENTIFIED");
    expect(req.identifiedAtSimMs).toBe(3000);
    expect(req.radarContact?.referenceId).toBe("DEM");

    const approveRes = transitionRequestToApproved(req, 4000);
    expect(approveRes.ok).toBe(true);
    expect(req.status).toBe("APPROVED");
    expect(req.approvedAtSimMs).toBe(4000);
  });

  it("rejects standby or details after approval or resolution", () => {
    const req = makeSampleRequest({ status: "APPROVED" });
    const standbyRes = transitionRequestToStandby(req, 5000);
    expect(standbyRes.ok).toBe(false);
    if (!standbyRes.ok) {
      expect(standbyRes.error).toBe("REQUEST: request is already resolved");
    }

    const detailsRes = transitionRequestToAwaitingDetails(req, 5000);
    expect(detailsRes.ok).toBe(false);
    if (!detailsRes.ok) {
      expect(detailsRes.error).toBe("REQUEST: request is already resolved");
    }
  });

  it("rejects decline after approval with active service message", () => {
    const req = makeSampleRequest({ status: "APPROVED" });
    const declineRes = transitionRequestToDeclined(req, 5000);
    expect(declineRes.ok).toBe(false);
    if (!declineRes.ok) {
      expect(declineRes.error).toBe("REQUEST: active service must be terminated");
    }
  });

  it("resolves only Class B requests to terminal CLEARED", () => {
    const req = makeSampleRequest({
      kind: "CLASS_B_ACCESS",
      details: { classBOperation: "TO_ENTER" },
    });
    const result = transitionRequestToCleared(req, "TO_ENTER", 5000);

    expect(result.ok).toBe(true);
    expect(req.status).toBe("CLEARED");
    expect(req.clearedAtSimMs).toBe(5000);
    expect(req.clearedClassBOperation).toBe("TO_ENTER");
    expect(findOpenRadioRequest([req], req.aircraftId, "CLASS_B_ACCESS")).toBeUndefined();
  });

  it("does not let non-Class-B requests enter the CLEARED state", () => {
    const req = makeSampleRequest();
    const result = transitionRequestToCleared(req, "THROUGH", 5000);

    expect(result).toEqual({ ok: false, error: "REQUEST: Class B access request required" });
    expect(req.status).toBe("PENDING");
  });

  it("transitions to TERMINATED", () => {
    const req = makeSampleRequest({ status: "APPROVED" });
    const termRes = transitionRequestToTerminated(req, 6000);
    expect(termRes.ok).toBe(true);
    expect(req.status).toBe("TERMINATED");
    expect(req.terminatedAtSimMs).toBe(6000);
  });

  it("getOperationalService extracts effective service state without mutating aircraft", () => {
    const ac = createAircraft({
      id: "ac-1",
      callsign: "N12345",
      xNm: 10,
      yNm: 5,
      altitudeFt: 4500,
      headingDeg: 270,
      speedKt: 110,
      flightRules: "VFR",
    });
    const req = makeSampleRequest({ status: "APPROVED" });
    ac.flightFollowing = { active: true, approvedAtSimMs: 4000, requestId: req.id };
    ac.radarContact = {
      reportedAtSimMs: 3000,
      distanceNm: 5,
      referenceId: "DEM",
      referenceKind: "NAVAID",
    };

    const world = createWorld({ aircraft: [ac], radioRequests: [req] });
    expect(findOpenRadioRequest(world.radioRequests, ac.id)?.id).toBe(req.id);
    expect(findLatestRadioRequest(world.radioRequests, ac.id)?.id).toBe(req.id);
    const service = getOperationalService(world, ac);

    expect(service.flightFollowingActive).toBe(true);
    expect(service.radarIdentified).toBe(true);
    expect(service.radarContact?.referenceId).toBe("DEM");
    expect(service.activeRequest?.id).toBe("req-1");
    // Ensure aircraft properties remain untouched
    expect(ac.flightRules).toBe("VFR");
    expect(ac.activeClearance).toBeUndefined();
  });
});
