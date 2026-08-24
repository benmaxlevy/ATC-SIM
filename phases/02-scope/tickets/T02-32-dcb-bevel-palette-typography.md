# T02-32 DCB physical-button bevel, palette, and typography

**Phase:** 02 Scope (post-exit visual-replica addendum)
**Priority:** P0
**Size:** M
**Depends on:** T02-31
**Blocks:** T02-33
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The DCB reads as separated, raised tactical-console buttons: dark olive caps, off-white text, clear active inset state, and muted disabled system text. It no longer looks like flat neon-green terminal cells or striped map buttons.

## Context

The phase-2 DCB palette deliberately used green text and flat cell gutters as a lightweight first pass. The approved replica direction supersedes that DCB-only palette: button caps are dark olive, text is light gray, and the physical cap provides state affordance. PPI, FDB, map, and alert palette roles are unchanged.

## Research

Read **R07** DCB and the visual-replica brief attached to this addendum.

- Search: `vNAS CRC STARS DCB button appearance`
- **Terms:** **DCB**, **pressed**, **disabled**, **BRITE**, **CHAR SIZE**. Not theme, card, or toolbar.
- Comment: CRC-style physical-button affordance; trainer uses CSS bevels and a legal system monospace rather than copying a proprietary bitmap/typeface.

## Scope

- Define DCB-specific CSS variables/tokens, separate from PPI palette roles:
  - cap background: dark tactical olive in the `#021B08`–`#0A2412` range;
  - normal text: off-white/light gray (target `#D6DED6`–`#E0E0E0`);
  - disabled text: desaturated gray-green (target near `#4C604C`);
  - top/left highlight near `#7A8A7A`;
  - bottom/right shadow black.
- Give every physical cell a 1–2 px visible inter-cap gap and a raised bevel: 1 px top/left highlight plus 2 px bottom/right shadow.
- Active, latched, armed-spinner, or pressed controls use an inset bevel: 2 px dark top/left plus 1 px highlight bottom/right and a lighter olive body (target near `#005500`). Do not change which reducer states are active.
- Remove map-button raster/striped backgrounds. Quick maps use the same solid physical-cap surface as other DCB buttons; their active state comes only from the inset state and accessible pressed state.
- Align each cell's title/value centrally in both axes. Two-line controls render title above value (for example `RANGE` / `20`, `LDR DIR` / `N`); the caption must not clip at the supported DCB character-size steps.
- Use the existing legal system/monospace stack (or another redistributable project font). Do **not** claim, download, embed, or copy an FAA/STARS 5×7/vector/bitmap font; this ticket cannot establish that proprietary typeface is a standard public asset.
- Disabled cells retain the cap but use muted text and `disabled` / `aria-disabled`. They must be visibly distinct from an active pressed button.
- Apply DCB BRITE and DCB CHAR SIZE channel values to the revised cap/text presentation so T02-26 behaviors continue to work.

## Out of scope

- Recoloring PPI maps, FDBs, targets, alerts, or SSA; a new font asset; canvas phosphor effects; CSS animation; changing any DCB job or grid position.

## Implementation notes

Centralize styles in DCB-scoped classes/tokens. Prefer a small state-to-class mapping (`normal`, `pressed`, `disabled`) over duplicated inline border declarations. Visual state remains semantic HTML state (`aria-pressed`, `disabled`) as well as CSS.

## Acceptance criteria

- [ ] **AC1 —** Every MAIN physical cap has a solid dark-olive normal surface, a raised top/left-light and bottom/right-dark bevel, and a visible gap from adjacent caps.
- [ ] **AC2 —** A latched/armed control is visibly inset with the specified reversed bevel and lighter body; releasing it restores the raised state without changing reducer semantics.
- [ ] **AC3 —** Normal DCB text is off-white/light gray, while MODE FSL, SITE FUSED, and disabled WX cells use muted gray-green. No normal MAIN text uses neon `#00FF00`.
- [ ] **AC4 —** Quick map caps contain no stripe/raster background and indicate active state only through the shared pressed treatment.
- [ ] **AC5 —** `RANGE 20`, `RR 5`, leader values, and all labels center and remain legible at every DCB character-size step.
- [ ] **AC6 —** DCB BRITE and DCB CHAR SIZE controls still affect the revised DCB surface/text as specified by T02-26; disabled controls remain inert.
- [ ] **AC7 —** No STARS/FAA font asset, font download, or font-family claim is introduced.
- [ ] **AC8 — Research:** source comment identifies the CRC-style physical-button analog and the trainer/system-font delta.

## Test plan

- Unit: class/token state selection, disabled semantics, DCB BRITE/CHAR integration.
- Integration: DOM has normal/pressed/disabled state classes and no quick-map stripe style; heading-command regression stays green.
- Manual: T02-33 visual script at 1440×900 and 804×900.

## Suggested files

- `src/ui/DisplayControlBar.tsx`
- `src/ui/*.css` or current DCB style module
- `src/scope/palette.ts`
- `src/scope/fonts.ts`
- `src/ui/DisplayControlBar.test.ts`
