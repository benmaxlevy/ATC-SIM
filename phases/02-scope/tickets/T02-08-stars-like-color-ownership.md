# T02-08 STARS-like color ownership

**Phase:** 02 Scope
**Priority:** P1
**Size:** M
**Depends on:** T02-03, T02-04
**Blocks:** T02-09, T02-13
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Tracks look **owned or unowned** by color: white unowned, green owned, yellow selection accent. **F3** initiate-track stub only changes that color. No NAS handoff, no second facility, no flight-plan associate.

## Context

CRC F3 = Initiate Track (real STARS associates a beacon/target with a flight plan). We **stub** the keyboard feel: F3 paints the selected track as “yours.” `phases/_shared/non-goals.md`: no multi-facility NAS. Phase 5 may stub a second position; do not preview it here.

Palette frozen in `phases/02-scope/README.md` decision 5 and 12. Red is still forbidden.

## Research

Read **R07** (F3 initiate track — including VATSIMisms), **R04** (TCW, not a lock-on).

- Open: https://docs.virtualnas.net/crc/stars/ — initiate track / F3.
- Search: `CRC STARS F3 initiate track associated` and `STARS owned datablock color`
- **Terms:** **initiate track**, **owned** / **unowned**. Help may say `F3 INIT TRACK (color only)`. Never lock-on, claim, IFF friendly.
- Document in help: this is **not** NAS association. F4 drop is trainer sugar, not STARS terminate.

## Scope

```ts
export type TrackOwnership = "unowned" | "owned";

export function applyInitiateTrack(current: TrackOwnership): TrackOwnership {
  return "owned"; // unowned → owned; owned stays owned
}

export function applyDropTrack(current: TrackOwnership): TrackOwnership {
  return "unowned";
}
```

- Spawn: `unowned`. Color `#DDDDDD` for symbol, history, leader, datablock, PTL.
- `F3` always-on: requires a **selected** track; sets `owned` (`#00FF66`). No selection: no-op (optional dim hint `NO SEL`).
- `F4` always-on: selected `owned` → `unowned`. Trainer sugar, not CRC terminate-track semantics.
- Selection accent: 1 px yellow `#FFFF00` box around the symbol (and optionally the datablock). Independent of ownership (owned+selected = green text, yellow box).
- F3/F4 must `preventDefault` (do not steal browser F3 search-on-page in Chrome — **required** on the canvas/app root).
- **Do not** emit Command IR, do not change assigned heading/alt/speed, do not create a strip-only identity, do not talk to SpeechPort.
- Log optional session event `scope.initiate_track` / `scope.drop_track` with aircraft id if T00-08 log is easy to extend — **display telemetry only**, not a radio event. If the log schema is frozen radio-only, skip logging rather than overload `command.*`.

## Out of scope

- Handoff (HO), point-out, accept handoff, flashing inbound yellow as NAS state, beacon pairing, force-type, scratchpad, quick look, second position, F3 without selection applying to all.

## Implementation notes

Chrome F3: listen on `window` in capture phase when the app is focused; `preventDefault`. Document in help: “F3 is initiate track, not browser find.”

Do not use red for “drop” or errors.

## Acceptance criteria

- [ ] **AC1 —** Automated: state machine unowned+F3→owned, owned+F3→owned, owned+F4→unowned, unowned+F4→unowned.
- [ ] **AC2 —** Spawned traffic is white; after select + F3, that track’s symbol **and** datablock are green; others remain white.
- [ ] **AC3 —** F3 with no selection does not recolor anyone.
- [ ] **AC4 —** F4 on the owned selected track returns it to white.
- [ ] **AC5 —** Selected owned track keeps a yellow selection box plus green datablock.
- [ ] **AC6 —** F3 does not call parser, pilot agent, or `stepWorld` intent writers. Phase 1 heading command still works on an owned track.
- [ ] **AC7 —** F3/F4 `preventDefault` so Chrome find-in-page does not open when the trainer has focus. **Manual** for the Chrome find UI.
- [ ] **AC8 —** No red pixels used for ownership.
- [ ] **AC9 — Research:** Help text includes initiate-track analog and “color only / not NAS.” No lock-on wording.

## Test plan

- Unit: ownership reducer.
- Integration: F3 does not emit `command.accepted`.
- Manual: Chrome F3 vs initiate; select via strip if T02-11 already merged.

## Suggested files

- `src/scope/ownership.ts`
- `src/scope/ownership.test.ts`
- `src/scope/palette.ts`
- `src/scope/trackDisplay.ts`
- `src/scope/renderScope.ts`
- `src/scope/scopeKeys.ts`
