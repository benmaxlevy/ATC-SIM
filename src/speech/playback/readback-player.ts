/**
 * Readback playback: PCM via AudioBufferSourceNode through the radio graph.
 *
 * One readback at a time. PTT lock is owned by the voice-loop / TransmitGate;
 * this player only reports start/end. Tail after `ended` is {@link PLAYBACK_TAIL_MS}
 * so compressor release is not clipped into the next PTT.
 */

import type { AudioClip } from "../types";
import {
  DEFAULT_RADIO_FX_ENABLED,
  connectPlaybackThroughRadio,
  createAudioBufferFromClip,
  createRadioGraph,
  isSilentClip,
  type RadioGraph,
} from "./radio-graph";

/** Hold PTT lock this long after source `ended` (README §6.3). */
export const PLAYBACK_TAIL_MS = 50;

/**
 * Playback seam. Default PCM path uses {@link connectPlaybackThroughRadio}.
 * Tests and debug inject {@link connectPlaybackDry}.
 */
export type ConnectPlaybackSource = (source: AudioNode, destination: AudioDestinationNode) => void;

export function connectPlaybackDry(source: AudioNode, destination: AudioDestinationNode): void {
  source.connect(destination);
}

export type PlayOutcome = { ok: true } | { ok: false; reason: "unavailable" | "overlap" | "error" };

export interface ReadbackPlayHooks {
  /** Wall-clock `now` at source.start(). Once per play. */
  onAudioStart?: (nowMs: number) => void;
}

export interface ReadbackPlayer {
  readonly playing: boolean;
  /** T03-10 settings/debug: PCM wet graph vs dry. */
  readonly fxEnabled: boolean;
  /** Resume the shared playback AudioContext (first PTT or first play). */
  warmUp(): Promise<void>;
  playPcm(clip: AudioClip, hooks?: ReadbackPlayHooks): Promise<PlayOutcome>;
  stop(): void;
  setConnectSource(connect: ConnectPlaybackSource): void;
  /** Bypass radio FX on the next PCM play. Does not throw if unused. */
  setFxEnabled(enabled: boolean): void;
}

export interface ReadbackPlayerOptions {
  getAudioContext?: () => AudioContext | null;
  connectSource?: ConnectPlaybackSource;
  /** Default {@link DEFAULT_RADIO_FX_ENABLED}. T03-10 may persist this. */
  fxEnabled?: boolean;
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
  private radioGraph: RadioGraph | null = null;
  private fxEnabledValue: boolean;
  private customConnect: ConnectPlaybackSource | null;
  private readonly getAudioContext?: () => AudioContext | null;
  private readonly now: () => number;
  private readonly delay: (ms: number) => Promise<void>;

  constructor(options: ReadbackPlayerOptions) {
    this.getAudioContext = options.getAudioContext;
    this.customConnect = options.connectSource ?? null;
    this.fxEnabledValue = options.fxEnabled ?? DEFAULT_RADIO_FX_ENABLED;
    this.now = options.now ?? defaultNow;
    this.delay = options.delay ?? defaultDelay;
  }

  get playing(): boolean {
    return this.playingValue;
  }

  get fxEnabled(): boolean {
    return this.fxEnabledValue;
  }

  setConnectSource(connect: ConnectPlaybackSource): void {
    this.customConnect = connect;
  }

  setFxEnabled(enabled: boolean): void {
    this.fxEnabledValue = enabled;
    this.radioGraph?.setFxEnabled(enabled);
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
    this.radioGraph?.endPlay();
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
      this.routePcm(source, ctx, clip);

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
      this.radioGraph?.endPlay();
      if (this.generation === generation) {
        this.source = null;
        this.playingValue = false;
      }
    }
  }

  private routePcm(source: AudioBufferSourceNode, ctx: AudioContext, clip: AudioClip): void {
    const destination = ctx.destination;
    if (this.customConnect) {
      this.customConnect(source, destination);
      return;
    }
    if (!this.fxEnabledValue || isSilentClip(clip)) {
      connectPlaybackDry(source, destination);
      return;
    }
    const graph = this.ensureGraph(ctx);
    if (!graph) {
      connectPlaybackDry(source, destination);
      return;
    }
    connectPlaybackThroughRadio(graph)(source, destination);
  }

  private ensureGraph(ctx: AudioContext): RadioGraph | null {
    if (this.radioGraph) {
      return this.radioGraph;
    }
    try {
      this.radioGraph = createRadioGraph(ctx);
      this.radioGraph.setFxEnabled(this.fxEnabledValue);
      return this.radioGraph;
    } catch {
      return null;
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
