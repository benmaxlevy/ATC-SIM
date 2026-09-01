import { describe, expect, test } from "vitest";
import {
  createScopeView,
  stepModeFsl,
  stepDcbVol,
  stepBriteChannel,
  getBackgroundColor,
  formatDcbBriteReadout,
  buildSsaLines,
  buildSsaRenderLines,
  serializeDcbPref,
  applyDcbPref,
  getDatablockVisualState,
  createTrackDisplay,
  DEFAULT_ALTITUDE_FILTER,
  idleFilterEntry,
} from "@scope";
import { createCaAlertTone, CA_TONE_GAIN } from "../../app/ca-alert-tone";
import { createWorld, makeTestAircraft } from "@core";

describe("T02-83 DCB Controls and SSA Weather Telemetry Acceptance Suite", () => {
  test("AC1 — DCB VOL modulates CA alert tone gain and preserves pilot voice independence", () => {
    let mockGainValue = 0;
    const mockAudioContext = {
      state: "running",
      destination: {},
      createOscillator: () => ({
        type: "square",
        frequency: { value: 0 },
        connect: () => {},
        start: () => {},
        stop: () => {},
        disconnect: () => {},
      }),
      createGain: () => ({
        gain: {
          get value() {
            return mockGainValue;
          },
          set value(v: number) {
            mockGainValue = v;
          },
        },
        connect: () => {},
        disconnect: () => {},
      }),
      resume: async () => {},
      close: async () => {},
    } as unknown as AudioContext;

    const tone = createCaAlertTone({
      getAudioContext: () => mockAudioContext,
      now: () => 50,
    });

    const view = createScopeView();
    expect(view.vol).toBe(2);

    // Initial default volume 2 (40%)
    tone.setVolume(view.vol);
    tone.sync(true);
    expect(mockGainValue).toBeCloseTo(CA_TONE_GAIN * 0.4);

    // Step VOL to max (5 = 100%)
    stepDcbVol(view, 3);
    expect(view.vol).toBe(5);
    tone.setVolume(view.vol);
    tone.sync(true);
    expect(mockGainValue).toBeCloseTo(CA_TONE_GAIN * 1.0);

    // Step VOL to 0 (mute)
    stepDcbVol(view, -5);
    expect(view.vol).toBe(0);
    tone.setVolume(view.vol);
    tone.sync(true);
    expect(mockGainValue).toBe(0);

    tone.dispose();
  });

  test("AC2 — DCB MODE FSL cycles Full/Semi/Limited and updates datablock visibility", () => {
    const view = createScopeView();
    const acOwned = makeTestAircraft({ id: "ac1", callsign: "AAL100", altitudeFt: 5000 });
    const acUnowned = makeTestAircraft({ id: "ac2", callsign: "DAL200", altitudeFt: 8000 });
    const world = createWorld({ aircraft: [acOwned, acUnowned] });

    view.tracks.set("ac1", createTrackDisplay("owned"));
    view.tracks.set("ac2", createTrackDisplay("unowned"));

    // MODE F (Full)
    expect(view.modeFsl).toBe("F");
    expect(getDatablockVisualState(view, world, acOwned).mode).toBe("full");
    expect(getDatablockVisualState(view, world, acUnowned).mode).toBe("partial");

    // MODE S (Semi) via stepModeFsl
    stepModeFsl(view, 1);
    expect(view.modeFsl).toBe("S");
    expect(getDatablockVisualState(view, world, acOwned).mode).toBe("partial");
    expect(getDatablockVisualState(view, world, acUnowned).mode).toBe("partial");

    // MODE L (Limited) via stepModeFsl
    stepModeFsl(view, 1);
    expect(view.modeFsl).toBe("L");
    expect(getDatablockVisualState(view, world, acOwned).mode).toBe("partial");
    expect(getDatablockVisualState(view, world, acUnowned).mode).toBe("limited");

    // Forced FDB override persists in MODE L
    view.tracks.get("ac2")!.forcedFdb = true;
    expect(getDatablockVisualState(view, world, acUnowned).mode).toBe("full");

    // Step back to MODE S then MODE F
    stepModeFsl(view, -1);
    expect(view.modeFsl).toBe("S");
    stepModeFsl(view, -1);
    expect(view.modeFsl).toBe("F");
  });

  test("AC3 — BRITE BKC modulates background contrast level linearly and formats OFF to 100", () => {
    const view = createScopeView();
    expect(view.brite.bkc).toBe(100);
    expect(formatDcbBriteReadout(view.brite.bkc)).toBe("100");
    expect(getBackgroundColor(view.brite.bkc)).toBe("#141C2B");

    stepBriteChannel(view, "bkc", -10);
    expect(view.brite.bkc).toBe(0);
    expect(formatDcbBriteReadout(view.brite.bkc)).toBe("OFF");
    expect(getBackgroundColor(view.brite.bkc)).toBe("#000000");

    stepBriteChannel(view, "bkc", 5);
    expect(view.brite.bkc).toBe(50);
    expect(formatDcbBriteReadout(view.brite.bkc)).toBe("50");
    expect(getBackgroundColor(view.brite.bkc)).toBe("#0A0E16");
  });

  test("AC4 — SSA WX telemetry displays timestamp, age, and staleness alert; SSA FILTER toggles visibility", () => {
    const fetchedAt = new Date("2026-09-01T15:00:00Z").getTime();
    const now10MinLater = fetchedAt + 10 * 60 * 1000;
    const now25MinLater = fetchedAt + 25 * 60 * 1000;

    // Normal fresh WX data
    const freshSsa = buildSsaRenderLines({
      simTimeMs: now10MinLater,
      nowMs: now10MinLater,
      rangeNm: 20,
      offCenter: false,
      filter: DEFAULT_ALTITUDE_FILTER,
      filterEntry: idleFilterEntry(DEFAULT_ALTITUDE_FILTER),
      wxLevels: [true, false, false, false, false, false],
      wxMosaic: { fetchedAtMs: fetchedAt },
    });
    const freshWx = freshSsa.find((l) => l.text.startsWith("WX 1500Z"));
    expect(freshWx).toBeDefined();
    expect(freshWx?.text).toBe("WX 1500Z  WX HIST 10M");
    expect(freshWx?.style).toBe("normal");

    // Stale WX data (>15m)
    const staleSsa = buildSsaRenderLines({
      simTimeMs: now25MinLater,
      nowMs: now25MinLater,
      rangeNm: 20,
      offCenter: false,
      filter: DEFAULT_ALTITUDE_FILTER,
      filterEntry: idleFilterEntry(DEFAULT_ALTITUDE_FILTER),
      wxLevels: [true, false, false, false, false, false],
      wxMosaic: { fetchedAtMs: fetchedAt },
    });
    const staleWx = staleSsa.find((l) => l.text.startsWith("WX 1500Z"));
    expect(staleWx).toBeDefined();
    expect(staleWx?.text).toBe("WX 1500Z  WX HIST 25M STALE");
    expect(staleWx?.style).toBe("alert");

    // SSA FILTER WX hides the line
    const hiddenSsa = buildSsaLines({
      simTimeMs: now25MinLater,
      nowMs: now25MinLater,
      rangeNm: 20,
      offCenter: false,
      filter: DEFAULT_ALTITUDE_FILTER,
      filterEntry: idleFilterEntry(DEFAULT_ALTITUDE_FILTER),
      wxLevels: [true, false, false, false, false, false],
      wxMosaic: { fetchedAtMs: fetchedAt },
      visibility: {
        TIME: true,
        ALTSTG: true,
        FILTER: true,
        RANGE: true,
        OFF_CNTR: true,
        STATUS: true,
        PTL: true,
        WX: false,
      },
    });
    expect(hiddenSsa.some((l) => l.startsWith("WX"))).toBe(false);
  });

  test("AC5 — PREF saves and restores VOL, MODE FSL, BRITE BKC, and SSA FILTER WX state", () => {
    const view = createScopeView();
    view.vol = 4;
    view.modeFsl = "L";
    view.brite.bkc = 40;
    view.ssaFilter.WX = false;

    const serialized = serializeDcbPref(view);
    expect(serialized.vol).toBe(4);
    expect(serialized.modeFsl).toBe("L");
    expect(serialized.brite.bkc).toBe(40);
    expect(serialized.ssaFilter?.WX).toBe(false);

    const freshView = createScopeView();
    expect(freshView.vol).toBe(2);
    expect(freshView.modeFsl).toBe("F");
    expect(freshView.brite.bkc).toBe(100);
    expect(freshView.ssaFilter.WX).toBe(true);

    applyDcbPref(freshView, serialized);
    expect(freshView.vol).toBe(4);
    expect(freshView.modeFsl).toBe("L");
    expect(freshView.brite.bkc).toBe(40);
    expect(freshView.ssaFilter.WX).toBe(false);
  });
});
