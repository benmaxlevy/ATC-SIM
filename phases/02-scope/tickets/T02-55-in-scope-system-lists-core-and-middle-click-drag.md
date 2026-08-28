# T02-55 In-Scope System Lists Core & Middle-Click Dragging

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-54
**Blocks:** T02-56, T02-57
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Provide the core in-scope STARS system lists rendering engine and interactive drag-and-drop window manager on the PPI Canvas2D, matching Vice `stars/lists.go`: declarative `ListFormatter` token replacement, normalized `[x, y]` list positioning, middle-click drag lifecycle (anchor frame + moving frame + commit/cancel), overlap detection with green warning frames, and full integration with DCB `CHAR SIZE -> LISTS` and `BRITE -> LST`.

## Context

In real STARS (R07) and MMP Vice, system lists (SSA, Preview Area, TAB Flight Plan, VFR, Tower, Alert, Coast/Suspend, Coordination, Video Maps, CRDA, MCI, Sign-On) are drawn directly on the radar scope canvas. Controllers reposition lists anywhere on the PPI using middle-click. Colliding lists display green warning bounding frames to highlight screen clutter.

## Research

- **Analog:** CRC STARS System Lists / Vice `stars/lists.go` (`drawSystemList`, `ListFormatter`, `handleListDrag`, `drawListFrameColor`, overlap detection `math.Overlaps`).
- **Glossary:** System Status Area (SSA), System Lists, Tab List Index, Bounding Extent.
- **Trainer delta:** Coordinates stored as normalized $[0, 1]$ screen ratios; rendered via Canvas2D with `SCOPE_FONT_STACK`; scaled by `CharSize.Lists` (0–5) and `Brightness.Lists` (5–100).

## Scope

- Create `src/scope/systemLists.ts` and `src/scope/listFormatter.ts`.
- Define `ListFormatter` interface with `Title`, `FrameTitle`, `Lines` (max visible), `Entries` (total), and `FormatLine(idx)`.
- Implement `formatListEntry` token replacement (`[INDEX]`, `[ACID]`, `[BEACON]`, `[ACTYPE]`, `[REQ_ALT]`, `[EXIT_FIX]`) with 3-character fix compression.
- Implement `handleListDrag` middle-click state machine:
  - Middle click inside list bounds $\rightarrow$ starts moving mode. Draws green line-loop frame at original anchor position and white frame following mouse cursor.
  - Second middle click $\rightarrow$ drops list at current cursor position, updating normalized $[x, y]$ coordinates in `ScopeView.systemLists`.
  - `Escape` key $\rightarrow$ cancels drag and restores original position.
- Implement overlap detector (`math.Overlaps`): when any two active list bounds collide and no drag is active, draw green line-loop frames around both colliding lists.
- Implement show-all-frames preview: clicking and holding middle mouse button on empty scope draws green frames and uppercase labels over all active lists.
- Hook into `renderScope.ts` to draw system lists above video maps and below datablocks, scaled by `CharSize.Lists` and `Brightness.Lists`.

## Out of scope

- Specific data population for Flight Plan, VFR, Tower, Alert, Coordination (owned by T02-56 and T02-57).
- DCB spinner/menu changes (owned by T02-58 and T02-59).
- DOM-based flight strips drawer modifications.

## Implementation notes

- Store list positions in `ScopeView.systemLists: Record<string, { x: number; y: number; visible: boolean; maxLines: number }>`.
- Ensure drag bounds compute accurately from canvas text measurement (`ctx.measureText`) plus line height.
- Ensure normalized coordinates $[x, y] \in [0, 1]$ clamp within the PPI viewport so lists cannot be dragged off-screen.

## Acceptance criteria

- [ ] **AC1 —** Declarative `ListFormatter` formats strings with tokens and appends `MORE: lines/total` header when entries exceed `maxLines`.
- [ ] **AC2 —** Middle-click on a list initiates drag with green anchor frame and white moving frame; second middle-click updates normalized $[x, y]$; `Escape` cancels.
- [ ] **AC3 —** Overlapping lists render green bounding frames around colliding rectangles.
- [ ] **AC4 —** Text font size scales with `view.charSize.lists` (sizes 0 to 5) and brightness scales with `view.brightness.lists`.
- [ ] **AC5 —** Automated unit tests cover formatting, drag state machine, and overlap detection.

## Test plan

- Unit: `src/scope/systemLists.test.ts` (formatter, coordinate normalization, drag reducer, collision detection).
- Integration: `src/scope/renderScope.test.ts` (lists rendering pass, canvas drawing commands).
- Manual: Middle-click drag list on scope, observe frames, drag to overlap another list and observe green conflict frames.

## Suggested files

- `src/scope/systemLists.ts`
- `src/scope/listFormatter.ts`
- `src/scope/systemLists.test.ts`
- `src/scope/renderScope.ts`
