# ATC-SIM swarm orchestrator — Phase 4 post-exit addendum (T04-13–15)

Paste **this entire file** into a new agent. That agent is the **orchestrator**. It may run for hours. It writes almost no application code.

Workspace: `c:\Users\Ben\Documents\ATC-SIM`  
Shell: **Windows PowerShell** (not bash). Ticket commits use here-strings, not `cat <<'EOF'`.

## Mandatory first action

Before checking git, spawning agents, creating worktrees, or editing application code, update this file for the current swarm. Append a new swarm-start heading/configuration; do not overwrite prior swarm history. If the requested swarm configuration is incomplete, ask before making any other swarm move. Then commit the planning/status update before creating ticket branches or worktrees.

This is the **fifth swarm**. Phases **0 → 1 → 2 (T02-01–13) → 3 → 4 (T04-01–10, T04-12)** are already green on `master`. Do **not** redo 0–4. Do **not** start phase 5. Skip **T04-11** (wind) unless the human names it.

---

## Fifth swarm started — T04-13–15 STAR inbound spawn + check-in

Orchestrator planning update. Historical phase 4 exit stays green. This run is a **post-exit addendum** only.

| Key | Value |
| --- | --- |
| Goal | Default student traffic spawns on catalog STAR **entry** fixes (VIA descending). Seeded random STAR × transition. VIA arrivals check in with frozen phraseology |
| Player loop | `npm run dev` → six arrivals on DEMO ONE N/S at NEMAX/SEMAX (catalog-derived), descending via, check-in on the radio → vectors → ILS still works |
| Skip | **T04-11** (wind). All of **T04-01–10, T04-12** (already merged). All of **T05-*** |
| Include | **T04-13**, **T04-14**, **T04-15** only |
| Stop | **Do not start phase 5.** No scoring, replay, imperfect pilots, or second TCP |
| Do not redo | T00-*, T01-*, T02-*, T03-*, T04-01–12. If STATUS says fifth swarm complete, **stop** |
| Max ticket workers in flight | **3** (this run: wave A is 1; wave B is 2) |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** Every Task spawn sets `model: "cursor-grok-4.6-high"`. No `composer-2.5-fast`, no omitting `model` |
| Paid STT/TTS/LLM | **Forbidden.** Do not regress speech-api onto vendors. Do not edit phase 3 tickets |

If `phases/SWARM-STATUS.md` already lists fifth-swarm exit green with T04-13–15 merged, **stop**. Do not redo merged tickets.

---

## Fifth swarm execution — 2026-08-23 (star plane spawning)

Human invoked `/run-swarm` for **STAR plane spawning**. This is the existing fifth-swarm contract (T04-13–15). It is **not** a sixth swarm and **not** phase 5.

| Key | Value |
| --- | --- |
| Goal | Default student traffic spawns on catalog STAR **entry** fixes (VIA descending). Seeded random STAR × transition. VIA arrivals check in with frozen phraseology |
| Include | **T04-13**, **T04-14**, **T04-15** only |
| Skip | **T04-11**. All of **T04-01–10, T04-12**. All of **T05-*** |
| Stop | **Do not start phase 5.** No scoring, replay, imperfect pilots, or second TCP |
| Max ticket workers in flight | **3** (wave A = 1; wave B = 2) |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** `model: "cursor-grok-4.6-high"` on every Task spawn |

Waves unchanged: **A** T04-13 alone → **B** T04-14 ∥ T04-15 (isolated worktrees). Captain spawn follows this planning commit.

---

## Roles (do not collapse them)

```
YOU (orchestrator)
  └── at most ONE phase captain at a time
        └── up to 3 ticket workers
              └── no children
```

| Role | Writes app code? | Merges `master`? | Spawns |
| --- | --- | --- | --- |
| **Orchestrator** | No (except `SWARM-STATUS.md`) | No | One phase captain |
| **Phase captain** | No | **Yes** | ≤3 ticket workers |
| **Ticket worker** | Yes, **one ticket** | **No** | Nobody |

Do **not** paste `phases/04-procedures/AGENT.md` into one agent. Swarm mode uses **one worker per ticket**.

Prompts to give children (read the file, then add the line):

- Captain: full `phases/SWARM-CAPTAIN.md` + **`Phase folder: phases/04-procedures/`** + **`Tickets: T04-13, T04-14, T04-15 only (waves in SWARM.md). Skip T04-01–12 and T04-11`** + **`model: cursor-grok-4.6-high` on every worker**
- Worker: full `phases/SWARM-TICKET-WORKER.md` + ticket id/path + PowerShell commit here-strings + **this run’s product law** (below)

Workers **must not** end the captain’s turn. Captain **must not** `run_in_background: true` on a worker and then exit. Wait for `READY TO MERGE` / `BLOCKED`. Isolated **git worktrees** for parallel tickets (do not share one working tree). Wave B (T04-14 / T04-15) **must** use separate worktrees.

---

## Product law (every descendant)

CRC/vNAS STARS and vice are **references for feel**. Training/entertainment only. Not a Raytheon clone. Not NAS-certified. Alerts are **lite**, never “MSAW certified.”

**Addendum (this swarm):**

- **KDEM stays the default facility.** Mag var 0°, elev 0 ft, rwy 27.
- **Procedures are data, not code.** Walk `catalog.stars` / transitions / legs. **Farthest-out** = first published **transition** fix, never MERGE, never FAF. No live `if (starId === "DEM1")` / `"NEMAX"`. A second STAR JSON of the same shape must work.
- **VIA already exists.** T04-04/T04-12 armed `PROCEDURE` + `VIA_STAR`. Do not rebuild FMS. Heading still **cancels** published path.
- **Default session** (`npm run dev`, no query): arrivals spawn on catalog STAR entries, VIA descending, seeded assignment over `(starId, transitionId)` pairs. Seed default **1**. `?seed=` reshuffles. **No `Math.random`.**
- **`kdem-ils27` stays deterministic:** DAL123 DEMO ONE north, AAL45 south. Do not RNG that fixture. T04-12 ILS script must still work.
- **`?traffic=N` stays the FPS downwind arc.** Do not STAR-stack the 30-target bench.
- **T01-04 downwind box** survives as a **test fixture**, not the playable default. DAL123 heading 100 is fixture-only.
- **Check-in is unsolicited pilot radio**, not Command IR, not a `DESCEND_VIA` readback. Frozen line:

  `approach, {callsign speech}, descending via {STAR name} arrival through {altitude speech} feet`

  Example: `approach, delta one two three, descending via DEMO ONE arrival through one one thousand feet`. Spoken **name** (`DEMO ONE`), never `DEM1`. Queue + 3–8 s sim stagger; one TTS at a time. Event `radio.checkin`. Phase 5 must **ignore** that event (do not implement scoring).
- Pilot agent owns what the pilot says. Parser never emits check-ins. Scope never invents radio. `stepWorld` stays SpeechPort-free.
- If IR is extended, patch `phases/_shared/command-ir.md` in the same PR. This run should **not** need a new instruction type.
- Paid vendor speech forbidden. Do not edit phase 3 tickets.

**Still true from phase 4 (do not reopen):** ILS from below after loc; heading cancels STAR; CA/MSAW lite; CIFP fixture-only; no chart scrape.

Research: `phases/_shared/references.md` **R01** (vectors/approaches / descend-via), AIM initial contact. Frozen numbers: `phases/04-procedures/README.md`. Tickets: `T04-13` / `T04-14` / `T04-15`.

---

## Your loop (orchestrator)

1. Update this file first: append the current swarm-start heading/configuration and preserve all earlier swarm history. Commit the planning update before any branch/worktree or agent action.
2. Read `phases/SWARM-STATUS.md`, then `git checkout master` && `git status`. If dirty and it is not yours, **stop**.
3. Confirm T04-01–10 and T04-12 are on `master` (fourth swarm complete). If phase 4 historical exit is missing, **BLOCKED**. If STATUS still shows an in-flight fourth swarm, **stop** and tell the human. If STATUS already shows fifth swarm complete, **stop**.
4. Spawn **one** captain for **T04-13–15 only**. Wait until `PHASE EXIT GREEN` or `BLOCKED`.
5. If `BLOCKED`: copy the note into STATUS, **stop**, tell the human. Do not start phase 5.
6. If green: run the final required tests yourself, write the swarm-complete STATUS note, list honest manual leftovers and remaining work, and **stop**.

Keep STATUS updated after the phase run (not after every ticket — the captain does ticket notes).

Manual UI ACs (default STAR spawn + check-in): captain/workers do what they can; leftover Chrome steps go in STATUS. Automated `npm test` / `npm run ci` must be green. Do not invent a visual pass.

---

## Git law (overrides whole-phase AGENT.md)

- Default branch: `master`.
- Worker: `ticket/<ticket-filename-without-.md>` off **current** `master`, progressive commits, **never merge**.
- Captain: `git merge --no-ff` then delete local ticket branch, then `npm test`.
- No `--force` on `master`. No `--no-verify`. No push unless the human asked (they have not).
- After a merge, rebase or re-spawn stale in-flight workers. Isolated worktrees for same-wave tickets.
- Ignore junk branches named `list` or `ls`. Do not merge them.
- You do not merge from here unless the captain died mid-merge — then finish that one merge and stop.

PowerShell commit:

```text
git commit -m @"
T04-13: message why.

Second paragraph why.
"@
```

---

## Waves (captain must follow)

Dependencies on the ticket still win if a wave disagrees.

Phase folder: `phases/04-procedures/`  
Tickets: **T04-13, T04-14, T04-15**. **Skip T04-01–12 and T04-11.**

| Wave | Tickets (≤3) | Wait for |
| --- | --- | --- |
| A | T04-13 | Fourth swarm on `master`. Helpers only — **alone** |
| B | T04-14, T04-15 | A (need **T04-13**). Default spawn ∥ check-in radio. Isolated worktrees |

Do **not** skip T04-13 and hard-code NEMAX/SEMAX in spawn. Do **not** RNG `kdem-ils27`. Do **not** STAR-assign `?traffic=N`. Do **not** add check-in as Command IR. Do **not** start T05-*.

Ticket files / branches:

- `ticket/T04-13-star-inbound-geometry` ← `phases/04-procedures/tickets/T04-13-star-inbound-geometry.md`
- `ticket/T04-14-seeded-star-inbound-spawn` ← `phases/04-procedures/tickets/T04-14-seeded-star-inbound-spawn.md`
- `ticket/T04-15-star-descend-via-checkin` ← `phases/04-procedures/tickets/T04-15-star-descend-via-checkin.md`

**Not this run:** `T04-11-constant-wind-optional`. All T05-*. Redo of T04-01–12.

Exit: tickets T04-13–15 ACs. Default session on STAR entries with VIA. Seed 1 reproducible. Check-in golden string + `radio.checkin`. `kdem-ils27` still DAL123 north / AAL45 south. Typed `DAL123 H270` still turns and **cancels** FMS. `npm test` / `npm run ci` green. Manual leftovers listed, not faked.

---

## Burden limits

- Orchestrator: no `src/` or `tools/` edits except STATUS. No “I’ll just do T04-13 myself.”
- Captain: if a worker `BLOCKED` twice on the same ticket, escalate — do not become the implementer.
- Worker: one ticket. No bonus tickets. No T04-11 “while you are here.” No phase 5 scoring. No rewriting T04-12’s ILS demo into RNG.
- Do not spawn reviewers unless `npm test` failed after merge (then one **fix** worker on `ticket/Txx-yy-fix`, still one merge lock).

Size this run: **T04-13 S, T04-14 M, T04-15 M**.

---

## Captain return (mandatory)

```
PHASE EXIT GREEN
Phase: 4 Procedures addendum (T04-13–15)
Merged: T04-13, T04-14, T04-15
Tests: npm test / npm run ci exit 0
Manual leftover: <default STAR spawn + check-in Chrome items or none>
Notes: <catalog pose; seeded default pack; ils27 deterministic; check-in radio; no phase 5>
```

or `PHASE EXIT BLOCKED` with reason. Do not return “wave A is running” as done.

---

## Done when

T04-13–15 ACs can be argued green, `npm test` green on `master`, STATUS says **fifth swarm complete**, default KDEM session spawns on DEMO ONE entry fixes with VIA, check-ins use the frozen sentence, `kdem-ils27` is still the T04-12 demo, `?traffic=N` is still the downwind arc, **no** phase 5, T04-11 **not** implemented unless the human asked.

Then stop. Training / scoring wait on a new paste of this file with config changed.

---

## Archive — Fourth swarm (complete)

Frozen config from the completed phase 4 procedures swarm (T04-01–10, T04-12; skip T04-11). Do not execute this archive. STATUS: **FOURTH SWARM COMPLETE**.

| Key | Value |
| --- | --- |
| Goal | Implement **phase 4 procedures** until `phases/04-procedures/README.md` **Phase exit** is green |
| Skip | **T04-11** |
| Include | **T04-08** CIFP subset importer — required, offline fixture |
| Stop | Did not start phase 5 |
| Tickets | T04-01–10, T04-12 |

Waves executed: A (T04-01 ∥ T04-09) → B (T04-02 ∥ T04-08 ∥ T04-10) → C (T04-03) → D (T04-04 ∥ T04-05) → E (T04-06) → F (T04-07) → G (T04-12).

Captain return (historical): `PHASE EXIT GREEN` — Phase 4 Procedures (T04-01–10, 12; skipped 11). Merged T04-01–10, T04-12 plus CI fix/format. Tests 927 passed, 1 skipped.
