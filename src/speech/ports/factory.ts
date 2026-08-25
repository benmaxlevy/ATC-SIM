/**
 * SpeechPort factory. Quality path is `http` → our speech-api when STT+TTS
 * URLs are present (including Vite defaults at 127.0.0.1:8090). Missing or
 * cleared URLs → `null` (typed commands). Browser Web Speech is not a backend.
 */

import { NullSpeechPort } from "../null-speech-port";
import type { SpeechPort } from "../types";
import {
  DEFAULT_STT_URL,
  DEFAULT_TTS_URL,
  HttpSpeechPort,
  type HttpSpeechPortConfig,
} from "./http-speech-port";

export type SpeechBackendId = "null" | "http";

export const SPEECH_BACKEND_IDS: readonly SpeechBackendId[] = ["null", "http"];

export interface CreateSpeechPortDeps {
  http?: HttpSpeechPortConfig;
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

/** Default backend: speech-api when URLs exist, else typed-only null. */
export function pickDefaultBackend(opts: {
  sttUrl?: string | null;
  ttsUrl?: string | null;
}): SpeechBackendId {
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

/** Saved pref is ignored. Voice is http when URLs exist, else null. */
export function resolveSpeechBackend(
  _saved: string | undefined,
  urls: { sttUrl?: string | null; ttsUrl?: string | null },
): SpeechBackendId {
  return pickDefaultBackend(urls);
}

export function createSpeechPort(id: string, deps: CreateSpeechPortDeps = {}): SpeechPort {
  if (id === "http") {
    return new HttpSpeechPort(deps.http);
  }
  return new NullSpeechPort();
}

/**
 * Boot picker. Never throws: missing URLs or a bad constructor → `null`.
 */
export function createBootSpeechPort(env?: {
  VITE_STT_URL?: unknown;
  VITE_TTS_URL?: unknown;
}): SpeechPort {
  try {
    const urls = readSpeechApiUrls(env);
    const id = pickDefaultBackend({
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

/** Dispose the live port then construct the next. Caller must be idle. */
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
