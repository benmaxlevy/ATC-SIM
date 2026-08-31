import { expect, test, vi } from "vitest";
import { NullSpeechPort, type SpeechPort } from "../..";
import {
  createBootSpeechPort,
  createSpeechPort,
  httpUrlsConfigured,
  pickDefaultBackend,
  replaceSpeechPort,
  resolveSpeechBackend,
} from "../../ports/factory";
import { DEFAULT_STT_URL, DEFAULT_TTS_URL } from "../../ports/http-speech-port";

const DEFAULT_URLS = { sttUrl: DEFAULT_STT_URL, ttsUrl: DEFAULT_TTS_URL };

test("URLs present including 127.0.0.1:8090 defaults pick http", () => {
  expect(pickDefaultBackend(DEFAULT_URLS)).toBe("http");
  expect(pickDefaultBackend({})).toBe("http");
  expect(pickDefaultBackend({ sttUrl: undefined, ttsUrl: undefined })).toBe("http");
});

test("URLs explicitly cleared pick null", () => {
  expect(pickDefaultBackend({ sttUrl: "", ttsUrl: "" })).toBe("null");
  expect(pickDefaultBackend({ sttUrl: "  ", ttsUrl: DEFAULT_TTS_URL })).toBe("null");
  expect(pickDefaultBackend({ sttUrl: DEFAULT_STT_URL, ttsUrl: "" })).toBe("null");
});

test("httpUrlsConfigured treats unset as defaults and empty as missing", () => {
  expect(httpUrlsConfigured({})).toBe(true);
  expect(httpUrlsConfigured({ sttUrl: "", ttsUrl: "" })).toBe(false);
});

test("factory returns http or null; unknown ids become null", () => {
  expect(createSpeechPort("http").id).toBe("http");
  expect(createSpeechPort("null").id).toBe("null");
  expect(createSpeechPort("web-speech").id).toBe("null");
  expect(createSpeechPort("whisper-wasm").id).toBe("null");
  expect(createSpeechPort("openai").id).toBe("null");
});

test("resolveSpeechBackend ignores a saved pref and follows URLs", () => {
  expect(resolveSpeechBackend("web-speech", { sttUrl: "", ttsUrl: "" })).toBe("null");
  expect(resolveSpeechBackend("null", DEFAULT_URLS)).toBe("http");
  expect(resolveSpeechBackend("http", DEFAULT_URLS)).toBe("http");
  expect(resolveSpeechBackend("http", { sttUrl: "", ttsUrl: "" })).toBe("null");
  expect(resolveSpeechBackend(undefined, DEFAULT_URLS)).toBe("http");
});

test("replaceSpeechPort disposes the previous port then returns the new id", () => {
  const dispose = vi.fn();
  const current: SpeechPort = {
    id: "http",
    transcribe: () => Promise.reject(new Error("unused")),
    synthesize: () => Promise.reject(new Error("unused")),
    dispose,
  };
  const next = replaceSpeechPort(current, "http");
  expect(dispose).toHaveBeenCalledOnce();
  expect(next.id).toBe("http");
});

test("createBootSpeechPort never throws; cleared URLs → null; defaults → http", () => {
  expect(createBootSpeechPort({}).id).toBe("http");
  expect(createBootSpeechPort({ VITE_STT_URL: "", VITE_TTS_URL: "" }).id).toBe("null");
  expect(createBootSpeechPort({ VITE_STT_URL: "", VITE_TTS_URL: "" }).id).toBe("null");
});

test("replaceSpeechPort from NullSpeechPort does not throw", () => {
  const next = replaceSpeechPort(new NullSpeechPort(), "null");
  expect(next.id).toBe("null");
});
