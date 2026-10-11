# T02-221 FMA Surveillance Loss and Coast Lifecycle

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** L\
**Depends on:** T02-220; shipped T02-75–77 report sampler\
**Blocks:** T02-222 through T02-228\
**Merge target:** `feature/fma`\
**Ticket branch:** `ticket/T02-221-fma-surveillance-loss-and-coast`\
**Launch:** Implement this ticket only when its prerequisites are merged on the configured feature target. Planning does not authorize execution.

## Mission

Provide FMA-only report aging, per-sensor update status, coast/freeze presentation and recovery. Make CST and NOM testable from actual report gaps without changing the shipped non-FMA no-coast display policy.

## Research and authority

Authoritative source: Raytheon STARS TCW/TDW Operator's Manual, TI 6191.409, Revision 30, supplied at `/home/ben/Documents/stars refs/full_manual.pdf`.

- Section 2.16.4 pp. 2-107–108 (PDF 163–164): assigned runway, adapted missing-update duration, CST, last coasted position, recovery, NOM with other sensors reporting and no aural NOM.
- Sections 6.16.8–9 pp. 6-137–139 (PDF 667–669): remove frozen tracks when applicable track/zone alerts are inhibited.
- Section 6.16.1 p. 6-127 (PDF 657): fast-update multilateration sensor concept. This ticket does not implement a live MLAT system.

Read `AGENTS.md`, the active FMA section of `phases/SWARM.md`, current phase README/AGENT, shared references/glossary/architecture/non-goals and the predecessor ticket contracts. Historical FMA exclusions are lifted only for this approved trainer feature. The user-authorized SpeechSynthesis exception is FMA-only; no radio/Command IR/Path C change is approved. Source-backed behavior and explicit trainer decisions must stay distinguishable.

## Command, state and lifecycle contract

1. Extend generic report/status adapters, not World physics. Last report pose/time/source and per-sensor availability are independent of live aircraft truth. FMA consumers receive immutable report-backed snapshots. Existing non-FMA FUSED/MULTI/single-site coverage and no-coast behavior remain unchanged.
2. Missing-update timers use simulation time and advance on the simulation update path even when no report arrives. No rAF-driven alert generation, Date.now threshold, or dependence on receiving the next report. Geometry samples change on new reports.
3. Carry an FMA retained report, elapsed loss time, coasted pose and frozen flag per canonical track ID. Use default loss threshold 10 s and coast-out threshold 30 s from T02-220 adaptation. Coast position extrapolates last reported ground track/speed, never current World heading/position. At coast-out freeze at the last coasted pose. Pause does not age; acceleration follows simulation time.
4. The status adapter distinguishes selected fast-update source loss with another source reporting from all relevant updates lost. NOM requires real source status; no substitute inference from generic report age. Deterministic synthetic sensor-interruption inputs must support both conditions for tests and final browser exercise without becoming a new controller command.
5. Recovery updates retained pose and clears loss/freeze state. Track removal, association termination, flight-plan deletion, FMA exit, selected-AMZ change and session teardown release affected references. Track/adjacency/all-zone inhibition notifications remove applicable frozen presentations; unsuppression must not resurrect stale frozen data without a current eligible report.
6. Retained tracks qualify against the selected AMZ from report/coast state and runway-assignment metadata supplied by T02-222. Do not use invisible live aircraft movement to push a frozen track out of the zone. The pure evaluator decides CST qualification and precedence; this ticket supplies report status and presentation lifecycle only.
7. Keep retained report status per display/TCW, separate from globally simulated CA/MSAW truth and from other displays. No persistence in PREF. An internal sensor-interruption fixture is not a speech/keyboard parser or mutable radio clearance.
8. There is no operator grammar in this slice. Incomplete sensor metadata leaves NOM unavailable rather than inventing sensor health. Invalid/nonfinite reports are rejected by report validation and cannot advance stabilization or clear a real retained episode.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Assigned monitored track stops receiving reports for 10 s | Snapshot marks surveillance lost at exact threshold | FMA-only retained report and timer | Missing reports cannot prevent timer advancement | §2.16.4 p. 2-107; trainer 10 s default |
| Report gap reaches 30 s | Freeze at last coasted pose | FMA retained presentation | Never freeze at hidden World truth or silently drop at coverage edge | §2.16.4 p. 2-107; trainer coast policy |
| Selected fast-update source absent; another source reports | NOM-capable status; current pose continues updating | Per-source availability | No NOM audio and no generic age-only substitute | §2.16.4 p. 2-108 |
| Sensor recovers / FMA exits / track inhibited | Recover or release retained presentation | Clear affected runtime only | No stale resurrection or PREF persistence | §§2.16.4, 6.16.8–9 |
| Same coverage loss outside FMA; paused or accelerated sim | Existing no-coast result; correct simulation-time aging | No global sensor behavior change | Render frames and wall-clock waiting do not age reports | Inherited sampler; explicit trainer clock |

## Files and ownership

src/scope/surveillance.ts; new scoped FMA report/lifecycle helper under src/scope/; ScopeView/session adapter; src/app/create-app.ts and src/ui/shell.tsx only for existing update wiring where needed; shared synthetic acceptance.

Keep `DisplayControlBar.tsx` and `renderScope.ts` thin, preserve their shipped splits and public re-exports, route DCB actions through `@scope`, and do not split `scopeKeys.ts` or the spoken pattern matcher. Use generic catalog/scenario loading and synthetic fixtures, never live airport branches.

## Acceptance criteria and tests

- [ ] **AC1 — Automated: exact 10 s/30 s thresholds, pause/acceleration, empty-report ticks, coast direction/speed and report recovery use synthetic clocks and poses.**
- [ ] **AC2 — Automated: selected-fast-source versus all-source interruption produces different status; malformed reports never synthesize fresh surveillance.**
- [ ] **AC3 — Automated: non-FMA report/coverage behavior remains unchanged, including immediate no-coast removal.**
- [ ] **AC4 — Automated: inhibition, association deletion, mode/AMZ/session cleanup cannot retain or revive stale frozen tracks.**
- [ ] **AC5 — Manual: reproduce sensor interruption and recovery through deterministic fixture injection and compare retained pose with last coasted position.**
- [ ] **Gate —** Focused checks, `npm run ci`, `git diff --check` and independent supplied-manual review pass before captain starts the next wave. If `speech-api/` changes despite this feature's exclusions, stop for scope review rather than silently expanding the contract; approved speech-api changes additionally require `SPEECH_API_MOCK=1 pytest`.

Use the single synthetic `src/scope/test/fmaFidelity.integration.test.ts` across the feature. Keep additional pure units minimal (one happy path plus 2–3 meaningful edges or a parameterized numeric table); share `src/scope/test/mockCanvas.ts`. Browser/audio/manual checks are labeled manual and are never inferred from CI mocks.

## User surfaces and documentation

Update docs/USER.md and phases/02-scope/README.md with FMA-specific aging/coast trainer policies and distinction from existing sampler. Record sensor fixture exercise in final acceptance; do not claim a new operational sensor health system.

## Manual-review checklist

- [ ] Check the exact printed sections/pages/tables above and any relevant actual raster figure.
- [ ] Walk every contract row through entry/routing, qualification or parsing, state/effects, rejection, test evidence and named user surfaces.
- [ ] Verify trainer defaults, unavailable behavior and user overrides are not presented as published STARS algorithms.
- [ ] Confirm no unintended radio, World intent, ownership, association or geographic-measurement mutation.

## Non-goals and handoff

No DCB, alert badge/audio, live radar/MLAT protocols, globally enabled coasting, proprietary tracking filter or World kinematics changes.

Use one isolated ticket branch/worktree from current `feature/fma` after captain verifies prerequisites. Preserve unrelated `.worktrees/`, `:memory:.ses` and `speech-api/:memory:.ses`; never reset/clean unclear work. Commit explicit ticket paths progressively after required gates. Do not merge, spawn, push or begin another ticket. Return exactly `READY TO MERGE` or `BLOCKED`, followed by AC/test/manual evidence and actual unrun browser/audio checks. Captain owns merges and the phase STATUS entry.
