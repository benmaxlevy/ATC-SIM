import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import {
  RANGE_PRESETS_NM,
  armPlaceCenter,
  beginAltitudeFilterChord,
  buildGiLines,
  buildSsaLines,
  centerOnAirport,
  createScopeView,
  applyDcbShift,
  closeDcbMenu,
  handleDcbEscape,
  cycleRange,
  openDcbMenu,
  formatDcbRangeReadout,
  saveAsDcbPref,
  handleFilterEntryKey,
  parseDigitalMap,
  toggleGiFilter,
  toggleHistoryEnabled,
  toggleMapLayer,
  togglePtlOn,
  toggleSsaFilter,
  tryApplyAltitudeFilterDigits,
  stepRrInterval,
  PpiPlaceholder,
} from "@scope";
import { loadKdem } from "@scenario";
import {
  DCB_FONT_PX,
  DCB_HEIGHT_PX,
  DisplayControlBar,
  MAIN_DCB_LAYOUT,
} from "./DisplayControlBar";

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

test("AC3 — AUX PTL ALL matches F7; F8 still toggles HISTORY 0 ↔ last non-zero", () => {
  expect(barSrc()).toMatch(/togglePtlOn\(view\)/);
  expect(barSrc()).toMatch(/toggleHistoryEnabled\(view\)/);
  expect(barSrc()).toMatch(/>\s*PTL\s*</);
  expect(barSrc()).toMatch(/>\s*HISTORY\s*</);
  expect(barSrc()).toMatch(/>\s*OWN\s*</);
  expect(barSrc()).toMatch(/>\s*ALL\s*</);
  const view = createScopeView();
  expect(view.ptlOn).toBe(false);
  expect(view.historyEnabled).toBe(true);
  togglePtlOn(view);
  toggleHistoryEnabled(view);
  expect(view.ptlOn).toBe(true);
  expect(view.historyEnabled).toBe(false);
  applyDcbShift(view);
  const html = dcbHtml(view);
  expect(html).toMatch(/data-dcb-cell="ptl-all"/);
  expect(html).toMatch(/aria-pressed="true"/);
  expect(html).toContain("HISTORY");
  expect(html).toContain("OWN");
  expect(html).toContain("ALL");
});

test("AC4 — altitude FILTER stays a scope chord; invalid max<min does not apply", () => {
  expect(dcbHtml()).not.toMatch(/data-dcb-cell="filter"/);
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
  expect(dcbHtml(view)).not.toContain("050-100");
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

test("AC7 — Research: RANGE/MAPS and SSA/GI filter controls are on MAIN; HISTORY/PTL on AUX", () => {
  const bar = barSrc();
  const html = dcbHtml();
  expect(html).toContain("RANGE 20");
  expect(html).toContain("MAPS");
  expect(html).toContain("FILTER");
  expect(html).not.toContain("HISTORY");
  expect(html).not.toContain("PTL");
  expect(html).toContain("RR 5");
  expect(html).toContain("LDR");
  expect(html).toContain("CHAR");
  expect(html).toContain("SIZE");
  expect(html).toContain("BRITE");
  expect(html).not.toContain("CHAR 12");
  expect(html).not.toContain("BRITE 2");
  expect(html).toContain("PLACE");
  expect(html).toContain("CNTR");
  expect(html).not.toContain("000-180");
  const auxView = createScopeView();
  applyDcbShift(auxView);
  const aux = dcbHtml(auxView);
  expect(aux).toContain("HISTORY");
  expect(aux).toContain("PTL");
  expect(aux).toContain("OWN");
  expect(aux).toContain("ALL");
  expect(aux).toContain("DCB");
  expect(aux).toContain("TOP");
  expect(aux).toContain("LEFT");
  expect(aux).toContain("RIGHT");
  expect(aux).toContain("BOTTOM");
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
  expect(bar).toMatch(/\bHISTORY\b/);
  expect(bar).toMatch(/\bPTL\b/);
  expect(bar).toMatch(/\bDCB\b/);
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

test("T02-31 — MAIN descriptor fixes two rows, 22 columns, and the quick-map matrix", () => {
  expect(MAIN_DCB_LAYOUT).toHaveLength(29);
  const physical = MAIN_DCB_LAYOUT.filter((cell) => !cell.id.startsWith("map-"));
  expect(physical.map((cell) => cell.column)).toEqual([
    1, 2, 2, 3, 4, 4, 5, 9, 10, 11, 12, 13, 14, 15, 16, 16, 17, 18, 19, 20, 21, 21, 22,
  ]);
  expect(
    MAIN_DCB_LAYOUT.filter((cell) => cell.id.startsWith("map-")).map((cell) => [
      cell.row,
      cell.column,
    ]),
  ).toEqual([
    [1, 6],
    [1, 7],
    [1, 8],
    [2, 6],
    [2, 7],
    [2, 8],
  ]);
  expect(MAIN_DCB_LAYOUT.filter((cell) => cell.rowSpan === 2).every((cell) => cell.row === 1)).toBe(
    true,
  );
  expect(MAIN_DCB_LAYOUT.filter((cell) => cell.row === 2).every((cell) => cell.rowSpan === 1)).toBe(
    true,
  );
});

test("T02-31 — system cells are inert and all six WX cells are visible", () => {
  const html = dcbHtml();
  for (const id of ["wx1", "wx2", "wx3", "wx4", "wx5", "wx6"]) {
    expect(html).toMatch(new RegExp(`aria-label="${id.toUpperCase()}"[^>]*disabled`));
  }
  for (const label of ["MODE FSL", "SITE FUSED"]) {
    expect(html).toMatch(new RegExp(`aria-label="${label}"[^>]*disabled`));
  }
  expect(html).toContain('data-dcb-layout="MAIN"');
  expect(html).toContain('data-dcb-layout-id="map-6"');
});

test("T02-32 — physical caps expose raised, pressed, and disabled presentation tokens", () => {
  const view = createScopeView();
  const normal = dcbHtml(view);
  expect(normal).toContain("--dcb-cap:#061F0B");
  expect(normal).toContain("--dcb-text:#DCE0DC");
  expect(normal).toContain("--dcb-disabled-text:#4C604C");
  expect(normal).toMatch(/data-dcb-kind="spinner"/);
  expect(normal).not.toContain("#00FF00");
  expect(normal).toMatch(/aria-label="MODE FSL"[^>]*disabled/);
  expect(normal).toMatch(/aria-label="SITE FUSED"[^>]*disabled/);

  armPlaceCenter(view);
  const pressed = dcbHtml(view);
  expect(pressed).toMatch(/aria-pressed="true"[^>]*data-dcb-cell="place"/);
  expect(pressed).toContain("--dcb-pressed:#005500");
  expect(cssSrc()).toMatch(/background:\s*var\(--dcb-pressed,\s*#005500\)/);
});

test("DCB cap labels are vertically centered without spacer lines", () => {
  const css = cssSrc();
  expect(css).toMatch(/\.dcb-cell\s*\{[^}]*box-sizing:\s*border-box/s);
  expect(css).toMatch(/\.dcb-cell\s*\{[^}]*justify-content:\s*center/s);
  expect(css).toMatch(/\.dcb-cell-stack\s*\{[^}]*justify-content:\s*center/s);
  expect(css).toMatch(/\.dcb-cell-line\s*\{[^}]*line-height:\s*1/s);
  expect(css).toMatch(/\.dcb-cell-line:empty/);

  const html = dcbHtml();
  expect(html).toMatch(
    /data-dcb-cell="brite"[^>]*><span class="dcb-cell-stack"><span class="dcb-cell-line">BRITE<\/span><\/span><\/button>/,
  );
  expect(html).toMatch(
    /data-dcb-cell="shift"[^>]*><span class="dcb-cell-stack"><span class="dcb-cell-line">SHIFT<\/span><\/span><\/button>/,
  );
  expect(html).toMatch(
    /data-dcb-cell="ssa-filter"[^>]*><span class="dcb-cell-stack"><span class="dcb-cell-line">SSA<\/span><span class="dcb-cell-line">FILTER<\/span><\/span><\/button>/,
  );
  expect(html).toMatch(
    /data-dcb-cell="ldr-dir"[^>]*><span class="dcb-cell-stack"><span class="dcb-cell-line">LDR DIR<\/span><span id="dcb-ldr-readout"[^>]*>/,
  );
});

test("cells sit on the PPI glass; canvas below fills the rectangular PPI", () => {
  expect(canvasSrc()).toMatch(/className="ppi-column"/);
  expect(canvasSrc()).toMatch(/header=\{<DisplayControlBar/);
  expect(canvasSrc()).toMatch(/dock=\{scopeView\.dcbDock\}/);
  expect(placeholderSrc()).toMatch(/\{header\}/);
  expect(placeholderSrc().indexOf("{header}")).toBeLessThan(placeholderSrc().indexOf("<canvas"));
  expect(placeholderSrc()).toMatch(/data-dcb-dock=\{dock\}/);
  expect(placeholderSrc()).toMatch(/className="ppi-draw"/);
  expect(DCB_HEIGHT_PX).toBe(75);
  expect(DCB_FONT_PX).toBe(11);

  const css = cssSrc();
  expect(css).toMatch(/\.ppi-host\s*\{[^}]*flex-direction:\s*column/s);
  expect(css).toMatch(/\.ppi-host\[data-dcb-dock="LEFT"\]/);
  expect(css).toMatch(/\.ppi-host\[data-dcb-dock="RIGHT"\][^}]*flex-direction:\s*row-reverse/s);
  expect(css).toMatch(/\.ppi-host\[data-dcb-dock="BOTTOM"\][^}]*flex-direction:\s*column-reverse/s);
  expect(css).toMatch(/\.dcb-vertical\s*\{[^}]*flex-direction:\s*column/s);
  expect(css).toMatch(/\.dcb\s*\{[^}]*flex:\s*0 0 75px/s);
  expect(css).toMatch(/\.dcb\s*\{[^}]*gap:\s*1px/s);
  expect(css).toMatch(/\.dcb\s*\{[^}]*background:\s*#000000/s);
  expect(css).toMatch(/\.dcb-cell\s*\{[^}]*background:\s*var\(--dcb-cap,\s*#061f0b\)/s);
  expect(css).toMatch(/\.dcb-cell\s*\{[^}]*color:\s*var\(--dcb-text,\s*#dce0dc\)/s);
  expect(css).toMatch(/\.dcb-cell\s*\{[^}]*border-radius:\s*0/s);
  expect(css).toMatch(/\.dcb-cell:not\(:disabled\):not\(\[aria-disabled="true"\]\)/);
  expect(css).toMatch(/inset 1px 1px var\(--dcb-highlight/);
  expect(css).toMatch(/inset -2px -2px var\(--dcb-shadow/);
  expect(css).toMatch(/inset 2px 2px var\(--dcb-pressed-shadow/);
  expect(css).toMatch(/inset -1px -1px var\(--dcb-pressed-highlight/);
  expect(css).toMatch(/var\(--dcb-disabled-text,\s*#4c604c\)/);
  expect(css).not.toMatch(/repeating-linear-gradient/);
  expect(css).toMatch(/\.ppi-canvas\s*\{[^}]*flex:\s*1 1 auto/s);
  expect(css).toMatch(/\.command-line\s*\{[^}]*position:\s*absolute/s);
  expect(barSrc()).toMatch(/PALETTE\.dcbCap/);
  expect(barSrc()).toMatch(/PALETTE\.dcbText/);
  expect(barSrc()).toMatch(/PALETTE\.dcbDisabledText/);
  expect(barSrc()).toMatch(/PALETTE\.dcbPressed/);
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
  expect(main).toContain("RWY");
  expect(main).toContain("LOC27");
  expect(main).toContain("LOC09");
  expect(main).toContain("DEM1_27");
  expect(main).toContain("DEM1_09");
  expect(main).toContain("BAY1_27");
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
  expect(maps).toContain('data-dcb-map-id="DEM1_27"');
  for (let slot = 1; slot <= 30; slot += 1) {
    expect(maps).toContain(`data-dcb-map-slot="${slot}"`);
  }
  expect(maps).toMatch(/aria-label="Map 10"[^>]*\bdisabled\b/);
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
  expect(dcbHtml(view)).not.toMatch(/>MAIN</);
  applyDcbShift(view);
  const aux = dcbHtml(view);
  expect(aux).toContain("SHIFT");
  expect(aux).not.toMatch(/>AUX</);
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

test("AC4 — DCB LEFT/RIGHT render as a vertical stack; TOP/BOTTOM stay horizontal", () => {
  const view = createScopeView();
  expect(dcbHtml(view)).toMatch(/data-dcb-dock="TOP"/);
  expect(dcbHtml(view)).toMatch(/class="dcb"/);
  expect(dcbHtml(view)).not.toMatch(/dcb-vertical/);
  view.dcbDock = "LEFT";
  const left = dcbHtml(view);
  expect(left).toMatch(/data-dcb-dock="LEFT"/);
  expect(left).toMatch(/dcb-vertical/);
  view.dcbDock = "RIGHT";
  expect(dcbHtml(view)).toMatch(/data-dcb-dock="RIGHT"/);
  expect(dcbHtml(view)).toMatch(/dcb-vertical/);
  view.dcbDock = "BOTTOM";
  expect(dcbHtml(view)).toMatch(/data-dcb-dock="BOTTOM"/);
  expect(dcbHtml(view)).not.toMatch(/dcb-vertical/);

  const hostLeft = renderToStaticMarkup(
    createElement(PpiPlaceholder, { dock: "LEFT", header: createElement("div") }),
  );
  expect(hostLeft).toMatch(/data-dcb-dock="LEFT"/);
  expect(hostLeft).toMatch(/class="ppi-draw"/);
  const hostBottom = renderToStaticMarkup(
    createElement(PpiPlaceholder, { dock: "BOTTOM", header: createElement("div") }),
  );
  expect(hostBottom).toMatch(/data-dcb-dock="BOTTOM"/);
});

test("AC5 — TPA/ATPA submenu has TPA, TPA MI 2/3/5/10, four live ATPA cells, DONE", () => {
  const view = createScopeView();
  applyDcbShift(view);
  expect(dcbHtml(view)).toContain("TPA");
  expect(dcbHtml(view)).toContain("ATPA");
  openDcbMenu(view, "TPA_ATPA");
  const html = dcbHtml(view);
  expect(html).toContain("DONE");
  expect(html).toMatch(/data-dcb-menu="TPA_ATPA"/);
  expect(html).toMatch(/data-dcb-cell="tpa-on"/);
  expect(html).toMatch(/data-dcb-cell="tpa-mi"/);
  expect(html).toMatch(
    /data-dcb-kind="spinner"[^>]*data-dcb-cell="tpa-mi"|data-dcb-cell="tpa-mi"[^>]*data-dcb-kind="spinner"/,
  );
  expect(html).toMatch(/data-dcb-cell="atpa"/);
  expect(html).toMatch(/data-dcb-cell="atpa-mileage"/);
  expect(html).toMatch(/data-dcb-cell="atpa-intrail"/);
  expect(html).toMatch(/data-dcb-cell="atpa-alert"/);
  expect(html).toMatch(/data-dcb-cell="atpa-monitor"/);
  expect(html).not.toMatch(/data-dcb-cell="atpa-cones"/);
  expect(html).toContain("TPA MI");
  expect(html).toContain("A/TPA");
  expect(html).toContain("INTRAIL");
  expect(html).toContain("MONITOR");
  expect(html).toContain("ALERT");
  expect(html).toMatch(
    /data-dcb-kind="toggle"[^>]*data-dcb-cell="atpa-mileage"|data-dcb-cell="atpa-mileage"[^>]*data-dcb-kind="toggle"/,
  );
  expect(html).not.toMatch(/\bJ-?ring/i);
  expect(html).toMatch(
    /aria-pressed="true"[^>]*data-dcb-cell="atpa-mileage"|data-dcb-cell="atpa-mileage"[^>]*aria-pressed="true"/,
  );
  view.atpa.coneMileage = false;
  const mileageOff = dcbHtml(view);
  expect(mileageOff).toMatch(
    /aria-pressed="false"[^>]*data-dcb-cell="atpa-mileage"|data-dcb-cell="atpa-mileage"[^>]*aria-pressed="false"/,
  );
  expect(mileageOff).toMatch(
    /aria-pressed="true"[^>]*data-dcb-cell="atpa-alert"|data-dcb-cell="atpa-alert"[^>]*aria-pressed="true"/,
  );
  closeDcbMenu(view);
  expect(dcbHtml(view)).toContain("RANGE 20");
});

test("T02-47 — TPA/ATPA comments quote R07 cell meanings; Alert covers Warning", () => {
  const src = barSrc();
  expect(src).toMatch(/R07/);
  expect(src).toMatch(/TPA ATPA Submenu/);
  expect(src).toMatch(/displays mileage in the A\/TPA cone/);
  expect(src).toMatch(/displays intrail distance in the datablock/);
  expect(src).toMatch(/displays alert cones at this TCP/);
  expect(src).toMatch(/displays monitor cones at this TCP/);
  expect(src).toMatch(/No separate Warning Cones cell/);
  expect(src).toMatch(/toggleAtpaConeMileage/);
  expect(src).toMatch(/toggleAtpaInTrailDistance/);
  expect(src).toMatch(/toggleAtpaAlertCones/);
  expect(src).toMatch(/toggleAtpaMonitorCones/);
  expect(src).not.toMatch(/from\s+["']@parse["']/);
});

test("T02-26 — CHAR SIZE submenu has DATA BLOCKS / LISTS / DCB / TOOLS / POS; DONE returns MAIN", () => {
  expect(barSrc()).toMatch(/openDcbMenu\(view,\s*"CHAR_SIZE"\)/);
  expect(barSrc()).toMatch(/stepCharSizeChannel/);
  expect(barSrc()).toMatch(/DATA/);
  expect(barSrc()).toMatch(/BLOCKS/);
  expect(barSrc()).toMatch(/LISTS/);
  expect(barSrc()).toMatch(/TOOLS/);
  expect(barSrc()).toMatch(/POS/);
  expect(barSrc()).not.toMatch(/cycleCharSize/);
  const view = createScopeView();
  openDcbMenu(view, "CHAR_SIZE");
  const html = dcbHtml(view);
  expect(html).toMatch(/data-dcb-menu="CHAR_SIZE"/);
  expect(html).toContain("DONE");
  expect(html).toContain("DATA");
  expect(html).toContain("BLOCKS");
  expect(html).toContain("LISTS");
  expect(html).toContain("DCB");
  expect(html).toContain("TOOLS");
  expect(html).toContain("POS");
  expect(html).toContain("12");
  expect(html).not.toContain("RANGE 20");
  closeDcbMenu(view);
  expect(dcbHtml(view)).toContain("RANGE 20");
});

test("T02-27 AC1 — SSA FILTER submenu hides TIME; restoring shows it again", () => {
  const view = createScopeView();
  expect(dcbHtml(view)).toContain("SSA");
  expect(dcbHtml(view)).toMatch(/>FILTER</);
  openDcbMenu(view, "SSA_FILTER");
  const html = dcbHtml(view);
  expect(html).toContain("DONE");
  expect(html).toContain("TIME");
  expect(html).toContain("ALTSTG");
  expect(html).toContain("STATUS");
  expect(html).toContain("RANGE");
  expect(html).toContain("OFF");
  expect(html).toContain("PTL");
  expect(html).toMatch(/aria-label="CRDA"[^>]*\bdisabled\b/);
  expect(html).not.toContain("RANGE 20");
  expect(html).toMatch(/data-dcb-menu="SSA_FILTER"/);

  const ssaInput = {
    simTimeMs: 125_000,
    rangeNm: view.camera.rangeNm,
    offCenter: false,
    filter: view.altitudeFilter,
    filterEntry: view.filterEntry,
    visibility: view.ssaFilter,
    ptlMinutes: view.ptlMinutes,
  };
  expect(buildSsaLines(ssaInput)).toContain("0002/05");
  toggleSsaFilter(view, "TIME");
  expect(buildSsaLines(ssaInput)).not.toContain("0002/05");
  toggleSsaFilter(view, "TIME");
  expect(buildSsaLines(ssaInput)).toContain("0002/05");
  closeDcbMenu(view);
  expect(dcbHtml(view)).toContain("RANGE 20");
});

test("T02-26 — BRITE submenu paints FDB/LDB/MPA/HST/RR/TLS; WX/WXC/BKC disabled", () => {
  expect(barSrc()).toMatch(/openDcbMenu\(view,\s*"BRITE"\)/);
  expect(barSrc()).toMatch(/stepBriteChannel/);
  expect(barSrc()).not.toMatch(/cycleMapBrite/);
  const view = createScopeView();
  openDcbMenu(view, "BRITE");
  const html = dcbHtml(view);
  expect(html).toMatch(/data-dcb-menu="BRITE"/);
  expect(html).toContain("DONE");
  for (const label of [
    "DCB",
    "MPA",
    "MPB",
    "FDB",
    "LST",
    "POS",
    "LDB",
    "OTH",
    "TLS",
    "RR",
    "HST",
  ]) {
    expect(html).toContain(label);
  }
  for (const label of ["WX", "WXC", "BKC", "CMP", "BCN", "PRI"]) {
    expect(html).toContain(label);
  }
  expect(html).toMatch(/aria-label="WX"[^>]*\bdisabled\b/);
  expect(html).toMatch(/aria-label="WXC"[^>]*\bdisabled\b/);
  expect(html).toMatch(/aria-label="BKC"[^>]*\bdisabled\b/);
  expect(html).toMatch(/aria-label="CMP"[^>]*\bdisabled\b/);
  expect(html).not.toContain("RANGE 20");
  expect(barSrc()).not.toMatch(/drawWeather|NEXRAD|weatherMosaic/i);
  closeDcbMenu(view);
  expect(dcbHtml(view)).toContain("RANGE 20");
});

test("T02-26 — DONE/Esc return MAIN; DAL123 H270 still parses", async () => {
  const view = createScopeView();
  openDcbMenu(view, "CHAR_SIZE");
  expect(dcbHtml(view)).toMatch(/data-dcb-menu="CHAR_SIZE"/);
  expect(handleDcbEscape(view)).toBe(true);
  expect(view.dcbMenu).toBe("MAIN");
  expect(dcbHtml(view)).toContain("RANGE 20");
  openDcbMenu(view, "BRITE");
  expect(dcbHtml(view)).toMatch(/data-dcb-menu="BRITE"/);
  closeDcbMenu(view);
  expect(dcbHtml(view)).toContain("RANGE 20");
  const { parseRadioText } = await import("@parse");
  const heading = parseRadioText("DAL123 H270");
  expect(heading.ok).toBe(true);
  if (heading.ok) {
    expect(heading.callsignToken).toBe("DAL123");
    expect(heading.instructions).toEqual([
      { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
    ]);
  }
});

test("T02-27 AC3 — GI FILTER hides an authored line; empty slots are disabled", () => {
  const scenario = loadKdem();
  const view = createScopeView(0, 0, { giTextLines: scenario.giTextLines });
  expect(dcbHtml(view)).toContain("GI");
  expect(dcbHtml(view)).toContain("TEXT");
  openDcbMenu(view, "GI_FILTER");
  const html = dcbHtml(view);
  expect(html).toContain("DONE");
  expect(html).toContain("GI 1");
  expect(html).toContain("GI 10");
  expect(html).toContain("ATIS A");
  expect(html).toMatch(/aria-label="GI 10"[^>]*\bdisabled\b/);
  expect(html).toMatch(/data-dcb-menu="GI_FILTER"/);
  expect(buildGiLines(view.giTextLines, view.giFilterVisible)).toContain("ATIS A");
  toggleGiFilter(view, 0);
  expect(buildGiLines(view.giTextLines, view.giFilterVisible)).not.toContain("ATIS A");
  expect(buildGiLines(view.giTextLines, view.giFilterVisible)).toContain("RWY 27");
  closeDcbMenu(view);
  expect(dcbHtml(view)).toContain("RANGE 20");
  expect(barSrc()).not.toMatch(/\bfetch\s*\(/);
  expect(barSrc()).not.toMatch(/from\s+["']@parse["']/);
});

test("T02-27 AC2 — hiding STATUS omits OK; RANGE/FILTER SSA lines still match when visible", () => {
  const view = createScopeView();
  const input = {
    simTimeMs: 0,
    rangeNm: view.camera.rangeNm,
    offCenter: false,
    filter: view.altitudeFilter,
    filterEntry: view.filterEntry,
    visibility: view.ssaFilter,
    ptlMinutes: view.ptlMinutes,
  };
  expect(buildSsaLines(input)).toContain("OK");
  expect(buildSsaLines(input)).toContain("RANGE 20");
  expect(buildSsaLines(input)).toContain("FILTER 000-180");
  toggleSsaFilter(view, "STATUS");
  expect(buildSsaLines(input)).not.toContain("OK");
  expect(buildSsaLines(input)).toContain("RANGE 20");
  expect(buildSsaLines(input)).toContain("FILTER 000-180");
});

test("T02-27 AC5/AC6 — altitude FILTER stays a scope chord; SSA/GI comments; no Command IR", () => {
  expect(dcbHtml()).not.toMatch(/data-dcb-cell="filter"/);
  expect(dcbHtml()).toContain("SSA");
  const src = barSrc();
  expect(src).toMatch(/SSA FILTER/);
  expect(src).toMatch(/GI TEXT/);
  expect(src).toMatch(/not METAR/i);
  expect(src).not.toMatch(/from\s+["']@parse["']/);
  expect(src).not.toMatch(/from\s+["']@pilot["']/);
  expect(src).not.toMatch(/\bfetch\s*\(/);
});

test("T02-29 — PREF submenu has PREF 1–8, DEFAULT, RESTORE, SAVE, SAVE AS, DELETE, DONE; no prompt/input", () => {
  const view = createScopeView();
  expect(dcbHtml(view)).toContain("PREF");
  openDcbMenu(view, "PREF");
  const html = dcbHtml(view);
  expect(html).toContain("DONE");
  expect(html).toMatch(/data-dcb-menu="PREF"/);
  expect(html).toMatch(/data-dcb-cell="pref-1"/);
  expect(html).toMatch(/data-dcb-cell="pref-8"/);
  expect(html).toContain("DEFAULT");
  expect(html).toContain("RESTORE");
  expect(html).toContain("SAVE");
  expect(html).toContain("AS");
  expect(html).toContain("DELETE");
  expect(html).not.toMatch(/<input/i);
  expect(barSrc()).not.toMatch(/\bprompt\s*\(/);
  closeDcbMenu(view);
  expect(dcbHtml(view)).toContain("RANGE 20");
});

test("MAIN PREF cap shows the active profile name instead of 22/27", () => {
  const view = createScopeView();
  const empty = dcbHtml(view);
  expect(empty).toMatch(/data-dcb-cell="pref"/);
  expect(empty).not.toContain("22/27");
  expect(empty).toMatch(/aria-label="Pref"/);

  saveAsDcbPref(view);
  const saved = dcbHtml(view);
  expect(saved).toContain("PREF 1");
  expect(saved).toMatch(/aria-label="Pref PREF 1"/);

  view.dcbPref.slots[0]!.name = "Approach Night";
  const named = dcbHtml(view);
  expect(named).toContain("APPROA");
  expect(named).toMatch(/aria-label="Pref Approach Night"/);
});

test("momentary caps flash inset; toggles remain latches", () => {
  expect(barSrc()).toMatch(/DCB_ACTION_FLASH_MS/);
  expect(barSrc()).toMatch(/armActionFlash/);
  expect(barSrc()).toMatch(/releaseActionFlash/);
  expect(barSrc()).toMatch(/armActionFlash\(\);\s*releaseActionFlash\(\);/);
  expect(barSrc()).toMatch(/kind !== "toggle" && kind !== "disabled"/);
  expect(barSrc()).toMatch(/data-dcb-flashing/);
  expect(cssSrc()).toMatch(/:active/);
  expect(cssSrc()).toMatch(/@keyframes dcb-cap-spring/);
  expect(cssSrc()).toMatch(/animation: dcb-cap-spring 70ms ease-out/);
  const view = createScopeView();
  openDcbMenu(view, "PREF");
  const html = dcbHtml(view);
  expect(html).toMatch(/aria-pressed="false"[^>]*data-dcb-cell="pref-save"/);
  expect(html).toMatch(/aria-pressed="false"[^>]*data-dcb-cell="pref-save-as"/);
  expect(html).toMatch(/aria-pressed="false"[^>]*data-dcb-cell="pref-delete"/);
});

test("syncDisplayControlBar preserves aria-pressed when button has active data-dcb-flashing", () => {
  expect(barSrc()).toMatch(/data-dcb-flashing/);
  expect(barSrc()).toMatch(/el\.getAttribute\("data-dcb-flashing"\) === "true"/);
});
