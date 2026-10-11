# T02-226 FMA AUX, BRITE and Control Entry

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** L\
**Depends on:** T02-220 through T02-225\
**Blocks:** T02-227, T02-228\
**Merge target:** `feature/fma`\
**Ticket branch:** `ticket/T02-226-fma-aux-brite-and-control-entry`\
**Launch:** Implement this ticket only when its prerequisites are merged on the configured feature target. Planning does not authorize execution.

## Mission

Implement the Figure 6-17 FMA AUX layout, FMA BRITE channels, exact adjustment/commit entry, SSA values, runway leaders and zone-inhibition actions through scope-only DCB routing.

## Research and authority

Authoritative source: Raytheon STARS TCW/TDW Operator's Manual, TI 6191.409, Revision 30, supplied at `/home/ben/Documents/stars refs/full_manual.pdf`.

- Section 2.6 pp. 2-21–23 (PDF 77–79): adjustment preview/commit and DCB focus.
- Figure 6-17 and Figure 6-18 p. 6-129 (PDF 659): actual stacked AUX controls and BRITE layout; inspect raster.
- Sections 6.16.2–9 pp. 6-130–139 (PDF 660–669): AMZ, MAG, PTL seconds, leader keypad, voice and inhibition.
- Section 4.10 Table 4-1 p. 4-74 (PDF 284): AMZ/RWY/REF 5–100/off; NTZ 50–100 with no off.
- Section 4.1 pp. 4-4–5 (PDF 214–215): display-setting persistence.

Read `AGENTS.md`, the active FMA section of `phases/SWARM.md`, current phase README/AGENT, shared references/glossary/architecture/non-goals and the predecessor ticket contracts. Historical FMA exclusions are lifted only for this approved trainer feature. The user-authorized SpeechSynthesis exception is FMA-only; no radio/Command IR/Path C change is approved. Source-backed behavior and explicit trainer decisions must stay distinguishable.

## Command, state and lifecycle contract

1. FMA+SHIFT selects the specialized AUX with existing VOL, HISTORY/H RATE, CURSOR HOME, CSR SPD, MAP UNCOR, UNCOR, RTQC, four DCB position controls, AMZ, MAG, stacked VOICE/VOICE TEST, PTL LNTH, stacked NTZ 1/2/3/ALL, runway leader controls, DWELL, TPA/ATPA and SHIFT. Figure 6-17 is a raster layout reference, not a flattened invented row transcription. Reuse existing generic controls; unsupported inherited controls remain honestly disabled.
2. Adjustment actions use existing DCB spinner input ownership: arm on selection, wheel/drag previews bounded values, numeric/label keyboard input while armed, left-click or Enter commits. No wrapping cycles. An empty buffer after pointer adjustment commits the current valid preview; with no adjustment it commits the unchanged value, following the existing spinner contract. A nonempty incomplete/malformed typed operand is FORMAT, not a pointer commit. CLEAR/Escape cancels pending adjustment with rollback; Backspace edits operand. Switching DCB function cancels previous unfinished function. Extend targeted AMZ label entry to consume its printable letters while armed; malformed alphabetic input in numeric FMA controls must be retained/rejected there rather than falling through to Preview or radio. Native inputs/Help/radio retain their guards; no Command IR.
3. AMZ is selectable only with more than one valid AMZ. Selection accepts a known label via existing DCB adjustment keyboard entry or wheel/drag. Resolve exact case-normalized unique adapted labels, not fuzzy prefixes or airport branches. Unknown/ambiguous/malformed label preserves selected AMZ with FORMAT as trainer input rejection; no capacity creation command exists. Commit applies validated AMZ preference, rebinds runtime and cancels obsolete episodes/retained reports/speech. Missing preference is NO PREF SET FOUND warning while switch succeeds. A selection preview cannot create alert episodes for uncommitted AMZ.
4. MAG accepts one whole integer 1–8; out-of-range numeric is ILL VALUE; malformed nonempty numeric entry uses FORMAT as trainer format rejection. Empty-buffer pointer/no-change commit follows rule 2. CLEAR restores previous factor. Dynamic preview affects geographic display only; commit preserves camera center. T02-227 supplies actual shared projection. No artificial clamping of invalid typed values; pointer stepping saturates.
5. PTL LNTH accepts whole seconds 0..adapted max (default max 30). Noninteger/nonnumeric/extra tokens give FORMAT; out-of-range integer gives ILL VALUE. Zero removes displayed PTLs and FMA PTL SSA value. Nonzero updates existing and future enabled PTLs inside/outside AMZ. It does not enable disabled per-track PTLs or alter caution horizon. Non-FMA PTL length entry is unavailable in FMA; preserve inherited display-toggle ownership where applicable.
6. Runway leader entry accepts a single keypad direction: 1=NW, 2=N, 3=NE, 4=W, 5=NONE, 6=E, 7=SW, 8=S, 9=SE. Invalid/extra data gives FORMAT, never a normal digit-radio/leader chord. Wheel/drag select these labels. Apply to current/future tracks assigned by T02-222 scratchpad contract, including outside AMZ. NONE removes runway-specific override and restores prior/default orientation. Respect existing single-track settings and the manual automatic-position/deconfliction rules; do not create a new auto-layout algorithm.
7. VOICE accepts integer 1–10. Nonnumeric/noninteger/extra fields give FORMAT; out of range gives ILL VALUE. Commit updates local voice level and dispatches Test at new level; canceled/invalid adjustment never speaks Test. VOICE TEST dispatches Test at current level. No new speech backend or tone.
8. NTZ buttons directly toggle adapted individual zone enable state. Absent slots are disabled and cannot target an invented zone. Inhibiting a zone removes its boundaries and warning/caution; disabling every adjacent zone suppresses corresponding runway CST/RWY and removes applicable frozen presentations. NTZ ALL disables all if all enabled; otherwise enables all. All inhibited hides track suppression glyphs but preserves per-track inhibit flags.
9. FMA BRITE preserves existing channels and adds AMZ boundary, NTZ boundary, RWY runway/course/fix-bar and REF reference lines. AMZ/RWY/REF allow whole integers 5..100 and numeric 0 for off, following inherited numeric BRITE entry; 1..4 are ILL VALUE. NTZ allows whole integers 50..100 only; 0 is ILL VALUE. No new textual OFF alias. Typed invalid range gives ILL VALUE; malformed nonempty entry gives FORMAT. Pointer adjustment must reach valid new-channel limits rather than inheriting the old ten-step ladder that omits 5. No BRITE change disables alert evaluation. TLS/CMP keep existing owners.
10. Use Figure 6-18 arrangement and Appendix B colors; public captions reflect committed or staged adjustment values consistently. Update SSA FMA PTL on commit/preview according to existing display-setting lifecycle; zero removes value. Runway-specific orientation changes only leader presentation, not assigned runway.
11. Every action is @scope-owned; UI passes typed action payloads for AMZ/MAG/PTL/voice/runway/zone/brightness. Keep MAIN data/re-export and thin orchestrator splits; do not put parser/evaluator or World command code in DCB.
12. Document exact errors and inherited cancellation priorities. Ordering examples include select MAG -> type 4 -> Enter, select PTL -> type 0 -> Enter, select runway -> type 5 -> Enter, select VOICE -> type 6 -> Enter. Each commits only its armed function; digits never fall through to another family.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| FMA SHIFT / ordinary mode SHIFT | Figure 6-17 AUX / inherited AUX | Menu state only | No flattened replacement or accidental new control behavior | Figures 6-17–18 |
| AMZ known label Enter / unknown or duplicate label | Switch and apply preference / FORMAT without switch | Local settings and clean rebind | One AMZ disables selection; missing preference warns but switches | §6.16.2; trainer label errors |
| MAG 4 Enter; MAG 9; MAG CLEAR; pointer adjustment then empty Enter | Commit 4; ILL VALUE; restore prior factor; commit preview | Display setting only | Nonempty malformed entry FORMAT; no cycle wrap or typed clamp | §6.16.3; inherited spinner completion |
| PTL 0 / 1.5 / max+1 | Remove PTLs+SSA / FORMAT / ILL VALUE | Displayed PTL seconds only | Does not change caution horizon or enable disabled PTLs | §6.16.4 |
| Runway 08L direction 5 / 8 / 08 | NONE / S / FORMAT | Assigned-track leader presentation | No assignment change; works outside AMZ | §6.16.5 |
| VOICE 6 / 11 / alphabetic; VOICE TEST | Test at 0.6 / ILL VALUE / FORMAT; Test current level | Voice level and queued action | Canceled adjustment does not speak | §§6.16.6–7 |
| NTZ 1 off then NTZ ALL | Disable adjacent effects then enable all | Local zone/alert/freeze cleanup | No hidden per-track inhibit deletion | §6.16.9 |
| NTZ brightness 0 / AMZ brightness 0 / AMZ 5 / invalid extra fields | ILL VALUE / off / lowest nonzero value / FORMAT | Brightness only | NTZ has no off; no textual OFF alias or monitoring suppression | Table 4-1; inherited numeric BRITE entry |

## Files and ownership

src/ui/dcb/dcbLayouts.ts; src/ui/dcb/DisplayControlBarMenus.tsx; src/ui/dcb/DisplayControlBar.tsx wiring only; src/scope/dcb/dcbFunctions.ts; src/scope/dcb/dcbMenu.ts spinner/entry validation; scoped FMA action helpers; src/scope/scopeKeys.ts input dispatch without splitting; src/scope/palette.ts; SSA display owner; src/scope/dcb/dcbPref.ts; Help and shared acceptance.

Keep `DisplayControlBar.tsx` and `renderScope.ts` thin, preserve their shipped splits and public re-exports, route DCB actions through `@scope`, and do not split `scopeKeys.ts` or the spoken pattern matcher. Use generic catalog/scenario loading and synthetic fixtures, never live airport branches.

## Acceptance criteria and tests

- [ ] **AC1 — Automated: all adjustment valid/incomplete/malformed/range/extra-token/cancel forms, key focus/modifier guards and staged-versus-committed action payloads pass.**
- [ ] **AC2 — Automated: AMZ label resolution, missing PREF warning, one-AMZ disabled selector and clean rebind are atomic.**
- [ ] **AC3 — Automated: MAG boundaries/rollback, independent PTL prediction horizon, PTL zero/SSA and outside-AMZ leader/PTL behavior pass.**
- [ ] **AC4 — Automated: keypad directions/NONE, VOICE/Test dispatch and NTZ adjacency/ALL mixed-state behavior pass.**
- [ ] **AC5 — Automated: channel ranges/off constraints, BRITE monitoring independence and PREF persistence are correct.**
- [ ] **AC6 — Manual: inspect AUX/BRITE raster figures, captions, stacked placement, keyboard entry and real browser Test volume behavior.**
- [ ] **Gate —** Focused checks, `npm run ci`, `git diff --check` and independent supplied-manual review pass before captain starts the next wave. If `speech-api/` changes despite this feature's exclusions, stop for scope review rather than silently expanding the contract; approved speech-api changes additionally require `SPEECH_API_MOCK=1 pytest`.

Use the single synthetic `src/scope/test/fmaFidelity.integration.test.ts` across the feature. Keep additional pure units minimal (one happy path plus 2–3 meaningful edges or a parameterized numeric table); share `src/scope/test/mockCanvas.ts`. Browser/audio/manual checks are labeled manual and are never inferred from CI mocks.

## User surfaces and documentation

Update src/ui/overlays/ScopeHelpOverlay.tsx, docs/USER.md and phases/02-scope/README.md with exact entry order/errors, FMA PTL seconds versus caution horizon, runway directions, volume and NTZ semantics. Extend existing backlog only for still-callable graphics/projection gaps; T02-227/228 resolve them.

## Manual-review checklist

- [ ] Check the exact printed sections/pages/tables above and any relevant actual raster figure.
- [ ] Walk every contract row through entry/routing, qualification or parsing, state/effects, rejection, test evidence and named user surfaces.
- [ ] Verify trainer defaults, unavailable behavior and user overrides are not presented as published STARS algorithms.
- [ ] Confirm no unintended radio, World intent, ownership, association or geographic-measurement mutation.

## Non-goals and handoff

No new MODE/service-state behavior, browser voice backend, radio parser, facility-specific controls, unimplemented NTZ slots pretending to work or NTZ BRITE off.

Use one isolated ticket branch/worktree from current `feature/fma` after captain verifies prerequisites. Preserve unrelated `.worktrees/`, `:memory:.ses` and `speech-api/:memory:.ses`; never reset/clean unclear work. Commit explicit ticket paths progressively after required gates. Do not merge, spawn, push or begin another ticket. Return exactly `READY TO MERGE` or `BLOCKED`, followed by AC/test/manual evidence and actual unrun browser/audio checks. Captain owns merges and the phase STATUS entry.
