/**
 * Voice-loop / capture failure codes (T03-08). Copy lives in `src/ui/voice-status.ts`.
 * Session log uses these as `command.rejected` reason when the command never applied.
 */

export const VOICE_ERROR_CODES = [
  "mic_denied",
  "insecure_context",
  "capture_failed",
  "empty_clip",
  "stt_failed",
  "voice_backend_unavailable",
  "low_confidence",
  "parse_miss",
  "tts_failed",
  "ptt_locked",
  "ptt_transmit",
] as const;

export type VoiceErrorCode = (typeof VOICE_ERROR_CODES)[number];

/** `{ code }` status event. `onStatus(null)` clears the line (next PTT-down). */
export interface VoiceStatusEvent {
  code: VoiceErrorCode;
  /** Present on `low_confidence` so the status line can show e.g. `(0.41)`. */
  confidence?: number;
  /** Transcript or parse input when any. */
  sourceText?: string;
}

/**
 * TTS failure is after intent apply — do not log `command.rejected`.
 * Everything else in {@link VOICE_ERROR_CODES} is a reject/no-op path.
 */
export function shouldLogVoiceReject(code: VoiceErrorCode): boolean {
  return code !== "tts_failed" && code !== "ptt_transmit";
}
