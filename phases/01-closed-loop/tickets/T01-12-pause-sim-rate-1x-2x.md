# T01-12 Pause sim rate 1x 2x

**Phase:** 01 Closed loop
**Priority:** P0
**Size:** S
**Depends on:** T01-01, T01-10
**Blocks:** T01-14
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The operator can pause the sim and run at **1×** or **2×**. Pause stops kinematics and sim time. Rate uses the T01-01 accumulator (`wallDt * simRate`). The PPI keeps rendering while paused (ticks freeze).

## Context

`phases/_shared/glossary.md`: sim rate `1.0` = real time; Phase 1 must support `1` and `2`.

`phases/_shared/architecture.md`: rAF renders; physics stepped with simRate in the accumulator.

These are **scope/session** controls, not radio commands: no readback.

## Scope

- `world.paused` and `world.simRate` already exist (T01-01). Wire UI + keys.
- Keys (document on a tiny HUD; do not build a STARS help overlay):
  - `Space` — toggle pause (prevent page scroll). When the command line is focused, **Space should type a space in the input**, not pause. Freeze: **Space pauses only when the command line is _not_ focused**; **Pause/Break** or **`P`** toggles pause **even if** the command line is focused (if it would type `p` into a command, use **`Pause`** key and a visible **Pause** button instead).
  - **Required unambiguous controls:** on-screen buttons **Pause**, **1×**, **2×** that always work. Keys: `1` sets 1×, `2` sets 2× **when focus is not in the command line**. When focus **is** in the command line, `1`/`2` are typed characters (needed for callsigns).
- HUD text: `PAUSE` or `1x` / `2x` plus optional `simTime` mm:ss.
- Paused: `advanceWorld` does not step (already T01-01). Verify visually.
- 2×: traffic moves about twice as fast as 1× (manual).
- Do not add 4× / 8×.

## Out of scope

- Replay, rewind, savestates.
- Sim rate 0 as a third enum (use `paused` instead).
- Binding CRC keys.

## Implementation notes

Buttons in the shell (top-right or next to the command line) are the accessible source of truth; keys are accelerators with the focus rules above so they do not steal digits from `H270`.

```ts
export function setPaused(world: World, paused: boolean): void;
export function setSimRate(world: World, rate: 1 | 2): void;
```

Keep these in `src/core` or `src/ui`. They must not touch intent.

When unpausing, remainder in the accumulator is held (T01-01) so you do not jump.

## Acceptance criteria

- [ ] **AC1 —** Pause button sets `world.paused === true`; ticks stop translating within one frame of physics (manual: heading command then pause — aircraft holds heading and position).
- [ ] **AC2 —** Unpause resumes motion without a large teleport.
- [ ] **AC3 —** 1× and 2× buttons set `world.simRate` accordingly; HUD shows the rate.
- [ ] **AC4 —** Unit: `advanceWorld` 60 × (1/60)s at 2× ≈ 2000 ms sim; at pause ≈ 0 ms additional.
- [ ] **AC5 —** Typing `DAL123` in the command line is possible: digit keys and letters are not intercepted as rate/pause **while the input is focused** (except a dedicated Pause button/key).
- [ ] **AC6 —** No readback fired when pausing or changing rate.

## Test plan

- Unit: AC4 (clock tests may already exist; extend).
- Integration: none
- Manual: AC1–AC3, AC5–AC6

## Suggested files

- `src/ui/simControls.ts`
- `src/core/clock.ts` (already)
- `src/main.ts` / shell — HUD + buttons
- `src/ui/simControls.test.ts` (optional; clock tests may suffice)
