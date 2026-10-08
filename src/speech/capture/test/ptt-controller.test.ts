import { expect, test, vi } from "vitest";
import type { CaptureBackend } from "../capture-backend";
import {
  DEFAULT_PTT_KEY,
  createPttCaptureController,
  TARGET_SAMPLE_RATE,
  type PttCaptureEvent,
  type PttKeyEvent,
} from "../ptt-controller";

class FakeCaptureBackend implements CaptureBackend {
  onAudio: ((samples: Float32Array) => void) | null = null;
  sampleRate = 48000;
  armed = false;
  rejectWith: unknown = null;

  async ensureStarted(): Promise<{ sampleRate: number }> {
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
    this.onAudio = null;
  }
}

function key(extra: Partial<PttKeyEvent> = {}): PttKeyEvent {
  return {
    key: DEFAULT_PTT_KEY,
    repeat: false,
    target: null,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    ...extra,
  };
}

function setup() {
  const events: PttCaptureEvent[] = [];
  const clock = { ms: 0 };
  const fake = new FakeCaptureBackend();
  const controller = createPttCaptureController({
    onEvent: (event) => events.push(event),
    backend: fake,
    attachTo: null,
    isSecureContext: true,
    now: () => clock.ms,
  });
  return { controller, events, fake, clock };
}

test("default PTT bind is Left Control", () => {
  const { controller } = setup();
  expect(controller.pttKey).toBe("ControlLeft");
  controller.dispose();
});

test("hold Left Control emits a 16 kHz clip on keyup", async () => {
  const { controller, events, fake, clock } = setup();
  await controller.handleKeyDown(key({ key: "Control", code: "ControlLeft", ctrlKey: true }));
  fake.push(new Float32Array(48000).fill(0.25));
  clock.ms = 1000;
  await controller.handleKeyUp(key({ key: "Control", code: "ControlLeft", ctrlKey: true }));
  const up = events[1];
  expect(up?.type).toBe("ptt-up");
  if (up?.type === "ptt-up" && up.result.kind === "clip") {
    expect(up.result.clip.sampleRate).toBe(TARGET_SAMPLE_RATE);
  }
  controller.dispose();
});

test("permission denied emits a signal and does not throw", async () => {
  const { controller, events, fake } = setup();
  fake.rejectWith = { name: "NotAllowedError" };
  await expect(
    controller.handleKeyDown(key({ key: "Control", code: "ControlLeft", ctrlKey: true })),
  ).resolves.toBeUndefined();
  expect(events.some((e) => e.type === "permission-denied")).toBe(true);
  controller.dispose();
});

test("transmitLocked ignores keydown without starting capture", async () => {
  const { controller, events } = setup();
  controller.setTransmitLocked(true);
  await controller.handleKeyDown(key({ key: "Control", code: "ControlLeft", ctrlKey: true }));
  expect(events).toEqual([{ type: "ignored-locked" }]);
  await controller.handleKeyUp(key({ key: "Control", code: "ControlLeft", ctrlKey: true }));
  expect(events).toEqual([{ type: "ignored-locked" }]);
  controller.dispose();
});

test("repeated keydown while holding PTT and transmitLocked does not abort capture", async () => {
  const { controller, events, fake, clock } = setup();
  await controller.handleKeyDown(key({ key: "Control", code: "ControlLeft", ctrlKey: true }));
  expect(events).toEqual([{ type: "ptt-down" }]);

  // Simulate voiceLoop locking transmit upon ptt-down
  controller.setTransmitLocked(true);

  // OS repeat keydown where repeat is false
  await controller.handleKeyDown(
    key({ key: "Control", code: "ControlLeft", ctrlKey: true, repeat: false }),
  );
  expect(events).toEqual([{ type: "ptt-down" }]);

  fake.push(new Float32Array(48000).fill(0.25));
  clock.ms = 500;
  await controller.handleKeyUp(key({ key: "Control", code: "ControlLeft", ctrlKey: true }));
  expect(events.length).toBe(2);
  expect(events[1]?.type).toBe("ptt-up");
  controller.dispose();
});

test("handleBlur finishes capture when capturing", async () => {
  const { controller, events, fake, clock } = setup();
  await controller.handleKeyDown(key({ key: "Control", code: "ControlLeft", ctrlKey: true }));
  expect(events).toEqual([{ type: "ptt-down" }]);

  fake.push(new Float32Array(48000).fill(0.25));
  clock.ms = 500;
  controller.handleBlur();
  expect(events.length).toBe(2);
  expect(events[1]?.type).toBe("ptt-up");
  controller.dispose();
});
