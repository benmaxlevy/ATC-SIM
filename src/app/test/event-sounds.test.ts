import { expect, test, vi } from "vitest";
import { SessionLog, type SessionEvent } from "@core";
import { createEventSounds, EVENT_SOUND_URLS } from "../event-sounds";

function event(type: SessionEvent["type"]): SessionEvent {
  return { type, atSimMs: 0, atWallMs: 0 } as SessionEvent;
}

test("plays the shipped WAV for each alert and handoff edge", () => {
  const created: Record<
    string,
    {
      play: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    }
  > = {};
  const sounds = createEventSounds({
    createSound: (url) => {
      const value = { play: vi.fn(), stop: vi.fn(), dispose: vi.fn() };
      created[url] = value;
      return value;
    },
  });
  const log = new SessionLog();

  for (const type of ["handoff.inbound.offered", "handoff.outbound.accepted"] as const) {
    log.append(event(type));
  }
  sounds.sync(log);

  expect(created[EVENT_SOUND_URLS.handoffRequest]?.play).toHaveBeenCalledOnce();
  expect(created[EVENT_SOUND_URLS.handoffAccepted]?.play).toHaveBeenCalledOnce();
  sounds.dispose();
  expect(Object.values(created).every((value) => value.dispose.mock.calls.length === 1)).toBe(true);
});

test("does not replay old events or process events after disposal", () => {
  const play = vi.fn();
  const sounds = createEventSounds({
    createSound: () => ({ play, stop: vi.fn(), dispose: vi.fn() }),
  });
  const log = new SessionLog();
  log.append(event("handoff.inbound.offered"));
  sounds.sync(log);
  sounds.sync(log);
  expect(play).toHaveBeenCalledOnce();
  sounds.dispose();
  log.append(event("alert.msaw.alert"));
  sounds.sync(log);
  expect(play).toHaveBeenCalledOnce();
});
