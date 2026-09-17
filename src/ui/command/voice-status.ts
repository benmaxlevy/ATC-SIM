/**
 * Short STARS-like voice status copy (T03-08). Not a tutorial paragraph.
 * Failures show on the command-line readback; they must not `alert()`.
 */

import { VOICE_ERROR_CODES, type VoiceStatusEvent } from "@speech";

export function formatVoiceStatus(event: VoiceStatusEvent): string {
  switch (event.code) {
    case "mic_denied":
      return "Microphone blocked — allow in browser settings";
    case "insecure_context":
      return "Voice needs HTTPS or localhost";
    case "capture_failed":
      return "Mic capture failed";
    case "empty_clip":
      return "No audio";
    case "stt_failed":
      return "Radio failed — say again";
    case "voice_backend_unavailable":
      return "Voice backend unavailable";
    case "parse_miss":
      return "Unable to parse";
    case "tts_failed":
      return "Readback audio failed";
    case "ptt_locked":
      return "Radio busy — standby";
    case "ptt_transmit":
      return "TX";
    default: {
      const _exhaustive: never = event.code;
      return _exhaustive;
    }
  }
}

/** Voice status wins over the last typed/pilot readback. */
export function displayCommandLineStatus(
  readback: string,
  voiceStatus: string | null | undefined,
): string {
  return voiceStatus ?? readback;
}

/**
 * Formatted `formatVoiceStatus` copy is a transient radio status (TX, failures,
 * locks) — not a pilot transmission. Pilot callups, VFR requests, and pilot
 * readbacks persist on the command line until a new transmission, PTT, or a
 * click dismisses them; transient copy never persists and falls back to the
 * persisted transmission (if any) once it clears.
 */
const TRANSIENT_VOICE_TEXTS: ReadonlySet<string> = new Set(
  VOICE_ERROR_CODES.map((code) => formatVoiceStatus({ code } as VoiceStatusEvent)),
);

export function isTransientVoiceStatus(text: string): boolean {
  return TRANSIENT_VOICE_TEXTS.has(text);
}
