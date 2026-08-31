import { expect, test } from "vitest";
import { SessionLog, createAircraft, createWorld, type CatalogStar } from "@core";
import { handleRadioText } from "../handleRadioText";

const synStars: CatalogStar[] = [
  {
    id: "SYN1",
    name: "SYN ONE",
    common: [{ fixId: "MERGE" }],
    transitions: [
      { id: "N", name: "NORTH", legs: [{ fixId: "NA" }, { fixId: "NB" }] },
      { id: "S", name: "SOUTH", legs: [{ fixId: "SA" }, { fixId: "SB" }] },
      { id: "RW09", name: "RUNWAY NINE", runwayId: "09", legs: [{ fixId: "RA" }] },
    ],
  },
];

function worldOnSynNorth(activeRunwayId?: string) {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 10,
    yNm: 5,
    headingDeg: 270,
    altitudeFt: 11000,
    speedKt: 250,
  });
  dal.intent.lateral = {
    type: "PROCEDURE",
    starId: "SYN1",
    toFixIndex: 0,
    routeFixIds: ["NA", "NB", "MERGE"],
  };
  dal.intent.vertical = { type: "VIA_STAR", starId: "SYN1", sense: "DESCEND" };
  const world = createWorld({
    aircraft: [dal],
    activeRunwayId,
    catalog: {
      airportId: "KSYN",
      navaids: [],
      fixes: [],
      stars: synStars,
      approaches: [],
      sids: [],
    },
  });
  return { dal, world };
}

test("VIA SYN1 S joins at MERGE, keeps Descend Via, and readbacks the transition", async () => {
  const { dal, world } = worldOnSynNorth();
  const result = await handleRadioText(world, "DAL123 VIA SYN1 S", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.vertical).toEqual({ type: "VIA_STAR", starId: "SYN1", sense: "DESCEND" });
  expect(dal.intent.lateral).toEqual({
    type: "PROCEDURE",
    starId: "SYN1",
    toFixIndex: 0,
    routeFixIds: ["MERGE"],
  });
  expect(result.readback.toLowerCase()).toContain("descend via");
  expect(result.readback).toContain("S transition");
});

test("spoken north transition matches typed VIA SYN1 N", async () => {
  const { dal, world } = worldOnSynNorth();
  dal.intent.lateral = {
    type: "PROCEDURE",
    starId: "SYN1",
    toFixIndex: 0,
    routeFixIds: ["SA", "SB", "MERGE"],
  };
  const result = await handleRadioText(
    world,
    "Delta 123 descend via SYN ONE, north transition",
    new SessionLog(),
  );
  expect(result.accepted).toBe(true);
  expect(result.command?.instructions).toEqual([
    { type: "DESCEND_VIA", procedureId: "SYN1", transitionId: "N" },
  ]);
  expect(dal.intent.lateral).toEqual({
    type: "PROCEDURE",
    starId: "SYN1",
    toFixIndex: 0,
    routeFixIds: ["MERGE"],
  });
});

test("unknown transition and past-branch reject with no intent mutation", async () => {
  const { dal, world } = worldOnSynNorth();
  const before = structuredClone(dal.intent);
  const unknown = await handleRadioText(world, "DAL123 VIA SYN1 ZZ", new SessionLog());
  expect(unknown.accepted).toBe(false);
  expect(unknown.reason).toBe("UNKNOWN_TRANSITION");
  expect(dal.intent).toEqual(before);

  dal.intent.lateral = {
    type: "PROCEDURE",
    starId: "SYN1",
    toFixIndex: 0,
    routeFixIds: ["NA"],
  };
  const past = structuredClone(dal.intent);
  const rejected = await handleRadioText(world, "DAL123 VIA SYN1 S", new SessionLog());
  expect(rejected.accepted).toBe(false);
  expect(rejected.reason).toBe("NOT_ON_COURSE");
  expect(dal.intent).toEqual(past);
});

test("runway-tagged transition follows the active runway; heading still cancels VIA", async () => {
  const match = worldOnSynNorth("09");
  const allowed = await handleRadioText(match.world, "DAL123 VIA SYN1 RW09", new SessionLog());
  expect(allowed.accepted).toBe(true);
  expect(match.dal.intent.lateral).toEqual({
    type: "PROCEDURE",
    starId: "SYN1",
    toFixIndex: 0,
    routeFixIds: ["MERGE"],
  });

  const blocked = worldOnSynNorth("27");
  const before = structuredClone(blocked.dal.intent);
  const denied = await handleRadioText(blocked.world, "DAL123 VIA SYN1 RW09", new SessionLog());
  expect(denied.accepted).toBe(false);
  expect(denied.reason).toBe("UNKNOWN_TRANSITION");
  expect(blocked.dal.intent).toEqual(before);

  const heading = await handleRadioText(match.world, "DAL123 H090", new SessionLog());
  expect(heading.accepted).toBe(true);
  expect(match.dal.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(match.dal.intent.lateral).toEqual({ type: "HEADING", headingDeg: 90 });
});

test("pilot STAR transition tests are DOM-free", () => {
  expect(typeof document).toBe("undefined");
  expect(typeof window).toBe("undefined");
});
