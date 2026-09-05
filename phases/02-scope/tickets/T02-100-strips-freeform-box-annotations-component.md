# T02-100: Strips Freeform Box Annotations Component & Inline Editing

**Phase:** 2 Scope — Flight Progress Strips Interactive Annotations  
**Priority:** P0  
**Size:** M  
**Depends on:** none  
**Files:**
- `src/ui/strips/types.ts`
- `src/ui/strips/DepartureStrip.tsx`
- `src/ui/strips/ArrivalStrip.tsx`
- `src/ui/strips/test/stripAnnotations.test.tsx`

---

## Context & Purpose

In authentic FAA terminal radar and tower operations (FAA Order 7110.65 Chapter 2 §3 & Appendix A), flight progress strips function as dynamic working scratchpads. Controllers write operational notes, instructions, clearances, headings, and speeds in designated strip boxes—most notably the 3×3 coordination matrix (Boxes 10 through 18) and local coordination boxes (8A and 8B).

Currently, flight progress strips define `StripAnnotationBoxes` with `box8A`, `box8B`, and `boxes10to18`, but the cells render as static read-only text. This ticket enables direct in-place editing: double-clicking an annotation cell opens an inline micro-input with black text, commits on Enter or blur, cancels on Escape, and stops event propagation so typing or editing does not accidentally select the radar track or initiate a drag operation.

---

## Acceptance Criteria

1. **Double-Click Inline Editing:**
   - Double-clicking any cell in Boxes 10–18 (Column 5 matrix) or Boxes 8A/8B (Column 3) on a `DepartureStrip` or `ArrivalStrip` toggles that cell into inline editing mode.
   - An `<input className="strip-annotation-input">` is mounted directly inside the clicked cell, replacing the static text.
   - The input is autofocused with its existing text selected for fast replacement.
2. **Authentic Black Text & Formatting:**
   - Input and committed text render in bold uppercase monospace font (`IBM Plex Mono`, `Consolas`, monospace) with authentic black ink color (`#000000`).
   - Typing forces uppercase characters automatically.
   - Max length enforced (e.g. 8–12 chars) so text fits cleanly within the cell boundary.
3. **Commit and Cancel Handlers:**
   - Pressing `Enter` commits the edited text and exits edit mode, firing `onUpdateAnnotation(stripId, boxKey, value)`.
   - Blurring (`onBlur`) commits the current value and exits edit mode.
   - Pressing `Escape` cancels editing and reverts to the previous value without firing updates.
4. **Event Isolation:**
   - Single-clicking or double-clicking an annotation cell stops pointer event propagation (`e.stopPropagation()`) so it does not trigger strip selection (`onSelect`) or radar track selection on the scope.
   - Keyboard events (`Enter`, `Escape`, `Space`) while editing do not trigger strip keyboard hotkeys (like indenting or selecting).
   - Draggable behavior is disabled on the cell or while editing so mouse interactions within the input never start an HTML5 drag operation.
5. **Direct Direct-Call Test Compatibility:**
   - Components maintain safe hook fallbacks for direct-invocation unit tests without a dispatcher.

---

## Technical Notes

- `boxKey` mapping:
  - For Box 8A: `"box8A"`
  - For Box 8B: `"box8B"`
  - For Boxes 10–18: `"10"`, `"11"`, `"12"`, `"13"`, `"14"`, `"15"`, `"16"`, `"17"`, `"18"` (index 0 to 8 in `boxes10to18`).
- Component signature:
  ```typescript
  export interface DepartureStripProps {
    ...
    onUpdateAnnotation?: (stripId: string, boxKey: string, value: string) => void;
  }
  ```
