/**
 * Public API for `@speech`.
 *
 * Legal now: `SpeechPort`, `AudioClip`, `Transcript`, `NullSpeechPort`,
 * `createSpeechPort` / `pickDefaultBackend` (T03-10), HTTP + Web Speech ports,
 * `SpeechNotAvailableError`, PTT capture (`createPttCaptureController`),
 * voice-loop coordinator (`createVoiceLoop`), PCM playback + radio FX graph.
 * Boot picks `http` when our speech-api URLs are present, else `null`.
 * `web-speech` is opt-in only.
 *
 * Later: in-tab whisper-wasm (T03-11, skipped this swarm).
 * AudioClip is speech-owned. Do not put vendor SDKs here.
 *
 * Import rule: `@speech` may import `@core` only. `parseCommand` is injected.
 */
export type { AudioClip, SpeechPort, Transcript, TranscribeOpts } from "./types";
export {
  SpeechNotAvailableError,
  SpeechPortError,
  VOICE_ERROR_CODES,
  shouldLogVoiceReject,
} from "./errors";
export type { SpeechPortErrorKind, VoiceErrorCode, VoiceStatusEvent } from "./errors";
export { NullSpeechPort } from "./null-speech-port";
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
  createPttCaptureController,
  isTextFieldTarget,
} from "./capture/ptt-controller";
export type {
  CaptureBackend,
  PttCaptureController,
  PttCaptureEvent,
  PttCaptureOptions,
  PttKeyEvent,
  PttUpResult,
} from "./capture/ptt-controller";
export { TARGET_SAMPLE_RATE } from "./capture/resample";
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
export { WebSpeechPort, speakBrowser } from "./ports/web-speech-port";
export { TransmitGate } from "./playback/transmit-gate";
export {
  PLAYBACK_TAIL_MS,
  connectPlaybackDry,
  createReadbackPlayer,
} from "./playback/readback-player";
export type {
  ConnectPlaybackSource,
  PlayOutcome,
  ReadbackPlayHooks,
  ReadbackPlayer,
  ReadbackPlayerOptions,
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
