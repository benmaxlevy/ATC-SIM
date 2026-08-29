# T04-34 Generic CIFP pack CLI and KATL migration

**Phase:** 04 Procedures  
**Priority:** P0  
**Size:** L  
**Depends on:** T04-32, T04-33  
**Blocks:** T04-35

## Goal

Wire parser, radius seed, closure, and catalog writer into one generic local
CLI. Regenerate KATL through that pipeline, removing airport-specific
extraction logic while preserving existing playable behavior.

## Scope

- Add a command with explicit inputs such as:
  `--in <local CIFP> --airport <ICAO> --radius <NM> [--sids ...] [--stars ...] [--approaches ...] --out <dir>`.
- Generate the existing `src/scenario/data/<icao>/` catalog file layout and
  preserve optional scenario/video-map/MVA files outside the catalog writer.
- Replace `extract-katl-slice.ts` with generic configuration or make it a thin
  compatibility wrapper that has no KATL parsing branch.
- Regenerate committed KATL trainer data only from a local source supplied by
  the developer. Never commit the source cycle or national intermediate.
- Preserve scenario IDs, selected STAR/approach IDs, spawn references, maps,
  and runtime inventory behavior.
- Add dry-run diagnostics showing radius seed count, closure additions,
  unsupported records, and output paths before writing.

## Out of scope

- Automatic FAA download, scheduled update, CDN, or browser fetch.
- Replacing KDEM default.
- KATL-specific runtime conditionals, SID flying, RNAV, holds, RF, or maps
  generated from CIFP. SID catalog data itself is in scope.

## Acceptance criteria

- [ ] AC1 — Generic CLI generates a valid catalog containing supported SID,
  STAR, and approach data for a synthetic second airport without code changes
  or an ICAO conditional.
- [ ] AC2 — KATL output is generated through generic parser/seed/closure code
  and preserves required playable STAR/approach references.
- [ ] AC3 — Dry run reports seed vs closure counts and unsupported records;
  writing is deterministic.
- [ ] AC4 — No full CIFP or national intermediate is tracked, bundled, or
  imported by `src/`.
- [ ] AC5 — KDEM remains default and existing KATL/session/video-map tests
  remain green.
- [ ] AC6 — Documentation states which KATL data is intentionally committed
  and how to reproduce it from a local file.

## Test plan

- CLI synthetic airport generation.
- KATL regeneration comparison against required structural fields.
- Negative test for missing local input and invalid airport/radius.
- `npm test` plus `npm run ci` before commit.

## Suggested files

- `tools/cifp-import/cli.ts`
- `tools/cifp-import/pack.ts`
- `tools/cifp-import/pack.test.ts`
- `tools/cifp-import/extract-katl-slice.ts`
- `tools/cifp-import/README.md`
- `package.json`
- `src/scenario/data/katl/`
