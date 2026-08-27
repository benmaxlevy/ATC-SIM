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
export type {
  AudioClip,
  SpeechPort,
  SpeechPortErrorKind,
  Transcript,
  TranscribeOpts,
  VoiceErrorCode,
  VoiceStatusEvent,
} from "./types";
export {
  NullSpeechPort,
  SpeechNotAvailableError,
  SpeechPortError,
  VOICE_ERROR_CODES,
  shouldLogVoiceReject,
} from "./types";

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
