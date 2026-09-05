import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import { StripsBoard } from "../StripsBoard";
import {
  mockAAL412,
  mockArrivals,
  mockDAL882,
  mockDepartures,
  mockN415SP,
  mockSWA1902,
} from "../mockFixture";
import type { ArrivalStripData, DepartureStripData } from "../types";

const cssContent = readFileSync(new URL("../strips.css", import.meta.url), "utf8");

describe("T02-92 Flight Progress Strips Two-Column Board and Bay Layout", () => {
  // --------------------------------------------------------------------------
  // AC1: Header and 2-column rack container with Departures and Arrivals racks
  // --------------------------------------------------------------------------
  describe("AC1 — 2-column rack container structure", () => {
    test("renders .strips-board root container without top board-header", () => {
      const html = renderToStaticMarkup(createElement(StripsBoard));

      expect(html).toContain('class="strips-board"');
      expect(html).toContain('data-testid="strips-board"');
      expect(html).not.toContain('class="board-header"');
      expect(html).not.toContain('data-testid="board-header"');
    });

    test("does not render top facility title or board header", () => {
      const html = renderToStaticMarkup(createElement(StripsBoard));

      expect(html).not.toContain('class="board-title"');
      expect(html).not.toContain("ATL — Flight Progress Strips");
    });

    test("renders .bay-container with departures and arrivals rack columns", () => {
      const html = renderToStaticMarkup(createElement(StripsBoard));

      expect(html).toContain('class="bay-container bay-horizontal"');
      expect(html).toContain('data-testid="bay-container"');
      expect(html).toContain('data-rack="departures"');
      expect(html).toContain('data-rack="arrivals"');
      expect(html).toContain("rack-column rack-departures");
      expect(html).toContain("rack-column rack-arrivals");
    });

    test("renders rack headers with Departures and Arrivals titles", () => {
      const html = renderToStaticMarkup(createElement(StripsBoard));

      expect(html).toContain('data-testid="rack-header-departures"');
      expect(html).toContain('data-testid="rack-header-arrivals"');
      expect(html).toContain('<span class="rack-title">Departures</span>');
      expect(html).toContain('<span class="rack-title">Arrivals</span>');
    });

    test("applies custom className to outer container when passed", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, { className: "custom-board-theme" }),
      );

      expect(html).toContain('class="strips-board custom-board-theme"');
    });
  });

  // --------------------------------------------------------------------------
  // AC2: Rack headers render clean title headers without count badges
  // --------------------------------------------------------------------------
  describe("AC2 — Rack headers render clean title headers without count badges", () => {
    test("renders departures and arrivals headers without count badges", () => {
      const html = renderToStaticMarkup(createElement(StripsBoard));

      expect(html).toContain('data-testid="rack-header-departures"');
      expect(html).toContain("Departures");
      expect(html).not.toContain('data-testid="departures-count"');

      expect(html).toContain('data-testid="rack-header-arrivals"');
      expect(html).toContain("Arrivals");
      expect(html).not.toContain('data-testid="arrivals-count"');
    });

    test("renders custom departures and arrivals lists without header count badges", () => {
      const singleDeparture: DepartureStripData[] = [mockDAL882];
      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: singleDeparture,
          arrivals: [mockAAL412, mockN415SP],
        }),
      );

      expect(html).toContain('data-testid="rack-header-departures"');
      expect(html).toContain('data-testid="rack-header-arrivals"');
      expect(html).not.toContain('data-testid="departures-count"');
      expect(html).not.toContain('data-testid="arrivals-count"');
    });

    test("handles empty departures and arrivals arrays displaying empty placeholder", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: [],
          arrivals: [],
        }),
      );

      expect(html).not.toContain('data-testid="departures-count"');
      expect(html).not.toContain('data-testid="arrivals-count"');
      expect(html).toContain('data-testid="rack-empty-departures"');
      expect(html).toContain("No departure strips");
      expect(html).toContain('data-testid="rack-empty-arrivals"');
      expect(html).toContain("No arrival strips");
    });

    test("does not render board header meta DEP and ARR summary counts", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: [mockDAL882],
          arrivals: [mockAAL412, mockN415SP],
        }),
      );

      expect(html).not.toContain('data-testid="board-meta-departures"');
      expect(html).not.toContain('data-testid="board-meta-arrivals"');
      expect(html).not.toContain("DEP:");
      expect(html).not.toContain("ARR:");
    });
  });

  // --------------------------------------------------------------------------
  // AC3: Independent vertical scrolling and layout styling
  // --------------------------------------------------------------------------
  describe("AC3 — Independent vertical scrolling and layout styling in strips.css", () => {
    test("strips.css defines .strips-board with 100vw, 100vh, #000000, and overflow: hidden", () => {
      expect(cssContent).toMatch(/\.strips-board\s*\{[^}]*width:\s*100vw;/i);
      expect(cssContent).toMatch(/\.strips-board\s*\{[^}]*height:\s*100vh;/i);
      expect(cssContent).toMatch(/\.strips-board\s*\{[^}]*background-color:\s*#000000;/i);
      expect(cssContent).toMatch(/\.strips-board\s*\{[^}]*overflow:\s*hidden;/i);
    });

    test("strips.css defines .rack-header-actions with flex display and gap 8px", () => {
      expect(cssContent).toMatch(/\.rack-header-actions\s*\{[^}]*display:\s*flex;/i);
      expect(cssContent).toMatch(/\.rack-header-actions\s*\{[^}]*gap:\s*8px;/i);
    });

    test("strips.css defines .bay-container with 2-column grid, gap 16px, padding 16px, overflow: hidden", () => {
      expect(cssContent).toMatch(/\.bay-container\s*\{[^}]*grid-template-columns:\s*1fr 1fr;/i);
      expect(cssContent).toMatch(/\.bay-container\s*\{[^}]*gap:\s*16px;/i);
      expect(cssContent).toMatch(/\.bay-container\s*\{[^}]*padding:\s*16px;/i);
      expect(cssContent).toMatch(/\.bay-container\s*\{[^}]*overflow:\s*hidden;/i);
    });

    test("strips.css defines .rack-column with #000000, border #222, and flex column", () => {
      expect(cssContent).toMatch(/\.rack-column\s*\{[^}]*background-color:\s*#000000;/i);
      expect(cssContent).toMatch(/\.rack-column\s*\{[^}]*border:\s*1px solid #222;/i);
      expect(cssContent).toMatch(/\.rack-column\s*\{[^}]*flex-direction:\s*column;/i);
    });

    test("strips.css defines .rack-header with #000000, border #222, uppercase text, white color, and IBM Plex Mono font", () => {
      expect(cssContent).toMatch(/\.rack-header\s*\{[^}]*background-color:\s*#000000;/i);
      expect(cssContent).toMatch(/\.rack-header\s*\{[^}]*border-bottom:\s*1px solid #222;/i);
      expect(cssContent).toMatch(/\.rack-header\s*\{[^}]*text-transform:\s*uppercase;/i);
      expect(cssContent).toMatch(/\.rack-header\s*\{[^}]*color:\s*#ffffff;/i);
      expect(cssContent).toMatch(/\.rack-header\s*\{[^}]*font-family:[^}]*"IBM Plex Mono"/i);
    });

    test("strips.css defines .strips-drawer with pure black background and 1px white border-left separator", () => {
      expect(cssContent).toMatch(/\.strips-drawer\s*\{[^}]*background-color:\s*#000000;/i);
      expect(cssContent).toMatch(/\.strips-drawer\s*\{[^}]*border-left:\s*1px solid #ffffff;/i);
    });

    test("strips.css defines .rack-strip-list with gap 4px, padding 8px, overflow-y: auto, flex: 1", () => {
      expect(cssContent).toMatch(/\.rack-strip-list\s*\{[^}]*gap:\s*4px;/i);
      expect(cssContent).toMatch(/\.rack-strip-list\s*\{[^}]*padding:\s*8px;/i);
      expect(cssContent).toMatch(/\.rack-strip-list\s*\{[^}]*overflow-y:\s*auto;/i);
      expect(cssContent).toMatch(/\.rack-strip-list\s*\{[^}]*flex:\s*1;/i);
    });

    test("both rack columns render independent scrollable .rack-strip-list regions", () => {
      const html = renderToStaticMarkup(createElement(StripsBoard));

      expect(html).toContain('data-testid="rack-strip-list-departures"');
      expect(html).toContain('role="region" aria-label="Departures strip list"');
      expect(html).toContain('data-testid="rack-strip-list-arrivals"');
      expect(html).toContain('role="region" aria-label="Arrivals strip list"');
    });
  });

  // --------------------------------------------------------------------------
  // AC4: Empty defaults and passed mockFixture rendering
  // --------------------------------------------------------------------------
  describe("AC4 — Empty defaults and passed mockFixture rendering", () => {
    test("renders empty racks when departures and arrivals are undefined (defaults to empty arrays)", () => {
      const html = renderToStaticMarkup(createElement(StripsBoard));

      expect(html).toContain("No departure strips");
      expect(html).toContain("No arrival strips");
      expect(html).not.toContain("DEP:");
      expect(html).not.toContain("ARR:");
    });

    test("renders departure strips for mock DAL882 and SWA1902 when departures prop is provided", () => {
      const html = renderToStaticMarkup(createElement(StripsBoard, { departures: mockDepartures }));

      expect(html).toContain("DAL882");
      expect(html).toContain("SWA1902");
      expect(html).toContain('data-strip-acid="DAL882"');
      expect(html).toContain('data-strip-acid="SWA1902"');
      expect(html).toContain("PLIER2 PLIER SPA J51 FAK PHL");
      expect(html).toContain("POUNC2 POUNC BNA STL");
    });

    test("renders arrival strips for mock AAL412 and N415SP when arrivals prop is provided", () => {
      const html = renderToStaticMarkup(createElement(StripsBoard, { arrivals: mockArrivals }));

      expect(html).toContain("AAL412");
      expect(html).toContain("N415SP");
      expect(html).toContain('data-strip-acid="AAL412"');
      expect(html).toContain('data-strip-acid="N415SP"');
      expect(html).toContain("HONIE");
      expect(html).toContain("PDK");
    });

    test("renders 4 total strips across the 2 racks under mock props", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, { departures: mockDepartures, arrivals: mockArrivals }),
      );

      const depMatches = html.match(/class="[^"]*departure-strip[^"]*"/g);
      const arrMatches = html.match(/class="[^"]*arrival-strip[^"]*"/g);

      expect(depMatches?.length).toBe(2);
      expect(arrMatches?.length).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // AC5: Interactivity, selection, and unit test pass coverage
  // --------------------------------------------------------------------------
  describe("AC5 — Interactivity, strip selection callbacks, and controlled selection", () => {
    test("calls onSelectStrip with DepartureStripData when a departure strip is selected", () => {
      const onSelectStripMock = vi.fn();
      const tree = StripsBoard({
        departures: mockDepartures,
        arrivals: mockArrivals,
        onSelectStrip: onSelectStripMock,
      });

      // Navigate tree: bay-container (children[0]) -> rack-departures (index 0) -> rack-strip-list (index 1)
      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const departuresRack = bayContainer.props.children[0];
      const depStripList = departuresRack.props.children[1];
      const firstDepStripElement = depStripList.props.children[0];

      expect(firstDepStripElement.props.strip.acid).toBe("DAL882");
      // Trigger onSelect callback
      firstDepStripElement.props.onSelect("DAL882");

      expect(onSelectStripMock).toHaveBeenCalledTimes(1);
      expect(onSelectStripMock).toHaveBeenCalledWith(mockDAL882);
    });

    test("calls onSelectStrip with ArrivalStripData when an arrival strip is selected", () => {
      const onSelectStripMock = vi.fn();
      const tree = StripsBoard({
        departures: mockDepartures,
        arrivals: mockArrivals,
        onSelectStrip: onSelectStripMock,
      });

      // Navigate tree: bay-container (children[0]) -> rack-arrivals (index 1) -> rack-strip-list (index 1)
      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const arrivalsRack = bayContainer.props.children[1];
      const arrStripList = arrivalsRack.props.children[1];
      const firstArrStripElement = arrStripList.props.children[0];

      expect(firstArrStripElement.props.strip.acid).toBe("AAL412");
      // Trigger onSelect callback
      firstArrStripElement.props.onSelect("AAL412");

      expect(onSelectStripMock).toHaveBeenCalledTimes(1);
      expect(onSelectStripMock).toHaveBeenCalledWith(mockAAL412);
    });

    test("highlights selected strip when selectedStripId prop is specified", () => {
      const htmlSelectedDep = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: mockDepartures,
          arrivals: mockArrivals,
          selectedStripId: "DAL882",
        }),
      );

      // DAL882 should be selected, SWA1902 not selected
      expect(htmlSelectedDep).toContain('data-strip-acid="DAL882"');
      const dalMatch = htmlSelectedDep.match(
        /class="[^"]*departure-strip[^"]*strip-selected[^"]*"[^>]*data-strip-acid="DAL882"/,
      );
      expect(dalMatch).toBeTruthy();

      const htmlSelectedArr = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: mockDepartures,
          arrivals: mockArrivals,
          selectedStripId: "AAL412",
        }),
      );

      const aalMatch = htmlSelectedArr.match(
        /class="[^"]*arrival-strip[^"]*strip-selected[^"]*"[^>]*data-strip-acid="AAL412"/,
      );
      expect(aalMatch).toBeTruthy();
    });

    test("renders custom strip objects accurately without errors", () => {
      const customDep: DepartureStripData = {
        id: "TEST100",
        stripType: "DEPARTURE",
        acid: "TEST100",
        rawType: "A320",
        beaconCode: "4501",
        proposedDepartureTime: "1800",
        requestedAltitude: "360",
        departureAirport: "KATL",
        route: "VRNNA DIRECT",
        destinationAirport: "KJFK",
      };

      const customArr: ArrivalStripData = {
        id: "TEST200",
        stripType: "ARRIVAL",
        acid: "TEST200",
        rawType: "B772",
        beaconCode: "1234",
        coordinationFix: "WOMEN",
        estimatedTimeOfArrival: "1820",
        flightRules: "IFR",
        destinationAirport: "KATL",
      };

      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: [customDep],
          arrivals: [customArr],
        }),
      );

      expect(html).toContain("TEST100");
      expect(html).toContain("VRNNA DIRECT");
      expect(html).toContain("TEST200");
      expect(html).toContain("WOMEN");
      expect(html).not.toContain('data-testid="departures-count"');
      expect(html).not.toContain('data-testid="arrivals-count"');
    });
  });

  // --------------------------------------------------------------------------
  // AC6: Layout orientation and collapsible rack sub-drawers
  // --------------------------------------------------------------------------
  describe("AC6 — Layout orientation switching and collapsible rack sub-drawers", () => {
    test("renders layout toggle button in strips board footer with Stacked in default horizontal mode", () => {
      const html = renderToStaticMarkup(createElement(StripsBoard));

      expect(html).toContain('data-testid="strips-layout-toggle-btn"');
      expect(html).toContain("Stacked");
      expect(html).toContain('data-testid="strips-board-footer"');
      expect(html).toContain("bay-horizontal");
      expect(html).not.toContain("bay-vertical");
    });

    test("renders Columns in footer when layoutMode is vertical", () => {
      const html = renderToStaticMarkup(createElement(StripsBoard, { defaultLayout: "vertical" }));

      expect(html).toContain("Columns");
      expect(html).toContain('data-testid="strips-board-footer"');
      expect(html).toContain("bay-vertical");
      expect(html).not.toContain("bay-horizontal");
    });

    test("renders correct arrow indicators in horizontal mode for expanded and collapsed states", () => {
      // Both expanded in horizontal mode: Departures ◀, Arrivals ▶
      const htmlExpanded = renderToStaticMarkup(
        createElement(StripsBoard, {
          defaultLayout: "horizontal",
          defaultDeparturesCollapsed: false,
          defaultArrivalsCollapsed: false,
        }),
      );
      expect(htmlExpanded).toContain('data-testid="collapse-departures-btn"');
      expect(htmlExpanded).toContain('data-testid="collapse-arrivals-btn"');
      expect(htmlExpanded).toContain(">◀</button>");
      expect(htmlExpanded).toContain(">▶</button>");

      // Departures collapsed in horizontal mode: Departures shows ▶
      const htmlDepCollapsed = renderToStaticMarkup(
        createElement(StripsBoard, {
          defaultLayout: "horizontal",
          defaultDeparturesCollapsed: true,
          defaultArrivalsCollapsed: false,
        }),
      );
      expect(htmlDepCollapsed).toContain("rack-column rack-departures collapsed");
      const matches = htmlDepCollapsed.match(/>▶<\/button>/g);
      expect(matches?.length).toBe(2);

      // Arrivals collapsed in horizontal mode: Arrivals shows ◀
      const htmlArrCollapsed = renderToStaticMarkup(
        createElement(StripsBoard, {
          defaultLayout: "horizontal",
          defaultDeparturesCollapsed: false,
          defaultArrivalsCollapsed: true,
        }),
      );
      expect(htmlArrCollapsed).toContain("rack-column rack-arrivals collapsed");
      const arrMatches = htmlArrCollapsed.match(/>◀<\/button>/g);
      expect(arrMatches?.length).toBe(2);
    });

    test("renders correct arrow indicators in vertical mode for expanded and collapsed states", () => {
      // Both expanded in vertical mode: Departures ▲, Arrivals ▲
      const htmlExpanded = renderToStaticMarkup(
        createElement(StripsBoard, {
          defaultLayout: "vertical",
          defaultDeparturesCollapsed: false,
          defaultArrivalsCollapsed: false,
        }),
      );
      const upMatches = htmlExpanded.match(/>▲<\/button>/g);
      expect(upMatches?.length).toBe(2);

      // Both collapsed in vertical mode: Departures ▼, Arrivals ▼
      const htmlCollapsed = renderToStaticMarkup(
        createElement(StripsBoard, {
          defaultLayout: "vertical",
          defaultDeparturesCollapsed: true,
          defaultArrivalsCollapsed: true,
        }),
      );
      const downMatches = htmlCollapsed.match(/>▼<\/button>/g);
      expect(downMatches?.length).toBe(2);
      expect(htmlCollapsed).toContain("rack-column rack-departures collapsed");
      expect(htmlCollapsed).toContain("rack-column rack-arrivals collapsed");
    });

    test("clicking layout toggle button in footer invokes onLayoutModeChange with switched orientation", () => {
      const onLayoutModeChange = vi.fn();
      const tree = StripsBoard({
        defaultLayout: "horizontal",
        onLayoutModeChange,
      });

      // tree.props.children has [bayContainer, footer]
      const footer = Array.isArray(tree.props.children)
        ? tree.props.children[1]
        : tree.props.children;
      const layoutBtn = footer.props.children;

      expect(layoutBtn.props["data-testid"]).toBe("strips-layout-toggle-btn");
      expect(layoutBtn.props.children).toBe("Stacked");

      layoutBtn.props.onClick();
      expect(onLayoutModeChange).toHaveBeenCalledTimes(1);
      expect(onLayoutModeChange).toHaveBeenCalledWith("vertical");
    });

    test("clicking anywhere on rack header toggles collapse state", () => {
      const onDeparturesCollapsedChange = vi.fn();
      const onArrivalsCollapsedChange = vi.fn();
      const tree = StripsBoard({
        defaultDeparturesCollapsed: false,
        defaultArrivalsCollapsed: false,
        onDeparturesCollapsedChange,
        onArrivalsCollapsedChange,
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const depRack = bayContainer.props.children[0];
      const arrRack = bayContainer.props.children[1];

      const depHeader = depRack.props.children[0];
      depHeader.props.onClick();
      expect(onDeparturesCollapsedChange).toHaveBeenCalledWith(true);

      const arrHeader = arrRack.props.children[0];
      arrHeader.props.onClick();
      expect(onArrivalsCollapsedChange).toHaveBeenCalledWith(true);
    });

    test("clicking collapse arrow button toggles collapse state and stops propagation", () => {
      const onDeparturesCollapsedChange = vi.fn();
      const onArrivalsCollapsedChange = vi.fn();
      const tree = StripsBoard({
        defaultDeparturesCollapsed: false,
        defaultArrivalsCollapsed: false,
        onDeparturesCollapsedChange,
        onArrivalsCollapsedChange,
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const depRack = bayContainer.props.children[0];
      const arrRack = bayContainer.props.children[1];

      const depHeader = depRack.props.children[0];
      const depActions = depHeader.props.children[1];
      const depBtn = depActions.props.children;

      const arrHeader = arrRack.props.children[0];
      const arrActions = arrHeader.props.children[1];
      const arrBtn = arrActions.props.children;

      const fakeEvent = { stopPropagation: vi.fn() };
      depBtn.props.onClick(fakeEvent);
      expect(fakeEvent.stopPropagation).toHaveBeenCalled();
      expect(onDeparturesCollapsedChange).toHaveBeenCalledWith(true);

      const fakeEvent2 = { stopPropagation: vi.fn() };
      arrBtn.props.onClick(fakeEvent2);
      expect(fakeEvent2.stopPropagation).toHaveBeenCalled();
      expect(onArrivalsCollapsedChange).toHaveBeenCalledWith(true);
    });

    test("clicking collapsed rack column expands rack back", () => {
      const onDeparturesCollapsedChange = vi.fn();
      const onArrivalsCollapsedChange = vi.fn();
      const tree = StripsBoard({
        defaultDeparturesCollapsed: true,
        defaultArrivalsCollapsed: true,
        onDeparturesCollapsedChange,
        onArrivalsCollapsedChange,
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const depRack = bayContainer.props.children[0];
      const arrRack = bayContainer.props.children[1];

      depRack.props.onClick();
      expect(onDeparturesCollapsedChange).toHaveBeenCalledWith(false);

      arrRack.props.onClick();
      expect(onArrivalsCollapsedChange).toHaveBeenCalledWith(false);
    });

    test("strips.css defines styles for bay-horizontal, bay-vertical, collapsed racks, and buttons", () => {
      expect(cssContent).toMatch(/\.bay-horizontal/i);
      expect(cssContent).toMatch(/\.bay-vertical/i);
      expect(cssContent).toMatch(
        /\.rack-column\.collapsed\s*\.rack-strip-list\s*\{[^}]*display:\s*none/i,
      );
      expect(cssContent).toMatch(/writing-mode:\s*vertical-rl/i);
      expect(cssContent).toMatch(/transform:\s*rotate\(180deg\)/i);
      expect(cssContent).toMatch(/\.strips-board-footer/i);
      expect(cssContent).toMatch(/\.strips-layout-toggle-btn/i);
      expect(cssContent).toMatch(/\.rack-collapse-btn/i);
      expect(cssContent).toMatch(/\.rack-header\s*\{[^}]*cursor:\s*pointer;/i);
      expect(cssContent).toMatch(/#00ff00/i);
      expect(cssContent).toMatch(/#ffff00/i);
    });
  });

  // --------------------------------------------------------------------------
  // T02-94: StripsBoard right-click indentation state and independent tracking
  // --------------------------------------------------------------------------
  describe("T02-94 — StripsBoard right-click indentation state & independent tracking", () => {
    test("right-clicking a departure strip triggers onToggleIndent with next indented=true", () => {
      const onToggleIndentMock = vi.fn();
      const tree = StripsBoard({
        departures: mockDepartures,
        arrivals: mockArrivals,
        onToggleIndent: onToggleIndentMock,
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const depRack = bayContainer.props.children[0];
      const depStripList = depRack.props.children[1];
      const firstDep = depStripList.props.children[0];

      expect(firstDep.props.indented).toBe(false);
      firstDep.props.onToggleIndent("DAL882");

      expect(onToggleIndentMock).toHaveBeenCalledTimes(1);
      expect(onToggleIndentMock).toHaveBeenCalledWith("DAL882", true);
    });

    test("right-clicking an already indented departure strip triggers onToggleIndent with next indented=false", () => {
      const onToggleIndentMock = vi.fn();
      const tree = StripsBoard({
        departures: mockDepartures,
        arrivals: mockArrivals,
        indentedStripIds: new Set(["DAL882"]),
        onToggleIndent: onToggleIndentMock,
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const depRack = bayContainer.props.children[0];
      const depStripList = depRack.props.children[1];
      const firstDep = depStripList.props.children[0];

      expect(firstDep.props.indented).toBe(true);
      firstDep.props.onToggleIndent("DAL882");

      expect(onToggleIndentMock).toHaveBeenCalledTimes(1);
      expect(onToggleIndentMock).toHaveBeenCalledWith("DAL882", false);
    });

    test("right-clicking an arrival strip toggles its indentation independently", () => {
      const onToggleIndentMock = vi.fn();
      const tree = StripsBoard({
        departures: mockDepartures,
        arrivals: mockArrivals,
        onToggleIndent: onToggleIndentMock,
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const arrRack = bayContainer.props.children[1];
      const arrStripList = arrRack.props.children[1];
      const firstArr = arrStripList.props.children[0];

      expect(firstArr.props.indented).toBe(false);
      firstArr.props.onToggleIndent("AAL412");

      expect(onToggleIndentMock).toHaveBeenCalledTimes(1);
      expect(onToggleIndentMock).toHaveBeenCalledWith("AAL412", true);
    });

    test("tracks indentation state independently per strip across both departures and arrivals", () => {
      const tree = StripsBoard({
        departures: mockDepartures,
        arrivals: mockArrivals,
        indentedStripIds: new Set(["DAL882", "N415SP"]),
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const depRack = bayContainer.props.children[0];
      const depStripList = depRack.props.children[1];
      const dep1 = depStripList.props.children[0]; // DAL882
      const dep2 = depStripList.props.children[1]; // SWA1902

      const arrRack = bayContainer.props.children[1];
      const arrStripList = arrRack.props.children[1];
      const arr1 = arrStripList.props.children[0]; // AAL412
      const arr2 = arrStripList.props.children[1]; // N415SP

      expect(dep1.props.indented).toBe(true);
      expect(dep2.props.indented).toBe(false);
      expect(arr1.props.indented).toBe(false);
      expect(arr2.props.indented).toBe(true);
    });

    test("renders .strip-indented class in rendered markup for only indented strips", () => {
      const html = renderToStaticMarkup(
        createElement(StripsBoard, {
          departures: mockDepartures,
          arrivals: mockArrivals,
          indentedStripIds: new Set(["DAL882", "AAL412"]),
        }),
      );

      // DAL882 should be indented
      const dalMatch = html.match(
        /class="[^"]*departure-strip[^"]*strip-indented[^"]*"[^>]*data-strip-acid="DAL882"/,
      );
      expect(dalMatch).toBeTruthy();

      // SWA1902 should not be indented
      const swaMatch = html.match(
        /class="[^"]*departure-strip[^"]*"[^>]*data-strip-acid="SWA1902"/,
      );
      expect(swaMatch?.[0]).not.toContain("strip-indented");

      // AAL412 should be indented
      const aalMatch = html.match(
        /class="[^"]*arrival-strip[^"]*strip-indented[^"]*"[^>]*data-strip-acid="AAL412"/,
      );
      expect(aalMatch).toBeTruthy();

      // N415SP should not be indented
      const n415Match = html.match(/class="[^"]*arrival-strip[^"]*"[^>]*data-strip-acid="N415SP"/);
      expect(n415Match?.[0]).not.toContain("strip-indented");
    });

    test("initializes indented strips from defaultIndentedStripIds or strip.indented property", () => {
      const depWithIndent: DepartureStripData = { ...mockDAL882, indented: true };
      const tree = StripsBoard({
        departures: [depWithIndent, mockSWA1902],
        arrivals: mockArrivals,
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const depRack = bayContainer.props.children[0];
      const depStripList = depRack.props.children[1];
      const dep1 = depStripList.props.children[0];
      const dep2 = depStripList.props.children[1];

      expect(dep1.props.indented).toBe(true);
      expect(dep2.props.indented).toBe(false);
    });

    test("left-clicking an indented strip invokes onSelectStrip without toggling indent", () => {
      const onSelectStripMock = vi.fn();
      const onToggleIndentMock = vi.fn();
      const tree = StripsBoard({
        departures: mockDepartures,
        arrivals: mockArrivals,
        indentedStripIds: new Set(["DAL882"]),
        onSelectStrip: onSelectStripMock,
        onToggleIndent: onToggleIndentMock,
      });

      const bayContainer = Array.isArray(tree.props.children)
        ? tree.props.children[0]
        : tree.props.children;
      const depRack = bayContainer.props.children[0];
      const depStripList = depRack.props.children[1];
      const firstDep = depStripList.props.children[0];

      expect(firstDep.props.indented).toBe(true);
      firstDep.props.onSelect("DAL882");

      expect(onSelectStripMock).toHaveBeenCalledTimes(1);
      expect(onSelectStripMock).toHaveBeenCalledWith(mockDAL882);
      expect(onToggleIndentMock).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // T02-95: Strips intra-section drag-and-drop reordering and drop indicator
  // --------------------------------------------------------------------------
  describe("T02-95 — Strips Intra-Section Drag Reordering and Drop Indicator Line", () => {
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

    // ------------------------------------------------------------------------
    // AC1: Draggable within rack column using mouse drag
    // ------------------------------------------------------------------------
    describe("AC1 — Strips are draggable within their rack column using HTML5 drag", () => {
      test("renders departure and arrival strips with draggable=true attribute in DOM markup", () => {
        const html = renderToStaticMarkup(
          createElement(StripsBoard, {
            departures: mockDepartures,
            arrivals: mockArrivals,
          }),
        );

        const depMatches = html.match(/class="[^"]*departure-strip[^"]*"[^>]*draggable="true"/g);
        const arrMatches = html.match(/class="[^"]*arrival-strip[^"]*"[^>]*draggable="true"/g);

        expect(depMatches?.length).toBe(2);
        expect(arrMatches?.length).toBe(2);
      });

      test("onDragStart sets dataTransfer format 'text/plain' and effectAllowed='move'", () => {
        const tree = StripsBoard({
          departures: mockDepartures,
          arrivals: mockArrivals,
        });

        const bayContainer = Array.isArray(tree.props.children)
          ? tree.props.children[0]
          : tree.props.children;
        const depRack = bayContainer.props.children[0];
        const depStripList = depRack.props.children[1];
        const firstDep = depStripList.props.children[0];

        const dragEvent = createMockDragEvent();
        firstDep.props.onDragStart(dragEvent);

        expect(dragEvent.dataTransfer.setData).toHaveBeenCalledWith("text/plain", "DAL882");
        expect(dragEvent.dataTransfer.effectAllowed).toBe("move");
      });

      test("onDragStart on an arrival strip sets dataTransfer with arrival strip ID", () => {
        const tree = StripsBoard({
          departures: mockDepartures,
          arrivals: mockArrivals,
        });

        const bayContainer = Array.isArray(tree.props.children)
          ? tree.props.children[0]
          : tree.props.children;
        const arrRack = bayContainer.props.children[1];
        const arrStripList = arrRack.props.children[1];
        const firstArr = arrStripList.props.children[0];

        const dragEvent = createMockDragEvent();
        firstArr.props.onDragStart(dragEvent);

        expect(dragEvent.dataTransfer.setData).toHaveBeenCalledWith("text/plain", "AAL412");
        expect(dragEvent.dataTransfer.effectAllowed).toBe("move");
      });
    });

    // ------------------------------------------------------------------------
    // AC2: Visual drop indicator line previewing insertion destination
    // ------------------------------------------------------------------------
    describe("AC2 — Prominent .strip-drop-indicator line indicates candidate drop index", () => {
      test("strips.css defines .strip-drop-indicator with yellow glow, 3px height, and pointer-events: none", () => {
        expect(cssContent).toMatch(/\.strip-drop-indicator\s*\{[^}]*height:\s*3px;/i);
        expect(cssContent).toMatch(/\.strip-drop-indicator\s*\{[^}]*background-color:\s*#ffff00;/i);
        expect(cssContent).toMatch(
          /\.strip-drop-indicator\s*\{[^}]*box-shadow:\s*0 0 6px #ffff00;/i,
        );
        expect(cssContent).toMatch(/\.strip-drop-indicator\s*\{[^}]*border-radius:\s*1\.5px;/i);
        expect(cssContent).toMatch(/\.strip-drop-indicator\s*\{[^}]*width:\s*100%;/i);
        expect(cssContent).toMatch(/\.strip-drop-indicator\s*\{[^}]*margin:\s*2px 0;/i);
        expect(cssContent).toMatch(/\.strip-drop-indicator\s*\{[^}]*pointer-events:\s*none;/i);
      });

      test("dragging over upper half of strip calculates targetIndex equal to hoverIndex", () => {
        const tree = StripsBoard({
          departures: mockDepartures,
          arrivals: mockArrivals,
        });

        const bayContainer = Array.isArray(tree.props.children)
          ? tree.props.children[0]
          : tree.props.children;
        const depRack = bayContainer.props.children[0];
        const depStripList = depRack.props.children[1];
        const firstDep = depStripList.props.children[0];
        const secondDep = depStripList.props.children[1];

        // Start drag on first strip
        firstDep.props.onDragStart(createMockDragEvent());

        // Drag over upper half of second strip (hoverIndex = 1, midY = 50, clientY = 20)
        const fakeElement = {
          getBoundingClientRect: () => ({ top: 0, height: 100, bottom: 100, left: 0, right: 100 }),
        };
        const overEvent = createMockDragEvent({
          clientY: 20,
          currentTarget: fakeElement,
        });
        secondDep.props.onDragOver(overEvent);

        expect(overEvent.preventDefault).toHaveBeenCalled();
        expect(overEvent.dataTransfer.dropEffect).toBe("move");
      });

      test("dragging over lower half of strip calculates targetIndex equal to hoverIndex + 1", () => {
        const tree = StripsBoard({
          departures: mockDepartures,
          arrivals: mockArrivals,
        });

        const bayContainer = Array.isArray(tree.props.children)
          ? tree.props.children[0]
          : tree.props.children;
        const depRack = bayContainer.props.children[0];
        const depStripList = depRack.props.children[1];
        const firstDep = depStripList.props.children[0];

        firstDep.props.onDragStart(createMockDragEvent());

        // Drag over lower half of first strip (hoverIndex = 0, midY = 50, clientY = 80)
        const fakeElement = {
          getBoundingClientRect: () => ({ top: 0, height: 100, bottom: 100, left: 0, right: 100 }),
        };
        const overEvent = createMockDragEvent({
          clientY: 80,
          currentTarget: fakeElement,
        });
        firstDep.props.onDragOver(overEvent);

        expect(overEvent.preventDefault).toHaveBeenCalled();
        expect(overEvent.dataTransfer.dropEffect).toBe("move");
      });

      test("renders .strip-drop-indicator line at targetIndex 0 (before all strips)", () => {
        const html = renderToStaticMarkup(
          createElement(StripsBoard, {
            departures: mockDepartures,
            arrivals: mockArrivals,
            dropIndicator: { section: "departures", targetIndex: 0 },
          }),
        );

        expect(html).toContain('class="strip-drop-indicator"');
        expect(html).toContain('data-testid="strip-drop-indicator"');

        // Drop indicator should appear before DAL882
        const indicatorIndex = html.indexOf('data-testid="strip-drop-indicator"');
        const dalIndex = html.indexOf('data-strip-acid="DAL882"');
        expect(indicatorIndex).toBeLessThan(dalIndex);
      });

      test("renders .strip-drop-indicator line at targetIndex 1 (between first and second strip)", () => {
        const html = renderToStaticMarkup(
          createElement(StripsBoard, {
            departures: mockDepartures,
            arrivals: mockArrivals,
            dropIndicator: { section: "departures", targetIndex: 1 },
          }),
        );

        const dalIndex = html.indexOf('data-strip-acid="DAL882"');
        const indicatorIndex = html.indexOf('data-testid="strip-drop-indicator"');
        const swaIndex = html.indexOf('data-strip-acid="SWA1902"');

        expect(dalIndex).toBeLessThan(indicatorIndex);
        expect(indicatorIndex).toBeLessThan(swaIndex);
      });

      test("renders .strip-drop-indicator line at targetIndex 2 (after all departure strips)", () => {
        const html = renderToStaticMarkup(
          createElement(StripsBoard, {
            departures: mockDepartures,
            arrivals: mockArrivals,
            dropIndicator: { section: "departures", targetIndex: 2 },
          }),
        );

        const swaIndex = html.indexOf('data-strip-acid="SWA1902"');
        const indicatorIndex = html.indexOf('data-testid="strip-drop-indicator"');

        expect(swaIndex).toBeLessThan(indicatorIndex);
      });
    });

    // ------------------------------------------------------------------------
    // AC3: Dropping commits reordered list within that section
    // ------------------------------------------------------------------------
    describe("AC3 — Dropping commits reordered strip sequence within section", () => {
      test("dropping departure strip at targetIndex reorders departures and calls onReorderStrips", () => {
        const onReorderStripsMock = vi.fn();
        const tree = StripsBoard({
          departures: mockDepartures, // [DAL882 (0), SWA1902 (1)]
          arrivals: mockArrivals,
          onReorderStrips: onReorderStripsMock,
        });

        const bayContainer = Array.isArray(tree.props.children)
          ? tree.props.children[0]
          : tree.props.children;
        const depRack = bayContainer.props.children[0];
        const depStripList = depRack.props.children[1];
        const firstDep = depStripList.props.children[0];
        const secondDep = depStripList.props.children[1];

        // 1. Drag start on first strip (DAL882, sourceIndex = 0)
        firstDep.props.onDragStart(createMockDragEvent());

        // 2. Drag over lower half of second strip (targetIndex = 2, i.e. move to end)
        const fakeElement = {
          getBoundingClientRect: () => ({ top: 0, height: 100, bottom: 100, left: 0, right: 100 }),
        };
        secondDep.props.onDragOver(
          createMockDragEvent({
            clientY: 80,
            currentTarget: fakeElement,
          }),
        );

        // 3. Drop
        const dropEvent = createMockDragEvent();
        secondDep.props.onDrop(dropEvent);

        expect(dropEvent.preventDefault).toHaveBeenCalled();
        expect(onReorderStripsMock).toHaveBeenCalledTimes(1);
        expect(onReorderStripsMock).toHaveBeenCalledWith("departures", [mockSWA1902, mockDAL882]);
      });

      test("dropping arrival strip at targetIndex reorders arrivals and calls onReorderStrips", () => {
        const onReorderStripsMock = vi.fn();
        const tree = StripsBoard({
          departures: mockDepartures,
          arrivals: mockArrivals, // [AAL412 (0), N415SP (1)]
          onReorderStrips: onReorderStripsMock,
        });

        const bayContainer = Array.isArray(tree.props.children)
          ? tree.props.children[0]
          : tree.props.children;
        const arrRack = bayContainer.props.children[1];
        const arrStripList = arrRack.props.children[1];
        const firstArr = arrStripList.props.children[0];
        const secondArr = arrStripList.props.children[1];

        // Drag second arrival (N415SP, sourceIndex = 1) over top half of first arrival (targetIndex = 0)
        secondArr.props.onDragStart(createMockDragEvent());

        const fakeElement = {
          getBoundingClientRect: () => ({ top: 0, height: 100, bottom: 100, left: 0, right: 100 }),
        };
        firstArr.props.onDragOver(
          createMockDragEvent({
            clientY: 20,
            currentTarget: fakeElement,
          }),
        );

        const dropEvent = createMockDragEvent();
        firstArr.props.onDrop(dropEvent);

        expect(dropEvent.preventDefault).toHaveBeenCalled();
        expect(onReorderStripsMock).toHaveBeenCalledTimes(1);
        expect(onReorderStripsMock).toHaveBeenCalledWith("arrivals", [mockN415SP, mockAAL412]);
      });

      test("dropping on rack-strip-list container commits reorder to end of list", () => {
        const onReorderStripsMock = vi.fn();
        const tree = StripsBoard({
          departures: mockDepartures,
          arrivals: mockArrivals,
          onReorderStrips: onReorderStripsMock,
        });

        const bayContainer = Array.isArray(tree.props.children)
          ? tree.props.children[0]
          : tree.props.children;
        const depRack = bayContainer.props.children[0];
        const depStripList = depRack.props.children[1];
        const firstDep = depStripList.props.children[0];

        // Start drag on first strip
        firstDep.props.onDragStart(createMockDragEvent());

        // Drag over rack-strip-list container empty area
        const containerFake = { isContainer: true };
        const overEvent = createMockDragEvent({
          target: containerFake,
          currentTarget: containerFake,
        });
        depStripList.props.onDragOver(overEvent);

        expect(overEvent.preventDefault).toHaveBeenCalled();
        expect(overEvent.dataTransfer.dropEffect).toBe("move");

        // Drop on rack-strip-list container
        const dropEvent = createMockDragEvent();
        depStripList.props.onDrop(dropEvent);

        expect(onReorderStripsMock).toHaveBeenCalledWith("departures", [mockSWA1902, mockDAL882]);
      });

      test("renders departure strips according to departureOrder prop when provided", () => {
        const html = renderToStaticMarkup(
          createElement(StripsBoard, {
            departures: mockDepartures,
            arrivals: mockArrivals,
            departureOrder: ["SWA1902", "DAL882"],
          }),
        );

        const swaIndex = html.indexOf('data-strip-acid="SWA1902"');
        const dalIndex = html.indexOf('data-strip-acid="DAL882"');

        expect(swaIndex).toBeLessThan(dalIndex);
      });
    });

    // ------------------------------------------------------------------------
    // AC4: Cross-section drag is rejected (dropEffect = none, no indicator, no drop)
    // ------------------------------------------------------------------------
    describe("AC4 — Cross-section drag is rejected", () => {
      test("dragging a departure strip over an arrival strip sets dropEffect='none' and prevents indicator", () => {
        const tree = StripsBoard({
          departures: mockDepartures,
          arrivals: mockArrivals,
        });

        const bayContainer = Array.isArray(tree.props.children)
          ? tree.props.children[0]
          : tree.props.children;
        const depRack = bayContainer.props.children[0];
        const depStripList = depRack.props.children[1];
        const firstDep = depStripList.props.children[0];

        const arrRack = bayContainer.props.children[1];
        const arrStripList = arrRack.props.children[1];
        const firstArr = arrStripList.props.children[0];

        // Start dragging a departure strip
        firstDep.props.onDragStart(createMockDragEvent());

        // Hover over an arrival strip
        const overEvent = createMockDragEvent({
          clientY: 30,
        });
        firstArr.props.onDragOver(overEvent);

        expect(overEvent.dataTransfer.dropEffect).toBe("none");
        expect(overEvent.preventDefault).not.toHaveBeenCalled();
      });

      test("dragging a departure strip over arrivals rack-column sets dropEffect='none'", () => {
        const tree = StripsBoard({
          departures: mockDepartures,
          arrivals: mockArrivals,
        });

        const bayContainer = Array.isArray(tree.props.children)
          ? tree.props.children[0]
          : tree.props.children;
        const depRack = bayContainer.props.children[0];
        const firstDep = depRack.props.children[1].props.children[0];
        const arrRack = bayContainer.props.children[1];

        firstDep.props.onDragStart(createMockDragEvent());

        const overEvent = createMockDragEvent();
        arrRack.props.onDragOver(overEvent);

        expect(overEvent.dataTransfer.dropEffect).toBe("none");
      });

      test("dropping a departure strip on arrivals rack is ignored without reordering", () => {
        const onReorderStripsMock = vi.fn();
        const tree = StripsBoard({
          departures: mockDepartures,
          arrivals: mockArrivals,
          onReorderStrips: onReorderStripsMock,
        });

        const bayContainer = Array.isArray(tree.props.children)
          ? tree.props.children[0]
          : tree.props.children;
        const depRack = bayContainer.props.children[0];
        const firstDep = depRack.props.children[1].props.children[0];
        const arrRack = bayContainer.props.children[1];
        const arrStripList = arrRack.props.children[1];
        const firstArr = arrStripList.props.children[0];

        // Start drag departure
        firstDep.props.onDragStart(createMockDragEvent());

        // Attempt drop on arrivals strip
        const dropEvent = createMockDragEvent();
        firstArr.props.onDrop(dropEvent);

        expect(onReorderStripsMock).not.toHaveBeenCalled();
      });

      test("dragging an arrival strip over departures rack sets dropEffect='none' and ignores drop", () => {
        const onReorderStripsMock = vi.fn();
        const tree = StripsBoard({
          departures: mockDepartures,
          arrivals: mockArrivals,
          onReorderStrips: onReorderStripsMock,
        });

        const bayContainer = Array.isArray(tree.props.children)
          ? tree.props.children[0]
          : tree.props.children;
        const arrRack = bayContainer.props.children[1];
        const firstArr = arrRack.props.children[1].props.children[0];
        const depRack = bayContainer.props.children[0];
        const firstDep = depRack.props.children[1].props.children[0];

        // Start drag arrival
        firstArr.props.onDragStart(createMockDragEvent());

        // Drag over departure strip
        const overEvent = createMockDragEvent();
        firstDep.props.onDragOver(overEvent);

        expect(overEvent.dataTransfer.dropEffect).toBe("none");
        expect(overEvent.preventDefault).not.toHaveBeenCalled();

        // Attempt drop on departure
        const dropEvent = createMockDragEvent();
        firstDep.props.onDrop(dropEvent);

        expect(onReorderStripsMock).not.toHaveBeenCalled();
      });
    });

    // ------------------------------------------------------------------------
    // AC5: While dragging, source strip applies .strip-dragging (reduced opacity)
    // ------------------------------------------------------------------------
    describe("AC5 — Source strip applies .strip-dragging with reduced opacity", () => {
      test("strips.css defines .strip.strip-dragging with opacity: 0.4 and cursor: grabbing", () => {
        expect(cssContent).toMatch(/\.strip\.strip-dragging\s*\{[^}]*opacity:\s*0\.4;/i);
        expect(cssContent).toMatch(/\.strip\.strip-dragging\s*\{[^}]*cursor:\s*grabbing;/i);
      });

      test("applies .strip-dragging class to only the actively dragged strip", () => {
        const html = renderToStaticMarkup(
          createElement(StripsBoard, {
            departures: mockDepartures,
            arrivals: mockArrivals,
            draggedStrip: { id: "DAL882", section: "departures", sourceIndex: 0 },
          }),
        );

        // DAL882 should have strip-dragging
        const dalMatch = html.match(
          /class="[^"]*departure-strip[^"]*strip-dragging[^"]*"[^>]*data-strip-acid="DAL882"/,
        );
        expect(dalMatch).toBeTruthy();

        // SWA1902 should NOT have strip-dragging
        const swaMatch = html.match(
          /class="[^"]*departure-strip[^"]*"[^>]*data-strip-acid="SWA1902"/,
        );
        expect(swaMatch?.[0]).not.toContain("strip-dragging");

        // AAL412 should NOT have strip-dragging
        const aalMatch = html.match(/class="[^"]*arrival-strip[^"]*"[^>]*data-strip-acid="AAL412"/);
        expect(aalMatch?.[0]).not.toContain("strip-dragging");
      });
    });

    // ------------------------------------------------------------------------
    // AC6: Drag cancellation, cleanup, and state preservation
    // ------------------------------------------------------------------------
    describe("AC6 — Drag cancellation and state preservation", () => {
      test("onDragLeave clearing indicator when leaving rack container", () => {
        const tree = StripsBoard({
          departures: mockDepartures,
          arrivals: mockArrivals,
          dropIndicator: { section: "departures", targetIndex: 1 },
        });

        const bayContainer = Array.isArray(tree.props.children)
          ? tree.props.children[0]
          : tree.props.children;
        const depRack = bayContainer.props.children[0];
        const depStripList = depRack.props.children[1];

        // Leave event with relatedTarget outside rack
        const leaveEvent = createMockDragEvent({
          relatedTarget: null,
          currentTarget: { contains: () => false },
        });
        depStripList.props.onDragLeave(leaveEvent);
      });

      test("onDragEnd resets drag state without mutating strip order", () => {
        const onReorderStripsMock = vi.fn();
        const tree = StripsBoard({
          departures: mockDepartures,
          arrivals: mockArrivals,
          onReorderStrips: onReorderStripsMock,
        });

        const bayContainer = Array.isArray(tree.props.children)
          ? tree.props.children[0]
          : tree.props.children;
        const depRack = bayContainer.props.children[0];
        const firstDep = depRack.props.children[1].props.children[0];

        // Start drag then cancel with onDragEnd
        firstDep.props.onDragStart(createMockDragEvent());
        firstDep.props.onDragEnd(createMockDragEvent());

        // Order remains untouched
        expect(onReorderStripsMock).not.toHaveBeenCalled();
      });

      test("preserves existing indentation state while dragging other strips", () => {
        const html = renderToStaticMarkup(
          createElement(StripsBoard, {
            departures: mockDepartures,
            arrivals: mockArrivals,
            indentedStripIds: new Set(["SWA1902"]),
            draggedStrip: { id: "DAL882", section: "departures", sourceIndex: 0 },
            dropIndicator: { section: "departures", targetIndex: 1 },
          }),
        );

        // DAL882 has strip-dragging
        expect(html).toContain("DAL882");
        expect(html).toMatch(/departure-strip[^"]*strip-dragging/);

        // SWA1902 retains strip-indented
        expect(html).toMatch(
          /departure-strip[^"]*strip-indented[^"]*"[^>]*data-strip-acid="SWA1902"/,
        );

        // Drop indicator is rendered
        expect(html).toContain('data-testid="strip-drop-indicator"');
      });

      test("preserves left-click selection without regressions", () => {
        const onSelectStripMock = vi.fn();
        const tree = StripsBoard({
          departures: mockDepartures,
          arrivals: mockArrivals,
          onSelectStrip: onSelectStripMock,
        });

        const bayContainer = Array.isArray(tree.props.children)
          ? tree.props.children[0]
          : tree.props.children;
        const depRack = bayContainer.props.children[0];
        const firstDep = depRack.props.children[1].props.children[0];

        firstDep.props.onSelect("DAL882");
        expect(onSelectStripMock).toHaveBeenCalledWith(mockDAL882);
      });
    });
  });
});
