# Swarm status

## SECOND SWARM COMPLETE — TCW polish; still stopped before voice

Phase 2 polish **T02-14 → T02-21** is green on `master`. Orchestrator `npm test`: **479 passed, 1 skipped**. No `speech-api/`, no PTT, no T03-* commits. Glass grammar is a STARS-like TCW (video maps, DCB cells, SSA), not a website toolbar. This swarm is done.

**Remaining work (next paste of `SWARM.md` with config changed):**

| Phase | Folder | What it is |
| --- | --- | --- |
| 3 Voice | `phases/03-voice/` | PTT → our `speech-api` → same parser → spoken readback |
| 4 Procedures | `phases/04-procedures/` | ILS intercept, DEMO ONE STAR, lite CA/MSAW |
| 5 Training | `phases/05-training/` | Practice score, replay, optional bad readbacks |

Do not start those until a new swarm paste. Manual Chrome leftovers stay in the phase 2 polish captain notes below.

## Second swarm started — TCW polish (T02-14–21)

Orchestrator started **2026-08-21**. First-swarm notes below stay. Resume polish; do **not** replay T00-*, T01-*, or T02-01–13.

**Working tree at start:** dirty on `ticket/video-maps-json-catalog` (same SHA as `master`) with polish planning + uncommitted T02-14 `src/`. Orchestrator split them: planning lands on `master` this commit; T02-14 source is parked on `ticket/T02-14-video-map-catalog` for the captain to **land**, not re-implement. Ignore junk branches `list` / `ls`.

## Config (frozen for this run)

| Key | Value |
| --- | --- |
| Goal | Implement **T02-14 → T02-21** until the phase 2 README **Phase 2 polish checklist** is green (TCW / STARS-*like* grammar) |
| Feel | Cheap STARS trainer / vice-like **TCW**, not a web app on a radar. Match *grammar* (dark PPI, green DCB cells, video maps, FDB, SSA). **Do not** pixel-clone a NY STARS screenshot or Raytheon internals |
| Stop | **Do not start phase 3, 4, or 5.** No `speech-api`, no PTT, no T03-* |
| Do not redo | T00-*, T01-*, T02-01–T02-13 (already merged) |
| Max ticket workers in flight | **3** |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** Every Task spawn sets `model: "cursor-grok-4.6-high"` |
| Paid STT/TTS | Forbidden |

## Progress (this run)

| Phase | Status | Notes |
| --- | --- | --- |
| 0 Slice | **GREEN** (first swarm) | Do not redo |
| 1 Closed loop | **GREEN** (first swarm) | Do not redo |
| 2 Scope original (T02-01–13) | **GREEN** (first swarm) | Confirmed on `master` |
| 2 Scope polish (T02-14–21) | **GREEN** | T02-14–21 merged `--no-ff`. Orchestrator `npm test` 479 passed, 1 skipped. |
| 3 Voice | **out of scope this run** | |
| 4 Procedures | **out of scope this run** | |
| 5 Training | **out of scope this run** | |

## Log (this run)

- 2026-08-21: Second swarm started. T02-01–13 on `master`. Planning tickets T02-14–21 committed to `master`. T02-14 WIP parked on `ticket/T02-14-video-map-catalog`. Spawning phase 2 polish captain (`cursor-grok-4.6-high`).
- 2026-08-21: Phase 2 polish captain: all T02-14 … T02-21 merged `--no-ff` on `master` (plus `ticket/T02-21-ci-fix` for Prettier). Automated polish checklist green. Did not start phase 3. Did not write SECOND SWARM COMPLETE.
- 2026-08-21: Orchestrator `npm test` on `master`: 479 passed, 1 skipped. No `speech-api/`. **SECOND SWARM COMPLETE — TCW polish; still stopped before voice.**

## Phase 2 polish captain notes

- **Merged:** T02-14 (Wave A; landed parked `e7aa4b5`, did not invent a second catalog); T02-15, T02-18 (B); T02-16 (C; did not skip cell grid); T02-19 then T02-17 (D; 17 rebased after 19 on `renderScope`/`pick`/`README`); T02-20 (E); T02-21 (F) plus `ticket/T02-21-ci-fix` for leftover Prettier. Isolated worktrees; workers never merged. Deleted local ticket branches and stale `ticket/video-maps-json-catalog`. Ignored junk `list` / `ls`.
- **Tests:** `npm test` and `npm run ci` exit 0. **479** passed, **1** skipped (bench wall-clock when no real canvas). Includes video-map catalog, DCB cell/MAPS routing, heading-command `DAL123 H270`, scope keys never hitting the parser.
- **Polish checklist:** Automated rows ticked (T02-14–20 grammar, no WX/OSM/STARS font). T02-21 “cheap STARS trainer” manual row **unchecked** skip-with-reason (no Chrome visual operator). Do not invent a visual pass.
- **Did not start phase 3.** No `speech-api`, no PTT, no T03-*. Radio still tokens (`H270`).

### Manual leftover (human `npm run dev` on Chrome Windows)

- T02-14: denser coast + downwind (not ring-only).
- T02-15: glass is PPI + thin bars, not a blog header; disclaimer one click / F1.
- T02-16 AC6: green DCB cell grid, not a website toolbar.
- T02-17: MAPS toggle extra maps; BRITE dims maps not tracks.
- T02-18: symbol/history contrast on black PPI at 20 NM.
- T02-19: FDB extra type line readable at 20 NM; L8 does not cover the symbol.
- T02-20: SSA + list readable at 20 NM; airport maps still visible.
- T02-21: script steps 1–10 — cheap STARS trainer / vice-like TCW, not a web HUD. Typed `DAL123 H270` still readbacks and turns.

---

## FIRST SWARM COMPLETE — stopped before voice

Phases **0 → 1 → 2** are green on `master`. Orchestrator `npm test`: **429 passed, 1 skipped**. No `speech-api/`, no PTT, no T03-* commits. This swarm is done.

**Remaining work (next paste of `SWARM.md` with config changed):**

| Phase | Folder | What it is |
| --- | --- | --- |
| 3 Voice | `phases/03-voice/` | PTT → our `speech-api` → same parser → spoken readback |
| 4 Procedures | `phases/04-procedures/` | ILS intercept, DEMO ONE STAR, lite CA/MSAW |
| 5 Training | `phases/05-training/` | Practice score, replay, optional bad readbacks |

Do not start those until a new swarm paste. Manual Chrome leftovers stay in the phase 2 captain notes below.

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
| 2 Scope | **GREEN** | Waves A–F merged T02-01 … T02-13. `npm test` / `npm run ci` exit 0 (429 passed, 1 skipped). Manual Chrome script leftover. |
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
- 2026-08-21: Orchestrator `npm test` on `master`: 240/240 passed. Spawning phase 2 captain on **cursor grok 4.6 high**. Human still asleep; no questions.
- 2026-08-21: Phase 2 captain: all T02-01 … T02-13 merged `--no-ff` on `master`. Automated exit green. Did not start phase 3.
- 2026-08-21: Orchestrator `npm test` on `master`: 429 passed, 1 skipped. No `speech-api/`. **FIRST SWARM COMPLETE — stopped before voice.**

## Phase 2 captain notes

- **Merged:** T02-01 (Wave A); T02-02, T02-03, T02-11 (B); T02-04, T02-07 (C); T02-05, T02-06, T02-08 (D); T02-12 then T02-09, T02-10 (E; T02-12 first so 09/10 could keep `?debug=fps`); T02-13 (F) plus `ticket/T02-13-ci-fix` for `tsc` `node:fs`. Isolated worktrees; workers never merged.
- **Tests:** `npm test` and `npm run ci` exit 0. **429** passed, **1** skipped (bench wall-clock when no real canvas). Includes T02-12 30-track CI budget (`renderScope.bench.test.ts`), keymap routing (scope keys never hit `parseCommand`), heading-command integration (`DAL123 H270`).
- **T02-12 GPU:** AC4 Chrome+integrated GPU p50 **skip-with-reason** — human asleep; no iGPU sample. Automated AC2/AC3 shipped. Re-run `?traffic=30&debug=fps` when awake.
- **T02-13:** Live Chrome script steps 1–14 / AC1–AC3 / AC5–AC8 **skip-with-reason** (human asleep). Phase README items proven by tests are ticked; T02-13 “terminal radar” sign-off stays unchecked until a human walks the script.
- **Did not start phase 3.** No `speech-api`, no PTT, no T03-*.

### Manual leftover (human `npm run dev` on Chrome Windows)

- T02-01: window-resize — range circle stays inscribed.
- T02-02: PPI visibility at 20 NM; pan-off-airport visual.
- T02-03: 2× sim-rate history spacing.
- T02-04: climb through 100 ft assigned/Mode C boundary.
- T02-05: numpad vs top-row with NumLock on.
- T02-06: climb through filter max — datablock appears.
- T02-08: Chrome find-in-page vs F3.
- T02-09: PPI motion while F1 overlay open; F1 does not open Chrome help.
- T02-10: dark-strip visual; mouse-only RNG 10 / RING off / FILTER 050–100 / PTL on.
- T02-11: strip-bay collapse visual.
- T02-12: 30 tracks, 5 s sample, p50 ≥ 55 FPS on integrated GPU (`?traffic=30&debug=fps`).
- T02-13: full visual acceptance script (boot dark PPI, not a game map, maps/targets/datablocks/leaders/filter/PTL/ownership/help/strips/radio/`DAL123 H270`).

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

