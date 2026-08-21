# Swarm status

## Fourth swarm started — Path C (T03-15 then T03-14)

Orchestrator started **2026-08-21**. Phase 3 voice (third swarm) stays green. This run **names T03-14** (human asked). Do **not** start phase 4 or 5. Do **not** redo T03-01–13. Skip **T03-11**. Untracked `e2e/` left uncommitted.

Plan: `c:\Users\Ben\.cursor\plans\path_c_llm_salvage_11c4764f.plan.md`

| Key | Value |
| --- | --- |
| Goal | Drop STT confidence reject (always parse typed/A/B). On miss, optional local Path C `POST /parse` → schema-checked `llm_c`. |
| LLM trigger | **Parse miss only.** Do not override a successful A/B hit. |
| Model | **cursor-grok-4.6-high** on captain and every worker. No fast. |
| Parse model | ~1–2B instruct GGUF in `speech-api` (not 7B). Hub weight download once. No paid LLM APIs. |
| Path C default | **off** until `/health.parse === "ready"` |
| Max workers | **3** (this run is sequential: docs → T03-15 → T03-14 because settings/voice-loop overlap) |
| Merge lock | **Captain only** (`--no-ff`) |
| Stop | No phase 4/5. No T03-11. No replacing Path A. |

Waves: (0) ticket markdown T03-15 + amend T03-14 → (1) implement T03-15 → (2) implement T03-14.

## THIRD SWARM COMPLETE — phase 3 voice

Phases **0 → 1 → 2 → 3** are green on `master`. Orchestrator `npm test`: **683 passed, 1 skipped**. `speech-api/` exists; boot default is **http → our speech-api** (`127.0.0.1:8090`). Web Speech is opt-in only. T03-11 and T03-14 were **not** implemented. Path C is off. No paid vendor STT/TTS/LLM. This swarm is done.

**speech-api p50:** not measured (do not invent 1.5 s). Follow-up probe: `GET /health` 200; `POST /tts` ~1192 ms WAV; `POST /stt` timed out at 90 s (likely first-load Whisper). Chrome n≥7 leftover.

**Leftover Chrome / mic (human `npm run dev` + speech-api up):** mic grant/deny; live PTT phrases; radio FX listen; Voice settings switch; ≥ 7 http utterances for p50. Details in captain notes below.

**Remaining work (next paste of `SWARM.md` with config changed):**

| Phase | Folder | What it is |
| --- | --- | --- |
| 4 Procedures | `phases/04-procedures/` | ILS intercept, DEMO ONE STAR, lite CA/MSAW |
| 5 Training | `phases/05-training/` | Practice score, replay, optional bad readbacks |

Do not start those until a new swarm paste. Manual Chrome leftovers stay in the phase 3 captain notes below.

## Third swarm started — Phase 3 voice (T03-01–10, 12, 13)

Orchestrator started **2026-08-21**. First-swarm and second-swarm (TCW polish) notes below stay. Start phase 3 voice; do **not** replay T00-*, T01-*, T02-01–13, or T02-14–21. Do **not** start phase 4 or 5. Skip **T03-11** and **T03-14**.

**Working tree at start:** `master` with uncommitted third-swarm planning (`SWARM.md`, captain/worker/LAUNCH) plus leftover untracked `e2e/` QA screenshots and `test-results/` (not this swarm — left uncommitted). Planning lands on `master` this commit so ticket branches fork the voice config.

## Config (frozen for this run)

| Key | Value |
| --- | --- |
| Goal | Implement **phase 3 voice** until `phases/03-voice/README.md` **Phase exit** is green (E1–E14). PTT → `SpeechPort` → same `parseCommand` as typed → existing pilot → TTS → radio FX |
| Quality path | **`http` → our `speech-api/`** (HF weights downloaded once, inference on our machine). Target PTT-up → audio-start **p50 < 1.5 s** on localhost/LAN |
| Skip | **T03-11** (whisper-wasm) and **T03-14** (Path C `/parse`) unless the human later names them. Not required to exit |
| Include | **T03-04** (Web Speech) as **opt-in prototype** so settings can switch `null` / `web-speech` / `http`. **Never** the default. Quality must **not** fail the phase |
| Stop | **Do not start phase 4 or 5.** No procedures, scoring, or training-session tickets |
| Do not redo | T00-*, T01-*, T02-01–T02-13. If STATUS says first swarm complete, **start phase 3**, do not replay 0→2 |
| Max ticket workers in flight | **3** |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** Every Task spawn sets `model: "cursor-grok-4.6-high"`. No `composer-2.5-fast`, no omitting `model` |
| Paid STT/TTS/LLM | **Forbidden.** No OpenAI, Deepgram, Groq, ElevenLabs, HF Inference API/Endpoints, Chrome-as-default, etc. Hub = **weight download only** (T03-13) |

## Progress (this run)

| Phase | Status | Notes |
| --- | --- | --- |
| 0 Slice | **GREEN** (first swarm) | Do not redo |
| 1 Closed loop | **GREEN** (first swarm) | Confirmed on `master` (T01-01–14) |
| 2 Scope original (T02-01–13) | **GREEN** (first swarm) | Confirmed on `master` |
| 2 Scope polish (T02-14–21) | **GREEN** (second swarm) | Out of this run — do not redo |
| 3 Voice | **GREEN** | Resume captain merged T03-08, 07, 09, 10, 12. Skip 11 and 14. Live http p50 leftover. |
| 4 Procedures | **out of scope this run** | |
| 5 Training | **out of scope this run** | |

## Log (this run)

- 2026-08-21: Third swarm started. T01-* and T02-01–13 on `master`. No `speech-api/`, no T03-* commits. Spawning phase 3 voice captain (`cursor-grok-4.6-high`). Skip T03-11 and T03-14.
- 2026-08-21: First captain interrupted after Wave C partial. On `master`: T03-01, 02, 03, 04, 05, 06, 13. Boot still `NullSpeechPort`. Remaining: T03-08, 07, 09, 10, 12. Re-spawning captain from this `master`.
- 2026-08-21: Resume captain: merged T03-08, 07, 09, 10, 12 `--no-ff`. `npm test` / `npm run ci` green. **PHASE EXIT GREEN** with Chrome/mic/speech-api p50 leftover. Did not start phase 4. Did not spawn T03-11 or T03-14.
- 2026-08-21: Orchestrator `npm test` on `master`: 683 passed, 1 skipped. `speech-api/` present. Boot http default. **THIRD SWARM COMPLETE — phase 3 voice.** Stopped before phase 4/5.

## Phase 3 voice captain notes (resume)

- **Merged this resume:** T03-08 (already on `master` at spawn; `npm test` 622); T03-07; T03-09 (rebased onto 07); T03-10 (rebased onto 09; export/test conflicts kept both overlay + settings); T03-12; `ticket/T03-ci-fix` (eslint `prefer-const` + Prettier). Isolated worktrees. Workers never merged. Deleted local ticket branches. Ignored junk `list` / `ls`.
- **Already on master before resume:** T03-01, 02, 03, 04, 05, 06, 13.
- **Skipped:** T03-11, T03-14.
- **Tests:** `npm test` **683** passed, **1** skipped. `npm run ci` exit 0.
- **Boot:** `loadAndResolveSpeechBoot` → **http** when STT/TTS URLs present (defaults `127.0.0.1:8090`). Web Speech opt-in only, never automatic default. Path C off. Radio tokens `DAL123 H270` still typed; English command line is tokenizer miss then Path A (`spoken_a`).
- **E1–E14:** Automated rows ticked. **E10** unchecked — live p50 **BLOCKED on http config** (`GET http://127.0.0.1:8090/health` timed out, 0 bytes). No invented 1.5 s number. See `phases/03-voice/ACCEPTANCE.md`.
- **Did not start phase 4 or 5.**

### Manual leftover (human `npm run dev` + healthy speech-api)

- Chrome mic grant / deny (E1).
- Live http phrases (E3–E5): *Delta one two three descend and maintain three thousand*; *turn left heading two seven zero*.
- Radio FX listen dry vs graph (E6).
- Backend switch in settings (E9).
- ≥ 7 http utterances; fill p50 table (E10). Restart speech-api until `/health` returns JSON.

## Phase 3 voice captain notes (full run)

- **Merged:** T03-01, T03-03, T03-13 (Wave A, isolated worktrees); T03-02, T03-04, T03-05 (B); T03-06, T03-08 (C; 08 re-spawned after T03-06 to avoid `voice-loop.ts` conflict); T03-07, T03-09, T03-10 (D, `--no-ff` on `master`); T03-12 plus follow-up probe/CI harness. Skip **T03-11** and **T03-14**. Workers did not merge from this captain’s spawns. Ignored junk `list` / `ls`. Did not start phase 4 or 5.
- **Tests:** `npm test` **689** passed, **1** skipped. `npm run ci` exit 0 (typecheck, lint, format:check, vitest).
- **Boot / product:** Quality default **http → our `speech-api/`** (`127.0.0.1:8090`). Web Speech opt-in only. Path C off (`POST /parse` 503). Radio tokens `DAL123 H270` still typed; command-line English is tokenizer miss then Path A. No paid vendor STT/TTS/LLM.
- **E1–E14:** Automated rows ticked. **E10 leftover** — p50 table blank; `/health` 200; `/tts` ~1192 ms; `/stt` 90 s timeout; no Chrome n≥7. No invented 1.5 s number. See `phases/03-voice/ACCEPTANCE.md`.

### Manual leftover (human `npm run dev` + speech-api up)

- Chrome mic grant / deny; type backtick in the command line (E1).
- Live phrases (E3–E5): *Delta one two three descend and maintain three thousand*; *turn left heading two seven zero*; mash PTT during readback.
- Radio FX listen dry vs graph (E6).
- Voice settings: `null` / `web-speech` / `http` (E9).
- ≥ 7 http utterances; fill p50 table (E10). First STT may be slow (Whisper load).

---

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

