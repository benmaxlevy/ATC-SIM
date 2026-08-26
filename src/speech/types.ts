export interface TranscribeOpts {
  fixes?: readonly string[];
  procedures?: ReadonlyArray<{ id: string; name?: string }>;
}

export interface AudioClip {
  sampleRate: number;
  channels: 1;
  pcm16: Int16Array;
}

export interface Transcript {
  text: string;
  confidence: number;
  latencyMs: number;
}

export interface SpeechPort {
  readonly id: string;
  transcribe(audio: AudioClip, opts?: TranscribeOpts): Promise<Transcript>;
  synthesize(text: string, voiceId: string): Promise<AudioClip>;
  beginUtterance?(): void;
  endUtterance?(): Promise<Transcript | null>;
  dispose?(): void;
}

export class SpeechNotAvailableError extends Error {
  override name = "SpeechNotAvailableError";
}

export type SpeechPortErrorKind =
  | "http"
  | "network"
  | "timeout"
  | "empty"
  | "in_flight"
  | "invalid_response";

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

export interface VoiceStatusEvent {
  code: VoiceErrorCode;
  confidence?: number;
  sourceText?: string;
}

export function shouldLogVoiceReject(code: VoiceErrorCode): boolean {
  return code !== "tts_failed" && code !== "ptt_transmit";
}

const SILENCE_SAMPLE_RATE = 16000;
const SILENCE_FRAME_COUNT = 1600;

export class NullSpeechPort implements SpeechPort {
  readonly id = "null";

  transcribe(audio: AudioClip): Promise<Transcript> {
    void audio;
    return Promise.reject(new SpeechNotAvailableError("NullSpeechPort cannot transcribe"));
  }

  synthesize(text: string, voiceId: string): Promise<AudioClip> {
    void text;
    void voiceId;
    return Promise.resolve({
      sampleRate: SILENCE_SAMPLE_RATE,
      channels: 1,
      pcm16: new Int16Array(SILENCE_FRAME_COUNT),
    });
  }
}
