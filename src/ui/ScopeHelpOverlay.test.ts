import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { HELP_FOOTER, HELP_GLOSSARY_NOTE, KEY_BINDINGS, RADIO_CONFLICT_WARNING } from "@scope";
import { ScopeHelpOverlay } from "./ScopeHelpOverlay";

test("AC2 — overlay footer is exactly TRAINER KEYS — NOT CRC and lists frozen keys", () => {
  const html = renderToStaticMarkup(createElement(ScopeHelpOverlay, { open: true }));
  expect(html).toContain(HELP_FOOTER);
  expect(html).toMatch(/PageUp/);
  expect(html).toMatch(/PageDown/);
  expect(html).toMatch(/Home/);
  expect(html).toMatch(/End/);
  expect(html).toMatch(/F3/);
  expect(html).toMatch(/F4/);
  expect(html).toMatch(/F7/);
  expect(html).toMatch(/F8/);
  expect(html).toMatch(/L then 1–9/);
  expect(html).toMatch(/>T</);
  expect(html).toMatch(/>M</);
  expect(html).toMatch(/F then 3-digit min/);
  expect(html).toMatch(/Tab/);
});

test("closed overlay renders nothing", () => {
  expect(renderToStaticMarkup(createElement(ScopeHelpOverlay, { open: false }))).toBe("");
});

test("AC8 — help copy says radio commands stay on the command line", () => {
  const html = renderToStaticMarkup(createElement(ScopeHelpOverlay, { open: true }));
  expect(html).toContain(RADIO_CONFLICT_WARNING);
  expect(html).toMatch(/Radio commands stay on the command line/);
  expect(html).toMatch(/never come from scope keys/);
});

test("AC9 — glossary terms and CRC analog → our key; no CRC-only cheat sheet", () => {
  const html = renderToStaticMarkup(createElement(ScopeHelpOverlay, { open: true }));
  expect(html).toContain(HELP_GLOSSARY_NOTE);
  expect(html).toMatch(/range/);
  expect(html).toMatch(/datablock/);
  expect(html).toMatch(/leader/);
  expect(html).toMatch(/initiate track/);
  expect(html).toMatch(/CRC analog/);
  expect(html).toMatch(/→/);
  expect(html).toMatch(/Our key/);
  expect(html).not.toMatch(/beaconator cheat/i);
  expect(html).not.toMatch(/paste a CRC/i);
});

test("shell mounts the F1 overlay from KEY_BINDINGS and installs always-on keys", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const shell = sources["./shell.tsx"]!;
  expect(shell).toMatch(/ScopeHelpOverlay/);
  expect(shell).toMatch(/scopeView\.helpOpen/);
  expect(shell).toMatch(/installAlwaysOnScopeKeys/);
  expect(shell).toMatch(/focusRadioCommandLine/);
  expect(shell).toMatch(/HELP_KEYS_POINTER/);
});

test("overlay maps KEY_BINDINGS — no duplicated key rows in JSX", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./ScopeHelpOverlay.tsx"]!;
  expect(src).toMatch(/alwaysOnKeyBindings/);
  expect(src).toMatch(/scopeFocusKeyBindings/);
  expect(src).toMatch(/mouseKeyBindings/);
  expect(src).toMatch(/HELP_FOOTER/);
  expect(src).not.toMatch(/windowsKeys:\s*"/);
  for (const binding of KEY_BINDINGS) {
    expect(src).not.toContain(`>${binding.windowsKeys}<`);
  }
});
