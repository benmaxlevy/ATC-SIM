# AGENT — Phase 1 Closed loop (implementation)

You are an implementation agent for **ATC-SIM**, an in-browser STARS-like ATC trainer (training / entertainment only).

Your job: implement **Phase 1 Closed loop** until the phase-exit checklist is green. This phase **is** the product: type a command, see a template readback, aircraft turns. No STARS chrome. No ASR.

Do **not** write or edit files under `phases/` except you may check off acceptance-criteria boxes in this phase’s ticket files if you are asked to. Prefer leaving tickets unchecked and reporting AC status in the PR/summary.

---

## Read first (do not violate)

Read these before any code:

- `phases/_shared/glossary.md` — use these terms; do not invent synonyms
- `phases/_shared/references.md` — 7110.65 (readbacks), vice (typed tokens). Search before naming speech strings.
- `phases/_shared/architecture.md` — packages, tick, KDEM, quality bar
- `phases/_shared/command-ir.md` — `Command` / `Instruction`; parser + validation + events
- `phases/_shared/speech-port.md` — command line **bypasses** speech; keep `null` port
- `phases/_shared/non-goals.md` — do not do this work “while you are here”
- `phases/01-closed-loop/README.md` — frozen numbers, token table, exit checklist
- `phases/00-slice/README.md` — Phase 0 must already be green; match its folder layout and UI stack

If a ticket and `_shared/` disagree, **`_shared/` wins**, then this phase README.

---

## Preconditions

- Phase 0 exit is green: `npm test` passes, `npm run dev` boots the dark shell with disclaimer, echoing command line, empty PPI placeholder.
- Coordinate system is documented (`T00-04`). Use that NM plane: +x east, +y north, heading 0 = true north.
- Command IR TypeScript types exist (`T00-06`). Do not rename instruction types.
- Session event log exists (`T00-08`). Emit `command.accepted` / `command.rejected` as specified in `command-ir.md`.

If Phase 0 is not actually done, **stop** and say so. Do not reimplement Phase 0.

---

## Hard rules

1. **One ticket at a time** in the order below. Finish that ticket’s acceptance criteria before starting the next. Do not start “downstream while here.”
2. **TypeScript strict.** Vitest. `src/core`, `src/parse`, `src/pilot` must stay **DOM-free** (no `document`, no canvas, no rAF in those tests).
3. Physics: **`stepWorld(world, dt)`** with **`dt = 1/20` sim seconds**. `requestAnimationFrame` only renders and feeds a wall-time accumulator. Never pass rAF frame delta into kinematics as `dt`.
4. Sim rate is `1` or `2`. Pause skips `stepWorld`.
5. Only the **pilot agent** mutates aircraft **intent** from a `Command`. The scope/PPI does not.
6. `SAY_*` and `IDENT` do not change kinematics (heading/altitude/speed/position intent). IDENT may set a flash timestamp.
7. Do **not** implement: maps, datablocks, leader lines, STARS/CRC keys, ASR, TTS, PTT, ILS flying, DIRECT/STAR, wind, CA/MSAW, LLMs, a new UI framework, a server tick.
8. Do **not** call `SpeechPort.transcribe` / `synthesize` from the command line. Leave the `null` port wired as in Phase 0.
9. Keep the Phase 0 training/entertainment disclaimer visible.
10. Match Phase 0 file layout (`src/core`, `src/parse`, `src/pilot`, `src/scope`, `src/scenario`, `src/ui`, `src/speech`). Suggested paths in tickets are hints; follow existing exports if Phase 0 named them differently.

---

## Ticket order (mandatory)

Implement in this sequence. **`T01-08` before `T01-07`.**

| Step | Ticket | File |
| --- | --- | --- |
| 1 | T01-01 Sim clock and stepWorld | `phases/01-closed-loop/tickets/T01-01-sim-clock-and-stepworld.md` |
| 2 | T01-02 Aircraft state and intent types | `phases/01-closed-loop/tickets/T01-02-aircraft-state-and-intent-types.md` |
| 3 | T01-03 Kinematics heading altitude speed | `phases/01-closed-loop/tickets/T01-03-kinematics-heading-altitude-speed.md` |
| 4 | T01-04 Spawn arrivals from scenario | `phases/01-closed-loop/tickets/T01-04-spawn-arrivals-from-scenario.md` |
| 5 | T01-05 Command parser text | `phases/01-closed-loop/tickets/T01-05-command-parser-text.md` |
| 6 | T01-06 Callsign resolution and selection | `phases/01-closed-loop/tickets/T01-06-callsign-resolution-and-selection.md` |
| 7 | T01-08 Readback templates | `phases/01-closed-loop/tickets/T01-08-readback-templates.md` |
| 8 | T01-07 Pilot agent validate and apply intent | `phases/01-closed-loop/tickets/T01-07-pilot-agent-validate-and-apply-intent.md` |
| 9 | T01-09 Command line UI wired to parser | `phases/01-closed-loop/tickets/T01-09-command-line-ui-wired-to-parser.md` |
| 10 | T01-10 Crude Canvas2D PPI | `phases/01-closed-loop/tickets/T01-10-crude-canvas2d-ppi.md` |
| 11 | T01-11 Click select track | `phases/01-closed-loop/tickets/T01-11-click-select-track.md` |
| 12 | T01-12 Pause sim rate 1x 2x | `phases/01-closed-loop/tickets/T01-12-pause-sim-rate-1x-2x.md` |
| 13 | T01-13 Integration test typed heading moves aircraft | `phases/01-closed-loop/tickets/T01-13-integration-test-typed-heading-moves-aircraft.md` |
| 14 | T01-14 Phase 1 playable slice | `phases/01-closed-loop/tickets/T01-14-phase-1-playable-slice.md` |

For each ticket:

1. Open the ticket file. Implement **only** that ticket.
2. Put code in **Suggested files** (or the Phase 0 equivalent).
3. Add the tests in the ticket’s test plan.
4. Run `npm test` (and `npm run lint` / typecheck if Phase 0 defined them).
5. Stop that ticket when every AC is true. Summarize what you did, then start the next.

`T01-04` may be implemented immediately after `T01-02` if you prefer spawn fixtures for kinematics tests; do not skip `T01-03`. `T01-05` may be developed in a branch/worktree in parallel **only if** you still merge in the order above and do not couple parser to canvas.

---

## Frozen numbers (copy, do not retune)

```ts
PHYSICS_HZ = 20
SIM_DT_S = 0.05
TURN_RATE_DEG_PER_S = 3
CLIMB_RATE_FT_PER_MIN = 1800
ACCEL_KT_PER_S = 1
```

- Default scenario: **6** aircraft, including **`DAL123`**, east of KDEM, heading 080–100 (downwind-ish for rwy 27). **`DAL123` heading must be 100** so typed `H270` is not a 180° SHORTEST tie.
- PPI default range **40 NM**, north up, airport at origin.
- `SHORTEST` turn at exactly 180° difference → **LEFT**.
- Heading `360` normalizes to `0`. Read back heading 0 as **three six zero**.

---

## Phase exit (stop here)

You are done when `phases/01-closed-loop/README.md` **Phase exit checklist** is all true, including:

- With 6 aircraft visible, type `DAL123 H270` **or** click that track then `H270`.
- Readback appears as **text**.
- Target turns toward 270 on the PPI within **2 seconds of sim time**.
- Vitest covers parser, kinematics, pilot agent, and the `T01-13` integration test.

Then **stop**. Do not start Phase 2 (maps, datablocks, keys) or Phase 3 (voice).

---

## Done report

When you finish (or if you block), report:

1. Tickets completed vs remaining
2. Commands to run (`npm test`, `npm run dev`)
3. How to perform the exit demo
4. Any Phase 0 naming mismatches you had to follow
5. Anything you intentionally did not build (maps, voice, etc.)
