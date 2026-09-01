/**
 * T02-33 physical-replica gate. The checks protect STARS-like DCB grammar and
 * CSS presentation without claiming a pixel-perfect or proprietary clone.
 *
 * Manual Chrome Windows steps at 1440x900 and 804x900 are skip-with-reason:
 * this worker has no human visual operator. Do not invent a visual pass.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import { PALETTE, createScopeView } from "@scope";
import { DisplayControlBar, MAIN_DCB_LAYOUT } from "../DisplayControlBar";

function dcbHtml() {
  return renderToStaticMarkup(
    createElement(DisplayControlBar, { view: createScopeView(), onChange: () => undefined }),
  );
}

function cssSource(): string {
  return readFileSync(new URL("../../../index.css", import.meta.url), "utf8");
}

test("AC1 — MAIN is the fixed two-row, 22-column physical DCB descriptor", () => {
  expect(MAIN_DCB_LAYOUT).toHaveLength(29);
  expect(MAIN_DCB_LAYOUT.map(({ id }) => id)).toEqual([
    "range",
    "place-cntr",
    "off-cntr",
    "rr",
    "place-rr",
    "rr-cntr",
    "maps",
    "map-1",
    "map-2",
    "map-3",
    "map-4",
    "map-5",
    "map-6",
    "wx1",
    "wx2",
    "wx3",
    "wx4",
    "wx5",
    "wx6",
    "brite",
    "ldr-dir",
    "ldr-length",
    "char",
    "mode-fsl",
    "pref",
    "site-fused",
    "ssa-filter",
    "gi-text",
    "shift",
  ]);
  expect(MAIN_DCB_LAYOUT.filter((cell) => cell.rowSpan === 2).map(({ column }) => column)).toEqual([
    1, 3, 5, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 22,
  ]);

  expect(
    MAIN_DCB_LAYOUT.filter(({ id }) => id.startsWith("map-")).map(({ id, row, column }) => [
      id,
      row,
      column,
    ]),
  ).toEqual([
    ["map-1", 1, 6],
    ["map-2", 1, 7],
    ["map-3", 1, 8],
    ["map-4", 2, 6],
    ["map-5", 2, 7],
    ["map-6", 2, 8],
  ]);
  expect(MAIN_DCB_LAYOUT.filter(({ id }) => id.startsWith("wx"))).toHaveLength(6);
  expect(MAIN_DCB_LAYOUT.every(({ row, rowSpan }) => row === 1 || rowSpan === 1)).toBe(true);
});

test("AC1 — MAIN renders six WX latches, enabled SITE, enabled MODE FSL toggle", () => {
  const html = dcbHtml();
  for (const id of ["wx1", "wx2", "wx3", "wx4", "wx5", "wx6"]) {
    expect(html).toMatch(new RegExp(`data-dcb-layout-id="${id}"`));
    expect(html).toMatch(new RegExp(`aria-label="${id.toUpperCase()}"[^>]*data-dcb-kind="toggle"`));
    expect(html).not.toMatch(new RegExp(`aria-label="${id.toUpperCase()}"[^>]*\\bdisabled\\b`));
  }
  expect(html).toMatch(/aria-label="Mode FSL"[^>]*data-dcb-kind="toggle"/);
  expect(html).not.toMatch(/aria-label="Mode FSL"[^>]*disabled/);
  expect(html).toMatch(/aria-label="SITE FUSED"/);
  expect(html).not.toMatch(/aria-label="SITE FUSED"[^>]*disabled/);
  expect(html).toContain('data-dcb-layout="MAIN"');
  expect(html).toContain('data-dcb-layout-id="map-6"');
});

test("AC2 — normal, pressed, and disabled caps have distinct physical tokens", () => {
  const normal = dcbHtml();
  expect(normal).toMatch(/data-dcb-kind="spinner"/);
  expect(normal).toContain(`--dcb-cap:${PALETTE.dcbCap}`);
  expect(normal).toContain(`--dcb-text:${PALETTE.dcbText}`);
  expect(normal).toContain(`--dcb-disabled-text:${PALETTE.dcbDisabledText}`);
  expect(normal).toContain(`--dcb-pressed:${PALETTE.dcbPressed}`);
  expect(normal).toContain(`--dcb-pressed-text:${PALETTE.dcbPressedText}`);
  expect(normal).toMatch(/data-dcb-kind="disabled"/);

  const view = createScopeView();
  view.placeCenterArmed = true;
  const pressed = renderToStaticMarkup(
    createElement(DisplayControlBar, { view, onChange: () => undefined }),
  );
  expect(pressed).toMatch(/aria-pressed="true"[^>]*data-dcb-cell="place"/);

  const css = cssSource();
  expect(css).toMatch(/\.dcb-cell:not\(:disabled\):not\(\[aria-disabled="true"\]\)/);
  expect(css).toMatch(/inset 1px 1px var\(--dcb-highlight/);
  expect(css).toMatch(/inset -2px -2px var\(--dcb-shadow/);
  expect(css).toMatch(/inset 2px 2px var\(--dcb-pressed-shadow/);
  expect(css).toMatch(/inset -1px -1px var\(--dcb-pressed-highlight/);
  expect(css).toMatch(/var\(--dcb-disabled-text,\s*#4c604c\)/i);
  expect(css).not.toMatch(/repeating-linear-gradient|raster|stripe/i);
});

test("AC5 — copy and typography remain a STARS-like trainer approximation", () => {
  const source = readFileSync(new URL("../DisplayControlBar.tsx", import.meta.url), "utf8");
  expect(source).toMatch(/Analog: CRC STARS/i);
  expect(source).toMatch(/Not NAS STARS/i);
  expect(source).not.toMatch(/proprietary|licensed.*font|STARS.*\.ttf/i);
  expect(source).not.toMatch(/from\s+["']@parse["']/);
  expect(source).not.toMatch(/from\s+["']@pilot["']/);
  expect(PALETTE.background).toBe("#000000");
  expect(PALETTE.map).toBe("#8C8C8C");
  expect(PALETTE.unowned).toBe("#00FF00");
  expect(PALETTE.owned).toBe("#FFFFFF");
});
