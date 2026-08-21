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
