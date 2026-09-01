import { expect, test } from "vitest";
import {
  AUTO_TTS_VOICE_ID,
  PILOT_VOICE_IDS,
  RANDOM_TTS_VOICE_ID,
  isAutoTtsVoice,
  randomPilotVoice,
  voiceIdForCallsign,
} from "../pilot-voices";

test("auto, random, and empty mean dynamic/random roster", () => {
  expect(isAutoTtsVoice("")).toBe(true);
  expect(isAutoTtsVoice("auto")).toBe(true);
  expect(isAutoTtsVoice("AUTO")).toBe(true);
  expect(isAutoTtsVoice("random")).toBe(true);
  expect(isAutoTtsVoice("RANDOM")).toBe(true);
  expect(isAutoTtsVoice("en_US-lessac-medium")).toBe(false);
});

test("same callsign always maps to the same roster voice under auto", () => {
  const first = voiceIdForCallsign("DAL123");
  expect(PILOT_VOICE_IDS).toContain(first);
  expect(voiceIdForCallsign("dal123")).toBe(first);
  expect(voiceIdForCallsign("DAL123", AUTO_TTS_VOICE_ID)).toBe(first);
});

test("random override returns voice from roster using RNG", () => {
  const customRng = () => 0.5; // index = floor(0.5 * 6) = 3 -> en_US-joe-medium
  expect(voiceIdForCallsign("DAL123", RANDOM_TTS_VOICE_ID, customRng)).toBe(PILOT_VOICE_IDS[3]);
  expect(randomPilotVoice(customRng)).toBe(PILOT_VOICE_IDS[3]);
});

test("empty or missing callsign picks a random voice", () => {
  const customRng = () => 0.2; // index = floor(0.2 * 6) = 1 -> en_US-amy-medium
  expect(voiceIdForCallsign("", undefined, customRng)).toBe(PILOT_VOICE_IDS[1]);
  expect(voiceIdForCallsign(null, undefined, customRng)).toBe(PILOT_VOICE_IDS[1]);
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
