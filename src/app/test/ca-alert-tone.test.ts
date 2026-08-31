import { expect, test, vi } from "vitest";
import {
  caToneBeepOn,
  createCaAlertTone,
  CA_TONE_BEEP_MS,
  CA_TONE_PERIOD_MS,
} from "../ca-alert-tone";

test("caToneBeepOn is high for the first slice of each period", () => {
  expect(caToneBeepOn(0)).toBe(true);
  expect(caToneBeepOn(CA_TONE_BEEP_MS - 1)).toBe(true);
  expect(caToneBeepOn(CA_TONE_BEEP_MS)).toBe(false);
  expect(caToneBeepOn(CA_TONE_PERIOD_MS)).toBe(true);
});

test("createCaAlertTone syncs without AudioContext", () => {
  const tone = createCaAlertTone({
    getAudioContext: () => null,
    now: () => 0,
  });
  expect(() => tone.sync(true)).not.toThrow();
  expect(() => tone.sync(false)).not.toThrow();
  tone.dispose();
  expect(() => tone.sync(true)).not.toThrow();
});

test("createCaAlertTone gates gain from the beep clock", () => {
  const gain = { gain: { value: 0 }, connect: vi.fn() };
  const osc = {
    type: "sine",
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    disconnect: vi.fn(),
  };
  const ctx = {
    state: "running",
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createOscillator: () => osc,
    createGain: () => gain,
    destination: {},
  };
  let nowMs = 0;
  const tone = createCaAlertTone({
    getAudioContext: () => ctx as unknown as AudioContext,
    now: () => nowMs,
  });
  tone.sync(true);
  expect(osc.start).toHaveBeenCalled();
  expect(gain.gain.value).toBeGreaterThan(0);
  nowMs = CA_TONE_BEEP_MS;
  tone.sync(true);
  expect(gain.gain.value).toBe(0);
  tone.sync(false);
  expect(osc.stop).toHaveBeenCalled();
  tone.dispose();
});
