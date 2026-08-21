import { SessionLog, createWorld, type World } from "@core";
import { parseCommand } from "@parse";
import { handleRadioCommand } from "@pilot";
import {
  createPttCaptureController,
  createVoiceLoop,
  type PttCaptureController,
  type PttCaptureEvent,
  type SpeechPort,
  type VoiceLoop,
} from "@speech";

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
}

function selectedCallsignFromWorld(world: World): string | null {
  if (world.selectedAircraftId === null) {
    return null;
  }
  return world.aircraft.find((ac) => ac.id === world.selectedAircraftId)?.callsign ?? null;
}

export function createApp(deps: AppDeps): AppHandles {
  if (!deps.speech) {
    throw new Error("createApp requires deps.speech");
  }
  const world = deps.world ?? createWorld();
  const log = new SessionLog();
  let ptt: PttCaptureController | undefined = deps.ptt;

  const voiceLoop =
    deps.voiceLoop ??
    createVoiceLoop({
      speechPort: deps.speech,
      parseCommand,
      dispatchCommand: (command) => {
        handleRadioCommand(world, command, log);
      },
      getSelectedCallsign: () => selectedCallsignFromWorld(world),
      getIssuedAtSimMs: () => world.simTimeMs,
      setTransmitLocked: (locked) => {
        ptt?.setTransmitLocked(locked);
      },
      onParseMiss: (sourceText) => {
        log.append({
          type: "command.rejected",
          atSimMs: world.simTimeMs,
          atWallMs: 0,
          command: null,
          reason: "PARSE",
          sourceText,
        });
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
  };
}
