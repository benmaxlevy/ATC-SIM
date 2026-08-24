import { expect, test, vi } from "vitest";
import type { CaptureBackend } from "./capture-backend";
import {
  DEFAULT_PTT_KEY,
  EMPTY_CLIP_MS,
  createPttCaptureController,
  isTextFieldTarget,
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

function backtick(
  extra: Partial<PttKeyEvent> & { preventDefault?: ReturnType<typeof vi.fn> } = {},
): PttKeyEvent & { preventDefault: ReturnType<typeof vi.fn> } {
  return key({ key: "`", code: "Backquote", ctrlKey: false, ...extra });
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

test("default PTT bind is Left Control, not Caps Lock or backtick", () => {
  const { controller } = setup();
  expect(controller.pttKey).toBe("ControlLeft");
  expect(controller.pttKey).not.toBe("CapsLock");
  expect(controller.pttKey).not.toBe("`");
  controller.dispose();
});

test("hold Left Control emits a 16 kHz clip on keyup", async () => {
  const { controller, events, fake, clock } = setup();
  await controller.handleKeyDown(key({ key: "Control", code: "ControlLeft", ctrlKey: true }));
  expect(events).toEqual([{ type: "ptt-down" }]);
  expect(fake.armed).toBe(true);

  fake.push(new Float32Array(48000).fill(0.25));
  clock.ms = 1000;
  await controller.handleKeyUp(key({ key: "Control", code: "ControlLeft", ctrlKey: true }));

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

test("backtick is latch: keyup does not send; second keydown emits the clip", async () => {
  const { controller, events, fake, clock } = setup();
  controller.setPttKey("`");
  await controller.handleKeyDown(backtick());
  expect(events).toEqual([{ type: "ptt-down" }]);
  expect(fake.armed).toBe(true);

  fake.push(new Float32Array(48000).fill(0.25));
  clock.ms = 1000;
  await controller.handleKeyUp(backtick());
  expect(events).toHaveLength(1);
  expect(fake.armed).toBe(true);

  controller.setTransmitLocked(true);
  await controller.handleKeyDown(backtick());

  expect(fake.armed).toBe(false);
  const up = events[1];
  expect(up?.type).toBe("ptt-up");
  if (up?.type !== "ptt-up" || up.result.kind !== "clip") {
    throw new Error("expected clip");
  }
  expect(up.result.clip.pcm16.length).toBe(16000);
  controller.dispose();
});

test("focused text input does not start capture for backtick (AC2)", async () => {
  const { controller, events, fake } = setup();
  controller.setPttKey("`");
  const down = backtick({ target: { tagName: "INPUT" } });
  await controller.handleKeyDown(down);
  expect(fake.startCalls).toBe(0);
  expect(events).toEqual([]);
  expect(down.preventDefault).not.toHaveBeenCalled();
  controller.dispose();
});

test("Left Control PTT works while the command line is focused", async () => {
  const { controller, events, fake } = setup();
  await controller.handleKeyDown(
    key({ key: "Control", code: "ControlLeft", ctrlKey: true, target: { tagName: "INPUT" } }),
  );
  expect(fake.startCalls).toBe(1);
  expect(events).toEqual([{ type: "ptt-down" }]);
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

test("second backtick under 80 ms with no samples is empty (AC5)", async () => {
  const { controller, events, clock } = setup();
  controller.setPttKey("`");
  await controller.handleKeyDown(backtick());
  clock.ms = EMPTY_CLIP_MS - 1;
  await controller.handleKeyDown(backtick());
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

test("PTT bind can match KeyboardEvent.code (ControlLeft / KeyZ)", async () => {
  const { controller, fake } = setup();
  controller.setPttKey("ControlLeft");
  await controller.handleKeyDown(key({ key: "Control", code: "ControlLeft", ctrlKey: true }));
  expect(fake.startCalls).toBe(1);
  await controller.handleKeyUp(key({ key: "Control", code: "ControlLeft", ctrlKey: true }));
  controller.setPttKey("KeyZ");
  await controller.handleKeyDown(key({ key: "z", code: "KeyZ" }));
  expect(fake.startCalls).toBe(2);
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

test("Left Control is still hold-to-talk (keyup sends)", async () => {
  const { controller, events, fake, clock } = setup();
  controller.setPttKey("ControlLeft");
  await controller.handleKeyDown(key({ key: "Control", code: "ControlLeft", ctrlKey: true }));
  expect(events).toEqual([{ type: "ptt-down" }]);
  fake.push(new Float32Array(4800).fill(0.1));
  clock.ms = 200;
  await controller.handleKeyUp(key({ key: "Control", code: "ControlLeft", ctrlKey: true }));
  expect(events[1]?.type).toBe("ptt-up");
  controller.dispose();
});

test("Dead + Backquote matches a backtick bind", async () => {
  const { controller, fake } = setup();
  controller.setPttKey("`");
  await controller.handleKeyDown(key({ key: "Dead", code: "Backquote" }));
  expect(fake.startCalls).toBe(1);
  controller.dispose();
});

test("hold release before mic start completes does not queue a clip", async () => {
  const fake = new FakeCaptureBackend();
  let release: () => void = () => undefined;
  fake.delayStart = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { controller, events } = setup(fake);
  const down = controller.handleKeyDown(
    key({ key: "Control", code: "ControlLeft", ctrlKey: true }),
  );
  await controller.handleKeyUp(key({ key: "Control", code: "ControlLeft", ctrlKey: true }));
  release();
  await down;
  expect(events).toEqual([]);
  expect(fake.armed).toBe(false);
  controller.dispose();
});

test("latch keyup during mic start does not cancel capture", async () => {
  const fake = new FakeCaptureBackend();
  let release: () => void = () => undefined;
  fake.delayStart = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { controller, events } = setup(fake);
  controller.setPttKey("`");
  const down = controller.handleKeyDown(backtick());
  await controller.handleKeyUp(backtick());
  release();
  await down;
  expect(events).toEqual([{ type: "ptt-down" }]);
  expect(fake.armed).toBe(true);
  controller.dispose();
});

test("on-screen PTT hold emits a clip on pointer up", async () => {
  const { controller, events, fake, clock } = setup();
  await controller.pressFromPointer();
  expect(events).toEqual([{ type: "ptt-down" }]);
  fake.push(new Float32Array(48000).fill(0.2));
  clock.ms = 1000;
  controller.releaseFromPointer();
  expect(events[1]?.type).toBe("ptt-up");
  controller.dispose();
});

test("worklet source registers an off-main-thread processor", async () => {
  const { PCM_CAPTURE_PROCESSOR, PCM_CAPTURE_WORKLET_SOURCE } = await import("./pcm-worklet");
  expect(PCM_CAPTURE_WORKLET_SOURCE).toContain("AudioWorkletProcessor");
  expect(PCM_CAPTURE_WORKLET_SOURCE).toContain(`registerProcessor("${PCM_CAPTURE_PROCESSOR}"`);
  expect(PCM_CAPTURE_WORKLET_SOURCE).toContain("this.armed");
});

test("input, textarea, and contenteditable are text fields (AC2)", () => {
  expect(isTextFieldTarget({ tagName: "INPUT" })).toBe(true);
  expect(isTextFieldTarget({ tagName: "input" })).toBe(true);
  expect(isTextFieldTarget({ tagName: "TEXTAREA" })).toBe(true);
  expect(isTextFieldTarget({ isContentEditable: true })).toBe(true);
});

test("canvas, body, and null are not text fields", () => {
  expect(isTextFieldTarget(null)).toBe(false);
  expect(isTextFieldTarget({ tagName: "CANVAS" })).toBe(false);
  expect(isTextFieldTarget({ tagName: "BODY" })).toBe(false);
  expect(isTextFieldTarget({ tagName: "BUTTON" })).toBe(false);
});

test("closest() matching an input counts as focused text field", () => {
  const target = {
    tagName: "SPAN",
    closest: (selector: string) => (selector.includes("input") ? {} : null),
  };
  expect(isTextFieldTarget(target)).toBe(true);
});
