# T02-233 FMA NTZ Independence and Integrated Acceptance

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** M\
**Depends on:** T02-231 and T02-232 merged and gated\
**Blocks:** none\
**Merge target:** `feature/fma`\
**Ticket branch:** `ticket/T02-233-fma-ntz-and-profile-acceptance`\
**Launch:** Wave B only after both Wave A gates.

## Mission

Prove authored adaptation and disjoint profiles work together; preserve NTZ/video
map independence and cascading suppression. Reconcile help/docs and phase policy.

## Scope and ownership

Own src/scope/test/fmaFidelity.integration.test.ts, the display-profile acceptance
file only for combined edges, docs/USER.md, src/ui/overlays/ScopeHelpOverlay.tsx,
phases/02-scope/README.md and AGENT.md. Narrow actual fixes may touch
src/scope/dcb/dcbFunctions.ts, src/scope/fmaAlerts.ts, src/core/alerts/fma.ts,
src/scope/render/renderScopePaint.ts and DisplayControlBarMenus.tsx only when a
named acceptance failure proves necessity. Existing suppression already works;
do not rewrite engine merely to satisfy ticket name. Extend existing backlog only
if exposed required behavior remains incomplete, never add speculative work.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| NTZ 1 inhibit | Warning/caution disabled; boundary absent | No video-map/category/camera mutation | Other enabled NTZ unaffected | §6.16.9 p. 6-138 |
| NTZ ALL with all enabled / some inhibited | Inhibit all / enable all | Button highlights and boundary paint match | Never toggle mixed state into all inhibited | §6.16.9 p. 6-139 |
| Inhibit all zones adjacent to one runway | RWY/CST suppressed for that runway; frozen track removed | Other runway remains eligible if adjacent zone enabled | Re-enable restores eligibility, no stale frozen pose | §6.16.9 pp. 6-138–139 |
| All zones inhibited | Remove active FMA alerts/frozen tracks and suppression glyphs | Background maps unchanged | No hidden suppression glyph remains | §6.16.9 pp. 6-138–139 |
| MAPS toggle in FMA | Selected video map changes only | ntzIds unchanged | Does not reactivate inhibited NTZ boundary | §4.1; §6.16.9 |
| Authored reciprocal AMZ select/save/default/exit/reload | Full target profile; normal returns on exit/reload | Normal/other-AMZ saved bodies isolated | Missing profile preserves display and warns | §§4.1.10,6.16.1–2; trainer delta |
| Unadapted scenario / malformed label / cancel | Unavailable or unchanged context | No World/flight-plan/ownership mutation | Existing error/focus guards unchanged | §6.16.1; inherited routing |

## Acceptance criteria and tests

- [x] AC1 Automated: parameterized synthetic 2/3-runway adjacency, NTZ button/map independence in both directions, map category/camera unchanged by buttons.
- [x] AC2 Automated: mixed NTZ ALL, active alert/speech cancellation, frozen release, per-runway RWY/CST suppression/re-enable and all-off glyph hiding proven.
- [x] AC3 Automated: generic authored scenario end-to-end supports reciprocal selector and independent saved profiles, missing profile behavior, normal exit/reload and no runtime persistence.
- [x] AC4 Automated: acceptance tests stay generic; one dedicated profile integration and shared FMA fidelity file, minimal additional pure tests; use mockCanvas helper.
- [x] AC5 Docs: Help, docs/USER.md, README/AGENT accurately describe authored-only availability, all-AMZ selector, trainer-authored data and complete disjoint profiles; preserve historical ticket text and identify superseded policies.
- [ ] AC6 Manual: actual browser adaptation/maps/NTZ/default/save/exit/reload verification, supplied manual audit; report UNRUN checks explicitly if browser unavailable.
- [x] AC7 Gate: focused tests, npm run ci, git diff --check and independent supplied-manual review pass; stop at this ticket.

## Non-goals / manual checklist

No other phases, operational facility fidelity, new speech/backend, Command IR,
service modes, aircraft/flight-plan mutations or broad alert algorithm changes.
Check each matrix row against printed §6.16.9, Figures 6-15/17, §2.16.4 and
§§4.1.10/6.16.1–2; inspect actual rendered strokes and negative side effects.
Complete trainer profiles, all-AMZ selection, normal exit/reload and authored-only
loading are explicit approved deltas, not new manual claims.

## Research and constraints

Authority: Raytheon STARS TCW/TDW Operator's Manual TI 6191.409 Revision 30,
`/home/ben/Documents/stars refs/full_manual.pdf`. Consult printed sections/pages,
not secondary simulators. §6.16.1 pp. 6-127–128 gates FMA and applies preferences
if present; missing preference warns NO PREF SET FOUND without application of
default display settings. §6.16.2 p. 6-130 selects AMZ and applies its preference.
§4.1 pp. 4-4–5 covers general preferences; its explicit AMZ-specific automatic
list is runway leader directions and displayed maps. §4.1.1 p. 4-6 selects user
FMA; §§4.1.2/4.1.4 require names identical to AMZ IDs (1–7 alphanumerics).
§4.1.10 p. 4-21 applies current AMZ preference for DEFAULT in FMA.
§6.16.9 pp. 6-138–139 controls NTZ alert/boundary inhibition, cascading RWY/CST,
frozen removal, suppression glyph hiding, and mixed-state NTZ ALL enabling all.
§2.16.4 pp. 2-107–108 qualifies associated tracked targets within AMZ, alert
precedence, arrival/stabilization and absent/mismatching runway assignment.
Figure 6-15 p. 6-126 shows geometry/reference eligibility; Figure 6-17 p. 6-129
shows AUX. No authentic facility geometry is supplied by this manual.

Approved trainer deltas: authored-only geometry, all-AMZ availability irrespective
of active scenario flow, trainer-authored KDEM/KATL, complete disjoint normal and
AMZ display profiles, normal reload and exit to last-used normal preference.
Never represent these broader policies as exact published STARS algorithms.
Preserve AGENTS.md thin modules, generic tests, existing F8/focus/modifier routing,
self-hosted radio speech and existing FMA SpeechSynthesis exception. No Command IR,
parser grammar, flight-plan, World/intent, ownership or kinematic changes.

## Entry, rejection and lifecycle rules

No new radio grammar or overloaded keys. Inherited MODE -> FMA -> ACCEPT -> DONE,
AUX AMZ spinner (wheel/drag then pointer commit, or label + ENTER), PREF actions,
and NTZ buttons retain existing scope-only routing. Incomplete confirmation or
spinner entry does not apply state; CLEAR/Esc cancels and restores candidate state.
Native input, Help, modifier guards, Ctrl+F8 DCB and bare F8 Preview stay unchanged.
Malformed AMZ label retains current context and uses existing FORMAT/ILL VALUE
validation; extra data does not gain aliases. Disabled FMA mutates nothing; retain
1K omission, controller privilege and DSF availability gates. Missing preference
is a warning, not rejection. Runtime cleanup on mode/AMZ/scenario change remains
mandatory. Do not invent a new CMD NOT AVAIL response for a disabled pointer cell.

## Gate and handoff

Read the eighty-eighth SWARM section, phase README/AGENT and shared references.
Work only on this ticket in assigned isolated worktree from feature/fma. Never
merge, spawn, push or amend another ticket. Use absolute paths for edits and set
workdir explicitly for commands. Preserve unrelated files/artifacts. Before each
application/test/tool commit run focused tests and npm run ci; fix failures, never
skip hooks. Stage explicit owned paths only. Walk each contract row through its
routing, effects, negative case, tests and help/docs. Report commits, paths, AC
status, CI and actual Manual/UNRUN checks with READY TO MERGE or BLOCKED.
Captain performs independent supplied-manual review before merge and captain CI
plus manual recheck after merge. No broad STARS/NAS compatibility claim.

## Captain completion evidence (2026-10-12)

Implemented and squash-merged onto `feature/fma` in the eighty-eighth swarm.
Automated gates and independent pre/post-merge supplied-manual reviews passed.
See `phases/SWARM-STATUS.md` for commits, corrections, CI counts and citations.
The visual/browser acceptance criterion remains unchecked: browser inventory was
empty, so actual UI/keyboard/audio interaction is UNRUN, as explicitly permitted
by this swarm stop configuration. Native-button routing and mockCanvas coverage
are automated/inspection evidence only, not actual browser execution.
