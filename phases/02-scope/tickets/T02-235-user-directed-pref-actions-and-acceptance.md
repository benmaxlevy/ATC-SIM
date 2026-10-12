# T02-235 User-Directed PREF Actions and Acceptance

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** L\
**Depends on:** T02-234 merged/gated\
**Blocks:** none\
**Merge target:** `feature/fma`\
**Branch:** `ticket/T02-235-user-directed-pref-actions-and-acceptance`\
**Launch:** Wave B after T02-234 gates; exactly this ticket.

## Mission

Make SAVE/SAVE AS/DELETE operate on explicitly selected owner/set with manual
naming, duplicate/capacity and lifecycle behavior. Complete integrated acceptance
and resolve T02-234's narrow temporary backlog.

## Ownership and implementation

src/scope/dcb/dcbPref.ts, dcbMenu.ts and minimal scopeView/dcbFunctions;
previewArea.ts/previewParse.ts/scopeKeys.ts solely inherited PREF naming/apply
routing; DisplayControlBarMenus/dcbChrome only needed actions/caps. Existing
fmaDisplayProfiles and shared fidelity/DCB acceptance; Help, docs/USER.md,
phase README/AGENT and existing PREF backlog. No new radio/Command IR grammar.

SAVE requires highlighted existing set in selected owner; unavailable otherwise.
Normal/FMA explicit owner choices control writes irrespective of display mode.
SAVE AS creates first empty numbered slot, never overwrites on capacity, never
renumbers other slots. New names1–7 alphanumeric (including numeric-only), canonical
case-insensitive duplicate checks. Preserve legacy8-char FSSTARS names on load and
SAVE of existing record; new names follow manual length. FMA new name must exactly
resolve authored AMZ ID (not constrained to currently active AMZ); snapshot current
supported display plus applicable FMA settings without changing geometry or mode.
Unknown AMZ/nonalphanumeric/overlength/extra tokens FORMAT; duplicate ILL PREFSET.
Full table disables SAVE AS; failed names stay pending and visibly report errors.
No silent Preview clear followed by ignored commit as current scopeKeys path does.
Keyboard entry is just pending PREF name, e.g. NORTH26 or123, no command prefix or
optional fields. Empty Enter incomplete; Esc/CLEAR cancels, no writes. User switch,
DONE or scenario replacement must not let old pending name write new namespace.

DELETE targets highlighted selected-owner record (not active AMZ), leaves display
and last-applied cap identity until another set is applied. Empty/unhighlighted
set makes SAVE/DELETE unavailable; deleting last FMA record does not remove fixed
reserved FMA owner in this local trainer. DEFAULT follows current mode/active AMZ
regardless of menu user; warning preserves display. RESTORE captures pre-menu
complete display/context and safely restores it without reviving old alert tracks,
acknowledgments or queued speech; do not roll back saved records. Pointer and
Insert entry identical. Normal exit/reload and last-used normal profile remain.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| FMA owner, highlight NORTH26; SAVE while SOUTH active | Overwrite highlighted NORTH26 from current display | Other sets/normal records untouched; geometry unchanged | No highlighted record disables SAVE | §4.1.5 p4-14 |
| FMA SAVE AS NORTH26 / 123 | Create desired authored AMZ-named set | Current display captured; no geometry/mode switch | Existing name ILL PREFSET; unknown AMZ FORMAT | §4.1.4 pp4-12–13 |
| FSSTARS SAVE AS DAY1 | Create normal record regardless of FMA mode | Intentional normal owner write; no AMZ mutation | Empty incomplete, invalid/8newchars FORMAT | §4.1.4; legacy migration policy |
| SAVE AS with32 records | Unavailable, no replacement | Slot32 and identities unchanged | Stale pending commit cannot overwrite | §4.1.4 p4-12 |
| DELETE highlighted set | Remove only that saved record | Display/applied identity remain; other slots stable | Empty selection unavailable | §4.1.6 p4-15 |
| FMA enabled, browsing FSSTARS; DEFAULT | Reapply active AMZ profile | Normal records unchanged | Missing NO PREF SET FOUND, display preserved | §4.1.10 p4-21 |
| PREF pointer/Insert -> edits/other profile -> RESTORE | Restore exact pre-menu display/context | Safe runtime cleanup, no saved-record rollback | No old alerts/frozen/speech revived | §4.1.9 p4-20 |
| Name pending -> Esc/CLEAR/owner switch/DONE | Cancel without write | Both namespaces/identities unchanged | Native input/Help/modifiers never steal entry | Existing routing; §4.1.1 |

## Acceptance criteria

- [ ] AC1 Automated: owner-directed existing SAVE/DELETE and create-only SAVE AS, inactive-AMZ naming, complete display capture, other namespace/slot protection.
- [ ] AC2 Automated: valid alpha/numeric names,1–7 bounds, duplicate case matching, unknown AMZ, empty/malformed/extra-data, full capacity, legacy8-char preservation and exact visible responses.
- [ ] AC3 Automated: failed naming remains pending; escape/user switch/newfunction/DONE cancellation and native-input/Help/modifier/focus independence; no radio command/World mutations.
- [ ] AC4 Automated: full normal/FMA profile switch and dormant FMA selection, DEFAULT owner independence, RESTORE context/snapshot parity and no runtime revival; final reload/migration/identity consistency.
- [ ] AC5 Docs: Help/docsUSER/READMEAGENT explain explicit owner vs operator vs activeAMZ; no PIN/accounts; inherited deviations/full-switch policy documented; resolve only existing interim PREF backlog items.
- [ ] AC6 Manual: actual browser selection/save/duplicate/capacity/default/restore/exit/reload, or explicitly UNRUN; supplied-manual review PASS with cited trainer deltas.
- [ ] AC7 Gate: focused tests, full npm run ci, git diff --check; stop after this ticket, no later phase.

## Non-goals / manual checklist

No PINs/sign-on/authentication/accounts, hard-copy reports, full NAS host or new
PREF SET/MULTI FUNC K command grammar. No adaptation, NTZ engine, speech backend,
World/flight-plan changes. Compare §§4.1.1/4.1.3–6/4.1.9–10 and6.16.1–2.
Verify exact name/error examples, capacity nooverwrite, SAVE highlighted semantics,
DELETE display preservation, DEFAULT/RESTORE owner independence and explicit
full-switch trainer delta. Do not invent unimplemented NAS preference fields.

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
