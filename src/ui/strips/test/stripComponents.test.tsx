import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import { ArrivalStrip } from "../ArrivalStrip";
import { DepartureStrip } from "../DepartureStrip";
import { mockAAL412, mockDAL882, mockN415SP, mockSWA1902 } from "../mockFixture";
import type { ArrivalStripData, DepartureStripData } from "../types";

const cssContent = readFileSync(new URL("../strips.css", import.meta.url), "utf8");

describe("T02-91 Flight Progress Strips Departure and Arrival Components", () => {
  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // AC1: DepartureStrip 5 columns with subgrids matching FAA layout
  // --------------------------------------------------------------------------
  describe("AC1 — DepartureStrip layout and subgrids", () => {
    test("renders 5 columns with proper column identifiers and classes", () => {
      const html = renderToStaticMarkup(createElement(DepartureStrip, { strip: mockDAL882 }));

      expect(html).toContain('class="strip departure-strip');
      expect(html).toContain('data-col="1"');
      expect(html).toContain('data-col="2"');
      expect(html).toContain('data-col="3"');
      expect(html).toContain('data-col="4"');
      expect(html).toContain('data-col="5"');
      expect(html).toContain("col-ident");
      expect(html).toContain("col-fix-data");
      expect(html).toContain("col-local");
      expect(html).toContain("col-route");
      expect(html).toContain("col-matrix");
    });

    test("renders Column 1 boxes: ACID (Box 1), Revision (Box 2), Equipment (Box 3), Computer ID (Box 4)", () => {
      const html = renderToStaticMarkup(createElement(DepartureStrip, { strip: mockDAL882 }));

      expect(html).toContain('data-box="1"');
      expect(html).toContain('data-box="2"');
      expect(html).toContain('data-box="3"');
      expect(html).toContain('data-box="4"');

      // DAL882 values
      expect(html).toContain("DAL882");
      expect(html).toContain("D/B738/L"); // CWT 'D' prefix + B738 + /L suffix
      expect(html).toContain("101"); // Computer ID

      // Revision number 0 renders empty string
      const revMatch = html.match(/data-box="2"[^>]*>(.*?)<\/div>/s);
      expect(revMatch?.[1]?.trim()).toBe("");
    });

    test("renders revision number >= 1 in Box 2 for revised departure", () => {
      const html = renderToStaticMarkup(createElement(DepartureStrip, { strip: mockSWA1902 }));

      expect(html).toContain("SWA1902");
      expect(html).toContain("E/B737/G");
      expect(html).toContain("102");

      const revMatch = html.match(/data-box="2"[^>]*>(.*?)<\/div>/s);
      expect(revMatch?.[1]?.trim()).toBe("1");
    });

    test("renders Column 2 boxes: Beacon code (Box 5), Proposed time (Box 6 with P-prefix), Requested altitude (Box 7)", () => {
      const html = renderToStaticMarkup(createElement(DepartureStrip, { strip: mockDAL882 }));

      expect(html).toContain('data-box="5"');
      expect(html).toContain('data-box="6"');
      expect(html).toContain('data-box="7"');

      expect(html).toContain("4215"); // Beacon squawk
      expect(html).toContain("P1430"); // Proposed departure time
      expect(html).toContain("330"); // Requested altitude
    });

    test("renders Column 3 Box 8 with Departure Airport", () => {
      const html = renderToStaticMarkup(createElement(DepartureStrip, { strip: mockDAL882 }));

      expect(html).toContain('data-box="8"');
      expect(html).toContain("KATL");
    });

    test("renders Column 4 Box 9 with route, destination airport, and remarks", () => {
      const html = renderToStaticMarkup(createElement(DepartureStrip, { strip: mockDAL882 }));

      expect(html).toContain('data-box="9"');
      expect(html).toContain("PLIER2 PLIER SPA J51 FAK PHL");
      expect(html).toContain("KPHL");
      expect(html).toContain("RNAV / CPDLC");
    });
  });

  // --------------------------------------------------------------------------
  // AC2: ArrivalStrip layout, previous fix, coordination fix, ETA, split Col 4
  // --------------------------------------------------------------------------
  describe("AC2 — ArrivalStrip layout and fields", () => {
    test("renders 5 columns with proper column identifiers and classes", () => {
      const html = renderToStaticMarkup(createElement(ArrivalStrip, { strip: mockAAL412 }));

      expect(html).toContain('class="strip arrival-strip');
      expect(html).toContain('data-col="1"');
      expect(html).toContain('data-col="2"');
      expect(html).toContain('data-col="3"');
      expect(html).toContain('data-col="4"');
      expect(html).toContain('data-col="5"');
      expect(html).toContain("col-ident");
      expect(html).toContain("col-fix-data");
      expect(html).toContain("col-local");
      expect(html).toContain("col-route");
      expect(html).toContain("col-matrix");
    });

    test("renders Column 2 with beacon (Box 5), previous fix (Box 6), and coordination fix (Box 7)", () => {
      const html = renderToStaticMarkup(createElement(ArrivalStrip, { strip: mockAAL412 }));

      expect(html).toContain('data-box="5"');
      expect(html).toContain('data-box="6"');
      expect(html).toContain('data-box="7"');

      expect(html).toContain("0120"); // 4-digit padded squawk
      expect(html).toContain("BOS"); // Previous fix
      expect(html).toContain("HONIE"); // Coordination fix
    });

    test("renders Column 3 Box 8 displaying Estimated Time of Arrival (ETA) with A-prefix", () => {
      const html = renderToStaticMarkup(createElement(ArrivalStrip, { strip: mockAAL412 }));

      expect(html).toContain('data-box="8"');
      expect(html).toContain("A1440"); // ETA
    });

    test("renders Column 4 split into Box 9 (Flight Rules 'IFR'/'VFR') and Box 9A (Destination & remarks)", () => {
      const ifrHtml = renderToStaticMarkup(createElement(ArrivalStrip, { strip: mockAAL412 }));

      expect(ifrHtml).toContain('data-box="9"');
      expect(ifrHtml).toContain('data-box="9A"');
      expect(ifrHtml).toContain("col-route-arrival");

      // IFR renders 'IFR'
      expect(ifrHtml).toContain("IFR");
      expect(ifrHtml).toContain("KATL");
      expect(ifrHtml).toContain("RNAV STAR");

      // VFR renders 'VFR'
      const vfrHtml = renderToStaticMarkup(createElement(ArrivalStrip, { strip: mockN415SP }));
      expect(vfrHtml).toContain("VFR");
      expect(vfrHtml).toContain("KPDK");
      expect(vfrHtml).toContain("TOUCH AND GO");
    });
  });

  // --------------------------------------------------------------------------
  // AC3: Lower annotations render 9 equal-width boxes (10-18) and upper 8A/8B
  // --------------------------------------------------------------------------
  describe("AC3 — Upper annotations (8A, 8B) and 9 lower equal-width boxes (10–18)", () => {
    test("renders upper annotations Box 8A and Box 8B for DepartureStrip", () => {
      const html = renderToStaticMarkup(createElement(DepartureStrip, { strip: mockDAL882 }));

      expect(html).toContain('data-box="8A"');
      expect(html).toContain('data-box="8B"');
      expect(html).toContain("box-8a");
      expect(html).toContain("box-8b");
      expect(html).toContain("26L"); // Box 8A runway
      expect(html).toContain("D"); // Box 8B gate/fix
    });

    test("renders upper annotations Box 8A and Box 8B for ArrivalStrip", () => {
      const html = renderToStaticMarkup(createElement(ArrivalStrip, { strip: mockAAL412 }));

      expect(html).toContain('data-box="8A"');
      expect(html).toContain('data-box="8B"');
      expect(html).toContain("26R");
      expect(html).toContain("A");
    });

    test("renders exactly 9 lower annotation boxes numbered 10 to 18 for DepartureStrip", () => {
      const html = renderToStaticMarkup(createElement(DepartureStrip, { strip: mockDAL882 }));

      for (let i = 10; i <= 18; i++) {
        expect(html).toContain(`data-box="${i}"`);
        expect(html).toContain(`box-${i}`);
      }
    });

    test("renders exactly 9 lower annotation boxes numbered 10 to 18 for ArrivalStrip", () => {
      const html = renderToStaticMarkup(createElement(ArrivalStrip, { strip: mockN415SP }));

      for (let i = 10; i <= 18; i++) {
        expect(html).toContain(`data-box="${i}"`);
        expect(html).toContain(`box-${i}`);
      }
    });

    test("renders custom text in lower annotation boxes when provided", () => {
      const customStrip: DepartureStripData = {
        ...mockDAL882,
        id: "TEST1",
        annotationBoxes: {
          box8A: "08R",
          box8B: "G12",
          boxes10to18: ["HOLD", "EFC1500", "L10", "", "", "", "", "", "X"],
        },
      };

      const html = renderToStaticMarkup(createElement(DepartureStrip, { strip: customStrip }));

      expect(html).toContain("HOLD");
      expect(html).toContain("EFC1500");
      expect(html).toContain("L10");
      expect(html).toContain("X");
      expect(html).toContain("08R");
      expect(html).toContain("G12");
    });
  });

  // --------------------------------------------------------------------------
  // AC4: Buff background (#F5EEDC), dark holder borders, uppercase monospace fonts
  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // AC4: Buff background (#f5eedc), dark borders, uppercase monospace fonts
  // --------------------------------------------------------------------------
  describe("AC4 — Styling and CSS specifications", () => {
    test("strips.css defines pale buff background #f5eedc", () => {
      expect(cssContent).toMatch(/background-color:\s*#f5eedc/i);
    });

    test("strips.css defines strip border 1px solid #333", () => {
      expect(cssContent).toMatch(/border:\s*1px\s+solid\s+#333/i);
    });

    test("strips.css defines inner borders 1px solid #333", () => {
      expect(cssContent).toMatch(/border.*:\s*1px\s+solid\s+#333/i);
    });

    test("strips.css defines monospace font family with Consolas", () => {
      expect(cssContent).toMatch(/font-family:\s*Consolas/i);
      expect(cssContent).toMatch(/monospace/i);
    });

    test("strips.css defines bold font-weight and uppercase text-transform", () => {
      expect(cssContent).toMatch(/font-weight:\s*(bold|700)/i);
      expect(cssContent).toMatch(/text-transform:\s*uppercase/i);
    });

    test("strips.css defines dimensions height 120px and max-width 840px", () => {
      expect(cssContent).toMatch(/height:\s*120px/);
      expect(cssContent).toMatch(/max-width:\s*840px/);
    });

    test("strips.css defines 5-column subgrid layout matching 1.4fr 0.7fr 0.9fr 2.2fr 1.1fr", () => {
      expect(cssContent).toMatch(
        /grid-template-columns:\s*1\.4fr\s+0\.7fr\s+0\.9fr\s+2\.2fr\s+1\.1fr/,
      );
    });
  });

  // --------------------------------------------------------------------------
  // AC5: Unit tests pass 100% including DOM structure, box labels, classes, click handlers
  // --------------------------------------------------------------------------
  describe("AC5 — DOM structure, box labels, classes, and click handlers", () => {
    test("boxes have data-box attributes without rendering visible box-label elements", () => {
      const html = renderToStaticMarkup(createElement(DepartureStrip, { strip: mockDAL882 }));

      // No visible box-label elements
      expect(html).not.toContain("box-label");

      // Box 1 through 9, 8A, 8B, 10 through 18
      const expectedBoxes = [
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "8A",
        "8B",
        "9",
        "10",
        "11",
        "12",
        "13",
        "14",
        "15",
        "16",
        "17",
        "18",
      ];
      for (const box of expectedBoxes) {
        expect(html).toContain(`data-box="${box}"`);
      }
    });

    test("ArrivalStrip has data-box attributes 1 to 8, 8A, 8B, 9, 9A, 10 to 18 without box-label elements", () => {
      const html = renderToStaticMarkup(createElement(ArrivalStrip, { strip: mockAAL412 }));

      expect(html).not.toContain("box-label");

      const expectedBoxes = [
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "8A",
        "8B",
        "9",
        "9A",
        "10",
        "11",
        "12",
        "13",
        "14",
        "15",
        "16",
        "17",
        "18",
      ];
      for (const box of expectedBoxes) {
        expect(html).toContain(`data-box="${box}"`);
      }
    });

    test("applies strip-selected class when selected prop is true", () => {
      const selectedHtml = renderToStaticMarkup(
        createElement(DepartureStrip, { strip: mockDAL882, selected: true }),
      );
      expect(selectedHtml).toContain("strip-selected");

      const unselectedHtml = renderToStaticMarkup(
        createElement(DepartureStrip, { strip: mockDAL882, selected: false }),
      );
      expect(unselectedHtml).not.toContain("strip-selected");
    });

    test("applies custom className when provided", () => {
      const html = renderToStaticMarkup(
        createElement(DepartureStrip, { strip: mockDAL882, className: "custom-rack-item" }),
      );
      expect(html).toContain("custom-rack-item");
    });

    test("calls onSelect callback when strip is clicked (simulated via DepartureStrip props)", () => {
      const onSelectMock = vi.fn();
      const rendered = DepartureStrip({
        strip: mockDAL882,
        onSelect: onSelectMock,
      });

      // Invoke onClick from rendered element props
      rendered.props.onClick?.();
      expect(onSelectMock).toHaveBeenCalledTimes(1);
      expect(onSelectMock).toHaveBeenCalledWith("DAL882");
    });

    test("calls onSelect callback when ArrivalStrip is clicked", () => {
      const onSelectMock = vi.fn();
      const rendered = ArrivalStrip({
        strip: mockAAL412,
        onSelect: onSelectMock,
      });

      rendered.props.onClick?.();
      expect(onSelectMock).toHaveBeenCalledTimes(1);
      expect(onSelectMock).toHaveBeenCalledWith("AAL412");
    });

    test("supports keyboard activation via onKeyDown (Enter and Space)", () => {
      const onSelectMock = vi.fn();
      const rendered = DepartureStrip({
        strip: mockDAL882,
        onSelect: onSelectMock,
      });

      const enterEvent = {
        key: "Enter",
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent;
      rendered.props.onKeyDown?.(enterEvent);
      expect(onSelectMock).toHaveBeenCalledWith("DAL882");
      expect(enterEvent.preventDefault).toHaveBeenCalled();

      const spaceEvent = { key: " ", preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
      rendered.props.onKeyDown?.(spaceEvent);
      expect(onSelectMock).toHaveBeenCalledTimes(2);

      const tabEvent = { key: "Tab", preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
      rendered.props.onKeyDown?.(tabEvent);
      expect(onSelectMock).toHaveBeenCalledTimes(2); // unchanged
    });

    test("handles missing optional fields gracefully without crashing", () => {
      const minimalDeparture: DepartureStripData = {
        id: "MIN1",
        stripType: "DEPARTURE",
        acid: "MIN1",
        rawType: "C172",
        beaconCode: "1200",
        proposedDepartureTime: "1200",
        requestedAltitude: "045",
        departureAirport: "KXYZ",
        route: "DIRECT",
        destinationAirport: "KABC",
      };

      const depHtml = renderToStaticMarkup(
        createElement(DepartureStrip, { strip: minimalDeparture }),
      );
      expect(depHtml).toContain("MIN1");
      expect(depHtml).toContain("C172");
      expect(depHtml).toContain("DIRECT");

      const minimalArrival: ArrivalStripData = {
        id: "MIN2",
        stripType: "ARRIVAL",
        acid: "MIN2",
        rawType: "PA28",
        beaconCode: "0234",
        coordinationFix: "WAYPT",
        estimatedTimeOfArrival: "1300",
        flightRules: "VFR",
        destinationAirport: "KXYZ",
      };

      const arrHtml = renderToStaticMarkup(createElement(ArrivalStrip, { strip: minimalArrival }));
      expect(arrHtml).toContain("MIN2");
      expect(arrHtml).toContain("PA28");
      expect(arrHtml).toContain("WAYPT");
    });
  });
});
