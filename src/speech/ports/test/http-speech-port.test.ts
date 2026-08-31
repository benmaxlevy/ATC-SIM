import { afterEach, expect, test, vi } from "vitest";
import { SpeechPortError, type AudioClip } from "../..";
import { DEFAULT_STT_URL, DEFAULT_TTS_URL, HttpSpeechPort } from "../http-speech-port";
import { pcm16ToWav, uint8ToArrayBuffer } from "../wav";

const SECRET = "local-speech-secret-do-not-leak";

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function smallClip(): AudioClip {
  return {
    sampleRate: 16000,
    channels: 1,
    pcm16: new Int16Array([0, 1, -1, 32, -32]),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function abortError(): Error {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  return err;
}

function hangingFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) {
      return;
    }
    const onAbort = (): void => reject(abortError());
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function riffPrefix(body: BodyInit | null | undefined): string {
  if (body instanceof ArrayBuffer) {
    return String.fromCharCode(...new Uint8Array(body).subarray(0, 4));
  }
  if (body instanceof Uint8Array) {
    return String.fromCharCode(...body.subarray(0, 4));
  }
  return "";
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("AC1 AC6 — happy STT JSON fills Transcript and id is http", async () => {
  const fetchMock: TestFetch = async (url, init) => {
    expect(String(url)).toBe(DEFAULT_STT_URL);
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("audio/wav");
    expect(riffPrefix(init?.body)).toBe("RIFF");
    return jsonResponse({
      text: "turn left heading two seven zero",
      confidence: 0.92,
    });
  };
  const port = new HttpSpeechPort({ fetch: fetchMock });
  const transcript = await port.transcribe(smallClip());
  expect(port.id).toBe("http");
  expect(transcript.text).toBe("turn left heading two seven zero");
  expect(transcript.confidence).toBe(0.92);
  expect(transcript.latencyMs).toBeGreaterThanOrEqual(0);
});

test("STT sanitizes a tiny explicit X-ATC-Fixes prior (not a registry dump)", async () => {
  const fetchMock: TestFetch = async (_url, init) => {
    const headers = new Headers(init?.headers);
    expect(headers.get("X-ATC-Fixes")).toBe("SEMAX,NEMAX,MERGE");
    expect(headers.get("Content-Type")).toBe("audio/wav");
    return jsonResponse({ text: "proceed direct SEMAX", confidence: 0.9 });
  };
  const port = new HttpSpeechPort({ fetch: fetchMock });
  const transcript = await port.transcribe(smallClip(), {
    fixes: ["semax", "NEMAX", "MERGE", "nope!"],
  });
  expect(transcript.text).toBe("proceed direct SEMAX");
});

test("T03-19 AC1 — 80 file-order ids do not dump first 64 as X-ATC-Fixes", async () => {
  const ids = Array.from({ length: 80 }, (_, i) => `FX${String(i).padStart(2, "0")}`);
  const dump64 = ids.slice(0, 64).join(",");
  let sentFixes: string | null = "unset";
  const fetchMock: TestFetch = async (_url, init) => {
    sentFixes = new Headers(init?.headers).get("X-ATC-Fixes");
    return jsonResponse({ text: "ident", confidence: 1 });
  };
  const port = new HttpSpeechPort({ fetch: fetchMock });
  await port.transcribe(smallClip(), { fixes: ids });
  if (sentFixes !== null) {
    const sent = sentFixes.split(",").filter((id) => id.length > 0);
    expect(sent.length).toBeLessThanOrEqual(16);
    expect(sentFixes).not.toBe(dump64);
  }
});

test("T03-19 AC2 — STT still sends STAR and SID names as X-ATC-Procedures", async () => {
  const fetchMock: TestFetch = async (_url, init) => {
    const headers = new Headers(init?.headers);
    expect(headers.get("X-ATC-Procedures")).toBe("DEM1=DEMO ONE|BAY1=BAY ONE");
    return jsonResponse({ text: "climb via the BAY ONE departure", confidence: 0.9 });
  };
  const port = new HttpSpeechPort({ fetch: fetchMock });
  const transcript = await port.transcribe(smallClip(), {
    procedures: [
      { id: "dem1", name: "DEMO ONE" },
      { id: "bay1", name: "BAY ONE" },
    ],
  });
  expect(transcript.text).toBe("climb via the BAY ONE departure");
});

test("AC2 — missing confidence defaults to 1.0", async () => {
  const port = new HttpSpeechPort({
    fetch: async () => jsonResponse({ text: "ident" }),
  });
  const transcript = await port.transcribe(smallClip());
  expect(transcript.confidence).toBe(1.0);
  expect(transcript.text).toBe("ident");
});

test("AC3 — synthesize returns mono PCM from a WAV body", async () => {
  const samples = new Int16Array([100, -100, 200, -200]);
  const wav = pcm16ToWav({ sampleRate: 22050, channels: 1, pcm16: samples });
  const fetchMock: TestFetch = async (url, init) => {
    expect(String(url)).toBe(DEFAULT_TTS_URL);
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "heading two seven zero",
      voiceId: "en_US-lessac-medium",
    });
    return new Response(uint8ToArrayBuffer(wav), {
      status: 200,
      headers: { "Content-Type": "audio/wav" },
    });
  };
  const port = new HttpSpeechPort({ fetch: fetchMock });
  const clip = await port.synthesize("heading two seven zero", "en_US-lessac-medium");
  expect(clip.channels).toBe(1);
  expect(clip.sampleRate).toBe(22050);
  expect(clip.pcm16.length).toBeGreaterThan(0);
  expect(Array.from(clip.pcm16)).toEqual(Array.from(samples));
});

test("AC4 — STT HTTP 500 rejects with SpeechPortError", async () => {
  const port = new HttpSpeechPort({
    fetch: async () => new Response("nope", { status: 500 }),
  });
  const pending = port.transcribe(smallClip());
  await expect(pending).rejects.toBeInstanceOf(SpeechPortError);
  await expect(pending).rejects.toMatchObject({ kind: "http", status: 500 });
});

test("AC5 — Authorization values are not in errors or happy-path console", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});

  let sentAuth: string | null = null;
  const happyPort = new HttpSpeechPort({
    authorization: `Bearer ${SECRET}`,
    fetch: async (_input, init) => {
      sentAuth = new Headers(init?.headers).get("Authorization");
      return jsonResponse({ text: "ident", confidence: 1 });
    },
  });
  const transcript = await happyPort.transcribe(smallClip());
  expect(transcript.text).toBe("ident");
  expect(sentAuth).toBe(`Bearer ${SECRET}`);
  const happyConsole = [
    ...log.mock.calls,
    ...info.mock.calls,
    ...warn.mock.calls,
    ...debug.mock.calls,
  ]
    .flat()
    .map(String)
    .join(" ");
  expect(happyConsole).not.toContain(SECRET);

  const failPort = new HttpSpeechPort({
    authorization: `Bearer ${SECRET}`,
    fetch: async () => new Response("nope", { status: 500 }),
  });
  try {
    await failPort.transcribe(smallClip());
    expect.unreachable("expected STT 500");
  } catch (err) {
    expect(err).toBeInstanceOf(SpeechPortError);
    expect(String(err)).not.toContain(SECRET);
    expect(JSON.stringify(err)).not.toContain(SECRET);
  }
  const failConsole = [
    ...log.mock.calls,
    ...info.mock.calls,
    ...warn.mock.calls,
    ...debug.mock.calls,
    ...error.mock.calls,
  ]
    .flat()
    .map(String)
    .join(" ");
  expect(failConsole).not.toContain(SECRET);
});

test("AC7 — default STT/TTS URLs target our speech-api on 127.0.0.1:8090", () => {
  expect(DEFAULT_STT_URL).toBe("http://127.0.0.1:8090/stt");
  expect(DEFAULT_TTS_URL).toBe("http://127.0.0.1:8090/tts");
  const port = new HttpSpeechPort({ fetch: async () => new Response() });
  expect(port.sttUrl).toBe("http://127.0.0.1:8090/stt");
  expect(port.ttsUrl).toBe("http://127.0.0.1:8090/tts");
});

test("AC8 — client module does not import or fetch vendor speech APIs", async () => {
  const sources = import.meta.glob("../*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["../http-speech-port.ts"];
  expect(src).toBeDefined();
  expect(src).not.toMatch(/openai/i);
  expect(src).not.toMatch(/deepgram/i);
  expect(src).not.toMatch(/groq/i);
  expect(src).not.toMatch(/elevenlabs/i);
  expect(src).not.toMatch(/api-inference\.huggingface\.co/i);
});

test("STT timeout abort rejects with SpeechPortError timeout", async () => {
  const port = new HttpSpeechPort({ fetch: hangingFetch, sttTimeoutMs: 20 });
  await expect(port.transcribe(smallClip())).rejects.toMatchObject({
    name: "SpeechPortError",
    kind: "timeout",
  });
});

test("in-flight transcribe is rejected without a second fetch", async () => {
  let release!: (value: Response) => void;
  let fetchCount = 0;
  const fetchMock: TestFetch = () => {
    fetchCount += 1;
    return new Promise<Response>((resolve) => {
      release = resolve;
    });
  };
  const port = new HttpSpeechPort({ fetch: fetchMock });
  const first = port.transcribe(smallClip());
  const second = port.transcribe(smallClip());
  await expect(second).rejects.toMatchObject({ kind: "in_flight" });
  expect(fetchCount).toBe(1);
  release(jsonResponse({ text: "ok", confidence: 1 }));
  await expect(first).resolves.toMatchObject({ text: "ok" });
});

test("empty STT body rejects with SpeechPortError", async () => {
  const port = new HttpSpeechPort({
    fetch: async () => new Response("", { status: 200 }),
  });
  await expect(port.transcribe(smallClip())).rejects.toMatchObject({ kind: "empty" });
});

test("network failure rejects with SpeechPortError network", async () => {
  const port = new HttpSpeechPort({
    fetch: async () => {
      throw new TypeError("fetch failed");
    },
  });
  await expect(port.transcribe(smallClip())).rejects.toMatchObject({ kind: "network" });
});
