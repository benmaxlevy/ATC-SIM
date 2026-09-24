import { describe, expect, it, vi } from "vitest";
import { createBeaconPoolConfig, createFlightPlan, createWorld } from "@core";
import { getFlightPlanEntries } from "../systemLists";
import { createScopeView } from "../scopeView";
import { handleScopeKeyDown } from "../scopeKeys";
import { parseFlightPlanCreation, parsePreviewCommand } from "../previewArea";
import { associateFlightPlanToTrack } from "../systemLists";
import { makeTestAircraft } from "@core";

const key = (key: string) => ({
  key,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
});

describe("T02-144 flight-plan creation", () => {
  it("T02-173 derives a matching plan without mutating it", () => {
    const planResult = createFlightPlan({
      id: "fp-associate",
      acid: "DAL456",
      assignedBeacon: "7024",
      fixes: [],
      scratchpads: [],
    });
    if (!planResult.ok) throw new Error("test fixture should be valid");
    const target = makeTestAircraft({ id: "ac-associate", callsign: "1234", squawk: "7024" });
    const world = createWorld({ flightPlans: [planResult.value], aircraft: [target] });
    const view = createScopeView();
    expect(associateFlightPlanToTrack(world, view, 1, target.id)).toBe(false);
    expect(world.flightPlans[0]).toMatchObject({
      status: "pending",
    });
    expect(getFlightPlanEntries(world, view).some((entry) => entry.callsign === "DAL456")).toBe(
      false,
    );
  });

  it("T02-173 derives a suspended plan without mutating it", () => {
    const planResult = createFlightPlan({
      id: "fp-suspended-associate",
      acid: "DAL457",
      assignedBeacon: "7025",
      status: "suspended",
      fixes: [],
      scratchpads: [],
    });
    if (!planResult.ok) throw new Error("test fixture should be valid");
    const target = makeTestAircraft({
      id: "ac-suspended-associate",
      callsign: "1235",
      squawk: "7025",
    });
    const world = createWorld({ flightPlans: [planResult.value], aircraft: [target] });
    const view = createScopeView();

    expect(associateFlightPlanToTrack(world, view, 1, target.id)).toBe(false);
    expect(world.flightPlans[0]).toMatchObject({
      status: "suspended",
    });
    expect(getFlightPlanEntries(world, view).some((entry) => entry.callsign === "DAL457")).toBe(
      false,
    );
  });

  it("parses order-independent abbreviated fields", () => {
    expect(parseFlightPlanCreation("UAL1234 2341 1R AD ΔTST +ORH 4/F16/L 250 .E")).toEqual({
      kind: "action",
      action: {
        type: "createFlightPlan",
        pendingDiscrete: false,
        acid: "UAL1234",
        beacon: { kind: "code", code: "2341" },
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

  it("accepts every explicit INIT CNTL beacon form, including no-code A", () => {
    const expected = [
      ["2341", { kind: "code", code: "2341" }],
      ["+", { kind: "pool", pool: "ifr" }],
      ["/", { kind: "pool", pool: "vfr" }],
      ["/1", { kind: "pool", pool: "general1" }],
      ["/2", { kind: "pool", pool: "general2" }],
      ["/3", { kind: "pool", pool: "general3" }],
      ["/4", { kind: "pool", pool: "general4" }],
      ["A", { kind: "none" }],
    ] as const;

    for (const [beacon, spec] of expected) {
      expect(parseFlightPlanCreation(`UAL1234 ${beacon}`, true)).toMatchObject({
        kind: "action",
        action: { pendingDiscrete: true, beacon: spec },
      });
    }
    expect(parseFlightPlanCreation("UAL1234 1289", true)).toMatchObject({
      kind: "invalid",
      reason: "FORMAT",
    });
  });

  it("uses abbreviated A as explicit no-code before ambiguous flight type A", () => {
    expect(parseFlightPlanCreation("UAL1234 A")).toMatchObject({
      kind: "action",
      action: { beacon: { kind: "none" } },
    });
    expect(parseFlightPlanCreation("UAL1234 A")).not.toMatchObject({
      action: { flightType: "A" },
    });
    expect(parseFlightPlanCreation("UAL1234 A A")).toMatchObject({
      kind: "action",
      action: { beacon: { kind: "none" }, flightType: "A" },
    });
  });

  it("distinguishes omitted, selected-pool, explicit-code, and no-code beacons", () => {
    expect(parseFlightPlanCreation("UAL1234")).toMatchObject({
      action: { beacon: { kind: "default" } },
    });
    expect(parseFlightPlanCreation("UAL1234", false, true)).toMatchObject({
      action: { beacon: { kind: "default" } },
    });
    expect(parseFlightPlanCreation("UAL1234 +")).toMatchObject({
      action: { beacon: { kind: "pool", pool: "ifr" } },
    });
    expect(parseFlightPlanCreation("UAL1234 /4")).toMatchObject({
      action: { beacon: { kind: "pool", pool: "general4" } },
    });
    expect(parseFlightPlanCreation("UAL1234 4721")).toMatchObject({
      action: { beacon: { kind: "code", code: "4721" }, assignedBeacon: "4721" },
    });
    expect(parseFlightPlanCreation("UAL1234 A B738", false, true)).toMatchObject({
      action: { beacon: { kind: "none" } },
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
      action: { beacon: { kind: "none" } },
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
      action: { beacon: { kind: "pool", pool: "ifr" } },
    });
    expect(parseFlightPlanCreation("UAL1234 /3")).toMatchObject({
      kind: "action",
      action: { beacon: { kind: "pool", pool: "general3" } },
    });
    expect(parseFlightPlanCreation("UAL1234 .B")).toMatchObject({
      kind: "invalid",
      reason: "ILL VALUE",
    });
  });

  it("parses F6 full IFR fields independently from abbreviated creation", () => {
    expect(
      parseFlightPlanCreation("UAL1234 .A 250 B738 ΔTST +ORH KDEM*RW27 1630E 1R 2341", false, true),
    ).toEqual({
      kind: "action",
      action: {
        type: "createFlightPlan",
        pendingDiscrete: false,
        creationMode: "fltData",
        acid: "UAL1234",
        beacon: { kind: "code", code: "2341" },
        assignedBeacon: "2341",
        tcp: "1R",
        departureAirport: "KDEM",
        airportId: "RW27",
        fixes: ["KDEM*RW27"],
        eta: "1630E",
        scratchpads: ["TST", "ORH"],
        aircraftType: "B738",
        requestedAltitudeFt: 25000,
        flightRules: "A",
      },
    });
    expect(parseFlightPlanCreation("UAL1234 2341 KDEM*RW27 B738 250 .A")).not.toMatchObject({
      action: { creationMode: "fltData" },
    });
  });

  it("keeps F6 departure PTD and beacon/no-code forms distinct", () => {
    expect(parseFlightPlanCreation("UAL1234 KDEM*RW27*P 1630E B738 A", false, true)).toMatchObject({
      kind: "action",
      action: {
        creationMode: "fltData",
        fixes: ["KDEM*RW27*P"],
        ptd: "1630E",
        aircraftType: "B738",
      },
    });
    expect(parseFlightPlanCreation("UAL1234 A B738", false, true)).toMatchObject({
      kind: "action",
      action: { creationMode: "fltData", aircraftType: "B738" },
    });
  });

  it("disambiguates a two-character F6 TCP from aircraft type data", () => {
    expect(parseFlightPlanCreation("UAL1234 AT B738", false, true)).toMatchObject({
      kind: "action",
      action: {
        creationMode: "fltData",
        tcp: "AT",
        aircraftType: "B738",
      },
    });
    expect(parseFlightPlanCreation("UAL1234 F16", false, true)).toMatchObject({
      kind: "action",
      action: { creationMode: "fltData", aircraftType: "F16" },
    });
    expect(parseFlightPlanCreation("UAL1234 E2", false, true)).toMatchObject({
      kind: "action",
      action: { creationMode: "fltData", aircraftType: "E2" },
    });
  });

  it("classifies F6 time after later fix data", () => {
    expect(parseFlightPlanCreation("UAL1234 1630E KDEM*RW27*P B738", false, true)).toMatchObject({
      kind: "action",
      action: {
        creationMode: "fltData",
        fixes: ["KDEM*RW27*P"],
        ptd: "1630E",
      },
    });
    expect(parseFlightPlanCreation("UAL1234 1630E KDEM*RW27 B738", false, true)).toMatchObject({
      kind: "action",
      action: {
        creationMode: "fltData",
        fixes: ["KDEM*RW27"],
        eta: "1630E",
      },
    });
  });

  it("returns explicit F6 format, scratchpad, and value errors", () => {
    expect(parseFlightPlanCreation("AB", false, true)).toMatchObject({
      kind: "invalid",
      reason: "ILL ACID",
    });
    expect(parseFlightPlanCreation("UAL1234 8888", false, true)).toMatchObject({
      kind: "invalid",
      reason: "FORMAT",
    });
    expect(parseFlightPlanCreation("UAL1234 ΔNAT", false, true)).toMatchObject({
      kind: "invalid",
      reason: "ILL SCR",
    });
    expect(parseFlightPlanCreation("UAL1234 KDEM*RW27 KDEM*RW28", false, true)).toMatchObject({
      kind: "invalid",
      reason: "FORMAT",
    });
    expect(parseFlightPlanCreation("UAL1234 .B", false, true)).toMatchObject({
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
    handleScopeKeyDown(key("F1"), view, "scope", world);
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

  it("uses the configured default pool and reserves assigned aircraft squawks", () => {
    const config = createBeaconPoolConfig({
      defaultPool: "ifr",
      pools: { ifr: ["7001", "7002"] },
    });
    if (!config.ok) throw new Error("test fixture should be valid");
    const aircraft = makeTestAircraft({
      id: "ac-default-pool",
      callsign: "UNTRK",
      assignedSquawk: "7001",
    });
    const world = createWorld({ beaconPools: config.value, aircraft: [aircraft] });
    const view = createScopeView();

    handleScopeKeyDown(key("F6"), view, "scope", world);
    for (const ch of "AAL123 ") handleScopeKeyDown(key(ch), view, "scope", world);
    handleScopeKeyDown(key("Enter"), view, "scope", world);

    expect(world.flightPlans).toHaveLength(1);
    expect(world.flightPlans[0]).toMatchObject({ acid: "AAL123", assignedBeacon: "7002" });
    expect(aircraft.assignedSquawk).toBe("7001");

    const explicitNoneView = createScopeView();
    handleScopeKeyDown(key("F6"), explicitNoneView, "scope", world);
    for (const ch of "AAL124 A") handleScopeKeyDown(key(ch), explicitNoneView, "scope", world);
    handleScopeKeyDown(key("Enter"), explicitNoneView, "scope", world);
    expect(world.flightPlans).toHaveLength(2);
    expect(world.flightPlans[1]).toMatchObject({ acid: "AAL124", assignedBeacon: undefined });

    const abbreviatedNoneView = createScopeView();
    for (const ch of "AAL125 A") handleScopeKeyDown(key(ch), abbreviatedNoneView, "scope", world);
    handleScopeKeyDown(key("Enter"), abbreviatedNoneView, "scope", world);
    expect(world.flightPlans).toHaveLength(3);
    expect(world.flightPlans[2]).toMatchObject({ acid: "AAL125", assignedBeacon: undefined });
  });

  it("reports FORMAT for F1 creation without a discrete beacon", () => {
    const world = createWorld();
    const view = createScopeView();
    handleScopeKeyDown(key("F1"), view, "scope", world);
    for (const ch of "AAL123 ") handleScopeKeyDown(key(ch), view, "scope", world);
    handleScopeKeyDown(key("Enter"), view, "scope", world);
    expect(view.preview.rejection).toBe("FORMAT");
    expect(world.flightPlans).toHaveLength(0);
  });

  it("creates F1 pending plans from configured pools and explicit no-code A", () => {
    const config = createBeaconPoolConfig({
      pools: {
        ifr: ["6101"],
        vfr: ["6201"],
        general1: ["6301"],
        general2: ["6401"],
        general3: ["6501"],
        general4: ["6601"],
      },
    });
    if (!config.ok) throw new Error("test fixture should be valid");
    const world = createWorld({ beaconPools: config.value });

    const selectors = [
      ["+", "6101"],
      ["/", "6201"],
      ["/1", "6301"],
      ["/2", "6401"],
      ["/3", "6501"],
      ["/4", "6601"],
    ] as const;
    for (const [index, [selector, assignedBeacon]] of selectors.entries()) {
      const view = createScopeView();
      handleScopeKeyDown(key("F1"), view, "scope", world);
      for (const ch of `UAL12${index} ${selector}`)
        handleScopeKeyDown(key(ch), view, "scope", world);
      handleScopeKeyDown(key("Enter"), view, "scope", world);
      expect(world.flightPlans.at(-1)).toMatchObject({ acid: `UAL12${index}`, assignedBeacon });
    }

    const exhaustedView = createScopeView();
    handleScopeKeyDown(key("F1"), exhaustedView, "scope", world);
    for (const ch of "UAL130 +") handleScopeKeyDown(key(ch), exhaustedView, "scope", world);
    handleScopeKeyDown(key("Enter"), exhaustedView, "scope", world);
    expect(exhaustedView.preview.rejection).toBe("CAPACITY — BCN");

    const noCodeView = createScopeView();
    handleScopeKeyDown(key("F1"), noCodeView, "scope", world);
    for (const ch of "UAL129 A") handleScopeKeyDown(key(ch), noCodeView, "scope", world);
    handleScopeKeyDown(key("Enter"), noCodeView, "scope", world);
    expect(world.flightPlans.at(-1)).toMatchObject({ acid: "UAL129", assignedBeacon: undefined });
  });

  it("creates pending plans through scope Preview without mutating aircraft", () => {
    const world = createWorld();
    const view = createScopeView();
    for (const ch of "UAL1234 2341 `TEST") handleScopeKeyDown(key(ch), view, "scope", world);
    handleScopeKeyDown(key("Enter"), view, "scope", world);
    expect(world.aircraft).toEqual([]);
    expect(world.flightPlans).toHaveLength(1);
    expect(world.flightPlans[0]).toMatchObject({
      acid: "UAL1234",
      assignedBeacon: "2341",
      scratchpads: ["TEST"],
      status: "pending",
    });
    expect(getFlightPlanEntries(world, view)).toMatchObject([
      { callsign: "UAL1234", squawk: "2341", index: 1 },
    ]);
  });

  it("creates a pending discrete plan from INIT CNTL ACID beacon", () => {
    const world = createWorld();
    const view = createScopeView();
    handleScopeKeyDown(key("F1"), view, "scope", world);
    for (const ch of "UAL1234 2342 `TEST") handleScopeKeyDown(key(ch), view, "scope", world);
    handleScopeKeyDown(key("Enter"), view, "scope", world);
    expect(world.flightPlans).toHaveLength(1);
    expect(world.flightPlans[0]).toMatchObject({
      acid: "UAL1234",
      assignedBeacon: "2342",
      status: "pending",
    });
  });

  it("routes F6 in scope and radio focus to local full-plan creation", () => {
    for (const focus of ["scope", "radio"] as const) {
      const world = createWorld();
      const view = createScopeView();
      handleScopeKeyDown(key("F6"), view, focus, world);
      expect(view.preview.creationMode).toBe("fltData");
      expect(view.preview.mnemonic).toBe("FLT DATA");
      for (const ch of "UAL1234 2341 KDEM*RW27 B738 250 .A") {
        handleScopeKeyDown(key(ch), view, focus, world);
      }
      handleScopeKeyDown(key("Enter"), view, focus, world);
      expect(world.flightPlans).toHaveLength(1);
      expect(world.flightPlans[0]).toMatchObject({
        acid: "UAL1234",
        assignedBeacon: "2341",
        fixes: ["KDEM*RW27"],
        aircraftType: "B738",
        requestedAltitudeFt: 25000,
        flightRules: "A",
        flightType: "IFR",
        status: "pending",
      });
      expect(world.aircraft).toHaveLength(0);
      expect(view.preview.creationMode).toBeUndefined();
    }
  });

  it("keeps F6 pending and unassociated when beacon matches a track", () => {
    const aircraft = makeTestAircraft({ id: "ac-f6-pending", callsign: "UNTRK", squawk: "2341" });
    const world = createWorld({ aircraft: [aircraft] });
    const view = createScopeView();
    handleScopeKeyDown(key("F6"), view, "scope", world);
    for (const ch of "UAL1234 2341 F4 250 .A") handleScopeKeyDown(key(ch), view, "scope", world);
    handleScopeKeyDown(key("Enter"), view, "scope", world);

    expect(world.flightPlans).toHaveLength(1);
    expect(world.flightPlans[0]).toMatchObject({
      acid: "UAL1234",
      aircraftType: "F4",
      assignedBeacon: "2341",
      status: "pending",
    });
    expect(aircraft.callsign).toBe("UNTRK");
  });
  it("populates departureAirport, airportId, and route on F6 creation", () => {
    // Two-element KLZU*KPIM
    const twoElement = parseFlightPlanCreation("N123 KLZU*KPIM 250 B738", false, true);
    expect(twoElement).toMatchObject({
      kind: "action",
      action: {
        departureAirport: "KLZU",
        airportId: "KPIM",
        fixes: ["KLZU*KPIM"],
      },
    });
    if (twoElement.kind === "action") expect(twoElement.action.route).toBeUndefined();

    // Multi-element KLZU*AJAAY*PDK*KPIM
    const multiElement = parseFlightPlanCreation("N123 KLZU*AJAAY*PDK*KPIM 250 B738", false, true);
    expect(multiElement).toMatchObject({
      kind: "action",
      action: {
        departureAirport: "KLZU",
        airportId: "KPIM",
        route: "AJAAY PDK",
        fixes: ["KLZU*AJAAY*PDK*KPIM"],
      },
    });

    // Omitted departure *KPIM
    const omittedDeparture = parseFlightPlanCreation("N123 *KPIM 250 B738", false, true);
    expect(omittedDeparture).toMatchObject({
      kind: "action",
      action: {
        airportId: "KPIM",
        fixes: ["*KPIM"],
      },
    });
    if (omittedDeparture.kind === "action") {
      expect(omittedDeparture.action.departureAirport).toBeUndefined();
      expect(omittedDeparture.action.route).toBeUndefined();
    }

    // End-to-end via scope keys: F6 populates world.flightPlans
    const world = createWorld();
    const view = createScopeView();
    handleScopeKeyDown(key("F6"), view, "scope", world);
    for (const ch of "N123 2341 KLZU*AJAAY*PDK*KPIM B738 250 .A") {
      handleScopeKeyDown(key(ch), view, "scope", world);
    }
    handleScopeKeyDown(key("Enter"), view, "scope", world);
    expect(world.flightPlans).toHaveLength(1);
    expect(world.flightPlans[0]).toMatchObject({
      acid: "N123",
      departureAirport: "KLZU",
      airportId: "KPIM",
      route: "AJAAY PDK",
    });
  });
});
