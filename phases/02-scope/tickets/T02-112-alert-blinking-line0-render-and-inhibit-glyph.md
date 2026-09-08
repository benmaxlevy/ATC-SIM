# T02-112: 800ms Blink Clock, Line 0 Alert Rendering & Inhibit Triangle

**Phase:** 02 Scope — Conflict Alert (CA) STARS Alignment  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-111  
**Blocks:** T02-115  

## Goal

Align Conflict Alert visual presentation with the STARS specification (TI 6191.409 Section 2.16 & 2.16.3): replace defective/stubbed blinking logic with an authentic 800 ms ON / 800 ms OFF square-wave clock, render Line 0 `CA` (or `LA`) in blinking vs steady red based on acknowledgment status, and display the white/normal `▲` triangle inhibit glyph preceding the callsign on Line 0 when inhibited.

## Research & Standards

Per TI 6191.409 Section 2.16:
- Unacknowledged Alert: Line 0 displays `CA` (or `LA`) in red, flashing at standard cadence (approx 800 ms ON / 800 ms OFF, 0.625 Hz).
- Acknowledged Alert: Line 0 displays `CA` (or `LA`) in steady red (flashing ceases, tone silenced).
- Inhibited Track: If a track has CA inhibited (via `CA K`), a white/normal `▲` triangle glyph precedes the callsign or track identifier on Line 0 (or replaces warning indicator).
- Cadence: Clock must be synchronized across all blinking elements on the scope (`timeMs % 1600 < 800`).

## Scope

- In `src/scope/palette.ts`:
  - Implement a synchronized square-wave blink phase evaluator (`isAlertBlinkOn(timeMs: number): boolean` with 800 ms half-period).
- In `src/scope/render/renderScopePaint.ts`:
  - Update datablock Line 0 rendering:
    - If track is in active unacknowledged alert: draw `CA` in flashing alert red.
    - If track is in active acknowledged alert: draw `CA` in solid alert red.
    - If track is inhibited: render `▲` triangle glyph on Line 0.
- Ensure proper positioning in full and partial datablocks without text clipping or layout overlap.

## Non-goals

- System list text rendering (handled in system lists components).
- Audio generation (handled in T02-115).

## Acceptance Criteria

- [ ] Blinking state alternates between visible and blank/dim exactly every 800 ms (1600 ms cycle).
- [ ] Active unacknowledged alert displays red `CA` flashing at 800 ms cadence on Line 0 of both conflicting tracks.
- [ ] Acknowledged alert displays solid red `CA` continuously on Line 0.
- [ ] Track with CA inhibit active displays `▲` triangle glyph on Line 0.
- [ ] Visual regression and snapshot/mockCanvas tests verify Line 0 alert states and glyph layout.

## Files

- `src/scope/palette.ts`
- `src/scope/render/renderScopePaint.ts`
- `src/scope/test/renderScopePaint.test.ts`
