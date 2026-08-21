import { SessionLog, createWorld, type World } from "@core";
import { parseCommand } from "@parse";
import { handleRadioCommand } from "@pilot";
import {
  createPttCaptureController,
  createVoiceLoop,
  shouldLogVoiceReject,
  type PttCaptureController,
  type PttCaptureEvent,
  type SpeechPort,
  type VoiceLoop,
  type VoiceStatusEvent,
} from "@speech";
import { formatVoiceStatus } from "../ui/voice-status";

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
}

export interface AppHandles {
  speech: SpeechPort;
  log: SessionLog;
  world: World;
  ptt: PttCaptureController;
  voiceLoop: VoiceLoop;
  /** Command-line copy (formatted) or `null` to clear. */
  subscribeVoiceStatus(listener: (status: string | null) => void): () => void;
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

export function createApp(deps: AppDeps): AppHandles {
  if (!deps.speech) {
    throw new Error("createApp requires deps.speech");
  }
  const world = deps.world ?? createWorld();
  const log = new SessionLog();
  let ptt: PttCaptureController | undefined = deps.ptt;
  const voiceStatusListeners = new Set<(status: string | null) => void>();

  function emitVoiceStatus(status: string | null): void {
    for (const listener of voiceStatusListeners) {
      listener(status);
    }
  }

  const voiceLoop =
    deps.voiceLoop ??
    createVoiceLoop({
      speechPort: deps.speech,
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

  return {
    speech: deps.speech,
    log,
    world,
    ptt,
    voiceLoop,
    subscribeVoiceStatus(listener) {
      voiceStatusListeners.add(listener);
      return () => {
        voiceStatusListeners.delete(listener);
      };
    },
  };
}
