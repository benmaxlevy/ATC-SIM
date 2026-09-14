import { expect, test } from "vitest";
import {
  applyIfrClearance,
  applyFlightPlanRouteTransaction,
  createAircraft,
  createWorld,
  saveFlightPlanDraft,
  SessionLog,
  stepWorld,
  type FiledRouteCatalog,
} from "@core";
import { handleRadioText } from "../handleRadioText";

const catalog: FiledRouteCatalog = {
  fixes: [{ id: "KAHN" }, { id: "SIITH" }, { id: "VOR1" }],
  navaids: [],
  stars: [],
  sids: [],
};

function setup(route = "VOR1") {
  const aircraft = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const world = createWorld({
    aircraft: [aircraft],
    catalog: {
      ...catalog,
      airportId: "TEST",
      approaches: [],
      fixes: catalog.fixes.map((fix, index) => ({ ...fix, xNm: index + 2, yNm: 0 })),
    },
  });
  const created = saveFlightPlanDraft(world, { acid: "DAL123", filedRoute: route });
  if (!created.ok) throw new Error(created.error.message);
  return { world, aircraft, plan: created.plan };
}

function setupAirport(withFixes: boolean) {
  const aircraft = createAircraft({
    id: "ac-dal-airport",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const world = createWorld({
    aircraft: [aircraft],
    catalog: {
      ...catalog,
      airportId: "KATL",
      name: "Hartsfield/Jackson Atlanta International",
      spokenAliases: ["Atlanta Airport"],
      fixes: withFixes ? [{ id: "VOR1", xNm: 2, yNm: 0 }] : [],
      approaches: [],
    },
  });
  const created = saveFlightPlanDraft(world, {
    acid: "DAL123",
    filedRoute: withFixes ? "VOR1" : "KATL",
  });
  if (!created.ok) throw new Error(created.error.message);
  return { world, aircraft, plan: created.plan };
}

test("new executable IFR clearance activates the canonical route immediately", async () => {
  const { world, aircraft, plan } = setup();
  const log = new SessionLog();
  const result = await handleRadioText(world, "DAL123 CLR TO KAHN VIA DIRECT", log);

  expect(result.accepted).toBe(true);
  expect(plan.routeRecord?.route.text).toBe("VOR1");
  expect(aircraft.activeClearance).toMatchObject({
    limitId: "KAHN",
    access: { type: "EXPLICIT_ROUTE", segments: [] },
    route: { lifecycle: "active", revision: 1 },
  });
  expect(aircraft.clearanceAccess).toEqual({ type: "EXPLICIT_ROUTE", segments: [] });
  expect(aircraft.intent.lateral).toMatchObject({ type: "PROCEDURE", routeFixIds: ["KAHN"] });
  expect(log.byType("clearance.ifr.issued")).toHaveLength(1);
});

test("radar-vector access is active but leaves vector pending", async () => {
  const { world, aircraft, plan } = setup();
  const result = await handleRadioText(
    world,
    "DAL123 CLR TO KAHN VIA RADAR VECTORS",
    new SessionLog(),
  );

  expect(result.accepted).toBe(true);
  expect(plan.routeRecord?.lifecycle).toBe("none");
  expect(aircraft.activeClearance?.route.lifecycle).toBe("active");
  expect(aircraft.intent.lateral).toMatchObject({ type: "VECTOR_PENDING", holdHeadingDeg: 90 });
});

test("unknown route rejects atomically and plain tactical direct never resets the plan", async () => {
  const { world, aircraft, plan } = setup();
  const beforePlan = structuredClone(plan);
  const beforeAircraft = structuredClone(aircraft);
  const rejected = await handleRadioText(world, "DAL123 CLR TO NOPE VIA DIRECT", new SessionLog());
  expect(rejected).toMatchObject({ accepted: false, reason: "UNABLE_ROUTE" });
  expect(plan).toEqual(beforePlan);
  expect(aircraft).toEqual(beforeAircraft);

  const direct = await handleRadioText(world, "DAL123 CLEARED DIRECT VOR1", new SessionLog());
  expect(direct.accepted).toBe(true);
  expect(plan.routeRecord).toEqual(beforePlan.routeRecord);
  expect(aircraft.intent.lateral).toMatchObject({ type: "DIRECT", fixId: "VOR1" });
});

test("live navaid name projects into tactical grounding", async () => {
  const aircraft = createAircraft({
    id: "ac-ahn",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const world = createWorld({
    aircraft: [aircraft],
    catalog: {
      airportId: "KATL",
      name: "Atlanta International",
      spokenAliases: ["Atlanta Airport"],
      navaids: [{ id: "AHN", name: "Athens", xNm: 2, yNm: 0, kind: "VOR" }],
      fixes: [],
      stars: [],
      sids: [],
      approaches: [],
    },
  });

  const result = await handleRadioText(world, "DAL123 CLEARED DIRECT ATHENS", new SessionLog());

  expect(result.accepted).toBe(true);
  expect(result.command?.instructions).toEqual([{ type: "DIRECT", fixId: "AHN" }]);
});

test("AS FILED rejects a limit unrelated to the filed route", async () => {
  const { world, aircraft, plan } = setup();
  const beforePlan = structuredClone(plan);
  const beforeAircraft = structuredClone(aircraft);
  const result = await handleRadioText(world, "DAL123 CLR TO KAHN ASFILED", new SessionLog());
  expect(result).toMatchObject({ accepted: false, reason: "UNABLE_ROUTE" });
  expect(plan).toEqual(beforePlan);
  expect(aircraft).toEqual(beforeAircraft);
});

test("AS FILED rejects an airport limit that conflicts with plan destination metadata", async () => {
  const { world, aircraft, plan } = setup("TEST");
  plan.airportId = "OTHER";
  const beforePlan = structuredClone(plan);
  const beforeAircraft = structuredClone(aircraft);
  const result = await handleRadioText(world, "DAL123 CLR TO TEST ASFILED", new SessionLog());
  expect(result).toMatchObject({ accepted: false, reason: "UNABLE_ROUTE" });
  expect(plan).toEqual(beforePlan);
  expect(aircraft).toEqual(beforeAircraft);
});

test("catalog airport limits are executable generic endpoints", async () => {
  const { world, aircraft, plan } = setup();
  const result = await handleRadioText(world, "DAL123 CLR TO TEST VIA DIRECT", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(plan.routeRecord?.route.text).toBe("VOR1");
  expect(aircraft.activeClearance?.route.route.text).toBe("TEST");
  expect(aircraft.intent.lateral).toMatchObject({ type: "PROCEDURE", routeFixIds: ["TEST"] });
});

test("airport clearance endpoint executes without entering the tactical fix registry", async () => {
  const { world, aircraft } = setupAirport(false);
  world.catalog!.airportEndpoint = { xNm: 0, yNm: 0 };
  aircraft.xNm = 5;
  aircraft.headingDeg = 270;
  const result = await handleRadioText(world, "DAL123 CLR TO KATL VIA DIRECT", new SessionLog());

  expect(result.accepted).toBe(true);
  expect(world.fixRegistry?.has("KATL")).toBe(false);
  expect(aircraft.activeClearance?.route.route.text).toBe("KATL");
  stepWorld(world, 1);
  expect(aircraft.intent.lateral).toMatchObject({ type: "PROCEDURE", routeFixIds: ["KATL"] });
});

test("optional clearance SQ changes aircraft transponder state, not plan beacon", async () => {
  const { world, aircraft, plan } = setup();
  plan.assignedBeacon = "4700";
  const result = await handleRadioText(
    world,
    "DAL123 CLR TO KAHN VIA DIRECT SQ 4721",
    new SessionLog(),
  );

  expect(result.accepted).toBe(true);
  expect(aircraft.assignedSquawk).toBe("4721");
  expect(aircraft.pendingReportedSquawk).toMatchObject({ code: "4721" });
  expect(plan.assignedBeacon).toBe("4700");
});

test("text airport clearance grounds the listed airport with nonempty fixes", async () => {
  const { world, plan } = setupAirport(true);
  const aircraft = world.aircraft[0]!;
  const result = await handleRadioText(
    world,
    "DAL123 CLR TO Atlanta Airport VIA DIRECT",
    new SessionLog(),
  );
  expect(result.accepted).toBe(true);
  expect(plan.clearanceLimit).toBeUndefined();
  expect(aircraft.activeClearance?.limitId).toBe("KATL");
});

test("text airport clearance grounds the listed airport with empty fixes", async () => {
  const { world, plan } = setupAirport(false);
  const aircraft = world.aircraft[0]!;
  const result = await handleRadioText(world, "DAL123 CLR TO KATL VIA DIRECT", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(plan.clearanceLimit).toBeUndefined();
  expect(aircraft.activeClearance?.limitId).toBe("KATL");
  expect(world.fixRegistry?.has("KATL")).toBe(false);
});

test("airport clearance executes through a separate endpoint registry", async () => {
  const { world, aircraft } = setupAirport(false);
  world.catalog!.airportEndpoint = { xNm: 1, yNm: 0 };
  const result = await handleRadioText(world, "DAL123 CLR TO KATL VIA DIRECT", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(world.fixRegistry?.has("KATL")).toBe(false);
  expect(aircraft.activeClearance?.route.route.text).toBe("KATL");

  const xBefore = aircraft.xNm;
  for (let i = 0; i < 20; i += 1) stepWorld(world, 1);
  expect(aircraft.xNm).toBeGreaterThan(xBefore);
  expect(aircraft.intent.lateral).toMatchObject({ type: "HEADING", headingDeg: 90 });
});

test("text clearance rejects an unknown airport with empty fixes", async () => {
  const { world } = setupAirport(false);
  const result = await handleRadioText(world, "DAL123 CLR TO KXXX VIA DIRECT", new SessionLog());
  expect(result.accepted).toBe(false);
});

test("IFR clearance rejects VFR plans without pickup or mutation", async () => {
  const aircraft = createAircraft({
    id: "ac-vfr",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 220,
    flightRules: "VFR",
  });
  const world = createWorld({
    aircraft: [aircraft],
    catalog: { ...catalog, airportId: "TEST", approaches: [] },
  });
  const created = saveFlightPlanDraft(world, {
    acid: "DAL123",
    filedRoute: "VOR1",
    flightType: "VFR",
  });
  if (!created.ok) throw new Error(created.error.message);
  const beforePlan = structuredClone(created.plan);
  const beforeAircraft = structuredClone(aircraft);
  const result = await handleRadioText(world, "DAL123 CLR TO KAHN VIA DIRECT", new SessionLog());
  expect(result).toMatchObject({ accepted: false, reason: "CLEARANCE" });
  expect(created.plan).toEqual(beforePlan);
  expect(aircraft).toEqual(beforeAircraft);
});

test("IFR clearance rejects conflicting VFR markers without inferring a pickup", async () => {
  const { world, aircraft, plan } = setup();
  plan.flightType = "VFR";
  aircraft.flightRules = "IFR";
  const beforePlan = structuredClone(plan);
  const beforeAircraft = structuredClone(aircraft);
  const result = await handleRadioText(world, "DAL123 CLR TO KAHN VIA DIRECT", new SessionLog());
  expect(result).toMatchObject({ accepted: false, reason: "CLEARANCE" });
  expect(plan).toEqual(beforePlan);
  expect(aircraft).toEqual(beforeAircraft);

  plan.flightType = "IFR";
  aircraft.maintainVfr = true;
  const markedPlan = structuredClone(plan);
  const markedAircraft = structuredClone(aircraft);
  const marked = await handleRadioText(world, "DAL123 CLR TO KAHN VIA DIRECT", new SessionLog());
  expect(marked).toMatchObject({ accepted: false, reason: "CLEARANCE" });
  expect(plan).toEqual(markedPlan);
  expect(aircraft).toEqual(markedAircraft);
});

test("clearance route snapshot survives a later plan edit", async () => {
  const { world, aircraft, plan } = setup();
  const issued = await handleRadioText(world, "DAL123 CLR TO KAHN VIA DIRECT", new SessionLog());
  expect(issued.accepted).toBe(true);
  const activeBefore = structuredClone(aircraft.activeClearance);
  const edited = applyFlightPlanRouteTransaction(world, plan.id, {
    routeText: "SIITH",
    lifecycle: "active",
  });
  expect(edited.ok).toBe(true);
  expect(plan.routeRecord?.route.text).toBe("SIITH");
  expect(aircraft.activeClearance).toEqual(activeBefore);
  expect(aircraft.intent.lateral).toMatchObject({ routeFixIds: ["KAHN"] });
});

test("clearance issuance after a plan edit leaves every plan field unchanged", async () => {
  const { world, aircraft, plan } = setup();
  const edited = applyFlightPlanRouteTransaction(world, plan.id, {
    routeText: "SIITH",
    lifecycle: "active",
  });
  expect(edited.ok).toBe(true);
  plan.assignedAltitudeFt = 7000;
  plan.assignedBeacon = "4700";
  plan.clearanceLimit = "OLD";
  plan.clearanceAccess = "AS_FILED";
  plan.clearanceFrequency = "118.1";
  plan.clearanceClimbVia = true;
  const before = structuredClone(plan);
  const result = applyIfrClearance(world, aircraft, {
    type: "IFR_CLEARANCE",
    limitId: "KAHN",
    access: { type: "DIRECT" },
    altitudeFt: 9000,
    frequency: "119.5",
    squawk: "4721",
  });
  expect(result.ok).toBe(true);
  expect(plan).toEqual(before);
  expect(aircraft.intent.assignedAltitudeFt).toBe(9000);
  expect(aircraft.assignedSquawk).toBe("4721");
  expect(aircraft.activeClearance?.route.route.text).toBe("KAHN");
});

test("invalid replacement keeps the existing active clearance and plan unchanged", async () => {
  const { world, aircraft, plan } = setup();
  const first = await handleRadioText(world, "DAL123 CLR TO KAHN VIA DIRECT", new SessionLog());
  expect(first.accepted).toBe(true);
  const beforePlan = structuredClone(plan);
  const beforeClearance = structuredClone(aircraft.activeClearance);
  const rejected = await handleRadioText(world, "DAL123 CLR TO NOPE VIA DIRECT", new SessionLog());
  expect(rejected.accepted).toBe(false);
  expect(plan).toEqual(beforePlan);
  expect(aircraft.activeClearance).toEqual(beforeClearance);
});

test("a later valid clearance replaces only the active snapshot", async () => {
  const { world, aircraft, plan } = setup();
  const first = await handleRadioText(world, "DAL123 CLR TO KAHN VIA DIRECT", new SessionLog());
  expect(first.accepted).toBe(true);
  const beforePlan = structuredClone(plan);
  const second = await handleRadioText(world, "DAL123 CLR TO SIITH VIA DIRECT", new SessionLog());
  expect(second.accepted).toBe(true);
  expect(plan).toEqual(beforePlan);
  expect(aircraft.activeClearance?.limitId).toBe("SIITH");
  expect(aircraft.activeClearance?.route.route.text).toBe("SIITH");
  expect(aircraft.intent.lateral).toMatchObject({ routeFixIds: ["SIITH"] });
});
