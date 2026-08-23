# T02-26 DCB BRITE and CHAR SIZE submenus

**Phase:** 02 Scope (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T02-22
**Blocks:** T02-29
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

**BRITE** and **CHAR SIZE** are submenus (replace the bar, DONE/Esc). BRITE has per-layer channels that actually tint what we draw. CHAR SIZE scales datablocks, lists, DCB, tools, and position symbols separately. WX / WXC / BKC channels are disabled or stored no-ops. Still IBM Plex / system mono — not a STARS face.

## Context

T02-17 CHAR SIZE cycles 11–13 px globally; BRITE cycles map-stroke steps only. CRC has many brightness channels and per-subsystem character size. We only have Canvas2D layers we already paint.

## Research

Read **R07** BRITE / CHAR SIZE.

- Search: `STARS DCB BRITE CHAR SIZE DCB MPA FDB LDB`
- **Terms:** **BRITE**, **CHAR SIZE**, **datablock**. Not brightness slider, font picker, zoom text.
- Comment: analog CRC channels; trainer maps unused channels to no-op; Plex/system mono only.

## Scope

- **CHAR SIZE** submenu cells (spinners or 1–5 steps), DONE:
  - **DATA BLOCKS** — FDB/LDB font px (seed from today’s 11/12/13)
  - **LISTS** — SSA + on-PPI strip list
  - **DCB** — DCB cell text (keep two lines fitting the bar)
  - **TOOLS** — PTL cap / range-ring labels if any; else PTL stroke-adjacent text only
  - **POS** — position-symbol size (small discrete px set, not a sprite scale)
- **BRITE** submenu: discrete 0–100 in steps (e.g. 10) **or** keep a small step index per channel. Apply as a multiply on that layer’s palette color (do not invent a second palette of random hues).
  - Wire at least: **DCB**, **MPA** (map group A / `map` catalog color), **MPB** (map group B / `mapDim`), **FDB**, **LST** (SSA+lists), **POS** (owned symbols), **LDB**, **OTH** (unowned symbols), **TLS** (PTL), **RR**, **HST**
  - **CMP** if a compass/`N` tick exists; else disabled
  - **BCN** / **PRI** — if we have only one symbol, store the value and map both to position-symbol intensity **or** disable the unused one; document
  - **WX**, **WXC**, **BKC** — **disabled** (no weather, no CRC BKC)
- Track/datablock **hue** stays green/white/blue from T02-08/18; BRITE only changes intensity. CHAR SIZE does not bundle a STARS `.ttf`.
- Convert MAIN CHAR/BRITE from click-cycle openers to **submenu** openers (T02-22 menu ids `CHAR_SIZE` / `BRITE`).
- Clicks never emit Command IR.

## Out of scope

- Weather paint. Licensed STARS font. Continuous HTML range inputs. PREF persistence (T02-29 reads this state later).

## Implementation notes

```ts
charSizes: { dataBlocks: number; lists: number; dcb: number; tools: number; pos: number }
brite: { dcb: number; mpa: number; mpb: number; fdb: number; lst: number; pos: number; ldb: number; oth: number; tls: number; rr: number; hst: number; /* … */ }
```

A `applyBrite(hex, channel)` helper keeps draw code from sprinkling ad-hoc alpha. Rebuild map cache when MPA/MPB/RR change.

## Acceptance criteria

- [ ] **AC1 —** CHAR SIZE submenu: changing DATA BLOCKS changes datablock font px; DCB cell text uses the DCB channel; POS changes symbol size; lists/SSA use LISTS. At least 2 steps each.
- [ ] **AC2 —** Font stack still Plex/system mono (grep: no STARS `.ttf`).
- [ ] **AC3 —** BRITE FDB/LDB/MPA/HST/RR/TLS each change that layer’s intensity (unit or render mock); track hues stay the T02-08 roles.
- [ ] **AC4 —** WX, WXC, BKC cells disabled or no-op with no weather draw.
- [ ] **AC5 —** DONE/Esc return MAIN. No Command IR. `DAL123 H270` still works.
- [ ] **AC6 — Research:** BRITE/CHAR SIZE/datablock comments; not slider/zoom text.

## Test plan

- Unit: char size fields; brite multiply helper; disabled channels.
- Integration: submenu markup; font grep; heading command.
- Manual: none required (T02-30).

## Suggested files

- `src/scope/fonts.ts`
- `src/scope/palette.ts`
- `src/scope/dcbFunctions.ts`
- `src/scope/renderScope.ts`
- `src/ui/DisplayControlBar.tsx`
- `src/scope/scopeView.ts`
