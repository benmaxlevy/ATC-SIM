# T02-74 Per-Track PTL

**Phase:** 02 Scope
**Priority:** P0
**Size:** S
**Depends on:** T02-07, T02-64
**Blocks:** none
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Add a session-only per-track PTL override using `*R` plus click. Operators can show one track or hide one track independently of global PTL ALL/OWN state without changing global PTL length.

## Context

CRC STARS Table 24 uses `R` plus slew to toggle PTL for one track. This trainer already has global PTL ALL, OWN, and LNTH controls plus typed `*PTL` minutes. Per-track state belongs to the current scope session, like `*J` and `*P` TPA state, not to PREF.

T02-68–72 are reserved for the WX mosaic swarm. This ticket is T02-74.

## Research

- **R07 — CRC / vNAS STARS client:** https://docs.virtualnas.net/crc/stars/; Search: `docs.virtualnas.net CRC STARS Table 24 PTL R slew`. Analog: Table 24 per-track PTL and global PTL controls.
- **R05 — FOA Handbook, STARS chapter:** https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap12_section_6.html; Search: `FAA FOA STARS predicted track line display`. Use for display-data terminology.
- **Trainer delta:** The chord is `*R` plus click, while `*RR` remains reserved for range rings; per-track state is session-only and does not persist in PREF.

## Scope

- Add a preview-area action that arms per-track PTL selection for the next scope click.
- Use `*R` plus click to toggle the clicked aircraft’s entry in a session map keyed by aircraft ID.
- Ensure `*R` never consumes or changes `*RR` range-ring commands.
- Render a per-track ON PTL when global ALL and OWN are both off.
- Render no PTL for a per-track OFF track when global ALL is on.
- Preserve global PTL ALL, OWN, LNTH, `*PTL` minutes, and F7 behavior.
- Keep PTL length global; do not add per-track minutes.
- Clear per-track state at session/map reset as appropriate without persisting it in PREF.

## Out of scope

- Changing global PTL duration, F7, ALL, OWN, or LNTH semantics.
- Adding per-track PTL length controls.
- Persisting per-track PTL state in PREF or scenario data.
- Changing range-ring `*RR` behavior or ownership/TPA commands.
- WX mosaic paint (other swarm).

## Implementation notes

- Prefer `ptlByAircraftId: Map<string, boolean>` or equivalent state on ScopeView.
- Resolve click target using existing aircraft hit testing; no target selection should mutate state.
- Define precedence explicitly: per-track ON forces display; per-track OFF suppresses display under global ALL; global OWN behavior remains unchanged for tracks without an override.
- Consume only exact `*R` command state. Do not prefix-match `*RR`.
- Add a comment citing R07 and the session-only trainer delta.

## Acceptance criteria

- [ ] **AC1 —** `*R` followed by clicking a track toggles PTL for that track only.
- [ ] **AC2 —** A per-track ON PTL renders when global ALL and OWN are off.
- [ ] **AC3 —** A per-track OFF track does not render while global ALL is on.
- [ ] **AC4 —** `*RR` and existing range-ring chords remain unchanged; `*R` cannot steal `*RR`.
- [ ] **AC5 —** F7 remains PTL ALL, global `*PTL` minutes remain the sole length control, and per-track state is not saved in PREF.
- [ ] **AC6 —** Automated tests cover ON/OFF precedence, click targeting, command disambiguation, session reset, and global length.
- [ ] **AC7 — Research:** PTL terminology and implementation comment identify the R07 analog and trainer delta.

## Test plan

- **Unit:** `src/scope/ptl.test.ts` for visibility precedence and session map behavior.
- **Integration:** preview-area command/click tests and ScopeView render tests for one-track overrides.
- **Manual:** Toggle one track with `*R`; verify global controls, F7, and `*RR` still work.

## Suggested files

- `src/scope/ptl.ts`
- `src/scope/previewArea.ts`
- `src/scope/scopeView.ts`
- `src/scope/ptl.test.ts`
- `src/scope/previewArea.test.ts`
- `src/scope/renderScope.ts`
