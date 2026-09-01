import { describe, expect, test } from "vitest";
import {
  createScopeView,
  stepHistoryRate,
  formatDcbHistoryRateReadout,
  stepDwellMode,
  cycleDwellMode,
  formatDcbDwellReadout,
  toggleCursorHome,
  stepCursorSpeed,
  formatDcbCursorSpeedReadout,
  stepBriteChannel,
  formatDcbBriteReadout,
  serializeDcbPref,
  createTrackDisplay,
  getDatablockVisualState,
  recordHistoryOnReport,
  createHistoryBuf,
  PALETTE,
  BRITE_PAINT_CHANNELS,
  BRITE_DISABLED_CHANNELS,
  saveDcbPref,
  loadDcbPrefFromStorage,
  type DcbPrefStorage,
} from "@scope";
import { createWorld, makeTestAircraft } from "@core";

function memoryStorage(): DcbPrefStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

describe("T02-86 DCB AUX and BRITE Controls Acceptance Suite", () => {
  test("AC1 — H_RATE spinner cycles presets and gates history dot recording interval", () => {
    const view = createScopeView();
    expect(view.historyRateSec).toBe(4.5);
    expect(formatDcbHistoryRateReadout(view.historyRateSec)).toBe("4.5");

    // Step upward
    stepHistoryRate(view, 1);
    expect(view.historyRateSec).toBe(5.0);
    expect(formatDcbHistoryRateReadout(view.historyRateSec)).toBe("5.0");

    // Step to maximum 10.0
    stepHistoryRate(view, 10);
    expect(view.historyRateSec).toBe(10.0);
    expect(formatDcbHistoryRateReadout(view.historyRateSec)).toBe("10.0");

    // Step to minimum 1.0
    stepHistoryRate(view, -10);
    expect(view.historyRateSec).toBe(1.0);
    expect(formatDcbHistoryRateReadout(view.historyRateSec)).toBe("1.0");

    // Test history recording interval gating
    const buf = createHistoryBuf();
    const minIntervalMs = view.historyRateSec * 1000; // 1000 ms
    expect(recordHistoryOnReport(buf, 1000, 10, 10, minIntervalMs)).toBe(true);
    // Sub-interval report is rejected
    expect(recordHistoryOnReport(buf, 1500, 11, 11, minIntervalMs)).toBe(false);
    expect(recordHistoryOnReport(buf, 1999, 12, 12, minIntervalMs)).toBe(false);
    // At and above interval is accepted
    expect(recordHistoryOnReport(buf, 2000, 13, 13, minIntervalMs)).toBe(true);
    expect(buf.timesSimMs).toEqual([1000, 2000]);
  });

  test("AC2 — DWELL mode cycles OFF / ON / LOCK and brightens datablocks under hover", () => {
    const view = createScopeView();
    const ac1 = makeTestAircraft({ id: "ac1", callsign: "AAL100" });
    const ac2 = makeTestAircraft({ id: "ac2", callsign: "DAL200" });
    const world = createWorld({ aircraft: [ac1, ac2] });
    view.tracks.set("ac1", createTrackDisplay("unowned"));
    view.tracks.set("ac2", createTrackDisplay("unowned"));

    // Default OFF
    expect(view.dwellMode).toBe("OFF");
    expect(formatDcbDwellReadout(view.dwellMode)).toBe("OFF");
    expect(getDatablockVisualState(view, world, ac1).color).toBe(PALETTE.unowned);

    // Cycle to ON
    cycleDwellMode(view);
    expect(view.dwellMode).toBe("ON");
    expect(formatDcbDwellReadout(view.dwellMode)).toBe("ON");

    // When hovered under ON mode, datablock color brightens to PALETTE.highlight
    view.dwellLockedAircraftId = "ac1";
    expect(getDatablockVisualState(view, world, ac1).color).toBe(PALETTE.highlight);
    expect(getDatablockVisualState(view, world, ac2).color).toBe(PALETTE.unowned);

    // Hover removed under ON mode
    view.dwellLockedAircraftId = null;
    expect(getDatablockVisualState(view, world, ac1).color).toBe(PALETTE.unowned);

    // Cycle to LOCK mode
    cycleDwellMode(view);
    expect(view.dwellMode).toBe("LOCK");
    expect(formatDcbDwellReadout(view.dwellMode)).toBe("LOCK");

    // When hovered, target locks highlight
    view.dwellLockedAircraftId = "ac1";
    expect(getDatablockVisualState(view, world, ac1).color).toBe(PALETTE.highlight);

    // Step back to OFF
    stepDwellMode(view, -2);
    expect(view.dwellMode).toBe("OFF");
    expect(view.dwellLockedAircraftId).toBeNull();
  });

  test("AC3 & AC4 — CURSOR HOME toggle and CSR SPD spinner function cleanly", () => {
    const view = createScopeView();
    expect(view.cursorHome).toBe(false);
    expect(toggleCursorHome(view)).toBe(true);
    expect(view.cursorHome).toBe(true);
    expect(toggleCursorHome(view)).toBe(false);
    expect(view.cursorHome).toBe(false);

    expect(view.cursorSpeed).toBe(4);
    expect(formatDcbCursorSpeedReadout(view.cursorSpeed)).toBe("4");
    stepCursorSpeed(view, 2);
    expect(view.cursorSpeed).toBe(6);
    expect(formatDcbCursorSpeedReadout(view.cursorSpeed)).toBe("6");
    stepCursorSpeed(view, -10);
    expect(view.cursorSpeed).toBe(1);
    stepCursorSpeed(view, 20);
    expect(view.cursorSpeed).toBe(10);
  });

  test("AC5 — BRITE CMP and BCN channels are active spinners cycling 0–100%", () => {
    const view = createScopeView();
    expect(BRITE_PAINT_CHANNELS).toContain("cmp");
    expect(BRITE_PAINT_CHANNELS).toContain("bcn");
    expect(BRITE_DISABLED_CHANNELS).not.toContain("cmp");
    expect(BRITE_DISABLED_CHANNELS).not.toContain("bcn");

    expect(view.brite.cmp).toBe(100);
    expect(formatDcbBriteReadout(view.brite.cmp)).toBe("100");
    stepBriteChannel(view, "cmp", -3);
    expect(view.brite.cmp).toBe(70);
    expect(formatDcbBriteReadout(view.brite.cmp)).toBe("70");

    expect(view.brite.bcn).toBe(100);
    expect(formatDcbBriteReadout(view.brite.bcn)).toBe("100");
    stepBriteChannel(view, "bcn", -10);
    expect(view.brite.bcn).toBe(0);
    expect(formatDcbBriteReadout(view.brite.bcn)).toBe("OFF");
  });

  test("AC6 — PREF serialization and storage round-trip preserves all AUX and BRITE settings", () => {
    const store = memoryStorage();
    const view = createScopeView();
    view.dcbPref.icao = "KDEM";
    view.historyRateSec = 6.0;
    view.dwellMode = "LOCK";
    view.cursorHome = true;
    view.cursorSpeed = 8;
    view.brite.cmp = 60;
    view.brite.bcn = 70;

    const serialized = serializeDcbPref(view);
    expect(serialized.historyRateSec).toBe(6.0);
    expect(serialized.dwellMode).toBe("LOCK");
    expect(serialized.cursorHome).toBe(true);
    expect(serialized.cursorSpeed).toBe(8);
    expect(serialized.brite.cmp).toBe(60);
    expect(serialized.brite.bcn).toBe(70);

    saveDcbPref(view, store);

    const restoredView = createScopeView();
    expect(restoredView.historyRateSec).toBe(4.5);
    expect(restoredView.dwellMode).toBe("OFF");
    expect(restoredView.cursorHome).toBe(false);
    expect(restoredView.cursorSpeed).toBe(4);
    expect(restoredView.brite.cmp).toBe(100);
    expect(restoredView.brite.bcn).toBe(100);

    loadDcbPrefFromStorage(restoredView, "KDEM", store);
    expect(restoredView.historyRateSec).toBe(6.0);
    expect(restoredView.dwellMode).toBe("LOCK");
    expect(restoredView.cursorHome).toBe(true);
    expect(restoredView.cursorSpeed).toBe(8);
    expect(restoredView.brite.cmp).toBe(60);
    expect(restoredView.brite.bcn).toBe(70);
  });
});
