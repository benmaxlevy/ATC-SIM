/**
 * Speech settings: PTT bind, speech-api URL status, voiceId, radio FX, Path C.
 * Voice is always HttpSpeechPort against this repo’s speech-api. Persists in the
 * same localStorage profile as the T00-01 disclaimer (`atc-sim.*`).
 */

import { useState } from "react";
import {
  AUTO_TTS_VOICE_ID,
  DEFAULT_PTT_KEY,
  DEFAULT_READBACK_VOICE_ID,
  createBootSpeechPort,
  readSpeechApiUrls,
  type SpeechApiUrlStatus,
  type SpeechPort,
} from "@speech";

export const SPEECH_PREFS_KEY = "atc-sim.speech.prefs";

export const VOICE_DISABLED_HINT = "Voice disabled — use typed commands";

export const PATH_C_LABEL = "Path C (local /parse)";

export const PATH_C_HELP =
  "Default salvage after typed/A/B miss on our speech-api /parse. Not 7110.65-complete NLU. Activates when /health.parse is ready.";

export const PATH_C_UNAVAILABLE_HELP =
  "Path C waits for speech-api /health.parse to be ready. You can turn it off.";

export const DEFAULT_HEALTH_URL = "http://127.0.0.1:8090/health";

export function healthUrlFromStt(sttUrl: string): string {
  try {
    const parsed = new URL(sttUrl);
    parsed.pathname = "/health";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return DEFAULT_HEALTH_URL;
  }
}

export const DEFAULT_BACKEND_HELP =
  "Voice uses our speech-api at 127.0.0.1:8090. Missing STT or TTS URLs disable voice; typed commands still work.";

export const PTT_BIND_HELP =
  "Default PTT is Left Control (hold; works while typing). Or hold the PTT button. Backtick is press/press and is ignored in the command line. Does not steal F, R, or range keys.";

export interface PttBindOption {
  value: string;
  label: string;
}

/** Dropdown only — no F / R / range digits. Default is Left Control, not Caps Lock. */
export const PTT_BIND_OPTIONS: readonly PttBindOption[] = [
  { value: "ControlLeft", label: "Left Control (hold, default)" },
  { value: "Backquote", label: "Backtick ` (press, press again to send)" },
  { value: "CapsLock", label: "Caps Lock" },
  { value: "Tab", label: "Tab" },
  { value: "KeyZ", label: "Z" },
];

export interface SpeechPrefs {
  pttKey: string;
  voiceId: string;
  radioFx: boolean;
  /** User intent. Effective Path C also requires /health.parse === "ready". */
  pathC: boolean;
}

export function defaultSpeechPrefs(): SpeechPrefs {
  return {
    pttKey: DEFAULT_PTT_KEY,
    voiceId: AUTO_TTS_VOICE_ID,
    radioFx: true,
    pathC: true,
  };
}

function profileStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function parsePrefs(raw: string | null): Partial<SpeechPrefs> {
  if (raw === null || raw.trim() === "") {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    return parsed as Partial<SpeechPrefs>;
  } catch {
    return {};
  }
}

export function loadSpeechPrefs(store?: Storage): SpeechPrefs {
  const defaults = defaultSpeechPrefs();
  let saved: Partial<SpeechPrefs> = {};
  try {
    saved = parsePrefs((store ?? profileStorage())?.getItem(SPEECH_PREFS_KEY) ?? null);
  } catch {
    return defaults;
  }
  let pttKey =
    typeof saved.pttKey === "string" && saved.pttKey.length > 0 ? saved.pttKey : defaults.pttKey;
  if (pttKey === "`") {
    // Pre-ControlLeft default. Explicit backtick is stored as `Backquote`.
    pttKey = defaults.pttKey;
  }
  return {
    pttKey,
    voiceId:
      typeof saved.voiceId === "string" && saved.voiceId.trim() !== ""
        ? saved.voiceId === DEFAULT_READBACK_VOICE_ID
          ? AUTO_TTS_VOICE_ID
          : saved.voiceId
        : defaults.voiceId,
    radioFx: typeof saved.radioFx === "boolean" ? saved.radioFx : defaults.radioFx,
    // Existing profiles did not store Path C. Only an explicit false opts out.
    pathC: typeof saved.pathC === "boolean" ? saved.pathC : defaults.pathC,
  };
}

export function saveSpeechPrefs(prefs: SpeechPrefs, store?: Storage): void {
  try {
    (store ?? profileStorage())?.setItem(SPEECH_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Quota / private mode: session-only.
  }
}

export interface SpeechBoot {
  prefs: SpeechPrefs;
  urls: SpeechApiUrlStatus;
  port: SpeechPort;
}

/** Boot helper: never throws on missing URLs. Always speech-api when URLs are set. */
export function loadAndResolveSpeechBoot(
  store?: Storage,
  env?: { VITE_STT_URL?: unknown; VITE_TTS_URL?: unknown },
): SpeechBoot {
  const prefs = loadSpeechPrefs(store);
  const urls = readSpeechApiUrls(env);
  const port = createBootSpeechPort(env);
  return { prefs, urls, port };
}

export interface SpeechSettingsHost {
  setPttKey: (key: string) => void;
  setRadioFx?: (enabled: boolean) => void;
  setPathC?: (enabled: boolean) => void;
}

export interface SpeechSettingsController {
  readonly prefs: SpeechPrefs;
  readonly urls: SpeechApiUrlStatus;
  setPttKey(key: string): void;
  setVoiceId(voiceId: string): void;
  setRadioFx(enabled: boolean): void;
  setPathC(enabled: boolean): boolean;
  refreshParseHealth(): Promise<"off" | "ready">;
  readonly parseReady: boolean;
  readonly pathCActive: boolean;
}

export function createSpeechSettingsController(options: {
  host: SpeechSettingsHost;
  prefs: SpeechPrefs;
  urls?: SpeechApiUrlStatus;
  env?: { VITE_STT_URL?: unknown; VITE_TTS_URL?: unknown };
  storage?: Storage;
  parseReady?: boolean;
  healthUrl?: string;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}): SpeechSettingsController {
  const prefs = options.prefs;
  const urls = options.urls ?? readSpeechApiUrls(options.env);
  const healthUrl =
    options.healthUrl ??
    (urls.sttConfigured && urls.sttUrl ? healthUrlFromStt(urls.sttUrl) : DEFAULT_HEALTH_URL);
  const runFetch = options.fetch;
  let parseReady = options.parseReady === true;

  function persist(): void {
    saveSpeechPrefs(prefs, options.storage);
  }

  function applyPathCToHost(): void {
    options.host.setPathC?.(parseReady && prefs.pathC);
  }

  return {
    get prefs() {
      return prefs;
    },
    get urls() {
      return urls;
    },
    setPttKey(key: string): void {
      if (key.length === 0) {
        return;
      }
      prefs.pttKey = key;
      options.host.setPttKey(key);
      persist();
    },
    setVoiceId(voiceId: string): void {
      const next = voiceId.trim() === "" ? AUTO_TTS_VOICE_ID : voiceId;
      prefs.voiceId = next;
      persist();
    },
    setRadioFx(enabled: boolean): void {
      prefs.radioFx = enabled;
      options.host.setRadioFx?.(enabled);
      persist();
    },
    setPathC(enabled: boolean): boolean {
      prefs.pathC = enabled;
      applyPathCToHost();
      persist();
      return true;
    },
    async refreshParseHealth(): Promise<"off" | "ready"> {
      const fetchFn =
        runFetch ??
        (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
      if (fetchFn === null) {
        parseReady = false;
        applyPathCToHost();
        return "off";
      }
      try {
        const response = await fetchFn(healthUrl, { method: "GET" });
        const body = (await response.json()) as { parse?: unknown };
        parseReady = body.parse === "ready";
      } catch {
        parseReady = false;
      }
      applyPathCToHost();
      return parseReady ? "ready" : "off";
    },
    get parseReady() {
      return parseReady;
    },
    get pathCActive() {
      return parseReady && prefs.pathC;
    },
  };
}

export interface SpeechSettingsPanelProps {
  controller: SpeechSettingsController;
  speechId: string;
  onChange?: () => void;
}

export function SpeechSettingsPanel({ controller, speechId, onChange }: SpeechSettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);

  function refresh(): void {
    setTick((n) => n + 1);
    onChange?.();
  }

  const prefs = controller.prefs;
  const urls = controller.urls;
  const voiceDisabled = speechId === "null";

  return (
    <div className="speech-settings">
      <button
        type="button"
        className="speech-settings-toggle"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const opening = !open;
          setOpen(opening);
          if (opening) {
            void controller.refreshParseHealth().then(() => refresh());
          }
        }}
        aria-expanded={open}
        aria-controls="speech-settings-panel"
      >
        Voice
      </button>
      {open ? (
        <form
          id="speech-settings-panel"
          className="speech-settings-panel"
          onSubmit={(event) => event.preventDefault()}
        >
          <p className="speech-settings-help">{DEFAULT_BACKEND_HELP}</p>
          {voiceDisabled ? <p className="speech-settings-hint">{VOICE_DISABLED_HINT}</p> : null}
          <label className="speech-settings-row">
            <span>PTT</span>
            <select
              value={
                PTT_BIND_OPTIONS.some((option) => option.value === prefs.pttKey)
                  ? prefs.pttKey
                  : "`"
              }
              onChange={(event) => {
                controller.setPttKey(event.target.value);
                refresh();
              }}
              aria-label="PTT key"
            >
              {PTT_BIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="speech-settings-help">{PTT_BIND_HELP}</p>
          <p className="speech-settings-row speech-settings-readonly">
            <span>STT URL</span>
            <span>{urls.sttConfigured ? "configured" : "missing"}</span>
          </p>
          <p className="speech-settings-row speech-settings-readonly">
            <span>TTS URL</span>
            <span>{urls.ttsConfigured ? "configured" : "missing"}</span>
          </p>
          <label className="speech-settings-row">
            <span>TTS voice</span>
            <input
              type="text"
              value={prefs.voiceId}
              placeholder="auto (per callsign)"
              onChange={(event) => {
                controller.setVoiceId(event.target.value);
                refresh();
              }}
              aria-label="TTS voice id"
            />
          </label>
          <label className="speech-settings-row">
            <span>Radio FX</span>
            <input
              type="checkbox"
              checked={prefs.radioFx}
              onChange={(event) => {
                controller.setRadioFx(event.target.checked);
                refresh();
              }}
              aria-label="Radio FX"
            />
          </label>
          <label className="speech-settings-row">
            <span>{PATH_C_LABEL}</span>
            <input
              type="checkbox"
              checked={prefs.pathC}
              onChange={(event) => {
                controller.setPathC(event.target.checked);
                refresh();
              }}
              aria-label={PATH_C_LABEL}
            />
          </label>
          <p className="speech-settings-help">
            {controller.parseReady ? PATH_C_HELP : PATH_C_UNAVAILABLE_HELP}
          </p>
        </form>
      ) : null}
    </div>
  );
}
