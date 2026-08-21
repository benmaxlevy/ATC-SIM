import { SessionLog, createWorld, type SessionEvent, type World } from "@core";
import { parseCommand } from "@parse";
import { handleRadioCommand } from "@pilot";
import {
  VoiceLatencyTracker,
  createPttCaptureController,
  createVoiceLoop,
  shouldLogVoiceReject,
  type PttCaptureController,
  type PttCaptureEvent,
  type ReadbackPlayer,
  type SpeechApiUrlStatus,
  type SpeechPort,
  type VoiceLoop,
  type VoiceSessionSnapshot,
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
  /** Persisted T03-10 prefs. Boot via `loadAndResolveSpeechBoot`. */
  speechPrefs?: SpeechPrefs;
  speechUrls?: SpeechApiUrlStatus;
  confidenceThreshold?: number;
  getVoiceId?: (callsign?: string) => string;
}

export interface LatencyOverlayState {
  visible: boolean;
  snapshot: VoiceSessionSnapshot;
}

export interface AppHandles {
  speech: SpeechPort;
  setSpeechPort(port: SpeechPort): boolean;
  speechSettings: SpeechSettingsController;
  log: SessionLog;
  world: World;
  ptt: PttCaptureController;
  voiceLoop: VoiceLoop;
  /** Command-line copy (formatted) or `null` to clear. */
  subscribeVoiceStatus(listener: (status: string | null) => void): () => void;
  /** Last utterance + session p50. T03-10 persists the visibility toggle. */
  subscribeLatencyOverlay(listener: (state: LatencyOverlayState) => void): () => void;
  setLatencyOverlayVisible(visible: boolean): void;
  getLatencyOverlayVisible(): boolean;
}

function selectedCallsignFromWorld(world: World): string | null {
  if (world.selectedAircraftId === null) {
    return null;
  }
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
  };
  log.append(event);
}

export function createApp(deps: AppDeps): AppHandles {
  if (!deps.speech) {
    throw new Error("createApp requires deps.speech");
  }
  const world = deps.world ?? createWorld();
  const log = new SessionLog();
  let speech = deps.speech;
  const prefs = deps.speechPrefs ?? defaultSpeechPrefs();
  let ptt: PttCaptureController | undefined = undefined;
  const voiceStatusListeners = new Set<(status: string | null) => void>();
  const latencyListeners = new Set<(state: LatencyOverlayState) => void>();
  const tracker = new VoiceLatencyTracker(deps.speech.id);
  let latencyOverlayVisible = prefs.latencyOverlay;

  function emitVoiceStatus(status: string | null): void {
    for (const listener of voiceStatusListeners) {
      listener(status);
    }
  }

  function latencyState(): LatencyOverlayState {
    return { visible: latencyOverlayVisible, snapshot: tracker.snapshot() };
  }

  function emitLatency(): void {
    const state = latencyState();
    for (const listener of latencyListeners) {
      listener(state);
    }
  }

  function observeMetrics(metrics: VoiceUtteranceMetrics): void {
    tracker.observe(metrics);
    emitLatency();
  }

  const voiceLoop =
    deps.voiceLoop ??
    createVoiceLoop({
      speechPort: speech,
      parseCommand,
      dispatchCommand: (command) => {
        const result = handleRadioCommand(world, command, log);
        if (result.readback) {
          emitVoiceStatus(result.readback);
        }
        return result;
      },
      getSelectedCallsign: () => selectedCallsignFromWorld(world),
      getIssuedAtSimMs: () => world.simTimeMs,
      confidenceThreshold: deps.confidenceThreshold ?? prefs.confidenceThreshold,
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
      onMetrics: observeMetrics,
      onUtteranceComplete: (metrics) => {
        observeMetrics(metrics);
        logVoiceLatency(log, world, metrics, speech.id);
      },
      readbackPlayer: deps.readbackPlayer,
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
    tracker.setBackendId(next.id);
    emitLatency();
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
      setSpeechPort,
      setPttKey: (key) => {
        pttController.setPttKey(key);
      },
      setConfidenceThreshold: (value) => {
        voiceLoop.setConfidenceThreshold(value);
      },
      isBusy: () => voiceLoop.busy,
      setLatencyOverlayVisible: (visible) => {
        latencyOverlayVisible = visible;
        emitLatency();
      },
      setRadioFx: (enabled) => {
        voiceLoop.readbackPlayer.setFxEnabled(enabled);
      },
    },
    prefs,
    urls: deps.speechUrls,
  });

  return {
    get speech() {
      return speech;
    },
    setSpeechPort,
    speechSettings,
    log,
    world,
    ptt: pttController,
    voiceLoop,
    subscribeVoiceStatus(listener) {
      voiceStatusListeners.add(listener);
      return () => {
        voiceStatusListeners.delete(listener);
      };
    },
    subscribeLatencyOverlay(listener) {
      latencyListeners.add(listener);
      listener(latencyState());
      return () => {
        latencyListeners.delete(listener);
      };
    },
    setLatencyOverlayVisible(visible) {
      speechSettings.setLatencyOverlay(visible);
    },
    getLatencyOverlayVisible() {
      return latencyOverlayVisible;
    },
  };
}
