import { expect, test } from "vitest";

test("AC6 — strip UI never imports the radio pipeline or Command IR", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const ui = sources["./FlightStrips.tsx"];
  const shell = sources["./shell.tsx"];
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

test("AC7 — collapse control is a STRIPS toggle; dock class collapses", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const ui = sources["./FlightStrips.tsx"]!;
  const shell = sources["./shell.tsx"]!;
  expect(ui).toMatch(/\[ STRIPS \]/);
  expect(ui).toMatch(/strip-bay-is-collapsed/);
  expect(ui).toMatch(/aria-expanded/);
  expect(shell).toMatch(/stripsCollapsed/);
  expect(shell).toMatch(/setStripsCollapsed/);
});

test("AC9 — bay heading is flight strips, not aircraft list", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const ui = sources["./FlightStrips.tsx"]!;
  const model = sources["./flightStripModel.ts"]!;
  expect(ui).toMatch(/STRIP_BAY_HEADING/);
  expect(model).toMatch(/STRIP_BAY_HEADING = "Flight strips"/);
  expect(ui).not.toMatch(/aircraft list/i);
  expect(ui).not.toMatch(/\bcards\b/i);
  expect(ui).not.toMatch(/\btickets\b/i);
  expect(ui).not.toMatch(/\bsidebar\b/i);
});

test("strip click focuses PPI; canvas is focusable", () => {
  const uiSources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
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

test("T02-08 — strip callsign tints with ownership color; help is color-only not NAS", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const ui = sources["./FlightStrips.tsx"]!;
  const shell = sources["./shell.tsx"]!;
  expect(ui).toMatch(/trackPaintColor/);
  expect(ui).toMatch(/data-strip-aircraft-id/);
  expect(ui).toMatch(/tracks\.get\(strip\.aircraftId\)\?\.ownership/);
  expect(ui).toMatch(/syncStripCallsignColors/);
  expect(shell).toMatch(/tracks=\{scopeView\.tracks\}/);
  expect(shell).not.toMatch(/HELP_KEYS_POINTER/);
  expect(shell).not.toMatch(/INITIATE_TRACK_HELP/);
  expect(shell).not.toMatch(/DROP_TRACK_HELP/);
  const overlay = sources["./ScopeHelpOverlay.tsx"]!;
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
