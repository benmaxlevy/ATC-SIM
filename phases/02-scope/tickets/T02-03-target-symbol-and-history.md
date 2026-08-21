# T02-03 Target symbol and history

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-01
**Blocks:** T02-04, T02-07, T02-08
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Each track is a **radar target** (small square/box at position) plus optional **history dots** sampled on sim time — not a sprite, not a continuous motion blur.

## Context

Glossary: a **track** is the displayed target; v1 is 1:1 with aircraft, no sensor error (`phases/_shared/glossary.md`). Phase 1 drew a dot + callsign; callsign moves to datablocks in T02-04. IDENT from phase 1 should flash the symbol (visual only). Palette: unowned `#DDDDDD` until T02-08; history 40–70% of track color. README frozen decision 11.

May run in parallel with T02-02 after T02-01.

## Research

Read **R07** (history / target), **R12** (no airplane sprites).

- Search: `STARS history dots CRC target symbol` and `CRC STARS history trails`
- **Terms:** **target** / **track**, **history** (dots). Not sprite, airplane icon, trail, motion blur, nametag (callsign lives on the **datablock** in T02-04).
- Heading tick is a small radar cue, not a PTL (PTL is T02-07).
- Comment: analog CRC history; we sample 5 s sim / 5 dots, no phosphor.

## Scope

- Draw a **6×6 CSS px unfilled square** (1 px stroke) centered on the track position. North-up; do **not** rotate the square with heading. Optional 8 px heading tick from the center along ground track (not a PTL). Pick one: **include the heading tick** (helps “radar not map”).
- Remove free-floating callsign text from the T01-10 crude PPI (or keep only until T02-04 lands **in the same session** — prefer remove here and accept unlabeled targets until T02-04; if T02-04 is not in this PR, keep a temporary callsign so the slice stays playable — **prefer keep temporary callsign** at 10 px until T02-04 deletes it).
- **History:** per-track ring buffer, sample every **5.0 s sim time**, keep **5** past positions. Draw 2×2 px squares. Default **on**.
- Toggle: `F8` always-on; `H` when scope-focused (command line blurred). Do not treat `H` as history when radio-focused (`H270` is a heading).
- `history.push` happens in a display sampler called from the render/subscription path **or** from `stepWorld` via a side table keyed by aircraft id — must not alter kinematics. Sampling uses `world.simTimeMs`.
- Buffer clears when an aircraft is removed/despawned.
- IDENT: if phase 1 emits an ident flash flag/event, pulse symbol stroke to selected yellow for ~2 s sim time. If IDENT is only a readback today, add a boolean `identUntilSimMs` on display state when the pilot agent accepts `IDENT` — **do not** change readback text. Listening to `command.accepted` with `IDENT` is allowed for display; do not re-validate.

## Out of scope

- Datablocks (T02-04), leaders, PTL, ownership colors (stay unowned white), ADS-B vs primary symbol types, coast/primary slash vs beacon box distinction (all v1 tracks use the same box), phosphor decay.

## Implementation notes

```ts
interface HistoryBuf {
  timesSimMs: number[]; // length ≤ 5
  eastNm: number[];
  northNm: number[];
}
```

- Sample when `simTimeMs - lastSample >= 5000` (or on first paint). Do not sample every 50 ms physics step.
- Cap arrays at 5; drop oldest.
- Hit-test for T01-11: 12 px radius around symbol (datablock hits come in T02-04/T02-05).

## Acceptance criteria

- [ ] **AC1 —** Given 6 spawned arrivals, when the PPI paints, each has a square symbol at its T00-04 world position via `nmToScreen` (±2 px).
- [ ] **AC2 —** Given history on and 30 s of sim at 1x, each track shows up to 5 dots **behind** the current position along the flown path, not ahead.
- [ ] **AC3 —** Automated: after simulated time 0, 5, 10, 15, 20, 25 s of movement, buffer length is 5 and the oldest sample matches the position from t=5 s not t=0 (dropped).
- [ ] **AC4 —** `F8` toggles history globally. With command line focused, `H` does **not** toggle history and still types into the parser; with PPI focused, `H` toggles history and does not insert `H` into the command line.
- [ ] **AC5 —** History sampling does not run inside kinematics; `stepWorld` golden tests from phase 1 still pass without display buffers in the aircraft state object (buffers live in `TrackDisplay`).
- [ ] **AC6 —** IDENT accepted: symbol flashes yellow within 1 s and reverts by 3 s sim without a second readback.
- [ ] **AC7 —** Automated: unit test that `H` key routing depends on `focus === "scope" | "radio"`.
- [ ] **AC8 — Research:** Comments/UI say **target** and **history**, not sprite or trail. Header cites CRC history analog.

## Test plan

- Unit: ring buffer cap, 5 s gate, IDENT timer.
- Integration: key routing vs parser spy.
- Manual: 2x sim rate — history spacing in NM should match faster motion, still 5 s **sim** apart.

## Suggested files

- `src/scope/history.ts`
- `src/scope/history.test.ts`
- `src/scope/targetSymbol.ts`
- `src/scope/trackDisplay.ts`
- `src/scope/renderScope.ts`
- `src/scope/scopeKeys.ts`
