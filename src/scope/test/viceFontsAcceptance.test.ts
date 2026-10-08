/** Acceptance: fonts converted from Vice's ARTS bitmaps, native sizes and load gate. */
import { createAircraft, createWorld } from "@core";
import { drawTargetSymbol } from "../render/targetSymbol";
import { drawTracks } from "../render/renderScopePaint";
import { syncTrackDisplays } from "../trackDisplay";
import { createMockCtx } from "./mockCanvas";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../../../public/fonts/vice/manifest.json";
import notice from "../../../public/fonts/vice/NOTICE.txt?raw";
import { createScopeView } from "../scopeView";
import { stepCharSizeChannel, formatDcbCharReadout } from "../dcb/dcbFunctions";
import {
  armDcbSpinner,
  inputDcbSpinnerKey,
  commitDcbSpinner,
  cancelDcbSpinner,
  stepDcbSpinner,
  validateDcbSpinnerValue,
  type DcbSpinnerCell,
} from "../dcb/dcbMenu";
import { applyDcbPref, serializeDcbPref } from "../dcb/dcbPref";
import {
  CHAR_SIZE_STEPS_PX,
  DCB_CHAR_SIZE_STEPS_PX,
  datablockFontCss,
  datablockLineHeightPx,
  dcbFontStyle,
  POS_SIZE_STEPS_PX,
  cloneCharSizes,
} from "../fonts";

const displayHeights = [10, 11, 12, 13, 14, 15];

afterEach(() => {
  vi.useRealTimers();
});

describe("Vice ARTS font acceptance", () => {
  it("uses a uniform 10–15 px progression while retaining old CHAR SIZE tokens", () => {
    for (const [level, token] of CHAR_SIZE_STEPS_PX.entries()) {
      const size = level;
      expect(datablockFontCss(token)).toContain(`${displayHeights[size]}px "Vice ARTS ${size}"`);
      expect(datablockLineHeightPx(token)).toBe(displayHeights[size]);
    }
    for (const [level, token] of DCB_CHAR_SIZE_STEPS_PX.entries()) {
      expect(dcbFontStyle(token).fontFamily).toContain(`"Vice ARTS ${level}"`);
      expect(dcbFontStyle(token).fontSize).toBe(displayHeights[level]);
    }
    const view = createScopeView();
    view.charSizes.dataBlocks = 13;
    const body = serializeDcbPref(view);
    applyDcbPref(view, JSON.parse(JSON.stringify(body)));
    expect(view.charSizes.dataBlocks).toBe(13);
    const old = { ...body, charSizes: { dataBlocks: 14, lists: 14, tools: 14, pos: 10, dcb: 11 } };
    applyDcbPref(view, old as unknown as typeof body);
    expect(view.charSizes).toEqual({ dataBlocks: 13, lists: 13, tools: 13, pos: 9, dcb: 11 });
    expect(cloneCharSizes({ lists: 500 }).lists).toBe(12);
    expect(POS_SIZE_STEPS_PX).toHaveLength(6);
    expect(body).not.toHaveProperty("fontFamily");
  });

  it("enforces menu, wheel, drag, and typed ranges 0–5, except DCB 0–2", () => {
    const channels = [
      ["dataBlocks", "CHAR_DATA_BLOCKS"],
      ["lists", "CHAR_LISTS"],
      ["tools", "CHAR_TOOLS"],
      ["pos", "CHAR_POS"],
      ["dcb", "CHAR_DCB"],
    ] as const;
    for (const [channel, cell] of channels) {
      const view = createScopeView();
      const max = channel === "dcb" ? 2 : 5;
      for (let i = 0; i < 20; i++) stepCharSizeChannel(view, channel, 1);
      expect(formatDcbCharReadout(view.charSizes[channel], channel)).toBe(String(max));
      armDcbSpinner(view, cell);
      inputDcbSpinnerKey(view, "0");
      expect(commitDcbSpinner(view)).toBe(true);
      expect(formatDcbCharReadout(view.charSizes[channel], channel)).toBe("0");
      armDcbSpinner(view, cell);
      stepDcbSpinner(view, 1, (step) => stepCharSizeChannel(view, channel, step));
      expect(view.dcbSpinner.buffer).toBe("1");
      expect(commitDcbSpinner(view)).toBe(true);
      expect(formatDcbCharReadout(view.charSizes[channel], channel)).toBe("1");
      armDcbSpinner(view, cell);
      inputDcbSpinnerKey(view, String(max));
      expect(commitDcbSpinner(view)).toBe(true);
      expect(formatDcbCharReadout(view.charSizes[channel], channel)).toBe(String(max));
      armDcbSpinner(view, cell);
      inputDcbSpinnerKey(view, String(max + 1));
      expect(commitDcbSpinner(view)).toBe(false);
      expect(formatDcbCharReadout(view.charSizes[channel], channel)).toBe(String(max));
      armDcbSpinner(view, cell);
      inputDcbSpinnerKey(view, "0");
      cancelDcbSpinner(view);
      expect(formatDcbCharReadout(view.charSizes[channel], channel)).toBe(String(max));
      expect(validateDcbSpinnerValue(cell as DcbSpinnerCell, 1.5)).toBe(false);
    }
  });

  it("remeasures and replaces layout/pick snapshots when native size or measured widths change", () => {
    const ac = createAircraft({
      id: "font-test",
      callsign: "TEST123",
      xNm: 0,
      yNm: 0,
      headingDeg: 0,
      altitudeFt: 5000,
      speedKt: 200,
    });
    const world = createWorld({ aircraft: [ac] });
    const view = createScopeView();
    syncTrackDisplays(view.tracks, world);
    view.tracks.get(ac.id)!.ownership = "owned";
    const { ctx } = createMockCtx();
    let advance = 10;
    ctx.measureText = (text) => ({ width: text.length * advance }) as TextMetrics;
    view.charSizes.dataBlocks = 8;
    drawTracks(ctx, world, view, { widthPx: 800, heightPx: 800 });
    const first = view.datablockRenderSnapshot!.layouts.get(ac.id)!.rect!;
    drawTracks(ctx, world, view, { widthPx: 800, heightPx: 800 });
    expect(view.datablockRenderSnapshot!.layouts.get(ac.id)!.rect).toEqual(first);
    view.charSizes.dataBlocks = 13;
    drawTracks(ctx, world, view, { widthPx: 800, heightPx: 800 });
    expect(view.datablockRenderSnapshot!.layouts.get(ac.id)!.rect!.height).toBeGreaterThan(
      first.height,
    );
    advance = 20;
    drawTracks(ctx, world, view, { widthPx: 800, heightPx: 800 });
    expect(view.datablockRenderSnapshot!.layouts.get(ac.id)!.rect!.width).toBeGreaterThan(
      first.width,
    );
    expect(view.datablockRenderSnapshot!.presentations.has(ac.id)).toBe(true);
  });

  it("centers position ink inside a tighter fused circle and encloses square strokes", () => {
    for (const size of POS_SIZE_STEPS_PX) {
      const { ctx, fillTexts } = createMockCtx();
      let radius = 0;
      ctx.arc = (_x, _y, value) => {
        radius = value;
      };
      ctx.measureText = () =>
        ({
          width: 28,
          actualBoundingBoxLeft: 13,
          actualBoundingBoxRight: 11,
          actualBoundingBoxAscent: 8,
          actualBoundingBoxDescent: 5,
        }) as TextMetrics;
      drawTargetSymbol(ctx, 0, 0, "#ffffff", { tracked: true, sectorId: "1N" }, size);
      expect(fillTexts.at(-1)).toMatchObject({ x: 1, y: 1.5 });
      const nativeLevel = size - 4;
      expect(fillTexts.at(-1)!.font).toContain(
        `${displayHeights[nativeLevel]}px "Vice ARTS ${nativeLevel}"`,
      );
      for (const x of [-12, 12])
        for (const y of [-6.5, 6.5]) {
          expect(Math.hypot(x, y)).toBeLessThan(radius);
        }
      expect(radius).toBeGreaterThanOrEqual(Math.max(5, Math.round(size * 0.65)));
      expect(radius).toBeLessThan(Math.hypot(13, 8) + 1);
      drawTargetSymbol(
        ctx,
        0,
        0,
        "#ffffff",
        { squawk: "1234", beaconSelect: new Set(["1234"]) },
        size,
      );
      const outerHalf = (size + 1) / 2;
      expect(Math.hypot(outerHalf, outerHalf)).toBeLessThan(radius);
    }
  });

  it("ships verified ARTS assets and explicit symbol mappings with notices", () => {
    expect(manifest.license).toBe("GPL-3.0-only");
    expect(manifest.aliases).toMatchObject({ "916": 128, "8710": 128, "9650": 30, "9660": 31 });
    for (const asset of manifest.assets) {
      expect(asset.family).toBe("arts");
      expect(asset.verifiedPixelSamples).toBeGreaterThan(0);
    }
    expect(notice).toContain("Copyright(c) 2022-2025 vice contributors");
  });

  it("waits for fonts before measurement and loads only ARTS", async () => {
    vi.resetModules();
    const fonts = await import("../fonts");
    let finish!: (faces: FontFace[]) => void;
    const pending = new Promise<FontFace[]>((resolve) => {
      finish = resolve;
    });
    const load = vi.fn(() => pending);
    const ready = fonts.loadScopeFonts({ load });
    expect(fonts.scopeFontsReady()).toBe(false);
    expect(load.mock.calls).toHaveLength(6);
    finish([{} as FontFace]);
    await ready;
    expect(fonts.scopeFontsReady()).toBe(true);
    expect(fonts.datablockFontCss()).toContain("Vice ARTS");
  });

  it("uses a stable measured fallback on rejection, empty load, or timeout", async () => {
    for (const mode of ["reject", "empty", "timeout"] as const) {
      vi.resetModules();
      vi.useFakeTimers();
      const fonts = await import("../fonts");
      const load = vi.fn((): Promise<FontFace[]> => {
        if (mode === "reject") return Promise.reject(new Error("font unavailable"));
        if (mode === "empty") return Promise.resolve([]);
        return new Promise(() => {});
      });
      const ready = fonts.loadScopeFonts({ load }, 25);
      await vi.advanceTimersByTimeAsync(25);
      await ready;
      expect(fonts.scopeFontsReady()).toBe(true);
      expect(fonts.datablockFontCss(12)).toBe(`14px ${fonts.FALLBACK_SCOPE_FONT_STACK}`);
      expect(fonts.dcbFontStyle(11).fontFamily).toBe(fonts.FALLBACK_SCOPE_FONT_STACK);
      vi.useRealTimers();
    }
  });
});
