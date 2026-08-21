import { expect, test } from "vitest";
import {
  AUTO_TTS_VOICE_ID,
  PILOT_VOICE_IDS,
  isAutoTtsVoice,
  voiceIdForCallsign,
} from "./pilot-voices";

test("auto and empty mean per-callsign roster", () => {
  expect(isAutoTtsVoice("")).toBe(true);
  expect(isAutoTtsVoice("auto")).toBe(true);
  expect(isAutoTtsVoice("AUTO")).toBe(true);
  expect(isAutoTtsVoice("en_US-lessac-medium")).toBe(false);
});

test("same callsign always maps to the same roster voice", () => {
  const first = voiceIdForCallsign("DAL123");
  expect(PILOT_VOICE_IDS).toContain(first);
  expect(voiceIdForCallsign("dal123")).toBe(first);
  expect(voiceIdForCallsign("DAL123", AUTO_TTS_VOICE_ID)).toBe(first);
});

test("forced override beats the roster", () => {
  expect(voiceIdForCallsign("DAL123", "en_US-ryan-medium")).toBe("en_US-ryan-medium");
});

test("roster has several distinct speakers", () => {
  expect(new Set(PILOT_VOICE_IDS).size).toBeGreaterThanOrEqual(4);
  const mapped = ["DAL123", "AAL456", "UAL789", "SWA12", "JBU99", "FDX80"].map((cs) =>
    voiceIdForCallsign(cs),
  );
  expect(new Set(mapped).size).toBeGreaterThan(1);
});
