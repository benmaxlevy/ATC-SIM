# T02-102: Strips Box Annotations Acceptance, Unit Tests, and Styling

**Phase:** 2 Scope — Flight Progress Strips Interactive Annotations  
**Priority:** P0  
**Size:** S  
**Depends on:** T02-100, T02-101  
**Files:**
- `src/ui/strips/strips.css`
- `src/ui/strips/test/stripAnnotations.test.tsx`
- `src/ui/strips/test/stripsBoard.test.tsx`
- `src/ui/strips/test/stripsAcceptance.test.tsx`

---

## Context & Purpose

This ticket establishes the styling, end-to-end acceptance tests, and regression safety for freeform box annotations across the flight progress strips feature suite. It verifies authentic physical strip appearance (pale buff background with dark pen-like text), responsive input layout inside 3×3 matrix cells, keyboard accessibility, and non-interference with strip dragging, cocking, and radar track selection.

---

## Acceptance Criteria

1. **CSS Styling Specifications:**
   - `.annotation-cell`, `.matrix-cell`, `.box-8a`, `.box-8b` are styled with `cursor: text` or pointer on hover.
   - `.strip-annotation-input` styles:
     - `width: 100%`, `height: 100%`, `box-sizing: border-box`.
     - `background-color: transparent` or matching the `#f5eedc` buff strip.
     - `color: #000000;` (authentic black pen/marker text).
     - `font-family: inherit` (Consolas, monospace), `font-weight: 700`, `font-size: 0.72rem` (fits cell).
     - `text-transform: uppercase`, `text-align: center`.
     - `border: 1px solid #333333; outline: none; border-radius: 1px;`.
   - Committed text renders in `.strip-annotation-lower`, `.strip-annotation-8a`, `.strip-annotation-8b` with `color: #000000`.
2. **Acceptance Test AC13 — Double-Click Inline Annotation:**
   - Double-clicking an annotation cell in Box 10–18 or 8A/8B enters edit mode, renders input with auto-focus, commits on Enter, and displays the updated value.
3. **Acceptance Test AC14 — Multi-Box Coordination:**
   - Allows annotating multiple distinct cells (e.g. runway in 8A, heading in Box 11, altitude in Box 12, speed in Box 16) on the same strip.
4. **Acceptance Test AC15 — Telemetry Persistence:**
   - When simulation ticks produce new strip objects via `terminalStripsFromWorld`, controller annotations are preserved without reset.
5. **Acceptance Test AC16 — Interaction Isolation & No Regressions:**
   - Double-clicking or clicking an annotation box does NOT trigger radar track selection in `World.selectedAircraftId`.
   - Single-clicking empty strip area continues to select the aircraft track.
   - Single right-clicking the strip continues to toggle cocking/indentation (~28px offset) without interference.
   - Drag-and-drop intra-rack reordering and separator interactions remain 100% functional.
   - Full CI (`npm run ci`) passes with zero lint or test failures.
