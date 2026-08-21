/**
 * Voice-loop coordinator: PTT clip → SpeechPort.transcribe → parseCommand
 * (`source: "voice"`) → injected dispatch (existing pilot apply).
 *
 * Does not construct Instruction objects — only parseCommand does.
 * Never throws through the sim tick. One in-flight transcribe per session.
 */

import type { Command, Instruction, ParseStage } from "@core";
import type { PttCaptureEvent, PttUpResult } from "./capture/ptt-controller";
import { markPttUp, recordTranscriptLatency, type VoiceUtteranceMetrics } from "./metrics";
import type { AudioClip, SpeechPort, Transcript } from "./types";

/** Below this, do not parse (T03-08 owns the “say again” copy). Overridable for T03-10. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.55;

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

export type DispatchCommandFn = (command: Command) => void | Promise<void>;

export type VoiceLoopStatus =
  "empty-clip" | "low-confidence" | "transcribe-failed" | "busy" | "parse-miss";

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
  /** Combined with no barge-in: lock PTT while transcribe/parse/dispatch run. */
  setTransmitLocked?: (locked: boolean) => void;
  /** T03-08 status hook. Copy is out of scope here. */
  onStatus?: (reason: VoiceLoopStatus) => void;
  /** Parse miss after a transcript — log `command.rejected` from the app shell. */
  onParseMiss?: (sourceText: string, error: string) => void | Promise<void>;
  onMetrics?: (metrics: VoiceUtteranceMetrics) => void;
}

export interface VoiceLoop {
  handlePttEvent(event: PttCaptureEvent): Promise<void>;
  readonly lastUtteranceMetrics: VoiceUtteranceMetrics | null;
  readonly inFlight: boolean;
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

export function createVoiceLoop(options: VoiceLoopOptions): VoiceLoop {
  return new VoiceLoopImpl(options);
}

class VoiceLoopImpl implements VoiceLoop {
  private disposed = false;
  private inFlightValue = false;
  private commandSeq = 0;
  private lastMetrics: VoiceUtteranceMetrics | null = null;
  private readonly speechPort: LiveSpeechPort;
  private readonly parseCommand: ParseCommandFn;
  private readonly dispatchCommand: DispatchCommandFn;
  private readonly getSelectedCallsign: () => string | null;
  private readonly getIssuedAtSimMs: () => number;
  private readonly now: () => number;
  private readonly confidenceThreshold: number;
  private readonly pathC: boolean;
  private readonly setTransmitLocked: (locked: boolean) => void;
  private readonly onStatus?: (reason: VoiceLoopStatus) => void;
  private readonly onParseMiss?: (sourceText: string, error: string) => void | Promise<void>;
  private readonly onMetrics?: (metrics: VoiceUtteranceMetrics) => void;

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
  }

  get lastUtteranceMetrics(): VoiceUtteranceMetrics | null {
    return this.lastMetrics;
  }

  get inFlight(): boolean {
    return this.inFlightValue;
  }

  dispose(): void {
    this.disposed = true;
    this.inFlightValue = false;
    this.setTransmitLocked(false);
  }

  async handlePttEvent(event: PttCaptureEvent): Promise<void> {
    try {
      await this.onPttEvent(event);
    } catch {
      this.inFlightValue = false;
      this.setTransmitLocked(false);
      this.onStatus?.("transcribe-failed");
    }
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
    }
  }

  private onPttDown(): void {
    if (this.inFlightValue) {
      return;
    }
    try {
      this.speechPort.beginUtterance?.();
    } catch {
      this.onStatus?.("transcribe-failed");
    }
  }

  private async onPttUp(result: PttUpResult): Promise<void> {
    if (result.kind === "empty") {
      this.lastMetrics = markPttUp(this.now());
      this.emitMetrics();
      this.onStatus?.("empty-clip");
      return;
    }
    if (this.inFlightValue) {
      this.onStatus?.("busy");
      return;
    }

    this.inFlightValue = true;
    this.setTransmitLocked(true);
    const metrics = markPttUp(this.now());
    this.lastMetrics = metrics;
    try {
      await this.transcribeAndParse(result.clip, metrics);
    } finally {
      this.inFlightValue = false;
      this.setTransmitLocked(false);
      this.emitMetrics();
    }
  }

  private async transcribeAndParse(clip: AudioClip, metrics: VoiceUtteranceMetrics): Promise<void> {
    let transcript: Transcript;
    try {
      transcript = await this.finishTranscript(clip);
    } catch {
      this.onStatus?.("transcribe-failed");
      return;
    }
    if (this.disposed) {
      return;
    }
    recordTranscriptLatency(metrics, this.now());

    if (transcript.confidence < this.confidenceThreshold) {
      this.onStatus?.("low-confidence");
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
      this.onStatus?.("parse-miss");
      await this.onParseMiss?.(parsed.sourceText, parsed.error);
      return;
    }

    this.commandSeq += 1;
    const command = commandFromParse(
      parsed,
      `voice-cmd-${this.commandSeq}`,
      this.getIssuedAtSimMs(),
    );
    try {
      await this.dispatchCommand(command);
    } catch {
      this.onStatus?.("transcribe-failed");
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
}
