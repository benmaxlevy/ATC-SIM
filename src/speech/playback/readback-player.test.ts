import { expect, test, vi } from "vitest";
import type { AudioClip } from "../types";
import { PLAYBACK_TAIL_MS, connectPlaybackDry, createReadbackPlayer } from "./readback-player";

function clip(samples: number[] = [1, 0, -1]): AudioClip {
  return { sampleRate: 16000, channels: 1, pcm16: Int16Array.from(samples) };
}

class FakeBuffer {
  constructor(readonly length: number) {}
  getChannelData(): Float32Array {
    return new Float32Array(this.length);
  }
}

class FakeSource {
  buffer: FakeBuffer | null = null;
  onended: (() => void) | null = null;
  readonly connect = vi.fn();
  start(): void {
    queueMicrotask(() => {
      this.onended?.();
    });
  }
  stop(): void {
    this.onended?.();
  }
}

class FakeContext {
  currentTime = 0;
  state: AudioContextState = "running";
  destination = { id: "dest" } as unknown as AudioDestinationNode;
  readonly sources: FakeSource[] = [];

  createBuffer(_channels: number, length: number, _sampleRate: number): AudioBuffer {
    return new FakeBuffer(length) as unknown as AudioBuffer;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }
}

test("PLAYBACK_TAIL_MS is 50 so T03-01 lock outlasts compressor release", () => {
  expect(PLAYBACK_TAIL_MS).toBe(50);
});

test("playPcm without AudioContext is unavailable and does not throw", async () => {
  const player = createReadbackPlayer({
    getAudioContext: () => null,
    delay: async () => {},
  });
  await expect(player.playPcm(clip())).resolves.toEqual({ ok: false, reason: "unavailable" });
  expect(player.playing).toBe(false);
});

test("playPcm starts an AudioBufferSourceNode once and fires audio-start (AC5)", async () => {
  const ctx = new FakeContext();
  const starts: number[] = [];
  const player = createReadbackPlayer({
    getAudioContext: () => ctx as unknown as AudioContext,
    now: () => 42,
    delay: async () => {},
  });

  const outcome = await player.playPcm(clip([32767, -32768]), {
    onAudioStart: (ms) => {
      starts.push(ms);
    },
  });

  expect(outcome).toEqual({ ok: true });
  expect(starts).toEqual([42]);
  expect(ctx.sources).toHaveLength(1);
  expect(ctx.sources[0]!.connect).toHaveBeenCalledWith(ctx.destination);
  expect(player.playing).toBe(false);
});

test("second playPcm while the first is in flight does not overlap (AC2)", async () => {
  const ctx = new FakeContext();
  let finishFirst!: () => void;
  ctx.createBufferSource = () => {
    const source = new FakeSource();
    source.start = () => {
      // hold until test ends the first play
    };
    ctx.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  };

  const player = createReadbackPlayer({
    getAudioContext: () => ctx as unknown as AudioContext,
    delay: async () => {},
  });

  const first = player.playPcm(clip(), {
    onAudioStart: () => {
      finishFirst = () => {
        ctx.sources[0]!.onended?.();
      };
    },
  });
  await Promise.resolve();
  expect(player.playing).toBe(true);

  const second = await player.playPcm(clip([9]));
  expect(second).toEqual({ ok: false, reason: "overlap" });
  expect(ctx.sources).toHaveLength(1);

  finishFirst();
  await expect(first).resolves.toEqual({ ok: true });
});

test("playBrowser uses speak() after handlers and does not claim a radio graph", async () => {
  const utterance = {
    onstart: null as (() => void) | null,
    onend: null as (() => void) | null,
    onerror: null as (() => void) | null,
  };
  const speak = vi.fn(() => {
    utterance.onstart?.();
    queueMicrotask(() => utterance.onend?.());
  });
  const connect = vi.fn(connectPlaybackDry);
  const starts: number[] = [];
  const player = createReadbackPlayer({
    connectSource: connect,
    delay: async () => {},
    now: () => 7,
    speakBrowser: () => ({
      utterance: utterance as unknown as SpeechSynthesisUtterance,
      speak,
    }),
  });

  const outcome = await player.playBrowser("heading two seven zero", "voice", {
    onAudioStart: (ms) => {
      starts.push(ms);
    },
  });

  expect(outcome).toEqual({ ok: true });
  expect(speak).toHaveBeenCalledTimes(1);
  expect(starts).toEqual([7]);
  expect(connect).not.toHaveBeenCalled();
});

test("createReadbackPlayer tests run without a DOM AudioContext", () => {
  expect(typeof AudioContext).toBe("undefined");
});
