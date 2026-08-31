# T02-73 PREF SAVE AS Named Sets

**Phase:** 02 Scope
**Priority:** P0
**Size:** S
**Depends on:** T02-29
**Blocks:** none for this swarm
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Make PREF SAVE AS collect and store a short operator-supplied name through the existing PPI/preview-area input path. Enter commits the name, Esc cancels without writing, and active and stored names remain visible in the DCB.

## Context

`saveAsDcbPref` currently auto-names the first empty slot `PREF n` and overwrites slot 8 when all eight slots are full. This hides which display preference set an operator saved. Browser dialogs are prohibited; the existing preview buffer and status-line prompt provide the STARS-like trainer interaction surface.

T02-68–72 are reserved for the WX mosaic swarm. This ticket is T02-73.

## Research

- **R07 — CRC / vNAS STARS client:** https://docs.virtualnas.net/crc/stars/; Search: `vNAS CRC STARS PREF SAVE AS DCB`. Use for DCB and keyboard interaction names.
- **R05 — FOA Handbook, STARS chapter:** https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap12_section_6.html; Search: `FAA FOA STARS display data settings`. Use for display-data policy context.
- **Trainer delta:** This product uses named local preference sets, eight slots, and a preview-area chord instead of reproducing a proprietary workstation dialog. Add the analog and delta in the implementation comment.

## Scope

- Replace automatic `PREF n` naming after SAVE AS with a named-input state.
- Reuse preview buffer/status-line prompt wiring to request a short name.
- Accept alphanumeric characters; reject digit-only names because those are reserved for FIL-style input.
- Enter commits the name to the first empty slot, or slot 8 when all eight slots are occupied.
- Esc cancels pending SAVE AS and performs no slot write, active-set change, or overwrite.
- Keep active set name on the MAIN PREF cap and show each stored name on its slot cap.
- Preserve existing preference payload behavior and slot ordering.
- Remove or update tests that require automatic `PREF n` names.
- Add/update the later-implementation backlog PREF subsection when behavior is shipped.

## Out of scope

- Browser `window.prompt`, HTML `<input>`, modal dialogs, or new text-entry widgets.
- Changing the eight-slot limit or preference payload schema.
- Making per-track PTL or TPA state persistent in PREF.
- Redesigning unrelated DCB caps or preview-area commands.
- WX mosaic / WX1–6 / PREF `wxLevels` (other swarm, T02-68–72).

## Implementation notes

- Model pending naming explicitly, so Escape can clear it before any persistence mutation.
- Keep input validation deterministic: non-empty alphanumeric text only; digit-only text returns the existing invalid-input/status feedback and leaves pending SAVE AS active.
- Apply name only at commit time. If all slots are occupied, use existing slot-8 replacement semantics.
- Keep status-line text concise and use “name” / “PREF” terminology.
- Do not use `window.prompt` or render an HTML input. Add a comment citing R07 and this trainer delta.

## Acceptance criteria

- [ ] **AC1 —** After SAVE AS, preview/status input requests a short name and does not auto-write `PREF n`.
- [ ] **AC2 —** An alphanumeric name followed by Enter writes the preference to the first empty slot and stores that exact name.
- [ ] **AC3 —** When all eight slots are full, a valid SAVE AS name replaces slot 8 using existing semantics.
- [ ] **AC4 —** Esc during pending naming cancels the operation; no slot, active preference, or stored name changes.
- [ ] **AC5 —** Empty, non-alphanumeric, and digit-only names are rejected without a write; existing valid preference data remains unchanged.
- [ ] **AC6 —** MAIN shows active set name; each PREF slot cap shows its stored name after reload/render.
- [ ] **AC7 —** Automated tests cover first-empty commit, full-slot replacement, Enter/Esc, validation, and absence of `window.prompt` / HTML `<input>`.
- [ ] **AC8 — Research:** UI strings use PREF/name terminology, and implementation comment cites R07 plus trainer delta.

## Test plan

- **Unit:** `src/scope/dcbPref.test.ts` for naming, slot selection, replacement, cancellation, and validation.
- **Component/integration:** DCB and preview/status prompt tests for MAIN and slot cap text plus keyboard flow.
- **Manual:** Run PREF SAVE AS, type a valid name, verify MAIN and slot caps; repeat with Esc and digit-only input.

## Suggested files

- `src/scope/dcbPref.ts`
- `src/scope/dcbPref.test.ts`
- `src/scope/previewArea.ts`
- `src/scope/previewArea.test.ts`
- `src/ui/DisplayControlBar.tsx`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
