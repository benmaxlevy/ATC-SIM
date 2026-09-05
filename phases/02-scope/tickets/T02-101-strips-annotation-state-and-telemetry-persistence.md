# T02-101: Strips Annotation State & Telemetry Persistence

**Phase:** 2 Scope — Flight Progress Strips Interactive Annotations  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-100  
**Files:**
- `src/ui/strips/StripsBoard.tsx`
- `src/ui/strips/types.ts`
- `src/ui/strips/test/stripsBoard.test.tsx`

---

## Context & Purpose

In live radar and tower simulations, `World` telemetry ticks fire periodically (typically every 500ms–1000ms), recalculating active departure and arrival strips via `terminalStripsFromWorld(world)`. 

Without persistent state management, any controller-entered annotations on flight progress strips would be wiped out on the next telemetry tick. This ticket introduces board-level state tracking for strip annotations, merges user-created annotations into live incoming telemetry strips before rendering, and exposes update callbacks for parent component integration.

---

## Acceptance Criteria

1. **Board-Level Annotation State:**
   - `StripsBoard` manages an internal state `annotations: Record<string, StripAnnotationBoxes>` keyed by strip ID (`strip.id`).
   - Accepts optional controlled prop `annotations?: Record<string, StripAnnotationBoxes>` and `onUpdateAnnotation?: (stripId: string, boxKey: string, value: string) => void`.
2. **Merging with Incoming Telemetry:**
   - When departures or arrivals props update from live `terminalStripsFromWorld`, `StripsBoard` merges any existing user annotations for that strip into its `annotationBoxes` property before rendering.
   - User-entered values take precedence over default or empty values in incoming telemetry.
3. **Update Handling:**
   - When a strip emits `onUpdateAnnotation(stripId, boxKey, value)`, `StripsBoard` updates the entry in its state:
     - For `"box8A"`: sets `box8A: value`.
     - For `"box8B"`: sets `box8B: value`.
     - For numeric string `"10"`–`"18"`: updates the corresponding element in `boxes10to18` array (indices 0 to 8).
   - If `value` is empty string or whitespace, updates value cleanly.
4. **Lifecycle & Pruning Stability:**
   - When an aircraft lands, terminates, or is removed from the active traffic list, its annotations do not cause runtime errors.
   - Newly spawned aircraft receive default empty annotation boxes and can be annotated immediately.
5. **Direct-Call Test Compatibility:**
   - `StripsBoard` continues to render cleanly under static markup and dispatcher-less test environments.
