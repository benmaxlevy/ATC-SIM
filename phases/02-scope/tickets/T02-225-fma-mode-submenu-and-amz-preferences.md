# T02-225 FMA MODE Submenu and AMZ Preferences

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** L\
**Depends on:** T02-220 through T02-224\
**Blocks:** T02-226 through T02-228\
**Merge target:** `feature/fma`\
**Ticket branch:** `ticket/T02-225-fma-mode-submenu-and-amz-preferences`\
**Launch:** Implement this ticket only when its prerequisites are merged on the configured feature target. Planning does not authorize execution.

## Mission

Correct MODE into a service-mode submenu, remove the invented Full/Semi/Limited global F/S/L feature entirely, and add confirmed FMA enable/disable with local AMZ preference migration and capability gating.

## Research and authority

Authoritative source: Raytheon STARS TCW/TDW Operator's Manual, TI 6191.409, Revision 30, supplied at `/home/ben/Documents/stars refs/full_manual.pdf`.

- Section 2.6 pp. 2-21–23 (PDF 77–79): submenu/toggle/action types, keyboard focus and completion.
- Section 6.16.1 pp. 6-127–128 (PDF 657–658), Figure 6-16: EFSL/FSL/TRNG/FMA/DSF(or DSA)/DONE, FMA confirmation ACCEPT, capability/privilege gates, most recent AMZ, preferences and NO PREF SET FOUND warning.
- Sections 4.1 pp. 4-4–5 (PDF 214–215), 4.1.1 p. 4-6 (PDF 216): FMA display settings, AMZ preferences and dedicated FMA preference user.
- Section 6.16.2 p. 6-130 (PDF 660): selecting AMZ applies corresponding settings.
Explicit user correction: F/S/L was invented; remove it rather than relocating a replacement trainer control.

Read `AGENTS.md`, the active FMA section of `phases/SWARM.md`, current phase README/AGENT, shared references/glossary/architecture/non-goals and the predecessor ticket contracts. Historical FMA exclusions are lifted only for this approved trainer feature. The user-authorized SpeechSynthesis exception is FMA-only; no radio/Command IR/Path C change is approved. Source-backed behavior and explicit trainer decisions must stay distinguishable.

## Command, state and lifecycle contract

1. MAIN MODE (existing cell) opens a real submenu in Figure 6-16 order: EFSL, FSL, TRNG, FMA, DSF, DONE. FSL means Full Service Level and EFSL Emergency Full Service Level. Default supported service state remains FSL; unavailable/unimplemented service modes are disabled, not live no-op latches. No new DSF/DSA/TRNG/EFSL behavior is authorized.
2. Remove ModeFsl F/S/L state, cycle/step functions, MODE_FSL spinner, renderer branches forcing global Full/Semi/Limited, obsolete help strings and tests that require the invented behavior. Existing explicit full/partial/limited datablock commands and per-track/association/selection rules retain their actual owners. No replacement trainer global presentation control.
3. FMA is independent from service-level state. Available only with configured 2K capability, Controller privilege, at least one valid adapted/derived AMZ and service state compatible with FMA. 1K omits FMA as in Figure 6-16; DSF/DSA configuration disables it. Capability is explicit configuration, not CSS viewport width or DPR.
4. MODE -> FMA enters confirmation state without toggling. ACCEPT commits toggle once; DONE removes submenu. Cancellation via existing menu/CLEAR/Escape routing before ACCEPT leaves mode unchanged. Repeated click/Enter cannot apply twice. Disabled buttons never mutate and never imply simulated service-level support.
5. Enable activates most recently selected valid AMZ (or scenario initial selection), applies its saved display settings when present, starts local monitoring/speech consumption, highlights FMA and exposes FMA AUX/BRITE. No saved AMZ preference: show exact warning NO PREF SET FOUND, enable successfully and retain current valid/default display settings rather than inventing a preference. Disable stops alert generation/speech, removes FMA graphics/retained presentations and swaps back ordinary menus. Ring/compass underlying settings survive suppression.
6. Maintain separate service level, fmaEnabled and datablock presentation owners. Invalid/no-longer-loaded AMZ references cannot re-enable stale geometry. On scenario/catalog replacement, rebind by stable known AMZ ID or initial valid AMZ and clear all session episodes, arms, retained tracks and speech.
7. Extend existing local PREF host for AMZ-keyed FMA settings: selected AMZ, MAG, displayed FMA PTL, FMA brightness, runway leaders, enabled NTZs and voice level, plus applicable camera/maps settings from existing host. Apply AMZ-specific settings atomically on mode enable/selection. Do not claim full NAS sign-on/preference infrastructure; the host remains local.
8. Migration reads old PREF documents without applying legacy modeFsl F/S/L, discards that field and stops writing it. Preserve unrelated saved settings and explicit track presentation rules. Validate new references/ranges on restore; invalid stored settings cannot inject bad MAG/zone IDs or resurrect alert runtime. No persisted track IDs, acknowledged/silenced episodes, frozen reports or speech queue.
9. Mode/menu entry goes through existing DCB focus/Enter/Space/Backspace mechanism; never parse literal MODE/FMA in radio or MULTI FUNC. Keep native-input/Help/modifier routing. Starting a new DCB function cancels previous pending function through existing rollback; service mode switching is not fabricated from the old modeFsl value.
10. T02-226 owns actual FMA adjustment menus. Until those/render projection are delivered, any newly exposed callable FMA surface lacking promised behavior must be marked in the existing backlog with the exact remaining tickets; do not claim feature completion. Thin DCB modules call @scope actions only.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Click MAIN MODE | Open EFSL/FSL/TRNG/FMA/DSF/DONE submenu | Menu state only | No F/S/L cycle or datablock mutation | Figure 6-16; user correction |
| MODE -> FMA, cancel / ACCEPT -> DONE | No toggle / toggle once and exit | Local FMA mode and bound AMZ | No repeated commit; no synthetic unsupported service mode | §6.16.1 |
| FMA enabled with no AMZ PREF | Enable and show NO PREF SET FOUND | Retain valid current/default settings | Warning is not failed mode entry | §6.16.1 p. 6-128 |
| 1K / no AMZ / insufficient privilege / DSF configuration | Omit or gate FMA as applicable | No mode or alert changes | Never infer 2K from browser size | §6.16.1; Figure 6-16 |
| Restore old PREF modeFsl=S or L | Discard invented presentation latch; restore unrelated settings | Preference migration only | No replacement global presentation setting | User MODE correction |
| Save FMA settings / restore after reload | Restore validated AMZ display configuration | Local preferences only | No track IDs/episodes/frozen positions/queue persisted | §4.1; explicit local-host delta |
| FMA off or catalog/session replaced | Clear local monitoring and speech; normal menu restored | Runtime cleanup | No stale geometry, hidden arm or ring/compass preference loss | §6.16.1; approved lifecycle |

## Files and ownership

src/scope/scopeView.ts; src/scope/dcb/dcbFunctions.ts; src/scope/dcb/dcbPref.ts; src/ui/dcb/DisplayControlBar.tsx; src/ui/dcb/DisplayControlBarMenus.tsx; src/ui/dcb/dcbLayouts.ts; src/scope/render/renderScopePaint.ts solely to remove invented F/S/L branches; existing PREF/DCB regression tests; shared FMA acceptance.

Keep `DisplayControlBar.tsx` and `renderScope.ts` thin, preserve their shipped splits and public re-exports, route DCB actions through `@scope`, and do not split `scopeKeys.ts` or the spoken pattern matcher. Use generic catalog/scenario loading and synthetic fixtures, never live airport branches.

## Acceptance criteria and tests

- [ ] **AC1 — Automated: submenu order/types, FMA confirmation/cancel/commit, disabled modes and configured capability/privilege gates pass.**
- [ ] **AC2 — Automated: modeFsl/ModeFsl/MODE_FSL runtime state and F/S/L behavior are removed; old PREF migration preserves unrelated values.**
- [ ] **AC3 — Automated: normal explicit full/partial/limited datablock commands remain independent of MODE service level.**
- [ ] **AC4 — Automated: per-AMZ PREF application, missing-preference warning, invalid stored IDs/ranges, enable/disable and catalog replacement cleanup pass.**
- [ ] **AC5 — Manual: inspect Figure 6-16 and exercise mode confirmation, missing-pref warning, local AMZ preference flow and normal menus in browser.**
- [ ] **Gate —** Focused checks, `npm run ci`, `git diff --check` and independent supplied-manual review pass before captain starts the next wave. If `speech-api/` changes despite this feature's exclusions, stop for scope review rather than silently expanding the contract; approved speech-api changes additionally require `SPEECH_API_MOCK=1 pytest`.

Use the single synthetic `src/scope/test/fmaFidelity.integration.test.ts` across the feature. Keep additional pure units minimal (one happy path plus 2–3 meaningful edges or a parameterized numeric table); share `src/scope/test/mockCanvas.ts`. Browser/audio/manual checks are labeled manual and are never inferred from CI mocks.

## User surfaces and documentation

Update src/ui/overlays/ScopeHelpOverlay.tsx, docs/USER.md and phases/02-scope/README.md to correct FSL terminology and describe supported/disabled modes, confirmation and local PREF delta. Preserve T02-81 as historical evidence; explain that T02-225 supersedes its invented MODE behavior. Extend current backlog only for exposed incomplete FMA behavior.

## Manual-review checklist

- [ ] Check the exact printed sections/pages/tables above and any relevant actual raster figure.
- [ ] Walk every contract row through entry/routing, qualification or parsing, state/effects, rejection, test evidence and named user surfaces.
- [ ] Verify trainer defaults, unavailable behavior and user overrides are not presented as published STARS algorithms.
- [ ] Confirm no unintended radio, World intent, ownership, association or geographic-measurement mutation.

## Non-goals and handoff

No replacement Full/Semi/Limited global control, new EFSL/TRNG/DSF/DSA service simulation, NAS preference/sign-on host, hardware resolution detection or unrelated VOL/BKC changes.

Use one isolated ticket branch/worktree from current `feature/fma` after captain verifies prerequisites. Preserve unrelated `.worktrees/`, `:memory:.ses` and `speech-api/:memory:.ses`; never reset/clean unclear work. Commit explicit ticket paths progressively after required gates. Do not merge, spawn, push or begin another ticket. Return exactly `READY TO MERGE` or `BLOCKED`, followed by AC/test/manual evidence and actual unrun browser/audio checks. Captain owns merges and the phase STATUS entry.
