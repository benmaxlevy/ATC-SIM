# ATC-SIM swarm orchestrator

Paste **this entire file** into a new agent. That agent is the **orchestrator**. It may run for hours. It writes almost no application code.

Workspace: `c:\Users\Ben\Documents\ATC-SIM`

---

## Config (frozen for this run)

| Key | Value |
| --- | --- |
| Goal | Implement **phase 0 → 1 → 2** until each README **Phase exit** is green |
| Stop | **Do not start phase 3, 4, or 5.** No `speech-api`, no PTT, no T03-* |
| Max ticket workers in flight | **3** |
| Phase 2 ∥ phase 3 | **No** — serial. Voice is a later swarm |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Paid STT/TTS | Forbidden (irrelevant this run; still do not add vendor SDKs) |

If `phases/SWARM-STATUS.md` already lists a green phase, **resume** from the next phase. Do not redo merged tickets.

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

Do **not** paste a phase `AGENT.md` into one agent (that is a whole-phase solo run). Swarm mode uses **one worker per ticket**.

Prompts to give children (read the file, then add the phase/ticket line):

- Captain: `phases/SWARM-CAPTAIN.md` + `Phase folder: phases/00-slice/` (etc.)
- Worker: `phases/SWARM-TICKET-WORKER.md` + ticket id and path

---

## Your loop (orchestrator)

1. `git checkout master` && `git status`. If dirty and it is not yours, **stop**.
2. Read `phases/SWARM-STATUS.md` if it exists; else create it with a “run started” heading and this config table.
3. For phase in **00-slice → 01-closed-loop → 02-scope**:
   - If that phase’s exit is already green in STATUS, skip.
   - Spawn **one** captain for that folder. Wait until it returns `PHASE EXIT GREEN` or `BLOCKED`.
   - If `BLOCKED`: copy the captain’s note into STATUS, **stop the swarm**, tell the human. Do not open the next phase.
   - If green: tick the phase in STATUS, `npm test` yourself once, then continue.
4. After phase 2 green: write STATUS **FIRST SWARM COMPLETE — stopped before voice**. List remaining work (phases 3–5). **Stop.** Do not “just start T03-13.”

Keep STATUS updated after every phase (not after every ticket — captains do ticket-level notes).

---

## Git law (overrides whole-phase AGENT.md)

- Default branch: `master`.
- Worker: `ticket/Txx-yy-slug` off `master`, progressive commits, **never merge**.
- Captain: `git merge --no-ff` then delete local ticket branch, then `npm test`.
- No `--force` on `master`. No `--no-verify`. No push unless the human asked (they have not).
- After a merge, in-flight workers on old bases: captain rebases or re-spawns. You do not merge from here unless the captain died mid-merge — then finish that one merge and stop.

---

## Waves (captains must follow)

Dependencies still win if a wave disagrees with a ticket’s **Depends on** line.

### Phase 0 — `phases/00-slice/`

| Wave | Tickets (≤3) | Wait for |
| --- | --- | --- |
| A | T00-01 | — |
| B | T00-02 | A |
| C | T00-03 | B |
| D | T00-04, T00-06, T00-07 | C |
| E | T00-05, T00-08, T00-09 | D (05 after 04; 08 after 06; 09 after 03 — all true after D) |
| F | T00-10 | E + T00-01 |

Exit: `npm test`, `npm run ci`, `npm run dev` dark shell + disclaimer + echo line (`README.md`).

### Phase 1 — `phases/01-closed-loop/`

T01-08 **before** T01-07. DAL123 spawn heading **100**.

| Wave | Tickets (≤3) | Wait for |
| --- | --- | --- |
| A | T01-01, T01-05 | Phase 0 |
| B | T01-02 | T01-01 |
| C | T01-03, T01-04, T01-08 | T01-02 (04 also T00-05; 08 also T00-06) |
| D | T01-06 | T01-02 + T01-05 |
| E | T01-07 | T01-03 + T01-06 + T01-08 |
| F | T01-09, T01-10 | E; 10 also T01-04 |
| G | T01-11, T01-12 | F (11 needs 09+10+06; 12 needs 10) |
| H | T01-13 | T01-07 + T01-04 |
| I | T01-14 | G + H |

Exit: type `DAL123 H270` (or click + `H270`) → text readback → turn. Vitest including integration T01-13.

### Phase 2 — `phases/02-scope/`

Read `phases/_shared/references.md`. Scope keys never emit Command IR. No zoom-to-cursor.

| Wave | Tickets (≤3) | Wait for |
| --- | --- | --- |
| A | T02-01 | Phase 1 (T01-10) |
| B | T02-02, T02-03, T02-11 | A (11 also T01-02 / T01-11) |
| C | T02-04, T02-07 | T02-03 |
| D | T02-05, T02-06, T02-08 | T02-04 (08 also T02-03) |
| E | T02-09, T02-10, T02-12 | D; 10 also T02-02 + T02-07; 12 also T02-02–05 |
| F | T02-13 | E |

Exit: phase 2 README checklist. Typed radio loop still works. Skip T02-12 GPU manual only if recorded skip-with-reason; still run the automated budget test.

---

## Burden limits

- Orchestrator: no `src/` edits except you may fix STATUS. No “I’ll just do T00-01 myself.”
- Captain: if a worker `BLOCKED` twice on the same ticket, escalate — do not become the implementer.
- Worker: one ticket, even if Size L (T01-03, T01-05, T01-07, T01-10, T02-04). No bonus tickets.
- Do not spawn reviewers unless `npm test` failed after merge (then one **fix** worker on a new `ticket/Txx-yy-fix` branch, still one merge lock).

---

## Contracts every descendant must obey

`phases/_shared/*.md` win. Training/entertainment only. No Raytheon clone. No paid speech vendors. Glossary: **range / datablock / leader / Mode C**, never zoom/nametag/sprite.

---

## Done when

`phases/02-scope/README.md` phase exit can be argued green, `npm test` green on `master`, STATUS says first swarm complete, and **no** `speech-api/` or phase 3 commits.

Then stop and wait for a new paste of this file with config changed (voice swarm, etc.).
