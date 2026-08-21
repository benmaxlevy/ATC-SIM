/**
 * T02-21 automated TCW gate. No new features — chrome greps, Command IR freeze,
 * radio vs DCB/scope routing, T00-01 disclaimer on F1 / first-run.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, expectTypeOf, test, vi } from "vitest";
import { INSTRUCTION_TYPES, SessionLog, type Command, type Instruction } from "@core";
import { createWorldFromScenario, loadKdem } from "@scenario";
import {
  HELP_KEYS_POINTER,
  SCOPE_FONT_STACK,
  buildSsaLines,
  createScopeView,
  cycleCharSize,
  cycleMapBrite,
  cycleRange,
  cycleRrInterval,
  formatDcbRangeReadout,
  handleScopeKeyDown,
  syncTrackDisplays,
  toggleHistoryEnabled,
  togglePtlOn,
} from "@scope";
import { DisplayControlBar } from "./DisplayControlBar";
import { DISCLAIMER_COPY } from "./disclaimer-copy";
import { Disclaimer } from "./disclaimer";
import { FlightStrips } from "./FlightStrips";
import { ScopeHelpOverlay } from "./ScopeHelpOverlay";
import { submitCommand } from "./submitCommand";

const uiSources = import.meta.glob("./*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const FORBIDDEN_CHROME = /\b(zoom|sprite|osm|hud|nametag|label)\b/i;
const FORBIDDEN_DCB_CELLS = /\b(WX|PREF|SHIFT|CSA|CRDA|FMA|OSM)\b/;

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

function dcbHtml() {
  return renderToStaticMarkup(
    createElement(DisplayControlBar, { view: createScopeView(), onChange: () => undefined }),
  );
}

test("AC2 — Command IR stays the frozen fields and 11 instruction types", () => {
  expectTypeOf<keyof Command>().toEqualTypeOf<
    | "id"
    | "issuedAtSimMs"
    | "callsign"
    | "instructions"
    | "sourceText"
    | "source"
    | "parseStage"
  >();
  expect(INSTRUCTION_TYPES).toHaveLength(11);
  expectTypeOf<Instruction["type"]>().toEqualTypeOf<(typeof INSTRUCTION_TYPES)[number]>();
});

test("AC2 — DAL123 H270 still readbacks heading and assigns 270", async () => {
  const world = createWorldFromScenario(loadKdem());
  const result = await submitCommand(world, "DAL123 H270", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(result.command?.instructions[0]).toEqual({
    type: "FLY_HEADING",
    headingDeg: 270,
    turn: "SHORTEST",
  });
  expect(result.readback.toLowerCase()).toContain("heading two seven zero");
  expect(world.aircraft.find((ac) => ac.callsign === "DAL123")?.intent.assignedHeadingDeg).toBe(
    270,
  );
});

test("AC3 — DCB/scope mutations emit zero Command IR; only radio DAL123 H270 accepts", async () => {
  const bar = uiSources["./DisplayControlBar.tsx"]!;
  const canvas = uiSources["./ScopeCanvas.tsx"]!;
  expect(bar).not.toMatch(/from\s+["']@parse["']/);
  expect(bar).not.toMatch(/from\s+["']@pilot["']/);
  expect(bar).not.toMatch(/handleRadioText|submitCommand|parseRadioText/);
  expect(canvas).not.toMatch(/from\s+["']@parse["']/);
  expect(canvas).not.toMatch(/submitCommand/);

  const world = createWorldFromScenario(loadKdem());
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123");
  expect(dal).toBeDefined();
  world.selectedAircraftId = dal!.id;
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const log = new SessionLog();

  cycleRange(view.camera);
  togglePtlOn(view);
  toggleHistoryEnabled(view);
  cycleRrInterval(view);
  cycleCharSize(view);
  cycleMapBrite(view);
  expect(handleScopeKeyDown(keyEvent("F3"), view, "scope", world)).toBe(true);
  expect(handleScopeKeyDown(keyEvent("F7"), view, "radio", world)).toBe(true);
  expect(handleScopeKeyDown(keyEvent("PageUp"), view, "radio", world)).toBe(true);
  expect(handleScopeKeyDown(keyEvent("F1"), view, "radio", world)).toBe(true);

  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(log.byType("command.rejected")).toHaveLength(0);
  expect(dal!.intent.assignedHeadingDeg).not.toBe(270);

  const result = await submitCommand(world, "DAL123 H270", log);
  expect(result.accepted).toBe(true);
  expect(log.byType("command.accepted")).toHaveLength(1);
  expect(log.byType("command.rejected")).toHaveLength(0);
  expect(dal!.intent.assignedHeadingDeg).toBe(270);
});

test("AC4 — T00-01 disclaimer is first-run and inside F1; HELP_KEYS_POINTER stays off the glass", () => {
  expect(HELP_KEYS_POINTER).toBe("F1 lists keys.");
  const shell = uiSources["./shell.tsx"]!;
  expect(shell).toMatch(/ScopeHelpOverlay/);
  expect(shell).not.toMatch(/HELP_KEYS_POINTER/);

  const overlay = renderToStaticMarkup(createElement(ScopeHelpOverlay, { open: true }));
  expect(overlay).toContain(DISCLAIMER_COPY);
  expect(overlay).toContain("TRAINER KEYS — NOT CRC");

  const firstRun = renderToStaticMarkup(createElement(Disclaimer));
  expect(firstRun).toContain(DISCLAIMER_COPY);
  expect(firstRun).toContain("disclaimer-first-run");
});

test("AC5 — persistent chrome has no zoom/label/sprite/OSM/HUD; DCB has no WX/PREF clone cells", () => {
  const chromeFiles = [
    "./DisplayControlBar.tsx",
    "./command-line.tsx",
    "./sim-controls.tsx",
    "./disclaimer.tsx",
    "./FlightStrips.tsx",
    "./ScopeCanvas.tsx",
    "./shell.tsx",
  ];
  for (const path of chromeFiles) {
    for (const value of attrValues(uiSources[path]!)) {
      expect(value, path).not.toMatch(FORBIDDEN_CHROME);
    }
  }

  const dcb = dcbHtml();
  const dcbText = visibleText(dcb);
  expect(dcbText).toMatch(/RANGE 20/);
  expect(dcbText).toMatch(/MAPS/);
  expect(dcbText).toMatch(/\bRR\b/);
  expect(dcbText).toMatch(/\bLDR\b/);
  expect(dcbText).toMatch(/CHAR/);
  expect(dcbText).toMatch(/BRITE/);
  expect(dcbText).toMatch(/FILTER/);
  expect(dcbText).toMatch(/PTL/);
  expect(dcbText).toMatch(/HIST/);
  expect(dcbText).not.toMatch(FORBIDDEN_CHROME);
  expect(dcbText).not.toMatch(FORBIDDEN_DCB_CELLS);
  expect(dcb).not.toMatch(/<input/i);
  expect(formatDcbRangeReadout(20).toLowerCase()).not.toContain("zoom");

  const world = createWorldFromScenario(loadKdem());
  const strips = renderToStaticMarkup(
    createElement(FlightStrips, {
      world,
      tracks: new Map(),
      onSelectionChange: () => undefined,
    }),
  );
  expect(visibleText(strips)).not.toMatch(FORBIDDEN_CHROME);
  expect(strips).not.toMatch(/FLIGHT STRIPS/);

  const view = createScopeView();
  const ssa = buildSsaLines({
    simTimeMs: 0,
    rangeNm: view.camera.rangeNm,
    offCenter: false,
    filter: view.altitudeFilter,
    filterEntry: view.filterEntry,
  }).join(" ");
  expect(ssa).toMatch(/FILTER/);
  expect(ssa).toMatch(/RANGE 20/);
  expect(ssa).not.toMatch(FORBIDDEN_CHROME);

  const overlay = visibleText(
    renderToStaticMarkup(createElement(ScopeHelpOverlay, { open: true })),
  );
  expect(overlay.replaceAll(/zoom-to-cursor/gi, "")).not.toMatch(FORBIDDEN_CHROME);
  expect(overlay).not.toMatch(/\bOSM\b/);
  expect(overlay).not.toMatch(/\bsprite\b/i);

  expect(SCOPE_FONT_STACK).toContain("IBM Plex Mono");
  expect(SCOPE_FONT_STACK).toContain("monospace");
  expect(SCOPE_FONT_STACK.toLowerCase()).not.toMatch(/stars/);
});
