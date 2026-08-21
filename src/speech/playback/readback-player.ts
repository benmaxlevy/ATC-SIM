/**
 * Readback playback: PCM via AudioBufferSourceNode (dry until T03-07), or
 * speechSynthesis for the opt-in web-speech port (no radio FX on that path).
 *
 * One readback at a time. PTT lock is owned by the voice-loop / TransmitGate;
 * this player only reports start/end. Tail after `ended` is {@link PLAYBACK_TAIL_MS}
 * so compressor release is not clipped into the next PTT.
 */

import type { AudioClip } from "../types";
import { speakBrowser, type BrowserSpeakResult } from "../ports/browser-tts";
import { createAudioBufferFromClip } from "./pcm16-to-audio-buffer";

/** Hold PTT lock this long after source `ended` (README §6.3). */
export const PLAYBACK_TAIL_MS = 50;

/**
 * T03-07 inserts the radio graph here. Default is dry: source → destination.
 */
export type ConnectPlaybackSource = (source: AudioNode, destination: AudioDestinationNode) => void;

export function connectPlaybackDry(source: AudioNode, destination: AudioDestinationNode): void {
  source.connect(destination);
}

export type PlayOutcome = { ok: true } | { ok: false; reason: "unavailable" | "overlap" | "error" };

export interface ReadbackPlayHooks {
  /** Wall-clock `now` at source.start() / speechSynthesis onstart. Once per play. */
  onAudioStart?: (nowMs: number) => void;
}

export interface ReadbackPlayer {
  readonly playing: boolean;
  /** Resume the shared playback AudioContext (first PTT or first play). */
  warmUp(): Promise<void>;
  playPcm(clip: AudioClip, hooks?: ReadbackPlayHooks): Promise<PlayOutcome>;
  playBrowser(text: string, voiceId: string, hooks?: ReadbackPlayHooks): Promise<PlayOutcome>;
  stop(): void;
  setConnectSource(connect: ConnectPlaybackSource): void;
}

export interface ReadbackPlayerOptions {
  getAudioContext?: () => AudioContext | null;
  connectSource?: ConnectPlaybackSource;
  speakBrowser?: (text: string, voiceId: string) => BrowserSpeakResult | null;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
}

function defaultNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function audioContextConstructor(): typeof AudioContext | undefined {
  const g = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  return g.AudioContext ?? g.webkitAudioContext;
}

export function createReadbackPlayer(options: ReadbackPlayerOptions = {}): ReadbackPlayer {
  return new ReadbackPlayerImpl(options);
}

class ReadbackPlayerImpl implements ReadbackPlayer {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private playingValue = false;
  private generation = 0;
  private connectSource: ConnectPlaybackSource;
  private readonly getAudioContext?: () => AudioContext | null;
  private readonly speakFn: (text: string, voiceId: string) => BrowserSpeakResult | null;
  private readonly now: () => number;
  private readonly delay: (ms: number) => Promise<void>;

  constructor(options: ReadbackPlayerOptions) {
    this.getAudioContext = options.getAudioContext;
    this.connectSource = options.connectSource ?? connectPlaybackDry;
    this.speakFn = options.speakBrowser ?? speakBrowser;
    this.now = options.now ?? defaultNow;
    this.delay = options.delay ?? defaultDelay;
  }

  get playing(): boolean {
    return this.playingValue;
  }

  setConnectSource(connect: ConnectPlaybackSource): void {
    this.connectSource = connect;
  }

  async warmUp(): Promise<void> {
    try {
      const ctx = this.tryContext();
      if (ctx && ctx.state === "suspended") {
        await ctx.resume();
      }
    } catch {
      // Never throw through the sim tick.
    }
  }

  stop(): void {
    this.generation += 1;
    const source = this.source;
    this.source = null;
    this.playingValue = false;
    if (source) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
  }

  async playPcm(clip: AudioClip, hooks?: ReadbackPlayHooks): Promise<PlayOutcome> {
    if (this.playingValue) {
      return { ok: false, reason: "overlap" };
    }
    const ctx = this.tryContext();
    if (!ctx) {
      return { ok: false, reason: "unavailable" };
    }

    this.playingValue = true;
    const generation = this.generation + 1;
    this.generation = generation;

    try {
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      if (this.generation !== generation) {
        return { ok: false, reason: "error" };
      }

      const buffer = createAudioBufferFromClip(ctx, clip);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      this.source = source;
      this.connectSource(source, ctx.destination);

      await new Promise<void>((resolve, reject) => {
        source.onended = () => {
          resolve();
        };
        try {
          // audio-start: source.start() after resume. Map ctx.currentTime to wall clock now
          // (not Bluetooth/hardware delay). T03-07 still uses this same start instant.
          const wallMs = this.now();
          void ctx.currentTime;
          source.start();
          hooks?.onAudioStart?.(wallMs);
        } catch (err) {
          reject(err);
        }
      });

      if (this.generation === generation) {
        await this.delay(PLAYBACK_TAIL_MS);
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: "error" };
    } finally {
      if (this.generation === generation) {
        this.source = null;
        this.playingValue = false;
      }
    }
  }

  async playBrowser(
    text: string,
    voiceId: string,
    hooks?: ReadbackPlayHooks,
  ): Promise<PlayOutcome> {
    if (this.playingValue) {
      return { ok: false, reason: "overlap" };
    }
    const prepared = this.speakFn(text, voiceId);
    if (!prepared) {
      return { ok: false, reason: "unavailable" };
    }

    this.playingValue = true;
    const generation = this.generation + 1;
    this.generation = generation;

    try {
      await new Promise<void>((resolve) => {
        let started = false;
        prepared.utterance.onstart = () => {
          if (started) {
            return;
          }
          started = true;
          hooks?.onAudioStart?.(this.now());
        };
        prepared.utterance.onend = () => {
          resolve();
        };
        prepared.utterance.onerror = () => {
          resolve();
        };
        try {
          prepared.speak();
        } catch {
          resolve();
        }
      });
      if (this.generation === generation) {
        await this.delay(PLAYBACK_TAIL_MS);
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: "error" };
    } finally {
      if (this.generation === generation) {
        this.playingValue = false;
      }
    }
  }

  private tryContext(): AudioContext | null {
    if (this.ctx) {
      return this.ctx;
    }
    if (this.getAudioContext) {
      this.ctx = this.getAudioContext();
      return this.ctx;
    }
    const Ctx = audioContextConstructor();
    if (!Ctx) {
      return null;
    }
    try {
      this.ctx = new Ctx();
    } catch {
      return null;
    }
    return this.ctx;
  }
}
