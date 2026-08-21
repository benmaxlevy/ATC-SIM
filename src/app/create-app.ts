import { SessionLog, createWorld, type World } from "@core";
import {
  createPttCaptureController,
  type PttCaptureController,
  type PttCaptureEvent,
  type SpeechPort,
} from "@speech";

export interface AppDeps {
  speech: SpeechPort;
  /** When omitted, starts empty; boot should pass `createWorldFromScenario`. */
  world?: World;
  /** Injected in tests. Browser boot constructs one with window listeners. */
  ptt?: PttCaptureController;
  /** Capture-only callback until T03-02 wires transcribe → parse. */
  onPttEvent?: (event: PttCaptureEvent) => void;
}

export interface AppHandles {
  speech: SpeechPort;
  log: SessionLog;
  world: World;
  ptt: PttCaptureController;
}

export function createApp(deps: AppDeps): AppHandles {
  if (!deps.speech) {
    throw new Error("createApp requires deps.speech");
  }
  const ptt =
    deps.ptt ??
    createPttCaptureController({
      onEvent: deps.onPttEvent ?? (() => {}),
      attachTo: typeof window !== "undefined" ? window : null,
    });
  return {
    speech: deps.speech,
    log: new SessionLog(),
    world: deps.world ?? createWorld(),
    ptt,
  };
}
