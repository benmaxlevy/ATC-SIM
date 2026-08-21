import type { SpeechPort } from "@speech";

export interface AppDeps {
  speech: SpeechPort;
}

export interface AppHandles {
  speech: SpeechPort;
  /** Reserved: T00-08/T00-10 will attach a SessionLog. Optional in this ticket. */
}

export function createApp(deps: AppDeps): AppHandles {
  if (!deps.speech) {
    throw new Error("createApp requires deps.speech");
  }
  return { speech: deps.speech };
}
