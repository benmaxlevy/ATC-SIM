import { expect, test, vi } from "vitest";
import {
  DEFAULT_BACKEND_HELP,
  PTT_BIND_HELP,
  PTT_BIND_OPTIONS,
  PATH_C_HELP,
  PATH_C_LABEL,
  PATH_C_UNAVAILABLE_HELP,
  SPEECH_PREFS_KEY,
  VOICE_DISABLED_HINT,
  createSpeechSettingsController,
  loadAndResolveSpeechBoot,
  loadSpeechPrefs,
  saveSpeechPrefs,
  defaultSpeechPrefs,
} from "../controls/settings-speech";

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

test("URLs present → http; cleared → null", () => {
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

test("unset Vite URLs still boot http via 127.0.0.1:8090 defaults", () => {
  const boot = loadAndResolveSpeechBoot(memoryStorage(), {});
  expect(boot.port.id).toBe("http");
  expect(boot.urls.sttConfigured).toBe(true);
  expect(boot.urls.ttsConfigured).toBe(true);
});

test("persisted web-speech or null prefs still boot http when URLs are present", () => {
  const store = memoryStorage();
  store.setItem(SPEECH_PREFS_KEY, JSON.stringify({ backendId: "web-speech" }));
  const boot = loadAndResolveSpeechBoot(store, {
    VITE_STT_URL: "http://127.0.0.1:8090/stt",
    VITE_TTS_URL: "http://127.0.0.1:8090/tts",
  });
  expect(boot.port.id).toBe("http");
});

test("prefs persist in the same atc-sim.* profile storage as phase 0", () => {
  const store = memoryStorage();
  const prefs = defaultSpeechPrefs();
  prefs.pttKey = "CapsLock";
  prefs.radioFx = false;
  saveSpeechPrefs(prefs, store);
  expect(store.getItem(SPEECH_PREFS_KEY)).toContain("CapsLock");
  const loaded = loadSpeechPrefs(store);
  expect(loaded.pttKey).toBe("CapsLock");
  expect(loaded.radioFx).toBe(false);
  expect(loaded.pathC).toBe(true);
  expect(defaultSpeechPrefs().voiceId).toBe("auto");
  expect(defaultSpeechPrefs().pathC).toBe(true);
});

test("legacy backtick prefs migrate to Left Control", () => {
  const store = memoryStorage();
  store.setItem(SPEECH_PREFS_KEY, JSON.stringify({ pttKey: "`" }));
  expect(loadSpeechPrefs(store).pttKey).toBe("ControlLeft");
});

test("setPttKey updates the host bind", () => {
  const keys: string[] = [];
  const controller = createSpeechSettingsController({
    prefs: defaultSpeechPrefs(),
    storage: memoryStorage(),
    host: {
      setPttKey: (key) => {
        keys.push(key);
      },
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

test("voice copy points at speech-api; no vendor signup", () => {
  expect(VOICE_DISABLED_HINT).toMatch(/typed commands/i);
  expect(DEFAULT_BACKEND_HELP).toMatch(/speech-api/i);
  expect(DEFAULT_BACKEND_HELP).not.toMatch(/web-speech|browser vendor/i);
  expect(PTT_BIND_HELP).toMatch(/backtick/i);
  expect(PTT_BIND_HELP).toMatch(/F, R, or range/i);
});

test("settings UI omits backend switch, overlay, whisper-wasm, and vendor signup", () => {
  const sources = import.meta.glob(["../*.{ts,tsx}", "../**/*.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["../controls/settings-speech.tsx"]!;
  expect(src).toMatch(/VOICE_DISABLED_HINT/);
  expect(src).not.toMatch(/web-speech/);
  expect(src).not.toMatch(/Latency overlay/);
  expect(src).not.toMatch(/whisper-wasm/);
  expect(src).not.toMatch(/deepgram|openai|elevenlabs/i);
  expect(src).not.toMatch(/Speech backend/);
  expect(src).not.toMatch(/Confidence threshold|confidenceThreshold/);
  expect(src).toContain(PATH_C_LABEL);
  expect(src).toMatch(/checked=\{prefs\.pathC\}/);
});

test("Path C defaults on, remains health-gated, and persists opt-out", async () => {
  expect(PATH_C_LABEL).toBe("Path C (local /parse)");
  expect(defaultSpeechPrefs().pathC).toBe(true);
  expect(PATH_C_UNAVAILABLE_HELP).toMatch(/turn it off/i);
  expect(PATH_C_HELP).toMatch(/salvage/i);

  const hostPathC: boolean[] = [];
  const store = memoryStorage();
  const controller = createSpeechSettingsController({
    prefs: defaultSpeechPrefs(),
    parseReady: false,
    storage: store,
    host: {
      setPttKey: () => {},
      setPathC: (enabled) => {
        hostPathC.push(enabled);
      },
    },
  });
  expect(controller.parseReady).toBe(false);
  expect(controller.pathCActive).toBe(false);
  expect(controller.setPathC(false)).toBe(true);
  expect(controller.prefs.pathC).toBe(false);
  expect(loadSpeechPrefs(store).pathC).toBe(false);
  expect(hostPathC).toEqual([false]);

  const readyFetch = vi.fn(
    async () => new Response(JSON.stringify({ parse: "ready" }), { status: 200 }),
  );
  const readyStore = memoryStorage();
  const readyController = createSpeechSettingsController({
    prefs: defaultSpeechPrefs(),
    parseReady: false,
    fetch: readyFetch,
    healthUrl: "http://127.0.0.1:8090/health",
    storage: readyStore,
    host: {
      setPttKey: () => {},
      setPathC: (enabled) => {
        hostPathC.push(enabled);
      },
    },
  });
  expect(await readyController.refreshParseHealth()).toBe("ready");
  expect(readyController.parseReady).toBe(true);
  expect(readyController.prefs.pathC).toBe(true);
  expect(readyController.pathCActive).toBe(true);
  expect(loadSpeechPrefs(readyStore).pathC).toBe(true);
  expect(hostPathC).toEqual([false, true]);
});

test("Path C missing from an existing profile defaults on; explicit false survives reload", () => {
  const store = memoryStorage();
  store.setItem(SPEECH_PREFS_KEY, JSON.stringify({ backendId: "http" }));
  expect(loadSpeechPrefs(store).pathC).toBe(true);

  saveSpeechPrefs({ ...defaultSpeechPrefs(), pathC: false }, store);
  expect(loadSpeechPrefs(store).pathC).toBe(false);
});
