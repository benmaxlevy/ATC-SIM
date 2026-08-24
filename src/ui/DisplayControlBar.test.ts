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
  applyDcbShift,
  closeDcbMenu,
  cycleRange,
  openDcbMenu,
  formatDcbRangeReadout,
  handleFilterEntryKey,
  parseDigitalMap,
  toggleHistoryEnabled,
  toggleMapLayer,
  togglePtlOn,
  tryApplyAltitudeFilterDigits,
  stepRrInterval,
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

test("AC2 — RANGE spinner arms then steps the same 5–60 presets; readout is RANGE n", () => {
  expect(barSrc()).toMatch(/armDcbSpinner\(view,\s*"RANGE"\)/);
  expect(barSrc()).toMatch(/stepRange/);
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
  expect(bar.toLowerCase()).not.toMatch(/\bbasemap\b/);
  expect(bar.toLowerCase()).not.toMatch(/\bhud\b/);
  expect(bar).toMatch(/video map/i);
  expect(bar).toMatch(/WX1/);
  expect(bar).toMatch(/analog: CRC STARS DCB/i);
  expect(bar).toMatch(/range rings/i);
  expect(bar).toMatch(/leader/i);
  expect(bar).toMatch(/center/i);
  expect(bar).not.toMatch(/FLIGHT STRIPS/);
  expect(html).not.toMatch(/FLIGHT STRIPS/);
});

test("RR spinner readout stays RR n; does not hide rings by cycling", () => {
  const view = createScopeView();
  expect(dcbHtml(view)).toContain("RR 5");
  stepRrInterval(view, 1);
  expect(dcbHtml(view)).toContain("RR 10");
  stepRrInterval(view, -1);
  expect(dcbHtml(view)).toContain("RR 5");
  stepRrInterval(view, -1);
  expect(dcbHtml(view)).toContain("RR 2");
  expect(view.showRings).toBe(true);
});

test("cells sit on the PPI glass; canvas below fills the rectangular PPI", () => {
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
  expect(css).toMatch(/\.dcb-cell\s*\{[^}]*color:\s*var\(--dcb-text,\s*#00ff00\)/s);
  expect(css).toMatch(/\.dcb-cell\s*\{[^}]*border-radius:\s*0/s);
  expect(css).toMatch(/\.dcb-cell\s*\{[^}]*box-shadow:\s*none/s);
  expect(css).toMatch(/\.ppi-canvas\s*\{[^}]*flex:\s*1 1 auto/s);
  expect(css).toMatch(/\.command-line\s*\{[^}]*position:\s*absolute/s);
  expect(barSrc()).toMatch(/PALETTE\.dcbCell/);
  expect(barSrc()).toMatch(/PALETTE\.dcbText/);
  expect(barSrc()).toMatch(/focusPpi/);
  expect(barSrc()).toMatch(/onMouseDown=\{preventButtonFocus\}/);
});

test("T02-24 — MAIN quick maps 1–6 and MAPS slots 1–30; unused 7–30 disabled; WX disabled", () => {
  expect(barSrc()).toMatch(/toggleVideoMap/);
  expect(barSrc()).toMatch(/clearAllVideoMaps/);
  expect(barSrc()).toMatch(/toggleGeoMapsList/);
  expect(barSrc()).toMatch(/toggleCurrentMapsList/);
  expect(barSrc()).toMatch(/hideMapLists/);
  expect(barSrc()).toMatch(/dcbLabel/);
  expect(barSrc()).not.toMatch(/>\s*RWY\s*</);
  expect(barSrc()).not.toMatch(/>\s*LOC\s*</);
  expect(barSrc()).not.toMatch(/>\s*CST\s*</);
  expect(barSrc()).not.toMatch(/toggleMapLayer\(view,\s*layer\)/);

  const view = createScopeView(0, 0, { digitalMap: parseDigitalMap(loadKdem().maps) });
  const main = dcbHtml(view);
  expect(main).toContain("RWY27");
  expect(main).toContain("LOC27");
  expect(main).toContain("COAST");
  expect(main).toContain("DWNWND");
  expect(main).toContain("CLASS_B");
  expect(main).toContain("DEM1");
  for (const n of [1, 2, 3, 4, 5, 6]) {
    expect(main).toContain(`data-dcb-map-slot="${n}"`);
  }
  expect(main).not.toContain('data-dcb-map-slot="7"');
  for (const n of [1, 2, 3, 4]) {
    expect(main).toContain(`data-dcb-cell="wx${n}"`);
    expect(main).toMatch(new RegExp(`aria-label="WX${n}"[^>]*\\bdisabled\\b`));
  }

  openDcbMenu(view, "MAPS");
  const maps = dcbHtml(view);
  expect(maps).toContain("DONE");
  expect(maps).toContain("CLR");
  expect(maps).toContain("ALL");
  expect(maps).toContain("GEO");
  expect(maps).toContain("CURRENT");
  expect(maps).toContain('data-dcb-map-id="COAST"');
  for (let slot = 1; slot <= 30; slot += 1) {
    expect(maps).toContain(`data-dcb-map-slot="${slot}"`);
  }
  expect(maps).toMatch(/aria-label="Map 7"[^>]*\bdisabled\b/);
  expect(maps).toMatch(/aria-label="Map 30"[^>]*\bdisabled\b/);
  expect(main).not.toMatch(/<select/i);
  expect(maps).not.toMatch(/<select/i);
  expect(barSrc()).not.toMatch(/<select/);
  expect(barSrc()).toMatch(/FILTER/);

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

test("PLACE CNTR arms; OFF CNTR is its own cell and Home-equivalent", () => {
  expect(barSrc()).toMatch(/armPlaceCenter\(view\)/);
  expect(barSrc()).toMatch(/>\s*PLACE\s*</);
  expect(barSrc()).toMatch(/>\s*CNTR\s*</);
  expect(barSrc()).toMatch(/data-dcb-cell="off-cntr"/);
  const view = createScopeView();
  view.camera.centerEastNm = 4;
  view.camera.centerNorthNm = -3;
  const panned = dcbHtml(view);
  expect(panned).toMatch(/data-dcb-cell="off-cntr"/);
  expect(panned).toMatch(/aria-label="Off center"[^>]*aria-pressed="true"/);
  centerOnAirport(view);
  expect(view.camera.centerEastNm).toBe(view.airportEastNm);
  expect(view.camera.centerNorthNm).toBe(view.airportNorthNm);
  expect(dcbHtml(view)).toMatch(/aria-label="Off center"[^>]*aria-pressed="false"/);
});

test("MAIN has PLACE RR, RR CNTR, LDR DIR spinner, and LDR length spinner", () => {
  const html = dcbHtml();
  expect(html).toMatch(/data-dcb-cell="place-rr"/);
  expect(html).toMatch(/data-dcb-cell="rr-cntr"/);
  expect(html).toMatch(/data-dcb-cell="ldr-dir"/);
  expect(html).toMatch(/data-dcb-cell="ldr-length"/);
  expect(html).toContain("LDR DIR");
  expect(html).toContain("L8");
  expect(html).toContain("36");
  expect(barSrc()).toMatch(/stepRrInterval/);
  expect(barSrc()).toMatch(/stepDcbLeaderDir/);
  expect(barSrc()).toMatch(/stepDcbLeaderLength/);
  expect(barSrc()).not.toMatch(/openDcbMenu\(view,\s*"LDR"\)/);
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
test("AC1 — SHIFT on MAIN shows AUX (MAIN cells gone); SHIFT on AUX returns MAIN", () => {
  const view = createScopeView();
  expect(dcbHtml(view)).toContain("SHIFT");
  expect(dcbHtml(view)).toContain("RANGE 20");
  applyDcbShift(view);
  const aux = dcbHtml(view);
  expect(aux).toContain("SHIFT");
  expect(aux).toContain("VOL");
  expect(aux).not.toContain("RANGE 20");
  expect(aux).not.toContain(">MAPS<");
  expect(aux).toMatch(/disabled/);
  applyDcbShift(view);
  expect(dcbHtml(view)).toContain("RANGE 20");
  expect(dcbHtml(view)).toContain("MAPS");
});

test("AC2 — MAPS replaces the bar; DONE present; close returns MAIN", () => {
  const view = createScopeView();
  openDcbMenu(view, "MAPS");
  const html = dcbHtml(view);
  expect(html).toContain("DONE");
  expect(html).not.toContain("RANGE 20");
  closeDcbMenu(view);
  expect(dcbHtml(view)).toContain("RANGE 20");
});

test("AC4 — disabled VOL is in AUX DOM with aria-disabled", () => {
  const view = createScopeView();
  applyDcbShift(view);
  const html = dcbHtml(view);
  expect(html).toMatch(/data-dcb-cell="vol"/);
  expect(html).toMatch(/aria-disabled="true"/);
  expect(html).toMatch(/disabled/);
  expect(html).toContain("VOL");
});
