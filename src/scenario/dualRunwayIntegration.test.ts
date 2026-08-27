import { describe, expect, test } from "vitest";
import {
  SIM_DT_S,
  SessionLog,
  acceptInboundHandoff,
  acceptOutboundHandoff,
  acceptTowerHandoff,
  createWorld,
  distanceNm,
  handoffFor,
  initiateCenterHandoff,
  isCenterHandoffEligible,
  isRadioCommandAllowed,
  isTowerHandoffEligible,
  stepWorld,
  type World,
} from "@core";
import {
  createWorldForSession,
  createWorldFromScenario,
  defaultSessionSetup,
  listConfigurationsForAirport,
  listPlayableAirports,
  loadCatalog,
  loadKdem,
  loadKdem09,
  loadPlayableScenario,
  loadSessionSetup,
  resolveSessionSetup,
  saveSessionSetup,
  spawnDeparture,
  type SessionSetup,
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

function stepSeconds(world: World, seconds: number): void {
  const n = Math.round(seconds / SIM_DT_S);
  for (let i = 0; i < n; i += 1) {
    stepWorld(world, SIM_DT_S);
  }
}

describe("T04-30 Dual-Runway Configuration Integration and Acceptance", () => {
  const catalog = loadCatalog("kdem");

  describe("AC1: West Flow (RWY 27) Full Cycle", () => {
    test("West Flow scenario loads with activeRunwayId 27 and STAR transitions N / S", () => {
      const scenario = loadKdem();
      expect(scenario.activeRunwayId).toBe("27");
      expect(scenario.icao).toBe("KDEM");
      expect(scenario.runways[0]?.id).toBe("27");
      expect(scenario.approaches.some((a) => a.id === "ILS27")).toBe(true);

      const world = createWorldFromScenario(scenario, 42);
      expect(world.catalog?.airportId).toBe("KDEM");
      expect(world.aircraft.length).toBeGreaterThanOrEqual(1);

      // All initial arrivals are assigned West Flow transitions (N or S) feeding MERGE
      for (const ac of world.aircraft) {
        if (ac.intent.lateral?.type === "PROCEDURE") {
          expect(["N", "S"]).toContain(ac.intent.lateral.routeFixIds[0] === "NEMAX" ? "N" : "S");
          expect(ac.intent.lateral.routeFixIds).toContain("MERGE");
          expect(ac.intent.lateral.routeFixIds).not.toContain("WEMER");
        }
      }
    });

    test("West Flow arrival descends via DEM1 N constraints, accepts vectors, intercepts ILS27, captures GS, and lands", async () => {
      const scenario = loadKdem();
      const world = createWorldForSession(scenario, null, 1);
      const log = world.sessionLog ?? new SessionLog();
      world.sessionLog = log;

      // Find DAL123 (or first arrival)
      const dal = world.aircraft[0];
      expect(dal).toBeDefined();
      expect(dal.altitudeFt).toBeGreaterThanOrEqual(10000);
      expect(dal.speedKt).toBe(250);

      // Inbound handoff offered; accept it so radio commands are accepted
      expect(handoffFor(world, dal.id).kind).toBe("inbound");
      expect(acceptInboundHandoff(world, dal.id)).toBe(true);
      expect(isRadioCommandAllowed(handoffFor(world, dal.id))).toBe(true);

      // 1. Descend via STAR toward MERGE
      // Advance until aircraft reaches MERGE area and descends toward 4,000 ft
      const reachedMerge = stepUntil(world, () => dal.altitudeFt <= 4100 && dal.xNm <= 12, 300_000);
      expect(reachedMerge).toBe(true);
      expect(dal.altitudeFt).toBeLessThanOrEqual(4100);
      expect(dal.altitudeFt).toBeGreaterThanOrEqual(3900);
      expect(dal.speedKt).toBeLessThanOrEqual(210);

      // 2. Vector to intercept ILS 27: Heading 240, Descend 2,000 ft, Clear Approach ILS27
      const radioRes = await handleRadioText(world, `${dal.callsign} H240 D20 APP ILS27`, log);
      expect(radioRes.accepted).toBe(true);
      expect(dal.intent.lateral?.type).toBe("INTERCEPT_LOC");
      expect(dal.intent.clearedApproachId).toBe("ILS27");
      expect(dal.intent.assignedAltitudeFt).toBe(2000);

      // 3. Step until Localizer is captured (heading aligns with 270)
      const locCaptured = stepUntil(world, () => dal.intent.lateral?.type === "LOC", 120_000);
      expect(locCaptured).toBe(true);
      expect(log.byType("nav.loc.captured").some((e) => e.approachId === "ILS27")).toBe(true);

      // 4. Step until Glide Slope captures
      const gsCaptured = stepUntil(world, () => dal.intent.vertical?.type === "GS", 180_000);
      expect(gsCaptured).toBe(true);
      expect(log.byType("nav.gs.captured").some((e) => e.approachId === "ILS27")).toBe(true);

      // 5. Step inside 5 NM gate and accept Tower Handoff (cleared to land)
      stepUntil(world, () => dal.xNm <= 4.5 && dal.altitudeFt <= 1600, 120_000);
      expect(isTowerHandoffEligible(dal, world)).toBe(true);
      expect(acceptTowerHandoff(dal, { log, simTimeMs: world.simTimeMs })).toBe(true);
      expect(dal.intent.landingCleared).toBe(true);
      expect(dal.intent.lateral?.type).toBe("LANDING");

      // 6. Ride GS down to RW27 threshold (0, 0) and land
      const dalId = dal.id;
      const callsign = dal.callsign;
      const landed = stepUntil(
        world,
        () => log.byType("nav.landed").some((e) => e.callsign === callsign),
        180_000,
      );
      expect(landed).toBe(true);
      expect(world.aircraft.find((a) => a.id === dalId)).toBeUndefined();
      const landedEvent = log.byType("nav.landed").find((e) => e.callsign === callsign);
      expect(landedEvent?.approachId).toBe("ILS27");
    });

    test("West Flow arrival executes missed approach to MISSD when un-cleared at DA", () => {
      const scenario = loadKdem();
      const world = createWorldFromScenario(scenario);
      const log = world.sessionLog ?? new SessionLog();
      world.sessionLog = log;

      const dal = world.aircraft[0];
      // Position on final approach on ILS27 at 1 NM, altitude 350 ft, descending on GS without landing clearance
      dal.xNm = 1.0;
      dal.yNm = 0;
      dal.headingDeg = 270;
      dal.altitudeFt = 350;
      dal.speedKt = 140;
      dal.intent.lateral = { type: "LOC", approachId: "ILS27" };
      dal.intent.vertical = { type: "GS", approachId: "ILS27" };
      dal.intent.clearedApproachId = "ILS27";
      dal.intent.landingCleared = false;

      // 1. Descend through DA (200 ft) -> Missed approach triggers
      const missedStarted = stepUntil(
        world,
        () => log.byType("nav.missed.started").length > 0,
        30_000,
      );
      expect(missedStarted).toBe(true);
      expect(dal.intent.lateral?.type).toBe("MISSED");
      expect(dal.intent.assignedHeadingDeg).toBe(270);
      expect(dal.intent.vertical).toEqual({ type: "MISSED_CLIMB", altitudeFt: 3000 });

      // 2. Aircraft climbs on heading 270 up to 3,000 ft
      const climbedTo3000 = stepUntil(world, () => dal.altitudeFt >= 2950, 180_000);
      expect(climbedTo3000).toBe(true);

      // 3. At 3,000 ft, lateral transitions to DIRECT MISSD
      const directMissd = stepUntil(
        world,
        () => dal.intent.lateral?.type === "DIRECT" && dal.intent.lateral.fixId === "MISSD",
        30_000,
      );
      expect(directMissd).toBe(true);

      // 4. Aircraft flies toward MISSD (-8, 6)
      const missdFix = catalog.fixes.find((f) => f.id === "MISSD")!;
      const d0 = distanceNm(dal, missdFix);
      stepSeconds(world, 30);
      const d1 = distanceNm(dal, missdFix);
      expect(d1).toBeLessThan(d0);
    });

    test("West Flow departure spawns on RW27 (0, 0), rolls heading 270, climbs via BAY1 to BAYEE -> NORMA, and hands off to Center", () => {
      const log = new SessionLog();
      const world = createWorld({ catalog, sessionLog: log });

      // Spawn departure on RW27 via BAY1 to NORMA
      const dep = spawnDeparture(
        world,
        {
          callsign: "AAL100",
          runwayId: "27",
          sidId: "BAY1",
          transitionId: "NORMA",
          assignedAltitudeFt: 12000,
          aircraftType: "A321",
        },
        catalog,
      );

      // 1. Initial pose at RW27 threshold (-0.8 NM roll offset along 270)
      expect(dep.xNm).toBeCloseTo(-0.8, 2);
      expect(dep.yNm).toBeCloseTo(0, 2);
      expect(dep.headingDeg).toBe(270);
      expect(dep.altitudeFt).toBe(700);
      expect(dep.speedKt).toBe(180);
      expect(dep.intent.lateral).toEqual({
        type: "PROCEDURE",
        sidId: "BAY1",
        starId: "BAY1",
        toFixIndex: 0,
        routeFixIds: ["BAYEE", "BAYNW", "NORMA"],
      });
      expect(dep.intent.vertical).toEqual({ type: "VIA_SID", sidId: "BAY1" });

      // Departure handoff offered from TWR; radio commands allowed
      expect(handoffFor(world, dep.id)).toEqual({ kind: "departure", fromSectorId: "TWR" });
      expect(isRadioCommandAllowed(handoffFor(world, dep.id))).toBe(true);

      // 2. Climb via BAY1: sequences BAYEE (-4, 0)
      const sequencedBayee = stepUntil(
        world,
        () => log.byType("nav.direct.sequenced").some((e) => e.fixId === "BAYEE"),
        180_000,
      );
      expect(sequencedBayee).toBe(true);

      // 3. Sequences BAYNW (-8, 4.5) and turns toward NORMA (-16, 16)
      const sequencedBaynw = stepUntil(
        world,
        () => log.byType("nav.direct.sequenced").some((e) => e.fixId === "BAYNW"),
        180_000,
      );
      expect(sequencedBaynw).toBe(true);

      // 4. Initiates Center Handoff
      expect(isCenterHandoffEligible(dep, world)).toBe(true);
      expect(initiateCenterHandoff(dep, { world, log, simTimeMs: world.simTimeMs }, "C")).toBe(
        true,
      );
      expect(acceptOutboundHandoff(world, dep.id)).toBe(true);

      // 5. Flies past TRACON boundary (>= 28 NM) and completes handoff / departure despawn
      const depId = dep.id;
      const departed = stepUntil(
        world,
        () => log.byType("nav.departed").some((e) => e.callsign === "AAL100"),
        800_000,
      );
      expect(departed).toBe(true);
      expect(log.byType("handoff.outbound.completed").some((e) => e.callsign === "AAL100")).toBe(
        true,
      );
      expect(world.aircraft.find((a) => a.id === depId)).toBeUndefined();
    });

    test("West Flow departure climbs via BAY1 to BAYEE -> OCTTA transition", () => {
      const log = new SessionLog();
      const world = createWorld({ catalog, sessionLog: log });

      const dep = spawnDeparture(
        world,
        {
          callsign: "SWA200",
          runwayId: "27",
          sidId: "BAY1",
          transitionId: "OCTTA",
          assignedAltitudeFt: 10000,
          aircraftType: "B738",
        },
        catalog,
      );

      expect(dep.intent.lateral).toEqual({
        type: "PROCEDURE",
        sidId: "BAY1",
        starId: "BAY1",
        toFixIndex: 0,
        routeFixIds: ["BAYEE", "BAYSO", "OCTTA"],
      });

      // Sequences BAYEE then turns south toward BAYSO (-7, -6)
      stepUntil(
        world,
        () => log.byType("nav.direct.sequenced").some((e) => e.fixId === "BAYEE"),
        180_000,
      );
      const sequencedBayso = stepUntil(
        world,
        () => log.byType("nav.direct.sequenced").some((e) => e.fixId === "BAYSO"),
        180_000,
      );
      expect(sequencedBayso).toBe(true);
    });
  });

  describe("AC2: East Flow (RWY 09) Full Cycle", () => {
    test("East Flow scenario loads with activeRunwayId 09 and STAR transitions WN / WS", () => {
      const scenario = loadKdem09();
      expect(scenario.activeRunwayId).toBe("09");
      expect(scenario.icao).toBe("KDEM");
      expect(scenario.runways[0]?.id).toBe("09");
      expect(scenario.approaches.some((a) => a.id === "ILS09")).toBe(true);

      const world = createWorldFromScenario(scenario, 42);
      expect(world.catalog?.airportId).toBe("KDEM");
      expect(world.aircraft.length).toBeGreaterThanOrEqual(1);

      // All initial arrivals are assigned East Flow transitions (WN or WS) feeding WEMER
      for (const ac of world.aircraft) {
        if (ac.intent.lateral?.type === "PROCEDURE") {
          expect(["WN", "WS"]).toContain(
            ac.intent.lateral.routeFixIds[0] === "WEMAX" ? "WN" : "WS",
          );
          expect(ac.intent.lateral.routeFixIds).toContain("WEMER");
          expect(ac.intent.lateral.routeFixIds).not.toContain("MERGE");
        }
      }
    });

    test("East Flow arrival descends via DEM1 WN constraints, accepts vectors, intercepts ILS09, captures GS, and lands", async () => {
      const scenario = loadKdem09();
      const world = createWorldForSession(scenario, null, 1);
      const log = world.sessionLog ?? new SessionLog();
      world.sessionLog = log;

      const dal = world.aircraft[0];
      expect(dal).toBeDefined();
      expect(dal.altitudeFt).toBeGreaterThanOrEqual(10000);
      expect(dal.speedKt).toBe(250);

      // Accept inbound handoff
      expect(acceptInboundHandoff(world, dal.id)).toBe(true);

      // 1. Descend via STAR toward WEMER (-11.645, 0)
      const reachedWemer = stepUntil(
        world,
        () => dal.altitudeFt <= 4100 && dal.xNm >= -14,
        300_000,
      );
      expect(reachedWemer).toBe(true);
      expect(dal.altitudeFt).toBeLessThanOrEqual(4100);
      expect(dal.altitudeFt).toBeGreaterThanOrEqual(3900);
      expect(dal.speedKt).toBeLessThanOrEqual(210);

      // 2. Vector to intercept ILS 09: Heading 060, Descend 2,000 ft, Clear Approach ILS09
      const radioRes = await handleRadioText(world, `${dal.callsign} H060 D20 APP ILS09`, log);
      expect(radioRes.accepted).toBe(true);
      expect(dal.intent.lateral?.type).toBe("INTERCEPT_LOC");
      expect(dal.intent.clearedApproachId).toBe("ILS09");
      expect(dal.intent.assignedAltitudeFt).toBe(2000);

      // 3. Step until Localizer is captured (heading aligns with 090)
      const locCaptured = stepUntil(world, () => dal.intent.lateral?.type === "LOC", 120_000);
      expect(locCaptured).toBe(true);
      expect(log.byType("nav.loc.captured").some((e) => e.approachId === "ILS09")).toBe(true);

      // 4. Step until Glide Slope captures
      const gsCaptured = stepUntil(world, () => dal.intent.vertical?.type === "GS", 180_000);
      expect(gsCaptured).toBe(true);
      expect(log.byType("nav.gs.captured").some((e) => e.approachId === "ILS09")).toBe(true);

      // 5. Step inside 5 NM gate (threshold is at -1.645, so x ~ -5.5) and accept Tower Handoff
      stepUntil(world, () => dal.xNm >= -6.0 && dal.altitudeFt <= 1600, 120_000);
      expect(isTowerHandoffEligible(dal, world)).toBe(true);
      expect(acceptTowerHandoff(dal, { log, simTimeMs: world.simTimeMs })).toBe(true);
      expect(dal.intent.landingCleared).toBe(true);
      expect(dal.intent.lateral?.type).toBe("LANDING");

      // 6. Ride GS down to RW09 threshold (-1.645, 0) and land
      const dalId = dal.id;
      const callsign = dal.callsign;
      const landed = stepUntil(
        world,
        () => log.byType("nav.landed").some((e) => e.callsign === callsign),
        180_000,
      );
      expect(landed).toBe(true);
      expect(world.aircraft.find((a) => a.id === dalId)).toBeUndefined();
      const landedEvent = log.byType("nav.landed").find((e) => e.callsign === callsign);
      expect(landedEvent?.approachId).toBe("ILS09");
    });

    test("East Flow arrival executes missed approach to MISSE when un-cleared at DA", () => {
      const scenario = loadKdem09();
      const world = createWorldFromScenario(scenario);
      const log = world.sessionLog ?? new SessionLog();
      world.sessionLog = log;

      const dal = world.aircraft[0];
      // Position on final approach on ILS09 at 1 NM west of RW09 threshold (-1.645 - 1.0 = -2.645), altitude 350 ft
      dal.xNm = -2.645;
      dal.yNm = 0;
      dal.headingDeg = 90;
      dal.altitudeFt = 350;
      dal.speedKt = 140;
      dal.intent.lateral = { type: "LOC", approachId: "ILS09" };
      dal.intent.vertical = { type: "GS", approachId: "ILS09" };
      dal.intent.clearedApproachId = "ILS09";
      dal.intent.landingCleared = false;

      // 1. Descend through DA (200 ft) -> Missed approach triggers
      const missedStarted = stepUntil(
        world,
        () => log.byType("nav.missed.started").length > 0,
        30_000,
      );
      expect(missedStarted).toBe(true);
      expect(dal.intent.lateral?.type).toBe("MISSED");
      expect(dal.intent.assignedHeadingDeg).toBe(90);
      expect(dal.intent.vertical).toEqual({ type: "MISSED_CLIMB", altitudeFt: 3000 });

      // 2. Aircraft climbs on heading 090 up to 3,000 ft
      const climbedTo3000 = stepUntil(world, () => dal.altitudeFt >= 2950, 180_000);
      expect(climbedTo3000).toBe(true);

      // 3. At 3,000 ft, lateral transitions to DIRECT MISSE
      const directMisse = stepUntil(
        world,
        () => dal.intent.lateral?.type === "DIRECT" && dal.intent.lateral.fixId === "MISSE",
        30_000,
      );
      expect(directMisse).toBe(true);

      // 4. Aircraft flies toward MISSE (6.355, 6)
      const misseFix = catalog.fixes.find((f) => f.id === "MISSE")!;
      const d0 = distanceNm(dal, misseFix);
      stepSeconds(world, 30);
      const d1 = distanceNm(dal, misseFix);
      expect(d1).toBeLessThan(d0);
    });

    test("East Flow departure spawns on RW09 (-1.645, 0), rolls heading 090, climbs via BAY1 to BAYES -> NORMA, and hands off to Center", () => {
      const log = new SessionLog();
      const world = createWorld({ catalog, sessionLog: log });

      // Spawn departure on RW09 via BAY1 to NORMA
      const dep = spawnDeparture(
        world,
        {
          callsign: "DAL900",
          runwayId: "09",
          sidId: "BAY1",
          transitionId: "NORMA",
          assignedAltitudeFt: 14000,
          aircraftType: "B738",
        },
        catalog,
      );

      // 1. Initial pose at RW09 threshold (-1.645 + 0.8 = -0.845 NM along 090)
      expect(dep.xNm).toBeCloseTo(-0.845, 2);
      expect(dep.yNm).toBeCloseTo(0, 2);
      expect(dep.headingDeg).toBe(90);
      expect(dep.altitudeFt).toBe(700);
      expect(dep.speedKt).toBe(180);
      expect(dep.intent.lateral).toEqual({
        type: "PROCEDURE",
        sidId: "BAY1",
        starId: "BAY1",
        toFixIndex: 0,
        routeFixIds: ["BAYES", "BAYNE", "NORMA"],
      });
      expect(dep.intent.vertical).toEqual({ type: "VIA_SID", sidId: "BAY1" });

      // Departure handoff offered from TWR; radio commands allowed
      expect(handoffFor(world, dep.id)).toEqual({ kind: "departure", fromSectorId: "TWR" });
      expect(isRadioCommandAllowed(handoffFor(world, dep.id))).toBe(true);

      // 2. Climb via BAY1: sequences BAYES (2.355, 0)
      const sequencedBayes = stepUntil(
        world,
        () => log.byType("nav.direct.sequenced").some((e) => e.fixId === "BAYES"),
        180_000,
      );
      expect(sequencedBayes).toBe(true);

      // 3. Sequences BAYNE (6.355, 4.5) and turns toward NORMA (-16, 16)
      const sequencedBayne = stepUntil(
        world,
        () => log.byType("nav.direct.sequenced").some((e) => e.fixId === "BAYNE"),
        180_000,
      );
      expect(sequencedBayne).toBe(true);

      // 4. Initiates Center Handoff
      expect(isCenterHandoffEligible(dep, world)).toBe(true);
      expect(initiateCenterHandoff(dep, { world, log, simTimeMs: world.simTimeMs }, "C")).toBe(
        true,
      );
      expect(acceptOutboundHandoff(world, dep.id)).toBe(true);

      // 5. Flies past TRACON boundary (>= 28 NM) and completes handoff / departure despawn
      const depId = dep.id;
      const departed = stepUntil(
        world,
        () => log.byType("nav.departed").some((e) => e.callsign === "DAL900"),
        800_000,
      );
      expect(departed).toBe(true);
      expect(log.byType("handoff.outbound.completed").some((e) => e.callsign === "DAL900")).toBe(
        true,
      );
      expect(world.aircraft.find((a) => a.id === depId)).toBeUndefined();
    });

    test("East Flow departure climbs via BAY1 to BAYES -> OCTTA transition", () => {
      const log = new SessionLog();
      const world = createWorld({ catalog, sessionLog: log });

      const dep = spawnDeparture(
        world,
        {
          callsign: "UAL700",
          runwayId: "09",
          sidId: "BAY1",
          transitionId: "OCTTA",
          assignedAltitudeFt: 11000,
          aircraftType: "A320",
        },
        catalog,
      );

      expect(dep.intent.lateral).toEqual({
        type: "PROCEDURE",
        sidId: "BAY1",
        starId: "BAY1",
        toFixIndex: 0,
        routeFixIds: ["BAYES", "BAYSE", "OCTTA"],
      });

      // Sequences BAYES then turns south toward BAYSE (5.355, -6)
      stepUntil(
        world,
        () => log.byType("nav.direct.sequenced").some((e) => e.fixId === "BAYES"),
        180_000,
      );
      const sequencedBayse = stepUntil(
        world,
        () => log.byType("nav.direct.sequenced").some((e) => e.fixId === "BAYSE"),
        180_000,
      );
      expect(sequencedBayse).toBe(true);
    });
  });

  describe("AC3: Session Setup Switching & Restart Fidelity", () => {
    function memoryStorage(): Storage {
      const mem = new Map<string, string>();
      return {
        get length() {
          return mem.size;
        },
        clear() {
          mem.clear();
        },
        getItem(key: string) {
          return mem.get(key) ?? null;
        },
        key(index: number) {
          return Array.from(mem.keys())[index] ?? null;
        },
        removeItem(key: string) {
          mem.delete(key);
        },
        setItem(key: string, value: string) {
          mem.set(key, value);
        },
      };
    }

    test("Airport and Configuration lists expose KDEM West Flow and East Flow", () => {
      const airports = listPlayableAirports();
      expect(airports.some((a) => a.airportIcao === "KDEM")).toBe(true);

      const configs = listConfigurationsForAirport("KDEM");
      expect(configs.length).toBeGreaterThanOrEqual(2);
      expect(configs.some((c) => c.id === "kdem" && c.activeRunwayId === "27")).toBe(true);
      expect(configs.some((c) => c.id === "kdem-09" && c.activeRunwayId === "09")).toBe(true);
    });

    test("Switching Session Setup from West Flow to East Flow restarts World with complete East Flow behavior", () => {
      const storage = memoryStorage();
      const westSetup = defaultSessionSetup();
      expect(westSetup.scenarioId).toBe("kdem");

      // 1. Initial West Flow World
      const westScenario = loadPlayableScenario(westSetup.scenarioId);
      expect(westScenario.activeRunwayId).toBe("27");
      const westWorld = createWorldForSession(westScenario, null, westSetup.seed);
      expect(westWorld.aircraft.length).toBeGreaterThanOrEqual(1);
      expect(
        westWorld.aircraft.every(
          (a) =>
            a.intent.lateral?.type === "PROCEDURE" &&
            (a.intent.lateral.routeFixIds.includes("MERGE") ||
              a.intent.lateral.routeFixIds.includes("BAYEE")),
        ),
      ).toBe(true);

      // 2. User switches to East Flow (kdem-09) and saves setup
      const eastSetup: SessionSetup = {
        ...westSetup,
        scenarioId: "kdem-09",
        arrivalCount: 6,
        arrivalsPerHour: 16,
        departuresPerHour: 8,
        seed: 777,
      };
      saveSessionSetup(storage, eastSetup);

      const reloadedSetup = loadSessionSetup(storage, defaultSessionSetup());
      expect(reloadedSetup.scenarioId).toBe("kdem-09");
      expect(reloadedSetup.seed).toBe(777);

      // 3. Restart World with new East Flow setup
      const eastScenario = loadPlayableScenario(reloadedSetup.scenarioId);
      expect(eastScenario.activeRunwayId).toBe("09");
      const eastWorld = createWorldForSession(eastScenario, null, reloadedSetup.seed);
      expect(eastWorld.aircraft.length).toBeGreaterThanOrEqual(1);

      // Verify East Flow STAR arrivals and departure schedule configuration
      for (const ac of eastWorld.aircraft) {
        if (ac.intent.lateral?.type === "PROCEDURE") {
          expect(ac.intent.lateral.routeFixIds).toContain("WEMER");
          expect(ac.intent.lateral.routeFixIds).not.toContain("MERGE");
        }
      }
      expect(eastWorld.scheduledDepartures?.every((d) => d.runwayId === "09")).toBe(true);
    });

    test("Query parameter override cleanly switches between West Flow and East Flow", () => {
      const defaultSetup = defaultSessionSetup();

      const westRes = resolveSessionSetup("?scenario=kdem", defaultSetup, null);
      expect(westRes.setup.scenarioId).toBe("kdem");
      const westScenario = loadPlayableScenario(westRes.setup.scenarioId);
      expect(westScenario.activeRunwayId).toBe("27");

      const eastRes = resolveSessionSetup("?scenario=kdem-09", defaultSetup, null);
      expect(eastRes.setup.scenarioId).toBe("kdem-09");
      const eastScenario = loadPlayableScenario(eastRes.setup.scenarioId);
      expect(eastScenario.activeRunwayId).toBe("09");
    });
  });
});
