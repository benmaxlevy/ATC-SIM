import { emptyWxMosaic } from "../wx/mosaic";
import { describe, expect, test } from "vitest";
import {
  buildSsaLines,
  buildSsaRenderLines,
  createScopeView,
  defaultSsaVisibility,
  formatSsaWxTelemetry,
  toggleSsaFilter,
  serializeDcbPref,
  applyDcbPref,
  DEFAULT_ALTITUDE_FILTER,
  idleFilterEntry,
} from "@scope";

function availableMosaic(fetchedAtMs = 1) {
  return {
    ...emptyWxMosaic({ fetchedAtMs }),
    widthPx: 1,
    heightPx: 1,
    vipMasks: [
      new Uint8Array([1]),
      new Uint8Array([1]),
      new Uint8Array([1]),
      new Uint8Array([1]),
      new Uint8Array([1]),
      new Uint8Array([0]),
    ] as ReturnType<typeof emptyWxMosaic>["vipMasks"],
  };
}

describe("SSA weather level selection", () => {
  test.each([
    [[false, false, false, false, false, false], "1 2 3 4 5"],
    [[false, false, true, true, true, false], "1 2 (3) (4) (5)"],
    [[true, true, true, true, true, true], "(1) (2) (3) (4) (5)"],
  ])("shows available levels and parenthesizes selected levels", (levels, text) => {
    expect(formatSsaWxTelemetry(levels as boolean[], availableMosaic())).toEqual({
      text,
      isStale: false,
    });
  });

  test("missing or empty weather data displays no levels, even when selected", () => {
    const selected = [true, true, true, true, true, true];
    expect(formatSsaWxTelemetry(selected).text).toBe("");
    expect(formatSsaWxTelemetry(selected, emptyWxMosaic()).text).toBe("");
  });

  test("mosaic age does not replace level selection with telemetry or an alert", () => {
    const renderLines = buildSsaRenderLines({
      simTimeMs: 18 * 60 * 1000,
      rangeNm: 20,
      offCenter: false,
      filter: DEFAULT_ALTITUDE_FILTER,
      filterEntry: idleFilterEntry(DEFAULT_ALTITUDE_FILTER),
      wxLevels: [true, false, false, false, false, false],
      wxMosaic: availableMosaic(),
    });
    expect(renderLines).toContainEqual({ text: "(1) 2 3 4 5", style: "normal" });
  });

  test("AC3 — SSA FILTER WX toggle hides and shows weather status in SSA", () => {
    const fetchedAt = new Date("2026-09-01T14:30:00Z").getTime();
    const now = fetchedAt + 2 * 60 * 1000;

    const vis = defaultSsaVisibility();
    expect(vis.WX).toBe(true);

    const shown = buildSsaLines({
      simTimeMs: now,
      nowMs: now,
      rangeNm: 20,
      offCenter: false,
      filter: DEFAULT_ALTITUDE_FILTER,
      filterEntry: idleFilterEntry(DEFAULT_ALTITUDE_FILTER),
      wxLevels: [true, false, false, false, false, false],
      wxMosaic: availableMosaic(fetchedAt),
      visibility: vis,
    });
    expect(shown).toContain("(1) 2 3 4 5");

    // Hide WX via visibility filter
    vis.WX = false;
    const hidden = buildSsaLines({
      simTimeMs: now,
      nowMs: now,
      rangeNm: 20,
      offCenter: false,
      filter: DEFAULT_ALTITUDE_FILTER,
      filterEntry: idleFilterEntry(DEFAULT_ALTITUDE_FILTER),
      wxLevels: [true, false, false, false, false, false],
      wxMosaic: availableMosaic(fetchedAt),
      visibility: vis,
    });
    expect(hidden).not.toContain("(1) 2 3 4 5");
  });

  test("AC4 — toggleSsaFilter and PREF persistence for SSA WX filter", () => {
    const view = createScopeView();
    expect(view.ssaFilter.WX).toBe(true);

    toggleSsaFilter(view, "WX");
    expect(view.ssaFilter.WX).toBe(false);

    const pref = serializeDcbPref(view);
    expect(pref.ssaFilter?.WX).toBe(false);

    const target = createScopeView();
    expect(target.ssaFilter.WX).toBe(true);
    applyDcbPref(target, pref);
    expect(target.ssaFilter.WX).toBe(false);
  });
});
