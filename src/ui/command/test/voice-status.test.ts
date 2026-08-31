import { expect, test } from "vitest";
import { VOICE_ERROR_CODES, type VoiceErrorCode } from "@speech";
import { displayCommandLineStatus, formatVoiceStatus } from "../voice-status";

const EXPECTED: Record<VoiceErrorCode, string> = {
  mic_denied: "Microphone blocked — allow in browser settings",
  insecure_context: "Voice needs HTTPS or localhost",
  capture_failed: "Mic capture failed",
  empty_clip: "No audio",
  stt_failed: "Radio failed — say again",
  voice_backend_unavailable: "Voice backend unavailable",
  low_confidence: "Say again",
  parse_miss: "Unable to parse",
  tts_failed: "Readback audio failed",
  ptt_locked: "Radio busy — standby",
  ptt_transmit: "TX",
};

test("formatVoiceStatus covers every reason code (T03-08)", () => {
  expect(VOICE_ERROR_CODES).toHaveLength(11);
  for (const code of VOICE_ERROR_CODES) {
    expect(formatVoiceStatus({ code })).toBe(EXPECTED[code]);
  }
});

test("low confidence includes the score when present", () => {
  expect(formatVoiceStatus({ code: "low_confidence", confidence: 0.41 })).toBe("Say again (0.41)");
  expect(formatVoiceStatus({ code: "low_confidence", confidence: 0.5 })).toBe("Say again (0.50)");
});

test("displayCommandLineStatus prefers voice status over the last readback", () => {
  expect(displayCommandLineStatus("delta heading two seven zero", "Say again (0.41)")).toBe(
    "Say again (0.41)",
  );
  expect(displayCommandLineStatus("delta heading two seven zero", null)).toBe(
    "delta heading two seven zero",
  );
  expect(displayCommandLineStatus("", null)).toBe("");
});

test("copy stays short — no alert/confirm, no stack dump", () => {
  for (const code of VOICE_ERROR_CODES) {
    const line = formatVoiceStatus({ code, sourceText: "turn left heading" });
    expect(line.length).toBeLessThan(80);
    expect(line).not.toMatch(/Error:|at Object\.|alert\(/);
  }
});
