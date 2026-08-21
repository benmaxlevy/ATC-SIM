/**
 * Voice-loop coordinator: PTT clip → SpeechPort.transcribe → parseCommand
 * (`source: "voice"`) → injected dispatch (existing pilot apply) → TTS play.
 *
 * Does not construct Instruction objects — only parseCommand does.
 * Never throws through the sim tick. One in-flight transcribe per session.
 * No barge-in: PTT stays locked until idle (no STT and no playing source).
 */

import type { Command, Instruction, ParseStage } from "@core";
import type { PttCaptureEvent, PttUpResult } from "./capture/ptt-controller";
import { SpeechNotAvailableError } from "./errors";
import { markPttUp, recordAudioStart, recordTranscriptLatency } from "./metrics";
import type { VoiceUtteranceMetrics } from "./metrics";
import { createReadbackPlayer, type ReadbackPlayer } from "./playback/readback-player";
import { TransmitGate, type TransmitGateEvent } from "./playback/transmit-gate";
import type { AudioClip, SpeechPort, Transcript } from "./types";
import type { VoiceStatusEvent } from "./voice-error-codes";

/** Below this, do not parse (T03-08 owns the “say again” copy). Overridable for T03-10. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.55;

/** Default Piper voice id for `http` TTS. Settings (T03-10) may override. */
export const DEFAULT_READBACK_VOICE_ID = "en_US-lessac-medium";

/**
 * Live STT hooks (Web Speech). Clip adapters omit them. Kept local so this
 * ticket does not reopen the frozen SpeechPort contract (`speech-port.md`).
 */
type LiveSpeechPort = SpeechPort & {
  beginUtterance?: () => void;
  endUtterance?: () => Promise<Transcript | null>;
};

export type VoiceParseResult =
  | {
      ok: true;
      callsignToken: string | null;
      instructions: Instruction[];
      sourceText: string;
      parseStage?: ParseStage;
      source?: "text" | "voice";
    }
  | { ok: false; error: string; sourceText: string };

export type ParseCommandFn = (
  sourceText: string,
  opts: {
    source: "text" | "voice";
    selectedCallsign?: string | null;
    pathC?: boolean;
  },
) => Promise<VoiceParseResult>;

/** Pilot apply result. Speech never builds Instructions; it only reads the readback string. */
export interface VoiceDispatchResult {
  accepted?: boolean;
  readback?: string;
  command?: { callsign: string };
}

export type DispatchCommandFn = (
  command: Command,
) => void | VoiceDispatchResult | Promise<void | VoiceDispatchResult>;

/** `{ code }` status. Prefer {@link VoiceStatusEvent}; this alias is the loop hook type. */
export type VoiceLoopStatus = VoiceStatusEvent;

export interface VoiceLoopOptions {
  speechPort: SpeechPort;
  parseCommand: ParseCommandFn;
  dispatchCommand: DispatchCommandFn;
  getSelectedCallsign: () => string | null;
  getIssuedAtSimMs?: () => number;
  now?: () => number;
  /** Default {@link DEFAULT_CONFIDENCE_THRESHOLD}. */
  confidenceThreshold?: number;
  /** Default false until T03-14/settings. */
  pathC?: boolean;
  /** Combined with no barge-in: lock PTT while transcribe/parse/playback run. */
  setTransmitLocked?: (locked: boolean) => void;
  /** T03-08 `{ code }` hook. `null` clears the line (next PTT-down). Copy is in ui. */
  onStatus?: (event: VoiceStatusEvent | null) => void;
  /** Parse miss after a transcript — log `command.rejected` from the app shell. */
  onParseMiss?: (sourceText: string, error: string) => void | Promise<void>;
  onMetrics?: (metrics: VoiceUtteranceMetrics) => void;
  /**
   * Once per PTT-up utterance after STT/TTS have settled (audio-start may still
   * be null). Overlay may also see live {@link onMetrics} at play-start.
   */
  onUtteranceComplete?: (metrics: VoiceUtteranceMetrics) => void;
  /** Injected in tests. Default plays PCM (dry) or browser TTS. */
  readbackPlayer?: ReadbackPlayer;
  /** TTS voice id. Default {@link DEFAULT_READBACK_VOICE_ID}. */
  voiceId?: string;
  getVoiceId?: (callsign?: string) => string;
}

export interface VoiceLoop {
  handlePttEvent(event: PttCaptureEvent): Promise<void>;
  readonly lastUtteranceMetrics: VoiceUtteranceMetrics | null;
  readonly inFlight: boolean;
  /** True while capture, transcribe, parse, or playback holds the transmit gate. */
  readonly busy: boolean;
  readonly readbackPlayer: ReadbackPlayer;
  readonly speechPortId: string;
  /**
   * Swap the adapter when idle. Refuses while `busy` (no mid-transcribe hot-swap).
   * Caller disposes the previous port after a successful swap.
   */
  setSpeechPort(port: SpeechPort): boolean;
  setConfidenceThreshold(value: number): void;
  /**
   * Speak an already-accepted pilot readback (typed command line or voice).
   * Does not parse. Locks PTT for the play. Never throws.
   */
  playReadback(readback: string, callsign?: string | null): Promise<void>;
  dispose(): void;
}

function defaultNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function commandFromParse(
  parsed: Extract<VoiceParseResult, { ok: true }>,
  id: string,
  issuedAtSimMs: number,
): Command {
  return {
    id,
    issuedAtSimMs,
    callsign: parsed.callsignToken ?? "",
    instructions: parsed.instructions,
    sourceText: parsed.sourceText,
    source: "voice",
    parseStage: parsed.parseStage,
  };
}

function acceptedReadback(result: void | VoiceDispatchResult): string | null {
  if (result === undefined || result === null) {
    return null;
  }
  if (result.accepted !== true) {
    return null;
  }
  const text = result.readback?.trim() ?? "";
  return text === "" ? null : text;
}

function statusFromTranscribeError(err: unknown): VoiceStatusEvent {
  if (err instanceof SpeechNotAvailableError) {
    return { code: "voice_backend_unavailable" };
  }
  return { code: "stt_failed" };
}

export function createVoiceLoop(options: VoiceLoopOptions): VoiceLoop {
  return new VoiceLoopImpl(options);
}

class VoiceLoopImpl implements VoiceLoop {
  private disposed = false;
  private inFlightValue = false;
  private commandSeq = 0;
  private lastMetrics: VoiceUtteranceMetrics | null = null;
  private speechPort: LiveSpeechPort;
  private readonly parseCommand: ParseCommandFn;
  private readonly dispatchCommand: DispatchCommandFn;
  private readonly getSelectedCallsign: () => string | null;
  private readonly getIssuedAtSimMs: () => number;
  private readonly now: () => number;
  private confidenceThreshold: number;
  private readonly pathC: boolean;
  private readonly setTransmitLocked: (locked: boolean) => void;
  private readonly onStatus?: (event: VoiceStatusEvent | null) => void;
  private readonly onParseMiss?: (sourceText: string, error: string) => void | Promise<void>;
  private readonly onMetrics?: (metrics: VoiceUtteranceMetrics) => void;
  private readonly onUtteranceComplete?: (metrics: VoiceUtteranceMetrics) => void;
  private readonly getVoiceId: (callsign?: string) => string;
  private readonly gate = new TransmitGate();
  readonly readbackPlayer: ReadbackPlayer;

  constructor(options: VoiceLoopOptions) {
    this.speechPort = options.speechPort;
    this.parseCommand = options.parseCommand;
    this.dispatchCommand = options.dispatchCommand;
    this.getSelectedCallsign = options.getSelectedCallsign;
    this.getIssuedAtSimMs = options.getIssuedAtSimMs ?? (() => 0);
    this.now = options.now ?? defaultNow;
    this.confidenceThreshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
    this.pathC = options.pathC ?? false;
    this.setTransmitLocked = options.setTransmitLocked ?? (() => {});
    this.onStatus = options.onStatus;
    this.onParseMiss = options.onParseMiss;
    this.onMetrics = options.onMetrics;
    this.onUtteranceComplete = options.onUtteranceComplete;
    this.getVoiceId = options.getVoiceId ?? (() => options.voiceId ?? DEFAULT_READBACK_VOICE_ID);
    this.readbackPlayer = options.readbackPlayer ?? createReadbackPlayer({ now: this.now });
  }

  get lastUtteranceMetrics(): VoiceUtteranceMetrics | null {
    return this.lastMetrics;
  }

  get inFlight(): boolean {
    return this.inFlightValue;
  }

  get busy(): boolean {
    return this.inFlightValue || this.gate.locked;
  }

  get speechPortId(): string {
    return this.speechPort.id;
  }

  setSpeechPort(port: SpeechPort): boolean {
    if (this.disposed || this.inFlightValue || this.gate.locked) {
      return false;
    }
    this.speechPort = port;
    return true;
  }

  setConfidenceThreshold(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    this.confidenceThreshold = Math.min(1, Math.max(0, value));
  }

  async playReadback(readback: string, callsign?: string | null): Promise<void> {
    await this.speakReadbackText(readback, undefined, callsign);
  }

  dispose(): void {
    this.disposed = true;
    this.inFlightValue = false;
    this.readbackPlayer.stop();
    this.syncLock("utterance-failed");
  }

  async handlePttEvent(event: PttCaptureEvent): Promise<void> {
    try {
      await this.onPttEvent(event);
    } catch (err) {
      this.inFlightValue = false;
      this.readbackPlayer.stop();
      this.syncLock("utterance-failed");
      this.emitStatus(statusFromTranscribeError(err));
    }
  }

  private syncLock(event: TransmitGateEvent): void {
    this.gate.apply(event);
    this.setTransmitLocked(this.gate.locked);
  }

  private emitStatus(event: VoiceStatusEvent | null): void {
    this.onStatus?.(event);
  }

  private async onPttEvent(event: PttCaptureEvent): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (event.type === "ptt-down") {
      this.onPttDown();
      return;
    }
    if (event.type === "ptt-up") {
      await this.onPttUp(event.result);
      return;
    }
    if (event.type === "permission-denied") {
      this.emitStatus({ code: "mic_denied" });
      return;
    }
    if (event.type === "capture-error") {
      this.emitStatus(
        event.reason === "insecure-context"
          ? { code: "insecure_context" }
          : { code: "capture_failed" },
      );
      return;
    }
    if (event.type === "ignored-locked") {
      this.emitStatus({ code: "ptt_locked" });
    }
  }

  private onPttDown(): void {
    if (this.inFlightValue || this.gate.current === "playing") {
      this.emitStatus({ code: "ptt_locked" });
      return;
    }
    this.emitStatus(null);
    this.syncLock("ptt-down");
    void this.readbackPlayer.warmUp();
    try {
      this.speechPort.beginUtterance?.();
    } catch (err) {
      this.emitStatus(statusFromTranscribeError(err));
    }
  }

  private async onPttUp(result: PttUpResult): Promise<void> {
    if (result.kind === "empty") {
      this.lastMetrics = markPttUp(this.now());
      this.finishUtteranceMetrics();
      this.syncLock("utterance-failed");
      this.emitStatus({ code: "empty_clip" });
      return;
    }
    if (this.inFlightValue) {
      this.emitStatus({ code: "ptt_locked" });
      return;
    }

    this.inFlightValue = true;
    this.syncLock("working");
    const metrics = markPttUp(this.now());
    this.lastMetrics = metrics;
    try {
      await this.transcribeAndParse(result.clip, metrics);
    } finally {
      this.inFlightValue = false;
      if (this.gate.locked) {
        this.syncLock("utterance-failed");
      }
      this.finishUtteranceMetrics();
    }
  }

  private async transcribeAndParse(clip: AudioClip, metrics: VoiceUtteranceMetrics): Promise<void> {
    let transcript: Transcript;
    try {
      transcript = await this.finishTranscript(clip);
    } catch (err) {
      recordTranscriptLatency(metrics, this.now());
      this.emitStatus(statusFromTranscribeError(err));
      return;
    }
    if (this.disposed) {
      return;
    }
    recordTranscriptLatency(metrics, this.now());
    this.emitMetrics();

    if (transcript.confidence < this.confidenceThreshold) {
      this.emitStatus({
        code: "low_confidence",
        confidence: transcript.confidence,
        sourceText: transcript.text,
      });
      return;
    }

    const parsed = await this.parseCommand(transcript.text, {
      source: "voice",
      selectedCallsign: this.getSelectedCallsign(),
      pathC: this.pathC,
    });
    if (this.disposed) {
      return;
    }
    if (!parsed.ok) {
      this.emitStatus({ code: "parse_miss", sourceText: parsed.sourceText });
      await this.onParseMiss?.(parsed.sourceText, parsed.error);
      return;
    }

    this.commandSeq += 1;
    const command = commandFromParse(
      parsed,
      `voice-cmd-${this.commandSeq}`,
      this.getIssuedAtSimMs(),
    );
    let dispatchResult: void | VoiceDispatchResult;
    try {
      dispatchResult = await this.dispatchCommand(command);
    } catch (err) {
      this.emitStatus(statusFromTranscribeError(err));
      return;
    }
    if (this.disposed) {
      return;
    }
    await this.speakAcceptedReadback(dispatchResult, metrics);
  }

  private async speakAcceptedReadback(
    dispatchResult: void | VoiceDispatchResult,
    metrics: VoiceUtteranceMetrics,
  ): Promise<void> {
    const readback = acceptedReadback(dispatchResult);
    if (readback === null) {
      return;
    }
    await this.speakReadbackText(readback, metrics, dispatchResult?.command?.callsign);
  }

  private async speakReadbackText(
    readback: string,
    metrics?: VoiceUtteranceMetrics,
    callsign?: string | null,
  ): Promise<void> {
    const text = readback.trim();
    if (this.disposed || text === "") {
      return;
    }

    const voiceId = this.getVoiceId(callsign ?? undefined);
    const onAudioStart = (nowMs: number): void => {
      if (!metrics) {
        return;
      }
      recordAudioStart(metrics, nowMs);
      this.lastMetrics = metrics;
      this.emitMetrics();
    };

    try {
      if (this.speechPort.id === "web-speech") {
        this.syncLock("play-started");
        const outcome = await this.readbackPlayer.playBrowser(text, voiceId, { onAudioStart });
        if (!outcome.ok) {
          this.emitStatus({ code: "tts_failed" });
        }
        return;
      }

      let ttsClip: AudioClip;
      try {
        ttsClip = await this.speechPort.synthesize(text, voiceId);
      } catch {
        this.emitStatus({ code: "tts_failed" });
        return;
      }
      if (this.disposed) {
        return;
      }
      this.syncLock("play-started");
      const outcome = await this.readbackPlayer.playPcm(ttsClip, { onAudioStart });
      if (!outcome.ok) {
        this.emitStatus({ code: "tts_failed" });
      }
    } catch {
      this.emitStatus({ code: "tts_failed" });
    } finally {
      this.syncLock("play-ended");
    }
  }

  private async finishTranscript(clip: AudioClip): Promise<Transcript> {
    const live = this.speechPort.endUtterance;
    if (typeof live === "function") {
      const fromLive = await live.call(this.speechPort);
      if (fromLive !== null) {
        return fromLive;
      }
    }
    return this.speechPort.transcribe(clip);
  }

  private emitMetrics(): void {
    if (this.lastMetrics) {
      this.onMetrics?.(this.lastMetrics);
    }
  }

  private finishUtteranceMetrics(): void {
    this.emitMetrics();
    if (this.lastMetrics) {
      this.onUtteranceComplete?.(this.lastMetrics);
    }
  }
}
