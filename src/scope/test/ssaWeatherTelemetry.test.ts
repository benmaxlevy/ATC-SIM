import { describe, expect, test } from "vitest";
import {
  buildSsaLines,
  buildSsaRenderLines,
  createScopeView,
  defaultSsaVisibility,
  formatSsaWxTelemetry,
  toggleSsaFilter,
  WX_STALE_THRESHOLD_MINUTES,
  serializeDcbPref,
  applyDcbPref,
  DEFAULT_ALTITUDE_FILTER,
  idleFilterEntry,
} from "@scope";

describe("T02-82 SSA WX and WX HIST Status Telemetry", () => {
  test("AC1 — formatSsaWxTelemetry renders WX OFF, WX ON, and live WX HHMMZ + WX HIST age", () => {
    // 1. All WX levels off -> WX OFF
    const off = formatSsaWxTelemetry([false, false, false, false, false, false], undefined, 1000);
    expect(off.text).toBe("WX OFF");
    expect(off.isStale).toBe(false);

    // 2. WX level on, but no mosaic timestamp -> WX ON
    const pending = formatSsaWxTelemetry(
      [true, false, false, false, false, false],
      { fetchedAtMs: 0 },
      1000,
    );
    expect(pending.text).toBe("WX ON");
    expect(pending.isStale).toBe(false);

    // 3. Live mosaic timestamp with 4 minute age
    // e.g. fetchedAtMs = 1700000000000 (Date: 2023-11-14 22:13:20Z)
    const fetchedAt = new Date("2026-09-01T14:30:00Z").getTime();
    const now4MinLater = fetchedAt + 4 * 60 * 1000;
    const live = formatSsaWxTelemetry(
      [true, true, false, false, false, false],
      { fetchedAtMs: fetchedAt },
      now4MinLater,
    );
    expect(live.text).toBe("WX 1430Z  WX HIST 4M");
    expect(live.isStale).toBe(false);
  });

  test("AC2 — SSA flags weather data as stale when age exceeds 15 minutes", () => {
    expect(WX_STALE_THRESHOLD_MINUTES).toBe(15);

    const fetchedAt = new Date("2026-09-01T14:00:00Z").getTime();
    const now18MinLater = fetchedAt + 18 * 60 * 1000;

    const stale = formatSsaWxTelemetry(
      [true, false, false, false, false, false],
      { fetchedAtMs: fetchedAt },
      now18MinLater,
    );
    expect(stale.text).toBe("WX 1400Z  WX HIST 18M STALE");
    expect(stale.isStale).toBe(true);

    const renderLines = buildSsaRenderLines({
      simTimeMs: now18MinLater,
      nowMs: now18MinLater,
      rangeNm: 20,
      offCenter: false,
      filter: DEFAULT_ALTITUDE_FILTER,
      filterEntry: idleFilterEntry(DEFAULT_ALTITUDE_FILTER),
      wxLevels: [true, false, false, false, false, false],
      wxMosaic: { fetchedAtMs: fetchedAt },
    });

    const wxLine = renderLines.find((l) => l.text.startsWith("WX 1400Z"));
    expect(wxLine).toBeDefined();
    expect(wxLine?.text).toBe("WX 1400Z  WX HIST 18M STALE");
    expect(wxLine?.style).toBe("alert");
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
      wxMosaic: { fetchedAtMs: fetchedAt },
      visibility: vis,
    });
    expect(shown).toContain("WX 1430Z  WX HIST 2M");

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
      wxMosaic: { fetchedAtMs: fetchedAt },
      visibility: vis,
    });
    expect(hidden.some((l) => l.startsWith("WX"))).toBe(false);
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
