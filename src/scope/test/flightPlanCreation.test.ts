import { describe, expect, it, vi } from "vitest";
import { createFlightPlan, createWorld } from "@core";
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

  it("applies the manual creation grammar and pool selectors", () => {
    expect(parseFlightPlanCreation("ALL")).toMatchObject({ kind: "invalid", reason: "ILL ACID" });
    expect(parseFlightPlanCreation("UAL1234 1289")).toMatchObject({
      kind: "invalid",
      reason: "FORMAT",
    });
    expect(parseFlightPlanCreation("UAL1234 E1")).toMatchObject({
      kind: "invalid",
      reason: "FORMAT",
    });
    expect(parseFlightPlanCreation("UAL1234 A")).toMatchObject({ kind: "action" });
    expect(parseFlightPlanCreation("UAL1234 A A")).toMatchObject({
      kind: "action",
      action: { beaconAllocation: undefined },
    });
    expect(parseFlightPlanCreation("UAL1234 A")).not.toMatchObject({
      action: { aircraftType: "A" },
    });
    expect(parseFlightPlanCreation("UAL1234 1/F16")).toMatchObject({
      kind: "invalid",
      reason: "ILL NUM",
    });
    expect(parseFlightPlanCreation("UAL1234 +")).toMatchObject({
      kind: "action",
      action: { beaconAllocation: "ifr" },
    });
    expect(parseFlightPlanCreation("UAL1234 /3")).toMatchObject({
      kind: "action",
      action: { beaconAllocation: "general3" },
    });
    expect(parseFlightPlanCreation("UAL1234 .B")).toMatchObject({
      kind: "invalid",
      reason: "ILL VALUE",
    });
  });

  it("shows named creation errors and reaches beacon-pool capacity", () => {
    const occupied = createFlightPlan({
      id: "occupied-0",
      acid: "O00",
      assignedBeacon: "0000",
      fixes: [],
      scratchpads: [],
    });
    if (!occupied.ok) throw new Error("test fixture should be valid");
    const world = createWorld({
      flightPlans: [occupied.value],
    });
    const view = createScopeView();
    handleScopeKeyDown(key("F3"), view, "scope", world);
    for (const ch of "NEW123 +") handleScopeKeyDown(key(ch), view, "scope", world);
    handleScopeKeyDown(key("Enter"), view, "scope", world);
    expect(view.preview.rejection).toBe("CAPACITY — BCN");

    const invalidView = createScopeView();
    for (const ch of "ALL") handleScopeKeyDown(key(ch), invalidView, "scope", world);
    handleScopeKeyDown(key("Enter"), invalidView, "scope", world);
    expect(invalidView.preview.rejection).toBe("ILL ACID");
  });

  it("shows beacon capacity for abbreviated pool allocation exhaustion", () => {
    const occupied = createFlightPlan({
      id: "occupied-ifr",
      acid: "O01",
      assignedBeacon: "0000",
      fixes: [],
      scratchpads: [],
    });
    if (!occupied.ok) throw new Error("test fixture should be valid");
    const world = createWorld({ flightPlans: [occupied.value] });
    const view = createScopeView();

    for (const ch of "NEW123") handleScopeKeyDown(key(ch), view, "scope", world);
    // Isolate allocation handling from the existing pool-prefix key path.
    view.preview.buffer += " +";
    handleScopeKeyDown(key("Enter"), view, "scope", world);

    expect(view.preview.rejection).toBe("CAPACITY — BCN");
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
