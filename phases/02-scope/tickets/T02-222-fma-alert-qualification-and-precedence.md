# T02-222 FMA Alert Qualification and Precedence

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** L\
**Depends on:** T02-220, T02-221\
**Blocks:** T02-223 through T02-228\
**Merge target:** `feature/fma`\
**Ticket branch:** `ticket/T02-222-fma-alert-qualification-and-precedence`\
**Launch:** Implement this ticket only when its prerequisites are merged on the configured feature target. Planning does not authorize execution.

## Mission

Evaluate report-backed FMA conditions using separate scratchpad assignment and observed runway alignment. Preserve assigned-NOZ history, explicit trainer stabilization/prediction and the manual's four-condition precedence.

## Research and authority

Authoritative source: Raytheon STARS TCW/TDW Operator's Manual, TI 6191.409, Revision 30, supplied at `/home/ben/Documents/stars refs/full_manual.pdf`.

- Section 2.16.4 pp. 2-107–108 (PDF 163–164), Table 2-27: qualification, precedence, assigned NOZ history, missing assignment as a runway-error case, onset-only speech and NOM.
- Section 6.16.5 pp. 6-133–134 (PDF 663–664): assignment appears in datablock scratchpad #1 or #2.
- Section 6.16.9 pp. 6-138–139 (PDF 668–669): per-zone adjacency suppression.
The manual does not publish the complete predictor or course-stabilization algorithm.

Read `AGENTS.md`, the active FMA section of `phases/SWARM.md`, current phase README/AGENT, shared references/glossary/architecture/non-goals and the predecessor ticket contracts. Historical FMA exclusions are lifted only for this approved trainer feature. The user-authorized SpeechSynthesis exception is FMA-only; no radio/Command IR/Path C change is approved. Source-backed behavior and explicit trainer decisions must stay distinguishable.

## Command, state and lifecycle contract

1. Implement pure evaluation under src/core/alerts/fma.ts, supplied with T02-220 geometry/adaptation and T02-221 display-specific report snapshots. Scope runtime owns per-TCW mode/AMZ/inhibits/episodes; do not inject local FMA alerts into global WorldAlerts. Evaluation runs on report events, with loss status refreshed on simulation-clock updates.
2. Only tracked associated targets within selected AMZ boundaries participate. RWY further requires arrival to that AMZ's airport. Reuse existing canonical association/destination metadata; absent arrival/destination evidence cannot be guessed from geometry. Surveillance lost requires a runway assignment. No ownership or selected-track prerequisite is invented.
3. Assigned runway comes only from exact, case-normalized scratchpad #1/#2 matching catalog runway IDs or explicitly adapted aliases. One recognized runway, or matching values in both slots, gives assignment. Neither recognized gives NONE. Two different recognized values give AMBIGUOUS and an assignment diagnostic, not an automatic RWY alert. Unknown text does not become a runway. Never infer assignment from clearance, selected approach, intent, nearest runway, or report heading; never edit scratchpads.
4. Observed runway is independently derived from position/ground-track reports: inbound toward threshold in the monitored course corridor, cross-track within 0.15 NM and direction within 3 degrees continuously for 10 s by default. Use report time and wrapped course difference. Exactly one qualifying runway is needed; multiple candidates mean unresolved alignment. Invalid/missing reports or failing alignment break continuous stabilization; do not integrate hidden World poses. Thresholds are adaptation-owned trainer policies.
5. Stabilized observed runway matching assigned runway gives no RWY. A different runway or NONE assignment gives RWY. AMBIGUOUS assignment gives diagnostic and no invented mismatch; other independently valid conditions still evaluate. Ambiguous observed runway gives no RWY yet.
6. NTZ warning requires entry into enabled NTZ after detection in the NOZ for assigned runway. Direct NTZ spawn does not fabricate history. Clear/reset eligibility on runway reassignment, AMZ switch, association termination and session reset. Boundary-inclusive containment; warning wins over caution.
7. Caution uses report-based linear ground-track projection and intersection with enabled NTZ inside the independent 10 s default horizon. Test crossing anywhere within horizon rather than only endpoint containment. Geographic evaluation stays in world NM and is unaffected by display MAG/PTL setting. No 3D glideslope/blunder predictor.
8. Select one primary FMA condition per track: NTZ WARNING > SURVEILLANCE LOST > RUNWAY ERROR > NTZ CAUTION. NOM remains supplementary no-speech sensor status, composed with existing Field 0 indicators rather than assigned an invented fifth place in the primary precedence list. Badge composition is completed in T02-223.
9. Track episodes include condition identity, onset/clear, affected zone/runway IDs and qualification evidence. Repeated reports with unchanged condition are not new onsets. Clear/re-entry and primary-condition changes are new episodes; acknowledgment/speech-silence does not survive a new episode. Mode entry/AMZ changes requalify current reports without reviving old episodes.
10. Track inhibits remove all FMA conditions for that track. Disabled NTZs cannot produce warning/caution. Disable every NTZ adjacent to a runway and suppress CST/RWY for that runway. All NTZs disabled suppress all primary FMA conditions; display glyph visibility is separate from saved session inhibit state.
11. Outline aggregate severity is red while any qualifying NTZ warning remains, otherwise yellow while any applicable caution remains, otherwise white. Acknowledgment does not lower it. No physical intruder lacking warning eligibility is silently counted as an NTZ warning.
12. No operator grammar is introduced. Diagnostic state must use existing user-visible diagnostic surfaces without inventing a STARS error mnemonic. The downstream command tickets define operator errors. Evaluation changes no World aircraft, plans, control/association, radio, selection or camera.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Scratchpad 08L; stabilized observed 08R | RWY after stabilization | Local alert episode only | No clearance/nearest-runway assignment fallback | §2.16.4 p. 2-108 |
| No recognized scratchpad; stabilized 08R | RWY | Local episode | No RWY before stable unambiguous observation | §2.16.4 p. 2-108; trainer thresholds |
| Scratchpads 08L and 08R / two observed candidates | Assignment diagnostic / alignment unresolved | No fabricated RWY | Neither picks first array match nor auto-corrects scratchpads | Approved assignment refinement |
| Assigned NOZ report then NTZ entry / direct NTZ spawn | Warning / no manufactured prior-NOZ qualification | History keyed by track and assignment | Reassignment or AMZ change clears eligibility | §2.16.4 p. 2-107 |
| Prediction crosses NTZ then leaves before endpoint | Caution within lookahead | Primary condition only if no higher condition | PTL zero and MAG do not disable prediction | §2.16.4 p. 2-108; explicit predictor |
| Concurrent warning/CST/RWY/caution | Highest primary condition; NOM remains supplemental | One primary episode per track | Unchanged sweep is not another speech onset | §2.16.4; Table 2-27 |
| Adjacent NTZs all inhibited for runway | CST/RWY suppressed for that runway | Local suppression only | Other runway with enabled adjacency still monitored | §6.16.9 |

## Files and ownership

new src/core/alerts/fma.ts; core exports; scoped FMA runtime/report adapter; association/flight-plan read adapters; shared synthetic feature acceptance; minimal parameterized evaluator units.

Keep `DisplayControlBar.tsx` and `renderScope.ts` thin, preserve their shipped splits and public re-exports, route DCB actions through `@scope`, and do not split `scopeKeys.ts` or the spoken pattern matcher. Use generic catalog/scenario loading and synthetic fixtures, never live airport branches.

## Acceptance criteria and tests

- [ ] **AC1 — Automated: distinct assigned versus observed runway values cover scratchpads #1/#2, alias/exact matching, missing/conflicting assignments, missing arrival evidence and nonunique observed runway.**
- [ ] **AC2 — Automated: continuous stabilization thresholds, invalid/report gaps, reassignment and nonzero magnetic variation are report-driven.**
- [ ] **AC3 — Automated: NOZ history, direct NTZ entry, path intersection, four-tier precedence, NOM coexistence and outline aggregation pass.**
- [ ] **AC4 — Automated: per-track/adjacent/all-zone inhibits, clear/re-entry and condition changes produce correct episodes without altering World.**
- [ ] **AC5 — Manual: compare every qualification rule to §§2.16.4 and 6.16.9; all unsupported thresholds/algorithms remain explicitly trainer choices.**
- [ ] **Gate —** Focused checks, `npm run ci`, `git diff --check` and independent supplied-manual review pass before captain starts the next wave. If `speech-api/` changes despite this feature's exclusions, stop for scope review rather than silently expanding the contract; approved speech-api changes additionally require `SPEECH_API_MOCK=1 pytest`.

Use the single synthetic `src/scope/test/fmaFidelity.integration.test.ts` across the feature. Keep additional pure units minimal (one happy path plus 2–3 meaningful edges or a parameterized numeric table); share `src/scope/test/mockCanvas.ts`. Browser/audio/manual checks are labeled manual and are never inferred from CI mocks.

## User surfaces and documentation

Add assignment-versus-observed-runway explanation and threshold/ambiguity policies to docs/USER.md and phases/02-scope/README.md. No new controller diagnostic command or radio grammar.

## Manual-review checklist

- [ ] Check the exact printed sections/pages/tables above and any relevant actual raster figure.
- [ ] Walk every contract row through entry/routing, qualification or parsing, state/effects, rejection, test evidence and named user surfaces.
- [ ] Verify trainer defaults, unavailable behavior and user overrides are not presented as published STARS algorithms.
- [ ] Confirm no unintended radio, World intent, ownership, association or geographic-measurement mutation.

## Non-goals and handoff

No assignment inferred from radio clearances, automatic scratchpad correction, pilot intervention, CA/MSAW replacement, voice backend, operator bindings or rendering.

Use one isolated ticket branch/worktree from current `feature/fma` after captain verifies prerequisites. Preserve unrelated `.worktrees/`, `:memory:.ses` and `speech-api/:memory:.ses`; never reset/clean unclear work. Commit explicit ticket paths progressively after required gates. Do not merge, spawn, push or begin another ticket. Return exactly `READY TO MERGE` or `BLOCKED`, followed by AC/test/manual evidence and actual unrun browser/audio checks. Captain owns merges and the phase STATUS entry.
