# ATC-SIM swarm orchestrator — Phase 4 SIDs and randomized departures addendum (T04-18–23)

Paste **this entire file** into a new agent. That agent is the **orchestrator**. It may run for hours. It writes almost no application code.

Workspace: `/home/ben/ATC-SIM`
Shell: **bash** (Linux).

## Mandatory first action

Before checking git, spawning agents, creating worktrees, or editing application code, update this file for the current swarm. Append a new swarm-start heading/configuration; do not overwrite prior swarm history. If the requested swarm configuration is incomplete, ask before making any other swarm move. Then commit the planning/status update before creating ticket branches or worktrees.

This is the **ninth swarm**. Phases **0 → 1 → 2 (T02-01–13) → 2 polish (T02-14–21) → 2 DCB addendum (T02-22–30) → 2 physical replica (T02-31–33) → 3 → 4 (T04-01–10, T04-12) → 4 addenda (T04-13–17)** are already green on `master`. Do **not** redo 0–8th. Do **not** start phase 5 scoring. Skip **T04-11** (wind) unless the human names it. This run is **T04-18–23 only**.

---

## Ninth swarm started — T04-18–23 SIDs and randomized departures addendum

Orchestrator planning **2026-08-25**. Human requested SIDs and randomized (customizable) departures tickets. Historical swarms 1–8 stay green. This run is **T04-18–23 only**. Not phase 5. Not a redo of T04-01–17.

| Key | Value |
| --- | --- |
| Goal | Standard Instrument Departures (SIDs) and customizable/randomized departures: catalog schema & KDEM `DEM1` SID, FMS `CLIMB_VIA` & SID fly-by navigation, departure spawning off RW27, customizable/seeded traffic generator (`?departures=auto`), radio telephony check-in, end-to-end integration |
| Player loop | `npm run dev -- ?departures=auto` → STAR arrivals on DEMO ONE + periodic departures rolling off RW27, checking in on Departure frequency ("passing 1,200 climbing via the DEMO ONE departure"), climbing via SID constraints to top altitude, accepting radar vectors, and exiting airspace cleanly |
| Skip | **T04-11** (wind); all of **T00–T03**, **T02-***, **T04-01–17**, **T05-*** |
| Include | **T04-18**, **T04-19**, **T04-20**, **T04-21**, **T04-22**, **T04-23** |
| Stop | **Do not start phase 5.** No scoring, replay, imperfect pilots, or second TCP |
| Do not redo | T00–T04-17. If STATUS says ninth swarm complete, **stop** |
| Max ticket workers in flight | **3** (Wave A = 1; Wave B = 2; Wave C = 2; Wave D = 1) |
| Merge lock | **Only the phase captain** merges to `master` (squash merge, one commit per ticket) |
| Model | Inherit / default |
| Paid STT/TTS/LLM | **Forbidden** |

**Waves:**
- **Wave A (1 worker):** `T04-18` (SID procedure schema, KDEM fixture & video map) — **COMPLETE** (`15a2314`)
- **Wave B (2 workers):** `T04-19` (SID climb-via and FMS guidance) ∥ `T04-20` (Departure spawning and handoff lifecycle) — **COMPLETE** (`4ed8a58`, `f640363`)
- **Wave C (2 workers):** `T04-21` (Randomized & customizable departure generator) ∥ `T04-22` (Departure radio check-in & telephony) — **COMPLETE** (`d3dc743`, `65cdc39`)
- **Wave D (1 worker):** `T04-23` (SIDs and departures integration & acceptance) — **COMPLETE** (`54c56a2`)

**Ninth Swarm Status: COMPLETE & GREEN** (116/116 test files passed, 1275 tests passed, 0 failures, CI clean)

**Product law (ninth swarm — SIDs & departures):**
- **Data-first SIDs:** KDEM `DEM1` departure in `src/scenario/data/kdem/sids.json` is the shipped fixture; no `"DEM1"` or `"KDEM"` code branches in runtime FMS or helpers.
- **Climb Via & Vector Cancellation:** `CLIMB_VIA` honors published `AT_OR_BELOW` / `AT_OR_ABOVE` constraints and speed limits up to assigned top altitude. Radar vectors (`FLY_HEADING`, `TURN_DEGREES`) immediately cancel SID published routing and climb-via constraints.
- **Departure Spawning:** Roll/airborne spawn off active runway (RW27) with initial climb and initial SID leg armed; Tower handoff is auto-acquired / owned on radar (`white` FDB) per CRC STARS standard.
- **Smart Shift+H Handoff:** Pressing `Shift+H` on a selected track contextually detects destination: initiates handoff to **Tower** (`LANDING` mode) if arrival on final (inside 5 NM gate on LOC/GS), or initiates handoff to **Center** (`handoff.center`) if climbing outbound departure.
- **Customizable Traffic Stream:** Query parameter `?departures=auto` (or `?dep_rate=N`) enables periodic departures; default session without query parameter retains backward compatibility.
- **Deterministic PRNG:** Independent stream XOR for departure generator so arrival seeds remain bit-stable.
- **Telephony:** AIM 4-2-3 standard phraseology (`"Departure, <callsign>, passing <alt> climbing via the <SID> departure"`), queued cleanly through `CheckInQueue` without radio collisions.
- **Airspace Exit:** Departures reaching TRACON boundary (~28 NM) or cruising altitude are handed off out to Center and despawned cleanly (`nav.departed`).

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

## Seventh swarm resume — 2026-08-23 (captain interrupted)

Human interrupted the captain mid-wave (~45 min). **T02-22 is on `master`.** Wave B worktrees exist with **uncommitted** work:

| Ticket | Worktree | Branch |
| --- | --- | --- |
| T02-23 | `C:\Users\Ben\Documents\ATC-SIM-wt-T02-23` | `ticket/T02-23-dcb-main-range-cntr-rr-ldr` |
| T02-24 | `C:\Users\Ben\Documents\ATC-SIM-wt-T02-24` | `ticket/T02-24-dcb-maps-wx-disabled` |
| T02-25 | `C:\Users\Ben\Documents\ATC-SIM-wt-T02-25` | `ticket/T02-25-dcb-aux-history-ptl-dock` |

**Do not discard that work.** Resume Wave B in those worktrees: finish ACs, progressive commits, `READY TO MERGE`. Then Wave C (T02-26∥27∥28) from updated `master`, then D T02-29, then E T02-30. Same frozen judgements. Still do not start phase 5.

---

## Seventh swarm resume — 2026-08-23 (Wave C)

Human: Wave **C is not done** — finish it. Prior captain ([cec8ebcb](cec8ebcb-dde2-4f84-993c-05a86f6a1a17)) merged A+B then spawned C workers and was interrupted (`check status` abort) before any C merge.

**On `master` now:** T02-22, T02-23, T02-24, T02-25 (`62a1e34`). Do **not** redo A/B.

**Wave C worktrees — preserve; do not reset/clean/discard:**

| Ticket | Worktree | Branch | State |
| --- | --- | --- | --- |
| T02-26 | `C:\Users\Ben\Documents\ATC-SIM-wt-T02-26` | `ticket/T02-26-dcb-brite-char-size-submenus` | **READY TO MERGE** (clean; 3 commits; worker ACs 6/6, `npm test` 1132 passed) |
| T02-27 | `C:\Users\Ben\Documents\ATC-SIM-wt-T02-27` | `ticket/T02-27-dcb-ssa-gi-filters` | **READY TO MERGE** (clean; 5 commits; worker ACs 6/6) |
| T02-28 | `C:\Users\Ben\Documents\ATC-SIM-wt-T02-28` | `ticket/T02-28-dcb-tpa-atpa-submenu` | **Not done.** Uncommitted `src/` + untracked `tpa.ts` / `tpa.test.ts`. Worker aborted mid-AC. Finish that tree. |

**C merge order (dirty-tree safe):**

1. Spawn **one** worker in the T02-28 worktree. Finish ACs on **current** `master` (same base as 26/27). Progressive commits. **Do not discard** uncommitted files. Wait for `READY TO MERGE`.
2. Captain `--no-ff` merge **T02-26**, then `npm test`.
3. Rebase **T02-27** onto updated `master`, `--no-ff` merge, `npm test`.
4. Rebase **T02-28** onto updated `master` (DCB collisions expected). Resolve or spawn one conflict worker. `--no-ff` merge, `npm test`.
5. Then Wave **D** T02-29 (needs 23–27; 28 optional), then Wave **E** T02-30. Isolated worktrees from then-current `master`.
6. Same frozen judgements. Do **not** start phase 5. Do not reopen T02-01–21.

Captain must **not** end the turn while a C worker is running. Do not return “wave C is running” as done.

---

## Eighth swarm started — 2026-08-23 (T02-31–33 physical DCB replica)

Human approved the physical DCB follow-up tickets after identifying the live bar as a flat neon-green ribbon rather than a two-row button grid. The seventh swarm is complete through T02-30; this is a separate, post-exit visual-replica addendum.

| Key | Value |
| --- | --- |
| Goal | MAIN reads as a compact **two-row physical DCB**: correct button grouping/order, six disabled WX caps, raised/inset bevels, off-white normal text, muted disabled text, and a documented visual gate |
| Player loop | `npm run dev` → MAIN has RANGE / center / RR / map 3×2 / WX1–6 / BRITE / leader / CHAR SIZE / MODE / PREF / SITE / SSA-GI / SHIFT in the frozen order → active cap presses inset → `DAL123 H270` still turns |
| Include | **T02-31**, **T02-32**, **T02-33** only |
| Skip | **T04-11**; all T00–T01, **T02-01–30**, T03-*, T04-*, T05-*; weather paint; actual FSL/fusion/site modes; any proprietary STARS/FAA font |
| Stop | Do not start phase 5. Do not add DCB jobs beyond the approved tickets. T02-33 is the visual-replica gate. |
| Max ticket workers in flight | **3**, but this dependency chain is serialized: A T02-31 → B T02-32 → C T02-33 |
| Merge lock | Only the phase captain squash-merges to `master` (one commit per ticket branch) and runs `npm test` after every merge |
| Model | **GPT-5.6 Luna Medium only.** `model: "gpt-5.6-luna-medium"` on every captain/worker spawn; do not use a fast model |
| Paid STT/TTS/LLM | Forbidden |

**Dependency gate:** T02-30 is already merged and its `npm test` / CI gate is green. Start T02-31 from current `master`; T02-32 follows a green T02-31 merge; T02-33 follows a green T02-32 merge.

**Frozen visual MAIN layout:** Use the T02-31 data-driven two-row descriptor. Full-height columns are RANGE; RR; MAPS; WX1–WX6; BRITE; CHAR SIZE; MODE FSL (disabled); PREF 22/27; SITE FUSED (disabled); SHIFT. Stacked columns are PLACE CNTR / OFF CNTR, PLACE RR / RR CNTR, LDR DIR / LDR, and SSA FILTER / GI TEXT FILTER. Quick maps 1–6 are exactly a **3 × 2** matrix. Keep the 22-column order documented in T02-31; do not position controls with KDEM-specific branches.

**Frozen physical-cap treatment:** Normal caps are dark tactical olive with off-white text, a light top/left edge, black bottom/right edge, and visible 1–2 px cap gaps. Active/armed caps reverse to an inset bevel and lighter olive body. Disabled WX1–6, MODE FSL, and SITE FUSED use muted gray-green text and stay inert. Remove quick-map stripe/raster backgrounds. PPI/FDB/map/alert palette roles do not change.

**Frozen typography/legal boundary:** Center title/value lines in a legal system/redistributable monospace stack. Do **not** download, embed, claim, or imitate an FAA/STARS proprietary bitmap/vector font.

**Visual evidence:** T02-33 records Chrome Windows observations at 1440×900 and 804×900. QA screenshots remain untracked unless the human explicitly requests an approved artifact. A missing visual operator is a skip-with-reason, never an invented pass.

**Existing frozen behaviors remain:** WX never paints weather; MAPS 7–30 remain disabled when unpopulated; RANGE retains eight presets; FILTER remains the altitude filter on MAIN; PREF remains eight local slots; TPA is J-rings and ATPA is a stub; DCB clicks never emit Command IR.

If `phases/SWARM-STATUS.md` lists eighth-swarm exit green through T02-33, stop. Otherwise resume at the first incomplete dependency; preserve every existing worktree and untracked QA artifact.

**Model override — human instruction 2026-08-23:** every captain and ticket worker for this swarm uses **GPT-5.6 Luna Medium** (`gpt-5.6-luna-medium`), never a fast model. This explicit human override supersedes the historical seventh-swarm Grok requirement above.

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

- Scope/DCB **never** emit Command IR. `DAL123 H270` still turns. Inbound HO from T04-16–17 stays: unowned green pending from `C`, click/F3 accept → white owned; do not regress that.
- Discrete RANGE presets only (`5 10 15 20 30 40 50 60`). No zoom-to-cursor. RANGE is a **spinner**, not ± buttons.
- Disabled WX/VOL/MODE/SITE. No weather paint. No OS volume. WX1–4 exist on MAIN and must be unpressable.
- MAPS from `video-maps` catalog JSON only. Quick 1–6 + submenu slots 1–30. Unused numbers **disabled**, not OSM filler. CLR ALL / GEO MAPS / CURRENT as T02-24.
- PREF 1–8 in `localStorage`, ICAO-keyed, versioned. DEFAULT / RESTORE / SAVE / SAVE AS / DELETE. No `prompt()` / `<input>`. Display state only (not world/speech).
- TPA = selected/owned J-rings at frozen 2/3/5/10 NM. ATPA = stub (no pairing, no cones). CA stays T04-09 **text** — no 3 NM CA halo.
- CHAR SIZE stays Plex/system mono. No STARS `.ttf`. BRITE multiplies existing palette channels; WX/WXC/BKC disabled.
- Spinner: arm / wheel / commit / Esc disarm. Pointer Lock **not** required (`setPointerCapture` OK).
- FILTER (altitude) stays on MAIN. SSA FILTER hides existing SSA lines. GI TEXT is 10 authored facility lines, not METAR HTTP.
- DCB docks TOP/LEFT/RIGHT/BOTTOM; PPI padding follows the bar. HISTORY spinner 0–5; PTL minutes include 0.5/1/2 (+ optional 4); PTL OWN vs ALL.
- Do not start T05-*. Do not edit phase 3 tickets. Paid speech forbidden.

**Code home (do not fork a second DCB):**

Existing glass is `src/ui/DisplayControlBar.tsx` + `src/scope/dcbFunctions.ts` + `src/scope/scopeView.ts`. Tickets that say `DisplayControlBar.tsx` mean this component. Add `src/scope/dcbMenu.ts`, `dcbPref.ts`, `tpa.ts` as tickets name them. Reducers stay DOM-free in `src/scope`.

**Wave B/C collision:** T02-23, T02-24, and T02-25 all touch the DCB component. Isolated worktrees, then captain rebases the remaining two onto `master` after each `--no-ff`. Same for T02-26/27/28 vs `DisplayControlBar.tsx`. Do not share one working tree.

**T02-21 greps:** T02-16/21 forbade SHIFT / WX / PREF. **T02-22** allows SHIFT (keep CSA/CRDA/FMA/OSM forbidden). **T02-24** allows disabled WX cells (still forbid mosaic/precip draw). **T02-29** allows PREF submenu. T02-30 confirms the amended grammar; do not re-fail the old freeze.

**Ticket notes (paste into the matching worker):**

| ID | Must |
| --- | --- |
| T02-22 | Menu machine first. `DcbMenu` MAIN/AUX/MAPS/BRITE/CHAR_SIZE/PREF/SSA_FILTER/GI_FILTER/TPA_ATPA. SHIFT swaps MAIN↔AUX. Submenu **replaces** the bar. DONE/Esc → MAIN. Cell kinds: action / toggle / spinner / submenu / disabled. VOL disabled. Do not skip this ticket to “just add SHIFT.” |
| T02-23 | Split PLACE CNTR, OFF CNTR, RR spinner (2/5/10), PLACE RR, RR CNTR, LDR DIR spinner 1–9, LDR length spinner including **0** and **36** (e.g. 0/24/36/48). Ring origin is world NM, not glued to airport. `L090` radio-focus remains a left turn. |
| T02-24 | Quick maps 1–6; MAPS submenu 1–30; empty slots disabled; WX1–4 disabled; GEO/CURRENT on-PPI lists; CLR ALL. No NEXRAD. |
| T02-25 | AUX real: HISTORY 0–5, dock four edges, PTL length + OWN + ALL, TPA/ATPA opener (DONE stub OK). F7/F8 still work if cells leave MAIN. |
| T02-26 | BRITE + CHAR SIZE **submenus**. Wire real channels we already draw. WX/WXC/BKC disabled. |
| T02-27 | SSA FILTER toggles existing SSA lines only. GI TEXT: `giTextLines[10]` in facility JSON (KDEM ships a few non-empty). No live METAR. Altitude FILTER chord stays on MAIN. |
| T02-28 | P1 but **in wave C** — implement J-rings + ATPA stub. Do not skip the wave. Do not add CA halos. |
| T02-29 | 8 slots. Serialize display fields from 22–27 (TPA optional). Corrupt JSON → factory. No world/speech persistence. |
| T02-30 | **No features.** Grep grammar + `npm test`. Manual Chrome script skip-with-reason if no operator — do not invent a visual pass. |

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

**Addendum (seventh swarm — trainer DCB, this run):** MAIN/AUX via SHIFT; submenus replace the bar; RANGE/RR/LDR spinners; disabled WX/VOL/MODE/SITE; local PREF 1–8; TPA J-rings; ATPA stub. DCB never emits Command IR. Do not paint weather. Do not use Pointer Lock. Do not reopen T02-01–21.

**Still true (sixth swarm — inbound HO):**

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

Research: `phases/_shared/references.md` **R07** DCB MAIN/AUX/SHIFT/BRITE/PREF/TPA; still **R07** accept-handoff / datablock colors / STCA and **R01** radar handoff. This run’s tickets: `T02-22` … `T02-30`. HO tickets `T04-16` / `T04-17` are already on `master` — do not redo them.

---

## Your loop (orchestrator)

1. Update this file first: append the current swarm-start heading/configuration and preserve all earlier swarm history. Commit the planning update before any branch/worktree or agent action.
2. Read `phases/SWARM-STATUS.md`, then `git checkout master` && `git status`. If dirty and it is not yours, **stop**. Preserve untracked `e2e/`.
3. Confirm sixth swarm (T04-16–17) is complete on `master`. If STATUS already shows **seventh** swarm complete, **stop**. Do **not** redo T04-16–17.
4. Spawn **one** captain for **T02-22–30 only** (waves in **Seventh swarm — roles, product law, waves**). Wait until `PHASE EXIT GREEN` or `BLOCKED`.
5. If `BLOCKED`: copy the note into STATUS, **stop**. Do not start phase 5. Human is away — do not wait for a question.
6. If green: run the final required tests yourself, write the swarm-complete STATUS note, list honest manual leftovers and remaining work, and **stop**.

Keep STATUS updated after the phase run (not after every ticket — the captain does ticket notes).

Manual UI ACs (DCB MAIN/AUX/submenus, disabled WX, PREF persist): captain/workers do what they can; leftover Chrome steps go in STATUS. Automated `npm test` / `npm run ci` must be green. Do not invent a visual pass. T02-30 may skip-with-reason.

---

## Git law (overrides whole-phase AGENT.md)

- Default branch: `master`.
- Worker: `ticket/<ticket-filename-without-.md>` off **current** `master`, progressive commits, **never merge**.
- Captain: `git merge --squash`, one commit with ticket id + why, delete local ticket branch, then `npm test`.
- No `--force` on `master`. No `--no-verify`. No push unless the human asked (they have not).
- After a squash merge, rebase or re-spawn stale in-flight workers. Isolated worktrees for same-wave tickets.
- Ignore junk branches named `list` or `ls`. Do not merge them.
- You do not merge from here unless the captain died mid-merge — then finish that one squash merge and stop.

PowerShell commit:

```text
git commit -m @"
T02-22: message why.

Second paragraph why.
"@
```

---

## Waves (captain must follow)

Dependencies on the ticket still win if a wave disagrees. **This run uses the seventh-swarm table** in **Seventh swarm — roles, product law, waves** (T02-22–30). Do not execute the archived T04-16–17 table.

Phase folder: `phases/02-scope/`  
Tickets: **T02-22–30**. **Skip T02-01–21.** Skip all T03/T04/T05.

| Wave | Tickets (≤3) | Wait for |
| --- | --- | --- |
| A | T02-22 | T02-21 on `master` |
| B | T02-23 ∥ T02-24 ∥ T02-25 | A. Isolated worktrees |
| C | T02-26 ∥ T02-27 ∥ T02-28 | B (28 needs **T02-25**) |
| D | T02-29 | C (23–27 at least; 28 optional) |
| E | T02-30 | D |

Do **not** paint weather. Do **not** use Pointer Lock. Do **not** invert owned color. Do **not** start T05-*. Do **not** reopen T02-01–21.

**Not this run:** T04-11. All T05-*. Redo of T02-01–21 or T04-*. CA halo. NAS PREF 32. Continuous zoom.

Exit: T02-22–30 ACs. MAIN/AUX SHIFT; RANGE presets via spinner; disabled WX; PREF 1–8; TPA rings; ATPA stub. `npm test` / `npm run ci` green. Manual leftovers listed, not faked.

---

## Burden limits

- Orchestrator: no `src/` or `tools/` edits except STATUS. No “I’ll just do T02-22 myself.”
- Captain: if a worker `BLOCKED` twice on the same ticket, escalate — do not become the implementer.
- Worker: one ticket. No bonus tickets. No weather paint “while you are here.” No phase 5 scoring. No reopening T02-01–21.
- Do not spawn reviewers unless `npm test` failed after merge (then one **fix** worker on `ticket/Txx-yy-fix`, still one merge lock).

Size this run: **T02-22 L, T02-25 L, others M/S**. T02-28 is P1 but **in wave C** — implement the stub, do not skip the wave.

---

## Captain return (mandatory)

```
PHASE EXIT GREEN
Phase: 2 Scope addendum (T02-22–30 trainer DCB)
Merged: T02-22 … T02-30
Tests: npm test / npm run ci exit 0
Manual leftover: <Chrome DCB walk or none>
Notes: <SHIFT/AUX; disabled WX; PREF 1–8; TPA rings; no phase 5>
```

or `PHASE EXIT BLOCKED` with reason. Do not return “wave A is running” as done.

---

## Done when

T02-22–30 ACs can be argued green, `npm test` green on `master`, STATUS says **seventh swarm complete**, MAIN/AUX via SHIFT, RANGE spinner uses discrete presets, WX cells exist and never paint, PREF 1–8 persist, TPA J-rings work, ATPA is a stub, **no** phase 5, T02-01–21 **not** redone.

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

---

## Seventh swarm resume — 2026-08-23 (finish D/E with checkpoint discipline)

Human approved finishing the remaining seventh-swarm tickets using subagents. Wave C is already merged on `master`; run only **T02-29 (Wave D)** and **T02-30 (Wave E)**. Do not touch the unrelated `fix/ca-blink-and-tone` worktree or its dirty application files.

Safety requirements for the captain:

- Work only from `master`; verify the branch and clean application status before each phase action. Preserve untracked `e2e/` and unrelated CA work.
- Use one isolated worker worktree per ticket. The worker must commit and return `READY TO MERGE` before the captain merges.
- After every worker completion: record the worker result, verify its worktree status, squash merge (one commit on `master`), run `npm test`, and confirm `master` before starting the next ticket.
- Never background a worker and finish the captain turn. If a worker stalls, resume or replace that worker explicitly; do not leave a half-finished ticket silently.
- After T02-30: run both `npm test` and `npm run ci`, append STATUS, and return `PHASE EXIT GREEN` only after all results are recorded. Do not start phase 5.
