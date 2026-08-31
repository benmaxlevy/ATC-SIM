/**
 * T02-72 combined WX mosaic acceptance: DCB latches, preview `*WX`, BRITE
 * WX/WXC, and cached VIP fill/contour paint share one display-only path.
 *
 * Manual Chrome KATL live IEM walk is skip-with-reason: no visual operator.
 * Do not invent a visual pass.
 */
import { expect, test } from "vitest";
import { INSTRUCTION_TYPES, SessionLog, createWorld, makeTestAircraft } from "@core";
import { handleRadioText } from "@pilot";
import { applyBrite } from "./palette";
import { handleScopeKeyDown } from "./scopeKeys";
import { createScopeView } from "./scopeView";
import { stepBriteChannel, toggleWxLevel } from "./dcbFunctions";
import {
  WX_VIP_CONTOUR_HEX,
  WX_VIP_FILL_HEX,
  drawWeatherLayer,
  wxVipContourHex,
  wxVipFillHex,
} from "./weatherLayer";
import { bboxFromArp, decodeRgbaToVipMasks } from "./wx";

function keyEvent(key: string) {
  return {
    key,
    preventDefault(): void {},
    stopPropagation(): void {},
  };
}

function typeKeys(
  view: ReturnType<typeof createScopeView>,
  world: ReturnType<typeof createWorld>,
  keys: string[],
  focus: "scope" | "radio" = "scope",
  startMs = 0,
): number {
  let now = startMs;
  for (const key of keys) {
    handleScopeKeyDown(keyEvent(key), view, focus, world, now);
    now += 100;
  }
  return now;
}

function vip1Mosaic() {
  const rgba = new Uint8Array(2 * 2 * 4);
  for (let i = 0; i < 4; i++) {
    const o = i * 4;
    rgba[o] = 0;
    rgba[o + 1] = 255;
    rgba[o + 2] = 0;
    rgba[o + 3] = 255;
  }
  return decodeRgbaToVipMasks(rgba, 2, 2, bboxFromArp({ latDeg: 0, lonDeg: 0 }, 4), 1_000);
}

function mockDrawCtx() {
  const drawImages: { image: unknown }[] = [];
  const ctx = {
    drawImage(image: unknown) {
      drawImages.push({ image });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawImages };
}

test("T02-72 — DCB WX, *WX, and BRITE WX/WXC share one display-only paint path", async () => {
  const log = new SessionLog();
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    headingDeg: 90,
    xNm: 16,
    yNm: 8,
  });
  const world = createWorld({ aircraft: [dal], sessionLog: log });
  const view = createScopeView();
  view.wxMosaic = vip1Mosaic();
  const size = { widthPx: 800, heightPx: 800 };

  expect(view.wxLevels).toEqual([false, false, false, false, false, false]);
  expect(view.brite.wx).toBe(100);
  expect(view.brite.wxc).toBe(100);
  expect(view.brite.bkc).toBe(100);
  const off = mockDrawCtx();
  drawWeatherLayer(off.ctx, view, size);
  expect(off.drawImages).toHaveLength(0);

  toggleWxLevel(view, 1);
  expect(view.wxLevels).toEqual([true, false, false, false, false, false]);
  const dcbPaint = mockDrawCtx();
  drawWeatherLayer(dcbPaint.ctx, view, size);
  expect(dcbPaint.drawImages).toHaveLength(1);

  typeKeys(view, world, ["*", "W", "X", "1", "Enter"]);
  expect(view.wxLevels).toEqual([false, false, false, false, false, false]);
  const previewOff = mockDrawCtx();
  drawWeatherLayer(previewOff.ctx, view, size);
  expect(previewOff.drawImages).toHaveLength(0);

  const prior = [...view.wxLevels];
  typeKeys(view, world, ["*", "W", "X", "7", "Enter"], "scope", 200);
  expect(view.preview.rejection).toBe("*WX7 INV");
  expect(view.wxLevels).toEqual(prior);

  typeKeys(view, world, ["*", "W", "X", "1", "Enter"], "scope", 400);
  expect(view.wxLevels).toEqual([true, false, false, false, false, false]);

  stepBriteChannel(view, "wx", -5);
  stepBriteChannel(view, "wxc", -6);
  expect(view.brite.wx).toBe(50);
  expect(view.brite.wxc).toBe(40);
  expect(view.brite.bkc).toBe(100);

  const painted = mockDrawCtx();
  drawWeatherLayer(painted.ctx, view, size);
  expect(painted.drawImages).toHaveLength(1);
  expect(wxVipFillHex(1, view.brite.wx)).toBe(applyBrite(WX_VIP_FILL_HEX[0], 50));
  expect(wxVipContourHex(1, view.brite.wxc)).toBe(applyBrite(WX_VIP_CONTOUR_HEX[0], 40));

  const reuse = mockDrawCtx();
  drawWeatherLayer(reuse.ctx, view, size);
  expect(reuse.drawImages).toHaveLength(1);
  expect(reuse.drawImages[0]!.image).toBe(painted.drawImages[0]!.image);

  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(INSTRUCTION_TYPES).toHaveLength(17);
  expect(dal.intent.assignedHeadingDeg).toBe(90);

  const result = await handleRadioText(world, "DAL123 H270", log);
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(view.wxLevels).toEqual([true, false, false, false, false, false]);
  expect(view.brite.wx).toBe(50);
  expect(view.brite.wxc).toBe(40);
});

test("T02-72 — weather paint has no OSM, facility-id branch, or per-frame decode", () => {
  const paintSources = import.meta.glob("./weatherLayer.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const wxDir = import.meta.glob("./wx/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const paint = paintSources["./weatherLayer.ts"] ?? "";
  expect(paint).toMatch(/drawImage/);
  expect(paint).toMatch(/applyBrite/);
  expect(paint).toMatch(/brite\.wxc/);
  expect(paint).not.toMatch(/icao\s*===/);
  expect(paint).not.toMatch(/"KDEM"|"KATL"/);
  expect(paint).not.toMatch(/JSON\.parse/);
  expect(paint).not.toMatch(/\bfetch\s*\(/);
  expect(paint).not.toMatch(/openstreetmap/i);
  for (const [path, src] of Object.entries(wxDir)) {
    if (path.includes(".test.")) {
      continue;
    }
    expect(src, path).not.toMatch(/openstreetmap/i);
    expect(src, path).not.toMatch(/icao\s*===/);
  }
});
