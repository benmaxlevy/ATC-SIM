import { expect, test } from "vitest";
import { SessionLog, createAircraft, createWorld, type CatalogSid } from "@core";
import { handleRadioText } from "./handleRadioText";

const synSids: CatalogSid[] = [
  {
    id: "SYNDEP",
    name: "SYN DEP",
    runwayTransitions: [
      { runwayId: "27", legs: [{ fixId: "R27A" }, { fixId: "R27B" }] },
      { runwayId: "09", legs: [{ fixId: "R09A" }] },
    ],
    common: [{ fixId: "JOIN" }],
    enrouteTransitions: [
      { id: "NORMA", name: "NORMA", legs: [{ fixId: "N1" }, { fixId: "NORMA" }] },
      { id: "OCTTA", name: "OCTTA", legs: [{ fixId: "O1" }, { fixId: "OCTTA" }] },
    ],
  },
];

function worldOnSynDep() {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 10,
    yNm: 5,
    headingDeg: 90,
    altitudeFt: 3000,
    speedKt: 220,
  });
  dal.intent.assignedAltitudeFt = 10000;
  dal.intent.lateral = {
    type: "PROCEDURE",
    sidId: "SYNDEP",
    starId: "SYNDEP",
    toFixIndex: 0,
    routeFixIds: ["R27A", "R27B", "JOIN", "N1", "NORMA"],
  };
  dal.intent.vertical = { type: "VIA_SID", sidId: "SYNDEP" };
  const world = createWorld({
    aircraft: [dal],
    catalog: {
      airportId: "KSYN",
      navaids: [],
      fixes: [],
      stars: [],
      approaches: [],
      sids: synSids,
    },
  });
  return { dal, world };
}

test("CVIA SYNDEP OCTTA joins at JOIN, keeps Climb Via, and readbacks the transition", async () => {
  const { dal, world } = worldOnSynDep();
  const result = await handleRadioText(world, "DAL123 CVIA SYNDEP OCTTA", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.vertical).toEqual({ type: "VIA_SID", sidId: "SYNDEP" });
  expect(dal.intent.assignedAltitudeFt).toBe(10000);
  expect(dal.intent.lateral).toEqual({
    type: "PROCEDURE",
    sidId: "SYNDEP",
    starId: "SYNDEP",
    toFixIndex: 0,
    routeFixIds: ["R27A", "R27B", "JOIN", "O1", "OCTTA"],
  });
  expect(result.readback.toLowerCase()).toContain("climb via");
  expect(result.readback).toContain("OCTTA transition");
});

test("spoken NORMA transition matches typed CVIA SYNDEP NORMA", async () => {
  const { dal, world } = worldOnSynDep();
  dal.intent.lateral = {
    type: "PROCEDURE",
    sidId: "SYNDEP",
    starId: "SYNDEP",
    toFixIndex: 0,
    routeFixIds: ["R27A", "R27B", "JOIN", "O1", "OCTTA"],
  };
  const result = await handleRadioText(
    world,
    "Delta 123 climb via SYN DEP, NORMA transition",
    new SessionLog(),
  );
  expect(result.accepted).toBe(true);
  expect(result.command?.instructions).toEqual([
    { type: "CLIMB_VIA", procedureId: "SYNDEP", transitionId: "NORMA" },
  ]);
  expect(dal.intent.lateral).toEqual({
    type: "PROCEDURE",
    sidId: "SYNDEP",
    starId: "SYNDEP",
    toFixIndex: 0,
    routeFixIds: ["R27A", "R27B", "JOIN", "N1", "NORMA"],
  });
});

test("unknown SID transition and past-branch reject with no intent mutation", async () => {
  const { dal, world } = worldOnSynDep();
  const before = structuredClone(dal.intent);
  const unknown = await handleRadioText(world, "DAL123 CVIA SYNDEP ZZ", new SessionLog());
  expect(unknown.accepted).toBe(false);
  expect(unknown.reason).toBe("UNKNOWN_TRANSITION");
  expect(dal.intent).toEqual(before);

  dal.intent.lateral = {
    type: "PROCEDURE",
    sidId: "SYNDEP",
    starId: "SYNDEP",
    toFixIndex: 0,
    routeFixIds: ["NORMA"],
  };
  const past = structuredClone(dal.intent);
  const rejected = await handleRadioText(world, "DAL123 CVIA SYNDEP OCTTA", new SessionLog());
  expect(rejected.accepted).toBe(false);
  expect(rejected.reason).toBe("NOT_ON_COURSE");
  expect(dal.intent).toEqual(past);
});

test("runway-transition amend only while on runway legs; heading still cancels VIA_SID", async () => {
  const onRunway = worldOnSynDep();
  const allowed = await handleRadioText(
    onRunway.world,
    "DAL123 CVIA SYNDEP RW09",
    new SessionLog(),
  );
  expect(allowed.accepted).toBe(true);
  expect(onRunway.dal.intent.lateral).toEqual({
    type: "PROCEDURE",
    sidId: "SYNDEP",
    starId: "SYNDEP",
    toFixIndex: 0,
    routeFixIds: ["JOIN", "N1", "NORMA"],
  });

  const pastRunway = worldOnSynDep();
  pastRunway.dal.intent.lateral = {
    type: "PROCEDURE",
    sidId: "SYNDEP",
    starId: "SYNDEP",
    toFixIndex: 2,
    routeFixIds: ["R27A", "R27B", "JOIN", "N1", "NORMA"],
  };
  const before = structuredClone(pastRunway.dal.intent);
  const denied = await handleRadioText(
    pastRunway.world,
    "DAL123 CVIA SYNDEP RW09",
    new SessionLog(),
  );
  expect(denied.accepted).toBe(false);
  expect(denied.reason).toBe("NOT_ON_COURSE");
  expect(pastRunway.dal.intent).toEqual(before);

  const heading = await handleRadioText(onRunway.world, "DAL123 H270", new SessionLog());
  expect(heading.accepted).toBe(true);
  expect(onRunway.dal.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(onRunway.dal.intent.lateral).toEqual({ type: "HEADING", headingDeg: 270 });
  expect(onRunway.dal.intent.assignedAltitudeFt).toBe(10000);
});

test("pilot SID transition tests are DOM-free", () => {
  expect(typeof document).toBe("undefined");
  expect(typeof window).toBe("undefined");
});
