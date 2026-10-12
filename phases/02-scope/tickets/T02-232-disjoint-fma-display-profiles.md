# T02-232 Complete Disjoint FMA Display Profiles

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** L\
**Depends on:** shipped T02-225–230; existing FmaAmz API only\
**Blocks:** T02-233\
**Merge target:** `feature/fma`\
**Ticket branch:** `ticket/T02-232-disjoint-fma-display-profiles`\
**Launch:** Wave A, concurrent with T02-231; disjoint owned files.

## Mission

Separate the last-used normal radar preference from each AMZ's complete supported
workstation display profile. Apply/save profiles atomically in their own namespace.
Correct FMA DEFAULT; exit and reload apply the last-used normal preference.

## Scope and ownership

Own src/scope/scopeView.ts, src/scope/dcb/dcbPref.ts, dcbFunctions.ts,
minimal routing in src/ui/dcb/DisplayControlBarMenus.tsx; add a single display-profile acceptance
file src/scope/test/fmaDisplayProfiles.integration.test.ts. Do not edit existing
fmaFidelity.integration.test.ts, catalog/geometry/fmaFlow, or shared docs in Wave A.
Use existing AMZ id API; no dependency on new schema fields. Preserve thin bar.

Complete display profiles encompass every supported workstation preference:
video-map visibility and selected map category/group, range/center, brightness,
fonts, system-list locations/visibility/capacity, DCB dock, ring/compass settings,
history, PTL/OWN/ALL, leaders, filters, cursor/dwell, supported display toggles,
alarm volume, FMA MAG/PTL/brightness/runway leaders/voice and configured NTZ
inhibition. Audit the existing serializer and available preference fields for
omissions. Runtime tracks/ownership, World/flight plans, alerts/acknowledgments,
frozen reports, speech queues, pending menus/spinners and mode enablement are
excluded. This is full supported local preferences, not full NAS sign-on/PIN host.

Normal preference means last successfully selected/saved normal profile, not an
unsaved pre-entry snapshot. Keep normal identity/body separate from AMZ namespace.
If no normal profile exists, use existing valid normal defaults. FMA edits/save
never overwrite normal or another AMZ. AMZ SAVE uses exact active AMZ ID; UI may
retain local host affordances but cannot accidentally name another AMZ/system
slot. Preserve compatible old local storage; old partial AMZ preferences migrate
into independent complete profiles using validated normal baseline, never current
other-AMZ state. Unknown/invalid persisted map/zone/range references are validated.
Missing AMZ preference warns NO PREF SET FOUND and preserves current display;
no auto-created saved profile or default video maps. Full existing AMZ applies
exactly: omitted/false map selections cannot leak prior AMZ visible maps.
FMA DEFAULT reapplies current AMZ or warns without factory reset. Normal DEFAULT
retains normal defaults behavior. Exit reapplies last-used normal body, then clears
FMA runtime. Reload must always start normal and restore normal preference even
if last write occurred in FMA; retain AMZ profiles without enabling alert runtime.
Scenario replacement validates profile references and cannot restore stale maps or
AMZ geometry from another facility. No pre-entry normalDisplaySnapshot payload.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Normal PREF select/save then MODE FMA ACCEPT | Apply complete active AMZ if saved | Normal saved body/identity unchanged | Cancel confirmation leaves state; disabled FMA cannot apply | §§4.1,6.16.1; disjoint trainer delta |
| FMA PREF SAVE / SAVE AS | Save active AMZ complete body under its ID | Other AMZ/normal bodies unchanged | Cancel naming does not save; cannot overwrite another AMZ | §4.1.1; approved local host delta |
| AUX AMZ label ENTER / pointer commit | Apply complete target profile once | Geometry/cleanup and display target agree | Incomplete/cancel/unknown label do not apply | §6.16.2 p. 6-130 |
| Enter/switch AMZ without saved profile | Success plus NO PREF SET FOUND | Current display settings preserved, adapted graphics active | No default map substitution or implicit saved profile | §§6.16.1–2 pp. 6-128/130 |
| FMA PREF DEFAULT / focused Enter or Space activation | Reapply active AMZ complete profile | Normal body untouched | Missing AMZ profile warns without factory reset; existing focus/modifier guards unchanged | §4.1.10 p. 4-21 |
| Exit FMA ACCEPT | Apply last-used normal preference | FMA runtime cleanup; no stale maps/category/camera | Not unsaved entry snapshot, not factory reset | Approved exit trainer delta |
| Reload after saving FMA | Start normal, restore normal profile | AMZ preferences retained; no runtime mode/queue | Legacy/corrupt storage validated, no stale IDs | Approved reload trainer delta |
| Native input/Help/modifiers/CLEAR/Esc | Preserve inherited routes/cancel | No unexpected profile application | No new radio aliases or key collisions | Existing focus contract |

## Acceptance criteria and tests

- [ ] AC1 Automated: full supported display roundtrip with distinct normal/A/B values; maps/category/camera/fonts/brightness/list layout/PTL/filter/volume and FMA controls covered.
- [ ] AC2 Automated: normal -> A -> B -> exit yields exact saved normal body; unsaved normal changes do not become entry snapshot; FMA save cannot overwrite normal/B.
- [ ] AC3 Automated: rendered DEFAULT and existing focused keyboard activation apply active AMZ; no-pref entry/switch/default preserves current settings and warns; cancellation/invalid input unchanged.
- [ ] AC4 Automated: reload always normal after FMA save; AMZ persistence, legacy partial migration, corrupt references, facility replacement and runtime exclusion pass.
- [ ] AC5 Automated: loaded video maps not selected in a complete profile become off; cache invalidates; map category and group restore.
- [ ] AC6 Manual: browser enter/select/default/save/exit/reload and full display profile behavior; record actual evidence or UNRUN, never infer from mockCanvas.
- [ ] AC7 Gate: focused tests, npm run ci, git diff --check and supplied-manual review pass.

## Non-goals / user surfaces

MULTI FUNC K is not currently implemented and remains outside this ticket; do not
add parser grammar. No new NAS user/PIN infrastructure, schema adaptation edits, automatic default map
fallback, NTZ algorithm redesign, new keys/grammar or speech/backend changes.
T02-233 owns Help/docs/phase README/AGENT reconciliation. Hand off storage migration
and visible behavior notes. Manual checklist compares §§4.1,4.1.1,4.1.10,6.16.1–2
and distinguishes full-profile/exit/reload trainer choices from published behavior.

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
