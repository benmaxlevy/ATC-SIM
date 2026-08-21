/**
 * Public API for `@speech`.
 *
 * Legal now: `SpeechPort`, `AudioClip`, `Transcript`, `NullSpeechPort`,
 * `SpeechNotAvailableError`, PTT capture (`createPttCaptureController`),
 * voice-loop coordinator (`createVoiceLoop`), PCM playback + radio FX graph.
 * Boot injects `NullSpeechPort` via `createApp`, which wires PTT → transcribe
 * → parseCommand → pilot.
 *
 * Later: in-tab whisper-wasm (T03-11, skipped this swarm).
 * AudioClip is speech-owned. Do not put vendor SDKs here.
 *
 * Import rule: `@speech` may import `@core` only. `parseCommand` is injected.
 */
export type { AudioClip, SpeechPort, Transcript } from "./types";
export { SpeechNotAvailableError } from "./errors";
export { NullSpeechPort } from "./null-speech-port";
export { HttpSpeechPort } from "./ports/http-speech-port";
export { DEFAULT_PTT_KEY, createPttCaptureController } from "./capture/ptt-controller";
export type {
  CaptureBackend,
  PttCaptureController,
  PttCaptureEvent,
  PttCaptureOptions,
  PttKeyEvent,
  PttUpResult,
} from "./capture/ptt-controller";
export { EMPTY_CLIP_MS } from "./capture/clip-gate";
export { TARGET_SAMPLE_RATE } from "./capture/resample";
export { isTextFieldTarget } from "./capture/ptt-focus";
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
export { VOICE_ERROR_CODES, shouldLogVoiceReject } from "./voice-error-codes";
export type { VoiceErrorCode, VoiceStatusEvent } from "./voice-error-codes";
export { markPttUp, recordAudioStart, recordTranscriptLatency } from "./metrics";
export type { VoiceUtteranceMetrics } from "./metrics";
export { WebSpeechPort, speakBrowser } from "./ports/web-speech-port";
export { pcm16ToFloat32 } from "./playback/pcm16-to-audio-buffer";
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
  connectPlaybackThroughRadio,
  createRadioGraph,
  isSilentClip,
} from "./playback/radio-graph";
export type { RadioGraph, RadioGraphNodes } from "./playback/radio-graph";
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
} from "./playback/radio-fx-params";
export const SPEECH_PACKAGE = "speech";
