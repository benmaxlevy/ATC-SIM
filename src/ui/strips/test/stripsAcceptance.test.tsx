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
  isStripsViewActive,
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
  // AC1: Loading with ?view=strips renders the StripsBoard component in #root
  // ==========================================================================
  describe("AC1 — Loading with ?view=strips renders StripsBoard in #root", () => {
    test("isStripsViewActive correctly detects view=strips in search queries", () => {
      expect(isStripsViewActive("?view=strips")).toBe(true);
      expect(isStripsViewActive("?scenario=katl&view=strips")).toBe(true);
      expect(isStripsViewActive("?view=strips&seed=42")).toBe(true);
      expect(isStripsViewActive("?traffic=20&view=strips&scenario=kdem")).toBe(true);

      // Non-matching queries
      expect(isStripsViewActive("")).toBe(false);
      expect(isStripsViewActive("?scenario=katl")).toBe(false);
      expect(isStripsViewActive("?view=radar")).toBe(false);
      expect(isStripsViewActive("?strips=true")).toBe(false);
      expect(isStripsViewActive("?view=strip")).toBe(false);
    });

    test("StripsBoard renders the complete board interface with header, racks, and default fixture", () => {
      const html = renderToStaticMarkup(createElement(StripsBoard));

      // Root board element and header
      expect(html).toContain('class="strips-board"');
      expect(html).toContain('data-testid="strips-board"');
      expect(html).toContain('data-testid="board-header"');
      expect(html).toContain(DEFAULT_FACILITY_TITLE);

      // Two-column rack bay container
      expect(html).toContain('data-testid="bay-container"');
      expect(html).toContain('data-testid="rack-departures"');
      expect(html).toContain('data-testid="rack-arrivals"');

      // Default mock strips present
      expect(html).toContain("DAL882");
      expect(html).toContain("SWA1902");
      expect(html).toContain("AAL412");
      expect(html).toContain("N415SP");

      // Badge counts match fixtures
      expect(html).toContain(
        `data-testid="departures-count" aria-label="${mockDepartures.length} departures">${mockDepartures.length}</span>`,
      );
      expect(html).toContain(
        `data-testid="arrivals-count" aria-label="${mockArrivals.length} arrivals">${mockArrivals.length}</span>`,
      );
    });

    test("src/main.tsx verifies ?view=strips routing and direct #root render of StripsBoard", () => {
      expect(mainTsx).toMatch(/isStripsViewActive\(search\)/);
      expect(mainTsx).toMatch(
        /createRoot\(root\)\.render\(\s*<StrictMode>\s*<StripsBoard \/>\s*<\/StrictMode>/,
      );
      expect(mainTsx).toMatch(/document\.title\s*=\s*["']ATC-SIM — Flight Progress Strips["']/);
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
      const bayContainer = tree.props.children[1];
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
  // AC3: End-to-end formatting fidelity across mock departures and arrivals
  // ==========================================================================
  describe("AC3 — End-to-end formatting fidelity across mock departures and arrivals", () => {
    test("departure strips format all 4 physical columns and FAA 7110.65 boxes faithfully", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: [mockDAL882, mockSWA1902],
          arrivals: [],
        }),
      );

      // Column 1: ACID, Revision, Type, CID, Beacon
      expect(html).toContain('class="box-value strip-acid">DAL882</span>');
      expect(html).toContain('class="box-value strip-equip">D/B738/L</span>');
      expect(html).toContain('class="box-value strip-cid">101</span>');
      expect(html).toContain('class="box-value strip-beacon">4215</span>');

      // SWA1902 has revision 1, type E/B737/G, beacon 2104
      expect(html).toContain('class="box-value strip-acid">SWA1902</span>');
      expect(html).toContain('class="box-value strip-rev">1</span>');
      expect(html).toContain('class="box-value strip-equip">E/B737/G</span>');
      expect(html).toContain('class="box-value strip-cid">102</span>');
      expect(html).toContain('class="box-value strip-beacon">2104</span>');

      // Column 2: Proposed departure time, Requested altitude, Departure airport
      expect(html).toContain('class="box-value strip-dep-time">1430</span>');
      expect(html).toContain('class="box-value strip-req-alt">330</span>');
      expect(html).toContain('class="box-value strip-dep-airport">KATL</span>');
      expect(html).toContain('class="box-value strip-dep-time">1435</span>');
      expect(html).toContain('class="box-value strip-req-alt">310</span>');

      // Column 3: Runway assignment 8A, Departure fix 8B, Route & Destination Box 9
      expect(html).toContain('class="box-value strip-annotation-8a">26L</span>');
      expect(html).toContain('class="box-value strip-annotation-8b">D</span>');
      expect(html).toContain('class="strip-route">PLIER2 PLIER SPA J51 FAK PHL</div>');
      expect(html).toContain('class="strip-dest">KPHL</span>');

      expect(html).toContain('class="box-value strip-annotation-8a">27R</span>');
      expect(html).toContain('class="box-value strip-annotation-8b">T</span>');
      expect(html).toContain('class="strip-route">POUNC2 POUNC BNA STL</div>');
      expect(html).toContain('class="strip-dest">KMDW</span>');

      // Column 4: Annotation boxes 10 to 18
      expect(html).toContain('class="strip-col-4 strip-col-4-departure"');
      expect(html).toContain('data-box="10"');
      expect(html).toContain('data-box="18"');
    });

    test("arrival strips format all 4 physical columns and FAA 7110.65 boxes faithfully", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: [],
          arrivals: [mockAAL412, mockN415SP],
        }),
      );

      // Column 1: ACID, Type/Suffix, CID, Beacon
      expect(html).toContain('class="box-value strip-acid">AAL412</span>');
      expect(html).toContain('class="box-value strip-equip">D/A321/L</span>');
      expect(html).toContain('class="box-value strip-cid">201</span>');
      expect(html).toContain('class="box-value strip-beacon">0120</span>');

      // N415SP: VFR squawk 1200, I/C172/G
      expect(html).toContain('class="box-value strip-acid">N415SP</span>');
      expect(html).toContain('class="box-value strip-equip">I/C172/G</span>');
      expect(html).toContain('class="box-value strip-cid">202</span>');
      expect(html).toContain('class="box-value strip-beacon">1200</span>');

      // Column 2: Coordination fix, ETA
      expect(html).toContain('class="box-value strip-coord-fix">HONIE</span>');
      expect(html).toContain('class="box-value strip-eta">1440</span>');
      expect(html).toContain('class="box-value strip-coord-fix">PDK</span>');
      expect(html).toContain('class="box-value strip-eta">1445</span>');

      // Column 3: Runway 8A, Flight rules Box 9 ('I'/'V'), Destination Box 9A
      expect(html).toContain('class="box-value strip-annotation-8a">26R</span>');
      expect(html).toContain('class="box-value strip-flight-rules">I</span>');
      expect(html).toContain('class="strip-dest">KATL</div>');

      expect(html).toContain('class="box-value strip-annotation-8a">21L</span>');
      expect(html).toContain('class="box-value strip-flight-rules">V</span>');
      expect(html).toContain('class="strip-dest">KPDK</div>');

      // Column 4: Annotation boxes 10 to 18
      expect(html).toContain('class="strip-col-4 strip-col-4-arrival"');
      expect(html).toContain('data-box="10"');
      expect(html).toContain('data-box="18"');
    });

    test("strips.css enforces physical cardstock colors, column widths, and contrast", () => {
      // 4-column physical cardstock grid template (18% 14% 46% 22%)
      expect(stripsCss).toMatch(/grid-template-columns:\s*18%\s*14%\s*46%\s*22%;/);

      // Pale buff physical background #f5eedc
      expect(stripsCss).toMatch(/background-color:\s*#f5eedc;/i);

      // High-contrast dark ink text color #111
      expect(stripsCss).toMatch(/color:\s*#111;/i);

      // Dark cab board container #1a1e24
      expect(stripsCss).toMatch(/background-color:\s*#1a1e24;/i);
    });
  });

  // ==========================================================================
  // AC4: Shell toggle integration, overlay modal, and architecture compliance
  // ==========================================================================
  describe("AC4 — Shell toggle integration, overlay modal, and architecture", () => {
    test("Shell renders STRIPS toggle button and popout button", () => {
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

      // Toggle button and popout button rendered in Shell
      expect(html).toContain('data-testid="strips-toggle-btn"');
      expect(html).toContain("STRIPS");
      expect(html).toContain('data-testid="strips-popout-btn"');
      expect(html).toContain("↗");
    });

    test("shell.tsx wires onSelectStrip to selectTrackFromFlightStrip and scope refresh", () => {
      expect(shellTsx).toMatch(/selectTrackFromFlightStrip\(app\.world,\s*strip\)/);
      expect(shellTsx).toMatch(/refreshScopeUi\(\)/);
      expect(shellTsx).toMatch(/data-testid="strips-toggle-btn"/);
      expect(shellTsx).toMatch(/data-testid="strips-popout-btn"/);
      expect(shellTsx).toMatch(/data-testid="strips-overlay-modal"/);
      expect(shellTsx).toMatch(/data-testid="strips-overlay-close"/);
      expect(shellTsx).toMatch(/data-testid="strips-overlay-new-window"/);
    });

    test("strips.css defines styles for strips toggle bar, buttons, and overlay modal", () => {
      expect(stripsCss).toMatch(/\.strips-toggle-bar\s*\{[^}]*position:\s*absolute/i);
      expect(stripsCss).toMatch(/\.strips-toggle-button[^{]*\{/i);
      expect(stripsCss).toMatch(/\.strips-overlay-modal\s*\{[^}]*position:\s*fixed/i);
      expect(stripsCss).toMatch(/\.strips-overlay-backdrop\s*\{[^}]*position:\s*absolute/i);
      expect(stripsCss).toMatch(/\.strips-overlay-content\s*\{[^}]*position:\s*relative/i);
    });
  });
});
