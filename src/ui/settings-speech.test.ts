import { expect, test, vi } from "vitest";
import { type SpeechPort } from "@speech";
import {
  CONFIDENCE_THRESHOLD_HELP,
  DEFAULT_BACKEND_HELP,
  HTTP_URLS_MISSING,
  PTT_BIND_HELP,
  PTT_BIND_OPTIONS,
  PATH_C_HELP,
  PATH_C_LABEL,
  PATH_C_UNAVAILABLE_HELP,
  SPEECH_PREFS_KEY,
  SPEECH_SETTINGS_WAIT,
  VOICE_DISABLED_HINT,
  WEB_SPEECH_VENDOR_WARNING,
  createSpeechSettingsController,
  loadAndResolveSpeechBoot,
  loadSpeechPrefs,
  saveSpeechPrefs,
  defaultSpeechPrefs,
} from "./settings-speech";

function memoryStorage(): Storage {
  const mem = new Map<string, string>();
  return {
    get length() {
      return mem.size;
    },
    clear() {
      mem.clear();
    },
    getItem(key) {
      return mem.get(key) ?? null;
    },
    key(index) {
      return [...mem.keys()][index] ?? null;
    },
    removeItem(key) {
      mem.delete(key);
    },
    setItem(key, value) {
      mem.set(key, value);
    },
  };
}

function fakePort(id: string): SpeechPort {
  return {
    id,
    transcribe: () => Promise.reject(new Error("unused")),
    synthesize: () => Promise.reject(new Error("unused")),
    dispose: vi.fn(),
  };
}

test("AC6 / default-backend helper: URLs present → http; cleared → null; webSpeech ignored", () => {
  const present = loadAndResolveSpeechBoot(memoryStorage(), {
    VITE_STT_URL: "http://127.0.0.1:8090/stt",
    VITE_TTS_URL: "http://127.0.0.1:8090/tts",
  });
  expect(present.port.id).toBe("http");

  const cleared = loadAndResolveSpeechBoot(memoryStorage(), {
    VITE_STT_URL: "",
    VITE_TTS_URL: "",
  });
  expect(cleared.port.id).toBe("null");
  expect(cleared.urls.sttConfigured).toBe(false);
  expect(cleared.urls.ttsConfigured).toBe(false);
});

test("unset Vite URLs still boot http via 127.0.0.1:8090 defaults (AC1)", () => {
  const boot = loadAndResolveSpeechBoot(memoryStorage(), {});
  expect(boot.port.id).toBe("http");
  expect(boot.urls.sttConfigured).toBe(true);
  expect(boot.urls.ttsConfigured).toBe(true);
});

test("persisted web-speech is restored even when URLs are present (opt-in, not default)", () => {
  const store = memoryStorage();
  const prefs = defaultSpeechPrefs();
  prefs.backendId = "web-speech";
  saveSpeechPrefs(prefs, store);
  const boot = loadAndResolveSpeechBoot(store, {
    VITE_STT_URL: "http://127.0.0.1:8090/stt",
    VITE_TTS_URL: "http://127.0.0.1:8090/tts",
  });
  expect(boot.port.id).toBe("web-speech");
});

test("prefs persist in the same atc-sim.* profile storage as phase 0", () => {
  const store = memoryStorage();
  const prefs = defaultSpeechPrefs();
  prefs.pttKey = "CapsLock";
  prefs.confidenceThreshold = 0.7;
  prefs.latencyOverlay = false;
  prefs.radioFx = false;
  saveSpeechPrefs(prefs, store);
  expect(store.getItem(SPEECH_PREFS_KEY)).toContain("CapsLock");
  const loaded = loadSpeechPrefs(store);
  expect(loaded.pttKey).toBe("CapsLock");
  expect(loaded.confidenceThreshold).toBe(0.7);
  expect(loaded.latencyOverlay).toBe(false);
  expect(loaded.radioFx).toBe(false);
  expect(loaded.pathC).toBe(false);
  expect(defaultSpeechPrefs().voiceId).toBe("auto");
  expect(defaultSpeechPrefs().pathC).toBe(false);
});

test("legacy backtick prefs migrate to Left Control", () => {
  const store = memoryStorage();
  store.setItem(SPEECH_PREFS_KEY, JSON.stringify({ pttKey: "`" }));
  expect(loadSpeechPrefs(store).pttKey).toBe("ControlLeft");
});

test("AC3 — selecting another backend while idle constructs that id", () => {
  const created: string[] = [];
  let current = fakePort("http");
  const controller = createSpeechSettingsController({
    prefs: defaultSpeechPrefs(),
    urls: {
      sttUrl: "http://127.0.0.1:8090/stt",
      ttsUrl: "http://127.0.0.1:8090/tts",
      sttConfigured: true,
      ttsConfigured: true,
    },
    storage: memoryStorage(),
    createPort: (id) => {
      created.push(id);
      return fakePort(id);
    },
    host: {
      isBusy: () => false,
      setSpeechPort: (port) => {
        current = port;
        return true;
      },
      setPttKey: () => {},
      setConfidenceThreshold: () => {},
    },
  });
  expect(controller.setBackend("null")).toBe(true);
  expect(created).toEqual(["null"]);
  expect(current.id).toBe("null");
  expect(controller.prefs.backendId).toBe("null");
  expect(controller.setBackend("web-speech")).toBe(true);
  expect(current.id).toBe("web-speech");
});

test("AC4 — busy utterance refuses backend change (status wait)", () => {
  const created: string[] = [];
  const controller = createSpeechSettingsController({
    prefs: defaultSpeechPrefs(),
    urls: {
      sttUrl: "http://127.0.0.1:8090/stt",
      ttsUrl: "http://127.0.0.1:8090/tts",
      sttConfigured: true,
      ttsConfigured: true,
    },
    storage: memoryStorage(),
    createPort: (id) => {
      created.push(id);
      return fakePort(id);
    },
    host: {
      isBusy: () => true,
      setSpeechPort: () => true,
      setPttKey: () => {},
      setConfidenceThreshold: () => {},
    },
  });
  expect(controller.setBackend("null")).toBe(false);
  expect(controller.rowError).toBe(SPEECH_SETTINGS_WAIT);
  expect(created).toEqual([]);
  expect(controller.prefs.backendId).toBe("http");
});

test("selecting http with missing URLs shows a row error and keeps the previous backend", () => {
  const controller = createSpeechSettingsController({
    prefs: { ...defaultSpeechPrefs(), backendId: "null" },
    urls: { sttUrl: "", ttsUrl: "", sttConfigured: false, ttsConfigured: false },
    storage: memoryStorage(),
    createPort: (id) => fakePort(id),
    host: {
      isBusy: () => false,
      setSpeechPort: () => true,
      setPttKey: () => {},
      setConfidenceThreshold: () => {},
    },
  });
  expect(controller.setBackend("http")).toBe(false);
  expect(controller.rowError).toBe(HTTP_URLS_MISSING);
  expect(controller.prefs.backendId).toBe("null");
});

test("AC5 — setPttKey updates the host bind", () => {
  const keys: string[] = [];
  const controller = createSpeechSettingsController({
    prefs: defaultSpeechPrefs(),
    storage: memoryStorage(),
    host: {
      isBusy: () => false,
      setSpeechPort: () => true,
      setPttKey: (key) => {
        keys.push(key);
      },
      setConfidenceThreshold: () => {},
    },
  });
  expect(controller.prefs.pttKey).toBe("ControlLeft");
  controller.setPttKey("CapsLock");
  expect(keys).toEqual(["CapsLock"]);
  expect(controller.prefs.pttKey).toBe("CapsLock");
});

test("PTT options include backtick + Caps Lock and omit F/R/range keys", () => {
  const values = PTT_BIND_OPTIONS.map((option) => option.value);
  expect(values[0]).toBe("ControlLeft");
  expect(values).toContain("Backquote");
  expect(values).toContain("CapsLock");
  expect(values).not.toContain("f");
  expect(values).not.toContain("F");
  expect(values).not.toContain("r");
  expect(values).not.toContain("R");
  expect(values).not.toContain("KeyF");
  expect(values).not.toContain("KeyR");
});

test("AC7 — web-speech copy warns about the browser vendor; no Deepgram/OpenAI signup", () => {
  expect(WEB_SPEECH_VENDOR_WARNING).toMatch(/browser vendor/i);
  expect(WEB_SPEECH_VENDOR_WARNING).not.toMatch(/deepgram|openai|elevenlabs/i);
  expect(VOICE_DISABLED_HINT).toMatch(/typed commands/i);
  expect(DEFAULT_BACKEND_HELP).toMatch(/never auto-selected/i);
  expect(PTT_BIND_HELP).toMatch(/backtick/i);
  expect(PTT_BIND_HELP).toMatch(/F, R, or range/i);
});

test("T03-15 — confidence slider copy is informational and does not skip parse", () => {
  expect(CONFIDENCE_THRESHOLD_HELP).toMatch(/informational/i);
  expect(CONFIDENCE_THRESHOLD_HELP).toMatch(/does not skip parse/i);
});

test("settings UI omits whisper-wasm and vendor signup; Path C checkbox is present", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./settings-speech.tsx"]!;
  expect(src).toMatch(/WEB_SPEECH_VENDOR_WARNING/);
  expect(src).toMatch(/VOICE_DISABLED_HINT/);
  expect(src).not.toMatch(/whisper-wasm/);
  expect(src).not.toMatch(/deepgram|openai|elevenlabs/i);
  expect(src).not.toMatch(/<option value="whisper/);
  expect(src).toContain(PATH_C_LABEL);
  expect(src).toMatch(/disabled=\{!controller\.parseReady\}/);
});

test("AC10 — Path C default false; disabled until health.parse ready; persist", async () => {
  expect(PATH_C_LABEL).toBe("Path C (local /parse)");
  expect(defaultSpeechPrefs().pathC).toBe(false);
  expect(PATH_C_UNAVAILABLE_HELP).toMatch(/unavailable/i);
  expect(PATH_C_HELP).toMatch(/salvage/i);

  const hostPathC: boolean[] = [];
  const store = memoryStorage();
  const controller = createSpeechSettingsController({
    prefs: defaultSpeechPrefs(),
    parseReady: false,
    storage: store,
    host: {
      isBusy: () => false,
      setSpeechPort: () => true,
      setPttKey: () => {},
      setConfidenceThreshold: () => {},
      setPathC: (enabled) => {
        hostPathC.push(enabled);
      },
    },
  });
  expect(controller.parseReady).toBe(false);
  expect(controller.pathCActive).toBe(false);
  expect(controller.setPathC(true)).toBe(false);
  expect(controller.prefs.pathC).toBe(false);

  const readyFetch = vi.fn(
    async () => new Response(JSON.stringify({ parse: "ready" }), { status: 200 }),
  );
  const readyController = createSpeechSettingsController({
    prefs: defaultSpeechPrefs(),
    parseReady: false,
    fetch: readyFetch,
    healthUrl: "http://127.0.0.1:8090/health",
    storage: store,
    host: {
      isBusy: () => false,
      setSpeechPort: () => true,
      setPttKey: () => {},
      setConfidenceThreshold: () => {},
      setPathC: (enabled) => {
        hostPathC.push(enabled);
      },
    },
  });
  expect(await readyController.refreshParseHealth()).toBe("ready");
  expect(readyController.parseReady).toBe(true);
  expect(readyController.setPathC(true)).toBe(true);
  expect(readyController.prefs.pathC).toBe(true);
  expect(readyController.pathCActive).toBe(true);
  expect(loadSpeechPrefs(store).pathC).toBe(true);
});
