import { expect, test, vi } from "vitest";
import {
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
  RADIO_NOISE_GAIN,
  RADIO_VOICE_GAIN,
} from "./radio-fx-params";
import {
  connectPlaybackThroughRadio,
  createRadioGraph,
  isSilentClip,
  type RadioGraphNodes,
} from "./radio-graph";

type Conn = { from: object; to: object };

function audioParam(value: number): AudioParam {
  return { value } as AudioParam;
}

class FakeNode {
  readonly connections: object[] = [];
  connect = vi.fn((dest: object) => {
    this.connections.push(dest);
    return dest;
  });
  disconnect = vi.fn();
}

class FakeGain extends FakeNode {
  readonly gain = audioParam(1);
}

class FakeBiquad extends FakeNode {
  type: BiquadFilterType = "lowpass";
  readonly frequency = audioParam(350);
  readonly Q = audioParam(1);
}

class FakeCompressor extends FakeNode {
  readonly threshold = audioParam(-24);
  readonly knee = audioParam(30);
  readonly ratio = audioParam(12);
  readonly attack = audioParam(0.003);
  readonly release = audioParam(0.25);
}

class FakeBuffer {
  readonly data: Float32Array;
  constructor(
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

class FakeNoiseSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
  start = vi.fn();
  stop = vi.fn();
}

class FakeContext {
  sampleRate = 48000;
  readonly destination = { id: "dest" } as unknown as AudioDestinationNode;
  readonly gains: FakeGain[] = [];
  readonly filters: FakeBiquad[] = [];
  readonly compressors: FakeCompressor[] = [];
  readonly noiseSources: FakeNoiseSource[] = [];
  readonly buffers: FakeBuffer[] = [];
  readonly connections: Conn[] = [];

  createGain(): GainNode {
    const node = new FakeGain();
    this.gains.push(node);
    this.trackConnect(node);
    return node as unknown as GainNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    const node = new FakeBiquad();
    this.filters.push(node);
    this.trackConnect(node);
    return node as unknown as BiquadFilterNode;
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    const node = new FakeCompressor();
    this.compressors.push(node);
    this.trackConnect(node);
    return node as unknown as DynamicsCompressorNode;
  }

  createBuffer(_channels: number, length: number, sampleRate: number): AudioBuffer {
    const buffer = new FakeBuffer(length, sampleRate);
    this.buffers.push(buffer);
    return buffer as unknown as AudioBuffer;
  }

  createBufferSource(): AudioBufferSourceNode {
    const node = new FakeNoiseSource();
    this.noiseSources.push(node);
    this.trackConnect(node);
    return node as unknown as AudioBufferSourceNode;
  }

  private trackConnect(node: FakeNode): void {
    const inner = node.connect.getMockImplementation();
    node.connect = vi.fn((dest: object) => {
      this.connections.push({ from: node, to: dest });
      return inner ? inner(dest) : dest;
    });
  }
}

function wired(ctx: FakeContext, from: object, to: object): boolean {
  return ctx.connections.some((c) => c.from === from && c.to === to);
}

function chain(nodes: RadioGraphNodes): Array<[object, object]> {
  return [
    [nodes.input, nodes.highpass],
    [nodes.highpass, nodes.lowpass],
    [nodes.lowpass, nodes.voiceGain],
    [nodes.voiceGain, nodes.mixer],
    [nodes.noiseGain, nodes.mixer],
    [nodes.mixer, nodes.compressor],
    [nodes.compressor, nodes.masterGain],
  ];
}

test("named radio FX constants are finite and in the ticket ranges", () => {
  expect(RADIO_HIGHPASS_HZ).toBe(300);
  expect(RADIO_LOWPASS_HZ).toBe(3000);
  expect(RADIO_FILTER_Q).toBeCloseTo(0.7071, 4);
  expect(RADIO_VOICE_GAIN).toBe(1);
  expect(RADIO_NOISE_GAIN).toBeGreaterThanOrEqual(0.02);
  expect(RADIO_NOISE_GAIN).toBeLessThanOrEqual(0.05);
  expect(Number.isFinite(RADIO_NOISE_GAIN)).toBe(true);
  expect(RADIO_COMPRESSOR_THRESHOLD_DB).toBe(-24);
  expect(RADIO_COMPRESSOR_KNEE_DB).toBe(12);
  expect(RADIO_COMPRESSOR_RATIO).toBe(4);
  expect(RADIO_COMPRESSOR_ATTACK_SEC).toBe(0.003);
  expect(RADIO_COMPRESSOR_RELEASE_SEC).toBe(0.05);
  expect(RADIO_MASTER_GAIN).toBe(1);
  expect(DEFAULT_RADIO_FX_ENABLED).toBe(true);
});

test("createRadioGraph wires filter then compressor before destination (AC1)", () => {
  const ctx = new FakeContext();
  const graph = createRadioGraph(ctx as unknown as AudioContext);

  expect(graph.nodes.highpass.type).toBe("highpass");
  expect(graph.nodes.highpass.frequency.value).toBe(RADIO_HIGHPASS_HZ);
  expect(graph.nodes.lowpass.type).toBe("lowpass");
  expect(graph.nodes.lowpass.frequency.value).toBe(RADIO_LOWPASS_HZ);
  expect(graph.nodes.voiceGain.gain.value).toBe(RADIO_VOICE_GAIN);
  expect(graph.nodes.compressor.threshold.value).toBe(RADIO_COMPRESSOR_THRESHOLD_DB);
  expect(graph.nodes.compressor.ratio.value).toBe(RADIO_COMPRESSOR_RATIO);

  for (const [from, to] of chain(graph.nodes)) {
    expect(wired(ctx, from, to)).toBe(true);
  }

  graph.connect(ctx.destination);
  expect(wired(ctx, graph.nodes.masterGain, ctx.destination)).toBe(true);
});

test("setFxEnabled(false) is dry: source → destination, no obligatory noise (AC2)", () => {
  const ctx = new FakeContext();
  const graph = createRadioGraph(ctx as unknown as AudioContext);
  graph.connect(ctx.destination);
  graph.setFxEnabled(false);

  expect(graph.fxEnabled).toBe(false);
  expect(graph.nodes.masterGain.disconnect).toHaveBeenCalled();
  expect(graph.nodes.noiseGain.gain.value).toBe(0);

  const source = { connect: vi.fn() } as unknown as AudioNode;
  connectPlaybackThroughRadio(graph)(source, ctx.destination);
  expect(source.connect).toHaveBeenCalledWith(ctx.destination);
  expect(source.connect).not.toHaveBeenCalledWith(graph.input);
  expect(ctx.noiseSources).toHaveLength(0);
});

test("FX-enabled PCM connect routes source through the graph input (AC1)", () => {
  const ctx = new FakeContext();
  const graph = createRadioGraph(ctx as unknown as AudioContext);
  const source = { connect: vi.fn() } as unknown as AudioNode;

  connectPlaybackThroughRadio(graph)(source, ctx.destination);

  expect(source.connect).toHaveBeenCalledWith(graph.input);
  expect(source.connect).not.toHaveBeenCalledWith(ctx.destination);
  expect(wired(ctx, graph.nodes.masterGain, ctx.destination)).toBe(true);
});

test("noise gain is finite while playing and 0 after endPlay (AC4)", () => {
  const ctx = new FakeContext();
  const graph = createRadioGraph(ctx as unknown as AudioContext);

  expect(graph.nodes.noiseGain.gain.value).toBe(0);
  graph.beginPlay();
  expect(Number.isFinite(graph.nodes.noiseGain.gain.value)).toBe(true);
  expect(graph.nodes.noiseGain.gain.value).toBe(RADIO_NOISE_GAIN);
  expect(ctx.noiseSources).toHaveLength(1);
  expect(ctx.noiseSources[0]!.loop).toBe(true);
  expect(ctx.noiseSources[0]!.start).toHaveBeenCalled();

  graph.endPlay();
  expect(graph.nodes.noiseGain.gain.value).toBe(0);
  expect(ctx.noiseSources[0]!.stop).toHaveBeenCalled();
});

test("beginPlay is a no-op when FX is disabled so idle stays silent (AC4)", () => {
  const ctx = new FakeContext();
  const graph = createRadioGraph(ctx as unknown as AudioContext);
  graph.setFxEnabled(false);
  graph.beginPlay();
  expect(ctx.noiseSources).toHaveLength(0);
  expect(graph.nodes.noiseGain.gain.value).toBe(0);
});

test("creating a graph does not throw when unused (web-speech path, AC3)", () => {
  expect(typeof AudioContext).toBe("undefined");
  const ctx = new FakeContext();
  expect(() => createRadioGraph(ctx as unknown as AudioContext)).not.toThrow();
});

test("isSilentClip is true only for all-zero pcm16", () => {
  expect(isSilentClip({ sampleRate: 16000, channels: 1, pcm16: new Int16Array(8) })).toBe(true);
  expect(isSilentClip({ sampleRate: 16000, channels: 1, pcm16: new Int16Array(0) })).toBe(true);
  expect(isSilentClip({ sampleRate: 16000, channels: 1, pcm16: Int16Array.from([0, 1, 0]) })).toBe(
    false,
  );
});

test("noise buffer samples are finite (no CI audio snapshot)", () => {
  const ctx = new FakeContext();
  createRadioGraph(ctx as unknown as AudioContext);
  expect(ctx.buffers).toHaveLength(1);
  const data = ctx.buffers[0]!.data;
  expect(data.length).toBe(48000);
  expect(data.every((s) => Number.isFinite(s))).toBe(true);
  expect(data.some((s) => s !== 0)).toBe(true);
});
