import type { AudioClip } from "../types";
import type { CaptureBackend } from "./capture-backend";
import { WebAudioCaptureBackend } from "./capture-backend";
import { isEmptyPttCapture } from "./clip-gate";
import { isTextFieldTarget } from "./ptt-focus";
import { TARGET_SAMPLE_RATE, resampleToMonoPcm16 } from "./resample";

/** Default PTT bind is backtick (`event.key`). Do not default Caps Lock. */
export const DEFAULT_PTT_KEY = "`";

export type { CaptureBackend } from "./capture-backend";

export interface PttKeyEvent {
  key: string;
  /** `KeyboardEvent.code` so binds like `ControlLeft` / `KeyZ` match. */
  code?: string;
  repeat?: boolean;
  target?: unknown;
  preventDefault: () => void;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

export type PttUpResult = { kind: "clip"; clip: AudioClip } | { kind: "empty" };

export type PttCaptureEvent =
  | { type: "ptt-down" }
  | { type: "ptt-up"; result: PttUpResult }
  | { type: "permission-denied" }
  | { type: "capture-error"; reason: string }
  | { type: "ignored-locked" };

export interface PttListenerTarget {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export interface PttCaptureOptions {
  onEvent: (event: PttCaptureEvent) => void;
  backend?: CaptureBackend;
  /**
   * Window-level listeners. Default `window` when present. Pass `null` in
   * tests and call {@link PttCaptureController.handleKeyDown} instead.
   */
  attachTo?: PttListenerTarget | null;
  now?: () => number;
  isSecureContext?: boolean | (() => boolean);
  isTextFieldFocused?: (target: unknown) => boolean;
}

export interface PttCaptureController {
  readonly pttKey: string;
  setPttKey(key: string): void;
  setTransmitLocked(locked: boolean): void;
  dispose(): void;
  handleKeyDown(event: PttKeyEvent): Promise<void>;
  handleKeyUp(event: PttKeyEvent): Promise<void>;
}

function matchesPttKey(event: PttKeyEvent, pttKey: string): boolean {
  if (pttKey.length === 0) {
    return false;
  }
  if (event.key === pttKey || event.code === pttKey) {
    return true;
  }
  // Backtick is often `event.key === "Dead"` (US-International / many EU layouts).
  if (pttKey === "`" || pttKey === "Backquote") {
    return event.code === "Backquote" || event.key === "`" || event.key === "Dead";
  }
  return false;
}

/** Keys that cannot be held: Windows fires keyup immediately (dead key / lock). */
export function pttKeyUsesLatch(pttKey: string): boolean {
  return pttKey === "`" || pttKey === "Backquote" || pttKey === "CapsLock" || pttKey === "Dead";
}

function defaultNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function concatFloat32(chunks: readonly Float32Array[]): Float32Array {
  let total = 0;
  for (const chunk of chunks) {
    total += chunk.length;
  }
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function isPermissionDenied(err: unknown): boolean {
  if (err == null || typeof err !== "object") {
    return false;
  }
  const name = "name" in err && typeof err.name === "string" ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return true;
  }
  const message = "message" in err && typeof err.message === "string" ? err.message : "";
  return /notallowed|permission denied|denied by user/i.test(message);
}

function captureErrorReason(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return "capture-failed";
}

function readSecureContext(option: boolean | (() => boolean) | undefined): boolean {
  if (typeof option === "boolean") {
    return option;
  }
  if (typeof option === "function") {
    return option();
  }
  if (typeof globalThis.isSecureContext === "boolean") {
    return globalThis.isSecureContext;
  }
  return true;
}

function defaultAttachTo(option: PttListenerTarget | null | undefined): PttListenerTarget | null {
  if (option !== undefined) {
    return option;
  }
  if (typeof window !== "undefined") {
    return window;
  }
  return null;
}

/**
 * PTT capture: key-down arms the worklet, key-up emits a 16 kHz mono PCM16
 * {@link AudioClip} or empty. Never throws through the sim tick.
 *
 * Keyboard: default bind is backtick. That key is a **latch** (press to start,
 * press again to send) because Windows often fires keyup immediately (dead key).
 * Hold-to-talk still applies to Control / Tab / Z. Repeat keydown does not
 * restart capture. Text fields are ignored so the command line can type the bind.
 */
export function createPttCaptureController(options: PttCaptureOptions): PttCaptureController {
  return new PttCaptureControllerImpl(options);
}

class PttCaptureControllerImpl implements PttCaptureController {
  private pttKeyValue = DEFAULT_PTT_KEY;
  private transmitLocked = false;
  private disposed = false;
  private pttHeld = false;
  private capturing = false;
  private startGeneration = 0;
  private chunks: Float32Array[] = [];
  private captureStartedAtMs = 0;
  private nativeSampleRate = TARGET_SAMPLE_RATE;
  private readonly backend: CaptureBackend;
  private readonly onEvent: (event: PttCaptureEvent) => void;
  private readonly now: () => number;
  private readonly secure: boolean | (() => boolean) | undefined;
  private readonly isTextField: (target: unknown) => boolean;
  private detach: (() => void) | null = null;

  constructor(options: PttCaptureOptions) {
    this.onEvent = options.onEvent;
    this.now = options.now ?? defaultNow;
    this.secure = options.isSecureContext;
    this.isTextField = options.isTextFieldFocused ?? isTextFieldTarget;
    this.backend = options.backend ?? new WebAudioCaptureBackend();
    this.backend.onAudio = (samples) => {
      if (this.capturing) {
        this.chunks.push(samples);
      }
    };

    const target = defaultAttachTo(options.attachTo);
    if (target) {
      const onDown = (event: Event): void => {
        void this.handleKeyDown(this.adaptKeyEvent(event));
      };
      const onUp = (event: Event): void => {
        void this.handleKeyUp(this.adaptKeyEvent(event));
      };
      target.addEventListener("keydown", onDown);
      target.addEventListener("keyup", onUp);
      this.detach = () => {
        target.removeEventListener("keydown", onDown);
        target.removeEventListener("keyup", onUp);
      };
    }
  }

  get pttKey(): string {
    return this.pttKeyValue;
  }

  setPttKey(key: string): void {
    if (key.length === 0) {
      return;
    }
    this.pttKeyValue = key;
  }

  setTransmitLocked(locked: boolean): void {
    this.transmitLocked = locked;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.capturing = false;
    this.pttHeld = false;
    this.chunks = [];
    this.detach?.();
    this.detach = null;
    this.backend.dispose();
  }

  async handleKeyDown(event: PttKeyEvent): Promise<void> {
    try {
      await this.onKeyDown(event);
    } catch {
      this.pttHeld = false;
      this.emit({ type: "capture-error", reason: "unexpected" });
    }
  }

  async handleKeyUp(event: PttKeyEvent): Promise<void> {
    try {
      this.onKeyUp(event);
    } catch {
      this.emit({ type: "capture-error", reason: "unexpected" });
    }
  }

  private adaptKeyEvent(event: Event): PttKeyEvent {
    const ke = event as KeyboardEvent;
    return {
      key: typeof ke.key === "string" ? ke.key : "",
      code: typeof ke.code === "string" ? ke.code : "",
      repeat: Boolean(ke.repeat),
      target: ke.target ?? null,
      preventDefault: () => {
        ke.preventDefault();
      },
      ctrlKey: Boolean(ke.ctrlKey),
      altKey: Boolean(ke.altKey),
      metaKey: Boolean(ke.metaKey),
    };
  }

  private async onKeyDown(event: PttKeyEvent): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) {
      if (this.pttKeyValue !== "Control" && this.pttKeyValue !== "ControlLeft") {
        return;
      }
    }
    if (!matchesPttKey(event, this.pttKeyValue)) {
      return;
    }
    if (this.isTextField(event.target ?? null)) {
      return;
    }

    event.preventDefault();
    if (event.repeat) {
      return;
    }
    if (this.transmitLocked) {
      this.emit({ type: "ignored-locked" });
      return;
    }
    if (this.capturing && pttKeyUsesLatch(this.pttKeyValue)) {
      this.pttHeld = false;
      this.finishCapture();
      return;
    }
    if (this.pttHeld || this.capturing) {
      return;
    }

    this.pttHeld = true;
    if (!readSecureContext(this.secure)) {
      this.pttHeld = false;
      this.emit({ type: "capture-error", reason: "insecure-context" });
      return;
    }

    const generation = this.startGeneration + 1;
    this.startGeneration = generation;

    try {
      const { sampleRate } = await this.backend.ensureStarted();
      if (
        this.disposed ||
        generation !== this.startGeneration ||
        !this.pttHeld ||
        this.transmitLocked
      ) {
        return;
      }
      this.nativeSampleRate = sampleRate;
      this.chunks = [];
      this.captureStartedAtMs = this.now();
      this.capturing = true;
      this.backend.setArmed(true);
      this.emit({ type: "ptt-down" });
    } catch (err) {
      this.pttHeld = false;
      if (isPermissionDenied(err)) {
        this.emit({ type: "permission-denied" });
        return;
      }
      this.emit({ type: "capture-error", reason: captureErrorReason(err) });
    }
  }

  private onKeyUp(event: PttKeyEvent): void {
    if (this.disposed) {
      return;
    }
    if (!matchesPttKey(event, this.pttKeyValue)) {
      return;
    }
    // Latch binds (backtick / Caps Lock): keyup is spurious on dead-key layouts.
    // Ending on keyup is what cut clips to one or two words.
    if (pttKeyUsesLatch(this.pttKeyValue)) {
      event.preventDefault();
      return;
    }

    const wasCapturing = this.capturing;
    this.pttHeld = false;

    if (wasCapturing) {
      event.preventDefault();
      this.finishCapture();
      return;
    }

    if (this.isTextField(event.target ?? null)) {
      return;
    }
    event.preventDefault();
  }

  private finishCapture(): void {
    this.capturing = false;
    this.backend.setArmed(false);
    const chunks = this.chunks;
    this.chunks = [];
    const durationMs = Math.max(0, this.now() - this.captureStartedAtMs);
    let sampleCount = 0;
    for (const chunk of chunks) {
      sampleCount += chunk.length;
    }
    if (
      isEmptyPttCapture({
        durationMs,
        sampleCount,
        sampleRate: this.nativeSampleRate,
      })
    ) {
      this.emit({ type: "ptt-up", result: { kind: "empty" } });
      return;
    }
    const pcm16 = resampleToMonoPcm16(concatFloat32(chunks), this.nativeSampleRate);
    this.emit({
      type: "ptt-up",
      result: {
        kind: "clip",
        clip: {
          sampleRate: TARGET_SAMPLE_RATE,
          channels: 1,
          pcm16,
        },
      },
    });
  }

  private emit(event: PttCaptureEvent): void {
    try {
      this.onEvent(event);
    } catch {
      // Callbacks must not throw through the sim tick / rAF loop.
    }
  }
}
