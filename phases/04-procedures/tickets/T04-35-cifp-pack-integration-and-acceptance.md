# T04-35 CIFP pack integration and acceptance

**Phase:** 04 Procedures  
**Priority:** P0  
**Size:** M  
**Depends on:** T04-34  
**Blocks:** none

## Goal

Prove CIFP-derived catalog packs are interchangeable with authored facility
catalogs at runtime, without changing the loader contract or making KDEM
dependent on FAA data.

## Scope

- Add generic loader/inventory coverage for a synthetic second facility and
  the committed KATL pack.
- Verify catalog validation, coordinate projection, fix registry, DCT/VIA/APP
  resolution, STAR spawn references, approach references, and video-map
  independence.
- Add guardrails preventing `src/` from importing `tools/cifp-import` or
  assuming one airport's procedure IDs.
- Update phase README, tool README, and later backlog with the final boundary:
  local source input, selected packs in git, unsupported procedures retained
  as limitations.
- Record manual developer workflow honestly; do not claim FAA-cycle
  regeneration was tested without a local source file.

## Out of scope

- New runtime lazy-loading architecture.
- Full national catalog in the browser.
- New procedure flying behavior or phase 5 work.

## Acceptance criteria

- [ ] AC1 — Every listed playable scenario loads its catalog and required map
  set through generic loaders.
- [ ] AC2 — KDEM remains the default and boots without CIFP input.
- [ ] AC3 — Synthetic second-facility pack proves no facility-id branch is
  required.
- [ ] AC4 — Procedure references outside seed radius remain usable after pack
  generation.
- [ ] AC5 — Video maps, authored spawns, MVA/ATPA, and CIFP catalog data stay
  separate and existing tests remain green.
- [ ] AC6 — `npm run ci` passes and documentation matches shipped behavior.

## Test plan

- Loader/inventory integration tests.
- Static boundary test for tool/runtime imports.
- Existing procedure, spawn, map, session, and FMS suites.
- Manual: one local pack-generation dry run if an authorized CIFP file exists;
  otherwise record skipped with reason.

## Suggested files

- `src/scenario/procedures/loadCatalog.test.ts`
- `src/scenario/playableScenarios.test.ts`
- `tools/cifp-import/pack.integration.test.ts`
- `phases/04-procedures/README.md`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
