import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import {
  createAircraft,
  createWorld,
  saveFlightPlanDraft,
  type FiledRouteCatalog,
  type FlightPlan,
} from "@core";
import { createScopeView, getVisibleFlightPlanEntries } from "@scope";
import {
  FlightPlanModal,
  flightPlanModalDraftFromPlan,
  submitFlightPlanModalDraft,
} from "../FlightPlanModal";

const catalog: FiledRouteCatalog = {
  fixes: [{ id: "FIXA" }, { id: "FIXB" }],
  navaids: [{ id: "VOR1" }],
  sids: [
    {
      id: "SID1",
      common: [{ fixId: "FIXA" }],
      enrouteTransitions: [{ id: "NORTH", legs: [{ fixId: "FIXB" }] }],
    },
  ],
  stars: [
    {
      id: "STAR1",
      common: [{ fixId: "FIXA" }],
      transitions: [{ id: "SOUTH", legs: [{ fixId: "FIXB" }] }],
    },
  ],
};

function modalHtml(plan?: FlightPlan): string {
  return renderToStaticMarkup(
    createElement(FlightPlanModal, {
      open: true,
      acid: plan?.acid ?? "AAL123",
      plan,
      world: createWorld({ catalog: { ...catalog, airportId: "TEST", approaches: [] } }),
      onCancel: () => {},
      onSaved: () => {},
    }),
  );
}

test("create and amend modes expose one accessible filed-plan dialog", () => {
  const createHtml = modalHtml();
  expect(createHtml).toContain('role="dialog"');
  expect(createHtml).toContain('aria-modal="true"');
  expect(createHtml).toContain('aria-labelledby="flight-plan-modal-title"');
  expect(createHtml).toContain('id="flight-plan-modal-title"');
  expect(createHtml).toContain("Create flight plan");
  expect(createHtml).toContain('id="flight-plan-acid"');
  expect(createHtml).toContain('id="flight-plan-acid" name="acid" disabled="" value="AAL123"');
  expect(createHtml).not.toContain('id="flight-plan-cid"');
  expect(createHtml).not.toContain(">CID<");
  expect(createHtml).toContain("Assigned altitude (ft)");
  expect(createHtml).toContain(
    'id="flight-plan-assignedAltitudeFt" name="assignedAltitudeFt" disabled=""',
  );
  expect(createHtml).toContain('for="flight-plan-route"');
  expect(createHtml).toContain("Filed route");
  expect(createHtml).toContain("Equipment code");
  expect(createHtml).toContain("/L — /G with RVSM");
  expect(createHtml).toContain("ETA");
  expect(createHtml).not.toContain(">PTD<");
  for (const removed of ["Fixes", "Scratchpads", "Source", "Minimum fuel", "Owning TCP"]) {
    expect(createHtml).not.toContain(removed);
  }
  expect(createHtml).toContain("Save");
  expect(createHtml).toContain("Cancel");

  const plan: FlightPlan = {
    id: "fp-aal123",
    status: "pending",
    acid: "AAL123",
    fixes: [],
    scratchpads: [],
    route: "FIXA",
    aircraftType: "B744",
  };
  const amendedHtml = modalHtml(plan);
  expect(amendedHtml).toContain("Amend flight plan");
  expect(amendedHtml).toContain('value="FIXA"');
  expect(amendedHtml).toContain(
    'id="flight-plan-assignedAltitudeFt" name="assignedAltitudeFt" disabled=""',
  );
  expect(amendedHtml).toContain('id="flight-plan-aircraftType" name="aircraftType" value="H/B744"');

  const departurePlan: FlightPlan = {
    ...plan,
    departureAirport: "KATL",
    ptd: "1430E",
  };
  const departureHtml = modalHtml(departurePlan);
  expect(departureHtml).toContain(">PTD<");
  expect(departureHtml).not.toContain(">ETA<");
});

test("active-plan modal prefills and submits assigned altitude separately", () => {
  const activePlan: FlightPlan = {
    id: "fp-aal123",
    status: "active",
    acid: "AAL123",
    cid: "123",
    fixes: [],
    scratchpads: [],
    requestedAltitudeFt: 12000,
    assignedAltitudeFt: 8000,
  };
  const html = modalHtml(activePlan);
  expect(html).toContain(
    'id="flight-plan-assignedAltitudeFt" name="assignedAltitudeFt" value="8000"',
  );
  expect(html).not.toContain(
    'id="flight-plan-assignedAltitudeFt" name="assignedAltitudeFt" disabled=""',
  );

  const aircraft = createAircraft({
    id: "ac-aal123",
    callsign: "AAL123",
    xNm: 4,
    yNm: 5,
    headingDeg: 180,
    altitudeFt: 7000,
    speedKt: 210,
    squawk: "4321",
  });
  const world = createWorld({ flightPlans: [activePlan], aircraft: [aircraft] });
  const beforeAircraft = structuredClone(aircraft);
  const draft = flightPlanModalDraftFromPlan("AAL123", activePlan);
  draft.assignedAltitudeFt = "10000";

  const saved = submitFlightPlanModalDraft(world, activePlan, draft);
  expect(saved).toMatchObject({
    ok: true,
    plan: { requestedAltitudeFt: 12000, assignedAltitudeFt: 10000 },
  });
  expect(aircraft).toEqual(beforeAircraft);
});

test("active-plan modal assigned altitude 0 clears only assigned plan field", () => {
  const plan: FlightPlan = {
    id: "fp-aal123",
    status: "active",
    acid: "AAL123",
    fixes: [],
    scratchpads: [],
    requestedAltitudeFt: 12000,
    assignedAltitudeFt: 10000,
  };
  const world = createWorld({ flightPlans: [plan] });
  const draft = flightPlanModalDraftFromPlan("AAL123", plan);
  draft.assignedAltitudeFt = "0";

  const saved = submitFlightPlanModalDraft(world, plan, draft);
  expect(saved).toMatchObject({ ok: true, plan: { requestedAltitudeFt: 12000 } });
  expect(plan.assignedAltitudeFt).toBeUndefined();
});

test("create and non-active modal assigned altitude stays unavailable and core rejection remains exact", () => {
  const createDraft = flightPlanModalDraftFromPlan("AAL123");
  createDraft.assignedAltitudeFt = "10000";
  const createWorldState = createWorld({
    catalog: { ...catalog, airportId: "TEST", approaches: [] },
  });
  expect(submitFlightPlanModalDraft(createWorldState, undefined, createDraft)).toMatchObject({
    ok: false,
    error: {
      field: "assignedAltitudeFt",
      message: "assigned altitude requires an active flight",
    },
  });

  const pendingPlan: FlightPlan = {
    id: "fp-aal123",
    status: "pending",
    acid: "AAL123",
    fixes: [],
    scratchpads: [],
  };
  const pendingHtml = modalHtml(pendingPlan);
  expect(pendingHtml).toContain(
    'id="flight-plan-assignedAltitudeFt" name="assignedAltitudeFt" disabled=""',
  );
  const pendingWorld = createWorld({ flightPlans: [pendingPlan] });
  const pendingDraft = flightPlanModalDraftFromPlan("AAL123", pendingPlan);
  pendingDraft.assignedAltitudeFt = "10000";
  expect(submitFlightPlanModalDraft(pendingWorld, pendingPlan, pendingDraft)).toMatchObject({
    ok: false,
    error: {
      field: "assignedAltitudeFt",
      message: "assigned altitude requires an active flight",
    },
  });
  expect(pendingPlan.assignedAltitudeFt).toBeUndefined();
});

test.each([12345, -100, 100000])(
  "modal preserves atomicity and core altitude error for invalid assigned altitude %s",
  (assignedAltitudeFt) => {
    const plan: FlightPlan = {
      id: "fp-aal123",
      status: "active",
      acid: "AAL123",
      fixes: [],
      scratchpads: [],
      requestedAltitudeFt: 12000,
      assignedAltitudeFt: 8000,
    };
    const aircraft = createAircraft({
      id: "ac-aal123",
      callsign: "AAL123",
      xNm: 4,
      yNm: 5,
      headingDeg: 180,
      altitudeFt: 7000,
      speedKt: 210,
    });
    const world = createWorld({ flightPlans: [plan], aircraft: [aircraft] });
    const beforePlan = structuredClone(plan);
    const beforeAircraft = structuredClone(aircraft);
    const draft = flightPlanModalDraftFromPlan("AAL123", plan);
    draft.assignedAltitudeFt = String(assignedAltitudeFt);

    const failed = submitFlightPlanModalDraft(world, plan, draft);
    expect(failed).toMatchObject({
      ok: false,
      error: {
        field: "altitude",
        message: "altitudes must be whole hundreds from 0 through 99000",
      },
    });
    expect(plan).toEqual(beforePlan);
    expect(aircraft).toEqual(beforeAircraft);
  },
);

test("invalid Save is atomic and preserves aircraft surveillance state", () => {
  const aircraft = createAircraft({
    id: "ac-aal123",
    callsign: "AAL123",
    xNm: 4,
    yNm: 5,
    headingDeg: 180,
    altitudeFt: 7000,
    speedKt: 210,
    squawk: "4321",
  });
  const world = createWorld({
    catalog: { ...catalog, airportId: "TEST", approaches: [] },
    aircraft: [aircraft],
  });
  const created = saveFlightPlanDraft(world, { acid: "AAL123", filedRoute: "FIXA" });
  expect(created.ok).toBe(true);
  const beforePlan = structuredClone(world.flightPlans[0]);
  const beforeAircraft = structuredClone(aircraft);

  const failed = saveFlightPlanDraft(world, {
    acid: "AAL123",
    filedRoute: "SID1/NOPE",
    remarks: "must not partially apply",
  });
  expect(failed).toMatchObject({ ok: false, error: { code: "UNKNOWN_TRANSITION" } });
  expect(world.flightPlans[0]).toEqual(beforePlan);
  expect(aircraft).toEqual(beforeAircraft);
});

test("modal submit keeps filed-route catalog validation", () => {
  const world = createWorld({ catalog: { ...catalog, airportId: "TEST", approaches: [] } });
  const draft = flightPlanModalDraftFromPlan("AAL123");
  draft.route = "NOTINCAT";

  const failed = submitFlightPlanModalDraft(world, undefined, draft);
  expect(failed).toMatchObject({ ok: false, error: { code: "UNKNOWN_FIX" } });
  expect(world.flightPlans).toHaveLength(0);
});

test("modal submit keeps existing ACID and CID immutable", () => {
  const world = createWorld({ catalog: { ...catalog, airportId: "TEST", approaches: [] } });
  const plan: FlightPlan = {
    id: "fp-aal123",
    status: "pending",
    acid: "AAL123",
    cid: "123",
    fixes: [],
    scratchpads: [],
  };
  world.flightPlans.push(plan);
  const draft = flightPlanModalDraftFromPlan("AAL123", plan);
  draft.acid = "DAL999";

  const amended = submitFlightPlanModalDraft(world, plan, draft);
  expect(amended).toMatchObject({ ok: true, plan: { acid: "AAL123", cid: "123" } });
});

test("modal accepts FAA heavy prefix but stores the canonical aircraft type", () => {
  const world = createWorld({ catalog: { ...catalog, airportId: "TEST", approaches: [] } });
  const draft = flightPlanModalDraftFromPlan("AAL123");
  draft.aircraftType = "H/B744";

  const saved = submitFlightPlanModalDraft(world, undefined, draft);
  expect(saved).toMatchObject({ ok: true, plan: { aircraftType: "B744" } });
});

test("current visible FL page is the only TAB index resolution surface", () => {
  const world = createWorld({
    flightPlans: Array.from({ length: 5 }, (_, index) => ({
      id: `fp-${index + 1}`,
      status: "pending" as const,
      acid: `AAL${index + 1}`,
      fixes: [],
      scratchpads: [],
    })),
  });
  const view = createScopeView();
  view.systemLists.FL!.maxLines = 2;
  view.systemLists.FL!.offset = 2;
  const visible = getVisibleFlightPlanEntries(world, view);
  expect(visible.map((entry) => entry.callsign)).toEqual(["AAL3", "AAL4"]);
  expect(visible.some((entry) => entry.index === 1)).toBe(false);
});

test("modal owns Escape, traps Tab, and restores its opener focus", () => {
  const sources = import.meta.glob(["../FlightPlanModal.tsx"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const source = sources["../FlightPlanModal.tsx"]!;
  expect(source).toMatch(/event\.key === "Escape"/);
  expect(source).toMatch(/event\.key !== "Tab"/);
  expect(source).toMatch(/event\.shiftKey/);
  expect(source).toMatch(/onCancel\(\)/);
  expect(source).toMatch(/return \(\) => openerRef\.current\?\.focus\(\)/);
  expect(source).not.toMatch(/autoFocus/);
});
