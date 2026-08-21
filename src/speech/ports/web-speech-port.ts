import { SpeechNotAvailableError } from "../errors";
import type { AudioClip, SpeechPort, Transcript } from "../types";

export { speakBrowser } from "./browser-tts";
export type { BrowserSpeakResult } from "./browser-tts";

/** Opt-in prototype. Never the quality default (`http` → our speech-api). */
export const WEB_SPEECH_PORT_ID = "web-speech";

/** 10 ms of zeros at 16 kHz. T03-06 must not treat this as radio-FX PCM. */
const SILENCE_SAMPLE_RATE = 16000;
const SILENCE_FRAME_COUNT = 160;

const MISSING_API_MESSAGE =
  "Web Speech Recognition is not available in this browser (opt-in prototype; not the default)";

const NO_BEGIN_MESSAGE =
  "WebSpeechPort.transcribe requires beginUtterance on PTT-down (Web Speech does not consume PCM)";

/**
 * Minimal SpeechRecognition surface. Injected in tests so CI does not need a mic.
 * Prefix in browsers: `window.SpeechRecognition || window.webkitSpeechRecognition`.
 */
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultEventLike {
  resultIndex?: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

export type SpeechRecognitionFactory = () => SpeechRecognitionLike;

export interface WebSpeechPortOptions {
  /**
   * Inject a mock in tests. Omit to use the browser constructor.
   * Returning a throwing factory is unnecessary — omit / missing global fails typed.
   */
  recognitionFactory?: SpeechRecognitionFactory;
  now?: () => number;
}

type WindowWithSpeechRecognition = {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

function defaultNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  const g = globalThis as typeof globalThis &
    WindowWithSpeechRecognition & {
      window?: WindowWithSpeechRecognition;
    };
  return (
    g.SpeechRecognition ??
    g.webkitSpeechRecognition ??
    g.window?.SpeechRecognition ??
    g.window?.webkitSpeechRecognition ??
    null
  );
}

function defaultRecognitionFactory(): SpeechRecognitionLike {
  const Ctor = getSpeechRecognitionConstructor();
  if (!Ctor) {
    throw new SpeechNotAvailableError(MISSING_API_MESSAGE);
  }
  return new Ctor();
}

function silenceClip(): AudioClip {
  return {
    sampleRate: SILENCE_SAMPLE_RATE,
    channels: 1,
    pcm16: new Int16Array(SILENCE_FRAME_COUNT),
  };
}

/**
 * Chrome often reports `confidence === 0` even for usable finals. Treat 0 / missing
 * as absent and fall back: 0.8 if text is non-empty, 0 if empty (T03-04).
 */
function resolveConfidence(raw: number | undefined, text: string): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return text.trim().length > 0 ? 0.8 : 0;
}

function alternativeFromResult(
  result: SpeechRecognitionResultLike,
): SpeechRecognitionAlternativeLike | null {
  if (result.length < 1) {
    return null;
  }
  return result[0] ?? null;
}

/**
 * `SpeechPort` with `id: "web-speech"`. OPT-IN PROTOTYPE — never the default.
 *
 * Web Speech does not consume PCM. Coordinator (T03-02, not this ticket):
 * - PTT-down: `beginUtterance?.()` (starts recognition; no always-on listen).
 * - PTT-up: `endUtterance?.()` **or** `transcribe(clip)` which returns the live
 *   result and may ignore the clip.
 * - TTS: `synthesize` returns silence PCM (honest: no radio-FX samples). Call
 *   {@link speakBrowser} when `id === "web-speech"` (T03-06). Do not speak in
 *   both places.
 *
 * Chrome/Edge typically send recognition audio to the browser vendor (Google).
 * Settings (T03-10) must label this `Browser (may send audio to vendor)`.
 */
export class WebSpeechPort implements SpeechPort {
  readonly id = WEB_SPEECH_PORT_ID;

  private readonly recognitionFactory: SpeechRecognitionFactory;
  private readonly now: () => number;
  private recognition: SpeechRecognitionLike | null = null;
  private listening = false;
  private began = false;
  private startedAtMs = 0;
  private lastTranscript: Transcript | null = null;
  private pendingError: SpeechNotAvailableError | null = null;
  private stopWaiters: Array<(result: Transcript) => void> = [];
  private stopRejecters: Array<(err: SpeechNotAvailableError) => void> = [];

  constructor(options: WebSpeechPortOptions = {}) {
    this.recognitionFactory = options.recognitionFactory ?? defaultRecognitionFactory;
    this.now = options.now ?? defaultNow;
  }

  /**
   * Start `SpeechRecognition` for this PTT hold. Throws a typed error if the
   * API is missing — the voice loop must catch it (never through the sim tick).
   */
  beginUtterance(): void {
    this.abortRecognition();
    this.began = true;
    this.lastTranscript = null;
    this.pendingError = null;
    this.listening = false;

    let recognition: SpeechRecognitionLike;
    try {
      recognition = this.recognitionFactory();
    } catch (err) {
      this.began = false;
      if (err instanceof SpeechNotAvailableError) {
        throw err;
      }
      throw new SpeechNotAvailableError(MISSING_API_MESSAGE);
    }

    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => this.handleResult(event);
    recognition.onerror = (event) => this.handleError(event.error);
    recognition.onend = () => this.handleEnd();

    this.recognition = recognition;
    this.startedAtMs = this.now();
    try {
      recognition.start();
    } catch {
      this.recognition = null;
      this.began = false;
      throw new SpeechNotAvailableError(MISSING_API_MESSAGE);
    }
    this.listening = true;
  }

  /**
   * Stop recognition and resolve the final transcript. Returns `null` if
   * `beginUtterance` was never called for this port session.
   */
  endUtterance(): Promise<Transcript | null> {
    if (!this.began && !this.listening) {
      return Promise.resolve(this.lastTranscript);
    }
    return this.finishUtterance();
  }

  /**
   * If this utterance already has a live result, return it and ignore `audio`.
   * Web Speech cannot consume PCM. Rejects if `beginUtterance` was not called.
   */
  transcribe(audio: AudioClip): Promise<Transcript> {
    void audio;
    if (this.listening) {
      return this.finishUtterance();
    }
    if (this.pendingError) {
      return Promise.reject(this.pendingError);
    }
    if (this.lastTranscript) {
      return Promise.resolve(this.lastTranscript);
    }
    if (!this.began) {
      try {
        this.recognitionFactory();
      } catch (err) {
        if (err instanceof SpeechNotAvailableError) {
          return Promise.reject(err);
        }
        return Promise.reject(new SpeechNotAvailableError(MISSING_API_MESSAGE));
      }
      return Promise.reject(new SpeechNotAvailableError(NO_BEGIN_MESSAGE));
    }
    return Promise.resolve(this.emptyTranscript());
  }

  /**
   * Returns silence PCM. Does **not** call `speechSynthesis` (avoids double-speak
   * with T03-06). Use {@link speakBrowser} on the `web-speech` branch.
   */
  synthesize(text: string, voiceId: string): Promise<AudioClip> {
    void text;
    void voiceId;
    return Promise.resolve(silenceClip());
  }

  dispose(): void {
    this.abortRecognition();
    this.began = false;
    this.lastTranscript = null;
    this.pendingError = null;
  }

  private emptyTranscript(): Transcript {
    return { text: "", confidence: 0, latencyMs: Math.max(0, this.now() - this.startedAtMs) };
  }

  private handleResult(event: SpeechRecognitionResultEventLike): void {
    const results = event.results;
    const parts: string[] = [];
    let lastConfidence: number | undefined;
    for (let i = 0; i < results.length; i += 1) {
      const result = results[i];
      if (!result || !result.isFinal) {
        continue;
      }
      const alt = alternativeFromResult(result);
      if (!alt) {
        continue;
      }
      const piece = alt.transcript.trim();
      if (piece) {
        parts.push(piece);
      }
      lastConfidence = alt.confidence;
    }
    if (parts.length === 0) {
      return;
    }
    const text = parts.join(" ");
    this.lastTranscript = {
      text,
      confidence: resolveConfidence(lastConfidence, text),
      latencyMs: Math.max(0, this.now() - this.startedAtMs),
    };
  }

  private handleError(code: string): void {
    if (code === "aborted" || code === "no-speech") {
      return;
    }
    this.pendingError = new SpeechNotAvailableError(`Web Speech recognition failed: ${code}`);
  }

  private handleEnd(): void {
    this.listening = false;
    const err = this.pendingError;
    const transcript = this.lastTranscript ?? this.emptyTranscript();
    if (!this.lastTranscript) {
      this.lastTranscript = transcript;
    }
    const waiters = this.stopWaiters;
    const rejecters = this.stopRejecters;
    this.stopWaiters = [];
    this.stopRejecters = [];
    this.recognition = null;
    if (err) {
      for (const reject of rejecters) {
        reject(err);
      }
      return;
    }
    for (const resolve of waiters) {
      resolve(transcript);
    }
  }

  private finishUtterance(): Promise<Transcript> {
    if (this.listening) {
      return new Promise<Transcript>((resolve, reject) => {
        this.stopWaiters.push(resolve);
        this.stopRejecters.push(reject);
        try {
          this.recognition?.stop();
        } catch {
          this.handleEnd();
        }
      });
    }
    if (this.pendingError) {
      return Promise.reject(this.pendingError);
    }
    return Promise.resolve(this.lastTranscript ?? this.emptyTranscript());
  }

  private abortRecognition(): void {
    const rec = this.recognition;
    this.listening = false;
    this.recognition = null;
    const waiters = this.stopWaiters;
    const rejecters = this.stopRejecters;
    this.stopWaiters = [];
    this.stopRejecters = [];
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        // already stopped
      }
    }
    const transcript = this.lastTranscript ?? this.emptyTranscript();
    for (const resolve of waiters) {
      resolve(transcript);
    }
    void rejecters;
  }
}
