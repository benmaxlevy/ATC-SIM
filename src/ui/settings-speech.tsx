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

export const DEFAULT_BACKEND_HELP =
  "Default is http (our speech-api at 127.0.0.1:8090) when STT and TTS URLs are set. Web Speech is never auto-selected. Missing URLs use null; typed commands still work.";

export const PTT_BIND_HELP =
  "Backtick is press to talk, press again to send (Windows treats ` as a dead key, so holding it cannot work). Left Control / Z are hold-to-talk. Ignored while a text field is focused. Does not steal F, R, or range keys.";

export const SPEECH_SETTINGS_WAIT = "wait";

export const HTTP_URLS_MISSING = "http needs STT and TTS URLs";

export interface PttBindOption {
  value: string;
  label: string;
}

/** Dropdown only — no F / R / range digits. Default is backtick, not Caps Lock. */
export const PTT_BIND_OPTIONS: readonly PttBindOption[] = [
  { value: "`", label: "Backtick ` (press, press again to send)" },
  { value: "CapsLock", label: "Caps Lock" },
  { value: "Tab", label: "Tab" },
  { value: "ControlLeft", label: "Left Control" },
  { value: "KeyZ", label: "Z" },
];

export interface SpeechPrefs {
  backendId: SpeechBackendId;
  pttKey: string;
  confidenceThreshold: number;
  voiceId: string;
  latencyOverlay: boolean;
  radioFx: boolean;
}

export function defaultSpeechPrefs(): SpeechPrefs {
  return {
    backendId: "http",
    pttKey: DEFAULT_PTT_KEY,
    confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
    voiceId: AUTO_TTS_VOICE_ID,
    latencyOverlay: true,
    radioFx: true,
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
  const pttKey =
    typeof saved.pttKey === "string" && saved.pttKey.length > 0 ? saved.pttKey : defaults.pttKey;
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
}

export function createSpeechSettingsController(options: {
  host: SpeechSettingsHost;
  prefs: SpeechPrefs;
  urls?: SpeechApiUrlStatus;
  env?: { VITE_STT_URL?: unknown; VITE_TTS_URL?: unknown };
  storage?: Storage;
  createPort?: typeof createSpeechPort;
}): SpeechSettingsController {
  const prefs = options.prefs;
  const urls = options.urls ?? readSpeechApiUrls(options.env);
  const createPort = options.createPort ?? createSpeechPort;
  let rowError: string | null = null;

  function persist(): void {
    saveSpeechPrefs(prefs, options.storage);
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
        onClick={() => setOpen((value) => !value)}
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
        </form>
      ) : null}
    </div>
  );
}
