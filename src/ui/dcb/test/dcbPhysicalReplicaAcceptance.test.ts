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

test("AC1 — MAIN renders six WX latches, enabled SITE, enabled MODE FSL spinner", () => {
  const html = dcbHtml();
  for (const id of ["wx1", "wx2", "wx3", "wx4", "wx5", "wx6"]) {
    expect(html).toMatch(new RegExp(`data-dcb-layout-id="${id}"`));
    expect(html).toMatch(new RegExp(`aria-label="${id.toUpperCase()}"[^>]*data-dcb-kind="toggle"`));
    expect(html).not.toMatch(new RegExp(`aria-label="${id.toUpperCase()}"[^>]*\\bdisabled\\b`));
  }
  expect(html).toMatch(/aria-label="Mode FSL"[^>]*data-dcb-kind="spinner"/);
  expect(html).not.toMatch(/aria-label="Mode FSL"[^>]*disabled/);
  expect(html).toMatch(/aria-label="SITE FUSED"/);
  expect(html).not.toMatch(/aria-label="SITE FUSED"[^>]*disabled/);
  expect(html).toContain('data-dcb-layout="MAIN"');
  expect(html).toContain('data-dcb-layout-id="map-6"');
});

test("T02-121 — WX caps show AVL only for their own populated VIP masks", () => {
  const view = createScopeView();
  view.wxMosaic = {
    ...view.wxMosaic,
    widthPx: 3,
    heightPx: 1,
    vipMasks: [
      new Uint8Array([0]),
      new Uint8Array([0b010]),
      new Uint8Array([0]),
      new Uint8Array([0]),
      new Uint8Array([0]),
      new Uint8Array([0b100]),
    ],
  };
  const html = renderToStaticMarkup(
    createElement(DisplayControlBar, { view, onChange: () => undefined }),
  );
  const wxCap = (n: number) =>
    html.match(new RegExp(`<button[^>]*data-dcb-cell="wx${n}"[^>]*>[\\s\\S]*?</button>`))?.[0] ??
    "";

  expect(wxCap(1)).toContain("WX1");
  expect(wxCap(1)).not.toContain("AVL");
  expect(wxCap(2)).toContain("WX2");
  expect(wxCap(2)).toContain("AVL");
  expect(wxCap(3)).not.toContain("AVL");
  expect(wxCap(4)).not.toContain("AVL");
  expect(wxCap(5)).not.toContain("AVL");
  expect(wxCap(6)).toContain("AVL");
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
  expect(css).toMatch(/border-right:\s*2px solid #555555/);
  expect(css).toMatch(/\.dcb-main-grid,[\s\S]*?gap:\s*1px !important;/);
  for (const [layout, columns] of [
    ["AUX", 17],
    ["MAPS", 18],
    ["BRITE", 10],
    ["CHAR_SIZE", 6],
    ["PREF", 20],
    ["SSA_FILTER", 13],
    ["GI_FILTER", 6],
    ["TPA_ATPA", 7],
  ] as const) {
    expect(css).toMatch(
      new RegExp(
        `\\[data-dcb-layout="${layout}"\\][\\s\\S]*?grid-template-columns:\\s*repeat\\(${columns},\\s*72px\\)`,
      ),
    );
  }
  expect(css).toMatch(
    /\[data-dcb-layout="SITE"\][\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*72px\)[\s\S]*?grid-template-rows:\s*repeat\(1,\s*72px\)/,
  );
  expect(css).toMatch(
    /\[data-dcb-layout="SITE"\] \.dcb-main-grid-cell > \.dcb-cell[\s\S]*?width:\s*72px;[\s\S]*?height:\s*72px;/,
  );
  expect(css).toMatch(/\.dcb-vertical\s+\.dcb-cell[\s\S]*?border-bottom:\s*2px solid #555555/);
  expect(css).toMatch(
    /\.dcb-main-grid-cell\[data-dcb-row="1"\]:not\(\[data-dcb-row-span="2"\]\) > \.dcb-cell[\s\S]*?border-bottom:\s*2px solid #555555/,
  );
  expect(css).toMatch(/\.dcb-cell[\s\S]*?font-weight:\s*500;/);
  expect(css).toMatch(/\.dcb-cell[\s\S]*?inset 0 1px var\(--dcb-highlight/);
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
  expect(PALETTE.unowned).toBe("#259925");
  expect(PALETTE.owned).toBe("#FFFFFF");
});

test("AC6 — DCB on LEFT and RIGHT docks renders with dcb-vertical class and 2-column vertical grid", () => {
  const viewLeft = createScopeView();
  viewLeft.dcbDock = "LEFT";
  const htmlLeft = renderToStaticMarkup(
    createElement(DisplayControlBar, { view: viewLeft, onChange: () => undefined }),
  );
  expect(htmlLeft).toContain('class="dcb dcb-vertical"');
  expect(htmlLeft).toContain('data-dcb-dock="LEFT"');

  const viewRight = createScopeView();
  viewRight.dcbDock = "RIGHT";
  const htmlRight = renderToStaticMarkup(
    createElement(DisplayControlBar, { view: viewRight, onChange: () => undefined }),
  );
  expect(htmlRight).toContain('class="dcb dcb-vertical"');
  expect(htmlRight).toContain('data-dcb-dock="RIGHT"');

  const css = cssSource();
  expect(css).toMatch(/\.dcb-vertical\s*\{[^}]*flex-direction:\s*column;/);
  expect(css).toMatch(/\.dcb-vertical\s+\.dcb-main-grid/);
  expect(css).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test("AC7 — DCB follows fixed button widths without horizontal width cap", () => {
  const css = cssSource();
  const source = readFileSync(new URL("../DisplayControlBar.tsx", import.meta.url), "utf8");
  expect(css).toMatch(/\.dcb\s*\{[^}]*width:\s*max-content;/);
  expect(css).toMatch(/\.dcb\s*\{[^}]*flex:\s*0 0 80px;/);
  expect(css).toMatch(/\.dcb\s*\{[^}]*overflow:\s*hidden;/);
  expect(css).toMatch(/\.dcb-main-grid,[\s\S]*?min-width:\s*0;/);
  expect(css).toMatch(/\.dcb-vertical\s*\{[^}]*width:\s*80px;/);
  expect(css).toMatch(/\.dcb-vertical\s*\{[^}]*height:\s*1290px;/);
  expect(css).toMatch(
    /grid-template-columns:\s*repeat\(8,\s*72px\)\s*repeat\(6,\s*45px\)\s*repeat\(8,\s*72px\)/,
  );
  expect(source).toContain("height: vertical ? DCB_WIDTH_PX : DCB_HEIGHT_PX");
  expect(source).toContain('width: vertical ? DCB_HEIGHT_PX : "max-content"');
});
