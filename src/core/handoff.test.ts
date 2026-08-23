import { expect, test } from "vitest";
import { SessionLog, createAircraft, createWorld } from "./index";
import {
  DEFAULT_INBOUND_SECTOR_ID,
  HANDOFF_PENDING_REASON,
  acceptInboundHandoff,
  assertHandoffOwned,
  handoffFor,
  isRadioCommandAllowed,
  offerInboundHandoff,
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
