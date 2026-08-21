# T05-07 Replay recorder

**Phase:** 05 Training
**Priority:** P0
**Size:** L
**Depends on:** none (World + T00-08 log)
**Blocks:** T05-08
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A session can be serialized to a JSON **replay file**: disclaimer, settings, RNG seed, initial `World` DTO, periodic snapshots, and the full event log. Download in-tab. No server.

## Context

`phases/_shared/architecture.md`: single `World` object, pure `stepWorld`. That purity is what makes replay possible.

T00-08 log is append-only in memory and did not persist. This ticket persists a **copy** at export time.

`phases/05-training/README.md` § Replay is normative (`ReplayFile` version 1, snapshot every 10 s sim).

Do not claim the file is a certified recording.

## Scope

- `WorldDto` type + `toWorldDto(world)` / `fromWorldDto(dto)` in `@train` or `@core`. Strip non-JSON (functions, class instances → plain data). Include aircraft, intent (including phase 4 modes), simTimeMs, simRate, paused, selection, wind if present, ownership/position ids, imperfect settings + RNG **state** (or seed + draw count).
- `ReplayRecorder`: start on `session.started` (or first append), snapshot every 10_000 sim ms and on demand, `exportFile(): ReplayFile`.
- UI button `Download replay JSON` → `atc-sim-replay-<timestamp>.json`.
- Validate export with a type guard `isReplayFile`.
- Vitest: DTO round-trip of a fixture World (heading/alt/speed/position); snapshot count after N sim seconds; events array matches `log.all()`.
- Embed T00-01 disclaimer and `scoreKind: "practice"`. Optional: last `SessionScore` if `@train` is already imported (nice; not required — T05-08 must work without score).

## Out of scope

- Player UI, seeking, pause-on-load (T05-08).
- Compressing files, IndexedDB auto-save (download is enough).
- Recording PCM / video / canvas frames.
- Multiplayer.

## Implementation notes

Classes (`SessionLog`) should export `events: SessionEvent[]` as data, not the class.

RNG: store `{ seed, draws }` so T05-08 does not re-roll imperfect events — **playback applies recorded events**, it does not re-run the pilot. Still store seed for inspect.

Deep clone snapshots with `JSON.parse(JSON.stringify(dto))` after `toWorldDto` so later ticks cannot mutate history.

If `World` contains a `catalog` object, store `scenarioId` + catalog id, not a duplicate of all fixes, **or** store the catalog (KDEM is small). Prefer **scenarioId** `kdem` and reload catalog from committed JSON on play.

10 s default: constant `REPLAY_SNAPSHOT_PERIOD_SIM_MS = 10_000`.

Warn in UI (console or status) if `events.length > 50_000`; still export.

## Acceptance criteria

- [ ] **AC1 —** `toWorldDto` / `fromWorldDto` round-trip a fixture aircraft position, heading, altitude, speed, assigned intent (Vitest).
- [ ] **AC2 —** After 25 s of simulated time with recorder on, `snapshots.length >= 3` (start + 10 + 20, and not one per physics tick) (Vitest).
- [ ] **AC3 —** Exported `events` equals the log contents (same types/order) (Vitest).
- [ ] **AC4 —** File JSON includes `version: 1`, `product: "ATC-SIM"`, T00-01 disclaimer (Vitest).
- [ ] **AC5 —** DTO JSON has no `AudioContext`, `canvas`, or function values (Vitest: `JSON.stringify` succeeds).
- [ ] **AC6 —** Manual: download button produces a `.json` file named with prefix `atc-sim-replay-`.
- [ ] **AC7 —** No `fetch` upload of the replay.

## Test plan

- Unit: `src/train/replay/world-dto.test.ts`, `recorder.test.ts`.
- Integration: spawn + `stepWorld` 25 s + one command in the log appears in export.
- Manual: download after a short session.

## Suggested files

- `src/train/replay/world-dto.ts`
- `src/train/replay/recorder.ts`
- `src/train/replay/types.ts`
- `src/train/replay/recorder.test.ts`
- `src/ui/replay-export.ts`
