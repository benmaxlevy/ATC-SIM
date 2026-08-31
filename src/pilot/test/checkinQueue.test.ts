import { createWorld, type Aircraft, type World } from "@core";
import { expect, test } from "vitest";
import { createAircraft } from "@core";
import { CheckInQueue, formatCheckIn, isStarViaArrival } from "../checkinQueue";

const GOLDEN =
  "Approach, Delta 123, descending via DEMO ONE arrival through one-one thousand (11000)";

function viaArrival(): Aircraft {
  const ac = createAircraft({
    id: "ac-dal123",
    callsign: "DAL123",
    xNm: 18.5,
    yNm: 13.5,
    headingDeg: 225,
    altitudeFt: 11000,
    speedKt: 250,
  });
  ac.intent.lateral = {
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
  };
  ac.intent.vertical = { type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" };
  return ac;
}

test("formatCheckIn golden string for DAL123 / DEMO ONE / 11000", () => {
  expect(formatCheckIn({ callsign: "DAL123", starName: "DEMO ONE", altitudeFt: 11000 })).toBe(
    GOLDEN,
  );
});

test("PROCEDURE+VIA_STAR is a STAR via arrival", () => {
  expect(isStarViaArrival(viaArrival())).toBe(true);
});

test("queue is constructible and can schedule from a world", () => {
  const catalog: NonNullable<World["catalog"]> = {
    airportId: "KDEM",
    navaids: [],
    fixes: [],
    stars: [{ id: "DEM1", name: "DEMO ONE" }],
    approaches: [],
    sids: [],
  };
  const world = createWorld({ aircraft: [viaArrival()], catalog });
  const q = new CheckInQueue();
  q.scheduleFromWorld(world);
  expect(q.scheduled().length).toBeGreaterThanOrEqual(1);
});
