import { expect, test } from "vitest";
import { SessionLog, createAircraft, createWorld } from "./index";
import {
  DEFAULT_INBOUND_SECTOR_ID,
  HANDOFF_PENDING_REASON,
  acceptInboundHandoff,
  acceptOutboundHandoff,
  acceptPointout,
  assertHandoffOwned,
  convertPointoutToHandoff,
  handoffFor,
  initiateCenterHandoff,
  initiatePointout,
  isCenterHandoffEligible,
  isRadioCommandAllowed,
  offerDepartureHandoff,
  offerInboundHandoff,
  offerPointout,
  rejectPointout,
} from "./handoff";

test("isRadioCommandAllowed denies inbound pending and allows none", () => {
  expect(isRadioCommandAllowed({ kind: "none" })).toBe(true);
  expect(isRadioCommandAllowed({ kind: "inbound", fromSectorId: "C" })).toBe(false);
  expect(assertHandoffOwned({ kind: "inbound", fromSectorId: "C" })).toEqual({
    ok: false,
    reason: HANDOFF_PENDING_REASON,
  });
  expect(assertHandoffOwned({ kind: "none" })).toEqual({ ok: true });
});

test("missing map entry is none so authored worlds stay commandable", () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 10,
    yNm: 5,
    headingDeg: 100,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const world = createWorld({ aircraft: [dal] });
  expect(handoffFor(world, dal.id)).toEqual({ kind: "none" });
  expect(isRadioCommandAllowed(handoffFor(world, dal.id))).toBe(true);
});

test("offer then accept logs one offered and one accepted; radio gate flips", () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 17,
    yNm: 12,
    headingDeg: 250,
    altitudeFt: 11000,
    speedKt: 250,
  });
  const log = new SessionLog();
  const world = createWorld({ aircraft: [dal], sessionLog: log, simTimeMs: 0 });
  offerInboundHandoff(world, dal);
  expect(handoffFor(world, dal.id)).toEqual({
    kind: "inbound",
    fromSectorId: DEFAULT_INBOUND_SECTOR_ID,
  });
  expect(isRadioCommandAllowed(handoffFor(world, dal.id))).toBe(false);
  const offered = log.byType("handoff.inbound.offered");
  expect(offered).toHaveLength(1);
  expect(offered[0]).toMatchObject({
    callsign: "DAL123",
    fromSectorId: "C",
    atSimMs: 0,
  });

  expect(acceptInboundHandoff(world, dal.id, 12)).toBe(true);
  expect(handoffFor(world, dal.id)).toEqual({ kind: "none" });
  expect(isRadioCommandAllowed(handoffFor(world, dal.id))).toBe(true);
  const accepted = log.byType("handoff.inbound.accepted");
  expect(accepted).toHaveLength(1);
  expect(accepted[0]).toMatchObject({
    callsign: "DAL123",
    fromSectorId: "C",
    atWallMs: 12,
  });
  expect(acceptInboundHandoff(world, dal.id)).toBe(false);
  expect(log.byType("handoff.inbound.accepted")).toHaveLength(1);
});

test("offerDepartureHandoff records departure state from TWR and allows radio commands", () => {
  const ac = createAircraft({
    id: "ac-dep",
    callsign: "SWA555",
    xNm: -0.8,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 700,
    speedKt: 180,
  });
  const log = new SessionLog();
  const world = createWorld({ aircraft: [ac], sessionLog: log, simTimeMs: 5000 });

  offerDepartureHandoff(world, ac, "TWR", { runwayId: "27", sidId: "DEM1" });
  expect(handoffFor(world, ac.id)).toEqual({
    kind: "departure",
    fromSectorId: "TWR",
  });
  expect(isRadioCommandAllowed(handoffFor(world, ac.id))).toBe(true);

  const spawned = log.byType("handoff.departure.spawned");
  expect(spawned).toHaveLength(1);
  expect(spawned[0]).toMatchObject({
    callsign: "SWA555",
    fromSectorId: "TWR",
    runwayId: "27",
    sidId: "DEM1",
    atSimMs: 5000,
  });
});

test("isCenterHandoffEligible is true for climbing departures and false for arrivals on approach", () => {
  const dep = createAircraft({
    id: "ac-dep",
    callsign: "AAL222",
    xNm: 10,
    yNm: 5,
    headingDeg: 90,
    altitudeFt: 5200,
    speedKt: 250,
  });
  dep.intent.vertical = { type: "VIA_SID", sidId: "DEM1" };
  dep.intent.lateral = {
    type: "PROCEDURE",
    sidId: "DEM1",
    toFixIndex: 0,
    routeFixIds: ["MISSD", "SNARF"],
  };

  const arr = createAircraft({
    id: "ac-arr",
    callsign: "DAL123",
    xNm: 4,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 1300,
    speedKt: 160,
  });
  arr.intent.lateral = { type: "LOC", approachId: "ILS27" };
  arr.intent.vertical = { type: "GS", approachId: "ILS27" };
  arr.intent.clearedApproachId = "ILS27";

  const world = createWorld({
    aircraft: [dep, arr],
    catalog: {
      airportId: "KDEM",
      navaids: [],
      fixes: [{ id: "RW27", xNm: 0, yNm: 0, kind: "THRESHOLD" }],
      stars: [],
      approaches: [
        {
          id: "ILS27",
          courseDeg: 270,
          lengthNm: 18,
          beamHalfWidthDeg: 2.5,
          thresholdFixId: "RW27",
          daFt: 200,
        },
      ],
      sids: [{ id: "DEM1", legs: [] }],
    },
  });

  expect(isCenterHandoffEligible(dep, world)).toBe(true);
  expect(isCenterHandoffEligible(arr, world)).toBe(false);
});

test("initiateCenterHandoff logs handoff.center and handoff.outbound.initiated and sets outbound state", () => {
  const ac = createAircraft({
    id: "ac-dep",
    callsign: "UAL888",
    xNm: 15,
    yNm: 10,
    headingDeg: 45,
    altitudeFt: 8000,
    speedKt: 250,
  });
  const log = new SessionLog();
  const world = createWorld({ aircraft: [ac], sessionLog: log, simTimeMs: 12000 });

  expect(initiateCenterHandoff(ac, { world, log, simTimeMs: 12000 }, "C")).toBe(true);
  expect(handoffFor(world, ac.id)).toEqual({
    kind: "outbound",
    toSectorId: "C",
  });

  const centerEvents = log.byType("handoff.center");
  expect(centerEvents).toHaveLength(1);
  expect(centerEvents[0]).toMatchObject({
    callsign: "UAL888",
    toSectorId: "C",
    atSimMs: 12000,
  });

  const initEvents = log.byType("handoff.outbound.initiated");
  expect(initEvents).toHaveLength(1);
  expect(initEvents[0]).toMatchObject({
    callsign: "UAL888",
    toSectorId: "C",
    atSimMs: 12000,
  });

  // Once outbound, isCenterHandoffEligible becomes false
  expect(isCenterHandoffEligible(ac, world)).toBe(false);
});

test("T02-37 AC2 — acceptOutboundHandoff transitions outbound state to accepted and logs handoff.outbound.accepted", () => {
  const ac = createAircraft({
    id: "ac-dep",
    callsign: "UAL888",
    xNm: 15,
    yNm: 10,
    headingDeg: 45,
    altitudeFt: 8000,
    speedKt: 250,
  });
  const log = new SessionLog();
  const world = createWorld({ aircraft: [ac], sessionLog: log, simTimeMs: 15000 });
  initiateCenterHandoff(ac, { world, log, simTimeMs: 15000 }, "C");

  expect(acceptOutboundHandoff(world, ac.id, 25)).toBe(true);
  expect(handoffFor(world, ac.id)).toMatchObject({
    kind: "outbound",
    toSectorId: "C",
    status: "accepted",
    acceptedAtSimMs: 15000,
  });

  const acceptedEvents = log.byType("handoff.outbound.accepted");
  expect(acceptedEvents).toHaveLength(1);
  expect(acceptedEvents[0]).toMatchObject({
    callsign: "UAL888",
    toSectorId: "C",
    atSimMs: 15000,
    atWallMs: 25,
  });
});

test("T02-37 AC3 / AC4 — pointout lifecycle: offer, accept, reject, and convert to handoff", () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 10,
    yNm: 5,
    headingDeg: 270,
    altitudeFt: 8000,
    speedKt: 210,
  });
  const log = new SessionLog();
  const world = createWorld({ aircraft: [dal], sessionLog: log, simTimeMs: 2000 });

  // 1. Offer incoming pointout
  offerPointout(world, dal, "C");
  expect(handoffFor(world, dal.id)).toEqual({
    kind: "pointout_inbound",
    fromSectorId: "C",
    status: "pending",
  });
  expect(isRadioCommandAllowed(handoffFor(world, dal.id))).toBe(false);
  expect(log.byType("pointout.offered")).toHaveLength(1);

  // 2. Accept pointout
  expect(acceptPointout(world, dal.id, 50)).toBe(true);
  expect(handoffFor(world, dal.id)).toMatchObject({
    kind: "pointout_inbound",
    fromSectorId: "C",
    status: "accepted",
  });
  expect(log.byType("pointout.accepted")).toHaveLength(1);

  // 3. Reject pointout
  offerPointout(world, dal, "C");
  expect(rejectPointout(world, dal.id, 60)).toBe(true);
  expect(handoffFor(world, dal.id)).toMatchObject({
    kind: "pointout_inbound",
    fromSectorId: "C",
    status: "rejected",
    rejectedAtSimMs: 2000,
  });
  expect(log.byType("pointout.rejected")).toHaveLength(1);

  // 4. Convert pointout to handoff (**)
  offerPointout(world, dal, "C");
  expect(convertPointoutToHandoff(world, dal.id, 70)).toBe(true);
  expect(handoffFor(world, dal.id)).toEqual({ kind: "none" });
  expect(isRadioCommandAllowed(handoffFor(world, dal.id))).toBe(true);
  expect(log.byType("pointout.converted")).toHaveLength(1);
  expect(log.byType("handoff.inbound.accepted")).toHaveLength(1);

  // 5. Initiate outgoing pointout
  initiatePointout(world, dal, "C");
  expect(handoffFor(world, dal.id)).toEqual({
    kind: "pointout_outbound",
    toSectorId: "C",
    status: "pending",
  });
});
