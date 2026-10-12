# T02-234 FMA Preference User and Numbered Namespaces

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** L\
**Depends on:** T02-231–233 shipped\
**Blocks:** T02-235\
**Merge target:** `feature/fma`\
**Branch:** `ticket/T02-234-fma-pref-user-and-namespaces`\
**Launch:** Wave A only; exactly this ticket.

## Mission

Replace disabled FSSTARS cap with explicit FSSTARS/FMA preference-owner selection.
Display and apply each owner's stable numbered sets, with real complete FMA
profile switching and compatible storage migration. Remove mode-based ownership.

## Ownership and implementation

src/scope/dcb/dcbPref.ts, dcbMenu.ts, dcbFunctions.ts, scopeView.ts, scope/index.ts;
src/ui/dcb/DisplayControlBarMenus.tsx and dcbChrome.tsx; minimal scopeKeys/Preview
lifecycle changes for owner routing; existing profile/fidelity/DCB integration.
Keep public bar and render orchestrators thin; UI actions call @scope only.
Do not split pattern-matcher or scopeKeys. Store temporary menu owner separately
from last-applied user/slot/name and last-used normal profile identity. One local
operator FSSTARS, reserved FMA preference namespace, not multi-user accounts.
Owner browsing changes only displayed slots. Default menu owner FSSTARS on open;
closing ends it without forgetting applied identity. Existing Insert opener must
also establish same RESTORE snapshot as pointer. Define generic id-based slot
access, not mode-derived writes. FMA map and slot records must have one canonical
source with coherent projection for existing AMZ helper consumers; no divergence.

Migrate v1–3 normal slots/root normalProfile/root or slot-embedded AMZ preferences
into facility-keyed owner-aware storage, preserving existing names/bodies/order
and deterministic FMA slot assignment. New writes versioned; don't persist
menu selection/pending entries/runtime. Unknown legacy AMZ names remain manageable
for deletion but cannot apply stale geometry. Keep up to32 slots per owner.
FMA slot selection when enabled atomically switches geometry/monitoring/runtime
context and entire display profile. Outside FMA apply profile and remember matching
AMZ, remain normal/alerts off. Names identify AMZ through authored catalog IDs.
Do not rely on direct commitFmaAmzSwitch outside FMA since it enables surveillance.
FSSTARS slot selection updates last-used normal profile while preserving FMA mode.
MAIN PREF displays last-applied owner/set identity with accessible full strings;
keep Figure4-1 two-row cell layout, avoid ambiguous six-character-only identity.

Provide functional selected-owner SAVE/SAVE AS/DELETE routing in this foundation;
T02-235 owns strict duplicate/capacity/new-name validation and final error UI.
Document any inherited temporary naming/capacity deviation in existing PREF
backlog with T02-235, never expose callable no-ops. Unknown owner and stale set
application validation already required here. No automatic creation per AMZ.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| PREF -> FSSTARS cell -> FMA -> Enter / roll+click | Show FMA numbered saved sets | Owner browsing only; display/mode untouched | Empty remains pending, invalid ILL USER, Esc cancels | §4.1.1 p4-6; Figure4-1 |
| FMA owner -> saved NORTH26 while SOUTH active | Activate NORTH26 and apply entire profile | Safe old-runtime cleanup; no normal record overwrite | Stale AMZ ILL PREFSET, no partial mutation | §4.1.3; approved full-switch delta |
| FMA owner -> saved NORTH26 while normal | Apply settings, prepare NORTH26 | Mode stays normal, no alert runtime revival | No implicit MODE ACCEPT bypass | §4.1.3; approved dormant-context delta |
| FMA active -> FSSTARS owner -> normal slot | Apply selected normal profile | Last-used normal identity updated; mode stays FMA | No namespace selected from mode | §§4.1.1,4.1.3 |
| DONE / Esc / new menu / scenario replacement | Cancel candidate and naming, end temporary owner | Applied identity and stored data unchanged | No cancelled candidate writes | §4.1.1; existing focus policy |
| Restore existing storage/reload | Preserve both owners' records; start normal | One canonical AMZ projection; no runtime persisted | Corrupt/unknown refs safely validated | Existing profile contract; trainer local host |

## Acceptance criteria

- [ ] AC1 Automated: real DCB username selector below DEFAULT, owner wheel/type/Enter/click/cancel and unknown-user handling; no display or geometry mutation from browsing.
- [ ] AC2 Automated: normal/FMA stable numbered sets and highlights; MAIN applied owner/set identity distinct from temporary user; no blank/unavailable phantom records.
- [ ] AC3 Automated: active FMA slot selects matching authored AMZ and complete maps/camera/FMA settings; normal mode selection never enables FMA; stale apply atomic rejection.
- [ ] AC4 Automated: compatible facility-keyed migration, two namespace isolation, numeric ID references, normal reload, no runtime persistence and no alternate source divergence.
- [ ] AC5 Automated: pointer/Insert entry snapshot parity and namespace cancellation; inherited F8/native-input/Help/modifier/Command IR independence.
- [ ] AC6 Docs: update Help, docs/USER.md and phase README current owner/select behavior; existing PREF backlog names any exact remaining T02-235 validation gaps.
- [ ] AC7 Manual: inspect Figure4-1 and actual browser owner/slot behavior or explicitly UNRUN; independent manual audit and full CI pass.

## Non-goals / manual checklist

No PIN/sign-on/account management, arbitrary operator creation, new radio grammar,
full PREF SET/MULTI FUNC K keyboard contract, geometry/schema/facility-data changes
or final action-validation scope owned by T02-235. Consult §4.1.1,4.1.3 andFigure4-1;
verify each row's mode and write prohibitions, migration, full-switch trainer delta.

## Authority and fixed policies

Read AGENTS.md, current eighty-ninth SWARM section, STATUS, phase README/AGENT,
and shared architecture/glossary/references/non-goals/command-ir/speech-port.
Authority is Raytheon TI6191.409 Rev30 supplied at
`/home/ben/Documents/stars refs/full_manual.pdf`. Manual extraction may use
`/tmp/stars-fma-audit.txt`; inspect actual Figure4-1 (PDF216, printed4-6).
§4.1.1 p4-6: user selection through username cell, rolling/click or typing+Enter;
sets available under selected owner, temporary until changed/DONE; reserved FMA.
§4.1.3 pp4-10–11: selected set applies, MAIN cap shows user/set, invalid set
ILL PREFSET, malformed syntax FORMAT. §4.1.4 pp4-12–13: at most32/user, SAVE AS
creates named set, FMA name identical to desired AMZ ID,1–7 alphanumeric,
duplicate ILL PREFSET. §4.1.5 p4-14: SAVE overwrites highlighted existing set.
§4.1.6 pp4-15–16: DELETE selected set, current display and displayed identity
remain; other numbered slots unchanged. §4.1.9 p4-20: RESTORE pre-menu display.
§4.1.10 p4-21: DEFAULT follows current FMA mode/activeAMZ; absent preference warns.
§§6.16.1–2 pp6-127–130: AMZ entry/selection apply saved preference if present.

User-approved trainer policies: one operator, fixed local preference owners
FSSTARS/FMA, no PIN/sign-on/account/authentication; full supported disjoint
profiles; FMA preference slot fully selects matching AMZ/profile. Outside FMA
it prepares matching AMZ and applies saved display/dormant FMA settings without
mode enablement. SAVE AS records desired AMZ under its name without switching
geometry. Explicit FSSTARS selection while FMA active allows intentional normal
profile application/save; implicit mode changes must never choose write owner.
Normal exit/reload and missing-pref behavior from T02-232–233 remain unchanged.
Unknown users ILL USER; stale/unresolvable saved FMA set ILL PREFSET with no display
mutation; invalid new name/unknown AMZ FORMAT; duplicate existing name ILL PREFSET.
No PIN errors or NAS sign-on behavior are simulated. DEFAULT/RESTORE are display
commands independent of browsing-owner choice.

## Routing, state and exclusions

No radio grammar or new scope shortcut. Existing MAIN PREF click and bare Insert
open same session snapshot; native input/Help and modifier guards remain intact.
User selector uses existing DCB spinner: arm, candidate roll/drag or raw username,
commit pointer/Enter, Esc/CLEAR cancel without namespace/profile write. Empty
Enter remains incomplete; unknown/malformed username rejects ILL USER without
first-hit/prefix repair. Case-insensitive exact FSSTARS/FMA matching. On commit
cancel competing Preview naming/spinners; no mixed-owner pending SAVE AS. Starting
another function, DONE/Esc or scenario replacement cancels pending entry. DONE
ends temporary browsing owner; applied profile identity remains separate.
New SAVE AS naming is single name only, no optional fields/reordering or radio
aliases. Pending entry must retain focus until valid commit or explicit cancel;
failed duplicate/malformed/context/capacity commit does not clear it silently.
Names are not slot numbers in this naming state, so digit-only names are valid.
Unknown saved AMZ references cannot enable stale geometry. No per-track ownership,
World/intent, flight-plan, motion, alert runtime/queues or pending commands persist.
Keep existing hardware/service gates; FMA preference browsing need not require
mode enabled or controller privilege (manual owner command Any); DSF/DSA blocks
PREF as currently supported. No full preference-report/PIN/MULTI FUNC K/PREF SET
numeric-command implementation is authorized.

## Gate and handoff

Use assigned isolated branch/worktree from feature/fma; absolute edit paths and
explicit command workdir. Stage only owned paths, no artifacts. Run focused
acceptance, npm run ci and git diff --check before each application/test commit.
No child spawn/merge/push/reset/force or skipped hooks. Report every contract row
and AC with automated/inspection/actual Manual evidence; browser absence is UNRUN,
not inferred from static markup. Return READY TO MERGE or BLOCKED with commits.
Captain performs pre/post-merge independent supplied-manual checks and CI, then
records STATUS and stops at T02-235. Use existing profile integration acceptance
and shared mockCanvas; avoid a new unit pile or production geometry assumptions.
