import { describe, expect, test } from "vitest";
import {
  createScopeView,
  formatDcbVolReadout,
  formatDcbBriteReadout,
  getBackgroundColor,
  serializeDcbPref,
  applyDcbPref,
  stepDcbVol,
  stepBriteChannel,
  DEFAULT_VOL_LEVEL,
  getDatablockVisualState,
  createTrackDisplay,
} from "@scope";
import { createCaAlertTone } from "../../../app/ca-alert-tone";
import { createWorld, makeTestAircraft } from "@core";

describe("T02-81 DCB VOL, MODE FSL, and BRITE BKC Controls", () => {
  test("VOL spinner stepping, formatting, and bounds clamping", () => {
    const view = createScopeView();
    expect(view.vol).toBe(DEFAULT_VOL_LEVEL);
    expect(formatDcbVolReadout(view.vol)).toBe("2");

    stepDcbVol(view, 1);
    expect(view.vol).toBe(3);

    stepDcbVol(view, 1);
    expect(view.vol).toBe(4);

    stepDcbVol(view, 1);
    expect(view.vol).toBe(5);

    // Clamps at 5
    stepDcbVol(view, 1);
    expect(view.vol).toBe(5);

    stepDcbVol(view, -1);
    expect(view.vol).toBe(4);

    stepDcbVol(view, -1);
    expect(view.vol).toBe(3);

    stepDcbVol(view, -1);
    expect(view.vol).toBe(2);

    stepDcbVol(view, -1);
    expect(view.vol).toBe(1);

    stepDcbVol(view, -1);
    expect(view.vol).toBe(0);
    expect(formatDcbVolReadout(view.vol)).toBe("0");

    // Clamps at 0
    stepDcbVol(view, -1);
    expect(view.vol).toBe(0);
  });

  test("VOL controls CA alert tone volume and mute at 0", () => {
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
      createGain: () => {
        const gainNode = {
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
        };
        return gainNode;
      },
      resume: async () => {},
      close: async () => {},
    } as unknown as AudioContext;

    const tone = createCaAlertTone({
      getAudioContext: () => mockAudioContext,
      now: () => 50, // inside CA_TONE_BEEP_MS (150ms)
    });

    // Active with default multiplier 1.0 (5/5)
    tone.sync(true, 1.0);
    expect(mockGainValue).toBeCloseTo(0.05);

    // Active with half volume (2.5/5 -> 0.5)
    tone.sync(true, 0.5);
    expect(mockGainValue).toBeCloseTo(0.025);

    // Active with 0 volume (mute)
    tone.sync(true, 0.0);
    expect(mockGainValue).toBe(0);

    // Reset volume via setVolume
    tone.setVolume(5); // 100%
    tone.sync(true);
    expect(mockGainValue).toBeCloseTo(0.05);

    tone.dispose();
  });

  test("MODE FSL is removed; serviceMode defaults to FSL and datablocks remain normal", () => {
    const view = createScopeView();
    expect(view.serviceMode).toBe("FSL");
    expect((view as unknown as { modeFsl?: unknown }).modeFsl).toBeUndefined();

    const acOwned = makeTestAircraft({
      id: "ac1",
      callsign: "DAL101",
      altitudeFt: 5000,
    });
    const acUnowned = makeTestAircraft({
      id: "ac2",
      callsign: "AAL202",
      altitudeFt: 7000,
    });
    const world = createWorld({ aircraft: [acOwned, acUnowned] });

    view.tracks.set("ac1", createTrackDisplay("owned"));
    view.tracks.set("ac2", createTrackDisplay("unowned"));

    // Datablock visual state depends on track ownership/forced state, not global F/S/L
    expect(getDatablockVisualState(view, world, acOwned).mode).toBe("full");
    expect(getDatablockVisualState(view, world, acUnowned).mode).toBe("partial");
  });

  test("BRITE BKC modulates background contrast color and formats OFF-100", () => {
    expect(getBackgroundColor(0)).toBe("#000000");
    expect(getBackgroundColor(100)).toBe("#141C2B");
    expect(getBackgroundColor(50)).toBe("#0A0E16");

    expect(formatDcbBriteReadout(0)).toBe("OFF");
    expect(formatDcbBriteReadout(50)).toBe("50");
    expect(formatDcbBriteReadout(100)).toBe("100");

    const view = createScopeView();
    expect(view.brite.bkc).toBe(100);
    stepBriteChannel(view, "bkc", -1);
    expect(view.brite.bkc).toBe(90);
    stepBriteChannel(view, "bkc", -9);
    expect(view.brite.bkc).toBe(0);
    expect(formatDcbBriteReadout(view.brite.bkc)).toBe("OFF");
  });

  test("PREF serializes and restores vol and brite.bkc without modeFsl", () => {
    const view = createScopeView();
    view.vol = 4;
    view.brite.bkc = 60;

    const saved = serializeDcbPref(view);
    expect(saved.vol).toBe(4);
    expect((saved as unknown as { modeFsl?: unknown }).modeFsl).toBeUndefined();
    expect(saved.brite.bkc).toBe(60);

    const target = createScopeView();
    expect(target.vol).toBe(2);
    expect(target.brite.bkc).toBe(100);

    applyDcbPref(target, saved);
    expect(target.vol).toBe(4);
    expect(target.brite.bkc).toBe(60);

    // Legacy modeFsl in saved PREF is safely ignored
    const legacyPref = { ...saved, modeFsl: "L" as unknown as undefined };
    const targetLegacy = createScopeView();
    applyDcbPref(targetLegacy, legacyPref);
    expect((targetLegacy as unknown as { modeFsl?: unknown }).modeFsl).toBeUndefined();
    expect(targetLegacy.serviceMode).toBe("FSL");
  });
});
