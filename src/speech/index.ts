/**
 * Public API for `@speech`.
 *
 * Legal now: `SpeechPort`, `AudioClip`, `Transcript`, `NullSpeechPort`,
 * `createSpeechPort` / `pickDefaultBackend`, HTTP speech-api port,
 * `SpeechNotAvailableError`, PTT capture (`createPttCaptureController`),
 * voice-loop coordinator (`createVoiceLoop`), PCM playback + radio FX graph.
 * Boot picks `http` when our speech-api URLs are present, else `null`.
 * Browser Web Speech is not a backend.
 *
 * AudioClip is speech-owned. Do not put vendor SDKs here.
 *
 * Import rule: `@speech` may import `@core` only. `parseCommand` is injected.
 */
export interface TranscribeOpts {
  fixes?: readonly string[];
  procedures?: ReadonlyArray<{ id: string; name?: string }>;
}

export interface SpeechPort {
  readonly id: string;
  transcribe(audio: AudioClip, opts?: TranscribeOpts): Promise<Transcript>;
  synthesize(text: string, voiceId: string): Promise<AudioClip>;
  beginUtterance?(): void;
  endUtterance?(): Promise<Transcript | null>;
  dispose?(): void;
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

export { HttpSpeechPort } from "./ports/http-speech-port";
export {
  SPEECH_BACKEND_IDS,
  createBootSpeechPort,
  createSpeechPort,
  httpUrlsConfigured,
  pickDefaultBackend,
  readSpeechApiUrls,
  replaceSpeechPort,
  resolveSpeechBackend,
} from "./ports/factory";
export type { CreateSpeechPortDeps, SpeechApiUrlStatus, SpeechBackendId } from "./ports/factory";
export {
  DEFAULT_PTT_KEY,
  EMPTY_CLIP_MS,
  TARGET_SAMPLE_RATE,
  createPttCaptureController,
  float32ToPcm16,
  floatToPcm16Sample,
  isEmptyPttCapture,
  isTextFieldTarget,
  resampleFloat32,
  resampleToMonoPcm16,
} from "./capture/ptt-controller";
export type {
  CaptureBackend,
  PttCaptureController,
  PttCaptureEvent,
  PttCaptureOptions,
  PttKeyEvent,
  PttUpResult,
} from "./capture/ptt-controller";
export {
  AUTO_TTS_VOICE_ID,
  PILOT_VOICE_IDS,
  isAutoTtsVoice,
  voiceIdForCallsign,
} from "./pilot-voices";
export {
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_READBACK_VOICE_ID,
  createVoiceLoop,
} from "./voice-loop";
export type {
  DispatchCommandFn,
  ParseCommandFn,
  VoiceDispatchResult,
  VoiceLoop,
  VoiceLoopOptions,
  VoiceLoopStatus,
  VoiceParseResult,
} from "./voice-loop";
export {
  VoiceLatencyTracker,
  markAudioStart,
  markPttUp,
  markTranscript,
  percentile50,
  recordAudioStart,
  recordSttConfidence,
  recordTranscriptLatency,
  snapshot,
} from "./metrics";
export type { VoiceSessionSnapshot, VoiceUtteranceMetrics } from "./metrics";
export {
  PLAYBACK_TAIL_MS,
  TransmitGate,
  connectPlaybackDry,
  createReadbackPlayer,
} from "./playback/readback-player";
export type {
  ConnectPlaybackSource,
  PlayOutcome,
  ReadbackPlayHooks,
  ReadbackPlayer,
  ReadbackPlayerOptions,
  TransmitGateEvent,
  TransmitGateState,
} from "./playback/readback-player";
export {
  DEFAULT_RADIO_FX_ENABLED,
  RADIO_COMPRESSOR_ATTACK_SEC,
  RADIO_COMPRESSOR_KNEE_DB,
  RADIO_COMPRESSOR_RATIO,
  RADIO_COMPRESSOR_RELEASE_SEC,
  RADIO_COMPRESSOR_THRESHOLD_DB,
  RADIO_FILTER_Q,
  RADIO_HIGHPASS_HZ,
  RADIO_LOWPASS_HZ,
  RADIO_MASTER_GAIN,
  RADIO_NOISE_DURATION_SEC,
  RADIO_NOISE_GAIN,
  RADIO_VOICE_GAIN,
  connectPlaybackThroughRadio,
  createRadioGraph,
  isSilentClip,
  pcm16ToFloat32,
} from "./playback/radio-graph";
export type { RadioGraph, RadioGraphNodes } from "./playback/radio-graph";
export const SPEECH_PACKAGE = "speech";
