import { describe, expect, test } from "vitest";
import {
  SIM_DT_S,
  SessionLog,
  acceptInboundHandoff,
  acceptTowerHandoff,
  handoffFor,
  isRadioCommandAllowed,
  isTowerHandoffEligible,
  stepWorld,
  type World,
} from "@core";
import {
  createWorldForSession,
  createWorldFromScenario,
  loadCatalog,
  loadKdem,
  loadKdem09,
} from "@scenario";
import { handleRadioText } from "@pilot";

function stepUntil(world: World, predicate: () => boolean, maxSimMs: number = 300_000): boolean {
  const startSimMs = world.simTimeMs;
  while (world.simTimeMs - startSimMs < maxSimMs) {
    if (predicate()) {
      return true;
    }
    stepWorld(world, SIM_DT_S);
  }
  return predicate();
}

describe("dual-runway configuration", () => {
  loadCatalog("kdem");

  test("West Flow loads RWY 27 and N/S STAR transitions", () => {
    const scenario = loadKdem();
    expect(scenario.activeRunwayId).toBe("27");
    const world = createWorldFromScenario(scenario, 42);
    expect(world.aircraft.length).toBeGreaterThanOrEqual(1);
    for (const ac of world.aircraft) {
      if (ac.intent.lateral?.type === "PROCEDURE") {
        expect(ac.intent.lateral.routeFixIds).toContain("MERGE");
        expect(ac.intent.lateral.routeFixIds).not.toContain("WEMER");
      }
    }
  });

  test("West Flow arrival intercepts ILS27, captures GS, and lands", async () => {
    const scenario = loadKdem();
    const world = createWorldForSession(scenario, null, 1);
    const log = world.sessionLog ?? new SessionLog();
    world.sessionLog = log;
    const dal = world.aircraft[0];
    expect(handoffFor(world, dal.id).kind).toBe("inbound");
    expect(acceptInboundHandoff(world, dal.id)).toBe(true);
    expect(isRadioCommandAllowed(handoffFor(world, dal.id))).toBe(true);
    expect(stepUntil(world, () => dal.altitudeFt <= 4100 && dal.xNm <= 12, 300_000)).toBe(true);
    const radioRes = await handleRadioText(world, `${dal.callsign} H240 D20 APP ILS27`, log);
    expect(radioRes.accepted).toBe(true);
    expect(stepUntil(world, () => dal.intent.lateral?.type === "LOC", 120_000)).toBe(true);
    expect(stepUntil(world, () => dal.intent.vertical?.type === "GS", 180_000)).toBe(true);
    stepUntil(world, () => dal.xNm <= 4.5 && dal.altitudeFt <= 1600, 120_000);
    expect(isTowerHandoffEligible(dal, world)).toBe(true);
    expect(acceptTowerHandoff(dal, { log, simTimeMs: world.simTimeMs })).toBe(true);
    const callsign = dal.callsign;
    expect(
      stepUntil(
        world,
        () => log.byType("nav.landed").some((e) => e.callsign === callsign),
        180_000,
      ),
    ).toBe(true);
  });

  test("East Flow loads RWY 09 and WN/WS STAR transitions", () => {
    const scenario = loadKdem09();
    expect(scenario.activeRunwayId).toBe("09");
    const world = createWorldFromScenario(scenario, 42);
    expect(world.aircraft.length).toBeGreaterThanOrEqual(1);
    for (const ac of world.aircraft) {
      if (ac.intent.lateral?.type === "PROCEDURE") {
        expect(ac.intent.lateral.routeFixIds).toContain("WEMER");
        expect(ac.intent.lateral.routeFixIds).not.toContain("MERGE");
      }
    }
  });
});
