# ATC-SIM swarm orchestrator — Phase 2 post-exit addendum (T02-22–30 trainer DCB)

Paste **this entire file** into a new agent. That agent is the **orchestrator**. It may run for hours. It writes almost no application code.

Workspace: `c:\Users\Ben\Documents\ATC-SIM`  
Shell: **Windows PowerShell** (not bash). Ticket commits use here-strings, not `cat <<'EOF'`.

## Mandatory first action

Before checking git, spawning agents, creating worktrees, or editing application code, update this file for the current swarm. Append a new swarm-start heading/configuration; do not overwrite prior swarm history. If the requested swarm configuration is incomplete, ask before making any other swarm move. Then commit the planning/status update before creating ticket branches or worktrees.

This is the **seventh swarm**. Phases **0 → 1 → 2 (T02-01–13) → 2 polish (T02-14–21) → 3 → 4 (T04-01–10, T04-12) → 4 addenda (T04-13–17)** are already green on `master`. Do **not** redo 0–6th. Do **not** start phase 5 scoring. Skip **T04-11** (wind) unless the human names it.

---

## Seventh swarm started — T02-22–30 trainer DCB addendum

Orchestrator planning **2026-08-23**. Human: DCB spec → tickets T02-22–30, then “I’m away — make any calls.” Historical phase 2 exit/polish and sixth swarm (T04-16–17) stay green. This run is **T02-22–30 only**. Not phase 5. Not a redo of T02-01–21.

| Key | Value |
| --- | --- |
| Goal | Trainer DCB grows toward CRC STARS **jobs and grammar**: MAIN/AUX via SHIFT, submenu replace, spinners, disabled WX, local PREF 1–8 |
| Player loop | `npm run dev` → green DCB on glass → SHIFT AUX → RANGE spinner (presets) → MAPS 1–6 → WX cells visible and dead → PREF save/restore after reload |
| Skip | **T04-11**. All of **T00–T01**, **T02-01–21** (already merged). All of **T03-***, **T04-***, **T05-*** |
| Include | **T02-22**, **T02-23**, **T02-24**, **T02-25**, **T02-26**, **T02-27**, **T02-28**, **T02-29**, **T02-30** |
| Stop | **Do not start phase 5.** No scoring, replay, imperfect pilots, or second TCP. Do not reopen T02-01–21 |
| Do not redo | T00–T04-17. If STATUS says seventh swarm complete, **stop** |
| Max ticket workers in flight | **3** (wave A = 1; B = 3; C = 3; D = 1; E = 1) |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** `model: "cursor-grok-4.6-high"` on every Task spawn |
| Paid STT/TTS/LLM | **Forbidden** |

**Judgement — WX is chrome only.** WX1–4 (and BRITE WX/WXC/BKC) exist **disabled**. No mosaic, precip, NEXRAD, or weather draw. Human named this freeze.

**Judgement — RANGE stays eight presets.** Spinner arms/steps `5, 10, 15, 20, 30, 40, 50, 60` NM. No continuous zoom, no CRC extra values.

**Judgement — spinner cursor trap is analog, not Pointer Lock.** Arm on click, `setPointerCapture` / clamp-to-cell if cheap, wheel steps, second click or Esc commits. Do **not** require `requestPointerLock` (hostile in a browser trainer, painful to test).

**Judgement — FILTER stays on MAIN.** Altitude filter cell is a trainer delta. SSA FILTER (T02-27) only hides SSA lines.

**Judgement — MAPS 7–30 empty.** KDEM catalog has six maps. Unused numbered slots are disabled. No OSM filler.

**Judgement — PREF is 8 localStorage slots.** Not 32 NAS sets. No `prompt()` / `<input>`. SAVE AS → first empty `PREF n`.

**Judgement — TPA J-rings yes; ATPA stub.** 2/3/5/10 NM circles. ATPA is toggle/disabled with no pairing engine. CA stays T04-09 text — **no** 3 NM CA halo.

**Judgement — VOL / MODE / SITE disabled.** Labels may read `FSL` / `FUSION`. Do not touch OS audio.

**Judgement — leave `e2e/` untracked.** Do not stage QA screenshots.

If `phases/SWARM-STATUS.md` already lists **seventh-swarm** exit green with T02-22–30 merged, **stop**.

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

If `phases/SWARM-STATUS.md` already lists fifth-swarm exit green with T04-13–15 merged, **do not redo them.** Continue with the sixth swarm below.

If STATUS already lists **sixth-swarm** exit green with T04-16–17 merged, **stop**.

---

## Sixth swarm started — T04-16–17 inbound handoff (spawn accept)

Orchestrator planning **2026-08-23**. Human: `/run-swarm` for spawn **handoff accept** (untracked → accept → yours) plus a CA 3 NM circle **only if** CRC/vSTARS/STARS analog exists. Human is away; judgements below are frozen. Not phase 5. Not a redo of T04-13–15.

| Key | Value |
| --- | --- |
| Goal | Default STAR arrivals spawn **pending inbound handoff** from sector `C`. Student **slew/click** to accept. Then owned **white** FDB; radio vectors work. Check-in waits until owned |
| Player loop | `npm run dev` → green unowned FDBs with HO cue → click DAL123 → white owned → `DAL123 H270` turns / cancels FMS → check-in after accept |
| Skip | **T04-11**. All of **T04-01–15** (already merged). All of **T05-***. **CA 3 NM circles** (see judgement) |
| Include | **T04-16**, **T04-17** only |
| Stop | **Do not start phase 5.** No scoring, replay, imperfect pilots, or second TCP |
| Do not redo | T00–T04-15. If STATUS says sixth swarm complete, **stop** |
| Max ticket workers in flight | **3** (this run: wave A = 1; wave B = 1) |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** `model: "cursor-grok-4.6-high"` on every Task spawn |
| Paid STT/TTS/LLM | **Forbidden** |

**Judgement — CA 3 NM circles: DO NOT IMPLEMENT.** CRC STARS STCA (R07) paints blinking **`CA`** in the datablock + a tone when predicted/current sep `< 3 NM` and `< 1000 ft`. It does **not** draw a 3 NM circle on CA. Circles in CRC are **TPA J-rings** (manual `*J`, controller-chosen radius) or **ERAM DRI/halos** (QP; 5 NM standard / gapped 3 NM reduced) — ERAM, not STARS CA. VRC optional “separation rings on conflict” is a VATSIM client, not CRC STARS. Authority order: CRC STARS > vSTARS lore > VRC. Existing T04-09 CA lite (yellow then red FDB) stays. No halo ticket.

**Judgement — owned color is white, not green.** CRC + our `PALETTE`: unowned/other-TCP **green**, owned-by-you **white**. Human said “become green”; we keep CRC grammar already frozen in T02-08. Pending HO = green + HO cue; accept = white.

**Judgement — authored / FPS bench skip HO.** `kdem-ils27` and `?traffic=N` stay commandable without accept so T04-12 and the FPS bench do not break.

**Chore before Wave A (captain):** if `fix/star-inbound-spawn-spacing` is not on `master`, merge it `--no-ff` first (8 NM same-STAR stagger; already implemented). Then start T04-16 from that `master`.

Captain spawn follows this planning commit.

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

## Seventh swarm — roles, product law, waves

Phase folder: `phases/02-scope/`  
Tickets: **T02-22–30**. **Skip T02-01–21** (already on master).

| Wave | Tickets (≤3) | Wait for |
| --- | --- | --- |
| A | T02-22 | T02-21 on `master` |
| B | T02-23 ∥ T02-24 ∥ T02-25 | A. Isolated worktrees |
| C | T02-26 ∥ T02-27 ∥ T02-28 | B (28 needs **T02-25**) |
| D | T02-29 | C (23–27 at least; 28 optional) |
| E | T02-30 | D |

Captain prompt extras: full `phases/SWARM-CAPTAIN.md` + **`Phase folder: phases/02-scope/`** + **`Tickets: T02-22–30 only (waves above). Skip T02-01–21`** + **`model: cursor-grok-4.6-high` on every worker** + frozen judgements in this seventh-swarm section.

Worker extras: full `phases/SWARM-TICKET-WORKER.md` + ticket id/path + this run’s product law.

**Product law (seventh swarm — trainer DCB):**

- Scope/DCB **never** emit Command IR. `DAL123 H270` still turns.
- Discrete RANGE presets only. No zoom-to-cursor.
- Disabled WX/VOL/MODE/SITE. No weather paint. No OS volume.
- MAPS from catalog JSON only. Slots 7–30 disabled if empty.
- PREF 1–8 in `localStorage`, facility-keyed, versioned. Not a NAS host.
- TPA = J-rings. ATPA = stub. No CA halo.
- CHAR SIZE stays Plex/system mono. No STARS `.ttf`.
- Spinner: arm / wheel / commit. Pointer Lock not required.
- FILTER (altitude) stays on MAIN. SSA FILTER is visibility.
- Do not start T05-*. Do not edit phase 3 tickets. Paid speech forbidden.

Ticket files / branches:

- `ticket/T02-22-dcb-menu-model-and-primitives` ← `phases/02-scope/tickets/T02-22-dcb-menu-model-and-primitives.md`
- `ticket/T02-23-dcb-main-range-cntr-rr-ldr` ← `phases/02-scope/tickets/T02-23-dcb-main-range-cntr-rr-ldr.md`
- `ticket/T02-24-dcb-maps-wx-disabled` ← `phases/02-scope/tickets/T02-24-dcb-maps-wx-disabled.md`
- `ticket/T02-25-dcb-aux-history-ptl-dock` ← `phases/02-scope/tickets/T02-25-dcb-aux-history-ptl-dock.md`
- `ticket/T02-26-dcb-brite-char-size-submenus` ← `phases/02-scope/tickets/T02-26-dcb-brite-char-size-submenus.md`
- `ticket/T02-27-dcb-ssa-gi-filters` ← `phases/02-scope/tickets/T02-27-dcb-ssa-gi-filters.md`
- `ticket/T02-28-dcb-tpa-atpa-submenu` ← `phases/02-scope/tickets/T02-28-dcb-tpa-atpa-submenu.md`
- `ticket/T02-29-dcb-pref-sets` ← `phases/02-scope/tickets/T02-29-dcb-pref-sets.md`
- `ticket/T02-30-dcb-addendum-visual-acceptance` ← `phases/02-scope/tickets/T02-30-dcb-addendum-visual-acceptance.md`

Captain return:

```
PHASE EXIT GREEN
Phase: 2 Scope addendum (T02-22–30 trainer DCB)
Merged: T02-22 … T02-30
Tests: npm test / npm run ci exit 0
Manual leftover: <Chrome DCB walk or none>
Notes: <SHIFT/AUX; disabled WX; PREF 1–8; TPA rings; no phase 5>
```

or `PHASE EXIT BLOCKED` with reason.

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

Do **not** paste `phases/02-scope/AGENT.md` (or phase 4 AGENT) into one agent. Swarm mode uses **one worker per ticket**.

**This run (seventh swarm):** captain prompt extras and waves are in **Seventh swarm — roles, product law, waves** above. Do not run T04-16–17 again.

Workers **must not** end the captain’s turn. Captain **must not** `run_in_background: true` on a worker and then exit. Wait for `READY TO MERGE` / `BLOCKED`. Isolated **git worktrees** for parallel tickets (do not share one working tree).

---

## Product law (every descendant)

CRC/vNAS STARS and vice are **references for feel**. Training/entertainment only. Not a Raytheon clone. Not NAS-certified. Alerts are **lite**, never “MSAW certified.”

**Addendum (sixth swarm — inbound HO):**

- **KDEM stays the default facility.** Mag var 0°, elev 0 ft, rwy 27.
- **Default STAR pack** (`spawnPolicy: "star-inbound"`): each arrival spawns `handoff.kind === "inbound"` from sector **`C`**, `ownership === "unowned"` (green FDB). Radio that changes intent is **rejected** until accept.
- **Accept analog is CRC slew:** click/slew the track (T04-17). F3 on a pending inbound track **accepts** (same helper). After accept: `owned` **white** FDB (CRC + existing `PALETTE`). Do **not** invert owned to green.
- **`kdem-ils27` and `?traffic=N`:** `handoff.kind === "none"`; T04-12 ILS script and FPS bench stay commandable without a click.
- **Check-in waits for owned.** T04-15 phraseology unchanged. Do not fire `radio.checkin` while inbound pending; fire once after accept if due.
- **No CA 3 NM halo.** CRC STARS CA is `CA` text + tone; 3 NM circles are TPA J-rings or ERAM DRI.
- **VIA / STAR spawn already exist.** Do not rebuild FMS. Heading still **cancels** published path after the track is owned.
- **No new Command IR type.** Handoff is a **scope** action. Session events `handoff.inbound.offered` / `handoff.inbound.accepted` only. Phase 5 must **ignore** them (do not score).
- **No `"NEMAX"` / `"DEM1"` live branches.** Paid vendor speech forbidden. Do not edit phase 3 tickets. Do not start T05-*.

**Still true from phase 4 (do not reopen):** ILS from below after loc; heading cancels STAR; CA/MSAW lite (FDB color, no halo); CIFP fixture-only; no chart scrape; STAR entry spawn + check-in phraseology.

Research: `phases/_shared/references.md` **R07** CRC STARS accept-handoff / datablock colors / STCA; **R01** radar handoff. Tickets: `T04-16` / `T04-17`.

---

## Your loop (orchestrator)

1. Update this file first: append the current swarm-start heading/configuration and preserve all earlier swarm history. Commit the planning update before any branch/worktree or agent action.
2. Read `phases/SWARM-STATUS.md`, then `git checkout master` && `git status`. If dirty and it is not yours, **stop**.
3. Confirm T04-13–15 are on `master` (fifth swarm complete). If fifth-swarm exit is missing, **BLOCKED**. If STATUS already shows sixth swarm complete, **stop**.
4. Spawn **one** captain for **T04-16–17 only**. Wait until `PHASE EXIT GREEN` or `BLOCKED`.
5. If `BLOCKED`: copy the note into STATUS, **stop**. Do not start phase 5. Human is away — do not wait for a question.
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
Tickets: **T04-16, T04-17**. **Skip T04-01–15 and T04-11.**

| Wave | Tickets (≤3) | Wait for |
| --- | --- | --- |
| 0 | merge `fix/star-inbound-spawn-spacing` if absent | Fifth swarm on `master` |
| A | T04-16 | Wave 0. State + radio gate — **alone** |
| B | T04-17 | A (need **T04-16**). Click accept + HO cue + check-in hold |

Do **not** draw CA 3 NM circles. Do **not** invert owned color to green. Do **not** put inbound HO on `kdem-ils27` or `?traffic=N`. Do **not** add handoff as Command IR. Do **not** start T05-*.

Ticket files / branches:

- `ticket/T04-16-inbound-handoff-state` ← `phases/04-procedures/tickets/T04-16-inbound-handoff-state.md`
- `ticket/T04-17-accept-handoff-scope` ← `phases/04-procedures/tickets/T04-17-accept-handoff-scope.md`

**Not this run:** `T04-11-constant-wind-optional`. All T05-*. Redo of T04-01–15. CA halo.

Exit: tickets T04-16–17 ACs. Default session pending inbound HO; click accepts to owned white; radio works after accept; check-in after accept; ils27/traffic bench unchanged. `npm test` / `npm run ci` green. Manual leftovers listed, not faked.

---

## Burden limits

- Orchestrator: no `src/` or `tools/` edits except STATUS. No “I’ll just do T04-16 myself.”
- Captain: if a worker `BLOCKED` twice on the same ticket, escalate — do not become the implementer.
- Worker: one ticket. No bonus tickets. No CA halo “while you are here.” No phase 5 scoring. No rewriting T04-12’s ILS demo into RNG.
- Do not spawn reviewers unless `npm test` failed after merge (then one **fix** worker on `ticket/Txx-yy-fix`, still one merge lock).

Size this run: **T04-16 M, T04-17 M**.

---

## Captain return (mandatory)

```
PHASE EXIT GREEN
Phase: 4 Procedures addendum (T04-16–17 inbound HO)
Merged: T04-16, T04-17
Tests: npm test / npm run ci exit 0
Manual leftover: <default STAR spawn + check-in Chrome items or none>
Notes: <catalog pose; seeded default pack; ils27 deterministic; check-in radio; no phase 5>
```

or `PHASE EXIT BLOCKED` with reason. Do not return “wave A is running” as done.

---

## Done when

T04-16–17 ACs can be argued green, `npm test` green on `master`, STATUS says **sixth swarm complete**, default KDEM session spawns pending inbound HO from `C`, click accepts to owned white, radio works after accept, check-in waits until owned, `kdem-ils27` is still the T04-12 demo, `?traffic=N` is still the downwind arc, **no** CA 3 NM halo, **no** phase 5, T04-11 **not** implemented unless the human asked.

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
