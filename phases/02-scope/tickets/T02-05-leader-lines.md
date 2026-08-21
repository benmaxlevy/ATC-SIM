# T02-05 Leader lines

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-04
**Blocks:** T02-09, T02-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Datablocks attach to targets with **8-direction leader lines** plus overlay (L5). `L` then `1`–`9` matches the numpad compass. Scope-focus only — never a left-turn radio command.

## Context

CRC/vice analog is L1–L9. Frozen in `phases/02-scope/README.md` decision 8. Radio `L090` is `FLY_HEADING` left (`phases/_shared/command-ir.md`). If `L`+digit fires while the command line is focused, that is a **bug**.

## Research

Read **R07** (leader direction), **R08** (vice STARS leaders), **R09** if CRC is silent.

- Open: https://docs.virtualnas.net/crc/stars/ — **leader**.
- Search: `CRC STARS leader L1 L9 keypad` and `vice STARS leader line`
- **Terms:** **leader** / **leader line**. Not stem, stick, callout.
- **Trainer delta:** direction only; **no** leader-length DCB menu. Numpad 5 = overlay. Comment that.

## Scope

- Per-track `leaderDir: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9`, default **8**.
- Pixel-constant leader length **24 CSS px** (not NM). L5 length 0 with 4 px gap so the 6 px symbol stays visible.
- Stroke 1 px, track color, from symbol edge (not through the fill) toward the datablock anchor.
- Datablock **anchor** (top-left of line 1) sits at the far end of the leader, with a 2 px gap. For L4 (west), datablock should sit to the **left** of the leader end (right-align the block to the leader) so the line does not cross the text. Document corner rules:

| Dir | Block placement relative to leader end |
| --- | --- |
| 8 N | centered horizontally, below? **No:** N means block is **north of** target: block bottom near leader end, centered |
| 2 S | block top at leader end, centered |
| 6 E | block left at leader end, vertically centered on two lines |
| 4 W | block right at leader end, vertically centered |
| 9 NE, 3 SE, 7 NW, 1 SW | analogous corners |
| 5 | block top-left 4 px east and 4 px south of symbol center (or N of symbol — pick and unit-test) |

Implement `leaderOffsetPx(dir): { dx, dy }` for the **leader end** relative to symbol center, then `datablockTopLeft(dir, metrics)` for the text box.

- Chord: scope focus, key `L`, then `1`–`9` (top row or numpad `Digit`/`Numpad`) within **1.5 s**. `Esc` or timeout cancels. Applies to **selected** track; if none selected, **all** tracks.
- Status hint optional: `L_` while waiting for digit.
- Limited blocks use the same direction; length may be 12 px (half) — freeze **same 24 px** for simplicity unless limited looks absurd; prefer **same 24 px**.

## Out of scope

- Adjustable leader length, DCB LEADER menu, auto-deconflict, rubber-band leaders, CRC “leader direction for all then one.”

## Implementation notes

```
7 NW   8 N   9 NE
4 W    5 CTR 6 E
1 SW   2 S   3 SE
```

`L` chord must not leave a dangling `L` in the command buffer. `preventDefault` on `L` when scope-focused.

Numpad with NumLock off may emit arrows — **require** digit keys; ignore arrows for this chord.

## Acceptance criteria

- [ ] **AC1 —** Automated: nine offsets; L8 end is −Y in canvas (north), L6 is +X, L5 is ~0 length.
- [ ] **AC2 —** Given selected track, scope focus, `L` then `6`, leader points east and the block sits to the east of the symbol.
- [ ] **AC3 —** `L` then `5`: no visible leader (or ≤ 1 px); block adjacent to symbol without covering it completely.
- [ ] **AC4 —** No selection + `L` then `1`: **all** tracks switch to SW.
- [ ] **AC5 —** Radio focus: typing `L090` still parses `FLY_HEADING` left 90; no leader change.
- [ ] **AC6 —** After `L` with no digit for 1.5 s, no dir change; a following `6` is not consumed as leader.
- [ ] **AC7 —** Leader + block draw uses the same color as the target; no extra Command IR events.
- [ ] **AC8 — Research:** Help/code say **leader**, not stem. Comment cites CRC L1–L9 and “no length menu.”

## Test plan

- Unit: offsets, chord state machine (timer with fake clocks).
- Integration: radio vs scope `L`.
- Manual: numpad 8 vs top-row 8 both work with NumLock on.

## Suggested files

- `src/scope/leader.ts`
- `src/scope/leader.test.ts`
- `src/scope/keymap.ts` (chord helper, reusable for `F` filter)
- `src/scope/renderScope.ts`
- `src/scope/scopeKeys.ts`
