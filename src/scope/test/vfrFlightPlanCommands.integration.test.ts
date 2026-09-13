import { expect, test, vi } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import { buildVfrList, getFlightPlanEntries, getVfrListCallsigns } from "../systemLists";
import { handlePpiLeftClick } from "../ppi";
import { handleScopeKeyDown } from "../scopeKeys";
import { createScopeView } from "../scopeView";
import { parseVfrFlightPlanCommand } from "../previewParse";
import { nmToScreen } from "../camera";

const key = (key: string, ctrlKey = false) => ({
  key,
  ctrlKey,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
});

function typeVfr(
  view: ReturnType<typeof createScopeView>,
  world: ReturnType<typeof createWorld>,
  text: string,
) {
  handleScopeKeyDown(key("F9"), view, "scope", world);
  for (const ch of text) handleScopeKeyDown(key(ch === " " ? " " : ch), view, "scope", world);
  handleScopeKeyDown(key("Enter"), view, "scope", world);
}

test("F9 creates, modifies, lists, then deletes local VFR plan", () => {
  const world = createWorld();
  const view = createScopeView();
  typeVfr(view, world, "N123AB KDEM*RW27 C172 050");
  expect(world.flightPlans[0]).toMatchObject({
    acid: "N123AB",
    flightRules: "VFR",
    fixes: ["KDEM*RW27"],
    requestedAltitudeFt: 5000,
    assignedBeacon: "1000",
  });
  expect(getFlightPlanEntries(world, view)).toEqual(
    expect.arrayContaining([expect.objectContaining({ callsign: "N123AB", squawk: "1000" })]),
  );
  expect(getVfrListCallsigns(world, view)).toContain("N123AB");
  expect(buildVfrList(world, 10, undefined, view.tracks)).toEqual(
    expect.arrayContaining([expect.stringContaining("N123AB  1000")]),
  );

  typeVfr(view, world, "N123AB KDEM*RW28 C182 060");
  expect(world.flightPlans[0]).toMatchObject({
    fixes: ["KDEM*RW28"],
    aircraftType: "C182",
    requestedAltitudeFt: 6000,
  });
  typeVfr(view, world, "N123AB");
  expect(world.flightPlans[0]?.status).toBe("deleted");
});

test("F9 active-track form does not use a persistent VFR association", () => {
  const aircraft = makeTestAircraft({
    id: "vfr-1",
    callsign: "N456V",
    squawk: "1200",
    flightRules: "VFR",
  });
  const world = createWorld({
    aircraft: [aircraft],
    flightPlans: [
      {
        id: "vfr-local",
        status: "active",
        acid: "N456V",
        aircraftType: "C172",
        scratchpads: ["VFR"],
        fixes: ["*EXIT"],
        flightRules: "VFR",
      },
    ],
  });
  const view = createScopeView();
  const before = { x: aircraft.xNm, y: aircraft.yNm, heading: aircraft.headingDeg };
  typeVfr(view, world, "* 040");
  const point = nmToScreen(aircraft.xNm, aircraft.yNm, view.camera, {
    widthPx: 800,
    heightPx: 600,
  });
  handlePpiLeftClick(view, world, point.x, point.y, 800, 600);
  expect(world.flightPlans[0]).toMatchObject({
    acid: "N456V",
    flightRules: "VFR",
    status: "active",
  });
  expect({ x: aircraft.xNm, y: aircraft.yNm, heading: aircraft.headingDeg }).toEqual(before);
});

test("F9 active-track form rejects VFR tracks without required local plan data", () => {
  const aircraft = makeTestAircraft({
    id: "vfr-incomplete",
    callsign: "N789V",
    squawk: "1200",
    flightRules: "VFR",
  });
  const world = createWorld({ aircraft: [aircraft] });
  const view = createScopeView();
  typeVfr(view, world, "* 040");
  const point = nmToScreen(aircraft.xNm, aircraft.yNm, view.camera, {
    widthPx: 800,
    heightPx: 600,
  });
  handlePpiLeftClick(view, world, point.x, point.y, 800, 600);
  expect(world.flightPlans).toHaveLength(0);
  expect(view.preview.rejection).toBeTruthy();
});

test("F9 accepts omitted departure and records amended exit-fix retransmit", () => {
  expect(parseVfrFlightPlanCommand("N123AB *RW27")).toMatchObject({
    kind: "action",
    action: { type: "createFlightPlan", fixes: ["*RW27"] },
  });
  expect(parseVfrFlightPlanCommand("N123AB KDEM*MID*RW27")).toMatchObject({
    kind: "action",
    action: { type: "createFlightPlan", fixes: ["KDEM*MID*RW27"] },
  });
  const world = createWorld();
  const view = createScopeView();
  typeVfr(view, world, "N123AB *RW27 C172 050");
  typeVfr(view, world, "N123AB KDEM*RW28 C172 060");
  expect(world.flightPlans[0]).toMatchObject({
    fixes: ["KDEM*RW28"],
    vfrRetransmit: { amendedFix: "KDEM*RW28" },
  });
});

test("F9 deletion removes a VFR plan without persistent association", () => {
  const aircraft = makeTestAircraft({ id: "vfr-delete", callsign: "N321V", flightRules: "VFR" });
  const world = createWorld({
    aircraft: [aircraft],
    flightPlans: [
      {
        id: "vfr-delete-plan",
        status: "active",
        acid: "N321V",
        flightRules: "VFR",
        fixes: ["*EXIT"],
        scratchpads: ["VFR"],
      },
    ],
  });
  const view = createScopeView();
  typeVfr(view, world, "N321V");
  expect(world.flightPlans[0]?.status).toBe("deleted");
  expect(view.tracks.get(aircraft.id)?.unassociated).toBeUndefined();
});

test("F9 parser rejects invalid route and preserves Ctrl+F9 routing", () => {
  expect(parseVfrFlightPlanCommand("N123AB BAD C172")).toMatchObject({
    kind: "invalid",
    reason: "ILL ROUTE",
  });
  const view = createScopeView();
  const event = key("F9", true);
  expect(handleScopeKeyDown(event, view, "scope")).toBe(true);
  expect(view.dcbSpinner.cell).toBe("RR");
  expect(view.preview.creationMode).toBeUndefined();
});
