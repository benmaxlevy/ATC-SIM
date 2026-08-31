/**
 * Short STARS-like voice status copy (T03-08). Not a tutorial paragraph.
 * Failures show on the command-line readback; they must not `alert()`.
 */

import type { VoiceStatusEvent } from "@speech";

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
    case "low_confidence": {
      const n = event.confidence;
      if (typeof n === "number" && Number.isFinite(n)) {
        return `Say again (${n.toFixed(2)})`;
      }
      return "Say again";
    }
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
