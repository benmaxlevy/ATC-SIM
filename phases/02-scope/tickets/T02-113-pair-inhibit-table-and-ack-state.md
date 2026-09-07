# T02-113: Pair Inhibit Table & Conflict Acknowledgment State Architecture

**Phase:** 02 Scope — Conflict Alert (CA) STARS Alignment  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-111  
**Blocks:** T02-114, T02-115  

## Goal

Implement the data model and state management for pairwise Conflict Alert inhibits and track alert acknowledgment in `src/scope/trackDisplay.ts` and `src/scope/ppi.ts` per STARS specifications (TI 6191.409 Sections 7.3, 7.9, 7.10, 7.11).

## Research & Standards

Per TI 6191.409:
- Single-Track Inhibit: Track state flag `inhibitCA: boolean`. Suppresses all CA alerts involving this track.
- Pairwise Inhibit: Inhibit specific to aircraft pair $(A, B)$ without suppressing either aircraft from alerting against other targets. Canonical representation `makePairKey(id1, id2)` stored in `Set<string>`.
- Inhibit Lifetime: Pair inhibits are automatically purged on track drop, termination, coast expiration, or handoff.
- Acknowledgment State: Slew-to-ack silences audio and changes visual alert to steady red for a specific active conflict. Persists until the conflict resolves; if separation is restored and subsequently lost again, a fresh alert trips.

## Scope

- In `src/scope/trackDisplay.ts`:
  - Enhance `TrackDisplayState` with:
    - `caInhibitedPairs: Set<string>` (canonical pair keys sorted lexicographically).
    - `acknowledgedAlertPairs: Set<string>` (tracks acknowledged conflict pairs).
    - Methods to add, remove, toggle, and query pair inhibits.
    - Methods to acknowledge, unacknowledge, and prune stale alerts.
- In `src/scope/ppi.ts` / track cleanup lifecycle:
  - Add auto-purge hooks when a track is deleted or dropped, removing any pair entries referencing that track ID.
- Wire conflict detection engine (from T02-111) to filter out suppressed pairs or tracks before emitting active alerts.

## Non-goals

- Command parsing (handled in T02-114).
- Audio synthesis (handled in T02-115).

## Acceptance Criteria

- [ ] Pairwise inhibit correctly suppresses alerts between $(A, B)$ while allowing $(A, C)$ or $(B, C)$ alerts to trigger normally.
- [ ] Single-track inhibit suppresses all alerts involving that track.
- [ ] Acknowledging an active alert records acknowledgment state and transitions visual status to acknowledged.
- [ ] Dropping or deleting a track automatically cleans up all associated pairwise inhibits from the set.
- [ ] Clearing conflict state automatically resets acknowledgment when separation is restored.
- [ ] Comprehensive unit tests verify pair key canonicalization, set operations, filtering logic, and lifecycle pruning.

## Files

- `src/scope/trackDisplay.ts`
- `src/scope/ppi.ts`
- `src/scope/test/trackDisplay.test.ts`
