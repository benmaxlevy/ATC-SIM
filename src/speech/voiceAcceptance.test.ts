/**
 * T03-12: confirm the two JO 7110.65-shaped spoken fixtures (R01) still compile
 * through parseCommand in the default `npm test` glob. No live mic. Speech-api
 * p50 is ACCEPTANCE.md only — do not invent a 1.5 s number here.
 */
import { expect, test, vi } from "vitest";
import { parseCommand } from "@parse";
import { DEFAULT_PTT_KEY, createSpeechPort, pickDefaultBackend } from "@speech";
import { DEFAULT_STT_URL, DEFAULT_TTS_URL } from "./ports/http-speech-port";

test("AC2 / AC6 — descend and maintain three thousand is DAL123 ALTITUDE DESCEND 3000 (R01)", async () => {
  const result = await parseCommand("Delta one two three descend and maintain three thousand", {
    source: "voice",
    pathC: false,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("DAL123");
  expect(result.source).toBe("voice");
  expect(result.parseStage).toBe("spoken_a");
  expect(result.instructions).toEqual([{ type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }]);
});

test("AC2 / AC6 — turn left heading two seven zero uses selection (R01)", async () => {
  const result = await parseCommand("turn left heading two seven zero", {
    source: "voice",
    selectedCallsign: "DAL123",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("DAL123");
  expect(result.source).toBe("voice");
  expect(result.parseStage).toBe("spoken_a");
  expect(result.instructions).toEqual([{ type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }]);
});

test("combined §4.3 utterance still parses heading then altitude", async () => {
  const result = await parseCommand(
    "Delta one two three turn left heading two seven zero descend and maintain three thousand",
    { source: "voice" },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.callsignToken).toBe("DAL123");
  expect(result.instructions).toEqual([
    { type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" },
    { type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" },
  ]);
});

test("E13 — typed H270 stays typed; English in the box is Path A", async () => {
  const token = await parseCommand("H270", { source: "text" });
  expect(token.ok).toBe(true);
  if (token.ok) {
    expect(token.parseStage).toBe("typed");
    expect(token.source).toBe("text");
  }
  const english = await parseCommand("turn left heading two seven zero", {
    source: "text",
    selectedCallsign: "DAL123",
  });
  expect(english.ok).toBe(true);
  if (english.ok) {
    expect(english.parseStage).toBe("spoken_a");
    expect(english.source).toBe("text");
  }
});

test("E9 / E11 — quality default is http; web-speech is never auto-selected", () => {
  expect(pickDefaultBackend({})).toBe("http");
  expect(pickDefaultBackend({ sttUrl: DEFAULT_STT_URL, ttsUrl: DEFAULT_TTS_URL })).toBe("http");
  expect(pickDefaultBackend({ webSpeech: true })).toBe("http");
  expect(createSpeechPort("http").id).toBe("http");
});

test("E12 — whisper-wasm absent maps to null (not a fail)", () => {
  expect(createSpeechPort("whisper-wasm").id).toBe("null");
});

test("E14 — Path C off does not fetch; PTT default is backtick", async () => {
  expect(DEFAULT_PTT_KEY).toBe("`");
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  await parseCommand("pizza the runway", { source: "voice", pathC: false });
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

test("E14 — http adapter source does not call vendor STT/TTS", async () => {
  const sources = import.meta.glob("./ports/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./ports/http-speech-port.ts"];
  expect(src).toBeDefined();
  expect(src).toContain("127.0.0.1:8090");
  expect(src).not.toMatch(/openai|deepgram|groq|elevenlabs|api-inference\.huggingface\.co/i);
});
