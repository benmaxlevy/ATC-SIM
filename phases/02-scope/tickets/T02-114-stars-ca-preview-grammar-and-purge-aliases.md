# T02-114: Authentic STARS Preview Grammar for CA Commands & Purge Invented Aliases

**Phase:** 02 Scope — Conflict Alert (CA) STARS Alignment  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-113  
**Blocks:** T02-115  

## Goal

Purge all invented, non-standard aliases (`*CA`, `*LA`, `F11`, etc.) from preview parsing and replace them strictly with authentic Raytheon STARS Conflict Alert commands per TI 6191.409 (Sections 7.3, 7.9, 7.10, 7.11, 7.12).

## Research & Standards

Per TI 6191.409:
- **Implied Slew-to-Acknowledge** (Section 7.3): Left-clicking a target in active alert when the preview area is empty acknowledges the alert immediately (steady red, silences tone).
- **Single Track Inhibit** (Section 7.9): `CA` `K` `<trk>` `[ENTER]`: Toggles single-track CA inhibit.
- **Pair Inhibit Toggle** (Section 7.10): `CA` `[ENTER]` $\to$ Slew/click Track A $\to$ Slew/click Track B: Toggles pairwise inhibit between Track A and Track B.
- **Explicit Pair Inhibit** (Section 7.11): `CA` `P` `<trk1>` `[<trk2>]` `[ENTER]`: If `<trk2>` is omitted, system waits for slew click on second track. Adds pair to inhibited set.
- **Explicit Pair Enable** (Section 7.12): `CA` `E` `<trk1>` `[<trk2>]` `[ENTER]`: Restores alerting between `<trk1>` and `<trk2>`.

Invented Aliases to Purge:
- Remove `*CA [Left-Click]` and `*LA [Left-Click]` from `previewParse.ts` and system list handling.
- Remove non-standard keyboard shortcuts or supervisor commands (`CA A`, `CA M`, `CA Q`).

## Scope

- In `src/scope/previewParse.ts`:
  - Purge `*CA` / `*LA` preview parse patterns.
  - Implement tokenization and parsing for:
    - `CA K <trk>`
    - `CA P <trk1> [<trk2>]`
    - `CA E <trk1> [<trk2>]`
    - `CA` (enters two-click pending pair-inhibit slew mode).
- In `src/scope/previewArea.ts`:
  - Implement execution handlers dispatching to `TrackDisplayState` methods (from T02-113).
  - Implement multi-step click sequence for pending `CA` and pending `CA P <trk1>`.
  - Implement implied slew-to-acknowledge: when preview text is empty, clicking an alerted track acknowledges the conflict.
- Update preview area error feedback for invalid track IDs or nonexistent tracks per STARS behavior.

## Non-goals

- Supervisor commands (`CA A`, `CA M`, `CA Q`, `MULTI FUNC V G/M`).
- Mode C unverified pilot-reported altitude suppression commands.

## Acceptance Criteria

- [ ] All invented `*CA` and `*LA` commands are completely removed; parsing rejected.
- [ ] `CA K <trk>` toggles single-track inhibit.
- [ ] `CA [ENTER]` followed by two track clicks toggles pairwise inhibit between the two tracks.
- [ ] `CA P <trk1> <trk2>` and `CA P <trk1> [Click Track 2]` adds pairwise inhibit.
- [ ] `CA E <trk1> <trk2>` removes pairwise inhibit.
- [ ] Clicking an alerted track with an empty preview buffer acknowledges the alert immediately.
- [ ] Comprehensive unit tests cover syntax parsing, command execution, and interactive slew transitions.

## Files

- `src/scope/previewParse.ts`
- `src/scope/previewArea.ts`
- `src/scope/test/previewParse.test.ts`
- `src/scope/test/previewArea.test.ts`
