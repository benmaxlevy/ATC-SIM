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
  StripsBoard,
  createStripSelectionHandler,
  mockAAL412,
  mockArrivals,
  mockDAL882,
  mockDepartures,
  mockN415SP,
  mockSWA1902,
  selectTrackFromFlightStrip,
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
