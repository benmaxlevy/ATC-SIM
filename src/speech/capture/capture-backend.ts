import { PCM_CAPTURE_PROCESSOR, createPcmWorkletBlobUrl } from "./pcm-worklet";

/**
 * Live mic + AudioWorklet. The controller concatenates frames only while PTT
 * is down. One MediaStream is reused until {@link dispose}.
 */
export interface CaptureBackend {
  onAudio: ((samples: Float32Array) => void) | null;
  ensureStarted(): Promise<{ sampleRate: number }>;
  setArmed(armed: boolean): void;
  dispose(): void;
}

function audioContextConstructor(): typeof AudioContext | undefined {
  const g = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  return g.AudioContext ?? g.webkitAudioContext;
}

export class WebAudioCaptureBackend implements CaptureBackend {
  onAudio: ((samples: Float32Array) => void) | null = null;

  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private mute: GainNode | null = null;
  private workletUrl: string | null = null;
  private started: Promise<{ sampleRate: number }> | null = null;

  ensureStarted(): Promise<{ sampleRate: number }> {
    if (!this.started) {
      this.started = this.start().catch((err: unknown) => {
        this.started = null;
        this.teardownGraph();
        throw err;
      });
    }
    return this.started;
  }

  setArmed(armed: boolean): void {
    this.node?.port.postMessage({ type: armed ? "arm" : "disarm" });
  }

  dispose(): void {
    this.onAudio = null;
    this.setArmed(false);
    this.teardownGraph();
    this.started = null;
  }

  private async start(): Promise<{ sampleRate: number }> {
    const mediaDevices = globalThis.navigator?.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia is unavailable");
    }
    const stream = await mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    this.stream = stream;

    const Ctx = audioContextConstructor();
    if (!Ctx) {
      this.stopTracks();
      throw new Error("AudioContext is unavailable");
    }
    const ctx = new Ctx();
    this.ctx = ctx;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    this.workletUrl = createPcmWorkletBlobUrl();
    await ctx.audioWorklet.addModule(this.workletUrl);

    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, PCM_CAPTURE_PROCESSOR);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const samples = event.data;
      if (samples && samples.length > 0) {
        this.onAudio?.(samples);
      }
    };
    source.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);

    this.source = source;
    this.node = node;
    this.mute = mute;
    return { sampleRate: ctx.sampleRate };
  }

  private stopTracks(): void {
    if (!this.stream) {
      return;
    }
    for (const track of this.stream.getTracks()) {
      track.stop();
    }
    this.stream = null;
  }

  private teardownGraph(): void {
    try {
      this.node?.port.close();
    } catch {
      // already closed
    }
    try {
      this.source?.disconnect();
    } catch {
      // already disconnected
    }
    try {
      this.node?.disconnect();
    } catch {
      // already disconnected
    }
    try {
      this.mute?.disconnect();
    } catch {
      // already disconnected
    }
    this.source = null;
    this.node = null;
    this.mute = null;
    this.stopTracks();
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) {
      void ctx.close();
    }
    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl);
      this.workletUrl = null;
    }
  }
}
