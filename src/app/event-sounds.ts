import type { SessionEvent, SessionLog } from "@core";
import { ALERT_TONE_GAP_MS } from "./ca-alert-tone";

export const EVENT_SOUND_URLS = {
  conflictAlert: "/sounds/ConflictAlert.wav",
  handoffAccepted: "/sounds/HandoffAccepted.wav",
  handoffRequest: "/sounds/HandoffRequest.wav",
  msaw: "/sounds/Msaw.wav",
} as const;

export type EventSoundName = keyof typeof EVENT_SOUND_URLS;

export interface EventSound {
  play(loop?: boolean): void;
  stop(): void;
  dispose(): void;
}

export interface EventSounds {
  sync(log: SessionLog, msawActive?: boolean): void;
  dispose(): void;
}

export interface EventSoundsOptions {
  createSound?: (url: string) => EventSound;
}

function browserSound(url: string): EventSound {
  let audio: HTMLAudioElement | null = null;
  let disposed = false;
  let looping = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    play(loop = false) {
      if (disposed || typeof Audio === "undefined") {
        return;
      }
      audio ??= new Audio(url);
      looping = loop;
      if (loop) {
        audio.addEventListener("ended", () => {
          if (!looping || restartTimer !== null) {
            return;
          }
          restartTimer = setTimeout(() => {
            restartTimer = null;
            if (looping) {
              void audio?.play().catch(() => undefined);
            }
          }, ALERT_TONE_GAP_MS);
        });
      }
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    },
    stop() {
      looping = false;
      if (restartTimer !== null) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
      audio?.pause();
      if (audio) {
        audio.currentTime = 0;
      }
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
  const activeMsawCallsigns = new Set<string>();
  let msawPlaying = false;
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
    sync(log, msawActive = true) {
      if (disposed) {
        return;
      }
      const events = log.all();
      for (; cursor < events.length; cursor += 1) {
        const event = events[cursor]!;
        if (event.type === "alert.msaw.caution" || event.type === "alert.msaw.alert") {
          const wasActive = activeMsawCallsigns.size > 0;
          activeMsawCallsigns.add(event.callsign);
          if (!wasActive) {
            sound("msaw").play(true);
            msawPlaying = true;
          }
          continue;
        }
        if (event.type === "alert.msaw.clear") {
          activeMsawCallsigns.delete(event.callsign);
          if (activeMsawCallsigns.size === 0) {
            sounds.get("msaw")?.stop();
            msawPlaying = false;
          }
          continue;
        }
        const name = soundForEvent(event);
        if (name) {
          sound(name).play();
        }
      }
      if (!msawActive) {
        sounds.get("msaw")?.stop();
        msawPlaying = false;
      } else if (activeMsawCallsigns.size > 0 && !msawPlaying) {
        sound("msaw").play(true);
        msawPlaying = true;
      }
    },
    dispose() {
      disposed = true;
      for (const value of sounds.values()) {
        value.stop();
        value.dispose();
      }
      sounds.clear();
    },
  };
}
