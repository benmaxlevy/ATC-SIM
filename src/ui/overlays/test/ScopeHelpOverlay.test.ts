import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import {
  HELP_COMMAND_GROUPS,
  HELP_FOOTER,
  HELP_NAVIGATION_GROUPS,
  KEY_BINDINGS,
  RADIO_CONFLICT_WARNING,
} from "@scope";
import { DISCLAIMER_COPY } from "../disclaimer";
import { normalizeHelpSearchText, ScopeHelpOverlay } from "../ScopeHelpOverlay";

test("search normalization lowercases text and preserves internal spaces", () => {
  expect(normalizeHelpSearchText("  *M 14 5252  ")).toBe("  *m 14 5252  ");
});

test("command reference lists local command groups and frozen keys", () => {
  const html = renderToStaticMarkup(createElement(ScopeHelpOverlay, { open: true }));
  expect(html).toMatch(/id="scope-help-search"/);
  expect(html).toMatch(/Find a command or description/);
  expect(html).toMatch(/<details class="scope-help-section">/);
  expect(HELP_NAVIGATION_GROUPS).toHaveLength(3);
  expect(HELP_NAVIGATION_GROUPS.map((group) => group.title)).toEqual([
    "Aircraft & flight plans",
    "Scope & display",
    "Workstation & trainer controls",
  ]);
  expect(html.match(/<details class="scope-help-top-section"/g)).toHaveLength(3);
  const bindingIds = HELP_NAVIGATION_GROUPS.flatMap((group) =>
    group.bindingSections.flatMap((section) => section.bindingIds),
  );
  expect(bindingIds).toHaveLength(KEY_BINDINGS.length);
  expect(new Set(bindingIds)).toHaveLength(bindingIds.length);
  expect(new Set(bindingIds)).toEqual(new Set(KEY_BINDINGS.map((binding) => binding.id)));
  for (const navigationGroup of HELP_NAVIGATION_GROUPS) {
    expect(html).toContain(navigationGroup.title.replaceAll("&", "&amp;"));
  }
  expect(html).toContain(HELP_FOOTER);
  expect(html).toContain(DISCLAIMER_COPY);
  expect(html).toMatch(/PageUp/);
  expect(html).toMatch(/PageDown/);
  expect(html).toMatch(/Home/);
  expect(html).toMatch(/End/);
  expect(html).toMatch(/F3/);
  expect(html).toMatch(/F4/);
  expect(html).toMatch(/F7/);
  expect(html).toMatch(/F8/);
  expect(html).toMatch(/Shift\+H/);
  expect(html).toMatch(/>T</);
  expect(html).toMatch(/>M</);
  expect(html).toMatch(/F then 3-digit min/);
  expect(html).toMatch(/Tab/);
  expect(html).toMatch(/Click to accept the pending inbound handoff/);
  for (const group of HELP_COMMAND_GROUPS) {
    expect(html).toContain(group.title);
    for (const entry of group.entries) {
      expect(html).toContain(entry.example);
    }
  }
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

test("help copy is local-only and teaches command boundaries", () => {
  const html = renderToStaticMarkup(createElement(ScopeHelpOverlay, { open: true }));
  expect(html).toMatch(/Use this reference for the trainer/);
  expect(html).toMatch(/range/);
  expect(html).toMatch(/datablock/);
  expect(html).toMatch(/leader/);
  expect(html).toMatch(/initiate or associate/i);
  expect(html).toMatch(/Radio commands/);
  expect(html).toMatch(/Focus and Preview Area/);
  expect(html).toMatch(/Scope &amp; display/);
  expect(html).not.toMatch(/\b(CRC|vNAS|vice)\b/);
});

test("shell mounts the F1 overlay from KEY_BINDINGS and installs always-on keys", () => {
  const sources = import.meta.glob(["../../*.{ts,tsx}", "../../**/*.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const shell = sources["../../shell.tsx"]!;
  expect(shell).toMatch(/ScopeHelpOverlay/);
  expect(shell).toMatch(/scopeView\.helpOpen/);
  expect(shell).toMatch(/installAlwaysOnScopeKeys/);
  expect(shell).toMatch(/focusRadioCommandLine/);
  expect(shell).not.toMatch(/HELP_KEYS_POINTER/);
});

test("overlay maps KEY_BINDINGS — no duplicated key rows in JSX", () => {
  const sources = import.meta.glob(["../../*.{ts,tsx}", "../../**/*.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["../ScopeHelpOverlay.tsx"]!;
  expect(src).toMatch(/alwaysOnKeyBindings/);
  expect(src).toMatch(/scopeFocusKeyBindings/);
  expect(src).toMatch(/mouseKeyBindings/);
  expect(src).toMatch(/HELP_FOOTER/);
  expect(src).not.toMatch(/windowsKeys:\s*"/);
  for (const binding of KEY_BINDINGS) {
    expect(src).not.toContain(`>${binding.windowsKeys}<`);
  }
});
test("F1 notes SHIFT swaps MAIN/AUX and Esc closes a submenu", () => {
  const html = renderToStaticMarkup(createElement(ScopeHelpOverlay, { open: true }));
  expect(html).toContain("SHIFT swaps MAIN and AUX");
  expect(html).toContain("Esc closes a DCB submenu");
  expect(html).toContain("traps the cursor in that cell");
  expect(html).toContain("traps the cursor in the DCB boxes");
  expect(html).toContain("PLACE CNTR");
  expect(html).toContain("OFF CNTR");
  expect(html).toContain("PLACE RR");
  expect(html).toContain("RR CNTR");
  expect(html).toContain("LDR DIR");
  expect(html).toContain(HELP_FOOTER);
});
