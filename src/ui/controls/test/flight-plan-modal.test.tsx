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
  expect(createHtml).toContain('for="flight-plan-route"');
  expect(createHtml).toContain("Filed route");
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
    route: "DCT FIXA",
  };
  expect(modalHtml(plan)).toContain("Amend flight plan");
  expect(modalHtml(plan)).toContain('value="DCT FIXA"');

  const departurePlan: FlightPlan = {
    ...plan,
    departureAirport: "KATL",
    ptd: "1430E",
  };
  const departureHtml = modalHtml(departurePlan);
  expect(departureHtml).toContain(">PTD<");
  expect(departureHtml).not.toContain(">ETA<");
});

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
  const created = saveFlightPlanDraft(world, { acid: "AAL123", filedRoute: "DCT FIXA" });
  expect(created.ok).toBe(true);
  const beforePlan = structuredClone(world.flightPlans[0]);
  const beforeAircraft = structuredClone(aircraft);

  const failed = saveFlightPlanDraft(world, {
    acid: "AAL123",
    filedRoute: "SID:SID1/NOPE",
    remarks: "must not partially apply",
  });
  expect(failed).toMatchObject({ ok: false, error: { code: "UNKNOWN_TRANSITION" } });
  expect(world.flightPlans[0]).toEqual(beforePlan);
  expect(aircraft).toEqual(beforeAircraft);
});

test("modal submit keeps filed-route catalog validation", () => {
  const world = createWorld({ catalog: { ...catalog, airportId: "TEST", approaches: [] } });
  const draft = flightPlanModalDraftFromPlan("AAL123");
  draft.route = "DCT NOT_IN_CATALOG";

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
