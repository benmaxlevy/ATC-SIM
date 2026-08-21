import { expect, test, vi } from "vitest";
import type { CaptureBackend } from "./capture-backend";
import { EMPTY_CLIP_MS } from "./clip-gate";
import {
  DEFAULT_PTT_KEY,
  createPttCaptureController,
  type PttCaptureEvent,
  type PttKeyEvent,
} from "./ptt-controller";
import { TARGET_SAMPLE_RATE } from "./resample";

class FakeCaptureBackend implements CaptureBackend {
  onAudio: ((samples: Float32Array) => void) | null = null;
  sampleRate = 48000;
  startCalls = 0;
  disposed = false;
  armed = false;
  rejectWith: unknown = null;
  delayStart: Promise<void> | null = null;

  async ensureStarted(): Promise<{ sampleRate: number }> {
    this.startCalls += 1;
    if (this.delayStart) {
      await this.delayStart;
    }
    if (this.rejectWith) {
      throw this.rejectWith;
    }
    return { sampleRate: this.sampleRate };
  }

  setArmed(armed: boolean): void {
    this.armed = armed;
  }

  push(samples: Float32Array): void {
    this.onAudio?.(samples);
  }

  dispose(): void {
    this.disposed = true;
    this.onAudio = null;
  }
}

function key(
  extra: Partial<PttKeyEvent> & { preventDefault?: ReturnType<typeof vi.fn> } = {},
): PttKeyEvent & { preventDefault: ReturnType<typeof vi.fn> } {
  const preventDefault = extra.preventDefault ?? vi.fn();
  return {
    key: DEFAULT_PTT_KEY,
    repeat: false,
    target: null,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...extra,
    preventDefault,
  };
}

function setup(backend?: FakeCaptureBackend, now?: { ms: number }) {
  const events: PttCaptureEvent[] = [];
  const clock = now ?? { ms: 0 };
  const fake = backend ?? new FakeCaptureBackend();
  const controller = createPttCaptureController({
    onEvent: (event) => events.push(event),
    backend: fake,
    attachTo: null,
    isSecureContext: true,
    now: () => clock.ms,
  });
  return { controller, events, fake, clock };
}

test("default PTT bind is backtick, not Caps Lock", () => {
  const { controller } = setup();
  expect(controller.pttKey).toBe("`");
  expect(controller.pttKey).not.toBe("CapsLock");
  controller.dispose();
});

test("hold and release PTT emits a 16 kHz mono PCM16 clip (AC1)", async () => {
  const { controller, events, fake, clock } = setup();
  await controller.handleKeyDown(key());
  expect(events).toEqual([{ type: "ptt-down" }]);
  expect(fake.armed).toBe(true);

  fake.push(new Float32Array(48000).fill(0.25));
  clock.ms = 1000;
  await controller.handleKeyUp(key());

  expect(fake.armed).toBe(false);
  const up = events[1];
  expect(up?.type).toBe("ptt-up");
  if (up?.type !== "ptt-up" || up.result.kind !== "clip") {
    throw new Error("expected clip");
  }
  expect(up.result.clip.channels).toBe(1);
  expect(up.result.clip.sampleRate).toBe(TARGET_SAMPLE_RATE);
  expect(up.result.clip.pcm16).toBeInstanceOf(Int16Array);
  expect(up.result.clip.pcm16.length).toBe(16000);
  controller.dispose();
});

test("focused text input does not start capture (AC2)", async () => {
  const { controller, events, fake } = setup();
  const down = key({ target: { tagName: "INPUT" } });
  await controller.handleKeyDown(down);
  expect(fake.startCalls).toBe(0);
  expect(events).toEqual([]);
  expect(down.preventDefault).not.toHaveBeenCalled();
  controller.dispose();
});

test("setTransmitLocked ignores PTT and does not queue (AC3)", async () => {
  const { controller, events, fake } = setup();
  controller.setTransmitLocked(true);
  await controller.handleKeyDown(key());
  await controller.handleKeyUp(key());
  expect(fake.startCalls).toBe(0);
  expect(fake.armed).toBe(false);
  expect(events).toEqual([{ type: "ignored-locked" }]);
  expect(events.some((e) => e.type === "ptt-down" || e.type === "ptt-up")).toBe(false);
  controller.dispose();
});

test("permission denied emits a signal and does not throw (AC4)", async () => {
  const fake = new FakeCaptureBackend();
  fake.rejectWith = { name: "NotAllowedError", message: "Permission denied" };
  const { controller, events } = setup(fake);
  await expect(controller.handleKeyDown(key())).resolves.toBeUndefined();
  expect(events).toEqual([{ type: "permission-denied" }]);
  expect(events.some((e) => e.type === "ptt-down")).toBe(false);
  controller.dispose();
});

test("onEvent throw is swallowed so the tick would keep running (AC4)", async () => {
  const fake = new FakeCaptureBackend();
  fake.rejectWith = { name: "NotAllowedError" };
  const controller = createPttCaptureController({
    onEvent: () => {
      throw new Error("status callback exploded");
    },
    backend: fake,
    attachTo: null,
    isSecureContext: true,
  });
  await expect(controller.handleKeyDown(key())).resolves.toBeUndefined();
  controller.dispose();
});

test("key-down and key-up under 80 ms with no samples is empty (AC5)", async () => {
  const { controller, events, clock } = setup();
  await controller.handleKeyDown(key());
  clock.ms = EMPTY_CLIP_MS - 1;
  await controller.handleKeyUp(key());
  expect(events).toEqual([{ type: "ptt-down" }, { type: "ptt-up", result: { kind: "empty" } }]);
  controller.dispose();
});

test("repeat keydown does not restart capture", async () => {
  const { controller, events, fake } = setup();
  await controller.handleKeyDown(key());
  await controller.handleKeyDown(key({ repeat: true }));
  expect(fake.startCalls).toBe(1);
  expect(events.filter((e) => e.type === "ptt-down")).toHaveLength(1);
  controller.dispose();
});

test("insecure context emits capture-error without starting the mic", async () => {
  const fake = new FakeCaptureBackend();
  const events: PttCaptureEvent[] = [];
  const controller = createPttCaptureController({
    onEvent: (event) => events.push(event),
    backend: fake,
    attachTo: null,
    isSecureContext: false,
  });
  await controller.handleKeyDown(key());
  expect(fake.startCalls).toBe(0);
  expect(events).toEqual([{ type: "capture-error", reason: "insecure-context" }]);
  controller.dispose();
});

test("setPttKey switches the bind; Caps Lock is opt-in data not the default", async () => {
  const { controller, events, fake } = setup();
  controller.setPttKey("CapsLock");
  expect(controller.pttKey).toBe("CapsLock");
  await controller.handleKeyDown(key());
  expect(fake.startCalls).toBe(0);
  await controller.handleKeyDown(key({ key: "CapsLock" }));
  expect(fake.startCalls).toBe(1);
  expect(events).toEqual([{ type: "ptt-down" }]);
  controller.dispose();
});

test("dispose stops the backend and ignores later keys", async () => {
  const { controller, fake, events } = setup();
  controller.dispose();
  expect(fake.disposed).toBe(true);
  await controller.handleKeyDown(key());
  expect(fake.startCalls).toBe(0);
  expect(events).toEqual([]);
});

test("releasing PTT before mic start completes does not queue a clip", async () => {
  const fake = new FakeCaptureBackend();
  let release: () => void = () => undefined;
  fake.delayStart = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { controller, events } = setup(fake);
  const down = controller.handleKeyDown(key());
  await controller.handleKeyUp(key());
  release();
  await down;
  expect(events).toEqual([]);
  expect(fake.armed).toBe(false);
  controller.dispose();
});

test("worklet source registers an off-main-thread processor", async () => {
  const { PCM_CAPTURE_PROCESSOR, PCM_CAPTURE_WORKLET_SOURCE } = await import("./pcm-worklet");
  expect(PCM_CAPTURE_WORKLET_SOURCE).toContain("AudioWorkletProcessor");
  expect(PCM_CAPTURE_WORKLET_SOURCE).toContain(`registerProcessor("${PCM_CAPTURE_PROCESSOR}"`);
  expect(PCM_CAPTURE_WORKLET_SOURCE).toContain("this.armed");
});
