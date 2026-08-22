import { expect, test } from "vitest";
import { SessionLog, SIM_DT_S, createAircraft, createWorld, stepWorld } from "@core";
import type { Instruction } from "@core";
import { handleRadioText } from "./handleRadioText";
import { parseCommand } from "@parse";
import fixesJson from "../scenario/data/kdem/fixes.json";
import ilsJson from "../scenario/data/kdem/ils.json";
import ndbsJson from "../scenario/data/kdem/ndbs.json";
import vorsJson from "../scenario/data/kdem/vors.json";

const ILS27_APPROACH = {
  id: "ILS27",
  courseDeg: 270,
  lengthNm: 18,
  beamHalfWidthDeg: 2.5,
  thresholdFixId: "RW27",
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

function northOfLoc(args: { headingDeg: number; altitudeFt: number }) {
  return createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 12,
    yNm: 4,
    headingDeg: args.headingDeg,
    altitudeFt: args.altitudeFt,
    speedKt: 220,
  });
}

function worldWithDal(ac: ReturnType<typeof createAircraft>) {
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [ac],
    catalog: kdemCatalog(),
    sessionLog: log,
  });
  return { dal: ac, world, log };
}

function stepUntil(
  world: ReturnType<typeof createWorld>,
  pred: () => boolean,
  capSimMs: number,
): boolean {
  while (world.simTimeMs < capSimMs && !pred()) {
    stepWorld(world, SIM_DT_S);
  }
  return pred();
}

test("AC1 — EXP ILS27 is scratchpad only; no loc capture", async () => {
  const { dal, world, log } = worldWithDal(northOfLoc({ headingDeg: 240, altitudeFt: 4000 }));
  const beforeLateral = dal.intent.lateral;
  const result = await handleRadioText(world, "DAL123 EXP ILS27", log);
  expect(result.accepted).toBe(true);
  expect(dal.intent.expectedApproachId).toBe("ILS27");
  expect(dal.intent.lateral).toBe(beforeLateral);
  expect(dal.intent.clearedApproachId).toBeNull();
  expect(result.readback.toLowerCase()).toContain("expect");
  expect(result.readback.toLowerCase()).toContain("i l s");
  expect(result.readback.toLowerCase()).toContain("runway two seven");
  stepUntil(world, () => false, 30_000);
  expect(log.byType("nav.loc.captured")).toHaveLength(0);
  expect(dal.intent.lateral).toBe(beforeLateral);
});

test("AC2 — APP ILS27 arms INTERCEPT_LOC from heading 240", async () => {
  const { dal, world } = worldWithDal(northOfLoc({ headingDeg: 240, altitudeFt: 4000 }));
  const result = await handleRadioText(world, "DAL123 APP ILS27", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.lateral).toEqual({ type: "INTERCEPT_LOC", approachId: "ILS27" });
  expect(dal.intent.assignedHeadingDeg).toBe(240);
  for (let i = 0; i < Math.round(20 / SIM_DT_S); i += 1) {
    stepWorld(world, SIM_DT_S);
  }
  expect(dal.intent.lateral?.type).toBe("INTERCEPT_LOC");
  expect(dal.headingDeg).toBeCloseTo(240, 0);
});

test("AC2b — Path A ILS vector sets untilEstablished, holds 2000, no GS", async () => {
  const spoken =
    "turn right heading two four zero maintain two thousand until established cleared ils approach runway two seven";
  const parsed = await parseCommand(spoken, {
    source: "voice",
    selectedCallsign: "DAL123",
    pathC: false,
  });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    return;
  }
  const expected: Instruction[] = [
    { type: "FLY_HEADING", headingDeg: 240, turn: "RIGHT" },
    { type: "ALTITUDE", altitudeFt: 2000, verb: "MAINTAIN", untilEstablished: true },
    { type: "CLEARED_APPROACH", approachId: "ILS27" },
  ];
  expect(parsed.instructions).toEqual(expected);

  const typed = await parseCommand("DAL123 R240 A20 APP ILS27", { source: "text", pathC: false });
  expect(typed.ok).toBe(true);
  if (typed.ok) {
    expect(typed.instructions).toEqual(expected);
  }

  const { dal, world, log } = worldWithDal(northOfLoc({ headingDeg: 90, altitudeFt: 2000 }));
  const result = await handleRadioText(world, `Delta one two three ${spoken}`, log);
  expect(result.accepted).toBe(true);
  expect(result.readback.toLowerCase()).toContain("until established");
  expect(result.readback.toLowerCase()).toContain("cleared i l s");
  expect(result.readback.toLowerCase()).toContain("turn right heading two four zero");
  expect(dal.intent.assignedHeadingDeg).toBe(240);
  expect(dal.intent.assignedAltitudeFt).toBe(2000);
  expect(dal.intent.lateral?.type).toBe("INTERCEPT_LOC");

  const captured = () => log.byType("nav.loc.captured").length > 0;
  while (world.simTimeMs < 8 * 60 * 1000 && !captured()) {
    expect(dal.altitudeFt).toBeCloseTo(2000, 0);
    expect(dal.intent.vertical?.type === "GS").toBeFalsy();
    stepWorld(world, SIM_DT_S);
  }
  expect(captured()).toBe(true);
  expect(dal.altitudeFt).toBeCloseTo(2000, 0);
});

test("AC3 — from (12, 4) / 240, loc capture within 8 sim minutes", async () => {
  const { dal, world, log } = worldWithDal(northOfLoc({ headingDeg: 240, altitudeFt: 4000 }));
  world.sessionLog = log;
  const result = await handleRadioText(world, "DAL123 APP ILS27", log);
  expect(result.accepted).toBe(true);

  const found = stepUntil(world, () => log.byType("nav.loc.captured").length > 0, 8 * 60 * 1000);
  expect(found).toBe(true);
  expect(log.byType("nav.loc.captured")).toHaveLength(1);
  expect(log.byType("nav.loc.captured")[0]?.approachId).toBe("ILS27");
  expect(dal.intent.lateral).toEqual({ type: "LOC", approachId: "ILS27" });

  for (let i = 0; i < Math.round(20 / SIM_DT_S); i += 1) {
    stepWorld(world, SIM_DT_S);
  }
  expect(Math.abs(dal.yNm)).toBeLessThan(0.3);
  expect(Math.abs(((dal.headingDeg - 270 + 540) % 360) - 180)).toBeLessThan(10);
  expect(dal.altitudeFt).toBeCloseTo(4000, 0);
  expect(log.byType("nav.loc.captured")).toHaveLength(1);
});

test("AC4 — H090 after APP cancels loc; no recapture without APP", async () => {
  const { dal, world, log } = worldWithDal(northOfLoc({ headingDeg: 240, altitudeFt: 4000 }));
  await handleRadioText(world, "DAL123 APP ILS27", log);
  expect(dal.intent.lateral?.type).toBe("INTERCEPT_LOC");

  const cancel = await handleRadioText(world, "DAL123 H090", new SessionLog());
  expect(cancel.accepted).toBe(true);
  expect(dal.intent.lateral).toEqual({ type: "HEADING", headingDeg: 90 });
  expect(dal.intent.assignedHeadingDeg).toBe(90);
  expect(dal.intent.clearedApproachId).toBeNull();

  const capturedBefore = log.byType("nav.loc.captured").length;
  stepUntil(world, () => false, 3 * 60 * 1000);
  expect(dal.intent.lateral).toEqual({ type: "HEADING", headingDeg: 90 });
  expect(log.byType("nav.loc.captured")).toHaveLength(capturedBefore);
});

test("AC4 — H090 after LOC still requires a new APP", async () => {
  const { dal, world, log } = worldWithDal(northOfLoc({ headingDeg: 240, altitudeFt: 4000 }));
  await handleRadioText(world, "DAL123 APP ILS27", log);
  const captured = stepUntil(world, () => dal.intent.lateral?.type === "LOC", 8 * 60 * 1000);
  expect(captured).toBe(true);

  await handleRadioText(world, "DAL123 H090", new SessionLog());
  expect(dal.intent.lateral).toEqual({ type: "HEADING", headingDeg: 90 });
  expect(dal.intent.clearedApproachId).toBeNull();
  const n = log.byType("nav.loc.captured").length;
  stepUntil(world, () => false, 60_000);
  expect(dal.intent.lateral?.type).toBe("HEADING");
  expect(log.byType("nav.loc.captured")).toHaveLength(n);
});

test("AC5 — APP ILS99 is rejected; no intercept", async () => {
  const { dal, world, log } = worldWithDal(northOfLoc({ headingDeg: 240, altitudeFt: 4000 }));
  const before = { ...dal.intent };
  const result = await handleRadioText(world, "DAL123 APP ILS99", log);
  expect(result.accepted).toBe(false);
  expect(result.reason).toBe("UNKNOWN_APPROACH");
  expect(dal.intent).toEqual(before);
  expect(dal.intent.lateral).toBeUndefined();
  expect(log.byType("command.rejected")).toHaveLength(1);
  expect(log.byType("nav.loc.captured")).toHaveLength(0);
});

test("APP while already on the loc axis captures immediately", async () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 6,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 2000,
    speedKt: 220,
  });
  const { world, log } = worldWithDal(dal);
  await handleRadioText(world, "DAL123 APP ILS27", log);
  expect(dal.intent.lateral?.type).toBe("INTERCEPT_LOC");
  stepWorld(world, SIM_DT_S);
  expect(log.byType("nav.loc.captured")).toHaveLength(1);
  expect(dal.intent.lateral?.type).toBe("LOC");
});

test("AC2c — INTERCEPT_LOC at ~8 NM does not fire nav.gs.captured in 20 s", async () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 8,
    yNm: 3,
    headingDeg: 90,
    altitudeFt: 2000,
    speedKt: 220,
  });
  const { world, log } = worldWithDal(dal);
  await handleRadioText(world, "DAL123 APP ILS27", log);
  expect(dal.intent.lateral?.type).toBe("INTERCEPT_LOC");
  stepUntil(world, () => false, 20_000);
  expect(log.byType("nav.gs.captured")).toHaveLength(0);
  expect(dal.intent.vertical?.type === "GS").toBeFalsy();
});

test("AC4 — H360 after GS capture clears GS; no 3° descent from GS", async () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 8,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 2000,
    speedKt: 220,
  });
  const { world, log } = worldWithDal(dal);
  await handleRadioText(world, "DAL123 APP ILS27", log);
  const found = stepUntil(world, () => log.byType("nav.gs.captured").length > 0, 3 * 60 * 1000);
  expect(found).toBe(true);
  expect(dal.intent.vertical?.type).toBe("GS");
  const altAtCapture = dal.altitudeFt;

  const cancel = await handleRadioText(world, "DAL123 H360", new SessionLog());
  expect(cancel.accepted).toBe(true);
  expect(dal.intent.lateral).toEqual({ type: "HEADING", headingDeg: 0 });
  expect(dal.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(dal.intent.clearedApproachId).toBeNull();

  stepUntil(world, () => false, 20_000);
  expect(dal.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(dal.altitudeFt).toBeGreaterThan(altAtCapture - 80);
  expect(dal.altitudeFt).toBeCloseTo(2000, 0);
  expect(log.byType("nav.gs.captured")).toHaveLength(1);
});

test("H270 after GS capture still cancels FMS including GS", async () => {
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 8,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 2000,
    speedKt: 220,
  });
  const { world, log } = worldWithDal(dal);
  await handleRadioText(world, "DAL123 APP ILS27", log);
  expect(stepUntil(world, () => log.byType("nav.gs.captured").length > 0, 3 * 60 * 1000)).toBe(
    true,
  );
  const cancel = await handleRadioText(world, "DAL123 H270", new SessionLog());
  expect(cancel.accepted).toBe(true);
  expect(dal.intent.lateral).toEqual({ type: "HEADING", headingDeg: 270 });
  expect(dal.intent.vertical).toEqual({ type: "ASSIGNED" });
  stepUntil(world, () => false, 20_000);
  expect(dal.intent.vertical?.type === "GS").toBeFalsy();
  expect(dal.altitudeFt).toBeCloseTo(2000, 0);
});
