# ATC-SIM swarm orchestrator — Phase 4 procedures

Paste **this entire file** into a new agent. That agent is the **orchestrator**. It may run for hours. It writes almost no application code.

Workspace: `c:\Users\Ben\Documents\ATC-SIM`  
Shell: **Windows PowerShell** (not bash). Ticket commits use here-strings, not `cat <<'EOF'`.

This is the **fourth swarm**. Phases **0 → 1 → 2 (T02-01–13)** are already green on `master`. Phase **3 voice** is preferred (same parser tokens work through SpeechPort) but **not required**. Do **not** redo 0–3. Do **not** start phase 5.

---

## Config (frozen for this run)

| Key | Value |
| --- | --- |
| Goal | Implement **phase 4 procedures** until `phases/04-procedures/README.md` **Phase exit** is green. Aircraft fly published STAR/ILS geometry; CA and MSAW light yellow then red |
| Player loop | Spawn on DEMO ONE → vectors → intercept heading → `APP ILS27` → loc then GS from below → tower stub **or** missed at DA |
| Skip | **T04-11** (constant wind) unless the human later names it. Not required to exit |
| Include | **T04-08** CIFP subset importer — **required**. Frozen in-repo fixture only; **no network**, no full FAA cycle, no chart scrape |
| Stop | **Do not start phase 5.** No scoring, replay, imperfect pilots, or second TCP |
| Do not redo | T00-*, T01-*, T02-*, T03-*. If STATUS says third swarm complete, **start phase 4**, do not replay voice |
| Max ticket workers in flight | **3** |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** Every Task spawn sets `model: "cursor-grok-4.6-high"`. No `composer-2.5-fast`, no omitting `model` |
| Paid STT/TTS/LLM | **Forbidden.** Do not regress speech-api onto vendors. Do not edit phase 3 tickets |

If `phases/SWARM-STATUS.md` already lists phase 4 exit green with T04-* merged (except skipped 11), **stop**. Do not redo merged tickets.

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

- Captain: full `phases/SWARM-CAPTAIN.md` + **`Phase folder: phases/04-procedures/`** + **`Tickets: T04-01 … T04-10, T04-12 only (waves in SWARM.md). Skip T04-11`** + **`model: cursor-grok-4.6-high` on every worker**
- Worker: full `phases/SWARM-TICKET-WORKER.md` + ticket id/path + PowerShell commit here-strings + **this run’s product law** (below)

Workers **must not** end the captain’s turn. Captain **must not** `run_in_background: true` on a worker and then exit. Wait for `READY TO MERGE` / `BLOCKED`. Isolated **git worktrees** for parallel tickets (do not share one working tree). Wave A (T04-01 / T04-09) and wave B (T04-02 / T04-08 / T04-10) **must** use separate worktrees.

---

## Product law (every descendant)

CRC/vNAS STARS and vice are **references for feel**. Training/entertainment only. Not a Raytheon clone. Not NAS-certified. Alerts are **lite**, never “MSAW certified.”

**Procedures (this swarm):**

- **KDEM stays the default facility.** Mag var 0°, elev 0 ft, rwy 27. Real airports are importer output, not a v1 replacement.
- **Procedures and navaids are data, not code.** Load `src/scenario/data/kdem/` (`vors`, `ndbs`, `ils`, `fixes`, `procedures`, `sids`). Catalog types are **ICAO-generic** (`airportId: string`, `sids: []`, optional lat/lon). `DCT` resolves fixes **and** navaids (`DEM`). `stepWorld` consumes a resolved route — no hard-coded lat/lon in the tick. **Do not** build a live FAA/`faa:update` script in this swarm.
- **Pilot agent still owns intent.** Parser never calls kinematics. Scope never calls intercept math. Alerts are a **pure function** of `World` (+ catalog).
- **Heading cancels published lateral path.** `FLY_HEADING` / `TURN_DEGREES` / `PRESENT_HEADING` drop STAR, DIRECT, and loc/approach. Re-clear `APP` to arm intercept again.
- **`EXPECT_APPROACH` does not capture.** `CLEARED_APPROACH` (`APP ILS27`) arms intercept from the **current assigned heading** (or the heading in the same Command).
- **ILS phraseology = aircraft.** Canonical clearance: *turn right heading xxx, maintain xxxxx until established, cleared ILS approach runway 27*. One `Command`: `FLY_HEADING` + `ALTITUDE` (`untilEstablished`) + `CLEARED_APPROACH`. Typed: `R240 A20 APP ILS27`. Hold assigned altitude until loc capture; **do not** start GS before established. Readback uses those words.
- **Glidepath from below only, after loc.** Do not dive through GS from above. Do not capture GS in `INTERCEPT_LOC`.
- Phase 1 may have **accepted and no-op’d** `DIRECT` / `EXP` / `APP`. This phase **implements fly-through**. Do not leave “accepted but nothing happens” as success.
- New IR variants (`DESCEND_VIA`, `CROSS`, optional `GO_AROUND`): **patch `phases/_shared/command-ir.md` in the same PR** as the TypeScript union. Do **not** rename existing instruction types.
- `D` remains descend. Direct is **`DCT`**. Do not steal `D`.
- If phase 3 is present, new tokens work through the **same** `parseCommand`. Do **not** edit `src/speech` unless a ticket names a normalizer token list.

**Geometry (KDEM JSON; translate if airport ref moved):** rwy 27 inbound 270°, threshold GS origin, loc 18 NM, ±2.5° full scale, GS 3°, TCH 50 ft, FAF 6 NM / ~2000 ft, DA 200 ft, missed heading 270 to 3000, fix `MISSD`. STAR DEMO ONE (`DEM1`): **one** STAR, north `NEMAX→NELBO→NJOIN` and south `SEMAX→SELBO→SJOIN` merge at `MERGE`, then **VECTORS**. Alt + speed on every STAR fix. Video maps (including `DEM1` corridors) are **independent MAPS drawings**, not generated from the STAR. Navaids: `DEM` VOR, `OCT` VOR, `DMO` NDB, I-DEM loc/GS.

**Alerts:** CA pair `< 3 NM` **and** `< 1000 ft` — yellow = **predicted** (40 s linear lookahead), red = **now**. MSAW = below MVA polygon; inhibited on loc/GS/landing **inside FAF**. Color priority: `CA alert > MSAW alert > CA caution > MSAW caution > ownership`. No ARV, CRDA, weather, audio required.

**CIFP:** `tools/cifp-import` + frozen fixture only (offline). Same catalog schema as KDEM, including empty `sids`. Runtime default remains KDEM. **Never** scrape charts, fetch CIFP in the browser, commit a full FAA cycle, or ship `faa:update` in this run.

**Do not:**

- RNAV (RNP), SIDs, holds, procedure turns, DME arcs, circling, dual ILS, LAHSO, autoland flare, tower cab / ground.
- Full TAMR, weather mosaic, certified CA/MSAW, LLM as FMS.
- Start phase 5 scoring against the new session events — **emitting** `nav.*` / `alert.*` / `handoff.tower` is enough.
- Paid vendor speech. Always-on listen.

Research: `phases/_shared/references.md` **R01** (vectors/approaches), **R05** (CA/MSAW language), **R11** (CIFP). Frozen numbers: `phases/04-procedures/README.md`.

---

## Your loop (orchestrator)

1. `git checkout master` && `git status`. If dirty and it is not yours, **stop**.
2. Read `phases/SWARM-STATUS.md`. Append a **fourth swarm started** heading with this config table. Do not delete earlier swarm notes.
3. Confirm T02-01–13 (phase 2 original exit) are on `master`. If phase 2 is missing, **BLOCKED**. Phase 3 missing is **not** blocked — typed commands first. If STATUS still shows an in-flight third swarm, **stop** and tell the human.
4. Spawn **one** captain for `phases/04-procedures/` with the skip list above. Wait until `PHASE EXIT GREEN` or `BLOCKED`.
5. If `BLOCKED`: copy the note into STATUS, **stop**, tell the human. Do not start phase 5.
6. If green: tick phase 4 in STATUS, `npm test` yourself once. Write STATUS **FOURTH SWARM COMPLETE — phase 4 procedures**. List leftover Chrome/script steps (T04-12); list remaining work (phase 5). **Stop.**

Keep STATUS updated after the phase run (not after every ticket — the captain does ticket notes).

Manual UI ACs (STAR → ILS playtest): captain/workers do what they can; leftover Chrome steps go in STATUS. Automated `npm test` / `npm run ci` must be green. CA/MSAW and CIFP fixture tests must be automated — do not invent a visual pass. T04-11 leftover is expected (skipped).

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
T04-01: message why.

Second paragraph why.
"@
```

---

## Waves (captain must follow)

Dependencies on the ticket still win if a wave disagrees.

Phase folder: `phases/04-procedures/`  
Tickets: **T04-01–10, T04-12**. **Skip T04-11.**

| Wave | Tickets (≤3) | Wait for |
| --- | --- | --- |
| A | T04-01, T04-09 | Phase 2 on `master`. Schema/catalog vs CA lite — different trees |
| B | T04-02, T04-08, T04-10 | A (need **T04-01**). Lookup vs CIFP tool vs MSAW |
| C | T04-03 | B (needs T04-02). Size L FMS — **alone** |
| D | T04-04, T04-05 | C. Via/CROSS ∥ loc intercept. Isolated worktrees; 04 patches `_shared/command-ir.md` |
| E | T04-06 | D (needs T04-05). GS from below — **alone** |
| F | T04-07 | E. Missed stub; patch `_shared` in the same PR if adding `GO_AROUND` |
| G | T04-12 | F **and** T04-04, T04-09, T04-10 already on `master`. Playable scenario + acceptance |

Do **not** skip T04-01 and hard-code KDEM lat/lon in `stepWorld`. Do **not** skip T04-08. Do **not** skip T04-03 and jump to ILS. Do **not** capture GS from above. Do **not** start T04-12 before missed + alerts exist.

Ticket files / branches:

- `ticket/T04-01-procedure-json-schema-kdem-ils27-star` ← `phases/04-procedures/tickets/T04-01-procedure-json-schema-kdem-ils27-star.md`
- `ticket/T04-02-nav-fix-lookup` ← `phases/04-procedures/tickets/T04-02-nav-fix-lookup.md`
- `ticket/T04-03-lateral-fms-direct-fly-by` ← `phases/04-procedures/tickets/T04-03-lateral-fms-direct-fly-by.md`
- `ticket/T04-04-descend-climb-via-crossing-alts` ← `phases/04-procedures/tickets/T04-04-descend-climb-via-crossing-alts.md`
- `ticket/T04-05-vector-to-intercept-localizer` ← `phases/04-procedures/tickets/T04-05-vector-to-intercept-localizer.md`
- `ticket/T04-06-glidepath-approach-phase` ← `phases/04-procedures/tickets/T04-06-glidepath-approach-phase.md`
- `ticket/T04-07-missed-approach-stub` ← `phases/04-procedures/tickets/T04-07-missed-approach-stub.md`
- `ticket/T04-08-cifp-subset-importer` ← `phases/04-procedures/tickets/T04-08-cifp-subset-importer.md`
- `ticket/T04-09-conflict-alert-lite` ← `phases/04-procedures/tickets/T04-09-conflict-alert-lite.md`
- `ticket/T04-10-msaw-lite` ← `phases/04-procedures/tickets/T04-10-msaw-lite.md`
- `ticket/T04-12-phase-4-scenario-vector-ils-tower` ← `phases/04-procedures/tickets/T04-12-phase-4-scenario-vector-ils-tower.md`

**Not this run:** `T04-11-constant-wind-optional`.

Exit: `phases/04-procedures/README.md` **Phase exit**. Typed `DAL123 H270` still turns (and **cancels** FMS). Combined ILS clearance parses and flies. `DCT` / `EXP` / `APP` / `VIA` fly through. `npm test` / `npm run ci` green. CIFP fixture tests **offline**. T04-12 manual leftovers listed, not faked. Wind absent is **not** a failure.

---

## Burden limits

- Orchestrator: no `src/` or `tools/` edits except STATUS. No “I’ll just do T04-03 myself.”
- Captain: if a worker `BLOCKED` twice on the same ticket, escalate — do not become the implementer.
- Worker: one ticket, even if Size L (T04-01, T04-03, T04-05, T04-06). No bonus tickets. No T04-11 “while you are here.” No phase 5 scoring.
- Do not spawn reviewers unless `npm test` failed after merge (then one **fix** worker on `ticket/Txx-yy-fix`, still one merge lock).

Size L this run: **T04-01, T04-03, T04-05, T04-06**.

---

## Captain return (mandatory)

```
PHASE EXIT GREEN
Phase: 4 Procedures (T04-01–10, 12; skipped 11)
Merged: T04-01 … (list)
Tests: npm test / npm run ci exit 0
Manual leftover: <T04-12 Chrome script items or none>
Notes: <KDEM catalog; APP fly-through; CA/MSAW lite; CIFP fixture; no wind>
```

or `PHASE EXIT BLOCKED` with reason. Do not return “wave A is running” as done.

---

## Done when

Phase 4 exit can be argued green, `npm test` green on `master`, STATUS says **fourth swarm complete**, KDEM procedure JSON is the runtime catalog, `APP ILS27` captures loc then GS, CA/MSAW are tested, CIFP importer is fixture-only, **no** chart scrape, T04-11 **not** implemented unless the human asked.

Then stop. Training / scoring wait on a new paste of this file with config changed.
