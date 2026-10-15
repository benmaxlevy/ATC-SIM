# T02-231 Authored FMA Adaptation and All-AMZ Selection

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** L\
**Depends on:** shipped T02-220–230\
**Blocks:** T02-233\
**Merge target:** `feature/fma`\
**Ticket branch:** `ticket/T02-231-authored-fma-adaptation`\
**Launch:** Wave A, concurrent with T02-232; disjoint owned files.

## Mission

Load complete authored FMA adaptation through existing catalog schema/loaders.
Production scenarios without valid authored AMZs cannot enable FMA. Expose every
valid authored AMZ, including reciprocal-flow groups, without facility branches.

## Scope and ownership

Own src/scenario/procedures/types.ts, loadCatalog.ts, src/scenario/fmaFlow.ts,
src/core/alerts/fmaGeometry.ts, src/scenario/data/kdem/ and katl/ adaptation data,
existing catalog contract tests and src/scope/test/fmaFidelity.integration.test.ts
only for schema/flow expectations. Do not edit ScopeView/DCB/profile/UI modules,
docs/USER.md or phase README/AGENT (T02-233 reconciles docs).
Extend existing fmaOverrides, not a competing schema. Require authored boundary,
runway/NOZ and NTZ polygons; permit explicit fix bars, reference/course lines and
physical runway endpoints using generic ENU NM contracts. Validate finite/simple
nondegenerate geometry, unique 1–7 alphanumeric AMZ IDs, runway/approach/NTZ
references and map references when applicable. Report invalid adaptation at the
loader with actionable path; do not silently accept geometry then guess it.
Do not require unrelated proprietary monitoring data. Deterministic generic
reference-line expansion from authored layout/200-ft spacing is allowed and must
be documented; runtime heuristic AMZ/NOZ/NTZ construction is forbidden.
Keep deriveFmaAmzs only as clearly isolated test/offline fixture utility if useful.
CATALOG_ADAPTED must not falsely certify dimension-only inferred production groups.
Trainer-authored KDEM/KATL adaptation has explicit provenance/note; never label it
verified authentic facility geometry. No background map fallback on missing PREF.
resolveFmaFlow keeps public shape for its consumer but no longer filters AMZs by
activeRunwayId. Preserve valid last/manual selection, then valid scenario initial,
then runway-containing/stable fallback only for initial selection. Empty groups
return empty availability. Scenario replacement must not depend on flow courses.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Load complete authored catalog | Exact authored AMZ/NOZ/NTZ geometry available | Catalog-owned adaptation; no facility switch | Invalid polygon/reference rejected with path | §6.16.1; approved authored-only delta |
| Load no adaptation / disabled adaptation | No AMZs, FMA unavailable | No synthetic fallback | MODE FMA disabled, no state mutation | §6.16.1 p. 6-127 |
| Load dimension-only group | Not sufficient for production AMZ | No false authored provenance | Loader rejects missing required polygons | Approved authored-only delta |
| Load duplicate ID / invalid ID / invalid NTZ adjacency | Reject invalid adaptation | No partial guessed catalog | Actionable loader error | §§4.1.2/4.1.4; schema contract |
| Select reciprocal authored AMZ through existing spinner | Group remains offered and selectable | Preferences/cleanup delegated to existing host | Unknown labels retain existing error behavior | §6.16.2; approved all-AMZ delta |
| Replace scenario; prior ID valid/invalid | Keep known manual ID or choose valid initial fallback | No course-derived availability | Empty catalog disables FMA through existing binder | Approved lifecycle delta |

## Acceptance criteria and tests

- [x] AC1 Automated: loader roundtrip preserves authored geometry and rejects absent, malformed, duplicate and unresolved required fields; minimal synthetic fixtures.
- [x] AC2 Automated: production binding never invokes heuristic fallback, empty/disabled/dimension-only adaptation unavailable; pure fixture derivation clearly separated.
- [x] AC3 Automated: all authored reciprocal/offset groups offered; unknown active runway/course does not hide valid authored AMZs; valid selection/fallback ordering tested.
- [x] AC4 Automated: KDEM/KATL authored data load through generic path; source label is trainer-authored; facility data contract isolated from generic units.
- [ ] AC5 Manual: inspect authored graphics against Figure 6-15's feature inventory without claiming facility coordinate fidelity. Browser drawing may be UNRUN only if explicitly recorded.
- [x] AC6 Gate: focused tests, npm run ci, git diff --check and supplied-manual review pass.

## Non-goals / user surfaces

No profile implementation, NTZ engine redesign, default map fallback, new parser
or procedure behavior, operational adaptation claims. T02-233 updates
src/ui/overlays/ScopeHelpOverlay.tsx, docs/USER.md and phase README/AGENT to remove
obsolete same-flow/generated-runtime instructions; hand off exact change notes.
Manual checklist: verify availability §6.16.1, selection §6.16.2, names §4.1.2,
geometry Figure 6-15 and explicit trainer deltas, every matrix row.

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
