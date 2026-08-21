/**
 * T03-12: confirm the two JO 7110.65-shaped spoken fixtures (R01) still compile
 * through parseCommand in the default `npm test` glob. Also re-assert typed
 * DAL123 H270, Path A English in the command line, mocked http STT/TTS, and
 * no throw through the voice tick. No live mic. Speech-api p50 is ACCEPTANCE.md
 * only — do not invent a 1.5 s number here.
 */
import { expect, test, vi } from "vitest";
import { SessionLog } from "@core";
import { parseCommand } from "@parse";
import { createWorldFromScenario, loadKdem } from "@scenario";
import {
  DEFAULT_PTT_KEY,
  HttpSpeechPort,
  NullSpeechPort,
  RADIO_HIGHPASS_HZ,
  RADIO_LOWPASS_HZ,
  RADIO_NOISE_GAIN,
  createPttCaptureController,
  createSpeechPort,
  percentile50,
  pickDefaultBackend,
  type AudioClip,
  type SpeechPort,
  type Transcript,
} from "@speech";
import { createApp } from "../app/create-app";
import { submitCommand } from "../ui/submitCommand";
import { DEFAULT_STT_URL, DEFAULT_TTS_URL } from "./ports/http-speech-port";
import { pcm16ToWav, uint8ToArrayBuffer } from "./ports/wav";

function smallClip(): AudioClip {
  return { sampleRate: 16000, channels: 1, pcm16: new Int16Array([0, 1, -1, 32, -32]) };
}

function fakePort(text: string): SpeechPort {
  return {
    id: "fake",
    async transcribe(): Promise<Transcript> {
      return { text, confidence: 1, latencyMs: 3 };
    },
    async synthesize(): Promise<AudioClip> {
      return { sampleRate: 16000, channels: 1, pcm16: new Int16Array(1600) };
    },
  };
}

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

test("E13 — typed DAL123 H270 still assigns heading 270 with source text", async () => {
  const world = createWorldFromScenario(loadKdem());
  const result = await submitCommand(world, "DAL123 H270", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(result.command?.source).toBe("text");
  expect(result.command?.parseStage).toBe("typed");
  expect(world.aircraft.find((ac) => ac.callsign === "DAL123")?.intent.assignedHeadingDeg).toBe(
    270,
  );
});

test("typed accepted readback uses the same TTS player as PTT", async () => {
  const world = createWorldFromScenario(loadKdem());
  const synth = vi.fn(async (): Promise<AudioClip> => {
    return { sampleRate: 16000, channels: 1, pcm16: new Int16Array(1600) };
  });
  const handles = createApp({
    speech: {
      id: "fake",
      async transcribe(): Promise<Transcript> {
        return { text: "unused", confidence: 1, latencyMs: 1 };
      },
      synthesize: synth,
    },
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
    readbackPlayer: {
      playing: false,
      async warmUp() {},
      async playPcm() {
        return { ok: true };
      },
      async playBrowser() {
        return { ok: true };
      },
      stop() {},
      fxEnabled: true,
      setConnectSource() {},
      setFxEnabled() {},
    },
  });
  const result = await submitCommand(world, "DAL123 H270", new SessionLog());
  expect(result.accepted).toBe(true);
  await handles.voiceLoop.playReadback(result.readback);
  expect(synth).toHaveBeenCalledTimes(1);
  expect(String(synth.mock.calls[0]?.[0] ?? "").toLowerCase()).toContain("heading two seven zero");
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("E13 — Path A English in the command line turns left 270", async () => {
  const world = createWorldFromScenario(loadKdem());
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  world.selectedAircraftId = dal.id;
  const result = await submitCommand(world, "turn left heading two seven zero", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(result.command?.source).toBe("text");
  expect(result.command?.parseStage).toBe("spoken_a");
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(dal.intent.turn).toBe("LEFT");
});

test("E3 — fake-port voice loop sets source voice and turns left 270", async () => {
  const world = createWorldFromScenario(loadKdem());
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  world.selectedAircraftId = dal.id;
  const handles = createApp({
    speech: fakePort("turn left heading two seven zero"),
    world,
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
  });
  await handles.voiceLoop.handlePttEvent({
    type: "ptt-up",
    result: { kind: "clip", clip: smallClip() },
  });
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(dal.intent.turn).toBe("LEFT");
  const accepted = handles.log.byType("command.accepted");
  expect(accepted).toHaveLength(1);
  expect(accepted[0]?.command.source).toBe("voice");
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("E4 — mocked http STT and TTS stay on our speech-api URLs", async () => {
  const samples = new Int16Array([100, -100]);
  const wav = pcm16ToWav({ sampleRate: 16000, channels: 1, pcm16: samples });
  const fetchMock = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = String(url);
    if (href === DEFAULT_STT_URL) {
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({ text: "turn left heading two seven zero", confidence: 0.92 }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    expect(href).toBe(DEFAULT_TTS_URL);
    return new Response(uint8ToArrayBuffer(wav), {
      status: 200,
      headers: { "Content-Type": "audio/wav" },
    });
  };
  const port = new HttpSpeechPort({ fetch: fetchMock });
  const transcript = await port.transcribe(smallClip());
  expect(port.id).toBe("http");
  expect(transcript.text).toBe("turn left heading two seven zero");
  const clip = await port.synthesize("heading two seven zero", "en_US-lessac-medium");
  expect(clip.channels).toBe(1);
  expect(Array.from(clip.pcm16)).toEqual(Array.from(samples));
});

test("E7 — NullSpeechPort and mic deny do not throw through the voice tick", async () => {
  const handles = createApp({
    speech: new NullSpeechPort(),
    ptt: createPttCaptureController({ onEvent: () => {}, attachTo: null }),
  });
  await expect(
    handles.voiceLoop.handlePttEvent({
      type: "ptt-up",
      result: { kind: "clip", clip: smallClip() },
    }),
  ).resolves.toBeUndefined();
  await expect(
    handles.voiceLoop.handlePttEvent({ type: "permission-denied" }),
  ).resolves.toBeUndefined();
  expect(handles.log.byType("command.accepted")).toHaveLength(0);
  handles.ptt.dispose();
  handles.voiceLoop.dispose();
});

test("E6 / E8 — radio FX band-limit + noise constants; p50 helper is honest on empty", () => {
  expect(RADIO_HIGHPASS_HZ).toBe(300);
  expect(RADIO_LOWPASS_HZ).toBe(3000);
  expect(RADIO_NOISE_GAIN).toBeGreaterThanOrEqual(0.02);
  expect(RADIO_NOISE_GAIN).toBeLessThanOrEqual(0.05);
  expect(percentile50([])).toBeNull();
  expect(percentile50([1500, 900, 1200])).toBe(1200);
});
