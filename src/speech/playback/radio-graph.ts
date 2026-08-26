/**
 * Web Audio radio FX for clip-based TTS (`http` PCM). Band-limit, light hiss,
 * gentle compressor. `speechSynthesis` never enters this graph.
 *
 * Chain (FX on):
 *   source → input → highpass → lowpass → voiceGain ─┐
 *            noiseBufferSource → noiseGain ──────────┤→ mixer → compressor → master → dest
 *
 * FX off (T03-10 / debug): source → destination, no obligatory noise.
 */

import type { AudioClip } from "..";

/** Int16 full-scale used by Web Audio. `-32768 / 32768 === -1`. */
export const PCM16_SCALE = 32768;

export function pcm16ToFloat32(pcm16: Int16Array): Float32Array {
  const out = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i += 1) {
    out[i] = pcm16[i]! / PCM16_SCALE;
  }
  return out;
}

/**
 * Copy a mono {@link AudioClip} into an `AudioBuffer` (channel 0).
 * Caller creates the buffer so tests can skip a real AudioContext.
 */
export function copyClipToAudioBuffer(buffer: AudioBuffer, clip: AudioClip): void {
  const floats = pcm16ToFloat32(clip.pcm16);
  const channel = buffer.getChannelData(0);
  const n = Math.min(channel.length, floats.length);
  channel.set(floats.subarray(0, n));
}

export function createAudioBufferFromClip(ctx: AudioContext, clip: AudioClip): AudioBuffer {
  const length = Math.max(1, clip.pcm16.length);
  const sampleRate = clip.sampleRate > 0 ? clip.sampleRate : 16000;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  copyClipToAudioBuffer(buffer, clip);
  return buffer;
}

/**
 * Named radio-FX constants (README §7.2). v1 should sound like a radio,
 * not a calibrated transceiver. Tune here — do not scatter magic numbers.
 */

/** High-pass cutoff (Hz). Typical ATC radio / telephone low edge. */
export const RADIO_HIGHPASS_HZ = 300;

/** Low-pass cutoff (Hz). Typical ATC radio / telephone high edge. */
export const RADIO_LOWPASS_HZ = 3000;

/** Butterworth Q for the highpass + lowpass pair (~−3 dB at each cutoff). */
export const RADIO_FILTER_Q = 0.7071;

/** Voice path gain after the band-limit filters. */
export const RADIO_VOICE_GAIN = 1;

/**
 * Looping noise mix versus voice. Ticket range ~0.02–0.05 so hiss does not
 * drown the readback.
 */
export const RADIO_NOISE_GAIN = 0.03;

/** White-noise buffer length (seconds). Looped only while a clip plays. */
export const RADIO_NOISE_DURATION_SEC = 1;

/** Compressor threshold (dB). Gentle peak taming after the filter. */
export const RADIO_COMPRESSOR_THRESHOLD_DB = -24;

/** Compressor knee (dB). */
export const RADIO_COMPRESSOR_KNEE_DB = 12;

/** Compressor ratio. Keep this mild — not a slam limiter. */
export const RADIO_COMPRESSOR_RATIO = 4;

/** Compressor attack (seconds). */
export const RADIO_COMPRESSOR_ATTACK_SEC = 0.003;

/**
 * Compressor release (seconds). Matches the T03-06 50 ms playback tail
 * so release is not clipped into the next PTT.
 */
export const RADIO_COMPRESSOR_RELEASE_SEC = 0.05;

/** Master gain after the compressor. */
export const RADIO_MASTER_GAIN = 1;

/** Default: PCM clips go through the FX graph. T03-10 may toggle this. */
export const DEFAULT_RADIO_FX_ENABLED = true;

/** Inspectable node list for tests (AC1). Documented order is the wet chain. */
export interface RadioGraphNodes {
  input: GainNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  voiceGain: GainNode;
  noiseGain: GainNode;
  mixer: GainNode;
  compressor: DynamicsCompressorNode;
  masterGain: GainNode;
}

export interface RadioGraph {
  readonly input: AudioNode;
  readonly nodes: RadioGraphNodes;
  readonly fxEnabled: boolean;
  /** Wire master → destination. Idempotent for the same dest. */
  connect(destination: AudioNode): void;
  /** Drop master → dest so a dry path cannot mix leftover hiss. */
  detach(): void;
  /**
   * Settings / debug bypass (T03-10). `false` is dry: no filter, no noise.
   * Does not throw if the graph is unused (browser TTS path).
   */
  setFxEnabled(enabled: boolean): void;
  /** Start looping noise at {@link RADIO_NOISE_GAIN}. No-op when FX is off. */
  beginPlay(): void;
  /** Mute and stop noise so idle is silent (AC4). */
  endPlay(): void;
}

type AudioFactoryName =
  | "createGain"
  | "createBiquadFilter"
  | "createDynamicsCompressor"
  | "createBuffer"
  | "createBufferSource";

function requireAudioFactory(ctx: AudioContext, name: AudioFactoryName): void {
  if (typeof ctx[name] !== "function") {
    throw new Error(`Radio graph needs AudioContext.${name}`);
  }
}

function createWhiteNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate > 0 ? ctx.sampleRate : 48000;
  const length = Math.max(1, Math.floor(sampleRate * RADIO_NOISE_DURATION_SEC));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * True when every pcm16 sample is 0 (NullSpeechPort / unused synthesize).
 * Silent clips stay dry — no filter, no hiss.
 */
export function isSilentClip(clip: AudioClip): boolean {
  const pcm = clip.pcm16;
  for (let i = 0; i < pcm.length; i += 1) {
    if (pcm[i] !== 0) {
      return false;
    }
  }
  return true;
}

export function createRadioGraph(ctx: AudioContext): RadioGraph {
  requireAudioFactory(ctx, "createGain");
  requireAudioFactory(ctx, "createBiquadFilter");
  requireAudioFactory(ctx, "createDynamicsCompressor");
  requireAudioFactory(ctx, "createBuffer");
  requireAudioFactory(ctx, "createBufferSource");

  const input = ctx.createGain();
  input.gain.value = 1;

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = RADIO_HIGHPASS_HZ;
  highpass.Q.value = RADIO_FILTER_Q;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = RADIO_LOWPASS_HZ;
  lowpass.Q.value = RADIO_FILTER_Q;

  const voiceGain = ctx.createGain();
  voiceGain.gain.value = RADIO_VOICE_GAIN;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0;

  const mixer = ctx.createGain();
  mixer.gain.value = 1;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = RADIO_COMPRESSOR_THRESHOLD_DB;
  compressor.knee.value = RADIO_COMPRESSOR_KNEE_DB;
  compressor.ratio.value = RADIO_COMPRESSOR_RATIO;
  compressor.attack.value = RADIO_COMPRESSOR_ATTACK_SEC;
  compressor.release.value = RADIO_COMPRESSOR_RELEASE_SEC;

  const masterGain = ctx.createGain();
  masterGain.gain.value = RADIO_MASTER_GAIN;

  input.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(voiceGain);
  voiceGain.connect(mixer);
  noiseGain.connect(mixer);
  mixer.connect(compressor);
  compressor.connect(masterGain);

  const noiseBuffer = createWhiteNoiseBuffer(ctx);
  const nodes: RadioGraphNodes = {
    input,
    highpass,
    lowpass,
    voiceGain,
    noiseGain,
    mixer,
    compressor,
    masterGain,
  };

  return new RadioGraphImpl(ctx, nodes, noiseBuffer);
}

class RadioGraphImpl implements RadioGraph {
  private enabled = DEFAULT_RADIO_FX_ENABLED;
  private connectedDestination: AudioNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;

  constructor(
    private readonly ctx: AudioContext,
    readonly nodes: RadioGraphNodes,
    private readonly noiseBuffer: AudioBuffer,
  ) {}

  get input(): AudioNode {
    return this.nodes.input;
  }

  get fxEnabled(): boolean {
    return this.enabled;
  }

  connect(destination: AudioNode): void {
    if (this.connectedDestination === destination) {
      return;
    }
    this.detach();
    this.nodes.masterGain.connect(destination);
    this.connectedDestination = destination;
  }

  detach(): void {
    if (!this.connectedDestination) {
      return;
    }
    try {
      this.nodes.masterGain.disconnect();
    } catch {
      // never connected / already disconnected
    }
    this.connectedDestination = null;
  }

  setFxEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.endPlay();
      this.detach();
    }
  }

  beginPlay(): void {
    if (!this.enabled) {
      return;
    }
    this.endPlay();
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.connect(this.nodes.noiseGain);
    this.noiseSource = source;
    this.nodes.noiseGain.gain.value = RADIO_NOISE_GAIN;
    try {
      source.start();
    } catch {
      this.nodes.noiseGain.gain.value = 0;
      this.noiseSource = null;
    }
  }

  endPlay(): void {
    this.nodes.noiseGain.gain.value = 0;
    const source = this.noiseSource;
    this.noiseSource = null;
    if (!source) {
      return;
    }
    try {
      source.stop();
    } catch {
      // already stopped
    }
    try {
      source.disconnect();
    } catch {
      // already disconnected
    }
  }
}

/**
 * T03-06 playback seam: PCM source → radio graph when FX is on, else dry.
 * Browser TTS must not call this.
 */
export function connectPlaybackThroughRadio(
  graph: RadioGraph,
): (source: AudioNode, destination: AudioDestinationNode) => void {
  return (source, destination) => {
    if (!graph.fxEnabled) {
      graph.endPlay();
      graph.detach();
      source.connect(destination);
      return;
    }
    graph.connect(destination);
    source.connect(graph.input);
    graph.beginPlay();
  };
}
