# Later implementation backlog

This is the backlog of follow-ups implied by features that are already shipped.
It also includes the controller-training gaps approved after the STARS manual
audit on 2026-10-10. It is not a general roadmap for untouched phases.

Manual references below use Raytheon TI 6191.409, Full STARS FSL TCW/TDW
Operator's Manual, Final Revision 30, 20 August 2019 (the supplied
`full_manual.pdf`). Page numbers are the printed chapter-page numbers, not PDF
viewer indices. The audit covers simulator-relevant controller functions;
external NAS/TBFM exchanges, sensor protocols, workstation administration,
military workflows, and operational facility adaptation are not new scope.

## Priority order

Priority is based on operational safety, dependency leverage, and simulator
value. Items already shipped or limited to manual validation are excluded.

### P0 — core safety and runtime truth

1. MCI evaluator, suppression state, and `CA M` command semantics.
2. Predicted MSAW.
3. Two-phase coast (nominal 30-second total), suspend/unsuspend, dead reckoning, and re-correlation.
4. CSMM and duplicate-beacon world-level detection; cancellation-derived `NO FP` remains conditional on a modeled cancellation workflow.
5. Wake-aware live datablock output, including `NOWGT`.
6. ATPA exclusion criteria, per-track eligibility override, and per-position adaptation.

### P1 — controller operations

7. Pairwise minimum-separation graphics.
8. Dynamic range-bearing lines.
9. Controller-created restriction areas and annotations.
10. Emergency-airport/heliport lookup and bearing/range readout.
11. Departure exit-gate/fix resolution.
12. Adapted 2.5 NM ATPA eligibility.
13. Quicklook by track, owner TCP, and region, including live SSA status.
14. Complete pointout-to-datablock binding.
15. Locally simulated TSAS scheduling and display tools.
16. Flight-plan amendment modals and target-click deletion.
17. Scratchpad and assigned altitude/heading/speed display-data command chords.
18. Unsupported datablocks, flight-plan hold state, datablock/plan repositioning, and `/ ALL`.
19. Local coordination messages and redirected handoffs.
20. Clearance/plan synchronization, readback validation, route conformance, and audit state.
21. Full `<MULTI FUNC>` M/C/Y commands and limited-datablock beacon toggles.

### P2 — facility and display expansion

22. Live multi-sensor radar health and beacon-bank exhaustion telemetry.
23. CRDA ghost prediction, qualification regions, ghost datablock controls, and runway-pair modes.
24. MOA and selected-beacon workflows.
25. Richer SSA/facility status, ATIS broadcasts, and weather source handling.
26. Pilot barometric corrections and weather-driven deviation behavior.
27. Additional PTL prediction geometry and presets.
28. AVL restyle and remaining CRC-style DCB parity.
29. Handwritten strip annotations and cross-rack/window strip movement.

### P3 — procedure and voice follow-ups

30. Unsupported ARINC leg flying: `RF`, holds, arcs, and vector legs.
31. Airways and richer route grammar; RNAV/hold/RF in-sim FMS guidance.
32. Session-grounded abbreviated GA registration tails; complete make/model-plus-tail input is shipped.
33. Frequency assignment, receiving-position simulation, and facility communications entities.

The priority list is a planning view; detailed sections below are the source
of truth for shipped behavior, constraints, and scope boundaries.

Items removed from this list are shipped: flashing `LA`, manual CA inhibit,
basic RNAV/fix-to-fix flying, climb-via/descend-via, SID/STAR transitions,
CIFP parsing/closure/packing, KATL catalog/map integration, core TPA/PTL,
WX mosaic, catalog map management, core DCB controls, typed strip annotations,
handoff ownership, IFR clearance execution, VFR Class B, generic tower/center
transfer, and complete GA make/model-plus-tail typed/spoken input and pilot telephony.

## Scope and display

### Authored radar sites — live SITE/SSA chrome, no live sensors (T04-45 / T02-75 / T02-76 / T02-77)

Visible now: scenario JSON may declare trainer-authored `radarSites` (`id`,
`name`, `kind` `asr`|`airport`, ENU or lat/lon, `rangeNm` default 60,
`periodMs` default 4800). The loader validates rows and normalizes position
to local NM via `latLonToNm` and the scenario ARP. Omitted or empty
`radarSites` loads as `[]`, which is implicit FUSED (no site-selection
entries, not “no surveillance”). KDEM and KATL ship airport-at-ARP plus one
remote ASR using invented trainer ids (`KDEM-APT` / `KDEM-REMOTE`,
`KATL-APT` / `KATL-REMOTE`). T02-75 samples FUSED / MULTI / `{ siteId }`
display reports, freezes PPI / datablock / PTL / ATPA pose on the last
report, records history on report arrival, and paints the FUSED puck,
MULTI rectangle perpendicular to PTL / history, and single-site range-sized
rectangle (green far-side line ~30% longer than the block; outline when very
far). T02-77 binds those rows onto the
live view at boot and session apply (`radarSites` from the loaded scenario;
unknown stored SITE id → FUSED). MAIN SITE is enabled: submenu FUSED /
MULTI / one cap per adapted site; MAIN text is `SITE FUSED`, `SITE MULTI`,
or `SITE <id>`; SSA radar word follows that live mode. PREF persists SITE
display mode only and falls back to FUSED for an unknown stored site id.
PREF named sets (T02-73) and per-track PTL (T02-74) are shipped.

Deliberately missing:

- live sensor / network-health telemetry. SSA keeps the `OK/OK/NA` stub.
- two-phase coast after missing surveillance updates, with a nominal 30-second
  total coast duration. Out of coverage currently drops immediately.
- aural ATPA (CA remains the only conflict audio).

WX mosaic stays the other swarm (T02-68–72). Do not fold weather paint or
IEM/mosaic work into SITE follow-ups.

Constraints later work must keep:

- sites stay trainer fixtures, not NAS adaptation or official FAA ids;
- no `src/` import of `tools/cifp-import`; no airport-id site branch;
- empty `[]` remains implicit FUSED; range checks at report time belong
  to the sampler, not a KDEM-only fallback;
- World / FMS / CA / MSAW stay 20 Hz truth; display consumers use sampled
  reports. Future coast extrapolation is display state, never aircraft motion.

### Limited datablock beacon display commands (`*BE`, `*BI`, `*B [slew]`)

Visible now: Unassociated tracks render a Limited Data Block (LDB) with Mode C
altitude and reported beacon code. Slew queries ground speed in tens (`045  18`)
without flight rules or category suffixes.

Deliberately missing:
- STARS §6.13.9 global LDB beacon display toggle: `*BE <ENTER>` to show beacon
  codes in all LDBs, `*BI <ENTER>` to inhibit/remove beacon codes in all LDBs.
- STARS §6.13.7 single-track LDB beacon display toggle: `*B [slew]` to toggle
  beacon code display on a selected unassociated track.

Shipped: `*B` click provides the five-second transient beacon and ground-speed
readout. The remaining global and single-track toggles are still missing.

Constraints later work must keep:
- LDB Field 5 is strictly ground speed digits (tens or knots); no flight rules
  (`V`) or wake/category suffix.
- Slew query on unassociated 1200 targets must never promote to FDB or display
  callsign.

### MSAW tag is alert-only

Visible now: `evaluateMsaw` raises when MSL is strictly below the MVA
polygon floor (T04-10). The PPI paints a red **LA** tag (NAS STARS /
CRC Low-Altitude glyph). The LA/CA/MCI list already used `LA`. T04-10 also
shipped a 300 ft yellow caution band (`alt < floor` but `>= floor - 300`);
that band is unused.

NAS/STARS color displays use flashing red **LA** (NTSB A-06-44; JO 7110.65
5-14). CRC R07 names Low-Altitude / MSAW alert status. The live tag now
flashes; predicted MSAW (look-ahead still showing **LA** in red) is not modeled.

Manual evidence: §2.16.3, pp. 2-102–105, and Figure 2-37 describe predicted
and actual MSAW with the same LA presentation. Later prediction must use
generic aircraft trajectories and trainer MVA geometry with an explicit
look-ahead horizon; do not invent certified STARS prediction parameters.

Later work must keep: FDB glyph **LA** (not the letters MSAW); no GPWS/TAWS;
no datablock/target tint from MSAW; CA remains the only conflict audio. Do
not restore yellow MSAW without a cited STARS two-color MSAW rule.

### MCI is display scaffolding, not Conflict Alert

Visible now: CA is a distinct live alert system with per-track and per-pair
inhibit state. `WorldAlerts.mci` and MCI list/render paths exist, and `*MCI`
only gates that scope display.

Still missing: no MCI evaluator populates `WorldAlerts.mci` during world
steps; no per-track or beacon-scoped MCI suppression state; and no controller
`CA M` command. Do not represent MCI as a CA alias: later work must add its
own detection, suppression, and command semantics while retaining CA's
independent alert and inhibit behavior.

Manual evidence: §2.16.3, pp. 2-102–104; §7.17, pp. 7-28–29, for
owned-track/selected-beacon MCI suppression; and §8.2, p. 8-4, for the
system-wide `CA M` processing control. Suppression commands and display
latches must remain distinct from evaluator enablement.

### Real ATPA pairing and predicted geometry

Live now: catalog volumes walked by `approachId` (T02-43), in-trail pairing
and predicted monitor/warning/alert status on `world.alerts.atpa` (T02-44),
predicted cones (T02-45), datablock in-trail distance plus A/TPA cone mileage
(T02-46), and four real AUX TPA/ATPA cells (T02-47). R07 has no system-wide
ATPA on/off — a feature paints when `atpa[feature]` is on. Alert Cones gates
alert and warning; Monitor Cones is monitor-only. `AtpaState.on` remains in
PREF v2 as an unused leftover.

Later work must keep:

- volumes as data, walked by `approachId` — no facility id branch;
- CA as T04-09 datablock text (no 3 NM halo; circles on this scope are TPA
  J-rings);
- no aural ATPA tone (CA remains the only conflict audio);
- TPA J-rings and the `TPA_MI` spinner frozen as T02-28 (2 / 3 / 5 / 10 NM).

Wake-category minima are now shipped by T02-125–128. Adapted 2.5 NM extras,
per-position adaptation, and authored-vs-NAS volumes stay in
**ATPA separation criteria not yet modeled** below.

### ATPA separation criteria not yet modeled

T02-44 ships in-trail pairing and predicted monitor/warning/alert status
(`world.alerts.atpa`). Visible now:
`evaluateAtpa` reads `basicSeparationNm` / `reducedSeparationNm` /
`reducedWithinNm` from each catalog volume, pairs eligible tracks inside an
enabled volume, and classifies status from current distance plus linear
closure. Wake-enabled volumes optionally apply explicit FAA CWT adaptation.
Warning is predicted violation within **45 s** (R07). Alert is actual
`distanceNm < requiredNm` or a predicted loss within **24 s** (T02-140).
Cone length
when wake adaptation is enabled, cone length follows the explicit
leader-row/follower-column matrix; otherwise it follows the authored radar
minimum.

Shipped wake contract: `cwtWakeCategory` is separate from the display-only
`wakeCategory`; reviewed JO 7110.65 §5-5-4 adaptation data is loaded from JSON,
and missing categories or blank relationships produce `NOWGT` with a 10 NM
minimum. Later work must keep the JSON-minima path and must **not** infer
categories from aircraft type or display text.

Deliberately missing, each of which later work must keep the JSON-minima path:
- **ATPA exclusion criteria and per-track override.** §6.21.19, p. 6-186,
  excludes non-IFR tracks, tracks without valid established Mode C, and
  adapted excluded beacon codes or ACIDs. The per-track override bypasses
  only those exclusions; all other qualifying conditions still apply. Current
  geometry-based pairing does not provide this complete predicate or override.
  Keep exclusions authored in generic data and preserve existing volume,
  warning/alert, wake-minimum, and display-inhibit behavior.
- **Adapted 2.5 NM eligibility** beyond "both tracks inside
  `reducedWithinNm` of the threshold along the final." Real STARS reduces
  only under extra conditions (leader type, runway occupancy, facility
  authorization). Keep the volume JSON fields; extend the predicate, do
  not hardcode 2.5.
- **Per-position ATPA adaptation.** We are a single TCP, so there is no
  "adapted to display" matrix. A multi-position trainer must not assume every
  position sees the same volume enablement.
- **Aural ATPA alerting.** No ATPA tone. CA (T04-09) remains the only
  conflict audio; do not reuse the CA tone for in-trail ATPA.
- **Volumes as authored trainer geometry** rather than imported NAS
  adaptation. KDEM `atpa-volumes.json` is hand-authored. A second airport
  still adds a JSON row walked by `approachId`; do not special-case KDEM
  or invent an importer that silently fills unsourced sizes.

### Datablock runtime sources not yet modeled (T02-149–155 / T02-164–165)

Visible now: `buildDatablockRuntimeState` and `datablockSourceFromWorld`
(T02-164–165) centralize datablock runtime fields for PPI painting, overlap
testing, and pick hits into a single runtime structure. Canonical flight-plan
association (T02-149–155) establishes `FlightPlan.associatedAircraftId` as
authoritative truth via `flightPlanForAircraft(world, aircraft.id)`. Associated
tracks project filed ACID, beacon, altitudes, equipment, and scratchpads;
event-driven squawk updates correlate with active plans; track drop or `TERM
CNTL` cleanly disassociates plans without mutating aircraft surveillance or
kinematics. Terminated handoffs clear and leave targets as unassociated LDBs;
accepted handoffs clear stale unassociated state before restoring the full
datablock. The datablock formatter accepts explicit Figure 2-20 Fields 0–8
values. The remaining values below are formatter-capable but have no complete
live backing logic.

Deliberately missing:

- **Wake-aware ATPA datablock output.** The evaluator now exposes explicit
  wake/`NOWGT` source state and required spacing, but the live Field 6 adapter
  does not yet render `NOWGT` or recompute a complete datablock source model on
  sequence, approach, or category changes. Preserve the explicit
  `cwtWakeCategory`/display `wakeCategory` boundary and the JO 7110.65-backed
  matrix; do not parse display text or infer categories.
- **Departure exit gate/fix.** Field 3 accepts an explicit `exitGate` or
  `exitFix`, but no runtime adapter resolves the value from the departure,
  SID/route, facility adaptation, and excluded-fix rules. Keep procedure and
  fix lookup generic and data-first.
- **TSAS runtime.** Field 6/7/8 formatting accepts TSAS values, but there is
  no Terminal Sequencing and Spacing scheduler. Later work would need eligible
  arrivals, runway assignment, sequence, target delivery time, advised speed,
  early/late calculation, sequence number, enable/inhibit state, and live
  updates. Manual §6.29, pp. 6-201–213, also describes slot markers,
  trajectories, timelines, and secondary datablock ETA/STA/speed-advisory
  fields; §§6.29.28–29 cover sequence swaps and runway-mismatch acknowledgement.
  A future trainer implementation should generate schedules locally, with
  explicit eligibility and coast/frozen-track cleanup, rather than require a
  live TBFM service. Do not imply TSAS exists merely because its literals format.
- **`NO FP` datablock indicator.** Figure 2-20, p. 2-67, defines this Field 6
  indication for a Cancellation (CX) message received while the flight is in
  the Coordination list, resulting in conversion to a local flight plan.
  Formatting exists, but the cancellation/conversion source lifecycle does
  not. Do not show `NO FP` merely because a target is unassociated, unfiled,
  or in controlled airspace. Keep this follow-up conditional on a modeled
  local cancellation workflow; do not add an external NAS exchange to supply it.
- **CSMM detection.** Manual §2.12, p. 2-61, defines a mismatch between the
  associated interfacility IFR flight plan's ACID and independently received
  sensor target identification; §5.7.11, p. 5-200, covers indicator removal.
  A trainer may model that independent Flight ID as authored surveillance
  data without implementing ADS-B protocols. Compare identities exactly;
  never derive the sensor identity from the displayed callsign or show CSMM
  merely because a display alias differs.
- **Duplicate beacon detection.** Existing beacon mismatch formatting is not
  duplicate-code detection. Manual §2.12, p. 2-61, defines `DB` on an
  associated track when another associated or unassociated track in the
  adapted auto-acquisition area reports the same discrete code as that
  associated track's assigned beacon. Add world-level detection with generic
  authored acquisition geometry and live datablock projection; do not flag
  every shared non-discrete code such as 1200. Include the per-track indicator
  inhibit from §5.6.4, p. 5-149. Keep this separate from assigned-versus-reported
  mismatch and never scan/associate other aircraft when one squawk changes.
- **MOA and selected-beacon sources.** Field 6 accepts `MOA` and selected
  beacon values, but no live MOA assignment or selected-beacon workflow feeds
  them.
- **Pointout-to-datablock binding.** Pointout/handoff lifecycle exists, but a
  complete adapter still needs to expose `PO`, `UN`, `RD`, and accept-count /
  inhibition state to Field 8 with documented priority.

Keep deferred: Field 1 ADS-B markers, ADS-B loss/duplicate-address (`DA`)
workflow, and new Field 2 glyphs. Those remain out of scope until their
underlying surveillance services exist.

### Pairwise minimum-separation graphics

Visible now: CA evaluates conflicts, ATPA evaluates in-trail spacing, and PTL
draws track prediction lines. None supplies the controller-selected pairwise
minimum-separation tool.

Missing: manual §6.4, pp. 6-17–18, permits `<MIN>` followed by two track
selections to display dynamically updated predicted closest horizontal
separation and the two projected positions. `<MIN><ENTER>` removes the
graphics; selecting a new pair replaces the old pair. Figure 6-1 includes
`NO XING?` when horizontal separation begins increasing and `0.00 NM` for
predicted zero horizontal separation regardless of vertical separation.

Constraints later work must keep: scope-local observational graphics, no
Command IR or kinematic mutation; reject duplicate/invalid track selections;
remove stale geometry when either track drops; use generic motion/coordinate
helpers and the appropriate surveillance display state. This is a horizontal
measurement aid, not a replacement for CA or a claim of safe vertical separation.

### Dynamic range-bearing lines

Visible now: range rings, scope range, and PTLs work. No live range-bearing
line model, endpoint-selection workflow, or renderer exists.

Missing: manual §§6.7–6.8, pp. 6-55–58, describe up to nine numbered lines
between fixes, scope locations, or tracks. Moving endpoints update bearing
and range; exactly one track endpoint also supplies traversal time from
ground speed. Lines have explicit single/all removal and off-screen label
handling. Bearing must use authored magnetic variation, not raw ENU angles.

Constraints later work must keep: scope-only measurement, no route/intent
changes; generic fix lookup and stable track identity; explicit cleanup of
missing endpoints. The manual's `*T` entry collides with the trainer's existing
list grammar, so planning must resolve command-state routing without regressing
list management or guessing aliases.

### Controller-created restriction areas and annotations

Visible now: catalog video maps and their authored labels render. Procedure
restriction labels are not controller-created restriction areas.

Missing: manual §6.6, pp. 6-35–52, describes creating text, circles, and
open/closed polygons with text; moving/deleting areas; editing/hiding text;
showing/hiding areas; acknowledging blinking text; and maintaining a live
Restriction area list. These support temporary exercise boundaries and scope
annotations. The manual distinguishes controller-created IDs 1–100 from
adapted IDs 101–200; future identity handling must preserve that distinction.

Constraints later work must keep: generic local geometry and authored data,
separate from immutable map packs; controller annotations do not themselves
authorize flight, alter Class B clearance, generate avoidance, or change
kinematics. No operational TFR/NAS feed, military-only color workflow, or
external propagation is required for this trainer slice.

### Emergency-airport and heliport lookup

Visible now: airport catalogs and regional geometry support navigation and
weather displays. No scope emergency-destination lookup/readout exists.

Missing: manual §§7.1–7.2, pp. 7-3–6, describe bearing/range to a selected
known airport/heliport and a nearest-suitable lookup by aircraft category and
optional lighting requirement. Repeated Enter cycles matching candidates;
the chosen location receives a temporary blinking marker. Readout includes
identity, elevation, bearing/range, and available runway/helipad dimensions,
surface, lighting, and communications information.

Constraints later work must keep: suitability facts must come from generic
authored regional data; do not infer unprovided runway capability, lighting,
or frequencies. Preserve category filtering and explicit `NOT FOUND` behavior.
Lookup is advisory scope information, not an automatic diversion clearance,
pilot action, or guarantee that an airport is operationally suitable.

### Richer TPA controls

Shipped in T02-48 / T02-49: per-track `*J` / `*P` rings and ground-track cones
(1–30 NM, session state not PREF), `**J` / `**P` clear-all, and size-readout
inhibit. DCB TPA_MI stays 2/3/5/10. F7 `<MULTI FUNC>` inhibit commands stay
deferred under "Manual Inhibit Commands and Safety Inhibit Glyphs". Preview
Area command holes (including those MULTIFUNC chords) are listed under
**STARS preview area — commands not parsed**.

### STARS preview area — commands not parsed / deferred

The Seventeenth Swarm (T02-61–67) implements the core single-controller STARS keyboard command set:
- `<TRK>` (`+`) and `<SLEW>` (`/`) track initiation, callsign association, and track dropping
- `<ENTER>` inbound handoff acceptance; `<MULTI>` (`*`) pointout acknowledgement and cyan highlight
- Data block mode toggling (`/` click **datablock** for PDB ↔ FDB; `/` click **symbol** drops owned track), leader line direction (`* [1-8]` / `* 0`), and beacon readout (`*B` **click** is T02-66 5s beaconator on uncorrelated; bare `*B` **Enter** is TPA `*B INV`)
- System list management (`* T`, `* TV`, `* TC`, `* TS`, `* P1`–`P3`, `* TM`, `* TX`, `* TN`), visible line limits (`[1-100]`), and click relocation (`* [List] [Click]` / `* S [Click]`)
- Video map toggles (`* D [ID]`, `* D OFF [ID]`, `* D ALL`, `* D NONE`, `M [ID]`)
- Scope display manipulation (`* C [Click]`, `* OFF`, `* RR [Spacing]`, `* RR C [Click]`, `* RR OFF`, `* PTL [Min]`, `* HIST [0-9]`)
- Altitude filters (`* F`, `* LA [Floor] [Ceiling]`) and beacon filters (`* BCN [Code]`, `* BCN DEL [Code]`)
- TPA / ATPA standard chords (`* J [Radius]`, `* P [Miles]`, `* J 0` / `* P` clear, `* AI [Click]`, `* AE Enter`). Compact `*P3` is a 3 NM cone; spaced `* P3` is Tower list 3. All pseudo-text or dot commands have been removed.

The following specialized or multi-subsystem command sets remain deliberately deferred to later phases:

1. **Flight Plan Amendments & Modals:**
   - `* F [Callsign] <ENTER>`: Open flight plan creation / amendment modal (typed `<ACID> [options]` creation is shipped).
   - `* V [Callsign] <ENTER>`: Create VFR flight plan modal.
   - `* A [Callsign] <ENTER>`: Create abbreviated flight plan modal (typed `*M <flid> ...` field edit and `*B <flid>` release are shipped).
   - `* DEL <ENTER> [Click Target]`: Delete flight plan / drop flight plan association by clicking target (typed `*DEL <index>` queue deletion is shipped).

2. **Scratchpads & Assigned Display Data:**
   - `* [Text] <ENTER> [Click Target]`: Set Scratchpad 1 (length and reserved-token rules require manual validation).
   - `* /[Text] <ENTER> [Click Target]`: Set Scratchpad 2.
   - `* [Alt] <ENTER> [Click Target]`: Set assigned altitude (e.g. `* 050`).
   - `* H[Heading] <ENTER> [Click Target]`: Set assigned heading (e.g. `* H240`).
   - `* S[Speed] <ENTER> [Click Target]`: Set assigned airspeed (e.g. `* S210`).

   These are deferred trainer spellings, not validated manual contracts. Scope
   entries update plan/display data only; they are not autopilot overrides and
   must never mutate pilot intent or aircraft motion.

3. **Advanced Track States & Unsupported Blocks:**
   - `<TRK SUSP>`: Suspend a flight plan; `<INIT CNTL>` unsuspends according to §§5.4.3–4, pp. 5-71–76. This is distinct from hold state and automatic coast.
   - `<MULTI FUNC>ZZ`: Toggle flight-plan hold state, showing `HL` and retaining a frozen unsupported block with `ZZ` after coast-out (§5.4.5, p. 5-77). This does not command airborne holding.
   - Unsupported datablocks: Activate a plan at a scope location without a radar target, retain a frozen independent display anchor, and support later association (§5.4.1, p. 5-66). Do not invent a literal `+ UNS` manual command.
   - `<TRK RPOS>`: Move the full datablock and flight-plan association to an unassociated target or scope location (§5.7.3, pp. 5-187–189). Never reposition aircraft kinematics.
   - `/ ALL <ENTER>`: Drop track on all owned targets simultaneously.

4. **Converging Runway Display Aid (CRDA):**
   - `* CRDA ON [Pair ID] <ENTER>`: Activate CRDA runway pair configuration.
   - `* CRDA OFF [Pair ID] <ENTER>`: Deactivate CRDA runway pair.
   - `* CRDA DISP <ENTER>`: Display active CRDA configuration matrix.

**Shipped vs deferred collisions (do not regress):**
- Idle F is the altitude-filter chord (`beginFilterEntry`). `*F` Enter is T02-65 FILTER readout and does **not** open the deferred `*F [Callsign]` flight-plan modal.
- `*BCN` / `*BCN DEL` are T02-65 beacon filters. Bare `*B` Enter is TPA (`*B INV`). Live `*B` click is T02-66 beaconator.
- Compact `*P1`/`*P2`/`*P3` (and `*P5`/`*P10`) are TPA cone miles. Tower lists require a space: `* P1`–`* P3`. `*PTL` is PTL minutes.

Constraints later work must keep: never Command IR; radio line isolated; reject unknown rather than no-op; data-first catalog; self-hosted speech.

### Track lifecycle and handoff ownership

The STARS CRC Scope Fidelity Addendum (T02-34–38) shipped the complete radar
display fidelity model: target symbol shapes (`◇`, `*`, `V`, `□`, Sector IDs),
LDB with 5s ground speed queries, PDB for unowned associated tracks, FDB
dynamic time-sharing (~2.5s cycle) and Line 3 assigned altitudes `A<alt>`,
inbound/outbound handoff blinking, pointout lifecycle (offer, accept, `UN`
reject, `**` convert), and cyan track highlight. T02-134–139 replaced the old
outbound three-click progression with shared Center/Tower destination handling,
five-second receiver-TCP retention, single-position auto-accept, and explicit
F4 return-to-unowned.

Possible future follow-ups:
- quick-look multi-facility track filters;
- host automated flight-plan amendments and route conformance monitoring.

#### Local coordination messages and redirected handoffs

Visible now: inbound/outbound handoffs, pointouts, simulated receiver
acceptance, and departure-release coordination lists are shipped. These are
not a general coordination-message lifecycle or redirected handoff workflow.

Missing: manual §5.1.5, p. 5-12, describes redirected handoffs;
§§5.2.1–3, pp. 5-41–43, describe creation, display, and transmission of
coordination messages. A trainer follow-up can model local messages and
redirects between synthetic receiving positions, with observable pending,
accepted/rejected, cancelled, and completed state as applicable to each
manual-backed workflow. Complete `RD`/pointout datablock binding remains
under **Datablock runtime sources not yet modeled**.

Constraints later work must keep: no live NAS/ARTS messages or external
controller service; preserve the shipped ownership/communications distinction,
white previously-owned FDB rule, receiver retention, and explicit F4 action.
Quicklook never transfers ownership or redirects a handoff. Any future radio
command changes must retain Command IR/Path C parity.

#### Post-acceptance handoff ownership cue

The supplied STARS manual (TI 6191.409 Rev. 30, General Rules p. 5-9;
§§5.1.3–5.1.4 pp. 5-10–5-11; datablock colors p. 2-70) says that the
former owner’s accepted handoff remains a white **Owned / Previously Owned**
FDB until the controller explicitly uses **Return data block to Unowned color**.
The position symbol identifies the controlling position; white alone does not
mean the track is still controlled locally. CRC documents a different,
VATSIM-oriented memory aid: after acceptance, clicks stop the white flash,
turn the FDB green, and then change it to a PDB. vice separates track ownership
from aircraft control and uses explicit `FC` to transfer communications, then
turns the sender’s datablock green.

ATC-SIM currently follows the manual’s white-FDB rule for accepted Center and
Tower handoffs, retains the receiver TCP for five simulated seconds,
auto-accepts supported destinations in the single-position trainer after five
simulated seconds, and offers F4 as the explicit return-to-unowned action.
Preserve the manual distinction between owned and previously owned, and avoid
implying that white proves local control.

### SSA and GI data beyond trainer stubs

SSA displays live primary altimeter settings on Line 3, multi-airport satellite altimeter matrix rows in 3-airport chunks (T02-79), and surface weather conditions in designated GI TEXT slots (T02-80), fetched from the AviationWeather METAR JSON API (T02-78). Airport list is defined in scenario JSON (`ssaWeatherAirports`).

Remaining possible follow-ups:
- richer facility status and ATIS-style broadcasts;
- pilot aircraft barometric kinematic corrections;
- source timestamps, stale-data handling, and alerting.

### Quicklook (`QL`) by track, owner TCP, and region

Visible now: SSA formatting accepts Quicklook status text, but no complete live
Quicklook selection/presentation state feeds it.

Missing: manual §2.12, p. 2-60, and §6.13, pp. 6-84–106, describe displaying
other owners' tracks with full datablocks by individual track, owner TCP,
all-owner selection, and adapted region; Quicklook Plus uses the owned color.
The workflow includes force-Quicklook actions (§6.12.6, p. 6-69), active
TCP/region readout, per-selection removal, and live SSA status.

Constraints later work must keep: Quicklook controls display visibility and
presentation, not ownership, aircraft control, or handoff routing. Do not
treat it as a general filter that removes locally owned tracks. Use generic
synthetic TCPs/regions and preserve PDB/FDB and previously-owned color rules.
Exact keyboard grammar must be grounded in the manual during planning; the
old `Q <sector>` sketch was not a complete validated command contract. No
external multi-facility network or metered dependency is required.

### PTL targeting

Per-track PTL is shipped (`*R` plus click, session map, not PREF). Global ALL /
OWN / LNTH / `*PTL` minutes and F7 stay as they are. Remaining follow-ups are
additional duration presets and richer prediction geometry.

### DCB capabilities and Weather Telemetry (T02-81 / T02-82 / T02-83)

The trainer DCB includes live MAIN WX1–6 latches, live BRITE WX/WXC spinners,
live SITE (FUSED / MULTI / adapted sites), live DCB VOL spinner (modulating
workstation CA alert tone gain linearly 0–5 with 0 = mute), live MAIN MODE FSL
toggle (3-way latch cycling Full/Semi/Limited datablock presentation), live
BRITE BKC spinner (adjusting background canvas contrast/clear color 0–100), and
live SSA WX / WX HIST radar mosaic status & staleness telemetry (with DCB SSA
FILTER WX toggle). All settings are persisted in PREF v3.

Remaining later implementations:
- AVL 2×3 / half-height badge restyle;
- fuller CRC-style DCB workflows.

Catalog-backed maps, map management, and the shipped DCB controls are complete;
do not re-add them as generic backlog items.

Do not fill empty map slots with OSM or add unvetted controls as an incidental
change; each capability needs its own data and acceptance criteria.

### WX mosaic leftovers (T02-72 / T02-82)

Shipped display-only path: IEM N0Q VIP 1–6 fills, MAIN WX1–6, `*WX`, BRITE
WX/WXC contours, BRITE BKC background contrast, SSA WX / WX HIST telemetry, and
SSA FILTER WX toggle. `ensureWxMosaic` on the session rAF fetches one IEM N0Q
XYZ tile cover when the mosaic is empty, older than 5 min, or no longer covers
the full airport pad. Fetching continues with every WX latch off.
Extra WX clicks do not refetch. Default levels remain off. Live tiles need
Vite `/wx-iem` (`npm run dev`). Not WMS GetMap — IEM MapServer FILTER
rejects the `nexrad-n0q` layer group.

Still later:

- Pilot deviate via `vipAtNm` (query exists; does not steer aircraft)

Manual leftover: Chrome KATL live IEM walk. skip-with-reason: no visual
operator in this worker worktree. Automated tests cover DCB / `*WX` /
BRITE / cached paint / SSA WX telemetry. Do not invent a visual pass.

Airport-centered WX now requests a ±512 NM square, covering the 512 NM radius
in the trainer's local coordinate system. Coverage is bounded to 64 tiles and
2048×2048 pixels, with four concurrent requests and Mercator-to-latitude
resampling. Available WX intensity layers build once per mosaic update in a module worker,
with a row-batched fallback when workers are unavailable, including while every
WX latch is off. Toggles combine cached layers immediately; brightness applies
at paint time without rebuilding pixels. Rendering clips each source layer and
stipple mask to the visible viewport before scaling, and caches the composed
weather canvas with a 128 CSS-pixel margin at the display pixel ratio. Small pans
shift and crop that cached composition; crossing the margin or changing range,
viewport, selection, brightness, or mosaic rebuilds it. Every frame draws the
cached composition once. SSA WX text is cached per mosaic and selection;
SSA and DCB share availability computed once per completed weather batch. The previous layer set remains visible
until the replacement is ready; stale results are ignored, and disabling every
WX level hides the layer immediately.
This is a trainer coverage choice, not a manual-required sensor
radius (STARS manual §4.4.1 p. 4-33; §4.6 p. 4-42). It does not guarantee
coverage of a panned viewport or rectangular display corners beyond this area.
Polar requests extending beyond Web Mercator latitude limits return empty
weather on the normal retry cadence; future polar-source work must preserve
bounded fetching, generic ARP coordinates, and truthful coverage metadata.

### Manual Inhibit Commands and Safety Inhibit Glyphs

STARS CRC supports manual per-track inhibition commands via the `<MULTI FUNC>` (F7) keypad interface:
- `<MULTI FUNC>M<SLEW>`: Toggles display of Mode C altitude for a specific track.
- `<MULTI FUNC>C<SLEW>`: Inhibits Conflict Alert for a specific track (rendering `▲` after the aircraft callsign).
- `<MULTI FUNC>Q` / `<MULTI FUNC>V` are shipped as scope-local trainer controls: Q suppresses only a current LA alert and V toggles persistent per-track MSAW processing; both render the ACID `*`. They are not certified MSAW.
- `<MULTI FUNC>Y(###)<SLEW>`: Enters a pilot-reported altitude (rendering `*` after altitude numbers).

Q/V controls are shipped as scope-local trainer behavior. The remaining M/C/Y
manual invocation commands and corresponding glyph extensions are preserved for
later implementation when a full STARS `<MULTI FUNC>` keyboard chord parser is
introduced. Typed Preview Area holes that include those chords are listed under
**STARS preview area — commands not parsed** rather than duplicated here. Later
work must preserve the distinct Q current-alert lifetime and V persistent
per-track lifetime.

### CRDA Ghost Prediction and Dynamic Runway Configuration Pairing (RPC)

Visible now: `CRDA STATUS` in-scope list formatting RPC pairs 1–6 (e.g., `1  BOS 27/22L`, `2  BOS 27/33L`, `3  BOS 4L/15R`, etc.) and active SSA status (`*S1 BOS 27/22L`).

Deferred to future simulation phases:
- **Live Ghost Target Generation**: Mathematical projection of master runway approach tracks onto slave runway approach centerlines based on threshold crossing time estimates.
- **Stagger Cones & Tie Lines**: Dynamic display of spacing cones and connecting tie lines between real aircraft and projected ghosts for converging and dependent runway operations.
- **STARS Table 26 CRDA Keyboard Grammar**: Keyboard commands for pairing activation/deactivation, spacing distance adjustment, and runway configuration switching.
- **Qualification and ghost presentation**: Runway qualification regions and
  course-line segments, per-pair/per-runway/per-track ghost visibility,
  force/unforce qualification, ghost leader direction, parent-track readout,
  and full/partial ghost datablock presentation (§6.5, pp. 6-19–34).
- **Live runway-pair modes and status**: Tie/stagger/disabled modes with
  truthful list/SSA state and cleanup when a pair is disabled (§8.7,
  pp. 8-11–12). Existing formatted RPC rows are not evidence of active ghosting.

Constraints later work must keep: runway pairs and qualification geometry are
generic authored trainer data; ghosts are display projections, never new
physical aircraft or altered pilot trajectories. Keep projected ghosts separate
from live targets in selection, CA/ATPA, and ownership. Do not require
operational facility adaptation or infer pair enablement from placeholder SSA text.

### Surveillance drop-out, two-phase coast, suspend, and reacquisition

Visible now: `COAST/SUSPEND` formatting accepts entries, but its live renderer
receives an empty list. Missing coverage removes display reports immediately;
F3/Track Suspend is consumed without a lifecycle mutation.

Manual evidence: §2.15.2, pp. 2-93–94, Figure 2-29/Table 2-23, describes
two coast phases. Phase 1 starts when an expected single-source update is
missing, or updates from all sources are missing in MULTI/FUSED. The position
symbol changes to the coast symbol and altitude becomes `CST`. Phase 2 removes
the track from the scope and places its flight data in Coast/Suspend. The
nominal **30 seconds is total coast duration**, not a delay before Phase 1.
Manual durations are adapted; the trainer needs an explicit deterministic
timing contract rather than treating 30 seconds as universal.

Deliberately missing:
- **Live coast lifecycle**: Missing-report detection, both phases, current
  list entries/status, and cleanup of track-dependent tools and alert inhibits.
- **Display dead reckoning**: Extrapolate the last reported ground-track
  vector during coast as a documented trainer display behavior, never by
  advancing or relocating the actual aircraft. This audit does not establish
  a certified STARS extrapolation algorithm.
- **Suspend/unsuspend**: Manual §§5.4.3–4, pp. 5-71–76, distinguish explicit
  plan suspension from automatic coast. Implement eligibility restrictions,
  `C` versus `S` list state, and reactivation/association behavior. Suspended
  plans remain until explicitly terminated; do not auto-delete them.
- **Re-correlation**: Restore the appropriate associated display on valid
  returning reports. Preserve canonical plan identity and reject ambiguous
  beacon matches instead of associating solely because a code is shared.

Constraints later work must keep: World/FMS/alert evaluation uses live truth;
coast, unsupported anchors, and stale-report extrapolation are separate display
state. Do not require real sensor protocols or reuse flight-plan hold state as
coast/suspend. **STARS preview area** owns the remaining command-entry gaps.

### SSA Multi-Sensor Fusion Telemetry and Network Health

Visible now: SSA header layout rendering alert indicator `[▼]`, subset `(1)`, Zulu time + altimeter, network-health stub plus live radar word (`OK/OK/NA FUSED` / `MULTI` / selected site id), beacon blocks, red SPC alerts, range + PTL, dual altitude filters, and satellite airport altimeters. Network health is still the `OK/OK/NA` stub, not live sensors.

Deferred to future simulation phases:
- **Live Multi-Sensor Radar Health Telemetry**: Dynamic degradation to `NA/NA/NA` with sensor-specific failover when individual radar heads disconnect.
- **Automated Beacon Bank Exhaustion Tracking**: Dynamic allocation and exhaustion warnings for discrete transponder code banks.

## Procedures

### SID and STAR climb-via / descend-via and transition amendments (T04-19 / T04-43 / T04-44)

Visible now:
- **`CLIMB_VIA` (`VIA_SID`) and `DESCEND_VIA` (`VIA_STAR`)**: FMS vertical guidance climbs or descends through published crossing altitude and speed constraints (`AT`, `AT_OR_ABOVE`, `AT_OR_BELOW`), clamped by controller-assigned altitude or top altitude (T04-04, T04-19).
- **STAR transition amendments**: `DESCEND_VIA [STAR] [TRANS]` and `JOIN [STAR] [TRANS]` (e.g. `VIA DEM1 NORTH`) resolve through `joinStarTransition` at shared common fixes (T04-43).
- **SID transition amendments**: Controller commands `CVIA [SID] [TRANS]` (e.g. `CVIA BAY1 NORMA` or spoken "climb via BAY ONE, NORMA transition") resolve through `joinSidTransition`, preserving active runway transition legs and amending enroute transitions at shared common fixes (T04-44).
- **Runway transition amendments**: `CVIA [SID] RW[XX]` allowed while the aircraft is still navigating runway-transition legs (T04-44).
- **Departure spawning**: Runway centerline departure roll-out automatically arms `lateral: PROCEDURE` and `vertical: VIA_SID` via `departureSpawnPose` (T04-21 / T04-29).
- **Heading cancellation**: Radar vector headings (`H###`) immediately cancel `VIA_SID` / `VIA_STAR` and revert vertical mode to `ASSIGNED`.

Deliberately missing:
- **Unsupported ARINC 424 leg types in real-world SIDs**: Heading-to-altitude vector legs (`VA`, `VI`, `VM`) and curved radius-to-fix (`RF`) legs are skipped by the CIFP importer. SIDs composed entirely of radar vectors (e.g., KATL's `ATL2`) have zero named-fix legs and are omitted from catalog packs.

Constraints later work must keep:
- Procedure transitions remain data-driven via catalog JSON common fixes; no facility-specific branches (no `if (icao === "KATL")`).
- Unsupported ARINC path terminators must remain explicit skips/diagnostics, never silently flattened into straight-line TF legs.
- Radar headings must continue to cancel `VIA_SID` and `VIA_STAR`.

### CIFP importer — unsupported ARINC behaviors (T04-31)

Visible now: `tools/cifp-import` reads a **local** CIFP file (comma-separated
T04-08 subset or 132-char ARINC 424-18) into `NormalizedCifpSource` and emits
`ProcedureCatalog` with supported SID, STAR, and approach fields. Source
`latDeg` / `lonDeg` is preserved; scenario ENU is derived only at catalog emit.
`NormalizedSid` (runway / common / enroute) is exported for T04-33. Runtime
`src/` does not import this tool or parse ARINC 424.

Deliberately missing, each of which later work must keep as diagnostics — never
silent straight-line TF conversion:

- **RF, holds, arcs, procedure turns.** Path terminators `RF`, `HA`/`HF`/`HM`,
  `AF`, `PI` are counted in `skippedByType` and omitted from catalog legs.
- **Heading / course-unterminated legs.** `CA`/`CD`/`CI`/`CR`, `VA`/`VD`/`VI`/
  `VM`/`VR`, `FA`/`FC`/`FD`/`FM` are skipped the same way.
- **Continuation-record payloads.** Primary records only; `*-CONT` rows are
  skip-counted.
- **CIFP tool boundary vs in-sim FMS.** Catalog `sids` may be non-empty. FMS
  climb-via and transition amendments are implemented in-sim (T04-19 / T04-44),
  but this offline tool only extracts and emits JSON catalog rows; verifying
  active route-following for all imported rows is not this tool.
- **Chart scrape and vendor APIs.** Input stays a local path. Full CIFP/NASR
  cycles stay out of git (`.cifp/`).

Constraints later work must keep:

- one conversion path: local CIFP → normalized IR → existing catalog schema;
- no `src/` import of `tools/cifp-import`; no airport-id runtime branches;
- KDEM remains the authored default scenario;
- unsupported legs stay explicit skips, not flattened geometry.

### CIFP national source storage and pack-generation boundary (T04-32)

Visible now: `tools/cifp-import/spatialIndex.ts` exports `selectByRadius` and
`CifpRadiusSeed` (airport ARP origin, `radiusNm` in nautical miles,
source `latDeg` / `lonDeg` only). Radius is a geographic seed. It does not
walk SID/STAR/approach references and does not contain every procedure leg.
`buildSpatialIndex` keys records by ICAO and `identity.key`. Runtime `src/`
does not import this tool.

Repository boundary, not implementation backlog:

- **National CIFP / derived national index in git.** A full cycle or a
  nationwide source/index dump must stay on disk under gitignored `.cifp/`
  or `tools/cifp-import/out/`. Only synthetic fixtures under `testdata/cifp/`
  belong in the repo.
- **Browser or network fetch.** No Vite import, no CDN, no vendor API, no
  chart scrape.

Constraints later work must keep:

- one local path: CIFP on disk → `NormalizedCifpSource` → radius seed →
  closure → existing catalog schema;
- no `src/` import of `tools/cifp-import`; no airport-id runtime branches;
- KDEM remains the authored default scenario;
- seed coordinates stay source lat/lon; ENU only at catalog emit;
- national source/index files stay gitignored and are never bundled.

### CIFP radius seed vs procedure-reference closure (T04-33)

Visible now: `tools/cifp-import/closure.ts` accepts a duck-typed `ClosureSeed`
(airport plus optional `radiusNm` plus `selected` record arrays) and
`closeProcedureReferences` recursively includes SID / STAR / approach
references from the full normalized source. SID **runway transitions** are
walked with common and enroute legs. `catalogWriter.ts` writes the existing
catalog `files` layout. Tests prove a far SID runway-transition fix outside
the seed radius is present after closure, and that an unrelated airport
procedure is excluded.

Module boundary, not implementation backlog:

The generic pack CLI already owns radius selection and wires it to closure.
Closure intentionally keeps required out-of-radius references, remains a
developer tool, and does not add new RNAV / hold / RF flying.

Constraints later work must keep:

- radius is seed only — never a silent procedure truncate;
- look up missing refs in the full source, not only `seed.selected`;
- fail or report missing / ambiguous / cross-airport refs with procedure and
  source-record names;
- emit the existing `files` layout and preserve source lat/lon;
- no airport-id runtime branches; KDEM stays the authored default.

### Generic CIFP pack CLI (T04-34)

Visible now: `npm run cifp:pack` (and `cli.ts pack`) parses a **local**
fixed-width CIFP, seeds by ARP radius, closes SID/STAR/approach refs, and
writes the existing ICAO `files` layout. `--sids` / `--stars` /
`--approaches` select `ClosurePolicy.kind === "explicit"`; omit them for
`airport-all`. `--dry-run` reports seed vs closure counts and unsupported
records without writing. `extract-katl-slice.ts` is a thin default-flag
wrapper (`--airport KATL`, `--radius 40`) that only calls generic pack.
`src/scenario/data/katl/` is the committed trainer catalog pack; west/east
scenario JSON is registered in playable inventory. Video maps are a separate
CRC conversion pack loaded through generic `loadVideoMapSet("KATL")` (T04-39),
not CIFP-emitted. Authored trainer MVA is a uniform 3000 ft floor (not FAA
source data).

Trainer boundary, not CIFP implementation backlog:

- **KATL ATPA, telephony.** Catalog JSON and authored scenario/spawn files
  are separate. Maps are not CIFP-emitted (CRC pack is T04-39). Never point
  KATL at KDEM maps.
- **Operational / FAA KATL MVA.** Shipped chart is a uniform 3000 ft trainer
  box over the ±60 NM training area, not source sector minima.
- **Heading-only vector SID flying (`ATL2`).** Unsupported CIFP path
  terminators stay skipped; empty named-fix SIDs are omitted from the pack.
- **RNAV / hold / RF FMS and heading-vector leg guidance.** (Standard TF
  SID climb-via and transition amendments are already operational in-sim via
  T04-19/T04-44.)

Constraints later work must keep:

- one generic pipeline — no `if (icao === "KATL")` parse or runtime branch;
- KDEM remains the authored default;
- national CIFP / intermediates stay gitignored (`.cifp/`,
  `tools/cifp-import/out/`);
- `src/` never imports this tool.

### CIFP pack integration acceptance (T04-35)

Visible now: every listed playable scenario loads its catalog through
generic `loadCatalog`. Map-backed entries also load `loadVideoMapSet`; KATL
uses `videoMapSet: "KATL"` (T04-39 CRC pack). KDEM remains the authored default. `loadCatalog(dir)`
is unchanged. CIFP-derived packs interchange with authored catalogs via
`parseCatalogFiles` (same parser). Synthetic second-facility testdata
(`testdata/catalog-packs/kbbb/`) and `tools/cifp-import/pack.integration.test.ts`
prove no facility-id branch and that SID/STAR/approach refs outside the seed
radius remain after pack write. `extract-katl-slice.ts` stays a thin
default-flag wrapper. `src/scenario/data/katl/` is the committed trainer
catalog pack. `src/scenario/katl.json` and `katl-08.json` author west/east
flows from that catalog and are session-visible inventory entries. Maps and
ATPA stay outside CIFP catalog JSON. Trainer MVA is a uniform 3000 ft floor,
not FAA source data.

Boundary and remaining procedure gap:

- **RNAV / hold / RF flying** from imported CIFP. Unsupported path
  terminators stay diagnostics, not TF legs.
- **National dump in git, T04-11 wind, phase 5.**

Constraints later work must keep:

- one conversion path: local CIFP → pack → existing catalog schema;
- no `src/` import of `tools/cifp-import`; no airport-id runtime branches;
- KDEM remains the authored default and boots without CIFP;
- radius is seed only; closure keeps out-of-radius procedure refs;
- maps, spawns, MVA, ATPA, and telephony stay authored, not CIFP-emitted.

### KATL A80 video maps (T04-36–42)

Visible now: committed trainer pack under `src/scenario/video-maps/KATL/`
(catalog, per-map JSON, manifest, `groups.json` sidecar, attribution).
Playable `katl.json` / `katl-08.json` set `videoMapSet: "KATL"` and load
through generic `loadVideoMapSet` / `loadVideoMapGroups`. Catalog `id` is
the CRC ULID; `starsId` is DCB/command identity; `dcbNumber` is omitted.
Default group is `groups.json` `sourceIndex` 0. GEO MAPS lists all 90 maps,
including 17 GEO-only ULIDs in `mapsAbsentFromGroups`. `*D ALL` / `*D NONE` /
CLR ALL / CURRENT walk the full inventory. CRC A/B is `map` / `mapDim`.
Runtime does not read CRC or import the converter.

Remaining procedure gap:

- **RNAV / hold / RF FMS.** CIFP catalog rows
  stay as T04-35. Unsupported path terminators stay diagnostics.

Constraints later work must keep:

- no `if (icao === "KATL")` runtime branch; KDEM stays the authored default;
- do not densify CRC ULID / `starsId` identity to 1–30;
- do not commit local CRC cache JSON/GeoJSON;
- `src/` never imports `tools/crc-videomap-import`; no runtime vNAS fetch.

### Terminal Flight Progress Strips follow-ups (T02-90–96 / T02-158–162)

Visible now: 5-column physical terminal flight progress strip layouts (`1–4 |
5–7 | 8/8A/8B | 9/9A/9B/9C | 10–18`) for Departures and Arrivals adhering to
FAA Order 7110.65 Chapter 2 §3; pale buff cardstock styling (`#f5eedc`) with dark
high-contrast text; CWT/wake formatting; route truncation; Box 8A/8B runway and
fix assignments; arrival Box 9 altitude/remarks; departure Box 9
route/destination/remarks; canonical flight-plan projection (CID, equipment
suffix, assigned beacon, PTD/ETA) keeping reported squawk separate; 2-column rack
board (`StripsBoard`) with independent vertical scrolling; standalone URL
routing (`?view=strips`); in-scope overlay modal with header toggle button
(`STRIPS`); track selection synchronization to `World.selectedAircraftId` via
`selectTrackFromFlightStrip`; dynamic simulation traffic derivation via
`terminalStripsFromWorld`; single right-click horizontal strip indentation
("cocking", ~28px offset) with native context menu suppression; intra-section
drag-and-drop reordering with visual drop indicator lines; and telemetry
reconciliation preserving manual order and indentation across live ticks.

Deliberately missing:
- **Handwritten canvas drawing / annotations**: freehand pen strokes or stylus drawings on strip annotation boxes.
- **Cross-rack or cross-window drag-and-drop**: moving strips between departure and arrival bays or dragging between separate browser windows.

Constraints later work must keep:
- Flight progress strips remain an observational display and intent reflection; clicking or manipulating strips never emits Command IR or mutates pilot kinematics directly.
- Dark controller cab theme (`#1a1e24`) and FAA 7110.65 5-column cardstock proportions must be preserved.
- Standalone view `?view=strips` must remain decoupled from PPI WebGL/Canvas2D loops for second-monitor use.

## Voice

### Radio communications transfer to tower/center (no frequency)

Shipped in T04-101–103: typed, Path A/B/C, PTT, and speech-parser parity for
`CONTACT_TOWER` and `CONTACT_CENTER`; generic tower/center transfer gates;
VFR visual-final reuse; and landing-based IFR plan closure. Facility names are
syntax/readback/log data only. No frequency field, facility lookup, individual
tower/center entity, or Raytheon STARS behavior exists.

Still deliberately missing: live frequency assignment, facility-specific
communications entities, tower-cab/ground coordination, receiving-position
simulation, and real facility identity validation. The current trainer uses
generic eligible-destination and outbound-handoff gates, and does not claim
facility-specific operational fidelity.

Constraints later work must keep:
- Follow FAA JO 7110.65 §§2-1-15/16/17 and 7-6-8: transfer remains coordinated and
  the named receiving function is distinct from radar-service termination.
- Keep `CONTACT_TOWER` and `CONTACT_CENTER` generic across regional data; do not add
  facility-specific branches or hardcoded facility identity validation.
- Maintain Path C / Command IR synchronization for any later contract change.
- Inbound pilot check-in, frequency assignment, and receiving-position behavior remain
  decoupled from this trainer slice.

### Controller VFR clearances through/into Class B

Visible now: Ambient VFR traffic and post-cancellation autonomous navigation are guarded by
the modeled three-dimensional Class B volumes. Outside-Bravo IFR cancellation deterministically
replans an unsafe autonomous VFR suffix around Class B before the atomic IFR-to-VFR transition;
cancellation inside Class B remains rejected. Controller-issued VFR `TO_ENTER`, `THROUGH`, and
`OUT_OF` clearances now have active state, catalog-grounded 3D route validation, temporary
altitude handling, boundary events, exact exit notification, and explicit
`REMAIN_OUTSIDE_BRAVO` / `RESUME_APPROPRIATE_VFR_ALTITUDES` behavior. Flight following, radar
contact, and `MAINTAIN_VFR` remain advisory/radio states only; none authorizes Class B entry.

Pilot-initiated VFR Class B requests are now also implemented: geometry-driven
ambient traffic requests `TO_ENTER` or `THROUGH` before a projected 3-D Bravo
crossing, `say request` reports the stored intent, and exact approval/denial/
standby responses resolve the request without adding a pilot `OUT_OF` path.
`CLEARED AS REQUESTED` copies only the pending VFR request's operation, route,
and requested altitude. No Raytheon STARS display/manual behavior is part of
this slice.

This slice deliberately does not add VFR-on-top, SVFR, Class C/D authorization, tower cab
coordination, visual landmarks/corridors, certified separation, or implicit route repair from
unrelated commands. Manual controller review of FAA phraseology and operational suitability
remains outside automated acceptance.

Constraints later work must keep:

- VFR entry into Class B requires explicit controller clearance; ordinary flight following,
  radar contact, `MAINTAIN_VFR`, or IFR cancellation never implies approval. FAA JO 7110.65
  §7-9-2 specifies clearance to enter/through/out of Bravo, with route and altitude as
  applicable.
- IFR cancellation outside Class B must continue to produce and validate a deterministic safe
  VFR continuation; cancellation inside Class B remains rejected and never implies Class B entry
  authorization.
- Validate complete 3D swept segments against grouped Class B geometry, and keep rejected
  commands atomic. Preserve flight following, beacon state, and the editable flight plan
  unless a later clearance contract explicitly changes them.
- Use generic regional-airspace and catalog walkers; no KATL/KDEM branches. Keep frontend
  parser, Command IR, Path A/B, Path C, `speech-api`, GBNF, prompt, readback, parity tests,
  and documentation synchronized.
- Do not add VFR-on-top, SVFR, Class C/D authorization, cloud speech, or implicit route
  repair from an unrelated command.

### GA callsign aliases — shipped complete tails, deferred abbreviation

Visible now: T03-27–31 ship authored aircraft make/model aliases, pilot
check-in/readback/TTS output, complete alias-plus-registration-tail input in
typed commands and spoken Paths A/B, and bounded Path C alias grounding.
For example, `Skyhawk 172SP` resolves to the live canonical `N172SP` when the
authored alias and complete tail match uniquely. Aliases remain input/output
presentation; Command IR carries canonical identity. Acceptance coverage is in
`src/parse/test/aircraftCallsignAliasAcceptance.test.ts`; self-hosted Path C
prompt/validation accepts only listed canonical identities.

Deliberately missing: session-grounded abbreviated registration tails, such
as `Skyhawk 2SP` for `N172SP`. The current contract requires the complete tail;
unknown, incomplete, or ambiguous alias evidence rejects without falling back
to the selected aircraft. Abbreviation requires an explicit later contract,
not relaxed fuzzy repair. Complete make/model-plus-tail input is not backlog.

Constraints later work must keep:
- Aircraft profiles and aliases remain data-first, with no facility branches.
- Synchronize any grounding change across typed input, Paths A/B/C, Command IR
  grounding, speech-api prompt/semantic validator/GBNF, mocks, evals, and docs.
- Preserve unique live-target grounding and canonical identity; never let an
  ambiguous suffix or explicit invalid alias use selected-aircraft fallback.
- Self-hosted speech only; no cloud inference or unconstrained fuzzy repair.

## Explicit boundary


This document does not pull in untouched phase work such as scoring/replay,
constant-wind simulation, a licensed STARS typeface, or other
features that have not been partially implemented in the shipped slices.

### Clearance and flight-plan execution — remaining tails

Radio-issued tactical clearances, IFR route activation, supported SID/STAR FMS
execution, controller squawk assignment, generic tower/center transfer, and
VFR Class B clearance/request workflows are shipped. The remaining work is:

- synchronize amended filed-plan data with active clearance state without
  silently retargeting an already-cleared aircraft;
- add richer route grammar, including airways and additional route-leg forms;
- validate pilot readbacks, mismatches, rejected or misunderstood clearances,
  and audit state linking each clearance to its plan;
- detect IFR route deviation and expose controller-visible conformance state;
- add live frequency assignment, receiving-position identity, facility-specific
  communications, and tower/ground coordination;
- route future squawk sources through the aircraft-scoped correlation hook;
  each source must update reported squawk first and may not scan or associate
  other aircraft.

These flows must preserve the boundary: scope plan editing does not emit
Command IR or mutate kinematics; radio clearances do. Keep pilot execution
self-hosted and do not add metered speech services.
