import { describe, expect, it, vi } from "vitest";
import { createWorld } from "@core";
import { getFlightPlanEntries } from "../systemLists";
import { createScopeView } from "../scopeView";
import { handleScopeKeyDown } from "../scopeKeys";
import { parseFlightPlanCreation, parsePreviewCommand } from "../previewArea";

const key = (key: string) => ({
  key,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
});

describe("T02-144 flight-plan creation", () => {
  it("parses order-independent abbreviated fields", () => {
    expect(parseFlightPlanCreation("UAL1234 2341 1R AD ATST +ORH 4/F16/L 250 .E")).toEqual({
      kind: "action",
      action: {
        type: "createFlightPlan",
        pendingDiscrete: false,
        acid: "UAL1234",
        assignedBeacon: "2341",
        tcp: "1R",
        airportId: "D",
        flightType: "A",
        scratchpads: ["TST", "ORH"],
        aircraftCount: 4,
        aircraftType: "F16",
        equipment: "L",
        requestedAltitudeFt: 25000,
        flightRules: "E",
      },
    });
  });

  it("requires a discrete beacon for INIT CNTL pending creation", () => {
    expect(parseFlightPlanCreation("UAL1234", true).kind).toBe("incomplete");
    expect(parseFlightPlanCreation("UAL1234 2341", true)).toMatchObject({
      kind: "action",
      action: { pendingDiscrete: true, assignedBeacon: "2341" },
    });
  });

  it("keeps *F as altitude filtering, not creation", () => {
    expect(parsePreviewCommand("*F")).toMatchObject({ kind: "action" });
    expect(parseFlightPlanCreation("*F").kind).toBe("invalid");
  });

  it("creates pending plans through scope Preview without mutating aircraft", () => {
    const world = createWorld();
    const view = createScopeView();
    for (const ch of "UAL1234 2341 ATST") handleScopeKeyDown(key(ch), view, "scope", world);
    handleScopeKeyDown(key("Enter"), view, "scope", world);
    expect(world.aircraft).toEqual([]);
    expect(world.flightPlans).toHaveLength(1);
    expect(world.flightPlans[0]).toMatchObject({
      acid: "UAL1234",
      assignedBeacon: "2341",
      status: "pending",
    });
    expect(getFlightPlanEntries(world, view)).toMatchObject([
      { callsign: "UAL1234", squawk: "2341", index: 1 },
    ]);
  });

  it("creates a pending discrete plan from INIT CNTL ACID beacon", () => {
    const world = createWorld();
    const view = createScopeView();
    handleScopeKeyDown(key("F3"), view, "scope", world);
    for (const ch of "UAL1234 2342 ATEST") handleScopeKeyDown(key(ch), view, "scope", world);
    handleScopeKeyDown(key("Enter"), view, "scope", world);
    expect(world.flightPlans).toHaveLength(1);
    expect(world.flightPlans[0]).toMatchObject({
      acid: "UAL1234",
      assignedBeacon: "2342",
      status: "pending",
    });
  });
});
