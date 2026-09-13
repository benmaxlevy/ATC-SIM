import { expect, test } from "vitest";
import {
  createAircraft,
  createWorld,
  saveFlightPlanDraft,
  SessionLog,
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
  return { world, plan: created.plan };
}

test("new executable IFR clearance activates the canonical route immediately", async () => {
  const { world, aircraft, plan } = setup();
  const log = new SessionLog();
  const result = await handleRadioText(world, "DAL123 CLR TO KAHN VIA DIRECT", log);

  expect(result.accepted).toBe(true);
  expect(plan.routeRecord).toMatchObject({ lifecycle: "active", revision: 1 });
  expect(plan.routeRecord?.route.text).toBe("KAHN");
  expect(plan.clearanceLimit).toBe("KAHN");
  expect(aircraft.clearanceAccess).toBe("DIRECT");
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
  expect(plan.routeRecord?.lifecycle).toBe("active");
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
  expect(plan.routeRecord?.route.text).toBe("TEST");
  expect(aircraft.intent.lateral).toMatchObject({ type: "PROCEDURE", routeFixIds: ["TEST"] });
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
  const result = await handleRadioText(
    world,
    "DAL123 CLR TO Atlanta Airport VIA DIRECT",
    new SessionLog(),
  );
  expect(result.accepted).toBe(true);
  expect(plan.clearanceLimit).toBe("KATL");
});

test("text airport clearance grounds the listed airport with empty fixes", async () => {
  const { world, plan } = setupAirport(false);
  const result = await handleRadioText(world, "DAL123 CLR TO KATL VIA DIRECT", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(plan.clearanceLimit).toBe("KATL");
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
