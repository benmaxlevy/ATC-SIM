import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import {
  RANGE_PRESETS_NM,
  centerOnAirport,
  createScopeView,
  stepRange,
  toggleHistoryEnabled,
  toggleMapLayer,
  togglePtlOn,
  tryApplyAltitudeFilterDigits,
} from "@scope";
import { DCB_LITE_FONT_PX, DCB_LITE_HEIGHT_PX } from "./DisplayControlBar";

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

const scopeKeySources = import.meta.glob("../scope/scopeKeys.ts", {
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

function shellSrc(): string {
  return uiSources["./shell.tsx"]!;
}

test("AC1 — RNG ± steps the same 8 presets as PageUp/PageDown; readout is 5…60", () => {
  const view = createScopeView();
  const keys = Object.values(scopeKeySources)[0]!;
  expect(keys).toMatch(/stepRange\(view\.camera,\s*-1\)/);
  expect(keys).toMatch(/stepRange\(view\.camera,\s*1\)/);
  expect(barSrc()).toMatch(/stepRange\(view\.camera,\s*-1\)/);
  expect(barSrc()).toMatch(/stepRange\(view\.camera,\s*1\)/);
  expect(barSrc()).toMatch(/>\s*RNG\s*</);
  expect(barSrc()).toMatch(/DCB_RNG_READOUT_ID/);
  expect(RANGE_PRESETS_NM).toEqual([5, 10, 15, 20, 30, 40, 50, 60]);

  const seen: number[] = [view.camera.rangeNm];
  while (view.camera.rangeNm > 5) {
    stepRange(view.camera, -1);
    seen.push(view.camera.rangeNm);
  }
  expect(seen).toEqual([20, 15, 10, 5]);
  stepRange(view.camera, -1);
  expect(view.camera.rangeNm).toBe(5);
  const up: number[] = [];
  while (view.camera.rangeNm < 60) {
    stepRange(view.camera, 1);
    up.push(view.camera.rangeNm);
  }
  expect(up).toEqual([10, 15, 20, 30, 40, 50, 60]);
  expect(String(view.camera.rangeNm)).toMatch(/^(5|10|15|20|30|40|50|60)$/);
});

test("AC2 — MAP toggles RWY LOC RING CST independently; CST disabled when JSON off", () => {
  expect(barSrc()).toMatch(/toggleMapLayer\(view,\s*"runway"\)/);
  expect(barSrc()).toMatch(/toggleMapLayer\(view,\s*"localizer"\)/);
  expect(barSrc()).toMatch(/toggleMapLayer\(view,\s*"rings"\)/);
  expect(barSrc()).toMatch(/toggleMapLayer\(view,\s*"coastline"\)/);
  expect(barSrc()).toMatch(/>\s*RWY\s*</);
  expect(barSrc()).toMatch(/>\s*LOC\s*</);
  expect(barSrc()).toMatch(/>\s*RING\s*</);
  expect(barSrc()).toMatch(/>\s*CST\s*</);
  expect(barSrc()).toMatch(/disabled=\{!coastOn\}/);

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

test("AC3 — FIL fields use altitudeFilter apply; invalid max<min does not apply", () => {
  expect(barSrc()).toMatch(/tryApplyAltitudeFilterDigits/);
  expect(barSrc()).toMatch(/DCB_FIL_MIN_ID/);
  expect(barSrc()).toMatch(/DCB_FIL_MAX_ID/);
  expect(barSrc()).toMatch(/Altitude filter/);
  const view = createScopeView();
  expect(tryApplyAltitudeFilterDigits(view.altitudeFilter, "050", "100")).toBe(true);
  expect(view.altitudeFilter).toEqual({ minHundreds: 50, maxHundreds: 100 });
  expect(tryApplyAltitudeFilterDigits(view.altitudeFilter, "120", "050")).toBe(false);
  expect(view.altitudeFilter).toEqual({ minHundreds: 50, maxHundreds: 100 });
});

test("AC4 — PTL and HIST buttons call the same toggles as F7/F8", () => {
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
});

test("AC5 — CTR recenters airport; PPI column puts the bar above the canvas", () => {
  expect(barSrc()).toMatch(/centerOnAirport\(view\)/);
  expect(barSrc()).toMatch(/>\s*CTR\s*</);
  expect(canvasSrc()).toMatch(/className="ppi-column"/);
  expect(canvasSrc()).toMatch(/<DisplayControlBar/);
  expect(canvasSrc()).toMatch(/<PpiPlaceholder/);
  expect(canvasSrc()).toMatch(/\{children\}/);
  expect(canvasSrc().indexOf("<DisplayControlBar")).toBeLessThan(
    canvasSrc().indexOf("<PpiPlaceholder"),
  );
  expect(shellSrc()).toMatch(/<ScopeCanvas/);
  expect(shellSrc()).toMatch(/<FpsDebug/);
  expect(DCB_LITE_HEIGHT_PX).toBeGreaterThanOrEqual(28);
  expect(DCB_LITE_HEIGHT_PX).toBeLessThanOrEqual(36);
  expect(DCB_LITE_FONT_PX).toBe(12);

  const css = cssSrc();
  expect(css).toMatch(/\.ppi-column\s*\{[^}]*flex-direction:\s*column/s);
  expect(css).toMatch(/\.dcb-lite\s*\{[^}]*flex:\s*0 0 32px/s);
  expect(css).toMatch(/\.ppi-host\s*\{[^}]*flex:\s*1 1 auto/s);

  const view = createScopeView();
  view.camera.centerEastNm = 4;
  view.camera.centerNorthNm = -3;
  centerOnAirport(view);
  expect(view.camera.centerEastNm).toBe(view.airportEastNm);
  expect(view.camera.centerNorthNm).toBe(view.airportNorthNm);
});

test("AC8 — bar clicks never import Command IR, parser, or pilot", () => {
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
  expect(mainSources["../main.tsx"]).toMatch(/syncDisplayControlBar\(scopeView\)/);
  expect(mainSources["../main.tsx"]).toMatch(/isFpsDebugEnabled/);
  expect(mainSources["../main.tsx"]).toMatch(/formatFpsDebug/);
  expect(mainSources["../main.tsx"]).toMatch(/FPS_DEBUG_ID/);
});

test("AC9 — visible labels are RNG/MAPS/FILTER/PTL/HIST, not Zoom/Layers/HUD", () => {
  const bar = barSrc();
  expect(bar).toMatch(/>\s*RNG\s*</);
  expect(bar).toMatch(/>\s*MAPS\s*</);
  expect(bar).toMatch(/>\s*FILTER\s*</);
  expect(bar).toMatch(/>\s*PTL\s*</);
  expect(bar).toMatch(/>\s*HIST\s*</);
  expect(bar.toLowerCase()).not.toMatch(/\bzoom\b/);
  expect(bar.toLowerCase()).not.toMatch(/\blayers\b/);
  expect(bar.toLowerCase()).not.toMatch(/\bhud\b/);
  expect(bar).toMatch(/analog: CRC STARS DCB/i);
  expect(bar).toMatch(/lite subset only/i);
});

test("bar is a dark terminal strip using the frozen chrome palette", () => {
  const css = cssSrc();
  expect(css).toMatch(/\.dcb-lite\s*\{[^}]*background:\s*#111/s);
  expect(css).toMatch(/\.dcb-lite\s*\{[^}]*color:\s*#9aa0a6/s);
  expect(css).toMatch(/\.dcb-lite\s*\{[^}]*font-size:\s*12px/s);
  expect(css).not.toMatch(/\.dcb-lite\s*\{[^}]*box-shadow:/);
  expect(css).toMatch(/\.dcb-lite-btn\s*\{[^}]*border-radius:\s*0/s);
  expect(barSrc()).toMatch(/PALETTE\.uiChromeBg/);
  expect(barSrc()).toMatch(/PALETTE\.uiChrome/);
  expect(barSrc()).toMatch(/focusPpi/);
  expect(barSrc()).toMatch(/onMouseDown=\{preventButtonFocus\}/);
  expect(barSrc()).toMatch(/event\.key === "Enter"/);
  expect(barSrc()).toMatch(/event\.key === "Escape"/);
});

test("mouse-only walkthrough mutates the same scope functions as the bar", () => {
  const view = createScopeView();
  while (view.camera.rangeNm > 10) {
    stepRange(view.camera, -1);
  }
  toggleMapLayer(view, "rings");
  expect(tryApplyAltitudeFilterDigits(view.altitudeFilter, "050", "100")).toBe(true);
  togglePtlOn(view);
  expect(view.camera.rangeNm).toBe(10);
  expect(view.showRings).toBe(false);
  expect(view.altitudeFilter).toEqual({ minHundreds: 50, maxHundreds: 100 });
  expect(view.ptlOn).toBe(true);
});
