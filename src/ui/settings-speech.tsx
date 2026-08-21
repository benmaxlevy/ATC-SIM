/**
 * Speech settings (T03-10): backend switch, PTT bind, confidence, env URL
 * status, voiceId, overlay/FX prefs. Persists in the same localStorage profile
 * as the T00-01 disclaimer (`atc-sim.*`).
 *
 * Does not implement radio-graph.ts (T03-07) or latency overlay pixels (T03-09).
 * Those tickets read the persisted booleans / data attributes.
 */

import { useState } from "react";
import {
  AUTO_TTS_VOICE_ID,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_PTT_KEY,
  DEFAULT_READBACK_VOICE_ID,
  createBootSpeechPort,
  createSpeechPort,
  httpUrlsConfigured,
  readSpeechApiUrls,
  type SpeechApiUrlStatus,
  type SpeechBackendId,
  type SpeechPort,
} from "@speech";

export const SPEECH_PREFS_KEY = "atc-sim.speech.prefs";

export const WEB_SPEECH_VENDOR_WARNING =
  "Browser (may send audio to vendor). Chrome may send audio to the browser vendor. Opt-in only — not the quality default.";

export const VOICE_DISABLED_HINT = "Voice disabled — use typed commands";

export const PATH_C_LABEL = "Path C (local /parse)";

export const PATH_C_HELP =
  "Optional salvage after typed/A/B miss on our speech-api /parse. Not 7110.65-complete NLU. Off until /health.parse is ready.";

export const PATH_C_UNAVAILABLE_HELP =
  "Path C unavailable until speech-api /health.parse is ready. Default off.";

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
  "Default is http (our speech-api at 127.0.0.1:8090) when STT and TTS URLs are set. Web Speech is never auto-selected. Missing URLs use null; typed commands still work.";

export const PTT_BIND_HELP =
  "Default PTT is Left Control (hold; works while typing). Or hold the PTT button. Backtick is press/press and is ignored in the command line. Does not steal F, R, or range keys.";

export const CONFIDENCE_THRESHOLD_HELP =
  "Informational / future use. Changing this does not skip parse. Low STT confidence still compiles.";

export const SPEECH_SETTINGS_WAIT = "wait";

export const HTTP_URLS_MISSING = "http needs STT and TTS URLs";

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
  backendId: SpeechBackendId;
  pttKey: string;
  confidenceThreshold: number;
  voiceId: string;
  latencyOverlay: boolean;
  radioFx: boolean;
  /** User intent. Effective Path C also requires /health.parse === "ready". */
  pathC: boolean;
}

export function defaultSpeechPrefs(): SpeechPrefs {
  return {
    backendId: "http",
    pttKey: DEFAULT_PTT_KEY,
    confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
    voiceId: AUTO_TTS_VOICE_ID,
    latencyOverlay: true,
    radioFx: true,
    pathC: false,
  };
}

function profileStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_CONFIDENCE_THRESHOLD;
  }
  return Math.min(1, Math.max(0, value));
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
  const backendId =
    saved.backendId === "null" || saved.backendId === "web-speech" || saved.backendId === "http"
      ? saved.backendId
      : defaults.backendId;
  return {
    backendId,
    pttKey,
    confidenceThreshold: clampThreshold(
      typeof saved.confidenceThreshold === "number"
        ? saved.confidenceThreshold
        : defaults.confidenceThreshold,
    ),
    voiceId:
      typeof saved.voiceId === "string" && saved.voiceId.trim() !== ""
        ? saved.voiceId === DEFAULT_READBACK_VOICE_ID
          ? AUTO_TTS_VOICE_ID
          : saved.voiceId
        : defaults.voiceId,
    latencyOverlay:
      typeof saved.latencyOverlay === "boolean" ? saved.latencyOverlay : defaults.latencyOverlay,
    radioFx: typeof saved.radioFx === "boolean" ? saved.radioFx : defaults.radioFx,
    pathC: saved.pathC === true,
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

/** Boot helper: never throws on missing URLs. web-speech is not auto-picked. */
export function loadAndResolveSpeechBoot(
  store?: Storage,
  env?: { VITE_STT_URL?: unknown; VITE_TTS_URL?: unknown },
): SpeechBoot {
  const prefs = loadSpeechPrefs(store);
  const urls = readSpeechApiUrls(env);
  const port = createBootSpeechPort(prefs.backendId, env);
  return { prefs, urls, port };
}

export interface SpeechSettingsHost {
  setSpeechPort: (port: SpeechPort) => boolean;
  setPttKey: (key: string) => void;
  setConfidenceThreshold: (value: number) => void;
  isBusy: () => boolean;
  setLatencyOverlayVisible?: (visible: boolean) => void;
  setRadioFx?: (enabled: boolean) => void;
  setPathC?: (enabled: boolean) => void;
}

export interface SpeechSettingsController {
  readonly prefs: SpeechPrefs;
  readonly urls: SpeechApiUrlStatus;
  readonly rowError: string | null;
  setBackend(id: string): boolean;
  setPttKey(key: string): void;
  setConfidenceThreshold(value: number): void;
  setVoiceId(voiceId: string): void;
  setLatencyOverlay(enabled: boolean): void;
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
  createPort?: typeof createSpeechPort;
  parseReady?: boolean;
  healthUrl?: string;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}): SpeechSettingsController {
  const prefs = options.prefs;
  const urls = options.urls ?? readSpeechApiUrls(options.env);
  const createPort = options.createPort ?? createSpeechPort;
  const healthUrl =
    options.healthUrl ??
    (urls.sttConfigured && urls.sttUrl ? healthUrlFromStt(urls.sttUrl) : DEFAULT_HEALTH_URL);
  const runFetch = options.fetch;
  let rowError: string | null = null;
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
    get rowError() {
      return rowError;
    },
    setBackend(id: string): boolean {
      rowError = null;
      if (id !== "null" && id !== "web-speech" && id !== "http") {
        rowError = HTTP_URLS_MISSING;
        return false;
      }
      if (options.host.isBusy()) {
        rowError = SPEECH_SETTINGS_WAIT;
        return false;
      }
      if (
        id === "http" &&
        !httpUrlsConfigured({
          sttUrl: urls.sttConfigured ? urls.sttUrl : "",
          ttsUrl: urls.ttsConfigured ? urls.ttsUrl : "",
        })
      ) {
        rowError = HTTP_URLS_MISSING;
        return false;
      }
      const next = createPort(id, {
        http: {
          sttUrl: urls.sttConfigured ? urls.sttUrl : undefined,
          ttsUrl: urls.ttsConfigured ? urls.ttsUrl : undefined,
        },
      });
      if (!options.host.setSpeechPort(next)) {
        try {
          next.dispose?.();
        } catch {
          // never through the tick
        }
        rowError = SPEECH_SETTINGS_WAIT;
        return false;
      }
      prefs.backendId = id;
      persist();
      return true;
    },
    setPttKey(key: string): void {
      if (key.length === 0) {
        return;
      }
      prefs.pttKey = key;
      options.host.setPttKey(key);
      persist();
    },
    setConfidenceThreshold(value: number): void {
      const next = clampThreshold(value);
      prefs.confidenceThreshold = next;
      // T03-15: prefs only. Host setter must not restore a parse skip.
      options.host.setConfidenceThreshold(next);
      persist();
    },
    setVoiceId(voiceId: string): void {
      const next = voiceId.trim() === "" ? AUTO_TTS_VOICE_ID : voiceId;
      prefs.voiceId = next;
      persist();
    },
    setLatencyOverlay(enabled: boolean): void {
      prefs.latencyOverlay = enabled;
      options.host.setLatencyOverlayVisible?.(enabled);
      persist();
    },
    setRadioFx(enabled: boolean): void {
      prefs.radioFx = enabled;
      options.host.setRadioFx?.(enabled);
      persist();
    },
    setPathC(enabled: boolean): boolean {
      if (enabled && !parseReady) {
        return false;
      }
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
  const backendError = controller.rowError;
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
          <label className="speech-settings-row">
            <span>Backend</span>
            <select
              value={speechId}
              onChange={(event) => {
                controller.setBackend(event.target.value);
                refresh();
              }}
              aria-label="Speech backend"
            >
              <option value="null">null (typed only)</option>
              <option value="web-speech">web-speech</option>
              <option value="http">http (speech-api)</option>
            </select>
          </label>
          <p className="speech-settings-warn">{WEB_SPEECH_VENDOR_WARNING}</p>
          {voiceDisabled ? <p className="speech-settings-hint">{VOICE_DISABLED_HINT}</p> : null}
          {backendError ? (
            <p className="speech-settings-error" role="status">
              {backendError}
            </p>
          ) : null}
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
          <label className="speech-settings-row">
            <span>Confidence</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={prefs.confidenceThreshold}
              onChange={(event) => {
                controller.setConfidenceThreshold(Number(event.target.value));
                refresh();
              }}
              aria-label="Confidence threshold"
            />
          </label>
          <p className="speech-settings-help">{CONFIDENCE_THRESHOLD_HELP}</p>
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
            <span>Latency overlay</span>
            <input
              type="checkbox"
              checked={prefs.latencyOverlay}
              onChange={(event) => {
                controller.setLatencyOverlay(event.target.checked);
                refresh();
              }}
              aria-label="Latency overlay"
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
              checked={controller.parseReady && prefs.pathC}
              disabled={!controller.parseReady}
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
