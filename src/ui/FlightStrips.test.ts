import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import { SessionLog, createAircraft, createWorld } from "@core";
import { createScopeView, inAltitudeFilter, renderScope } from "@scope";
import { submitCommand } from "./submitCommand";
import { FlightStrips } from "./FlightStrips";
import { stripsFromWorld } from "./flightStripModel";

const uiSources = import.meta.glob("./*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function sample(callsign: string, extras: Partial<Parameters<typeof createAircraft>[0]> = {}) {
  return createAircraft({
    id: extras.id ?? `ac-${callsign.toLowerCase()}`,
    callsign,
    xNm: extras.xNm ?? 10,
    yNm: extras.yNm ?? 5,
    headingDeg: extras.headingDeg ?? 270,
    altitudeFt: extras.altitudeFt ?? 3000,
    speedKt: extras.speedKt ?? 210,
  });
}

function cssSrc(): string {
  return readFileSync(new URL("../index.css", import.meta.url), "utf8");
}

function listHtml(world = createWorld({ aircraft: [sample("DAL123")] })): string {
  return renderToStaticMarkup(
    createElement(FlightStrips, {
      world,
      tracks: new Map(),
      onSelectionChange: () => {},
    }),
  );
}

test("AC6 — list UI never imports the radio pipeline or Command IR", () => {
  const ui = uiSources["./FlightStrips.tsx"];
  const shell = uiSources["./shell.tsx"];
  expect(ui).toBeDefined();
  expect(shell).toBeDefined();
  expect(ui).not.toMatch(/from\s+["']@parse["']/);
  expect(ui).not.toMatch(/from\s+["']@pilot["']/);
  expect(ui).not.toMatch(/handleRadioText/);
  expect(ui).not.toMatch(/submitCommand/);
  expect(ui).not.toMatch(/parseRadioText/);
  expect(ui).toMatch(/selectTrackFromStrip/);
  expect(ui).toMatch(/focusPpi/);
  expect(ui).toMatch(/preventDefault/);
  expect(shell).toMatch(/<FlightStrips/);
  expect(shell).not.toMatch(/submitCommand\([^)]*strip/i);
});

test("AC2 — default layout has no FLIGHT STRIPS header on the right", () => {
  const ui = uiSources["./FlightStrips.tsx"]!;
  const shell = uiSources["./shell.tsx"]!;
  const css = cssSrc();
  expect(ui).not.toMatch(/FLIGHT STRIPS/);
  expect(shell).not.toMatch(/FLIGHT STRIPS/);
  expect(listHtml()).not.toMatch(/FLIGHT STRIPS/);
  expect(listHtml()).not.toMatch(/<h2/);
  expect(ui).not.toMatch(/strip-bay-title/);
  expect(shell.indexOf("<FlightStrips")).toBeGreaterThan(shell.indexOf("<ScopeCanvas"));
  expect(shell.indexOf("<FlightStrips")).toBeLessThan(shell.indexOf("</ScopeCanvas>"));
  expect(css).toMatch(/\.strip-list\s*\{[^}]*position:\s*absolute/s);
  expect(css).toMatch(/\.strip-list\s*\{[^}]*left:\s*8px/s);
  expect(css).toMatch(/\.strip-list\s*\{[^}]*max-height:\s*28%/s);
  expect(css).not.toMatch(/\.strip-bay\s*\{/);
  expect(css).toMatch(/\.strip-list\s*\{[^}]*pointer-events:\s*none/s);
});

test("AC3 — list row click still selects via selectTrackFromStrip", () => {
  const ui = uiSources["./FlightStrips.tsx"]!;
  expect(ui).toMatch(/onClick=\{\(\) => \{/);
  expect(ui).toMatch(/selectTrackFromStrip\(world,\s*strip\.aircraftId\)/);
  const html = listHtml();
  expect(html).toContain("DAL123");
  expect(html).toContain("H270");
  expect(html).toContain("A030");
  expect(html).toContain("S210");
});

test("AC4 — filter hides datablocks but the list still shows all arrivals", () => {
  const low = sample("UAL60", { id: "ac-low", altitudeFt: 6000, xNm: -4, yNm: 0 });
  const inBand = sample("DAL80", { id: "ac-in", altitudeFt: 8000, xNm: 4, yNm: 0 });
  const world = createWorld({ aircraft: [low, inBand] });
  const view = createScopeView();
  view.altitudeFilter = { minHundreds: 70, maxHundreds: 90 };
  expect(inAltitudeFilter(low.altitudeFt, view.altitudeFilter)).toBe(false);
  expect(inAltitudeFilter(inBand.altitudeFt, view.altitudeFilter)).toBe(true);

  const fillTexts: string[] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textBaseline: "alphabetic",
    textAlign: "start",
    fillRect() {},
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    arc() {},
    clip() {},
    stroke() {},
    fill() {},
    moveTo() {},
    lineTo() {},
    setTransform() {},
    strokeRect() {},
    measureText(text: string) {
      return { width: Math.max(0, text.length) * 7.2 };
    },
    fillText(text: string) {
      fillTexts.push(text);
    },
  } as unknown as CanvasRenderingContext2D;
  renderScope(ctx, world, view, 800, 800);
  expect(fillTexts).not.toContain("UAL60");
  expect(fillTexts).toContain("DAL80");

  const strips = stripsFromWorld(world);
  expect(strips.map((s) => s.callsign)).toEqual(["DAL80", "UAL60"]);
  const html = listHtml(world);
  expect(html).toContain("UAL60");
  expect(html).toContain("DAL80");
});

test("AC9 — list uses flight-strip glossary; not aircraft list / cards / tickets", () => {
  const ui = uiSources["./FlightStrips.tsx"]!;
  const model = uiSources["./flightStripModel.ts"]!;
  expect(ui).toMatch(/STRIP_BAY_HEADING/);
  expect(model).toMatch(/STRIP_BAY_HEADING = "Flight strips"/);
  expect(ui).not.toMatch(/aircraft list/i);
  expect(ui).not.toMatch(/\bcards\b/i);
  expect(ui).not.toMatch(/\btickets\b/i);
  expect(ui).not.toMatch(/\bsidebar\b/i);
  expect(listHtml()).toContain('aria-label="Flight strips"');
});

test("list click focuses PPI; canvas is focusable", () => {
  const scopeSources = import.meta.glob("../scope/ppi-placeholder.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const ui = uiSources["./FlightStrips.tsx"]!;
  const placeholder = Object.values(scopeSources)[0];
  expect(ui).toMatch(/PpiPlaceholderId/);
  expect(ui).toMatch(/el\.focus\(\)/);
  expect(placeholder).toMatch(/tabIndex=\{0\}/);
});

test("T02-08 — list callsign tints with ownership color; help is color-only not NAS", () => {
  const ui = uiSources["./FlightStrips.tsx"]!;
  const shell = uiSources["./shell.tsx"]!;
  expect(ui).toMatch(/trackPaintColor/);
  expect(ui).toMatch(/data-strip-aircraft-id/);
  expect(ui).toMatch(/tracks\.get\(strip\.aircraftId\)\?\.ownership/);
  expect(ui).toMatch(/syncStripCallsignColors/);
  expect(shell).toMatch(/tracks=\{scopeView\.tracks\}/);
  expect(shell).not.toMatch(/HELP_KEYS_POINTER/);
  expect(shell).not.toMatch(/INITIATE_TRACK_HELP/);
  expect(shell).not.toMatch(/DROP_TRACK_HELP/);
  const overlay = uiSources["./ScopeHelpOverlay.tsx"]!;
  expect(overlay).toMatch(/alwaysOnKeyBindings/);
  expect(overlay).toMatch(/DISCLAIMER_COPY/);
  expect(shell.toLowerCase()).not.toMatch(/lock-?on/);
  expect(shell.toLowerCase()).not.toMatch(/\bclaim\b/);
  const mains = import.meta.glob("../main.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  expect(mains["../main.tsx"]).toMatch(/syncStripCallsignColors\(scopeView\.tracks\)/);
});

test("AC5 — DAL123 H270 still works; list click does not go through submitCommand", () => {
  const dal = sample("DAL123", { headingDeg: 100 });
  const world = createWorld({ aircraft: [dal] });
  const result = submitCommand(world, "DAL123 H270", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(listHtml(world)).toContain("H270");
  expect(uiSources["./FlightStrips.tsx"]).not.toMatch(/submitCommand/);
});

test("AC6 — comments say SSA / FILTER / range / flight strip, not HUD", () => {
  const ui = uiSources["./FlightStrips.tsx"]!;
  const shell = uiSources["./shell.tsx"]!;
  expect(ui).toMatch(/SSA/);
  expect(ui).toMatch(/flight progress strip/);
  expect(ui).toMatch(/R07/);
  expect(ui).not.toMatch(/\bHUD\b/);
  expect(shell).toMatch(/SSA/);
  expect(shell).toMatch(/flight-strip list/);
  expect(shell).not.toMatch(/\bsidebar\b/i);
});
