# T02-163 Command reference help overhaul

**Phase:** 02 Scope  
**Priority:** P1  
**Size:** M  
**Depends on:** T02-157  
**Blocks:** None  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Make the in-app Help menu a useful, command-focused reference. Remove
references to other software from the menu and keep the in-app and
`docs/USER.md` command references aligned with the live typed, spoken, Preview
Area, scope, DCB, and mouse command surfaces.

## Scope

- Replace external-comparison columns and copy with local command reference
  columns: command/key, syntax or example, focus/input surface, and result.
- Group commands by Radio, Preview Area, Scope, DCB, Mouse, and Focus.
- Include active aliases, reserved/no-op commands, and command-conflict rules
  honestly; do not document unsupported behavior as available.
- Update `docs/USER.md` command-reference sections from the live registries and
  parser behavior.
- Preserve Help button/keyboard access and the existing overlay toggle state.

## Non-goals

- No new commands, parser tokens, Command IR fields, or scope behavior.
- No removal of historical architecture comments or research citations outside
  the user-facing Help menu and command-reference copy.
- No full external-software compatibility table.

## Acceptance criteria

- [ ] Help menu contains no references to CRC, vNAS, vice, or other external
  software in visible copy, headings, or rendered command data.
- [ ] Help menu is organized around commands and includes syntax/examples,
  input focus, and result for all currently documented command groups.
- [ ] Typed radio, spoken radio, Preview Area, scope-key, DCB, mouse, and focus
  guidance matches the live implementation.
- [ ] `docs/USER.md` contains no stale claim that F1 opens Help or that F3
  initiates tracks, and its command examples match current behavior.
- [ ] Tests prove rendered Help copy is local-only and cover representative
  entries from each command group without duplicating the command registry.
- [ ] `npm run ci` passes.

## Likely files

- `src/scope/keymap.ts`
- `src/ui/overlays/ScopeHelpOverlay.tsx`
- `src/index.css`
- `src/ui/overlays/test/ScopeHelpOverlay.test.ts`
- `src/scope/test/keymap.test.ts`
- `src/ui/test/trainerChrome.test.ts`
- `docs/USER.md`

## Handoff

Return `READY TO MERGE` with changed paths and the CI result, or `BLOCKED`
with the exact failing command and reason.
