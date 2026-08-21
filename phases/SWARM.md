# ATC-SIM swarm orchestrator — TCW polish (STARS-like)

Paste **this entire file** into a new agent. That agent is the **orchestrator**. It may run for hours. It writes almost no application code.

Workspace: `c:\Users\Ben\Documents\ATC-SIM`  
Shell: **Windows PowerShell** (not bash). Ticket commits use here-strings, not `cat <<'EOF'`.

This is the **second swarm**. Phases **0 → 1 → 2 (T02-01–13)** are already green on `master`. Do **not** redo them. Do **not** start voice.

---

## Config (frozen for this run)

| Key | Value |
| --- | --- |
| Goal | Implement **T02-14 → T02-21** until the phase 2 README **Phase 2 polish checklist** is green (TCW / STARS-*like* grammar) |
| Feel | Cheap STARS trainer / vice-like **TCW**, not a web app on a radar. Match *grammar* (dark PPI, green DCB cells, video maps, FDB, SSA). **Do not** pixel-clone a NY STARS screenshot or Raytheon internals |
| Stop | **Do not start phase 3, 4, or 5.** No `speech-api`, no PTT, no T03-* |
| Do not redo | T00-*, T01-*, T02-01–T02-13 (already merged). If STATUS says first swarm complete, **resume polish**, do not replay phase 0 |
| Max ticket workers in flight | **3** |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** Every Task spawn sets `model: "cursor-grok-4.6-high"`. No `composer-2.5-fast`, no omitting `model` |
| Paid STT/TTS | Forbidden |

If `phases/SWARM-STATUS.md` already lists polish tickets green, **stop**. Do not redo merged tickets.

T02-14 (video-map catalog) may already exist on a local branch (`ticket/video-maps-json-catalog` or similar). Captain: **land that work** (rebase onto `master`, merge `--no-ff`) instead of re-implementing.

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

Do **not** paste `phases/02-scope/AGENT.md` into one agent. Swarm mode uses **one worker per ticket**.

Prompts to give children (read the file, then add the line):

- Captain: full `phases/SWARM-CAPTAIN.md` + **`Phase folder: phases/02-scope/`** + **`Tickets: T02-14 … T02-21 only (polish waves in SWARM.md)`** + **`model: cursor-grok-4.6-high` on every worker**
- Worker: full `phases/SWARM-TICKET-WORKER.md` + ticket id/path + PowerShell commit here-strings + **this run’s product law** (below)

Workers **must not** end the captain’s turn. Captain **must not** `run_in_background: true` on a worker and then exit. Wait for `READY TO MERGE` / `BLOCKED`. Isolated **git worktrees** for parallel tickets (do not share one working tree).

---

## Product law (every descendant)

CRC/vNAS STARS and vice are **references for feel**. Training/entertainment only. Not a Raytheon clone. Not NAS-certified.

**Do (grammar):**

- Dark north-up **PPI**. Discrete **range** 5–60 NM. **No zoom-to-cursor.**
- **DCB** = green **cell grid** on the glass (T02-16+), not a grey HTML toolbar with `<input>` / Apply.
- **Video maps** from `src/scenario/video-maps/<ICAO>/` (T02-14). Rings generated (RR), not OSM / tiles.
- **Datablock / leader / Mode C** glossary words. IBM Plex Mono or system mono — **no STARS font**.
- Scope keys and DCB clicks **never** emit Command IR, readback, or intent. Radio: `DAL123 H270` still turns.
- Typed radio stays **tokens** (`H270`). Do not implement Path A spoken English.

**Do not clone (non-goals still win):**

- WX1–6 mosaic, SITE FUSED, PREF sets, SHIFT, CSA, CRDA, FMA, dual FSL/EFSL
- Real video-map IDs (`221 J_RNAV`, …), licensed STARS typeface, weather, OSM, airplane sprites
- Full NAS handoff / beacon / FP scratchpad from a host

Polish tickets **may amend named rows** in `phases/02-scope/README.md` when the ticket says so (palette, FDB lines, DCB look). They must **not** change Command IR types, parser tokens, or `SpeechPort`.

Research: `phases/_shared/references.md` (**R07**, **R08**, **R12**, **R02**, **R05**, **R06**). User-facing copy: **range / datablock / leader / Mode C**, never zoom / nametag / sprite / HUD.

---

## Your loop (orchestrator)

1. `git checkout master` && `git status`. If dirty and it is not yours, **stop**.
2. Read `phases/SWARM-STATUS.md`. Append a **second swarm started** heading with this config table. Do not delete first-swarm notes.
3. Confirm T02-01–13 are on `master` (first swarm). If not, **BLOCKED** — this file is not the 0→1→2 swarm.
4. Spawn **one** captain for `phases/02-scope/` polish only. Wait until `PHASE EXIT GREEN` or `BLOCKED`.
5. If `BLOCKED`: copy the note into STATUS, **stop**, tell the human. Do not start phase 3.
6. If green: tick polish in STATUS, `npm test` yourself once. Write STATUS **SECOND SWARM COMPLETE — TCW polish; still stopped before voice**. List remaining work (phases 3–5). **Stop.**

Keep STATUS updated after the polish run (not after every ticket — the captain does ticket notes).

Manual UI ACs: captain/workers do what they can; leftover Chrome steps go in STATUS. Automated `npm test` / `npm run ci` must be green to declare polish green. Do not invent a visual pass.

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
T02-14: message why.

Second paragraph why.
"@
```

---

## Waves (captain must follow)

Dependencies on the ticket still win if a wave disagrees.

Phase folder: `phases/02-scope/`  
Tickets: **only** `T02-14` … `T02-21`.

| Wave | Tickets (≤3) | Wait for |
| --- | --- | --- |
| A | T02-14 | First swarm (T02-01–13 on `master`) |
| B | T02-15, T02-18 | A (18 also T02-03 / T02-08 — already on master) |
| C | T02-16 | T02-15 |
| D | T02-17, T02-19 | C; 17 also T02-14; 19 also T02-18 |
| E | T02-20 | T02-15 + T02-11 (11 already on master) |
| F | T02-21 | D + E |

Do **not** skip T02-16 to “just add MAPS.” Cell grid before MAPS submenu.

Ticket files / branches:

- `ticket/T02-14-video-map-catalog` ← `phases/02-scope/tickets/T02-14-video-map-catalog.md`
- `ticket/T02-15-trainer-chrome-off-tcw` ← `phases/02-scope/tickets/T02-15-trainer-chrome-off-tcw.md`
- `ticket/T02-16-dcb-cell-grid` ← `phases/02-scope/tickets/T02-16-dcb-cell-grid.md`
- `ticket/T02-17-dcb-maps-range-rr-ldr-brite` ← `phases/02-scope/tickets/T02-17-dcb-maps-range-rr-ldr-brite.md`
- `ticket/T02-18-position-symbol-and-history-contrast` ← `phases/02-scope/tickets/T02-18-position-symbol-and-history-contrast.md`
- `ticket/T02-19-datablock-scratchpad-type-leader-length` ← `phases/02-scope/tickets/T02-19-datablock-scratchpad-type-leader-length.md`
- `ticket/T02-20-ssa-status-and-on-ppi-lists` ← `phases/02-scope/tickets/T02-20-ssa-status-and-on-ppi-lists.md`
- `ticket/T02-21-tcw-visual-acceptance` ← `phases/02-scope/tickets/T02-21-tcw-visual-acceptance.md`

Exit: `phases/02-scope/README.md` **Phase 2 polish checklist**. Typed `DAL123 H270` still readbacks and turns. `npm test` / `npm run ci` green. T02-21 manual leftovers listed, not faked.

---

## Burden limits

- Orchestrator: no `src/` edits except STATUS. No “I’ll just do T02-16 myself.”
- Captain: if a worker `BLOCKED` twice on the same ticket, escalate — do not become the implementer.
- Worker: one ticket, even if Size L (T02-16, T02-17, T02-20). No bonus tickets.
- Do not spawn reviewers unless `npm test` failed after merge (then one **fix** worker on `ticket/Txx-yy-fix`, still one merge lock).

Size L this run: **T02-16, T02-17, T02-20**.

---

## Captain return (mandatory)

```
PHASE EXIT GREEN
Phase: 2 Scope polish (T02-14–21)
Merged: T02-14 … T02-21
Tests: npm test / npm run ci exit 0
Manual leftover: <Chrome script items or none>
Notes: <short; radio loop still works>
```

or `PHASE EXIT BLOCKED` with reason. Do not return “wave A is running” as done.

---

## Done when

Polish checklist can be argued green, `npm test` green on `master`, STATUS says **second swarm complete**, **no** `speech-api/` or T03-* commits, and the glass is a **STARS-like TCW** (cells, maps, SSA) rather than a website toolbar.

Then stop. Voice / procedures / training wait on a new paste of this file with config changed.
