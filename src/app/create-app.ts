import { SessionLog, createWorld, type SessionEvent, type World } from "@core";
import { DEFAULT_SPAWN_SEED, type Scenario } from "@scenario";
import { approachesFromCatalog, parseCommand, proceduresFromCatalog } from "@parse";
import { handleRadioCommand, createCheckInQueue } from "@pilot";
import {
  createPttCaptureController,
  createVoiceLoop,
  highValueFixIds,
  shouldLogVoiceReject,
  type PttCaptureController,
  type PttCaptureEvent,
  type ReadbackPlayer,
  type SpeechApiUrlStatus,
  type SpeechPort,
  type VoiceLoop,
  type VoiceStatusEvent,
  type VoiceUtteranceMetrics,
  voiceIdForCallsign,
} from "@speech";
import { formatVoiceStatus } from "../ui/voice-status";
import {
  createSpeechSettingsController,
  defaultSpeechPrefs,
  type SpeechPrefs,
  type SpeechSettingsController,
} from "../ui/settings-speech";
import { createCaAlertTone, type CaAlertTone } from "./ca-alert-tone";

export interface AppDeps {
  speech: SpeechPort;
  /** When omitted, starts empty; boot should pass `createWorldFromScenario`. */
  world?: World;
  /** Injected in tests. Browser boot constructs one with window listeners. */
  ptt?: PttCaptureController;
  /** Extra listener; default PTT still forwards to the voice loop. */
  onPttEvent?: (event: PttCaptureEvent) => void;
  /** Injected in tests. Default wires capture → parse → existing pilot. */
  voiceLoop?: VoiceLoop;
  /** Injected in tests so PTT-up → audio-start can resolve without Web Audio. */
  readbackPlayer?: ReadbackPlayer;
  /** Check-in stagger seed. Default 1. Independent of spawn-assignment RNG. */
  checkInSeed?: number;
  /** Persisted T03-10 prefs. Boot via `loadAndResolveSpeechBoot`. */
  speechPrefs?: SpeechPrefs;
  speechUrls?: SpeechApiUrlStatus;
  getVoiceId?: (callsign?: string) => string;
  /** Injected in tests. Browser default is a square-wave CA beep. */
  caAlertTone?: CaAlertTone;
}

export interface AppHandles {
  speech: SpeechPort;
  setSpeechPort(port: SpeechPort): boolean;
  speechSettings: SpeechSettingsController;
  log: SessionLog;
  world: World;
  ptt: PttCaptureController;
  voiceLoop: VoiceLoop;
  /**
   * Drain STAR check-ins after physics. Call once per frame after `advanceWorld`.
   * Does not import SpeechPort into `@core`.
   */
  afterPhysicsTick(): void;
  /** Command-line copy (formatted) or `null` to clear. */
  subscribeVoiceStatus(listener: (status: string | null) => void): () => void;
  caAlertTone: CaAlertTone;
  /** Replace the session world after explicit setup confirmation. */
  replaceWorld(next: World): void;
}

function selectedCallsignFromWorld(world: World): string | null {
  return world.aircraft.find((ac) => ac.id === world.selectedAircraftId)?.callsign ?? null;
}

function logVoiceReject(log: SessionLog, world: World, event: VoiceStatusEvent): void {
  if (!shouldLogVoiceReject(event.code)) {
    return;
  }
  log.append({
    type: "command.rejected",
    atSimMs: world.simTimeMs,
    atWallMs: 0,
    command: null,
    reason: event.code,
    ...(event.sourceText !== undefined && event.sourceText !== ""
      ? { sourceText: event.sourceText }
      : {}),
  });
}

function logVoiceLatency(
  log: SessionLog,
  world: World,
  metrics: VoiceUtteranceMetrics,
  backendId: string,
): void {
  const event: SessionEvent = {
    type: "voice.latency",
    atSimMs: world.simTimeMs,
    atWallMs: Date.now(),
    pttUpToTranscriptMs: metrics.pttUpToTranscriptMs,
    pttUpToAudioStartMs: metrics.pttUpToAudioStartMs,
    backendId,
    sttConfidence: metrics.sttConfidence,
  };
  log.append(event);
}

export function createApp(deps: AppDeps): AppHandles {
  if (!deps.speech) {
    throw new Error("createApp requires deps.speech");
  }
  let world = deps.world ?? createWorld();
  const log = world.sessionLog ?? new SessionLog();
  world.sessionLog = log;
  let speech = deps.speech;
  const prefs = deps.speechPrefs ?? defaultSpeechPrefs();
  let ptt: PttCaptureController | undefined = undefined;
  const voiceStatusListeners = new Set<(status: string | null) => void>();
  // User intent starts from prefs; /health must still make Path C effective.
  let pathCActive = false;

  function emitVoiceStatus(status: string | null): void {
    for (const listener of voiceStatusListeners) {
      listener(status);
    }
  }

  const voiceLoop =
    deps.voiceLoop ??
    createVoiceLoop({
      speechPort: speech,
      parseCommand: (sourceText, options) =>
        parseCommand(sourceText, { ...options, pathC: options.pathC && pathCActive }),
      dispatchCommand: (command) => {
        const result = handleRadioCommand(world, command, log);
        if (result.readback) {
          emitVoiceStatus(result.readback);
        }
        return result;
      },
      getSelectedCallsign: () => selectedCallsignFromWorld(world),
      getOnFrequencyCallsigns: () => world.aircraft.map((ac) => ac.callsign),
      getCatalogFixIds: () => (world.fixRegistry ? [...world.fixRegistry.ids()] : []),
      getSttFixIds: () => highValueFixIds(world.catalog),
      getCatalogProcedures: () => proceduresFromCatalog(world.catalog),
      getCatalogApproaches: () => approachesFromCatalog(world.catalog),
      getIssuedAtSimMs: () => world.simTimeMs,
      getVoiceId: deps.getVoiceId ?? ((callsign) => voiceIdForCallsign(callsign, prefs.voiceId)),
      setTransmitLocked: (locked) => {
        ptt?.setTransmitLocked(locked);
      },
      onStatus: (event) => {
        if (event === null) {
          emitVoiceStatus(null);
          return;
        }
        emitVoiceStatus(formatVoiceStatus(event));
        logVoiceReject(log, world, event);
      },
      onUtteranceComplete: (metrics) => {
        logVoiceLatency(log, world, metrics, speech.id);
      },
      readbackPlayer: deps.readbackPlayer,
      pathC: prefs.pathC,
    });

  ptt =
    deps.ptt ??
    createPttCaptureController({
      onEvent: (event) => {
        deps.onPttEvent?.(event);
        void voiceLoop.handlePttEvent(event);
      },
      attachTo: typeof window !== "undefined" ? window : null,
    });

  const pttController = ptt;
  pttController.setPttKey(prefs.pttKey);
  voiceLoop.readbackPlayer.setFxEnabled(prefs.radioFx);

  function setSpeechPort(next: SpeechPort): boolean {
    const previous = speech;
    if (!voiceLoop.setSpeechPort(next)) {
      return false;
    }
    speech = next;
    if (previous !== next) {
      try {
        previous.dispose?.();
      } catch {
        // Teardown must never throw through the sim tick.
      }
    }
    return true;
  }

  const speechSettings = createSpeechSettingsController({
    host: {
      setPttKey: (key) => {
        pttController.setPttKey(key);
      },
      setRadioFx: (enabled) => {
        voiceLoop.readbackPlayer.setFxEnabled(enabled);
      },
      setPathC: (enabled) => {
        pathCActive = enabled;
        voiceLoop.setPathC(enabled);
      },
    },
    prefs,
    urls: deps.speechUrls,
  });
  void speechSettings.refreshParseHealth();

  const checkInQueue = createCheckInQueue({ seed: deps.checkInSeed ?? 1 });
  checkInQueue.scheduleFromWorld(world);
  const caAlertTone = deps.caAlertTone ?? createCaAlertTone();

  function afterPhysicsTick(): void {
    // Newly scheduled STAR arrivals enter the same check-in queue as initial traffic.
    checkInQueue.scheduleFromWorld(world);
    checkInQueue.drain({
      world,
      log,
      radio: {
        isBusy: () => voiceLoop.busy,
        play: (text, callsign) => voiceLoop.playReadback(text, callsign),
      },
      setStatus: emitVoiceStatus,
      nowWallMs: () => Date.now(),
    });
    caAlertTone.sync(world.alerts.ca.length > 0);
  }

  return {
    get speech() {
      return speech;
    },
    setSpeechPort,
    speechSettings,
    log,
    get world() {
      return world;
    },
    ptt: pttController,
    voiceLoop,
    subscribeVoiceStatus(listener) {
      voiceStatusListeners.add(listener);
      return () => {
        voiceStatusListeners.delete(listener);
      };
    },
    afterPhysicsTick,
    caAlertTone,
    replaceWorld(next) {
      world = next;
      world.sessionLog = log;
      checkInQueue.reset();
      checkInQueue.scheduleFromWorld(world);
    },
  };
}

/** Append session.started. Call after createApp + loadKdem; tests pass a fake wall clock. */
export function bootSession(
  handles: AppHandles,
  scenario: Scenario,
  wallMs: number,
  seed: number = DEFAULT_SPAWN_SEED,
): void {
  handles.log.append({
    type: "session.started",
    atSimMs: 0,
    atWallMs: wallMs,
    scenarioId: scenario.id,
    seed,
  });
}
