# Swarm status

## Run started

Orchestrator started **2026-08-20**. Resume from the first phase that is not green. Do not redo merged tickets.

## Config (frozen for this run)

| Key | Value |
| --- | --- |
| Goal | Implement **phase 0 → 1 → 2** until each README **Phase exit** is green |
| Stop | **Do not start phase 3, 4, or 5.** No `speech-api`, no PTT, no T03-* |
| Max ticket workers in flight | **3** |
| Phase 2 ∥ phase 3 | **No** — serial. Voice is a later swarm |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Paid STT/TTS | Forbidden (irrelevant this run; still do not add vendor SDKs) |
| Model | **cursor grok 4.6 high only.** No fast. Captains and ticket workers must set Task `model: cursor-grok-4.6-high`. |

## Progress

| Phase | Status | Notes |
| --- | --- | --- |
| 0 Slice | **GREEN** | Waves A–F merged T00-01 … T00-10. `npm test` / `npm run ci` exit 0. |
| 1 Closed loop | **GREEN** | Waves A–I merged T01-01 … T01-14. `npm test` / `npm run ci` exit 0 (240 tests, includes T01-13). |
| 2 Scope | not started | |
| 3 Voice | **out of scope this run** | |
| 4 Procedures | **out of scope this run** | |
| 5 Training | **out of scope this run** | |

## Log

- 2026-08-20: Orchestrator started. Repo was unborn `master` (planning files untracked). Seeded `master` with `phases/`, `README.md`, `.cursor/rules/` so ticket branches can fork. Spawned phase 0 captain (`phases/00-slice/`).
- 2026-08-20: Human: **cursor grok 4.6 high only — no fast.** Interrupted phase 0 captain mid Wave D. Further Task spawns used `model: cursor-grok-4.6-high`.
- 2026-08-20: Phase 0 captain: all T00-01 … T00-10 merged `--no-ff` on `master`. Exit checks green. Did not start phase 1.
- 2026-08-20: Orchestrator `npm test` on `master`: 41/41 passed.
- 2026-08-20: Human: commit the uncommitted planning edits on `master`, then spawn phase 1. Orchestrator committing parse-pipeline / `Command.parseStage` / T01+T03+T05 ticket wording (not application code), then spawning phase 1 captain on **cursor grok 4.6 high**.
- 2026-08-20: Human asleep until swarm complete. **No questions.** Captains/orchestrator pick safest defaults; manual UI leftovers go in STATUS, do not block automated green.
- 2026-08-21: Phase 1 captain: all T01-01 … T01-14 merged `--no-ff` on `master`. Automated exit green. Did not start phase 2.

## Phase 0 captain notes

- **Merged:** T00-01, T00-02, T00-03, T00-04, T00-06, T00-07, T00-05, T00-08, T00-09, T00-10 (wave order A–F).
- **Tests:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run ci` all exit 0 (41 Vitest tests).
- **Wave D interrupt:** working tree had mixed T00-04/T00-06 files. Captain reset the mix, merged already-committed T00-04 and T00-07, discarded the stale T00-06 worktree, and re-spawned T00-06 from updated `master` on grok 4.6 high. Later waves used isolated worktrees.
- **Manual leftover:** human eyeball of `npm run dev` — dark full-viewport Scope, frozen disclaimer visible, empty PPI placeholder, command line echoes submitted text, no browser console errors, no mic/audio prompt on boot. Vite served `index.html` locally; React chrome was not pixel-checked in a browser by the captain.

## Phase 1 captain notes

- **Merged:** T01-01, T01-05 (Wave A); T01-02 (B); T01-03, T01-04, T01-08 (C); T01-06 (D); T01-07 (E); T01-09, T01-10 (F); T01-11, T01-12 (G); T01-13 (H); T01-14 (I). Isolated worktrees; workers never merged.
- **Tests:** `npm test` and `npm run ci` (typecheck, lint, format:check, vitest) exit 0. **240** tests including parser, kinematics, pilot, and T01-13 `tests/integration/heading-command.test.ts` (`DAL123 H270` from heading 100 → ~106° after 2 sim seconds).
- **Wave A interrupt:** first T01-01/T01-05 workers were aborted mid-run. Re-spawned on grok 4.6 high; T01-01 kept the partial commit. Later waves used isolated worktrees. Wave G: T01-12 conflicted with T01-11 on `src/ui/shell.tsx` / `index.ts`; captain rebased T01-12 once and kept both click-select and pause/rate wiring.
- **DAL123** default spawn heading **100**. SpeechPort still `null`. Tokens only (`parseRadioText`); no Path A/B/C, no `speech-api`.
- **Manual leftover** for a human `npm run dev` pass (captain served Vite at localhost, HTTP 200, no pixel-check): dark shell + disclaimer; 6 ticks including DAL123 + range rings; type `DAL123 H270` → text readback (delta / two seven zero) and right turn within ~2 s sim; click DAL123 then `H270`; pause / 1× / 2×; reject `ZZZ1 H270` or empty-canvas `H270`; no maps/datablocks/voice; session log `command.accepted` / `command.rejected` (covered in automated tests).

