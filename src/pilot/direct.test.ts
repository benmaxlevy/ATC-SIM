import { expect, test } from "vitest";
import {
  SessionLog,
  SIM_DT_S,
  buildFixRegistry,
  createAircraft,
  createWorld,
  stepWorld,
} from "@core";
import type { FixRegistrySource } from "@core";
import { formatReadback } from "./readback";
import { handleRadioText } from "./handleRadioText";
import fixesJson from "../scenario/data/kdem/fixes.json";
import ilsJson from "../scenario/data/kdem/ils.json";
import ndbsJson from "../scenario/data/kdem/ndbs.json";
import vorsJson from "../scenario/data/kdem/vors.json";

function kdemSource(): FixRegistrySource {
  return {
    navaids: [...vorsJson.vors, ...ndbsJson.ndbs, ...ilsJson.components],
    fixes: fixesJson.fixes,
  };
}

function dalEastOfNemax() {
  return createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 27,
    yNm: 12,
    headingDeg: 270,
    altitudeFt: 10000,
    speedKt: 220,
  });
}

function worldWithDal() {
  const dal = dalEastOfNemax();
  const world = createWorld({
    aircraft: [dal],
    fixRegistry: buildFixRegistry(kdemSource()),
  });
  return { dal, world };
}

test("AC1 — DCT NEMAX is accepted as DIRECT within 1 sim second", async () => {
  const { dal, world } = worldWithDal();
  const result = await handleRadioText(world, "DAL123 DCT NEMAX", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.lateral).toEqual({ type: "DIRECT", fixId: "NEMAX" });
  expect(result.readback).toBe(
    formatReadback({
      callsign: "DAL123",
      instructions: [{ type: "DIRECT", fixId: "NEMAX" }],
      aircraft: dal,
    }),
  );
  expect(result.readback.toLowerCase()).toContain("direct");
  expect(world.simTimeMs).toBe(0);
});

test("AC3 — DCT NOPE is rejected with no lateral change", async () => {
  const { dal, world } = worldWithDal();
  const before = { ...dal.intent };
  const log = new SessionLog();
  const result = await handleRadioText(world, "DAL123 DCT NOPE", log);
  expect(result.accepted).toBe(false);
  expect(result.reason).toBe("UNKNOWN_FIX");
  expect(dal.intent).toEqual(before);
  expect(dal.intent.lateral).toBeUndefined();
  expect(result.readback.toLowerCase()).toContain("unknown fix");
  expect(log.byType("command.rejected")).toHaveLength(1);
  expect(log.byType("command.accepted")).toHaveLength(0);
});

test("AC4 — H090 after DIRECT is HEADING 090 and cancels the fix", async () => {
  const { dal, world } = worldWithDal();
  await handleRadioText(world, "DAL123 DCT NEMAX", new SessionLog());
  expect(dal.intent.lateral?.type).toBe("DIRECT");
  const result = await handleRadioText(world, "DAL123 H090", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.lateral).toEqual({ type: "HEADING", headingDeg: 90 });
  expect(dal.intent.assignedHeadingDeg).toBe(90);
});

test("AC2 parse+pilot+stepWorld — DCT NEMAX tracks the fix", async () => {
  const { dal, world } = worldWithDal();
  const log = new SessionLog();
  world.sessionLog = log;
  const nemax = world.fixRegistry!.require("NEMAX");
  const result = await handleRadioText(world, "DAL123 DCT NEMAX", log);
  expect(result.accepted).toBe(true);
  const start = Math.hypot(dal.xNm - nemax.xNm, dal.yNm - nemax.yNm);
  for (let i = 0; i < Math.round(20 / SIM_DT_S); i += 1) {
    stepWorld(world, SIM_DT_S);
  }
  const later = Math.hypot(dal.xNm - nemax.xNm, dal.yNm - nemax.yNm);
  expect(later).toBeLessThan(start - 0.5);
});

test("DCT DEM is a known navaid; D30 is still descend", async () => {
  const { dal, world } = worldWithDal();
  const direct = await handleRadioText(world, "DAL123 DCT DEM", new SessionLog());
  expect(direct.accepted).toBe(true);
  expect(dal.intent.lateral).toEqual({ type: "DIRECT", fixId: "DEM" });
  dal.altitudeFt = 8000;
  const descend = await handleRadioText(world, "DAL123 D30", new SessionLog());
  expect(descend.accepted).toBe(true);
  expect(dal.intent.assignedAltitudeFt).toBe(3000);
  expect(dal.intent.lateral).toEqual({ type: "DIRECT", fixId: "DEM" });
});
