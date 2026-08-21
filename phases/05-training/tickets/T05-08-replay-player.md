# T05-08 Replay player

**Phase:** 05 Training
**Priority:** P0
**Size:** L
**Depends on:** T05-07
**Blocks:** T05-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The user can **load** a replay JSON, the sim **pauses**, they can **seek** sim time, and they can **inspect** World + nearby events. Radio is muted. No live networking.

## Context

README § Replay player: seek = nearest snapshot `<= t`, reset World to that DTO, then `stepWorld` while applying recorded events until `t`. If drift vs the next snapshot, **reset to snapshot** when crossing a snapshot time.

Phase 1 already has pause / 1x / 2x. Replay load **forces pause**.

`SpeechPort`: use `null` or skip `synthesize`. Show template readback text from events or by re-running templates on stored `Command`s (do not require the original PCM).

## Scope

- File input (and drag-drop optional) → `parseReplayFile` (validate version, disclaimer present, `initialWorld`).
- Confirm replace of the live session (modal or `window.confirm` is acceptable).
- Player chrome: pause (default on), step **one physics frame** (50 ms sim), scrubber 0…duration, jump to **next event**.
- Inspect pane: JSON or formatted fields for **selected** aircraft; event list filtered to ±5 s sim around playhead.
- Mute voice loop while `replayMode === true`.
- Vitest: load fixture ReplayFile with a heading accept at t=0 and snapshots; at t=2000 ms heading has moved toward assigned (same as live kinematics). Seek back to 0 restores initial heading.
- Invalid file: status error, do not throw through the tick.

## Out of scope

- Editing the recording, splicing, multiplayer observers.
- Re-simulating imperfect RNG (apply **recorded** events only).
- Video export.
- Auto-playing at 1x on load (must stay paused until the user hits play).

## Implementation notes

```ts
export function seekReplay(file: ReplayFile, atSimMs: number): World {
  const snap = lastSnapshotAtOrBefore(file.snapshots, atSimMs) ?? file.initialWorld;
  let world = fromWorldDto(snap.world ?? snap);
  let t = snap.atSimMs ?? 0;
  // apply events with atSimMs in (t, atSimMs]
  // stepWorld in 50 ms increments
  return world;
}
```

**Applying events:** `command.accepted` should set intent the way the pilot did **without** appending new log events (use `applyCommandFromReplay` that mutates World silently, or restore from DTO fields if snapshots are dense enough). Minimum viable: if snapshots are every 10 s, stepping 10 s of physics **without** re-applying commands will miss turns. **You must apply command.accepted into intent at the event’s sim time.**

Do not call `SessionLog.append` during seek (or use a detached log copy for inspect).

Play (unpause) in replay: advance playhead with the existing accumulator, same as live, but source of truth is seek algorithm each frame **or** keep a live World that you only reset on scrub. Prefer: scrub uses `seekReplay`; play uses normal `stepWorld` from the current World **plus** scheduled event application at timestamps — more code. **Normative for v1:** play also uses discrete seeks every frame to `playhead` for correctness (CPU is fine at 20 Hz × 30 aircraft). Optimize later if needed.

Duration = max(last snapshot, last event, last world simTime).

## Acceptance criteria

- [ ] **AC1 —** `parseReplayFile` accepts a T05-07 fixture and rejects `{ version: 2 }` (Vitest).
- [ ] **AC2 —** Seek to t=0 yields initial heading/position of `initialWorld` (Vitest).
- [ ] **AC3 —** Fixture: `command.accepted` FLY_HEADING 270 at 0; at 2000 ms sim, heading has changed toward 270 vs t=0 (Vitest).
- [ ] **AC4 —** Load in UI sets pause true (Manual or unit on a `loadReplay` helper).
- [ ] **AC5 —** Inspect lists the heading command when playhead is within 5 s of that event (Vitest on `eventsNear(file, t, 5000)`).
- [ ] **AC6 —** `synthesize` is not called while replayMode is on (mock).
- [ ] **AC7 —** Manual: load a recorded file, pause remains, scrubber moves inspect data, PPI shows aircraft (no console throw).
- [ ] **AC8 —** Corrupt JSON shows a status line error; existing session World unchanged.

## Test plan

- Unit: `player.test.ts`, `events-near.test.ts`, `parse-replay.test.ts`.
- Integration: recorder → export object → player seek (no disk).
- Manual: T05-12 will re-run; do a smoke load here.

## Suggested files

- `src/train/replay/player.ts`
- `src/train/replay/parse-replay.ts`
- `src/train/replay/player.test.ts`
- `src/ui/replay-ui.ts`
- `src/pilot/apply-intent.ts` (silent apply helper, or new `applyAcceptedCommandSilent`)
