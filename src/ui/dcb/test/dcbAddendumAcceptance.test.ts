/**
 * T02-30 automated DCB addendum gate. No new features — confirms T02-22–29
 * grammar (SHIFT / PREF / WX latches) and keeps radio vs DCB pipelines apart.
 *
 * AC1 (manual Chrome Windows script 1–10) is skip-with-reason: this worker
 * has no visual operator. Do not invent a visual pass.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, expectTypeOf, test, vi } from "vitest";
import {
  INSTRUCTION_TYPES,
  SessionLog,
  acceptInboundHandoff,
  type Command,
  type Instruction,
} from "@core";
import { createWorldFromScenario, loadKdem, loadKdemIls27 } from "@scenario";
import {
  BRITE_DISABLED_CHANNELS,
  BRITE_PAINT_CHANNELS,
  DCB_MAP_SLOT_COUNT,
  DCB_PREF_SLOT_COUNT,
  DCB_QUICK_MAP_COUNT,
  GI_SLOT_COUNT,
  RANGE_PRESETS_NM,
  SCOPE_FONT_STACK,
  TPA_RADIUS_NM,
  applyDcbPrefDefaults,
  applyDcbShift,
  armDcbSpinner,
  armPlaceCenter,
  armPlaceRangeRing,
  beginDcbPrefSession,
  buildSsaLines,
  closeDcbMenu,
  commitDcbSpinner,
  createScopeView,
  formatDcbRangeReadout,
  handleDcbEscape,
  handleScopeKeyDown,
  isDcbMapSlotEnabled,
  openDcbMenu,
  parseDigitalMap,
  setDcbDock,
  shouldPaintAtpaGeometry,
  stepRange,
  syncTrackDisplays,
  toggleAtpaOn,
  toggleAtpaAlertCones,
  toggleAtpaConeMileage,
  toggleAtpaInTrailDistance,
  toggleAtpaMonitorCones,
  toggleGiFilter,
  toggleSsaFilter,
  toggleTpaOn,
  toggleWxLevel,
} from "@scope";
import { DisplayControlBar } from "../DisplayControlBar";
import { submitCommand } from "../../command/command-line";

const uiSources = import.meta.glob(["../../*.{ts,tsx}", "../../**/*.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const weatherPaintSrc =
  (
    import.meta.glob("../../../scope/render/weatherLayer.ts", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>
  )["../../../scope/render/weatherLayer.ts"] ?? "";

const appSources = import.meta.glob(["../../../**/*.{ts,tsx,css,html}", "../../../../index.html"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const FORBIDDEN_CHROME = /\b(zoom|sprite|osm|hud|nametag|label)\b/i;
const FORBIDDEN_DCB_CELLS = /\b(CSA|CRDA|FMA|OSM)\b/;

function keyEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

function attrValues(src: string): string[] {
  return [...src.matchAll(/(?:aria-label|placeholder)="([^"]*)"/g)].map((m) => m[1]);
}

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function dcbHtml(view = createScopeView()) {
  return renderToStaticMarkup(
    createElement(DisplayControlBar, { view, onChange: () => undefined }),
  );
}

function barSrc(): string {
  return uiSources["../DisplayControlBar.tsx"]!;
}

test("AC2 — Command IR stays the frozen fields and 17 instruction types", () => {
  expectTypeOf<keyof Command>().toEqualTypeOf<
    "id" | "issuedAtSimMs" | "callsign" | "instructions" | "sourceText" | "source" | "parseStage"
  >();
  expect(INSTRUCTION_TYPES).toHaveLength(17);
  expectTypeOf<Instruction["type"]>().toEqualTypeOf<(typeof INSTRUCTION_TYPES)[number]>();
});

test("AC2 — callsign H270 still readbacks heading and assigns 270", async () => {
  const world = createWorldFromScenario(loadKdemIls27());
  const ac = world.aircraft[0]!;
  const result = await submitCommand(world, `${ac.callsign} H270`, new SessionLog());
  expect(result.accepted).toBe(true);
  expect(result.command?.instructions[0]).toEqual({
    type: "FLY_HEADING",
    headingDeg: 270,
    turn: "SHORTEST",
  });
  expect(result.readback).toContain("heading 270");
  expect(ac.intent.assignedHeadingDeg).toBe(270);
});

test("AC3 — DCB/scope addendum clicks emit zero Command IR until radio accepted command", async () => {
  expect(barSrc()).not.toMatch(/from\s+["']@parse["']/);
  expect(barSrc()).not.toMatch(/from\s+["']@pilot["']/);
  expect(barSrc()).not.toMatch(/handleRadioText|submitCommand|parseRadioText/);
  expect(uiSources["../../canvas/ScopeCanvas.tsx"]!).not.toMatch(/from\s+["']@parse["']/);
  expect(uiSources["../../canvas/ScopeCanvas.tsx"]!).not.toMatch(/submitCommand/);
  expect(barSrc()).not.toMatch(/\bprompt\s*\(/);

  const world = createWorldFromScenario(loadKdem());
  const dal = world.aircraft[0]!;
  expect(dal).toBeDefined();
  world.selectedAircraftId = dal.id;
  const view = createScopeView(0, 0, { giTextLines: loadKdem().giTextLines });
  syncTrackDisplays(view.tracks, world);
  const log = new SessionLog();

  applyDcbShift(view);
  expect(view.dcbMenu).toBe("AUX");
  setDcbDock(view, "LEFT");
  applyDcbShift(view);
  expect(view.dcbMenu).toBe("MAIN");
  armDcbSpinner(view, "RANGE");
  stepRange(view.camera, 1);
  commitDcbSpinner(view);
  armPlaceCenter(view);
  armPlaceRangeRing(view);
  openDcbMenu(view, "MAPS");
  expect(handleDcbEscape(view)).toBe(true);
  openDcbMenu(view, "PREF");
  beginDcbPrefSession(view);
  applyDcbPrefDefaults(view);
  closeDcbMenu(view);
  toggleSsaFilter(view, "TIME");
  toggleGiFilter(view, 0);
  toggleTpaOn(view);
  toggleAtpaOn(view);
  toggleAtpaConeMileage(view);
  toggleAtpaInTrailDistance(view);
  toggleAtpaAlertCones(view);
  toggleAtpaMonitorCones(view);
  toggleWxLevel(view, 1);
  expect(view.wxLevels[0]).toBe(true);
  expect(handleScopeKeyDown(keyEvent("F3"), view, "scope", world)).toBe(true);
  expect(handleScopeKeyDown(keyEvent("PageUp"), view, "radio", world)).toBe(true);

  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(log.byType("command.rejected")).toHaveLength(0);
  expect(dal.intent.assignedHeadingDeg).not.toBe(270);

  acceptInboundHandoff(world, dal.id);
  const result = await submitCommand(world, `${dal.callsign} H270`, log);
  expect(result.accepted).toBe(true);
  expect(log.byType("command.accepted")).toHaveLength(1);
  expect(log.byType("command.rejected")).toHaveLength(0);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
});

test("AC4 — DCB has SHIFT / PREF / WX latches; no CSA/FMA/OSM; no input/Apply; no licensed typeface file", () => {
  const main = dcbHtml();
  const mainText = visibleText(main);
  expect(mainText).toMatch(/SHIFT/);
  expect(mainText).toMatch(/PREF/);
  expect(main).not.toMatch(/data-dcb-cell="filter"/);
  expect(main).toMatch(/data-dcb-cell="shift"/);
  expect(main).toMatch(/data-dcb-cell="pref"/);
  expect(mainText).not.toMatch(FORBIDDEN_DCB_CELLS);
  expect(main).not.toMatch(/data-dcb-cell="(csa|crda|fma|osm)"/i);
  expect(main).not.toMatch(/aria-label="(CSA|CRDA|FMA|OSM)"/);
  for (const n of [1, 2, 3, 4, 5, 6]) {
    expect(main).toContain(`data-dcb-cell="wx${n}"`);
    expect(main).toMatch(new RegExp(`aria-label="WX${n}"[^>]*data-dcb-kind="toggle"`));
    expect(main).not.toMatch(new RegExp(`aria-label="WX${n}"[^>]*\\bdisabled\\b`));
  }
  expect(main).not.toMatch(/<input/i);
  expect(main).not.toMatch(/Apply/);
  expect(barSrc()).not.toMatch(/<input/);
  expect(barSrc()).not.toMatch(/>\s*Apply\s*</);
  expect(barSrc()).not.toMatch(/type=["']text["']/);
  expect(barSrc()).not.toMatch(/drawWeather|NEXRAD|openstreetmap|weatherMosaic/i);

  const auxView = createScopeView();
  applyDcbShift(auxView);
  const aux = dcbHtml(auxView);
  expect(visibleText(aux)).toMatch(/SHIFT/);
  expect(visibleText(aux)).not.toMatch(FORBIDDEN_DCB_CELLS);
  expect(aux).not.toMatch(/data-dcb-cell="(csa|crda|fma|osm)"/i);
  expect(aux).not.toMatch(/aria-label="(CSA|CRDA|FMA|OSM)"/);

  const ssaView = createScopeView();
  openDcbMenu(ssaView, "SSA_FILTER");
  const ssa = dcbHtml(ssaView);
  expect(ssa).toMatch(/aria-label="CRDA"[^>]*\bdisabled\b/);
  expect(ssa).toMatch(/data-dcb-kind="disabled"/);

  const prefView = createScopeView();
  openDcbMenu(prefView, "PREF");
  const pref = dcbHtml(prefView);
  expect(pref).toMatch(/data-dcb-cell="pref-1"/);
  expect(pref).toMatch(/data-dcb-cell="pref-8"/);
  expect(pref).toContain("SAVE");
  expect(pref).toContain("DEFAULT");
  expect(pref).not.toMatch(/<input/i);
  expect(DCB_PREF_SLOT_COUNT).toBe(32);

  expect(SCOPE_FONT_STACK).toContain("IBM Plex Mono");
  expect(SCOPE_FONT_STACK).toContain("monospace");
  expect(SCOPE_FONT_STACK.toLowerCase()).not.toMatch(/stars/);
  for (const [path, src] of Object.entries(appSources)) {
    if (/\.test\./.test(path)) {
      continue;
    }
    expect(String(src), path).not.toMatch(/stars[^"'\\n]*\.ttf/i);
    expect(String(src), path).not.toMatch(/\.ttf[^"'\\n]*stars/i);
  }
});

test("AC5 — persistent chrome copy has no zoom/label/sprite/OSM/HUD", () => {
  const chromeFiles = [
    "../DisplayControlBar.tsx",
    "../../command/command-line.tsx",
    "../../controls/sim-controls.tsx",
    "../../overlays/disclaimer.tsx",
    "../../strips/FlightStrips.tsx",
    "../../canvas/ScopeCanvas.tsx",
    "../../shell.tsx",
  ];
  for (const path of chromeFiles) {
    for (const value of attrValues(uiSources[path]!)) {
      expect(value, path).not.toMatch(FORBIDDEN_CHROME);
    }
  }

  const mainText = visibleText(dcbHtml());
  expect(mainText).not.toMatch(FORBIDDEN_CHROME);
  expect(formatDcbRangeReadout(20).toLowerCase()).not.toContain("zoom");

  const auxView = createScopeView();
  applyDcbShift(auxView);
  expect(visibleText(dcbHtml(auxView))).not.toMatch(FORBIDDEN_CHROME);

  expect(uiSources["../DisplayControlBar.tsx"]!).not.toMatch(/nexrad|mosaic|openstreetmap/i);
  expect(uiSources["../../canvas/ScopeCanvas.tsx"]!).not.toMatch(/nexrad|mosaic|openstreetmap/i);
  expect(weatherPaintSrc).toMatch(/drawImage/);
});

test("addendum grammar — MAIN/AUX/submenus, discrete RANGE, WX latches / disabled VOL, TPA stub", () => {
  const scenario = loadKdem();
  const view = createScopeView(0, 0, {
    digitalMap: parseDigitalMap(scenario.maps),
    giTextLines: scenario.giTextLines,
  });

  const main = dcbHtml(view);
  const mainText = visibleText(main);
  expect(mainText).toMatch(/RANGE 20/);
  expect(mainText).toMatch(/PLACE/);
  expect(mainText).toMatch(/CNTR/);
  expect(main).toMatch(/data-dcb-cell="place"/);
  expect(main).toMatch(/data-dcb-cell="off-cntr"/);
  expect(main).toMatch(/data-dcb-cell="place-rr"/);
  expect(main).toMatch(/data-dcb-cell="rr-cntr"/);
  expect(mainText).toMatch(/MAPS/);
  expect(mainText).toMatch(/CHAR/);
  expect(mainText).toMatch(/BRITE/);
  expect(mainText).toMatch(/SSA/);
  expect(mainText).toMatch(/GI/);
  expect(RANGE_PRESETS_NM).toEqual([5, 10, 15, 20, 30, 40, 50, 60]);
  expect(DCB_QUICK_MAP_COUNT).toBe(6);
  for (let slot = 1; slot <= DCB_QUICK_MAP_COUNT; slot += 1) {
    expect(main).toMatch(new RegExp(`data-dcb-map-slot="${slot}"`));
  }

  applyDcbShift(view);
  const aux = dcbHtml(view);
  const auxText = visibleText(aux);
  expect(auxText).toMatch(/VOL/);
  expect(aux).toMatch(/data-dcb-cell="vol"/);
  expect(aux).toMatch(/aria-label="Volume"[^>]*data-dcb-kind="spinner"/);
  expect(aux).not.toMatch(/aria-label="Volume"[^>]*\bdisabled\b/);
  expect(auxText).toMatch(/HISTORY/);
  expect(auxText).toMatch(/H_RATE/);
  expect(aux).toMatch(/data-dcb-cell="h-rate"/);
  expect(aux).toMatch(/aria-label="History rate"[^>]*data-dcb-kind="spinner"/);
  expect(auxText).toMatch(/CURSOR HOME/);
  expect(aux).toMatch(/data-dcb-cell="cursor-home"/);
  expect(aux).toMatch(/aria-label="Cursor home"[^>]*data-dcb-kind="toggle"/);
  expect(auxText).toMatch(/CSR SPD/);
  expect(aux).toMatch(/data-dcb-cell="csr-spd"/);
  expect(aux).toMatch(/aria-label="Cursor speed"[^>]*data-dcb-kind="spinner"/);
  expect(auxText).toMatch(/DWELL/);
  expect(aux).toMatch(/data-dcb-cell="dwell"/);
  expect(aux).toMatch(/aria-label="Dwell mode"[^>]*data-dcb-kind="spinner"/);
  expect(auxText).toMatch(/PTL/);
  expect(auxText).toMatch(/OWN/);
  expect(auxText).toMatch(/ALL/);
  expect(auxText).toMatch(/TPA/);
  expect(aux).toMatch(/data-dcb-cell="dock-top"/);
  expect(aux).toMatch(/data-dcb-cell="dock-left"/);
  expect(aux).toMatch(/data-dcb-cell="dock-right"/);
  expect(aux).toMatch(/data-dcb-cell="dock-bottom"/);
  expect(aux).not.toContain("RANGE 20");

  applyDcbShift(view);
  openDcbMenu(view, "MAPS");
  const maps = dcbHtml(view);
  expect(maps).toContain("DONE");
  expect(maps).toContain("CLR");
  expect(maps).toContain("GEO");
  expect(maps).toContain("CURRENT");
  expect(maps).not.toContain("RANGE 20");
  expect(DCB_MAP_SLOT_COUNT).toBe(32);
  for (let slot = 1; slot <= DCB_MAP_SLOT_COUNT; slot += 1) {
    expect(maps).toMatch(new RegExp(`data-dcb-map-slot="${slot}"`));
  }
  for (let slot = 10; slot <= DCB_MAP_SLOT_COUNT; slot += 1) {
    expect(isDcbMapSlotEnabled(view, slot)).toBe(false);
  }
  expect(handleDcbEscape(view)).toBe(true);
  expect(view.dcbMenu).toBe("MAIN");

  openDcbMenu(view, "CHAR_SIZE");
  const char = visibleText(dcbHtml(view));
  expect(char).toMatch(/DATA/);
  expect(char).toMatch(/LISTS/);
  expect(char).toMatch(/TOOLS/);
  expect(char).toMatch(/POS/);
  closeDcbMenu(view);

  openDcbMenu(view, "BRITE");
  const brite = dcbHtml(view);
  expect(brite).toMatch(/aria-label="WX"[^>]*data-dcb-kind="spinner"/);
  expect(brite).toMatch(/aria-label="WXC"[^>]*data-dcb-kind="spinner"/);
  expect(brite).toMatch(/aria-label="BKC"[^>]*data-dcb-kind="spinner"/);
  expect(brite).toMatch(/aria-label="CMP"[^>]*data-dcb-kind="spinner"/);
  expect(brite).toMatch(/aria-label="BCN"[^>]*data-dcb-kind="spinner"/);
  expect(brite).not.toMatch(/aria-label="WX"[^>]*\bdisabled\b/);
  expect(brite).not.toMatch(/aria-label="WXC"[^>]*\bdisabled\b/);
  expect(brite).not.toMatch(/aria-label="BKC"[^>]*\bdisabled\b/);
  expect(brite).not.toMatch(/aria-label="CMP"[^>]*\bdisabled\b/);
  expect(brite).not.toMatch(/aria-label="BCN"[^>]*\bdisabled\b/);
  expect(BRITE_PAINT_CHANNELS).toEqual(expect.arrayContaining(["wx", "wxc", "bkc", "cmp", "bcn"]));
  expect(BRITE_DISABLED_CHANNELS).not.toEqual(expect.arrayContaining(["wx", "wxc", "bkc", "cmp", "bcn"]));
  closeDcbMenu(view);

  openDcbMenu(view, "SSA_FILTER");
  toggleSsaFilter(view, "TIME");
  expect(
    buildSsaLines({
      simTimeMs: 125_000,
      rangeNm: view.camera.rangeNm,
      offCenter: false,
      filter: view.altitudeFilter,
      filterEntry: view.filterEntry,
      visibility: view.ssaFilter,
      ptlMinutes: view.ptlMinutes,
    }),
  ).not.toContain("0002/05");
  closeDcbMenu(view);

  openDcbMenu(view, "GI_FILTER");
  const gi = dcbHtml(view);
  expect(GI_SLOT_COUNT).toBe(10);
  expect(gi).toContain("GI 1");
  expect(gi).toContain("GI 9");
  closeDcbMenu(view);

  applyDcbShift(view);
  openDcbMenu(view, "TPA_ATPA");
  const tpa = dcbHtml(view);
  expect(tpa).toContain("DONE");
  expect(tpa).toMatch(/data-dcb-cell="done"/);
  expect(tpa).toMatch(/data-dcb-cell="tpa-on"/);
  expect(tpa).toMatch(/data-dcb-cell="tpa-mi"/);
  expect(tpa).not.toMatch(/data-dcb-cell="atpa"/);
  expect(tpa).toMatch(/data-dcb-cell="atpa-mileage"/);
  expect(tpa).toMatch(/data-dcb-cell="atpa-intrail"/);
  expect(tpa).toMatch(/data-dcb-cell="atpa-alert"/);
  expect(tpa).toMatch(/data-dcb-cell="atpa-monitor"/);
  expect(tpa).not.toMatch(/data-dcb-cell="atpa-cones"/);
  expect(TPA_RADIUS_NM).toEqual([2, 3, 5, 10]);
  expect(shouldPaintAtpaGeometry("monitor")).toBe(true);
  closeDcbMenu(view);
  expect(dcbHtml(view)).toContain("RANGE 20");
});
