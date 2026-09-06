import { describe, expect, it, vi } from "vitest";
import { type CaAlert, createWorld, makeTestAircraft, type ScheduledDeparture } from "@core";
import {
  buildAlertList,
  buildCoastSuspendList,
  buildCrdaStatusList,
  buildTabFlightPlanList,
  buildTowerArrivalList,
  buildVfrList,
  ensureSystemListPlacement,
  handleVideoMapsListClick,
  scrollSystemList,
  setSystemListMaxLines,
  toggleSystemList,
} from "../systemLists";
import { buildVideoMapsListLines } from "../coordinationList";
import { createScopeView } from "../scopeView";
import { handlePpiCanvasPointerHover, handlePpiLeftClick } from "../ppi";
import { handleScopeKeyDown } from "../scopeKeys";

function keyEvent(key: string, opts?: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }) {
  return {
    key,
    ctrlKey: opts?.ctrlKey,
    shiftKey: opts?.shiftKey,
    altKey: opts?.altKey,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

function makeDeparture(
  callsign: string,
  opts?: Partial<ScheduledDeparture> & { airportId?: string },
): ScheduledDeparture & { airportId?: string } {
  return {
    callsign,
    runwayId: opts?.runwayId ?? "27",
    sidId: opts?.sidId ?? "BOS1",
    scheduledSimMs: opts?.scheduledSimMs ?? 1000,
    spawned: opts?.spawned ?? false,
    index: opts?.index,
    airportId: opts?.airportId,
    aircraftType: opts?.aircraftType ?? "B738",
  };
}

function makeCaAlert(callsignA: string, callsignB: string): CaAlert {
  return {
    callsignA,
    callsignB,
    severity: "alert",
    distNm: 1.5,
    deltaAltFt: 200,
  };
}

describe("System Lists Multi-Page Scrolling & Pagination", () => {
  describe("1. Pagination state & List Builders honoring offset", () => {
    it("buildTabFlightPlanList accepts and honors offset", () => {
      const world = createWorld();
      const view = createScopeView();
      world.scheduledDepartures = [
        makeDeparture("AAL1", { index: 1 }),
        makeDeparture("AAL2", { index: 2 }),
        makeDeparture("AAL3", { index: 3 }),
        makeDeparture("AAL4", { index: 4 }),
      ];

      const page1 = buildTabFlightPlanList(world, 2, view, 0);
      expect(page1[0]).toBe("FLIGHT PLAN");
      expect(page1[1]).toBe("MORE: 1/2");
      expect(page1[2]).toContain("AAL1");
      expect(page1[3]).toContain("AAL2");

      const page2 = buildTabFlightPlanList(world, 2, view, 2);
      expect(page2[1]).toBe("MORE: 2/2");
      expect(page2[2]).toContain("AAL3");
      expect(page2[3]).toContain("AAL4");
    });

    it("buildTowerArrivalList accepts and honors offset", () => {
      const world = createWorld();
      world.scheduledDepartures = [
        makeDeparture("BOS01", { airportId: "BOS" }),
        makeDeparture("BOS02", { airportId: "BOS" }),
        makeDeparture("BOS03", { airportId: "BOS" }),
        makeDeparture("BOS04", { airportId: "BOS" }),
        makeDeparture("BOS05", { airportId: "BOS" }),
      ];

      const page1 = buildTowerArrivalList(world, "BOS", 0, 0, 2, undefined, 0);
      expect(page1[0]).toBe("BOS TOWER");
      expect(page1[1]).toBe("MORE: 1/3");
      expect(page1[2]).toContain("BOS01");
      expect(page1[3]).toContain("BOS02");

      const page2 = buildTowerArrivalList(world, "BOS", 0, 0, 2, undefined, 2);
      expect(page2[1]).toBe("MORE: 2/3");
      expect(page2[2]).toContain("BOS03");
      expect(page2[3]).toContain("BOS04");

      const page3 = buildTowerArrivalList(world, "BOS", 0, 0, 2, undefined, 4);
      expect(page3[1]).toBe("MORE: 3/3");
      expect(page3[2]).toContain("BOS05");
      expect(page3.length).toBe(3); // title + MORE + 1 entry
    });

    it("buildCoastSuspendList accepts and honors offset", () => {
      const suspended = [
        { callsign: "CST01", status: "C" as const, squawk: "1001" },
        { callsign: "CST02", status: "C" as const, squawk: "1002" },
        { callsign: "CST03", status: "S" as const, squawk: "1003" },
      ];

      const page1 = buildCoastSuspendList(suspended, 2, 0);
      expect(page1[0]).toBe("COAST/SUSPEND");
      expect(page1[1]).toBe("MORE: 1/2");
      expect(page1[2]).toContain("CST01");
      expect(page1[3]).toContain("CST02");

      const page2 = buildCoastSuspendList(suspended, 2, 2);
      expect(page2[1]).toBe("MORE: 2/2");
      expect(page2[2]).toContain("CST03");
    });

    it("buildVfrList accepts and honors offset", () => {
      const world = createWorld();
      world.aircraft = [
        makeTestAircraft({
          id: "1",
          callsign: "N1001",
          altitudeFt: 3000,
          squawk: "1200",
          flightRules: "VFR",
        }),
        makeTestAircraft({
          id: "2",
          callsign: "N1002",
          altitudeFt: 4000,
          squawk: "1200",
          flightRules: "VFR",
        }),
        makeTestAircraft({
          id: "3",
          callsign: "N1003",
          altitudeFt: 5000,
          squawk: "1200",
          flightRules: "VFR",
        }),
      ];

      const page1 = buildVfrList(world, 2, undefined, undefined, 0);
      expect(page1[0]).toBe("VFR LIST");
      expect(page1[1]).toBe("MORE: 1/2");
      expect(page1[2]).toContain("N1001");
      expect(page1[3]).toContain("N1002");

      const page2 = buildVfrList(world, 2, undefined, undefined, 2);
      expect(page2[1]).toBe("MORE: 2/2");
      expect(page2[2]).toContain("N1003");
    });

    it("buildVideoMapsListLines accepts and honors offset", () => {
      const view = createScopeView();
      const page1 = buildVideoMapsListLines(view, "ALL", 2, 0);
      expect(page1[0]).toBe("VIDEO MAPS");
      expect(page1[1]).toMatch(/^MORE: 1\/\d+$/);

      const page2 = buildVideoMapsListLines(view, "ALL", 2, 2);
      expect(page2[1]).toMatch(/^MORE: 2\/\d+$/);
    });

    it("buildCrdaStatusList accepts and honors offset", () => {
      const configs = [
        { index: 1, airport: "BOS", pairing: "27/22L" },
        { index: 2, airport: "BOS", pairing: "27/33L" },
        { index: 3, airport: "BOS", pairing: "4L/15R" },
      ];

      const page1 = buildCrdaStatusList(configs, 2, "BOS", 0);
      expect(page1[0]).toBe("CRDA STATUS");
      expect(page1[1]).toBe("MORE: 1/2");
      expect(page1[2]).toContain("27/22L");

      const page2 = buildCrdaStatusList(configs, 2, "BOS", 2);
      expect(page2[1]).toBe("MORE: 2/2");
      expect(page2[2]).toContain("4L/15R");
    });

    it("buildAlertList accepts and honors offset", () => {
      const world = createWorld();
      world.alerts = {
        ca: [makeCaAlert("AAL1", "DAL2"), makeCaAlert("UAL3", "SWA4"), makeCaAlert("JBU5", "FFT6")],
        msaw: [],
        atpa: [],
      };

      const page1 = buildAlertList(world, 2, undefined, 0);
      expect(page1[0]).toBe("LA/CA/MCI");
      expect(page1[1]).toBe("MORE: 1/2");
      expect(page1[2]).toContain("AAL1 DAL2");

      const page2 = buildAlertList(world, 2, undefined, 2);
      expect(page2[1]).toBe("MORE: 2/2");
      expect(page2[2]).toContain("JBU5 FFT6");
    });
  });

  describe("2. Generic scrollSystemList logic", () => {
    it("returns false if total entries <= maxLines", () => {
      const world = createWorld();
      const view = createScopeView();
      toggleSystemList(view, "FL");
      setSystemListMaxLines(view, "FL", 10);
      world.scheduledDepartures = [makeDeparture("AAL1", { index: 1 })];

      expect(scrollSystemList(view, "FL", 1, world)).toBe(false);
      expect(scrollSystemList(view, "FL", -1, world)).toBe(false);
    });

    it("cycles forward and wraps to 0 at end with direction === 1", () => {
      const world = createWorld();
      const view = createScopeView();
      toggleSystemList(view, "FL");
      setSystemListMaxLines(view, "FL", 2);
      world.scheduledDepartures = [
        makeDeparture("AAL1", { index: 1 }),
        makeDeparture("AAL2", { index: 2 }),
        makeDeparture("AAL3", { index: 3 }),
        makeDeparture("AAL4", { index: 4 }),
      ];

      const p = ensureSystemListPlacement(view, "FL")!;
      expect(p.offset ?? 0).toBe(0);

      // Page 1 -> Page 2
      expect(scrollSystemList(view, "FL", 1, world)).toBe(true);
      expect(p.offset).toBe(2);
      expect(view.flightPlanListState?.offset).toBe(2);

      // Page 2 -> wraps back to Page 1 (offset 0)
      expect(scrollSystemList(view, "FL", 1, world)).toBe(true);
      expect(p.offset).toBe(0);
      expect(view.flightPlanListState?.offset).toBe(0);
    });

    it("steps backward and clamps at 0 with direction === -1", () => {
      const world = createWorld();
      const view = createScopeView();
      toggleSystemList(view, "FL");
      setSystemListMaxLines(view, "FL", 2);
      world.scheduledDepartures = [
        makeDeparture("AAL1", { index: 1 }),
        makeDeparture("AAL2", { index: 2 }),
        makeDeparture("AAL3", { index: 3 }),
        makeDeparture("AAL4", { index: 4 }),
        makeDeparture("AAL5", { index: 5 }),
      ];

      const p = ensureSystemListPlacement(view, "FL")!;
      p.offset = 4; // Page 3

      // Page 3 -> Page 2
      expect(scrollSystemList(view, "FL", -1, world)).toBe(true);
      expect(p.offset).toBe(2);

      // Page 2 -> Page 1
      expect(scrollSystemList(view, "FL", -1, world)).toBe(true);
      expect(p.offset).toBe(0);

      // Page 1 -> clamps at 0
      expect(scrollSystemList(view, "FL", -1, world)).toBe(true);
      expect(p.offset).toBe(0);
    });

    it("works across multiple list types (ML, VL, TL, AL)", () => {
      const world = createWorld();
      const view = createScopeView();

      // Video Maps (ML)
      toggleSystemList(view, "ML");
      setSystemListMaxLines(view, "ML", 2);
      const mlPlacement = ensureSystemListPlacement(view, "ML")!;
      expect(scrollSystemList(view, "ML", 1)).toBe(true);
      expect(mlPlacement.offset).toBe(2);
      expect(scrollSystemList(view, "ML", -1)).toBe(true);
      expect(mlPlacement.offset).toBe(0);

      // VFR List (VL)
      toggleSystemList(view, "VL");
      setSystemListMaxLines(view, "VL", 2);
      world.aircraft = [
        makeTestAircraft({
          id: "1",
          callsign: "N1",
          altitudeFt: 1000,
          squawk: "1200",
          flightRules: "VFR",
        }),
        makeTestAircraft({
          id: "2",
          callsign: "N2",
          altitudeFt: 2000,
          squawk: "1200",
          flightRules: "VFR",
        }),
        makeTestAircraft({
          id: "3",
          callsign: "N3",
          altitudeFt: 3000,
          squawk: "1200",
          flightRules: "VFR",
        }),
      ];
      const vlPlacement = ensureSystemListPlacement(view, "VL")!;
      expect(scrollSystemList(view, "VL", 1, world)).toBe(true);
      expect(vlPlacement.offset).toBe(2);
      expect(scrollSystemList(view, "VL", 1, world)).toBe(true);
      expect(vlPlacement.offset).toBe(0); // wraps

      // Tower List (TL)
      toggleSystemList(view, "TL");
      setSystemListMaxLines(view, "TL", 2);
      world.aircraft = [];
      world.scheduledDepartures = [
        makeDeparture("BOS1", { airportId: "BOS" }),
        makeDeparture("BOS2", { airportId: "BOS" }),
        makeDeparture("BOS3", { airportId: "BOS" }),
      ];
      const tlPlacement = ensureSystemListPlacement(view, "TL")!;
      expect(scrollSystemList(view, "TL", 1, world)).toBe(true);
      expect(tlPlacement.offset).toBe(2);
      expect(scrollSystemList(view, "TL", 1, world)).toBe(true);
      expect(tlPlacement.offset).toBe(0); // wraps
    });
  });

  describe("3. Mouse Click Modality", () => {
    it("clicking MORE: X/Y directly cycles forward and wraps around for ML and TL", () => {
      const world = createWorld();
      const view = createScopeView();

      // Setup Video Maps list ML
      toggleSystemList(view, "ML");
      setSystemListMaxLines(view, "ML", 2);
      const mlPlacement = ensureSystemListPlacement(view, "ML")!;

      // Setup activeListRects simulating render output
      view.activeListRects = [{ id: "ML", bounds: { x: 100, y: 100, width: 200, height: 120 } }];

      // lineH for normal font is around 14-16px. Clicking y=118 is line 1 (MORE line)
      handlePpiLeftClick(view, world, 150, 118, 1000, 1000);
      expect(mlPlacement.offset).toBe(2);

      // Click MORE: X/Y again
      handlePpiLeftClick(view, world, 150, 118, 1000, 1000);
      expect(mlPlacement.offset).toBe(4);

      // Setup Tower list TL
      toggleSystemList(view, "TL");
      setSystemListMaxLines(view, "TL", 2);
      world.scheduledDepartures = [
        makeDeparture("BOS1", { airportId: "BOS" }),
        makeDeparture("BOS2", { airportId: "BOS" }),
        makeDeparture("BOS3", { airportId: "BOS" }),
      ];
      const tlPlacement = ensureSystemListPlacement(view, "TL")!;
      view.activeListRects = [{ id: "TL", bounds: { x: 300, y: 100, width: 200, height: 120 } }];

      // Click MORE on TL
      handlePpiLeftClick(view, world, 350, 118, 1000, 1000);
      expect(tlPlacement.offset).toBe(2);

      // Click MORE again -> wraps to 0
      handlePpiLeftClick(view, world, 350, 118, 1000, 1000);
      expect(tlPlacement.offset).toBe(0);
    });

    it("clicking rows in ML accounts for offset + visibleRow", () => {
      const view = createScopeView();
      toggleSystemList(view, "ML");
      setSystemListMaxLines(view, "ML", 2);
      const mlPlacement = ensureSystemListPlacement(view, "ML")!;
      mlPlacement.offset = 2; // On page 2

      // Call handleVideoMapsListClick with line 2 (first visible item on page 2)
      // line 0 = title, line 1 = MORE: X/Y, line 2 = visibleRow 0
      // entry should be offset(2) + visibleRow(0) = entry index 2
      expect(handleVideoMapsListClick(view, 2)).toBe(true);
    });
  });

  describe("4. Keyboard Modality (PageDown & PageUp)", () => {
    it("PageDown and PageUp scroll list when cursor is hovering over a multi-page list", () => {
      const world = createWorld();
      const view = createScopeView();
      toggleSystemList(view, "ML");
      setSystemListMaxLines(view, "ML", 2);
      const mlPlacement = ensureSystemListPlacement(view, "ML")!;

      view.activeListRects = [{ id: "ML", bounds: { x: 100, y: 100, width: 200, height: 120 } }];

      // Set cursor hovering over ML
      view.cursorHoverPos = { x: 150, y: 110 };

      // Press PageDown
      const handledDown = handleScopeKeyDown(keyEvent("PageDown"), view, "scope", world);
      expect(handledDown).toBe(true);
      expect(mlPlacement.offset).toBe(2);

      // Press PageUp
      const handledUp = handleScopeKeyDown(keyEvent("PageUp"), view, "scope", world);
      expect(handledUp).toBe(true);
      expect(mlPlacement.offset).toBe(0);
    });

    it("PageDown and PageUp scroll visible multi-page list when cursor is NOT hovering over a list", () => {
      const world = createWorld();
      const view = createScopeView();
      toggleSystemList(view, "FL");
      setSystemListMaxLines(view, "FL", 2);
      world.scheduledDepartures = [
        makeDeparture("FL1", { index: 1 }),
        makeDeparture("FL2", { index: 2 }),
        makeDeparture("FL3", { index: 3 }),
      ];
      const flPlacement = ensureSystemListPlacement(view, "FL")!;

      view.activeListRects = [{ id: "FL", bounds: { x: 100, y: 100, width: 200, height: 120 } }];

      // Cursor is elsewhere in scope
      view.cursorHoverPos = { x: 500, y: 500 };

      // Press PageDown
      handleScopeKeyDown(keyEvent("PageDown"), view, "scope", world);
      expect(flPlacement.offset).toBe(2);

      // Press PageUp
      handleScopeKeyDown(keyEvent("PageUp"), view, "scope", world);
      expect(flPlacement.offset).toBe(0);
    });

    it("PageDown/PageUp falls back to stepRange when no lists are multi-page", () => {
      const view = createScopeView();
      view.camera.rangeNm = 20;

      // No system lists visible
      handleScopeKeyDown(keyEvent("PageUp"), view, "scope");
      expect(view.camera.rangeNm).toBe(15); // stepped range in

      handleScopeKeyDown(keyEvent("PageDown"), view, "scope");
      expect(view.camera.rangeNm).toBe(20); // stepped range out
    });

    it("handlePpiCanvasPointerHover updates view.cursorHoverPos even when dwellMode is OFF", () => {
      const world = createWorld();
      const view = createScopeView();
      view.dwellMode = "OFF";

      const mockCanvas = {
        getBoundingClientRect: () => ({
          left: 100,
          top: 100,
          width: 800,
          height: 800,
        }),
      } as unknown as HTMLCanvasElement;

      handlePpiCanvasPointerHover(mockCanvas, world, 250, 350, view);
      expect(view.cursorHoverPos).toEqual({ x: 150, y: 250 });
    });
  });
});
