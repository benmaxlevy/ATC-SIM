import { expect, test } from "vitest";
import { SpeechNotAvailableError } from "../errors";
import { speakBrowser } from "./browser-tts";
import type { AudioClip } from "../types";
import {
  WEB_SPEECH_PORT_ID,
  WebSpeechPort,
  type SpeechRecognitionLike,
  type SpeechRecognitionResultEventLike,
  type SpeechRecognitionResultLike,
} from "./web-speech-port";

function clip(): AudioClip {
  return { sampleRate: 16000, channels: 1, pcm16: new Int16Array(1600) };
}

function resultLike(
  transcript: string,
  confidence: number,
  isFinal: boolean,
): SpeechRecognitionResultLike {
  const alt = { transcript, confidence };
  return Object.assign([alt], { isFinal, length: 1 }) as SpeechRecognitionResultLike;
}

function resultEvent(
  entries: Array<{ transcript: string; confidence: number; isFinal: boolean }>,
): SpeechRecognitionResultEventLike {
  const results = entries.map((entry) =>
    resultLike(entry.transcript, entry.confidence, entry.isFinal),
  );
  return { results };
}

class MockRecognition implements SpeechRecognitionLike {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  finalOnStop: { transcript: string; confidence: number } | null = null;
  extrasOnStop: SpeechRecognitionResultEventLike | null = null;

  start(): void {
    this.started = true;
    this.aborted = false;
    this.stopped = false;
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    if (this.finalOnStop) {
      this.onresult?.(
        resultEvent([
          {
            transcript: this.finalOnStop.transcript,
            confidence: this.finalOnStop.confidence,
            isFinal: true,
          },
        ]),
      );
    }
    if (this.extrasOnStop) {
      this.onresult?.(this.extrasOnStop);
    }
    this.onend?.();
  }

  abort(): void {
    this.aborted = true;
    this.started = false;
    this.onend?.();
  }

  fire(event: SpeechRecognitionResultEventLike): void {
    this.onresult?.(event);
  }

  fireError(error: string): void {
    this.onerror?.({ error });
    this.started = false;
    this.onend?.();
  }
}

test("AC1 / AC5 — mocked final result after beginUtterance then endUtterance", async () => {
  const rec = new MockRecognition();
  rec.finalOnStop = {
    transcript: "turn left heading two seven zero",
    confidence: 0.9,
  };
  const port = new WebSpeechPort({ recognitionFactory: () => rec });
  expect(port.id).toBe(WEB_SPEECH_PORT_ID);
  expect(port.id).toBe("web-speech");

  port.beginUtterance();
  const transcript = await port.endUtterance();
  expect(transcript).not.toBeNull();
  expect(transcript?.text).toBe("turn left heading two seven zero");
  expect(transcript?.confidence).toBe(0.9);
  expect(transcript?.latencyMs).toBeGreaterThanOrEqual(0);
});

test("AC1 — transcribe after begin returns the live result and ignores PCM", async () => {
  const rec = new MockRecognition();
  rec.finalOnStop = {
    transcript: "turn left heading two seven zero",
    confidence: 0.9,
  };
  const port = new WebSpeechPort({ recognitionFactory: () => rec });
  port.beginUtterance();
  const transcript = await port.transcribe(clip());
  expect(transcript.text).toBe("turn left heading two seven zero");
  expect(transcript.confidence).toBe(0.9);
  expect(port.id).toBe("web-speech");
});

test("AC2 — missing API: beginUtterance throws typed error, transcribe rejects", async () => {
  const port = new WebSpeechPort();
  expect(() => {
    port.beginUtterance();
  }).toThrow(SpeechNotAvailableError);
  await expect(port.transcribe(clip())).rejects.toBeInstanceOf(SpeechNotAvailableError);
  await expect(port.transcribe(clip())).rejects.toThrow(/not available/i);
});

test("AC3 — synthesize returns 16 kHz mono silence and does not throw", async () => {
  const port = new WebSpeechPort();
  const out = await port.synthesize("heading two seven zero", "voice");
  expect(out.sampleRate).toBe(16000);
  expect(out.channels).toBe(1);
  expect(out.pcm16).toBeInstanceOf(Int16Array);
  expect(out.pcm16.length).toBe(160);
  expect(out.pcm16.every((sample) => sample === 0)).toBe(true);
});

test("AC4 — recognition is not running before beginUtterance", () => {
  let created = 0;
  const rec = new MockRecognition();
  const port = new WebSpeechPort({
    recognitionFactory: () => {
      created += 1;
      return rec;
    },
  });
  expect(created).toBe(0);
  expect(rec.started).toBe(false);
  port.beginUtterance();
  expect(created).toBe(1);
  expect(rec.started).toBe(true);
  expect(rec.lang).toBe("en-US");
  expect(rec.continuous).toBe(true);
  expect(rec.maxAlternatives).toBe(1);
});

test("transcribe without beginUtterance rejects when the API exists", async () => {
  const rec = new MockRecognition();
  const port = new WebSpeechPort({ recognitionFactory: () => rec });
  await expect(port.transcribe(clip())).rejects.toBeInstanceOf(SpeechNotAvailableError);
  await expect(port.transcribe(clip())).rejects.toThrow(/beginUtterance/);
  expect(rec.started).toBe(false);
});

test("interim results are ignored until isFinal", async () => {
  const rec = new MockRecognition();
  const port = new WebSpeechPort({ recognitionFactory: () => rec });
  port.beginUtterance();
  rec.fire(resultEvent([{ transcript: "turn left", confidence: 0.4, isFinal: false }]));
  rec.finalOnStop = { transcript: "turn left heading two seven zero", confidence: 0.9 };
  const transcript = await port.endUtterance();
  expect(transcript?.text).toBe("turn left heading two seven zero");
  expect(transcript?.confidence).toBe(0.9);
});

test("missing confidence falls back to 0.8 for non-empty text", async () => {
  const rec = new MockRecognition();
  rec.finalOnStop = { transcript: "ident", confidence: 0 };
  const port = new WebSpeechPort({ recognitionFactory: () => rec });
  port.beginUtterance();
  const transcript = await port.endUtterance();
  expect(transcript?.text).toBe("ident");
  expect(transcript?.confidence).toBe(0.8);
});

test("empty utterance confidence is 0", async () => {
  const rec = new MockRecognition();
  const port = new WebSpeechPort({ recognitionFactory: () => rec });
  port.beginUtterance();
  const transcript = await port.endUtterance();
  expect(transcript?.text).toBe("");
  expect(transcript?.confidence).toBe(0);
});

test("latencyMs is recognition start to result", async () => {
  let now = 100;
  const rec = new MockRecognition();
  rec.finalOnStop = { transcript: "ident", confidence: 0.9 };
  const port = new WebSpeechPort({
    recognitionFactory: () => rec,
    now: () => now,
  });
  port.beginUtterance();
  now = 175;
  const transcript = await port.endUtterance();
  expect(transcript?.latencyMs).toBe(75);
});

test("dispose aborts recognition so the mic indicator can clear", () => {
  const rec = new MockRecognition();
  const port = new WebSpeechPort({ recognitionFactory: () => rec });
  port.beginUtterance();
  expect(rec.started).toBe(true);
  port.dispose();
  expect(rec.aborted).toBe(true);
  expect(rec.started).toBe(false);
});

test("endUtterance returns null when beginUtterance was never called", async () => {
  const rec = new MockRecognition();
  const port = new WebSpeechPort({ recognitionFactory: () => rec });
  await expect(port.endUtterance()).resolves.toBeNull();
  expect(rec.started).toBe(false);
});

test("speakBrowser is a no-op in Node (T03-06 owns playback side effects)", () => {
  expect(speakBrowser("heading two seven zero", "voice")).toBeNull();
});

test("recognition not-allowed rejects with SpeechNotAvailableError", async () => {
  const rec = new MockRecognition();
  const port = new WebSpeechPort({ recognitionFactory: () => rec });
  port.beginUtterance();
  rec.fireError("not-allowed");
  await expect(port.endUtterance()).rejects.toBeInstanceOf(SpeechNotAvailableError);
  await expect(port.transcribe(clip())).rejects.toThrow(/not-allowed/);
});
