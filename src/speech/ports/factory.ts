/**
 * SpeechPort factory and default-backend picker (T03-10).
 *
 * Quality default is `http` → our speech-api when STT+TTS URLs are present
 * (including Vite defaults at 127.0.0.1:8090). `web-speech` is opt-in only
 * and is never auto-selected. Missing/cleared URLs → `null` (typed commands).
 * `whisper-wasm` is omitted until that spike ships.
 */

import { NullSpeechPort } from "../null-speech-port";
import type { SpeechPort } from "../types";
import {
  DEFAULT_STT_URL,
  DEFAULT_TTS_URL,
  HttpSpeechPort,
  type HttpSpeechPortConfig,
} from "./http-speech-port";
import { WebSpeechPort, type WebSpeechPortOptions } from "./web-speech-port";

export type SpeechBackendId = "null" | "web-speech" | "http";

/** Backends the settings dropdown may offer. whisper-wasm is not in the bundle. */
export const SPEECH_BACKEND_IDS: readonly SpeechBackendId[] = ["null", "web-speech", "http"];

export interface CreateSpeechPortDeps {
  http?: HttpSpeechPortConfig;
  webSpeech?: WebSpeechPortOptions;
}

export interface SpeechApiUrlStatus {
  sttUrl: string;
  ttsUrl: string;
  sttConfigured: boolean;
  ttsConfigured: boolean;
}

function optionalEnv(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Unset / null → treat as Vite default (present). Explicit empty string → missing.
 */
export function speechUrlConfigured(raw: string | null | undefined): boolean {
  if (raw === undefined || raw === null) {
    return true;
  }
  return raw.trim() !== "";
}

export function httpUrlsConfigured(opts: {
  sttUrl?: string | null;
  ttsUrl?: string | null;
}): boolean {
  return speechUrlConfigured(opts.sttUrl) && speechUrlConfigured(opts.ttsUrl);
}

/**
 * Default backend for quality. `webSpeech` must not auto-select even if true.
 */
export function pickDefaultBackend(opts: {
  sttUrl?: string | null;
  ttsUrl?: string | null;
  webSpeech?: boolean;
}): "http" | "null" {
  void opts.webSpeech;
  if (httpUrlsConfigured(opts)) {
    return "http";
  }
  return "null";
}

export function readSpeechApiUrls(env?: {
  VITE_STT_URL?: unknown;
  VITE_TTS_URL?: unknown;
}): SpeechApiUrlStatus {
  const src = env ?? import.meta.env;
  const sttRaw = typeof src.VITE_STT_URL === "string" ? src.VITE_STT_URL : undefined;
  const ttsRaw = typeof src.VITE_TTS_URL === "string" ? src.VITE_TTS_URL : undefined;
  const sttConfigured = speechUrlConfigured(sttRaw);
  const ttsConfigured = speechUrlConfigured(ttsRaw);
  return {
    sttUrl: sttConfigured ? (optionalEnv(sttRaw) ?? DEFAULT_STT_URL) : "",
    ttsUrl: ttsConfigured ? (optionalEnv(ttsRaw) ?? DEFAULT_TTS_URL) : "",
    sttConfigured,
    ttsConfigured,
  };
}

export function isSpeechBackendId(id: string): id is SpeechBackendId {
  return id === "null" || id === "web-speech" || id === "http";
}

/**
 * Saved pref wins when it is a known id; `http` still requires URLs.
 * Unknown / whisper-wasm → {@link pickDefaultBackend}.
 */
export function resolveSpeechBackend(
  saved: string | undefined,
  urls: { sttUrl?: string | null; ttsUrl?: string | null },
): SpeechBackendId {
  if (saved === "web-speech") {
    return "web-speech";
  }
  if (saved === "null") {
    return "null";
  }
  if (saved === "http") {
    return pickDefaultBackend(urls);
  }
  return pickDefaultBackend(urls);
}

export function createSpeechPort(id: string, deps: CreateSpeechPortDeps = {}): SpeechPort {
  if (id === "http") {
    return new HttpSpeechPort(deps.http);
  }
  if (id === "web-speech") {
    return new WebSpeechPort(deps.webSpeech);
  }
  return new NullSpeechPort();
}

/**
 * Boot picker. Never throws: missing URLs or a bad constructor → `null`.
 * `web-speech` is only used when `savedBackend` is that opt-in id.
 */
export function createBootSpeechPort(
  savedBackend?: string,
  env?: { VITE_STT_URL?: unknown; VITE_TTS_URL?: unknown },
): SpeechPort {
  try {
    const urls = readSpeechApiUrls(env);
    const id = resolveSpeechBackend(savedBackend, {
      sttUrl: urls.sttConfigured ? urls.sttUrl : "",
      ttsUrl: urls.ttsConfigured ? urls.ttsUrl : "",
    });
    return createSpeechPort(id, {
      http: {
        sttUrl: urls.sttConfigured ? urls.sttUrl : undefined,
        ttsUrl: urls.ttsConfigured ? urls.ttsUrl : undefined,
      },
    });
  } catch {
    return new NullSpeechPort();
  }
}

/** Dispose the live port (abort Web Speech) then construct the next. Caller must be idle. */
export function replaceSpeechPort(
  current: SpeechPort | null | undefined,
  id: string,
  deps: CreateSpeechPortDeps = {},
): SpeechPort {
  try {
    current?.dispose?.();
  } catch {
    // Teardown must never throw through the sim tick.
  }
  return createSpeechPort(id, deps);
}
