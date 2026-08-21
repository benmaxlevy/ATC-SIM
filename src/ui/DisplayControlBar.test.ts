import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import {
  RANGE_PRESETS_NM,
  beginAltitudeFilterChord,
  centerOnAirport,
  createScopeView,
  cycleRange,
  formatDcbRangeReadout,
  handleFilterEntryKey,
  parseDigitalMap,
  toggleDcbSubmenu,
  toggleHistoryEnabled,
  toggleMapLayer,
  togglePtlOn,
  tryApplyAltitudeFilterDigits,
} from "@scope";
import { loadKdem } from "@scenario";
import { DCB_FONT_PX, DCB_HEIGHT_PX, DisplayControlBar } from "./DisplayControlBar";

const uiSources = import.meta.glob("./*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function cssSrc(): string {
  return readFileSync(new URL("../index.css", import.meta.url), "utf8");
}

const mainSources = import.meta.glob("../main.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function barSrc(): string {
  return uiSources["./DisplayControlBar.tsx"]!;
}

function canvasSrc(): string {
  return uiSources["./ScopeCanvas.tsx"]!;
}

function placeholderSrc(): string {
  return readFileSync(new URL("../scope/ppi-placeholder.tsx", import.meta.url), "utf8");
}

function dcbHtml(view = createScopeView()): string {
  return renderToStaticMarkup(
    createElement(DisplayControlBar, { view, onChange: () => undefined }),
  );
}

test("AC1 — no input and no Apply in the DCB DOM", () => {
  const html = dcbHtml();
  expect(html).not.toMatch(/<input/i);
  expect(html).not.toMatch(/Apply/);
  expect(barSrc()).not.toMatch(/<input/);
  expect(barSrc()).not.toMatch(/>\s*Apply\s*</);
  expect(barSrc()).not.toMatch(/type=["']text["']/);
  expect(cssSrc()).not.toMatch(/\.dcb-lite-fil/);
});

test("AC2 — RANGE click cycles 5–60 presets; readout is RANGE n", () => {
  expect(barSrc()).toMatch(/cycleRange\(view\.camera\)/);
  expect(barSrc()).toMatch(/formatDcbRangeReadout/);
  expect(barSrc()).not.toMatch(/>\s*[−+]\s*</);
  expect(RANGE_PRESETS_NM).toEqual([5, 10, 15, 20, 30, 40, 50, 60]);

  const view = createScopeView();
  expect(formatDcbRangeReadout(view.camera.rangeNm)).toBe("RANGE 20");
  const seen: number[] = [view.camera.rangeNm];
  for (let i = 0; i < RANGE_PRESETS_NM.length; i += 1) {
    cycleRange(view.camera);
    seen.push(view.camera.rangeNm);
  }
  expect(seen).toEqual([20, 30, 40, 50, 60, 5, 10, 15, 20]);
  expect(dcbHtml(view)).toContain("RANGE 20");
});

test("AC3 — PTL and HIST cells match F7/F8", () => {
  expect(barSrc()).toMatch(/togglePtlOn\(view\)/);
  expect(barSrc()).toMatch(/toggleHistoryEnabled\(view\)/);
  expect(barSrc()).toMatch(/>\s*PTL\s*</);
  expect(barSrc()).toMatch(/>\s*HIST\s*</);
  const view = createScopeView();
  expect(view.ptlOn).toBe(false);
  expect(view.historyEnabled).toBe(true);
  togglePtlOn(view);
  toggleHistoryEnabled(view);
  expect(view.ptlOn).toBe(true);
  expect(view.historyEnabled).toBe(false);
  const html = dcbHtml(view);
  expect(html).toMatch(/data-dcb-ptl=""/);
  expect(html).toMatch(/aria-pressed="true"/);
});

test("AC4 — FILTER cell applies the same predicate as the F chord; invalid max<min does not apply", () => {
  expect(barSrc()).toMatch(/beginAltitudeFilterChord\(view\)/);
  expect(barSrc()).toMatch(/>\s*FILTER\s*</);
  expect(barSrc()).not.toMatch(/DCB_FIL_MIN_ID/);
  const view = createScopeView();
  beginAltitudeFilterChord(view, 0);
  expect(view.filterEntry.phase).toBe("min");
  expect(handleFilterEntryKey(view.filterEntry, view.altitudeFilter, "0", 10)).toBe(true);
  expect(handleFilterEntryKey(view.filterEntry, view.altitudeFilter, "5", 20)).toBe(true);
  expect(handleFilterEntryKey(view.filterEntry, view.altitudeFilter, "0", 30)).toBe(true);
  expect(handleFilterEntryKey(view.filterEntry, view.altitudeFilter, "Enter", 40)).toBe(true);
  expect(handleFilterEntryKey(view.filterEntry, view.altitudeFilter, "1", 50)).toBe(true);
  expect(handleFilterEntryKey(view.filterEntry, view.altitudeFilter, "0", 60)).toBe(true);
  expect(handleFilterEntryKey(view.filterEntry, view.altitudeFilter, "0", 70)).toBe(true);
  expect(handleFilterEntryKey(view.filterEntry, view.altitudeFilter, "Enter", 80)).toBe(true);
  expect(view.altitudeFilter).toEqual({ minHundreds: 50, maxHundreds: 100 });
  expect(tryApplyAltitudeFilterDigits(view.altitudeFilter, "120", "050")).toBe(false);
  expect(view.altitudeFilter).toEqual({ minHundreds: 50, maxHundreds: 100 });
  expect(dcbHtml(view)).toContain("050-100");
});

test("AC5 — no command.accepted from DCB clicks", () => {
  const bar = barSrc();
  const canvas = canvasSrc();
  expect(bar).not.toMatch(/from\s+["']@parse["']/);
  expect(bar).not.toMatch(/from\s+["']@pilot["']/);
  expect(bar).not.toMatch(/from\s+["']@core\/command/);
  expect(bar).not.toMatch(/handleRadioText/);
  expect(bar).not.toMatch(/submitCommand/);
  expect(bar).not.toMatch(/parseRadioText/);
  expect(bar).not.toMatch(/from\s+["']@core["']/);
  expect(canvas).not.toMatch(/from\s+["']@parse["']/);
  expect(canvas).not.toMatch(/from\s+["']@pilot["']/);
  expect(canvas).not.toMatch(/submitCommand/);
  expect(bar).toMatch(/Never a Command/);
  expect(mainSources["../main.tsx"]).toMatch(/syncDisplayControlBar\(scopeView/);
});

test("AC7 — Research: labels are RANGE/MAPS/FILTER/PTL/HIST, not Zoom/Layers", () => {
  const bar = barSrc();
  const html = dcbHtml();
  expect(html).toContain("RANGE 20");
  expect(html).toContain("MAPS");
  expect(html).toContain("FILTER");
  expect(html).toContain("PTL");
  expect(html).toContain("HIST");
  expect(html).toContain("RR 5");
  expect(html).toContain("LDR");
  expect(html).toContain("CHAR 12");
  expect(html).toContain("BRITE 2");
  expect(html).toContain("PLACE");
  expect(html).toContain("CNTR");
  expect(html).toContain("000-180");
  expect(bar.toLowerCase()).not.toMatch(/\bzoom\b/);
  expect(bar.toLowerCase()).not.toMatch(/\blayers\b/);
  expect(bar.toLowerCase()).not.toMatch(/\bhud\b/);
  expect(bar).toMatch(/analog: CRC STARS DCB/i);
  expect(bar).toMatch(/range rings/i);
  expect(bar).toMatch(/leader/i);
  expect(bar).not.toMatch(/FLIGHT STRIPS/);
  expect(html).not.toMatch(/FLIGHT STRIPS/);
});

test("cells sit on the PPI glass; canvas below pads the range circle", () => {
  expect(canvasSrc()).toMatch(/className="ppi-column"/);
  expect(canvasSrc()).toMatch(/header=\{<DisplayControlBar/);
  expect(placeholderSrc()).toMatch(/\{header\}/);
  expect(placeholderSrc().indexOf("{header}")).toBeLessThan(placeholderSrc().indexOf("<canvas"));
  expect(DCB_HEIGHT_PX).toBe(36);
  expect(DCB_FONT_PX).toBe(11);

  const css = cssSrc();
  expect(css).toMatch(/\.ppi-host\s*\{[^}]*flex-direction:\s*column/s);
  expect(css).toMatch(/\.dcb\s*\{[^}]*flex:\s*0 0 36px/s);
  expect(css).toMatch(/\.dcb\s*\{[^}]*gap:\s*1px/s);
  expect(css).toMatch(/\.dcb\s*\{[^}]*background:\s*#000000/s);
  expect(css).toMatch(/\.dcb-cell\s*\{[^}]*background:\s*var\(--dcb-cell,\s*#003300\)/s);
  expect(css).toMatch(/\.dcb-cell\s*\{[^}]*color:\s*var\(--dcb-text,\s*#00aa00\)/s);
  expect(css).toMatch(/\.dcb-cell\s*\{[^}]*border-radius:\s*0/s);
  expect(css).toMatch(/\.dcb-cell\s*\{[^}]*box-shadow:\s*none/s);
  expect(css).toMatch(/\.ppi-canvas\s*\{[^}]*flex:\s*1 1 auto/s);
  expect(barSrc()).toMatch(/PALETTE\.dcbCell/);
  expect(barSrc()).toMatch(/PALETTE\.map/);
  expect(barSrc()).toMatch(/focusPpi/);
  expect(barSrc()).toMatch(/onMouseDown=\{preventButtonFocus\}/);
});

test("MAPS submenu lists catalog dcbLabels; RWY/LOC/CST stay wired; CST disabled when JSON off", () => {
  expect(barSrc()).toMatch(/toggleMapLayer\(view,\s*layer\)/);
  expect(barSrc()).toMatch(/toggleVideoMap/);
  expect(barSrc()).toMatch(/>\s*RWY\s*</);
  expect(barSrc()).toMatch(/>\s*LOC\s*</);
  expect(barSrc()).toMatch(/>\s*CST\s*</);
  expect(barSrc()).toMatch(/dcbLabel/);
  expect(barSrc()).toMatch(/disabled=\{!coastOn\}/);

  const view = createScopeView(0, 0, { digitalMap: parseDigitalMap(loadKdem().maps) });
  toggleDcbSubmenu(view, "maps");
  const html = dcbHtml(view);
  expect(html).toContain("RWY27");
  expect(html).toContain("COAST");
  expect(html).toContain("DWNWND");
  expect(html).toContain("CLASS_B");
  expect(html).toContain('data-dcb-map-id="COAST"');

  const off = createScopeView(0, 0, {
    digitalMap: {
      rangeRings: { intervalNm: 5, maxNm: 60 },
      coastline: {
        enabled: false,
        polyline: [
          [0, 0],
          [2, 0],
        ],
      },
    },
  });
  toggleMapLayer(off, "runway");
  toggleMapLayer(off, "localizer");
  toggleMapLayer(off, "rings");
  toggleMapLayer(off, "coastline");
  expect(off.showRunway).toBe(false);
  expect(off.showLocalizer).toBe(false);
  expect(off.showRings).toBe(false);
  expect(off.showCoastline).toBe(false);

  const on = createScopeView(0, 0, {
    digitalMap: {
      rangeRings: { intervalNm: 5, maxNm: 60 },
      coastline: {
        enabled: true,
        polyline: [
          [0, 0],
          [2, 0],
        ],
      },
    },
  });
  expect(on.showCoastline).toBe(true);
  toggleMapLayer(on, "coastline");
  expect(on.showCoastline).toBe(false);
});

test("PLACE CNTR arms; RANGE shows OFF CNTR when panned", () => {
  expect(barSrc()).toMatch(/armPlaceCenter\(view\)/);
  expect(barSrc()).toMatch(/>\s*PLACE\s*</);
  expect(barSrc()).toMatch(/>\s*CNTR\s*</);
  const view = createScopeView();
  view.camera.centerEastNm = 4;
  view.camera.centerNorthNm = -3;
  expect(dcbHtml(view)).toContain("OFF CNTR");
  centerOnAirport(view);
  expect(view.camera.centerEastNm).toBe(view.airportEastNm);
  expect(view.camera.centerNorthNm).toBe(view.airportNorthNm);
  expect(dcbHtml(view)).not.toContain("OFF CNTR");
});

test("LDR submenu lists L1–L9", () => {
  const view = createScopeView();
  toggleDcbSubmenu(view, "ldr");
  const html = dcbHtml(view);
  for (const dir of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    expect(html).toContain(`L${dir}`);
  }
});

test("mouse-only walkthrough mutates the same scope functions as the cells", () => {
  const view = createScopeView();
  while (view.camera.rangeNm !== 10) {
    cycleRange(view.camera);
  }
  toggleMapLayer(view, "rings");
  expect(tryApplyAltitudeFilterDigits(view.altitudeFilter, "050", "100")).toBe(true);
  togglePtlOn(view);
  expect(view.camera.rangeNm).toBe(10);
  expect(view.showRings).toBe(false);
  expect(view.altitudeFilter).toEqual({ minHundreds: 50, maxHundreds: 100 });
  expect(view.ptlOn).toBe(true);
});
