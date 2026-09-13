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
