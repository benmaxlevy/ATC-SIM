import { SessionLog } from "@core";
import type { SpeechPort } from "@speech";

export interface AppDeps {
  speech: SpeechPort;
}

export interface AppHandles {
  speech: SpeechPort;
  log: SessionLog;
}

export function createApp(deps: AppDeps): AppHandles {
  if (!deps.speech) {
    throw new Error("createApp requires deps.speech");
  }
  return { speech: deps.speech, log: new SessionLog() };
}
