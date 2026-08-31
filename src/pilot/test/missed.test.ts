import { expect, test } from "vitest";
import { SessionLog, SIM_DT_S, createAircraft, createWorld, stepWorld } from "@core";
import type { Aircraft, World } from "@core";
import { handleRadioText } from "../handleRadioText";
import fixesJson from "../../scenario/data/kdem/fixes.json";
import ilsJson from "../../scenario/data/kdem/ils.json";
import ndbsJson from "../../scenario/data/kdem/ndbs.json";
import vorsJson from "../../scenario/data/kdem/vors.json";

const ILS27_APPROACH = {
  id: "ILS27",
  courseDeg: 270,
  lengthNm: 18,
  beamHalfWidthDeg: 2.5,
  thresholdFixId: "RW27",
  daFt: 200,
  missed: { headingDeg: 270, climbToFt: 3000, directFixId: "MISSD" },
} as const;

function kdemCatalog() {
  return {
    airportId: "KDEM",
    navaids: [...vorsJson.vors, ...ndbsJson.ndbs, ...ilsJson.components],
    fixes: fixesJson.fixes,
    stars: [],
    approaches: [ILS27_APPROACH],
    sids: [],
  };
}

function onLoc(altitudeFt: number): Aircraft {
  return createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 6,
    yNm: 0,
    headingDeg: 270,
    altitudeFt,
    speedKt: 220,
  });
}

function worldOnLoc(ac: Aircraft): { dal: Aircraft; world: World; log: SessionLog } {
  ac.intent.lateral = { type: "LOC", approachId: "ILS27" };
  ac.intent.clearedApproachId = "ILS27";
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [ac],
    catalog: kdemCatalog(),
    sessionLog: log,
  });
  return { dal: ac, world, log };
}

test("AC5 — DAL123 GA on loc at 3000 starts missed without waiting for DA", async () => {
  const { dal, world, log } = worldOnLoc(onLoc(3000));
  const result = await handleRadioText(world, "DAL123 GA", log);
  expect(result.accepted).toBe(true);
  expect(result.readback).toBe("Delta 123 going around");
  expect(log.byType("nav.missed.started")).toHaveLength(1);
  expect(dal.intent.lateral).toEqual({ type: "MISSED", approachId: "ILS27" });
  expect(dal.intent.vertical).toEqual({ type: "MISSED_CLIMB", altitudeFt: 3000 });
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(dal.altitudeFt).toBe(3000);

  const n = Math.round(5 / SIM_DT_S);
  for (let i = 0; i < n; i += 1) {
    stepWorld(world, SIM_DT_S);
  }
  expect(log.byType("nav.missed.started")).toHaveLength(1);
  expect(dal.intent.lateral?.type).not.toBe("LOC");
  expect(dal.intent.vertical?.type).not.toBe("GS");
});

test("GA without cleared approach is rejected", async () => {
  const dal = onLoc(3000);
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [dal],
    catalog: kdemCatalog(),
    sessionLog: log,
  });
  const result = await handleRadioText(world, "DAL123 GA", log);
  expect(result.accepted).toBe(false);
  expect(result.reason).toBe("NOT_ON_APPROACH");
  expect(log.byType("nav.missed.started")).toHaveLength(0);
  expect(dal.intent.lateral).toBeUndefined();
});
