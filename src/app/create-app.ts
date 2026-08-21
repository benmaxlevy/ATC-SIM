import { SessionLog, createWorld, type World } from "@core";
import type { SpeechPort } from "@speech";

export interface AppDeps {
  speech: SpeechPort;
  /** When omitted, starts empty; boot should pass `createWorldFromScenario`. */
  world?: World;
}

export interface AppHandles {
  speech: SpeechPort;
  log: SessionLog;
  world: World;
}

export function createApp(deps: AppDeps): AppHandles {
  if (!deps.speech) {
    throw new Error("createApp requires deps.speech");
  }
  return { speech: deps.speech, log: new SessionLog(), world: deps.world ?? createWorld() };
}
