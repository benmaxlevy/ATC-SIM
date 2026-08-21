# T02-09 Scope keyboard map help overlay

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-01, T02-03, T02-04, T02-05, T02-06, T02-07, T02-08
**Blocks:** T02-13
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A single **exported keymap** plus **F1 help overlay** documents the Windows subset. The overlay states **TRAINER KEYS — NOT CRC**. Automated tests prove scope keys never hit the radio parser.

## Context

Feature tickets already bound keys. This ticket is the **contract surface** for humans and tests: `phases/02-scope/README.md` keyboard tables. Glossary: CRC keys are a reference, not a 1:1 spec.

Do not invent new bindings here. If a key is missing, wire it to the existing feature module — do not redesign the map.

## Research

Read **R07** full STARS keymap, **R08** vice STARS keys, then the phase README **Keyboard feel vs CRC** table.

- Open: https://docs.virtualnas.net/crc/stars/ — keyboard / DCB function keys.
- Search: `vNAS CRC STARS keyboard F3 F1` and `vice STARS keyboard commands`
- Overlay **must** teach trainer names (**range**, **datablock**, **leader**, **initiate track**) and the line `TRAINER KEYS — NOT CRC`.
- Each help row: CRC analog (if any) + our key. Do not paste a CRC cheat sheet as if it were ours.

## Scope

- `src/scope/keymap.ts` exports structured entries:

```ts
export type KeyFocus = "always" | "scope";

export interface KeyBinding {
  id: string;
  focus: KeyFocus;
  windowsKeys: string; // e.g. "PageUp" | "L then 1–9"
  action: string;
  crcAnalog: string;
}
```

Include **every** frozen binding from the phase README (range, center, pan note as mouse, F1–F4, F7, F8, L chord, T, M, F filter, H, Tab, `/` radio focus).

- **F1** toggles a dark overlay (DOM preferred: readable, selectable). Sim **keeps ticking**. Footer line exactly: `TRAINER KEYS — NOT CRC`.
- Overlay lists always-on vs scope-focus sections, mouse gestures, and the radio conflict warning (`L090` is a turn when the command line is focused).
- F1 is always-on; `preventDefault` (do not open browser help).
- `/` focuses the command line and must not insert `/` if you intercept it (phase 1 may already use `/` — if the command line needs slash, pick **unmodified Slash only when scope-focused** to focus radio, or document that click/`Tab` is the way. Freeze: **`Tab` cycles focus**; `/` when scope-focused focuses radio and preventDefault. Radio-focused `/` inserts or no-ops per phase 1 — do not break existing parser.)
- Integration test file: dispatch keyboard events for `PageUp`, `F3`, `F7`, `F8` with radio focus → camera/PTL/history/ownership mutate, `parseCommand` **not** called. Dispatch `L` `0` `9` `0` `Enter` with radio focus → parser called, leaders unchanged. Dispatch `L` `6` with scope focus → leader changes, parser not called.

## Out of scope

- Editable keymap, CRC import, full CRC cheat sheet, localizing, capturing all F-keys “for later.”

## Implementation notes

Help overlay uses the same `KeyBinding[]` to render — no duplicated markdown in JSX. If README and code drift, **code+tests win** for implementation; file a comment rather than silently adding CRC keys.

Chrome: F1 default help — preventDefault on app root.

## Acceptance criteria

- [ ] **AC1 —** F1 toggles overlay; second F1 closes; sim aircraft continue to move while open. **Manual** for motion; unit for toggle flag.
- [x] **AC2 —** Overlay contains the exact string `TRAINER KEYS — NOT CRC` and lists PageUp/PageDown, Home, End, F3, F4, F7, F8, L1–L9, T, M, F filter, Tab.
- [x] **AC3 —** Automated: exported bindings include `focus: "always"` for PageUp and F3, `focus: "scope"` for leader and `T`.
- [x] **AC4 —** Automated: radio-focus `L090` (or equivalent event sequence) calls parser, does not change `leaderDir`.
- [x] **AC5 —** Automated: scope-focus `L` then `6` changes leader, parser spy call count 0.
- [x] **AC6 —** Automated: radio-focus `PageUp` does not add text to the command buffer and does change range.
- [ ] **AC7 —** F1 does not open Chrome’s browser help. **Manual.**
- [x] **AC8 —** Help copy says radio commands stay on the command line and never come from scope keys.
- [x] **AC9 — Research:** Overlay uses glossary terms (range, datablock, leader, initiate track) and at least one “CRC analog → our key” row. No pasted CRC-only cheat sheet.

## Notes

AC1 skip-with-reason (Manual motion): unit test proves F1 toggles `helpOpen` without pausing and `stepWorld` still advances; live aircraft motion on the PPI while the overlay is open was not watched (human asleep). Re-check in Chrome at 1080p.

AC7 skip-with-reason: Chrome F1 browser-help UI cannot be verified while the human is asleep. `preventDefault` is asserted on F1 (window capture + command line). Re-check in Chrome that F1 does not open browser help.

## Test plan

- Unit: keymap completeness (snapshot or required-id list).
- Integration: parser spy matrix (AC4–AC6).
- Manual: F1 overlay readability on 1080p; Tab cycle.

## Suggested files

- `src/scope/keymap.ts`
- `src/scope/keymap.test.ts`
- `src/ui/ScopeHelpOverlay.tsx`
- `src/scope/scopeKeys.ts`
- `src/scope/scopeKeys.routing.test.ts`
