# Swarm status

## FOURTEENTH SWARM COMPLETE — TPA / ATPA (T02-43–50)

T02-43–50 are merged on `feature/atpa-tpa`. Captain `npm test` / `npm run ci` / `npm run build`: **131 test files passed, 1519 tests passed, 1 skipped, 0 failures**. Real ATPA on adapted approach volumes, in-trail pairing, predicted monitor/warning/alert, wedge cones, datablock in-trail distance, live DCB TPA/ATPA cells, richer manual TPA, and the STARS slew-chord parser:
- **ATPA volumes as catalog data (T02-43):** KDEM `ATPA27` / `ATPA09` rows walked by `approachId`; threshold and inbound course come from the referenced approach. A third runway adds JSON, never an `if`.
- **In-trail pairing engine (T02-44):** `evaluateAtpa` on `stepWorld` writes `world.alerts.atpa`. Basic radar minima only from volume JSON (`basicSeparationNm` 3 NM, `reducedSeparationNm` 2.5 NM inside `reducedWithinNm` 10 NM). Cone length identical for a heavy or light leader. No wake-category matrix.
- **Cone geometry (T02-45):** One unfilled wedge per trailing track; vertex on the trailer, axis toward the leader, length = `requiredNm`. Monitor TPA blue, warning caution yellow, alert `atpaAlert` orange — never CA red.
- **In-trail distance and cone mileage (T02-46):** Trailing FDB line 3 two-decimal mileage on warning/alert; cone mileage digits `"3"` / `"2.5"`. Monitor omits the datablock field.
- **Live DCB TPA/ATPA cells (T02-47):** Four AUX cells plus master; `effective = atpa.on && atpa[feature]`; Alert Cones gates warning and alert; PREF schema `v: 2` round-trips all five `AtpaState` fields; `v: 1` migrates.
- **Richer manual TPA (T02-48):** Per-track `*J` / `*P` (1–30 NM, session state not PREF); `**J` / `**P` clear-all; size-readout inhibit. J-rings are never suppressed; a manual `*P` cone is suppressed only on warning/alert.
- **Slew-chord parser (T02-49):** `*J` / `*P` / `*A` / `*B` / `*D` (and doubles) are scope-only. `DAL123 H270` still turns. Captain follow-up wired `*AE` / `*AI` / `*BE` / `*BI` dispatch.
- **Acceptance (T02-50):** `src/scope/atpaFidelity.integration.test.ts` drives real `stepWorld` ticks against the real KDEM catalog and a real `ScopeView`. Wake independence, JSON minima, RW09 data-first parity, master-off gate, CA/MSAW exclusive `PALETTE.alert` red, and zero regressions on CA / MSAW / TPA / DCB / dual-runway.

**Merged (squash-merged, captains only):** T02-43 (`b387220`), T02-49 (`fb6721f`), T02-44 (`7b36511`), T02-45 (`03dee39`), T02-46 (`05d47c3`), T02-47 (`fa2ec94`), T02-48 (`2e094a4`), captain `*A`/`*B` dispatch fix (`9c749f7`), T02-50 (`102bd92`).

**Post-swarm fixes on the same branch:** `*J` / `*P` resolved the track at Enter and silently dropped the command when nothing was slewed, so the reference's own command-then-slew order did nothing. Track-scoped chords now arm on the PPI and apply to the next target click without accepting an inbound handoff; select-then-Enter is unchanged. Verified in a preview build, not only in tests.

**Captain judgement calls:**

- **Orchestrator and captain were one session.** A captain subagent cannot reliably spawn its own workers here, so the merge lock, the worktrees, and the waves were held in the top session. Workers stayed leaf-only and never merged, which is the constraint that matters.
- **`ticket/` branches were cut from `feature/atpa-tpa`, not `master`.** The run was scoped to a feature branch by request; `master` is untouched and this branch is one squash commit per ticket.
- **Two rebase conflicts resolved as additive.** T02-46 and T02-45 both defined `PALETTE.atpaAlert` as `#FF8800` with different comments (merged to one comment); T02-48 versus T02-47 collided on `AtpaState`, `TrackDisplay`, and the `src/scope` barrel, where both sides' members were kept per the swarm's state-ownership table. Nothing was dropped.
- **One out-of-ticket fix (`9c749f7`).** `*AE` / `*AI` / `*BE` / `*BI` parsed and silently no-opped: T02-45 said T02-47 and T02-49 would wire the dispatch, T02-49 deferred all dispatch, and T02-47 wired only the DCB. Fixed on a `fix/` branch rather than absorbed into a ticket.
- **Duplicated geometry helpers.** `src/core/alerts/atpa.ts` carries its own copy of T02-43's inside-volume and along-course math because `@core` may not import `@scenario`. Same formula, two homes. A later cleanup should lift them into `@core/nav` and have `@scenario` import down; not done here because it would have touched two tickets' files mid-run.

**Manual leftover:** T02-50 Chrome player loop (two ILS 27 arrivals → blue monitor cone → yellow then orange → in-trail field → four DCB cells → `*J3`). skip-with-reason: no visual operator. Automated tests prove the items above.

**Product law held:** basic radar minima only; no CWT/wake matrix; no per-runway or per-position adapted minima; CA untouched (no 3 NM halo); chords never emit Command IR.

---

## THIRTEENTH SWARM COMPLETE — Dual-runway configuration & selection (T04-26–30, T05-14)

T04-26–30 and T05-14 are merged on `feature/dual-runway-configuration`. Captain `npm test` / `npm run ci`: **124 test files passed, 1415 tests passed, 1 skipped, 0 failures**. Complete dual-runway configuration, reciprocal approaches, SIDs/STARs, video maps, and dual-selector session setup overhaul:
- **KDEM Runway 09 Navaids & ILS Approach (T04-26):** Reciprocal East Flow catalog definitions in `src/scenario/data/kdem/` including `FI09` FAF, `WMERG` merge fix, `WNMAX`/`WSMAX` entry fixes, `BAYEA` departure climb gate, `MISSE` missed fix, and full ILS navaids (`IDEM09` LOC, `IDEMGS09` GS, `IDEMDME09` DME, `OM09`, `MM09`).
- **Dual-Runway SIDs and STARs (T04-27):** `BAY1` departure enhanced with Runway 09 runway transition (initial heading 090°, climb to `BAYEA`) and per-runway enroute transitions to `NORMA` and `OCTTA`. `DEM1` STAR enhanced with East Flow transitions `WN` (West-North) and `WS` (West-South) terminating at `WMERG` (4000 ft / 210 kt). Verified full lateral/vertical FMS `CLIMB_VIA` and `DESCEND_VIA` guidance.
- **KDEM RW09 Video Maps & Playable Scenarios (T04-28):** Dedicated procedure and radar video maps for Runway 09 (`LOC09` feather, `DWN09` downwind pattern), dual-ended runway centerline map, and new playable scenarios `kdem-09` (East Flow default) and `kdem-ils09` (East Flow ILS benchmark) registered in playable inventory.
- **Configuration-Aware Traffic Spawning (T04-29):** Arrival scheduler (`assignStarRoutes`) and departure generator dynamically select STAR transitions and SID runway transitions matching the active scenario's configuration and runway (RW27 $\to$ `N`/`S` $\to$ `MERGE` & `BAYEE`; RW09 $\to$ `WN`/`WS` $\to$ `WMERG` & `BAYEA`). Successive departures maintain >= 60s spacing, and downwind benchmark spawns derive offsets relative to the active runway.
- **Dual Airport & Configuration Selectors (T05-14):** Session Setup modal renders two separate accessible dropdowns ("Airport" and "Configuration") derived dynamically from inventory metadata without hardcoded UI lists. Supports `atc-sim.session.v1` draft persistence, query parameter overrides, and restart confirmation.
- **End-to-End Dual Runway Integration & Acceptance (T04-30):** Full automated acceptance test suite in `src/scenario/dualRunwayIntegration.test.ts` proving complete flight cycles (STAR descent via constraints $\to$ vectoring $\to$ ILS capture $\to$ landing / missed approach $\to$ SID departures $\to$ Center handoff) across both West Flow and East Flow.

**Merged (squash-merged, captains only):** T04-26 (`21c0ac4`), T04-27 (`80b32a9`), T04-29 (`d4a51e6`), T04-28 (`7fbc674`), T05-14 (`bfa8f16`), T04-30 (`4528126`).

---

T02-39–42 are merged on `feature/stars-crc-datablock-fidelity`. Captain `npm test` / `npm run ci`: **117 test files passed, 1345 tests passed, 1 skipped, 0 failures**. Complete STARS CRC datablock, scratchpad, ground speed tens, and multi-phase time-sharing fidelity overhaul:
- **Automatic Scratchpad Derivation (T02-39):** `sp1` and `sp2` fields on `TrackDisplay`. SP1 automatically derives approach shorthand (`ILS 27` $\to$ `I27`, `RNAV 22L` $\to$ `R22L`, `VISUAL 28` $\to$ `V28`, `LOC 09` $\to$ `L09`, `VOR 15` $\to$ `O15`) as highest priority, falling back to interim altitude in 3-digit hundreds (`040`) when no approach is set. SP2 automatically derives speed shorthand with `S` prefix and 2-digit tens (`210 kt` $\to$ `S21`). Manual entries override and persist until cleared.
- **STARS Ground Speed in Tens & Category Indicators (T02-40):** FDB, PDB, and queried LDB display ground speed in 2-digit tens (`18`, `21`, `25`) via `formatGroundSpeedTens()`. Wake/RNAV category indicators (`18H`, `25R`, `21B`, `12L`, CWT `A`–`I`) and flight categories (`11V`, `28E`) appended directly to GS. `suppressPdbSpeed` suppresses PDB ground speed when configured.
- **Multi-Phase Line 2 Time-Sharing & Handoff Center Placement (T02-41):** Independent multi-phase column rotation on ~2.5s cycle: Left column rotates `Mode C` $\leftrightarrow$ `SP1` $\leftrightarrow$ `SP2`; Right column rotates `GS (tens)` $\leftrightarrow$ `Type` $\leftrightarrow$ `Requested Alt (R###)`. Seamless omission of unpopulated fields without empty display intervals. Center position displays partner sector ID letter (`D`, `C`) during active handoff transfers. Line 1 displays emergency SPC tags (`7700` `EM`, `7600` `RF`, `7500` `HJ`).
- **Acceptance & Zero Regressions (T02-42):** Comprehensive end-to-end integration and visual acceptance test suite (`src/scope/datablockFidelity.integration.test.ts`), 100% test pass rate with zero regressions across kinematics, FMS, telephony, and scope rendering.

**Merged (squash-merged, captains only):** T02-39 (`90fdc42`), T02-40 (`d3b2dc4`), T02-41 (`ae520e0`), T02-42 (`pending-merge`).

---

## TENTH SWARM COMPLETE — Phase 2 STARS CRC scope fidelity addendum (T02-34–38)

T02-34–38 are merged on `feature/stars-crc-fidelity`. Captain `npm test` / `npm run ci`: **117 test files passed, 1322 tests passed, 1 skipped, 0 failures**. Complete STARS CRC radar display fidelity overhaul:
- **Surveillance Target Symbols (T02-34):** Primary-only diamond (`◇`), unassociated secondary asterisk (`*`), 1200 VFR (`V`), beacon select (`□`), tracked sector ID letter (`D`/`G`), removed fixed 8px heading tick line, connected TCW POS/OTH/PRI BRITE channels.
- **LDB & PDB Modes (T02-35):** LDB renders squawk + Mode C altitude + click-to-query 5s ground speed popup; PDB renders Line 2 only for unowned associated tracks; click toggles between PDB and Green FDB; F1 momentary Beaconator readout.
- **FDB Dynamic Time-Sharing & Line 3 (T02-36):** Line 2 time-shares every ~2.5s between [Mode C altitude + Ground speed] and [Scratchpad + Aircraft type / requested altitude `R<alt>`] with wake/RNAV category indicators; Line 3 renders temporary assigned altitude `A<alt>` when $\ge 100$ ft delta; SPC indicators on Line 1 (`EM`, `RF`, `HJ`).
- **Handoffs, Pointouts & Cyan Highlight (T02-37):** Inbound handoff white blinking FDB with click-to-accept; accepted outbound handoff 5s flash with 3-click FDB $\rightarrow$ PDB progression; pointouts with blinking yellow FDB `PO` and `UN` rejection; middle-click Cyan highlight (`#00FFFF`) replacing non-standard yellow box.
- **Acceptance & Zero Regressions (T02-38):** Full end-to-end integration test suite (`src/scope/starsFidelity.integration.test.ts`), 100% CI pass rate across all simulation, FMS, voice, and procedural components.

**Merged (squash-merged, captains only):** T02-34 (`46abf5b`), T02-35 (`974c82c`), T02-36 (`635a9d1`), T02-37 (`108a62f`), T02-38 (`db52e1c`).

---

## Seventh swarm started — Phase 2 post-exit addendum (T02-22–30 trainer DCB)

Orchestrator planning **2026-08-23**. Human: DCB spec + tickets, then away (“make any calls”). Historical phase 2 exit/polish (T02-01–21) and sixth swarm (T04-16–17) stay green. This run is **T02-22–30 only**. Do **not** redo T00–T04-17. Do **not** start phase 5. Skip **T04-11**.

| Key | Value |
| --- | --- |
| Goal | Trainer DCB MAIN/AUX/submenus, spinners, disabled WX, local PREF 1–8 |
| Player loop | `npm run dev` → SHIFT AUX → RANGE presets via spinner → MAPS 1–6 → dead WX cells → PREF persist |
| Skip | **T04-11**. **T02-01–21**. **T03-***. **T04-***. **T05-*** |
| Include | **T02-22–30** |
| Stop | **Do not start phase 5** |
| Max ticket workers in flight | **3** |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** `model: "cursor-grok-4.6-high"` |
| Paid STT/TTS/LLM | **Forbidden** |

Waves: A T02-22 → B T02-23∥24∥25 → C T02-26∥27∥28 → D T02-29 → E T02-30. Untracked `e2e/` left uncommitted. Frozen: no Pointer Lock; FILTER stays on MAIN; MAPS 7–30 empty; ATPA stub; WX never paints.

**2026-08-23 resume:** Captain was interrupted after Wave A. T02-22 merged on `master` (`fb0ed67`). Wave B worktrees still exist with uncommitted edits. Human: finish the swarm. Resume B from those trees; do not reset them.

**2026-08-23 Wave C resume:** A+B are on `master` (`62a1e34` = T02-25 merge). T02-26 and T02-27 branches are READY TO MERGE in worktrees; T02-28 has uncommitted work (aborted worker). Human: C is not done — finish C, then D T02-29 and E T02-30. Do not discard the T02-28 tree. Do not start phase 5.

## SEVENTH SWARM COMPLETE — phase 2 post-exit addendum (T02-22–30 trainer DCB)

T02-22–30 are on `master` (`502a9fd` includes `ticket/T02-29-fix`). Captain `npm test` / `npm run ci`: **1166 passed, 1 skipped**. Trainer DCB MAIN/AUX via SHIFT; RANGE spinner on eight presets 5–60 NM; MAPS 1–6 + empty 7–30 disabled; WX1–4 / VOL / MODE / SITE disabled (no weather paint, no OS audio); PREF 1–8 `localStorage`; TPA J-rings 2/3/5/10 NM; ATPA stub. No Pointer Lock. FILTER stays on MAIN. Skip **T04-11**. Did **not** start phase 5. Did not redo T02-01–21 / T03 / T04 / T05.

**Merged (`--no-ff`, captains only):** T02-22, T02-23, T02-24, T02-25, T02-26, T02-27, T02-28, T02-29, T02-30, plus `ticket/T02-29-fix` (tsc TS2367 `lastHistoryDotCount !== 0` + leftover Prettier). Isolated worktrees. Workers never merged. Deleted local T02-22–30 ticket branches. Untracked `e2e/` left uncommitted.

**Also on master during this window (not this swarm’s tickets):** T02-31 physical DCB replica + follow-up (`f1578a1` / `3c05e39`); `fix/ca-blink-and-tone` (`3374854`). Left in place.

**Manual leftover (human `npm run dev` on Chrome Windows):** T02-30 script 1–10 — MAIN/AUX via SHIFT, RANGE spinner presets, disabled WX1–4 (no weather paint), PREF SAVE/DEFAULT with no browser dialog, TPA rings, dock LEFT still north-up, `DAL123 H270` still turns. Do not invent a visual pass.

**Remaining work (next paste of `SWARM.md` with config changed):**

| Phase | Folder | What it is |
| --- | --- | --- |
| 5 Training | `phases/05-training/` | Practice score, replay, optional bad readbacks |

Optional later: T04-11 constant wind. T02-31–33 physical DCB skin is outside this swarm. Do not start phase 5 until a new swarm paste.

## Phase 2 addendum captain notes (T02-22–30 trainer DCB)

Captain **2026-08-23**. Did **not** start phase 5. Isolated worktrees. Workers never merged. Untracked `e2e/` left uncommitted.

- **Wave A:** Merged T02-22 — DCB menu model, SHIFT MAIN/AUX, primitives (`fb0ed67`).
- **Wave B:** Merged T02-23 RANGE/CNTR/RR/LDR; T02-24 MAPS 1–30 + disabled WX; T02-25 AUX HISTORY/PTL/dock. Same-wave DCB collisions rebased keep-both.
- **Wave C:** Finished T02-28 in its dirty worktree first (do not discard). `--no-ff` merged T02-26 (`4494f03`), T02-27 (`e1e2ab0`), T02-28 (`8178631`). TPA J-rings 2/3/5/10 NM; ATPA stub; no CA 3 NM halo.
- **Wave D:** Merged T02-29 — PREF 1–8 `localStorage`, no `prompt()` / `<input>`, display state only. T02-21 greps allow PREF.
- **Wave E:** Merged T02-30 — grep grammar + tests; **no features**. Chrome script skip-with-reason (no operator).
- **CI follow-up:** `ticket/T02-29-fix` — tsc TS2367 on `lastHistoryDotCount !== 0` plus leftover Prettier so `format:check` passes.
- **Tests:** `npm test` / `npm run ci` exit 0. **1166** passed, **1** skipped.
- **Skipped:** T04-11. No phase 5. Did not implement T02-31–33 in this swarm.

**Product:** SHIFT MAIN/AUX; RANGE discrete presets; disabled WX; PREF 1–8; TPA rings; ATPA stub. DCB never emits Command IR. No Pointer Lock. FILTER stays on MAIN.

## Sixth swarm started — Phase 4 post-exit addendum (T04-16–17 inbound HO)

Orchestrator planning **2026-08-23**. Human `/run-swarm`: spawn handoff accept + CA 3 NM circles if analog exists. Historical phase 4 exit and fifth swarm (T04-13–15) stay green. This run is **T04-16, T04-17 only**. Do **not** redo T00–T04-15. Do **not** start phase 5. Skip **T04-11**. **No CA 3 NM halo** (CRC STARS STCA is `CA` text + tone; 3 NM circles are TPA J-rings or ERAM DRI). Owned FDB stays **white** after accept (CRC), not green.

| Key | Value |
| --- | --- |
| Goal | Default STAR arrivals spawn pending inbound HO from `C`. Click/slew accepts → owned white. Radio after accept. Check-in waits until owned |
| Player loop | `npm run dev` → green unowned + HO cue → click DAL123 → white owned → `DAL123 H270` |
| Skip | **T04-11**. **T04-01–15**. **T05-***. CA 3 NM circles |
| Include | **T04-16**, **T04-17** |
| Stop | **Do not start phase 5** |
| Max ticket workers in flight | **3** (wave A = 1; wave B = 1) |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** `model: "cursor-grok-4.6-high"` |
| Paid STT/TTS/LLM | **Forbidden** |

Waves: 0 (merge 8 NM spawn stagger branch if needed) → A T04-16 → B T04-17. Untracked `e2e/` QA screenshots are not this swarm — leave uncommitted.

## SIXTH SWARM COMPLETE — phase 4 post-exit addendum (T04-16–17 inbound HO)

T04-16 and T04-17 are on `master`. Captain `npm test` / `npm run ci`: **1061 passed, 1 skipped**. Wave 0 merged `fix/star-inbound-spawn-spacing` (8 NM same-STAR stagger). Default STAR pack spawns pending inbound HO from sector `C`, unowned green FDB; radio rejects (`handoff-pending`) until accept. Click/slew (and F3 on pending inbound) accepts → owned **white** FDB (`PALETTE.owned`). Check-in waits until owned. `kdem-ils27` and `?traffic=N` stay `handoff.kind === "none"` (commandable without click). No CA 3 NM halo. Skip **T04-11**. Did **not** start phase 5. Did not redo T04-01–15.

**Merged (`--no-ff`, captain only):** `fix/star-inbound-spawn-spacing`, T04-16, T04-17, plus `ticket/T04-17-fix` (Prettier on T04-17 scope files). Isolated worktrees. Workers never merged. Deleted local ticket branches. Untracked `e2e/` left uncommitted.

**Manual leftover (human `npm run dev`):** default session — green unowned FDBs with HO cue from `C`; click DAL123 → white owned; then `DAL123 H270` turns and **cancels** FMS; radio before click still rejected; check-in after accept only; `?scenario=kdem-ils27` still T04-12 without HO; `?traffic=N` still downwind FPS arc without HO. Do not invent a visual pass.

**Remaining work (next paste of `SWARM.md` with config changed):**

| Phase | Folder | What it is |
| --- | --- | --- |
| 5 Training | `phases/05-training/` | Practice score, replay, optional bad readbacks |

Optional later: T04-11 constant wind. Do not start phase 5 until a new swarm paste. Phase 5 must **ignore** `handoff.inbound.offered` / `handoff.inbound.accepted` and `radio.checkin` (do not score).

## Orchestrator verify — 2026-08-23 (inbound HO)

Confirmed on `master` `a4cfd41`. `--no-ff` merges: spawn stagger, T04-16, T04-17, `ticket/T04-17-fix`. Orchestrator `npm test` / `npm run ci`: **1061 passed, 1 skipped**. Default pack pending inbound from `C`; click/F3 accept → owned white; radio gated until then; check-in after accept. ils27 / `?traffic=N` skip HO. **No CA 3 NM halo** (CRC STARS CA is text). Did **not** start phase 5. Untracked `e2e/` left uncommitted. Stopped at the sixth-swarm boundary.

## Phase 4 addendum captain notes (T04-16–17)

- **Wave 0:** merged `fix/star-inbound-spawn-spacing` — same-STAR inbound trailers 8 NM. `npm test` 1039 passed.
- **Wave A:** merged T04-16 — STAR-inbound spawn pending HO from `C`; radio gated until `acceptInboundHandoff` / F3-as-accept; ils27 and traffic=N `kind === "none"`. Events `handoff.inbound.offered` / `accepted`. `npm test` 1050 passed.
- **Wave B:** merged T04-17 — first PPI click on pending inbound accepts+selects; FDB line 1 HO cue; check-in hold until owned; F1 help line. `npm test` 1061 passed.
- **CI follow-up:** `ticket/T04-17-fix` Prettier on `src/scope/pick.test.ts`, `renderScope.ts`, `renderScope.test.ts`. `npm run ci` exit 0.
- **Skipped:** T04-11. No CA 3 NM halo. No owned-green invert. No phase 5.
- **Product:** Pending HO from `C`; owned white; ils27/traffic skip HO; check-in after accept; heading after accept still cancels FMS.


## Fifth swarm started — Phase 4 post-exit addendum (T04-13–15)

Orchestrator planning **2026-08-23**. Historical phase 4 exit (T04-01–10, T04-12) stays green. This run is **T04-13, T04-14, T04-15 only**. Do **not** redo T00–T04-12. Do **not** start phase 5. Skip **T04-11**.

| Key | Value |
| --- | --- |
| Goal | Default student traffic spawns on catalog STAR entry fixes (VIA descending). Seeded STAR × transition. VIA arrivals check in |
| Player loop | `npm run dev` → six DEMO ONE N/S inbounds at farthest-out transition fix → check-in → vectors/ILS unchanged |
| Skip | **T04-11**. **T04-01–12** (already merged). **T05-*** |
| Include | **T04-13**, **T04-14**, **T04-15** |
| Stop | **Do not start phase 5.** No scoring, replay, imperfect pilots, or second TCP |
| Do not redo | T00-*, T01-*, T02-*, T03-*, T04-01–12. Fourth swarm is complete |
| Max ticket workers in flight | **3** (wave A = 1; wave B = 2) |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** `model: "cursor-grok-4.6-high"` on every Task spawn |
| Paid STT/TTS/LLM | **Forbidden** |

Waves: A (T04-13 alone) → B (T04-14 ∥ T04-15, isolated worktrees). Check-in phraseology: `approach, {callsign}, descending via {STAR name} arrival through {altitude} feet`. `kdem-ils27` stays deterministic. `?traffic=N` stays the downwind FPS arc.

**2026-08-23:** Human `/run-swarm` for STAR plane spawning. Orchestrator executing the fifth swarm (not a sixth; not phase 5). Planning commit then one captain. Untracked `e2e/` QA screenshots are not this swarm — leave uncommitted.

## FIFTH SWARM COMPLETE — phase 4 post-exit addendum (T04-13–15)

T04-13, T04-14, and T04-15 are on `master`. Captain `npm test` / `npm run ci`: **1039 passed, 1 skipped**. Catalog-generic STAR inbound pose (first transition leg, never MERGE/FAF). Default KDEM pack is seeded `star-inbound` VIA (seed default 1). `kdem-ils27` stays authored DAL123 north / AAL45 south. `?traffic=N` stays the downwind FPS arc. T01-04 box lives on `testdata/scenarios/kdem-downwind.json`. VIA arrivals emit frozen check-in + `radio.checkin`. Skip **T04-11**. Did **not** start phase 5. Did not redo T04-01–12.

**Merged (`--no-ff`, captain only):** T04-13, T04-14, T04-15, plus `ticket/T04-ci-fix` (tsc readonly PROCEDURE / approach test) and `ticket/T04-ci-format` (Prettier `src/parse/spoken/fix-ground.test.ts`). Isolated worktrees. Workers never merged. Deleted local ticket branches. Untracked `e2e/` left uncommitted. Unrelated dirty `speech-api/` / `chore/speech-api-dotenv` left untouched.

**Manual leftover (human `npm run dev`):** default session — six DEMO ONE N/S inbounds at farthest-out transition fix, Mode C ~110, not the old east-downwind line; hear/see check-in without a command; `DAL123 H270` still turns and **cancels** FMS; issue heading before ~3 s on one arrival → that one stays silent; `?scenario=kdem-ils27` still T04-12 (DAL123 north / AAL45 south); `?traffic=30` still heading-090 arc; `?seed=2` reshuffles remainder aircraft. Do not invent a visual pass.

**Remaining work (next paste of `SWARM.md` with config changed):**

| Phase | Folder | What it is |
| --- | --- | --- |
| 5 Training | `phases/05-training/` | Practice score, replay, optional bad readbacks |

Optional later: T04-11 constant wind. Do not start phase 5 until a new swarm paste. Phase 5 must **ignore** `radio.checkin` (do not score it).

## Orchestrator verify — 2026-08-23 (STAR plane spawning)

Confirmed on `master` `84cfe9c`. `--no-ff` merges: T04-13, T04-14, T04-15, `ticket/T04-ci-fix`, `ticket/T04-ci-format`. Orchestrator `npm test` / `npm run ci`: **1039 passed, 1 skipped**. Default KDEM is `spawnPolicy: "star-inbound"` (seed 1). `kdem-ils27` stays authored DAL123 north / AAL45 south. Check-in golden: `approach, delta one two three, descending via DEMO ONE arrival through one one thousand feet`. Event `radio.checkin`. `?traffic=N` still downwind. T04-11 skipped. Did **not** start phase 5. Untracked `e2e/` left uncommitted.

Unrelated `chore: load speech-api/.env for local Path C.` (`c6b298f`) is on `master` between the CI follow-ups; not a T04-13–15 ticket. Workers never merged. Stopped at the fifth-swarm boundary.

## Phase 4 addendum captain notes (T04-13–15)

- **Wave A:** merged T04-13 — `listStarSlots` / `outermostStarFix` / `starInboundPose` from catalog first-transition legs. Testdata second STAR `TST1`. No `kdem.json` / `kdem-ils27.json` edits. `npm test` 1004 passed.
- **Wave B:** merged T04-14 then T04-15 (auto-merged after 14). Seeded assignment `mulberry32`; `spawnPolicy` `star-inbound` vs `authored`; check-in formatter + queue + `radio.checkin`. T04-15 used a local mulberry32 so it could land without 14. `npm test` 1039 passed.
- **CI follow-ups:** `ticket/T04-ci-fix` (pre-existing tsc: readonly `routeFixIds`, PROCEDURE vs LOC test); `ticket/T04-ci-format` (pre-existing Prettier on `src/parse/spoken/fix-ground.test.ts`). `npm run ci` exit 0.
- **Skipped:** T04-11. No phase 5.
- **Product:** Default pack STAR inbound VIA. ils27 deterministic. `?traffic=N` downwind. Check-in is unsolicited pilot radio, not Command IR.

## Fourth swarm started — Phase 4 procedures

Orchestrator started **2026-08-21**. Phases 0→1→2→3 and Path C (T03-15/14) stay green. This run implements **phase 4 procedures**. Do **not** redo T00–T03. Do **not** start phase 5. Skip **T04-11** (constant wind). Include **T04-08** (CIFP fixture, offline). Untracked `e2e/` left uncommitted.

Human is away. Captains/workers make judgement calls; manual Chrome leftovers go in STATUS. Do not invent a visual pass.

| Key | Value |
| --- | --- |
| Goal | Implement **phase 4 procedures** until `phases/04-procedures/README.md` **Phase exit** is green. Aircraft fly published STAR/ILS geometry; CA and MSAW light yellow then red |
| Player loop | Spawn on DEMO ONE → vectors → intercept heading → `APP ILS27` → loc then GS from below → tower stub **or** missed at DA |
| Skip | **T04-11** (constant wind) unless the human later names it. Not required to exit |
| Include | **T04-08** CIFP subset importer — **required**. Frozen in-repo fixture only; **no network**, no full FAA cycle, no chart scrape |
| Stop | **Do not start phase 5.** No scoring, replay, imperfect pilots, or second TCP |
| Do not redo | T00-*, T01-*, T02-*, T03-*. Path C fourth swarm is complete. **Start phase 4.** |
| Max ticket workers in flight | **3** |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** Every Task spawn sets `model: "cursor-grok-4.6-high"`. No `composer-2.5-fast`, no omitting `model` |
| Paid STT/TTS/LLM | **Forbidden.** Do not regress speech-api onto vendors. Do not edit phase 3 tickets |

Waves: A (T04-01 ∥ T04-09) → B (T04-02 ∥ T04-08 ∥ T04-10) → C (T04-03 alone) → D (T04-04 ∥ T04-05) → E (T04-06) → F (T04-07) → G (T04-12). Isolated worktrees for same-wave tickets.

**Working tree at start:** `master` clean except leftover untracked `e2e/` QA screenshots (not this swarm — left uncommitted). KDEM catalog JSON + DEM1 video map already on `master` (`Merge ticket/phase-4-swarm-kdem-catalog`). T04-01 **loads** those files; do not invent a second coordinate set. T02-01–13 confirmed on `master`. Phase 3 voice present; typed commands first; new tokens through the same `parseCommand`.

## FOURTH SWARM COMPLETE — phase 4 procedures

T04-01–10 and T04-12 are on `master`. Skip **T04-11** (wind). Captain `npm test` / `npm run ci`: **927 passed, 1 skipped**. Orchestrator `npm test` on `master`: **927 passed, 1 skipped**. KDEM JSON is the runtime catalog. `APP ILS27` captures loc then GS from below. Combined ILS `R240 A20 APP ILS27` holds altitude until established. `DAL123 H270` still turns and **cancels** FMS. CA/MSAW lite are automated. CIFP importer is fixture-only and offline. No chart scrape. No full FAA cycle. No paid vendor speech. Did **not** start phase 5. Did not redo T00–T03.

**Merged (`--no-ff`, captain only):** T04-01, T04-09, T04-02, T04-08, T04-10, T04-03, T04-04, T04-05, T04-06, T04-07, T04-12, `ticket/T04-ci-fix`, `ticket/T04-ci-format`. Workers never merged. Untracked `e2e/` left uncommitted.

**Manual leftover (human `npm run dev`):** T04-12 Chrome script — load `?scenario=kdem-ils27`; disclaimer; DAL123 on DEM1 north (VIA, don’t bust NEMAX); vectors then typed `R240 A20 APP ILS27` (until established + loc then GS); inside 5 NM **Shift+H** → tower handoff / land, or skip HO → missed 270/3000; AAL45 for CA (or `D10` MSAW); pause/1×/2×. Phase 3 Chrome/mic/p50 leftovers still apply. T04-11 leftover is expected (skipped).

**Remaining work (next paste of `SWARM.md` with config changed):**

| Phase | Folder | What it is |
| --- | --- | --- |
| 5 Training | `phases/05-training/` | Practice score, replay, optional bad readbacks |

Optional later (not required to have exited 4): T04-11 constant wind. Do not start phase 5 until a new swarm paste.

## Phase 4 procedures captain notes

- **Merged (`--no-ff`, captain only):** T04-01, T04-09, T04-02, T04-08, T04-10, T04-03, T04-04, T04-05, T04-06, T04-07, T04-12, plus `ticket/T04-ci-fix` (tsc) and `ticket/T04-ci-format` (Prettier). Isolated worktrees. Workers never merged. Deleted local ticket branches. Ignored junk `list` / `ls`. Skip **T04-11**. Did not start phase 5.
- **Tests:** `npm test` **927** passed, **1** skipped. `npm run ci` exit 0 (typecheck, lint, format:check, vitest). CIFP fixture tests offline (`tools/cifp-import`).
- **Product:** KDEM catalog JSON is the runtime catalog. `DCT` fly-by; `VIA`/`CROSS`; `APP ILS27` intercepts loc then GS from below; heading (`DAL123 H270`) cancels FMS; combined ILS `R240 A20 APP ILS27` holds alt until loc; missed at DA or Shift+H tower stub + land; CA lite 3 NM/1000 ft yellow then red; MSAW lite MVA polygons, inhibited on loc/GS/landing inside FAF. No wind. No chart scrape. No full CIFP cycle.
- **Manual leftover (human `npm run dev`):** T04-12 AC4 Chrome script — load `?scenario=kdem-ils27`; disclaimer; DAL123 on DEM1 north (VIA, ≥10000 / 250, don’t bust NEMAX); vectors then typed `R240 A20 APP ILS27` (readback until established + cleared i l s; hold ~2000 until loc, then GS ~6 NM); inside 5 NM **Shift+H** → `handoff.tower` / despawn `nav.landed`, or skip HO → missed climb 270/3000; AAL45 at SEMAX for CA (or `D10` MSAW); pause/1×/2×; no console errors. Binding on F1. Do not invent a visual pass.

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

## FOURTH SWARM COMPLETE — Path C (T03-15, T03-14)

T03-15 and T03-14 are on `master`. Captain `npm test`: **724 passed, 1 skipped**. Orchestrator `npm test` on `master`: **724 passed, 1 skipped**. Confidence gate gone: the voice loop always `parseCommand` after STT (empty clip / STT HTTP fail still reject; garbage still `parse_miss`). Path C is **miss-only** (`parseStage: "llm_c"`), default **off** until `/health.parse === "ready"`. Default named GGUF is `Qwen/Qwen2.5-1.5B-Instruct-GGUF` Q4_K_M (~1–2B, **not** a 7B). No GGUF in git. No paid LLM hosts. Skip **T03-11**. Did **not** start phase 4 or 5. Did not redo T03-01–13.

**Merged (`--no-ff`, captain only):** `ticket/T03-path-c-ticket-docs`; `ticket/T03-15-parse-despite-low-stt-confidence`; `ticket/T03-14-optional-path-c-parse-api`. Workers never merged. Untracked `e2e/` left uncommitted.

**Manual leftover (human):** download Path C weights only if enabling salvage — `pip install -r speech-api/requirements-parse.txt`, set `PARSE_MODEL_ID=Qwen/Qwen2.5-1.5B-Instruct-GGUF`, wait `/health.parse === "ready"`, then check **Path C (local /parse)** in settings. CI uses `SPEECH_API_MOCK=1` (no weight download). Optional live salvage of an A/B miss. Phase 3 Chrome/mic/p50 leftovers from the third swarm still apply.

**Remaining work (next paste of `SWARM.md` with config changed):**

| Phase | Folder | What it is |
| --- | --- | --- |
| 4 Procedures | `phases/04-procedures/` | ILS intercept, DEMO ONE STAR, lite CA/MSAW |
| 5 Training | `phases/05-training/` | Practice score, replay, optional bad readbacks |

Do not start those until a new swarm paste.

## Path C captain notes (fourth swarm)

- **Wave 0:** merged T03-docs — authored T03-15; T03-14 size M→L; AC1–AC8 kept; AC9–AC13 added (1–2B GGUF default, miss-only, settings checkbox, no n-best). `npm test` 704 passed.
- **Wave 1:** merged T03-15. Removed `transcript.confidence < threshold` early return in `voice-loop.ts`. Parseable heading at 0.5 dispatches; garbage at 0.5 is `parse_miss`. Slider informational. `npm test` 711 passed.
- **Wave 2:** merged T03-14. `POST /parse` local llama.cpp when `PARSE_MODEL_ID` set; 503/`UNAVAILABLE` when unset; `src/parse/path-c.ts` schema gate; `parseCommand` stage 4 miss-only; settings checkbox default false. Mock mode covers ACs without downloading GGUF. `npm test` 724 passed.
- **Skipped:** T03-11. No phase 4/5.
- **Product:** Path C default **off**. LLM does not override typed/A/B. Hub = weight download once. Grep-ban openai.com / api.groq.com / api-inference.huggingface.co.
- **Orchestrator:** `npm test` **724** passed, **1** skipped. Fourth swarm complete. Stopped before phase 4/5.

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

---

## TWELFTH SWARM BLOCKED — session setup (T04-24, T04-25, T05-13)

Feature base: `feature/session-setup`. T04-24 squash-merged (`93a7c10`); captain `npm test`: **119 files passed, 1349 passed, 1 skipped**. T04-25 was ready, but its required rebase onto T04-24 conflicted in `src/main.tsx`, `src/scenario/index.ts`, and `src/scenario/trafficQuery.ts`; its squash merge had the same conflicts. Per swarm rule, captain stopped without resolving by force. T05-13 was not started.

**Manual leftover:** T04-25 high-rate arrival check and all T05-13 setup/restart UI checks remain unperformed.

**Notes:** T04-23 departure/SID prerequisite tests passed (33 tests). The unavailable historical `54c56a2` object was not a blocker; current source/tests contained required behavior. Untracked `.cursor/rules/caveman-ultra.mdc` and `e2e/` artifacts remain untouched. T04-25 conflict state remains in its isolated worktree; feature base was restored to its committed T04-24 state.

---

## TWELFTH SWARM COMPLETE — session setup (T04-24, T04-25, T05-13)

Recovery resumed from `feature/session-setup`. T04-24 inventory (`93a7c10`), fresh isolated T04-25 retry (`35bd4d8`), and T05-13 session setup (`66f680a`) are squash-merged on the feature branch. Captain `npm test` and final `npm run ci`: **121 files passed, 1359 passed, 1 skipped, 0 failures**.

**Manual leftover:** Human Chrome check: open Session setup; change scenario/arrival/departure rate/seed; Cancel preserves World and focus; confirm Apply/restart warning rebuilds World; verify unavailable departure capability copy. Do not invent pass.

**Notes:** Picker options derive solely from playable inventory; normal arrival count/rate remains seeded STAR inbound/VIA; `?traffic=N` remains benchmark downwind; T04-21 owns departure rate. `atc-sim.session.v1` remains separate from trainer/DCB preferences. No scoring, replay, imperfect pilots, second position, DCB PREF, live traffic editing, second airport data, or radio-frequency IR. Initial T04-25 conflict was superseded by a fresh worker from the T04-24 feature base. Preserved untracked `.cursor/rules/caveman-ultra.mdc`, `e2e/`, and user-modified `speech-api/.env.example`.

