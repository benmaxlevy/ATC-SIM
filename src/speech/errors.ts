export class SpeechNotAvailableError extends Error {
  override name = "SpeechNotAvailableError";

  constructor(message: string) {
    super(message);
  }
}

export type SpeechPortErrorKind =
  "http" | "network" | "timeout" | "empty" | "in_flight" | "invalid_response";

/**
 * Typed SpeechPort failure. The voice loop catches these (T03-08 copy).
 * Never put Authorization / shared-secret values in `message`.
 */
export class SpeechPortError extends Error {
  override name = "SpeechPortError";
  readonly kind: SpeechPortErrorKind;
  readonly status: number | undefined;

  constructor(
    kind: SpeechPortErrorKind,
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.kind = kind;
    this.status = options?.status;
  }
}

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
  /** Unused after T03-15 — ASR score is logged, not a parse skip / “Say again”. */
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
