import { expect, test, vi } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import { buildVfrList, getVfrListCallsigns } from "../systemLists";
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
  });
  expect(getVfrListCallsigns(world, view)).toContain("N123AB");
  expect(buildVfrList(world, 10, undefined, view.tracks)).toEqual(
    expect.arrayContaining([expect.stringContaining("N123AB")]),
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

test("F9 active-track form associates eligible VFR track without kinematics change", () => {
  const aircraft = makeTestAircraft({
    id: "vfr-1",
    callsign: "N456V",
    squawk: "1200",
    flightRules: "VFR",
  });
  const world = createWorld({ aircraft: [aircraft] });
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
    requestedAltitudeFt: 4000,
    status: "active",
  });
  expect({ x: aircraft.xNm, y: aircraft.yNm, heading: aircraft.headingDeg }).toEqual(before);
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
