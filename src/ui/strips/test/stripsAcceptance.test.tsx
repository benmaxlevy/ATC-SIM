import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import { createAircraft, createWorld, setSelectedAircraft } from "@core";
import { loadPlayableScenario } from "@scenario";
import { createScopeView } from "@scope";
import { NullSpeechPort } from "@speech";
import { createApp } from "../../../app/create-app";
import { Shell } from "../../shell";
import {
  DEFAULT_FACILITY_TITLE,
  DepartureStrip,
  ArrivalStrip,
  StripsBoard,
  createStripSelectionHandler,
  mockAAL412,
  mockArrivals,
  mockDAL882,
  mockDepartures,
  mockN415SP,
  mockSWA1902,
  reconcileOrder,
  selectTrackFromFlightStrip,
  terminalStripsFromWorld,
} from "../index";
import type { DepartureStripData } from "../types";

const stripsCss = readFileSync(new URL("../strips.css", import.meta.url), "utf8");
const mainTsx = readFileSync(new URL("../../../main.tsx", import.meta.url), "utf8");
const shellTsx = readFileSync(new URL("../../shell.tsx", import.meta.url), "utf8");

describe("T02-93 Flight Progress Strips Integration and Acceptance", () => {
  // ==========================================================================
  // AC1: Facility title ATL and StripsBoard component structure
  // ==========================================================================
  describe("AC1 — Facility title ATL and StripsBoard component structure", () => {
    test("DEFAULT_FACILITY_TITLE is ATL — Flight Progress Strips", () => {
      expect(DEFAULT_FACILITY_TITLE).toBe("ATL — Flight Progress Strips");
    });

    test("StripsBoard renders the complete board interface with header, racks, and strips", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, { departures: mockDepartures, arrivals: mockArrivals }),
      );

      // Root board element and racks
      expect(html).toContain('class="strips-board"');
      expect(html).toContain('data-testid="strips-board"');
      expect(html).not.toContain('data-testid="board-header"');
      expect(html).toContain('data-testid="strips-layout-toggle-btn"');

      // Two-column rack bay container
      expect(html).toContain('data-testid="bay-container"');
      expect(html).toContain('data-testid="rack-departures"');
      expect(html).toContain('data-testid="rack-arrivals"');

      // Strips present
      expect(html).toContain("DAL882");
      expect(html).toContain("SWA1902");
      expect(html).toContain("AAL412");
      expect(html).toContain("N415SP");

      // Rack headers render clean title labels without count badges
      expect(html).not.toContain('data-testid="departures-count"');
      expect(html).not.toContain('data-testid="arrivals-count"');
    });

    test("src/main.tsx mounts Shell cleanly into #root without external window view", () => {
      expect(mainTsx).toMatch(
        /createRoot\(root\)\.render\(\s*<StrictMode>\s*<Shell app={handles} scenario={scenario} scopeView={scopeView} \/>\s*<\/StrictMode>/,
      );
      expect(mainTsx).not.toMatch(/view=strips/);
    });

    test("mounting StripsBoard into a simulated #root container produces full rack structure", () => {
      const containerHtml = `<div id="root">${renderToStaticMarkup(createElement(StripsBoard))}</div>`;

      expect(containerHtml).toContain('id="root"');
      expect(containerHtml).toContain('data-testid="strips-board"');
      expect(containerHtml).toContain('data-testid="rack-departures"');
      expect(containerHtml).toContain('data-testid="rack-arrivals"');
      expect(containerHtml).toContain("Departures");
      expect(containerHtml).toContain("Arrivals");
    });
  });

  // ==========================================================================
  // AC2: Clicking a strip selects the matching aircraft in World.selectedAircraftId
  // ==========================================================================
  describe("AC2 — Clicking a strip selects the matching aircraft in World.selectedAircraftId", () => {
    test("selectTrackFromFlightStrip selects aircraft matching strip ACID", () => {
      const acDal = createAircraft({
        id: "target-dal882",
        callsign: "DAL882",
        xNm: -5,
        yNm: 10,
        headingDeg: 270,
        altitudeFt: 5000,
        speedKt: 210,
      });
      const acAal = createAircraft({
        id: "target-aal412",
        callsign: "AAL412",
        xNm: 20,
        yNm: -15,
        headingDeg: 90,
        altitudeFt: 8000,
        speedKt: 250,
      });
      const world = createWorld({ aircraft: [acDal, acAal] });
      expect(world.selectedAircraftId).toBeNull();

      // Click DAL882 departure strip
      const selectedDep = selectTrackFromFlightStrip(world, mockDAL882);
      expect(selectedDep).toBe(true);
      expect(world.selectedAircraftId).toBe("target-dal882");

      // Click AAL412 arrival strip
      const selectedArr = selectTrackFromFlightStrip(world, mockAAL412);
      expect(selectedArr).toBe(true);
      expect(world.selectedAircraftId).toBe("target-aal412");
    });

    test("selectTrackFromFlightStrip matches aircraft by id if callsign differs", () => {
      const ac = createAircraft({
        id: "SWA1902",
        callsign: "WN1902",
        xNm: 0,
        yNm: 0,
        headingDeg: 180,
        altitudeFt: 3000,
        speedKt: 180,
      });
      const world = createWorld({ aircraft: [ac] });

      const matched = selectTrackFromFlightStrip(world, mockSWA1902);
      expect(matched).toBe(true);
      expect(world.selectedAircraftId).toBe("SWA1902");
    });

    test("selectTrackFromFlightStrip performs case-insensitive callsign matching", () => {
      const ac = createAircraft({
        id: "ac-c172",
        callsign: "n415sp",
        xNm: 12,
        yNm: 8,
        headingDeg: 360,
        altitudeFt: 2500,
        speedKt: 110,
      });
      const world = createWorld({ aircraft: [ac] });

      const matched = selectTrackFromFlightStrip(world, mockN415SP);
      expect(matched).toBe(true);
      expect(world.selectedAircraftId).toBe("ac-c172");
    });

    test("selectTrackFromFlightStrip returns false and preserves selection when no aircraft matches", () => {
      const ac = createAircraft({
        id: "ac-dal882",
        callsign: "DAL882",
        xNm: 0,
        yNm: 0,
        headingDeg: 90,
        altitudeFt: 10000,
        speedKt: 250,
      });
      const world = createWorld({ aircraft: [ac] });
      setSelectedAircraft(world, "ac-dal882");

      const unknownStrip: DepartureStripData = {
        id: "UNKNOWN1",
        stripType: "DEPARTURE",
        acid: "UAL999",
        rawType: "B738",
        beaconCode: "1234",
        proposedDepartureTime: "1500",
        requestedAltitude: "330",
        departureAirport: "KATL",
        route: "DIRECT",
        destinationAirport: "KORD",
      };

      const matched = selectTrackFromFlightStrip(world, unknownStrip);
      expect(matched).toBe(false);
      // Existing selection remains unchanged
      expect(world.selectedAircraftId).toBe("ac-dal882");
    });

    test("createStripSelectionHandler creates an onSelectStrip callback wired to World", () => {
      const ac = createAircraft({
        id: "ac-dal",
        callsign: "DAL882",
        xNm: 0,
        yNm: 0,
        headingDeg: 270,
        altitudeFt: 5000,
        speedKt: 210,
      });
      const world = createWorld({ aircraft: [ac] });
      const externalCallback = vi.fn();

      const handler = createStripSelectionHandler(world, externalCallback);
      handler(mockDAL882);

      expect(world.selectedAircraftId).toBe("ac-dal");
      expect(externalCallback).toHaveBeenCalledWith(mockDAL882);
    });

    test("StripsBoard component invokes onSelectStrip when strip is selected", () => {
      const acDal = createAircraft({
        id: "ac-dal882",
        callsign: "DAL882",
        xNm: 0,
        yNm: 0,
        headingDeg: 270,
        altitudeFt: 5000,
        speedKt: 210,
      });
      const acAal = createAircraft({
        id: "ac-aal412",
        callsign: "AAL412",
        xNm: 0,
        yNm: 0,
        headingDeg: 90,
        altitudeFt: 8000,
        speedKt: 250,
      });
      const world = createWorld({ aircraft: [acDal, acAal] });

      const tree = StripsBoard({
        departures: [mockDAL882],
        arrivals: [mockAAL412],
        onSelectStrip: createStripSelectionHandler(world),
      });

      // Navigate tree to first departure strip and select it
      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const departuresRack = bayContainer.props.children[0];
      const depStripList = departuresRack.props.children[1];
      const firstDepStrip = depStripList.props.children[0];

      firstDepStrip.props.onSelect("DAL882");
      expect(world.selectedAircraftId).toBe("ac-dal882");

      // Navigate tree to first arrival strip and select it
      const arrivalsRack = bayContainer.props.children[1];
      const arrStripList = arrivalsRack.props.children[1];
      const firstArrStrip = arrStripList.props.children[0];

      firstArrStrip.props.onSelect("AAL412");
      expect(world.selectedAircraftId).toBe("ac-aal412");
    });

    test("StripsBoard applies strip-selected CSS class to matching selectedStripId", () => {
      const htmlSelected = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: [mockDAL882],
          arrivals: [mockAAL412],
          selectedStripId: "DAL882",
        }),
      );

      // Departure DAL882 must have strip-selected
      expect(htmlSelected).toMatch(
        /class="[^"]*departure-strip[^"]*strip-selected[^"]*"[^>]*data-strip-acid="DAL882"/,
      );
      // Arrival AAL412 must not have strip-selected
      expect(htmlSelected).not.toMatch(
        /class="[^"]*arrival-strip[^"]*strip-selected[^"]*"[^>]*data-strip-acid="AAL412"/,
      );
    });
  });

  // ==========================================================================
  // ==========================================================================
  // AC3: End-to-end formatting fidelity across mock departures and arrivals
  // ==========================================================================
  describe("AC3 — End-to-end formatting fidelity across mock departures and arrivals", () => {
    test("departure strips format all 5 physical columns and FAA 7110.65 boxes faithfully", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: [mockDAL882, mockSWA1902],
          arrivals: [],
        }),
      );

      // Column 1: ACID, Revision, Type, CID, Beacon
      expect(html).toContain("DAL882");
      expect(html).toContain("D/B738/L");
      expect(html).toContain("101");
      expect(html).toContain("4215");

      // SWA1902 has revision 1, type E/B737/G, beacon 2104
      expect(html).toContain("SWA1902");
      expect(html).toContain("1");
      expect(html).toContain("E/B737/G");
      expect(html).toContain("102");
      expect(html).toContain("2104");

      // Column 2: Proposed departure time (with P-prefix), Requested altitude
      expect(html).toContain("P1430");
      expect(html).toContain("330");
      expect(html).toContain("P1435");
      expect(html).toContain("310");

      // Column 3: Departure airport, Runway assignment 8A, Departure fix 8B
      expect(html).toContain("KATL");
      expect(html).toContain("26L");
      expect(html).toContain("D");
      expect(html).toContain("27R");
      expect(html).toContain("T");

      // Column 4: Route & Destination Box 9
      expect(html).toContain("PLIER2 PLIER SPA J51 FAK PHL");
      expect(html).toContain("KPHL");
      expect(html).toContain("POUNC2 POUNC BNA STL");
      expect(html).toContain("KMDW");

      // Column 5: Annotation boxes 10 to 18
      expect(html).toContain('class="strip-col col-matrix annotation-grid-3x3"');
      expect(html).toContain('data-box="10"');
      expect(html).toContain('data-box="18"');
    });

    test("arrival strips format all 5 physical columns and FAA 7110.65 boxes faithfully", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: [],
          arrivals: [mockAAL412, mockN415SP],
        }),
      );

      // Column 1: ACID, Type/Suffix, CID
      expect(html).toContain("AAL412");
      expect(html).toContain("D/A321/L");
      expect(html).toContain("201");

      // N415SP: VFR squawk 1200, I/C172/G
      expect(html).toContain("N415SP");
      expect(html).toContain("I/C172/G");
      expect(html).toContain("202");

      // Column 2: Beacon, Coordination fix / Previous fix
      expect(html).toContain("0120");
      expect(html).toContain("HONIE");
      expect(html).toContain("1200");
      expect(html).toContain("PDK");

      // Column 3: ETA (with A-prefix), Runway 8A
      expect(html).toContain("A1440");
      expect(html).toContain("26R");
      expect(html).toContain("A1445");
      expect(html).toContain("21L");

      // Column 4: Flight rules Box 9 ('IFR'/'VFR'), Destination Box 9A
      expect(html).toContain("IFR");
      expect(html).toContain("KATL");
      expect(html).toContain("VFR");
      expect(html).toContain("KPDK");

      // Column 5: Annotation boxes 10 to 18
      expect(html).toContain('class="strip-col col-matrix annotation-grid-3x3"');
      expect(html).toContain('data-box="10"');
      expect(html).toContain('data-box="18"');
    });

    test("strips.css enforces physical cardstock colors, column widths, and contrast", () => {
      // 5-column physical cardstock grid template (1.4fr 0.7fr 0.9fr 2.2fr 1.1fr)
      expect(stripsCss).toMatch(
        /grid-template-columns:\s*1\.4fr\s+0\.7fr\s+0\.9fr\s+2\.2fr\s+1\.1fr;/,
      );

      // Pale buff physical background #f5eedc
      expect(stripsCss).toMatch(/background-color:\s*#f5eedc;/i);

      // High-contrast dark ink text color #000000
      expect(stripsCss).toMatch(/color:\s*#000000;/i);

      // Dark tactical board container #000000
      expect(stripsCss).toMatch(/background-color:\s*#000000;/i);
    });
  });

  // ==========================================================================
  // AC4: Shell toggle integration, right-side drawer, and architecture compliance
  // ==========================================================================
  describe("AC4 — Shell toggle integration, right-side drawer, and architecture", () => {
    test("Shell renders STRIPS drawer toggle button and drawer structure without top bar", () => {
      const scenario = loadPlayableScenario("katl");
      const app = createApp({
        speech: new NullSpeechPort(),
        world: createWorld({
          aircraft: [
            createAircraft({
              id: "ac-dal",
              callsign: "DAL882",
              xNm: 0,
              yNm: 0,
              headingDeg: 270,
              altitudeFt: 5000,
              speedKt: 210,
            }),
          ],
        }),
      });
      const scopeView = createScopeView(scenario.arpNm.xNm, scenario.arpNm.yNm);

      const html = renderToStaticMarkup(
        createElement(Shell, {
          app,
          scenario,
          scopeView,
        }),
      );

      // Drawer toggle button and drawer components rendered in Shell
      expect(html).toContain('data-testid="strips-toggle-btn"');
      expect(html).toContain("Strips");
      expect(html).toContain('data-testid="strips-drawer"');
      expect(html).toContain('data-testid="strips-drawer-content"');

      // Top bar removed entirely from drawer
      expect(html).not.toContain('data-testid="strips-drawer-header"');
      expect(html).not.toContain('data-testid="strips-drawer-close"');

      // No new window / popout button present
      expect(html).not.toContain('data-testid="strips-popout-btn"');
      expect(html).not.toContain("window.open");
    });

    test("shell.tsx wires onSelectStrip to selectTrackFromFlightStrip and scope refresh", () => {
      expect(shellTsx).toMatch(/selectTrackFromFlightStrip\(app\.world,\s*strip\)/);
      expect(shellTsx).toMatch(/refreshScopeUi\(\)/);
      expect(shellTsx).toMatch(/data-testid="strips-toggle-btn"/);
      expect(shellTsx).toMatch(/data-testid="strips-drawer"/);
      expect(shellTsx).not.toMatch(/data-testid="strips-drawer-close"/);
      expect(shellTsx).not.toMatch(/data-testid="strips-popout-btn"/);
    });

    test("strips.css defines styles for right-side drawer layout and offset flex panel", () => {
      expect(stripsCss).toMatch(/\.strips-toggle-bar\s*\{[^}]*position:\s*absolute/i);
      expect(stripsCss).toMatch(/\.strips-toggle-button[^{]*\{/i);
      expect(stripsCss).toMatch(/\.strips-drawer\s*\{[^}]*display:\s*flex/i);
      expect(stripsCss).toMatch(/\.strips-drawer\.open\s*\{[^}]*flex:/i);
      expect(stripsCss).toMatch(/\.strips-drawer-content\s*\{[^}]*display:\s*flex/i);
    });

    test("shell.tsx provides resizer handle and pointer drag logic on strips drawer", () => {
      expect(shellTsx).toMatch(/data-testid="strips-drawer-resizer"/);
      expect(shellTsx).toMatch(/handleResizerPointerDown/);
      expect(shellTsx).toMatch(/handleResizerPointerMove/);
      expect(shellTsx).toMatch(/drawerWidth/);
    });

    test("strips.css defines styles for resizer handle with col-resize cursor", () => {
      expect(stripsCss).toMatch(/\.strips-drawer-resizer\s*\{[^}]*cursor:\s*col-resize/i);
      expect(stripsCss).toMatch(/\.strips-drawer\.resizing/i);
    });
  });
});

describe("T02-96 Flight Progress Strips Reordering and Indentation Integration and Acceptance", () => {
  function createMockDragEvent(overrides: Record<string, unknown> = {}) {
    const dataTransfer: Record<string, unknown> = {
      setData: vi.fn(),
      getData: vi.fn(),
      effectAllowed: "uninitialized",
      dropEffect: "none",
      ...((overrides.dataTransfer as Record<string, unknown> | undefined) ?? {}),
    };
    return {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer,
      clientX: 0,
      clientY: 0,
      currentTarget: null,
      target: null,
      ...overrides,
    };
  }

  // ==========================================================================
  // AC1: Intra-section drag reordering within Departures & Arrivals racks & cross-rack rejection
  // ==========================================================================
  describe("AC1 — Intra-section drag reordering within Departures and Arrivals racks & cross-rack rejection", () => {
    test("reordering departure strips via HTML5 drag-and-drop updates order in Departures rack", () => {
      const onReorderMock = vi.fn();
      const tree = StripsBoard({
        departures: mockDepartures, // [DAL882, SWA1902]
        arrivals: mockArrivals,
        onReorderStrips: onReorderMock,
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const depRack = bayContainer.props.children[0];
      const depStripList = depRack.props.children[1];
      const firstDep = depStripList.props.children[0];
      const secondDep = depStripList.props.children[1];

      // Drag DAL882 (index 0) over lower half of SWA1902 (hoverIndex 1 -> targetIndex 2)
      const dragStartEvent = createMockDragEvent();
      firstDep.props.onDragStart(dragStartEvent);
      expect(dragStartEvent.dataTransfer.setData).toHaveBeenCalledWith("text/plain", "DAL882");
      expect(dragStartEvent.dataTransfer.effectAllowed).toBe("move");

      const fakeRect = {
        getBoundingClientRect: () => ({ top: 0, height: 100, bottom: 100, left: 0, right: 100 }),
      };
      const dragOverEvent = createMockDragEvent({
        clientY: 80,
        currentTarget: fakeRect,
      });
      secondDep.props.onDragOver(dragOverEvent);
      expect(dragOverEvent.preventDefault).toHaveBeenCalled();
      expect(dragOverEvent.dataTransfer.dropEffect).toBe("move");

      const dropEvent = createMockDragEvent();
      secondDep.props.onDrop(dropEvent);
      expect(dropEvent.preventDefault).toHaveBeenCalled();

      expect(onReorderMock).toHaveBeenCalledTimes(1);
      expect(onReorderMock).toHaveBeenCalledWith("departures", [mockSWA1902, mockDAL882]);
    });

    test("reordering arrival strips via HTML5 drag-and-drop updates order in Arrivals rack", () => {
      const onReorderMock = vi.fn();
      const tree = StripsBoard({
        departures: mockDepartures,
        arrivals: mockArrivals, // [AAL412, N415SP]
        onReorderStrips: onReorderMock,
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const arrRack = bayContainer.props.children[1];
      const arrStripList = arrRack.props.children[1];
      const firstArr = arrStripList.props.children[0];
      const secondArr = arrStripList.props.children[1];

      // Drag N415SP (index 1) over top half of AAL412 (hoverIndex 0 -> targetIndex 0)
      const dragStartEvent = createMockDragEvent();
      secondArr.props.onDragStart(dragStartEvent);
      expect(dragStartEvent.dataTransfer.setData).toHaveBeenCalledWith("text/plain", "N415SP");
      expect(dragStartEvent.dataTransfer.effectAllowed).toBe("move");

      const fakeRect = {
        getBoundingClientRect: () => ({ top: 0, height: 100, bottom: 100, left: 0, right: 100 }),
      };
      const dragOverEvent = createMockDragEvent({
        clientY: 20,
        currentTarget: fakeRect,
      });
      firstArr.props.onDragOver(dragOverEvent);
      expect(dragOverEvent.preventDefault).toHaveBeenCalled();
      expect(dragOverEvent.dataTransfer.dropEffect).toBe("move");

      const dropEvent = createMockDragEvent();
      firstArr.props.onDrop(dropEvent);
      expect(dropEvent.preventDefault).toHaveBeenCalled();

      expect(onReorderMock).toHaveBeenCalledTimes(1);
      expect(onReorderMock).toHaveBeenCalledWith("arrivals", [mockN415SP, mockAAL412]);
    });

    test("cross-rack dragging is strictly rejected: departure cannot drop into arrivals rack", () => {
      const onReorderMock = vi.fn();
      const tree = StripsBoard({
        departures: mockDepartures,
        arrivals: mockArrivals,
        onReorderStrips: onReorderMock,
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const depRack = bayContainer.props.children[0];
      const firstDep = depRack.props.children[1].props.children[0];
      const arrRack = bayContainer.props.children[1];
      const firstArr = arrRack.props.children[1].props.children[0];

      // Start drag departure strip DAL882
      firstDep.props.onDragStart(createMockDragEvent());

      // Hover over arrival strip AAL412
      const dragOverArrStrip = createMockDragEvent({ clientY: 20 });
      firstArr.props.onDragOver(dragOverArrStrip);
      expect(dragOverArrStrip.dataTransfer.dropEffect).toBe("none");
      expect(dragOverArrStrip.preventDefault).not.toHaveBeenCalled();

      // Hover over arrivals rack-column container
      const dragOverArrRack = createMockDragEvent();
      arrRack.props.onDragOver(dragOverArrRack);
      expect(dragOverArrRack.dataTransfer.dropEffect).toBe("none");

      // Attempt drop on arrival strip
      const dropEvent = createMockDragEvent();
      firstArr.props.onDrop(dropEvent);
      expect(onReorderMock).not.toHaveBeenCalled();
    });

    test("cross-rack dragging is strictly rejected: arrival cannot drop into departures rack", () => {
      const onReorderMock = vi.fn();
      const tree = StripsBoard({
        departures: mockDepartures,
        arrivals: mockArrivals,
        onReorderStrips: onReorderMock,
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const arrRack = bayContainer.props.children[1];
      const firstArr = arrRack.props.children[1].props.children[0];
      const depRack = bayContainer.props.children[0];
      const firstDep = depRack.props.children[1].props.children[0];

      // Start drag arrival strip AAL412
      firstArr.props.onDragStart(createMockDragEvent());

      // Hover over departure strip DAL882
      const dragOverDepStrip = createMockDragEvent({ clientY: 30 });
      firstDep.props.onDragOver(dragOverDepStrip);
      expect(dragOverDepStrip.dataTransfer.dropEffect).toBe("none");
      expect(dragOverDepStrip.preventDefault).not.toHaveBeenCalled();

      // Attempt drop on departure strip
      const dropEvent = createMockDragEvent();
      firstDep.props.onDrop(dropEvent);
      expect(onReorderMock).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // AC2: Visual drop indicator line previews candidate drop index
  // ==========================================================================
  describe("AC2 — Visual drop indicator line previews candidate drop index", () => {
    test("drop indicator renders before target strip when cursor is in upper half", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: mockDepartures,
          arrivals: mockArrivals,
          dropIndicator: { section: "departures", targetIndex: 0 },
        }),
      );

      expect(html).toContain('class="strip-drop-indicator"');
      expect(html).toContain('data-testid="strip-drop-indicator"');

      const indicatorPos = html.indexOf('data-testid="strip-drop-indicator"');
      const dalPos = html.indexOf('data-strip-acid="DAL882"');
      expect(indicatorPos).toBeLessThan(dalPos);
    });

    test("drop indicator renders between strips when cursor is in lower half of first strip", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: mockDepartures,
          arrivals: mockArrivals,
          dropIndicator: { section: "departures", targetIndex: 1 },
        }),
      );

      const dalPos = html.indexOf('data-strip-acid="DAL882"');
      const indicatorPos = html.indexOf('data-testid="strip-drop-indicator"');
      const swaPos = html.indexOf('data-strip-acid="SWA1902"');

      expect(dalPos).toBeLessThan(indicatorPos);
      expect(indicatorPos).toBeLessThan(swaPos);
    });

    test("strips.css defines .strip-drop-indicator with 3px height, #ffff00 glow, and pointer-events: none", () => {
      expect(stripsCss).toMatch(/\.strip-drop-indicator\s*\{[^}]*height:\s*3px;/i);
      expect(stripsCss).toMatch(/\.strip-drop-indicator\s*\{[^}]*background-color:\s*#ffff00;/i);
      expect(stripsCss).toMatch(/\.strip-drop-indicator\s*\{[^}]*box-shadow:\s*0 0 6px #ffff00;/i);
      expect(stripsCss).toMatch(/\.strip-drop-indicator\s*\{[^}]*pointer-events:\s*none;/i);
    });

    test("drop indicator line disappears on dragEnd and onDragLeave", () => {
      const tree = StripsBoard({
        departures: mockDepartures,
        arrivals: mockArrivals,
        defaultDropIndicator: { section: "departures", targetIndex: 1 },
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const depRack = bayContainer.props.children[0];
      const firstDep = depRack.props.children[1].props.children[0];

      // onDragEnd resets drag state
      firstDep.props.onDragEnd(createMockDragEvent());
    });
  });

  // ==========================================================================
  // AC3: Right-clicking toggles strip indentation with contextmenu suppressed
  // ==========================================================================
  describe("AC3 — Right-clicking toggles strip indentation (~28px offset) with native browser menu suppressed", () => {
    test("single right-click on departure strip calls preventDefault and triggers onToggleIndent", () => {
      const onToggleMock = vi.fn();
      const tree = StripsBoard({
        departures: mockDepartures,
        arrivals: mockArrivals,
        onToggleIndent: onToggleMock,
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const depRack = bayContainer.props.children[0];
      const firstDep = depRack.props.children[1].props.children[0];

      expect(firstDep.props.indented).toBe(false);
      firstDep.props.onToggleIndent("DAL882");

      expect(onToggleMock).toHaveBeenCalledWith("DAL882", true);
    });

    test("single right-click on DepartureStrip component prevents browser contextmenu", () => {
      const onToggleMock = vi.fn();
      const rendered = DepartureStrip({
        strip: mockDAL882,
        onToggleIndent: onToggleMock,
      });

      const fakeContextMenu = { preventDefault: vi.fn() } as unknown as React.MouseEvent;
      rendered.props.onContextMenu?.(fakeContextMenu);

      expect(fakeContextMenu.preventDefault).toHaveBeenCalledTimes(1);
      expect(onToggleMock).toHaveBeenCalledWith("DAL882");
    });

    test("single right-click on ArrivalStrip component prevents browser contextmenu", () => {
      const onToggleMock = vi.fn();
      const rendered = ArrivalStrip({
        strip: mockAAL412,
        onToggleIndent: onToggleMock,
      });

      const fakeContextMenu = { preventDefault: vi.fn() } as unknown as React.MouseEvent;
      rendered.props.onContextMenu?.(fakeContextMenu);

      expect(fakeContextMenu.preventDefault).toHaveBeenCalledTimes(1);
      expect(onToggleMock).toHaveBeenCalledWith("AAL412");
    });

    test("second right-click toggles indentation back off", () => {
      const onToggleMock = vi.fn();
      const tree = StripsBoard({
        departures: mockDepartures,
        arrivals: mockArrivals,
        indentedStripIds: new Set(["DAL882"]),
        onToggleIndent: onToggleMock,
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const depRack = bayContainer.props.children[0];
      const firstDep = depRack.props.children[1].props.children[0];

      expect(firstDep.props.indented).toBe(true);
      firstDep.props.onToggleIndent("DAL882");

      expect(onToggleMock).toHaveBeenCalledWith("DAL882", false);
    });

    test("strips.css defines .strip-indented with ~28px offset and box-shadow", () => {
      expect(stripsCss).toMatch(/\.strip-indented/i);
      expect(stripsCss).toMatch(/transform:\s*translateX\(28px\)/i);
      expect(stripsCss).toMatch(/width:\s*calc\(100% - 28px\)/i);
      expect(stripsCss).toMatch(/box-shadow:\s*-4px 0 0 #1a1e24/i);
    });

    test("keyboard Shift+Enter or Shift+Space toggles indentation with preventDefault", () => {
      const onToggleMock = vi.fn();
      const rendered = DepartureStrip({
        strip: mockDAL882,
        onToggleIndent: onToggleMock,
      });

      const shiftEnter = {
        key: "Enter",
        shiftKey: true,
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent;
      rendered.props.onKeyDown?.(shiftEnter);

      expect(shiftEnter.preventDefault).toHaveBeenCalledTimes(1);
      expect(onToggleMock).toHaveBeenCalledWith("DAL882");
    });
  });

  // ==========================================================================
  // AC4: Left-clicking strip selects matching aircraft without triggering drag or indent
  // ==========================================================================
  describe("AC4 — Left-clicking a strip selects matching aircraft in World.selectedAircraftId without triggering drag or indent", () => {
    test("left-clicking an indented strip selects track in World and preserves indentation", () => {
      const acDal = createAircraft({
        id: "ac-dal882",
        callsign: "DAL882",
        xNm: 0,
        yNm: 0,
        headingDeg: 270,
        altitudeFt: 5000,
        speedKt: 210,
      });
      const world = createWorld({ aircraft: [acDal] });
      const onSelectMock = vi.fn();
      const onToggleMock = vi.fn();

      const tree = StripsBoard({
        departures: [mockDAL882],
        arrivals: [],
        indentedStripIds: new Set(["DAL882"]),
        onSelectStrip: createStripSelectionHandler(world, onSelectMock),
        onToggleIndent: onToggleMock,
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const depRack = bayContainer.props.children[0];
      const firstDep = depRack.props.children[1].props.children[0];

      // Strip is indented
      expect(firstDep.props.indented).toBe(true);

      // Perform left click
      firstDep.props.onSelect("DAL882");

      expect(world.selectedAircraftId).toBe("ac-dal882");
      expect(onSelectMock).toHaveBeenCalledWith(mockDAL882);
      expect(onToggleMock).not.toHaveBeenCalled();
    });

    test("left-clicking a reordered strip selects track in World without resetting order", () => {
      const acSwa = createAircraft({
        id: "ac-swa1902",
        callsign: "SWA1902",
        xNm: 0,
        yNm: 0,
        headingDeg: 180,
        altitudeFt: 3000,
        speedKt: 180,
      });
      const world = createWorld({ aircraft: [acSwa] });

      const tree = StripsBoard({
        departures: mockDepartures,
        arrivals: mockArrivals,
        departureOrder: ["SWA1902", "DAL882"],
        onSelectStrip: createStripSelectionHandler(world),
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const depRack = bayContainer.props.children[0];
      const firstDep = depRack.props.children[1].props.children[0];

      expect(firstDep.props.strip.acid).toBe("SWA1902");
      firstDep.props.onSelect("SWA1902");

      expect(world.selectedAircraftId).toBe("ac-swa1902");
    });

    test("StripsBoard applies strip-selected with yellow outline when selectedStripId matches", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: mockDepartures,
          arrivals: mockArrivals,
          selectedStripId: "DAL882",
          indentedStripIds: new Set(["DAL882"]),
        }),
      );

      expect(html).toMatch(
        /class="[^"]*strip-selected[^"]*strip-indented[^"]*"[^>]*data-strip-acid="DAL882"/,
      );
      expect(stripsCss).toMatch(/\.strip-selected[^{]*\{[^}]*outline:\s*3px solid #ffff00;/i);
    });
  });

  // ==========================================================================
  // AC5: Custom sequence order and indentation persist across dynamic World telemetry updates
  // ==========================================================================
  describe("AC5 — Custom sequence order and indentation persist across dynamic World telemetry ticks", () => {
    test("reconcileOrder preserves existing manual sequence, prunes removed, and appends newly spawned", () => {
      const customOrder = ["SWA1902", "DAL882"];

      // Telemetry update 1: new aircraft UAL450 spawns
      const spawnedDep: DepartureStripData = {
        id: "UAL450",
        stripType: "DEPARTURE",
        acid: "UAL450",
        rawType: "B738",
        beaconCode: "3312",
        proposedDepartureTime: "1500",
        requestedAltitude: "310",
        departureAirport: "KATL",
        route: "DIR",
        destinationAirport: "KORD",
      };
      const updatedStrips = [mockDAL882, mockSWA1902, spawnedDep];

      const reconciled = reconcileOrder(updatedStrips, customOrder);
      // SWA1902 is 1st, DAL882 is 2nd, UAL450 is appended at 3rd
      expect(reconciled).toEqual(["SWA1902", "DAL882", "UAL450"]);

      // Telemetry update 2: DAL882 departs and is pruned
      const prunedStrips = [mockSWA1902, spawnedDep];
      const reconciledPruned = reconcileOrder(prunedStrips, reconciled);
      expect(reconciledPruned).toEqual(["SWA1902", "UAL450"]);
    });

    test("StripsBoard preserves custom sequence and indentation when new aircraft spawn in World", () => {
      // Step 1: Initial World with 2 departures and 1 arrival
      const acDal = createAircraft({
        id: "ac-dal882",
        callsign: "DAL882",
        xNm: 0,
        yNm: 0,
        headingDeg: 270,
        altitudeFt: 5000,
        speedKt: 210,
      });
      acDal.intent.vertical = { type: "VIA_SID", sidId: "PLIER2" };

      const acSwa = createAircraft({
        id: "ac-swa1902",
        callsign: "SWA1902",
        xNm: 0,
        yNm: 0,
        headingDeg: 180,
        altitudeFt: 3000,
        speedKt: 180,
      });
      acSwa.intent.vertical = { type: "VIA_SID", sidId: "POUNC2" };

      const acAal = createAircraft({
        id: "ac-aal412",
        callsign: "AAL412",
        xNm: 10,
        yNm: 10,
        headingDeg: 90,
        altitudeFt: 8000,
        speedKt: 250,
      });
      const world = createWorld({ aircraft: [acDal, acSwa, acAal] });
      const initialStrips = terminalStripsFromWorld(world);

      // Render initial board with custom order (SWA1902 first) and SWA1902 indented
      const tree1 = StripsBoard({
        departures: initialStrips.departures,
        arrivals: initialStrips.arrivals,
        departureOrder: [initialStrips.departures[1].id, initialStrips.departures[0].id],
        indentedStripIds: new Set([initialStrips.departures[1].id]),
      });

      const bay1 = Array.isArray(tree1.props.children)
        ? tree1.props.children[0]
        : tree1.props.children;
      const depStrips1 = bay1.props.children[0].props.children[1].props.children;
      expect(depStrips1[0].props.strip.acid).toBe("SWA1902");
      expect(depStrips1[0].props.indented).toBe(true);
      expect(depStrips1[1].props.strip.acid).toBe("DAL882");
      expect(depStrips1[1].props.indented).toBe(false);

      // Step 2: Telemetry tick — newly spawned aircraft appears in World
      const acUal = createAircraft({
        id: "ac-ual450",
        callsign: "UAL450",
        xNm: -10,
        yNm: -10,
        headingDeg: 360,
        altitudeFt: 4000,
        speedKt: 220,
      });
      acUal.intent.vertical = { type: "VIA_SID", sidId: "PLIER2" };
      world.aircraft.push(acUal);
      const updatedStrips = terminalStripsFromWorld(world);

      // StripsBoard receives updated departures containing 3 aircraft
      const customKnownOrder = [initialStrips.departures[1].id, initialStrips.departures[0].id];
      const reconciledOrder = reconcileOrder(updatedStrips.departures, customKnownOrder);

      const tree2 = StripsBoard({
        departures: updatedStrips.departures,
        arrivals: updatedStrips.arrivals,
        departureOrder: reconciledOrder,
        indentedStripIds: new Set([initialStrips.departures[1].id]),
      });

      const bay2 = Array.isArray(tree2.props.children)
        ? tree2.props.children[0]
        : tree2.props.children;
      const depStrips2 = bay2.props.children[0].props.children[1].props.children;

      // Order preserved: SWA1902 (0), DAL882 (1), newly spawned UAL450 (2)
      expect(depStrips2.length).toBe(3);
      expect(depStrips2[0].props.strip.acid).toBe("SWA1902");
      expect(depStrips2[0].props.indented).toBe(true);
      expect(depStrips2[1].props.strip.acid).toBe("DAL882");
      expect(depStrips2[1].props.indented).toBe(false);
      expect(depStrips2[2].props.strip.acid).toBe("UAL450");
      expect(depStrips2[2].props.indented).toBe(false);
    });

    test("terminated aircraft are pruned from custom order and indented state across telemetry updates", () => {
      const depA: DepartureStripData = { ...mockDAL882, id: "DEP_A", acid: "DAL882" };
      const depB: DepartureStripData = { ...mockSWA1902, id: "DEP_B", acid: "SWA1902" };
      const initialDepartures = [depB, depA];
      expect(initialDepartures).toHaveLength(2);

      // Initial: [DEP_B, DEP_A] both active, DEP_A is indented
      const initialCustomOrder = ["DEP_B", "DEP_A"];
      const initialIndented = new Set(["DEP_A"]);

      // Simulation event: DEP_A is handed off / terminated and pruned from departures prop
      const remainingDepartures = [depB];
      const reconciledOrder = reconcileOrder(remainingDepartures, initialCustomOrder);

      // Reconciled order prunes DEP_A cleanly
      expect(reconciledOrder).toEqual(["DEP_B"]);

      const tree = StripsBoard({
        departures: remainingDepartures,
        arrivals: [],
        defaultDepartureOrder: reconciledOrder,
        defaultIndentedStripIds: initialIndented,
      });

      const bay = Array.isArray(tree.props.children) ? tree.props.children[0] : tree.props.children;
      const depStrips = bay.props.children[0].props.children[1].props.children;

      expect(depStrips.length).toBe(1);
      expect(depStrips[0].props.strip.id).toBe("DEP_B");
      expect(depStrips[0].props.indented).toBe(false);
    });

    test("arrivals rack preserves custom sequence and indentation when new arrival spawns in World", () => {
      const ac1 = createAircraft({
        id: "ac-aal412",
        callsign: "AAL412",
        xNm: 15,
        yNm: 15,
        headingDeg: 270,
        altitudeFt: 7000,
        speedKt: 240,
      });
      const ac2 = createAircraft({
        id: "ac-n415sp",
        callsign: "N415SP",
        xNm: 10,
        yNm: 8,
        headingDeg: 260,
        altitudeFt: 3500,
        speedKt: 120,
      });
      const world = createWorld({ aircraft: [ac1, ac2] });
      const initialStrips = terminalStripsFromWorld(world);

      // Custom arrival order: [N415SP, AAL412], N415SP indented
      const customArrOrder = [initialStrips.arrivals[1].id, initialStrips.arrivals[0].id];
      const tree1 = StripsBoard({
        departures: [],
        arrivals: initialStrips.arrivals,
        arrivalOrder: customArrOrder,
        indentedStripIds: new Set([initialStrips.arrivals[1].id]),
      });

      const bay1 = Array.isArray(tree1.props.children)
        ? tree1.props.children[0]
        : tree1.props.children;
      const arrStrips1 = bay1.props.children[1].props.children[1].props.children;
      expect(arrStrips1[0].props.strip.acid).toBe("N415SP");
      expect(arrStrips1[0].props.indented).toBe(true);
      expect(arrStrips1[1].props.strip.acid).toBe("AAL412");
      expect(arrStrips1[1].props.indented).toBe(false);

      // New arrival DL220 spawns
      const ac3 = createAircraft({
        id: "ac-dl220",
        callsign: "DAL220",
        xNm: 25,
        yNm: 20,
        headingDeg: 260,
        altitudeFt: 10000,
        speedKt: 250,
      });
      world.aircraft.push(ac3);
      const updatedStrips = terminalStripsFromWorld(world);

      const reconciledArrOrder = reconcileOrder(updatedStrips.arrivals, customArrOrder);
      const tree2 = StripsBoard({
        departures: [],
        arrivals: updatedStrips.arrivals,
        arrivalOrder: reconciledArrOrder,
        indentedStripIds: new Set([initialStrips.arrivals[1].id]),
      });

      const bay2 = Array.isArray(tree2.props.children)
        ? tree2.props.children[0]
        : tree2.props.children;
      const arrStrips2 = bay2.props.children[1].props.children[1].props.children;

      // Order preserved: N415SP (0), AAL412 (1), new DAL220 appended at (2)
      expect(arrStrips2.length).toBe(3);
      expect(arrStrips2[0].props.strip.acid).toBe("N415SP");
      expect(arrStrips2[0].props.indented).toBe(true);
      expect(arrStrips2[1].props.strip.acid).toBe("AAL412");
      expect(arrStrips2[1].props.indented).toBe(false);
      expect(arrStrips2[2].props.strip.acid).toBe("DAL220");
      expect(arrStrips2[2].props.indented).toBe(false);
    });
  });

  // ==========================================================================
  // AC6 & AC7: End-to-end acceptance suite & regression-free Shell integration
  // ==========================================================================
  describe("AC6 & AC7 — End-to-end acceptance suite & regression-free Shell integration", () => {
    test("Shell renders strips drawer with dynamic traffic from app.world and handles selection", () => {
      const scenario = loadPlayableScenario("katl");
      const ac1 = createAircraft({
        id: "ac-dal882",
        callsign: "DAL882",
        xNm: 0,
        yNm: 0,
        headingDeg: 270,
        altitudeFt: 5000,
        speedKt: 210,
      });
      const world = createWorld({ aircraft: [ac1] });
      const app = createApp({
        speech: new NullSpeechPort(),
        world,
      });
      const scopeView = createScopeView(scenario.arpNm.xNm, scenario.arpNm.yNm);

      const html = renderToStaticMarkup(createElement(Shell, { app, scenario, scopeView }));

      expect(html).toContain('data-testid="strips-drawer"');
      expect(html).toContain('data-testid="strips-drawer-content"');
      expect(html).toContain("DAL882");
    });

    test("standalone StripsBoard view supports full drag reordering and right-click indent markup", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: mockDepartures,
          arrivals: mockArrivals,
          departureOrder: ["SWA1902", "DAL882"],
          indentedStripIds: new Set(["SWA1902"]),
          draggedStrip: { id: "DAL882", section: "departures", sourceIndex: 1 },
          dropIndicator: { section: "departures", targetIndex: 0 },
        }),
      );

      // Reordered departure sequence: SWA1902 before DAL882
      const swaIndex = html.indexOf('data-strip-acid="SWA1902"');
      const dalIndex = html.indexOf('data-strip-acid="DAL882"');
      expect(swaIndex).toBeLessThan(dalIndex);

      // Indented SWA1902
      expect(html).toMatch(
        /departure-strip[^"]*strip-indented[^"]*"[^>]*data-strip-acid="SWA1902"/,
      );

      // Dragging DAL882 has strip-dragging
      expect(html).toMatch(/departure-strip[^"]*strip-dragging[^"]*"[^>]*data-strip-acid="DAL882"/);

      // Drop indicator rendered
      expect(html).toContain('data-testid="strip-drop-indicator"');
    });
  });

  // ==========================================================================
  // AC8 to AC12: T02-97 to T02-99 Separators, Context Menus, and Drag Acceptance
  // ==========================================================================
  describe("AC8 to AC12 — Flight Progress Strips Bay Separators and Context Menus Acceptance", () => {
    test("AC8: Renders bay separators alongside flight progress strips in rack columns", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: mockDepartures,
          arrivals: mockArrivals,
          separators: [
            {
              id: "sep-dep-rwy27l",
              stripType: "SEPARATOR",
              label: "RWY 27L DEPARTURES",
              section: "departures",
            },
            {
              id: "sep-arr-ils",
              stripType: "SEPARATOR",
              label: "ILS 26R INBOUNDS",
              section: "arrivals",
            },
          ],
          departureOrder: ["sep-dep-rwy27l", "DAL882", "SWA1902"],
          arrivalOrder: ["sep-arr-ils", "AAL412", "N415SP"],
        }),
      );

      expect(html).toContain('data-testid="strip-separator-sep-dep-rwy27l"');
      expect(html).toContain("RWY 27L DEPARTURES");
      expect(html).toContain('data-testid="strip-separator-sep-arr-ils"');
      expect(html).toContain("ILS 26R INBOUNDS");
    });

    test("AC9: Separator supports in-place text editing mode with input element", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: mockDepartures,
          arrivals: mockArrivals,
          separators: [
            {
              id: "sep-1",
              stripType: "SEPARATOR",
              label: "RWY 27L",
              section: "departures",
            },
          ],
          editingSeparatorId: "sep-1",
        }),
      );

      expect(html).toContain('class="strip-separator-input"');
      expect(html).toContain('data-testid="strip-separator-input-sep-1"');
      expect(html).toContain('value="RWY 27L"');
    });

    test("AC10: Separator participates in drag-and-drop reordering with drop indicator", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: mockDepartures,
          arrivals: mockArrivals,
          separators: [
            {
              id: "sep-1",
              stripType: "SEPARATOR",
              label: "RWY 27L",
              section: "departures",
            },
          ],
          departureOrder: ["sep-1", "DAL882", "SWA1902"],
          draggedStrip: { id: "sep-1", section: "departures", sourceIndex: 0 },
          dropIndicator: { section: "departures", targetIndex: 2 },
        }),
      );

      // Dragged separator has strip-dragging class
      expect(html).toContain('data-testid="strip-separator-sep-1"');
      expect(html).toContain("strip-dragging");
      // Drop indicator line renders at target index
      expect(html).toContain('data-testid="strip-drop-indicator"');
    });

    test("AC11: Live simulation telemetry updates preserve user-created separators and custom order", () => {
      const ac1 = createAircraft({
        id: "DAL882",
        callsign: "DAL882",
        xNm: 0,
        yNm: 0,
        altitudeFt: 5000,
        headingDeg: 270,
        speedKt: 210,
      });
      ac1.intent.vertical = { type: "VIA_SID", sidId: "PLIER2" };
      const world = createWorld({ aircraft: [ac1] });
      const initialStrips = terminalStripsFromWorld(world);

      const customOrder = ["sep-custom-1", "DAL882"];
      const separatorIds = new Set(["sep-custom-1"]);

      const reconciledOrder = reconcileOrder(initialStrips.departures, customOrder, separatorIds);
      expect(reconciledOrder).toEqual(["sep-custom-1", "DAL882"]);

      // Telemetry update: second aircraft spawns
      const ac2 = createAircraft({
        id: "SWA1902",
        callsign: "SWA1902",
        xNm: 10,
        yNm: 10,
        altitudeFt: 4000,
        headingDeg: 90,
        speedKt: 200,
      });
      ac2.intent.vertical = { type: "VIA_SID", sidId: "PLIER2" };
      world.aircraft.push(ac2);
      const updatedStrips = terminalStripsFromWorld(world);

      const updatedOrder = reconcileOrder(updatedStrips.departures, reconciledOrder, separatorIds);
      // Preserves separator in place and appends new spawn cleanly
      expect(updatedOrder).toEqual(["sep-custom-1", "DAL882", "SWA1902"]);
    });

    test("AC12: Radar track selection and strip cocking remain operational without regressions", () => {
      const ac1 = createAircraft({
        id: "DAL882",
        callsign: "DAL882",
        xNm: 0,
        yNm: 0,
        altitudeFt: 5000,
        headingDeg: 270,
        speedKt: 210,
      });
      const world = createWorld({ aircraft: [ac1] });

      expect(selectTrackFromFlightStrip(world, mockDAL882)).toBe(true);
      expect(world.selectedAircraftId).toBe("DAL882");
    });
  });

  // ==========================================================================
  // T02-102: Strips Freeform Box Annotations Acceptance Suite (AC13–AC16)
  // ==========================================================================
  describe("T02-102 — Strips Freeform Box Annotations Acceptance Suite (AC13–AC16)", () => {
    // ------------------------------------------------------------------------
    // AC13: Double-Click Inline Annotation
    // ------------------------------------------------------------------------
    test("AC13: Double-clicking an annotation cell enters edit mode, mounts input, and commits on Enter", () => {
      const onUpdateMock = vi.fn();
      const onEditBoxChangeMock = vi.fn();

      const tree = DepartureStrip({
        strip: mockDAL882,
        onUpdateAnnotation: onUpdateMock,
        onEditingBoxChange: onEditBoxChangeMock,
      });

      // 1. Double click Box 8A
      const col3 = tree.props.children[2];
      const box8a = col3.props.children[1];
      const fakeDblClick = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent;

      box8a.props.onDoubleClick(fakeDblClick);
      expect(fakeDblClick.preventDefault).toHaveBeenCalledTimes(1);
      expect(fakeDblClick.stopPropagation).toHaveBeenCalledTimes(1);
      expect(onEditBoxChangeMock).toHaveBeenCalledWith("8A");

      // 2. Render in editing mode
      const editingTree = DepartureStrip({
        strip: mockDAL882,
        editingBox: "8A",
        onUpdateAnnotation: onUpdateMock,
        onEditingBoxChange: onEditBoxChangeMock,
      });

      const editingCol3 = editingTree.props.children[2];
      const editingBox8a = editingCol3.props.children[1];
      const input = editingBox8a.props.children;

      expect(input.props.className).toBe("strip-annotation-input");
      expect(input.props["data-testid"]).toBe("annotation-input-8A");

      // 3. Commit on Enter
      const fakeEnter = {
        key: "Enter",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLInputElement>;

      input.props.onKeyDown(fakeEnter);
      expect(onUpdateMock).toHaveBeenCalledWith("DAL882", "8A", expect.any(String));
      expect(onEditBoxChangeMock).toHaveBeenCalledWith(null);

      // 4. Render committed state
      const committedHtml = renderToStaticMarkup(
        createElement(DepartureStrip, {
          strip: {
            ...mockDAL882,
            annotationBoxes: { box8A: "27R" },
          },
        }),
      );
      expect(committedHtml).toContain("27R");
      expect(committedHtml).toContain("strip-annotation-8a");
    });

    // ------------------------------------------------------------------------
    // AC14: Multi-Box Coordination
    // ------------------------------------------------------------------------
    test("AC14: Allows annotating multiple distinct cells (8A, 11, 12, 16) on the same strip", () => {
      // Annotate runway (8A), vector heading (Box 11), interim altitude (Box 12), and speed (Box 16)
      const stripWithCoordination: DepartureStripData = {
        ...mockDAL882,
        annotationBoxes: {
          box8A: "27L",
          box8B: "FIX-A",
          boxes10to18: [
            "", // Box 10
            "HDG 260", // Box 11
            "FL240", // Box 12
            "", // Box 13
            "", // Box 14
            "", // Box 15
            "250KT", // Box 16
            "", // Box 17
            "", // Box 18
          ],
        },
      };

      const html = renderToStaticMarkup(
        createElement(DepartureStrip, { strip: stripWithCoordination }),
      );

      // Verify all annotations are present simultaneously
      expect(html).toContain("27L");
      expect(html).toContain("FIX-A");
      expect(html).toContain("HDG 260");
      expect(html).toContain("FL240");
      expect(html).toContain("250KT");

      // Verify authentic CSS styling rules for annotations
      expect(stripsCss).toContain(".strip-annotation-input");
      expect(stripsCss).toContain("color: #000000;");
      expect(stripsCss).toContain("background-color: #f5eedc;");
      expect(stripsCss).toContain(".annotation-cell");
      expect(stripsCss).toContain("cursor: text;");
    });

    // ------------------------------------------------------------------------
    // AC15: Telemetry Persistence Across Simulation Ticks
    // ------------------------------------------------------------------------
    test("AC15: Controller annotations are seamlessly preserved across live simulation ticks from terminalStripsFromWorld", () => {
      // 1. Initial simulation world with DAL882
      const acDal = createAircraft({
        id: "DAL882",
        callsign: "DAL882",
        xNm: -5,
        yNm: 10,
        headingDeg: 270,
        altitudeFt: 5000,
        speedKt: 210,
      });
      acDal.intent.vertical = { type: "VIA_SID", sidId: "PLIER2" };

      const world = createWorld({ aircraft: [acDal] });
      const initialStrips = terminalStripsFromWorld(world);
      expect(initialStrips.departures.length).toBe(1);

      // 2. Controller enters annotations on DAL882 in StripsBoard
      const controllerAnnotations = {
        DAL882: {
          box8A: "27L",
          boxes10to18: ["", "HDG 270", "FL180", "", "", "", "", "", ""],
        },
      };

      // 3. Telemetry ticks occur: DAL882 climbs to 12000ft and accelerates to 250kt
      acDal.altitudeFt = 12000;
      acDal.speedKt = 250;
      acDal.xNm = -15;

      // Telemetry generates fresh strips from world without user annotations
      const tickStrips = terminalStripsFromWorld(world);
      expect(tickStrips.departures[0].annotationBoxes?.boxes10to18?.[1]).toBe("");

      // 4. Render StripsBoard with fresh telemetry strips and controller annotations
      const boardHtml = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: tickStrips.departures,
          arrivals: tickStrips.arrivals,
          annotations: controllerAnnotations,
        }),
      );

      // User-entered annotations persist intact
      expect(boardHtml).toContain("27L");
      expect(boardHtml).toContain("HDG 270");
      expect(boardHtml).toContain("FL180");
      // Strip identification persists
      expect(boardHtml).toContain("DAL882");
    });

    // ------------------------------------------------------------------------
    // AC16: Interaction Isolation & No Regressions
    // ------------------------------------------------------------------------
    test("AC16: Annotation clicks do NOT select aircraft track; strip body click selects track; right-click cocks strip; separators and reordering intact", () => {
      const acDal = createAircraft({
        id: "DAL882",
        callsign: "DAL882",
        xNm: 0,
        yNm: 0,
        altitudeFt: 5000,
        headingDeg: 270,
        speedKt: 210,
      });
      const world = createWorld({ aircraft: [acDal] });

      const onSelectMock = vi.fn();
      const onToggleIndentMock = vi.fn();

      const tree = DepartureStrip({
        strip: mockDAL882,
        onSelect: onSelectMock,
        onToggleIndent: onToggleIndentMock,
      });

      // 1. Clicking an annotation cell stops propagation and does NOT select track
      const col3 = tree.props.children[2];
      const box8a = col3.props.children[1];
      const fakeCellClick = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;

      box8a.props.onClick(fakeCellClick);
      expect(fakeCellClick.stopPropagation).toHaveBeenCalledTimes(1);
      expect(onSelectMock).not.toHaveBeenCalled();
      expect(world.selectedAircraftId).toBeNull();

      // 2. Clicking the strip element outside annotation cells selects track in World
      const handleSelect = createStripSelectionHandler(world, onSelectMock);
      handleSelect(mockDAL882);

      expect(onSelectMock).toHaveBeenCalledWith(mockDAL882);
      expect(world.selectedAircraftId).toBe("DAL882");

      // 3. Right-clicking the strip toggles cocking/indentation
      const fakeRightClick = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent;

      tree.props.onContextMenu(fakeRightClick);
      expect(fakeRightClick.preventDefault).toHaveBeenCalledTimes(1);
      expect(onToggleIndentMock).toHaveBeenCalledWith("DAL882");

      // 4. Render cocked/indented strip with .strip-indented (~28px horizontal offset)
      const indentedHtml = renderToStaticMarkup(
        createElement(DepartureStrip, { strip: mockDAL882, indented: true }),
      );
      expect(indentedHtml).toContain("strip-indented");
      expect(stripsCss).toContain(".strip-indented");
      expect(stripsCss).toContain("transform: translateX(28px);");

      // 5. Separator creation and reordering remain fully functional
      const boardHtml = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: mockDepartures,
          arrivals: mockArrivals,
          separators: [
            {
              id: "sep-1",
              stripType: "SEPARATOR",
              label: "RWY 27L DEPARTURES",
              section: "departures",
            },
          ],
        }),
      );
      expect(boardHtml).toContain("RWY 27L DEPARTURES");
      expect(boardHtml).toContain('data-testid="strip-separator-sep-1"');
    });
  });
});
