import type { SessionEvent, SessionLog } from "@core";

export const EVENT_SOUND_URLS = {
  conflictAlert: "/sounds/ConflictAlert.wav",
  handoffAccepted: "/sounds/HandoffAccepted.wav",
  handoffRequest: "/sounds/HandoffRequest.wav",
  msaw: "/sounds/Msaw.wav",
} as const;

export type EventSoundName = keyof typeof EVENT_SOUND_URLS;

export interface EventSound {
  play(): void;
  dispose(): void;
}

export interface EventSounds {
  sync(log: SessionLog): void;
  dispose(): void;
}

export interface EventSoundsOptions {
  createSound?: (url: string) => EventSound;
}

function browserSound(url: string): EventSound {
  let audio: HTMLAudioElement | null = null;
  let disposed = false;

  return {
    play() {
      if (disposed || typeof Audio === "undefined") {
        return;
      }
      audio ??= new Audio(url);
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    },
    dispose() {
      disposed = true;
      audio?.pause();
      audio = null;
    },
  };
}

function soundForEvent(event: SessionEvent): EventSoundName | null {
  switch (event.type) {
    case "alert.ca.caution":
    case "alert.ca.alert":
      return "conflictAlert";
    case "alert.msaw.caution":
    case "alert.msaw.alert":
      return "msaw";
    case "handoff.inbound.offered":
    case "handoff.outbound.initiated":
      return "handoffRequest";
    case "handoff.inbound.accepted":
    case "handoff.outbound.accepted":
      return "handoffAccepted";
    default:
      return null;
  }
}

export function createEventSounds(options: EventSoundsOptions = {}): EventSounds {
  const createSound = options.createSound ?? browserSound;
  const sounds = new Map<EventSoundName, EventSound>();
  let cursor = 0;
  let disposed = false;

  function sound(name: EventSoundName): EventSound {
    let value = sounds.get(name);
    if (!value) {
      value = createSound(EVENT_SOUND_URLS[name]);
      sounds.set(name, value);
    }
    return value;
  }

  return {
    sync(log) {
      if (disposed) {
        return;
      }
      const events = log.all();
      for (; cursor < events.length; cursor += 1) {
        const name = soundForEvent(events[cursor]!);
        if (name) {
          sound(name).play();
        }
      }
    },
    dispose() {
      disposed = true;
      for (const value of sounds.values()) {
        value.dispose();
      }
      sounds.clear();
    },
  };
}
