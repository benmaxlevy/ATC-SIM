# T00-03 Folder layout and public APIs of packages

**Phase:** 00 Slice
**Priority:** P0
**Size:** M
**Depends on:** T00-02
**Blocks:** T00-04, T00-05, T00-06, T00-07, T00-08, T00-10
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

`src/` matches `phases/_shared/architecture.md` package folders. Each folder has a barrel `index.ts` that is the **only** public API other packages may import. `parse` and `pilot` exist but refuse to run real logic.

## Context

Architecture package table:

| Folder | Owns |
| --- | --- |
| `src/core` | Sim clock, aircraft, kinematics, Command IR types |
| `src/parse` | Text/voice string → `Command` |
| `src/pilot` | Validation, readback templates, intent apply |
| `src/scope` | Canvas PPI, maps, datablocks, scope keys |
| `src/speech` | SpeechPort impls, capture, radio graph |
| `src/scenario` | Airport, spawn, maps JSON |
| `src/ui` | Shell, command line, strips, settings |

Phase 0 still owns only **seams**. Command IR types are T00-06; coords T00-04; SpeechPort T00-07; scenario JSON T00-05; shell T00-10.

## Scope

- Create the seven folders with `index.ts` barrels (and a tiny `src/core/world.ts` stub).
- Vite + tsconfig **path aliases**:
  - `@core` → `src/core`
  - `@parse` → `src/parse`
  - `@pilot` → `src/pilot`
  - `@scope` → `src/scope`
  - `@speech` → `src/speech`
  - `@scenario` → `src/scenario`
  - `@ui` → `src/ui`
- Document the public API of each barrel in a block comment at the top of that `index.ts` (what later phases will add vs what is legal to call now).
- Export a minimal `World` from `@core` (see Implementation notes). No `stepWorld` yet.
- `@parse` exports `parseCommand(text: string): Command` as a function that **throws** `Error` with message containing `phase 1` (do not implement tokens).
- `@pilot` exports `applyCommand` that **throws** `Error` with message containing `phase 1`.
- `@scope` exports `PpiPlaceholderId = "ppi-placeholder"` (string const) for T00-10 to use as a DOM id.
- `@speech` and `@scenario` barrels may export empty placeholder types (`export {}` is not enough — export at least a named `PACKAGE` const like `export const SPEECH_PACKAGE = "speech"` so imports resolve) until T00-07 / T00-05 fill them.
- Unit tests: importing barrels does not throw; `parseCommand` / `applyCommand` throw.
- `src/ui` may keep `App.tsx` as the UI barrel re-export for now.

## Out of scope

- Filling Command IR, geo, NullSpeechPort, kdem.json, session log, ESLint (later tickets).
- Implementing the parser or Pilot agent “enough to compile Command”.
- Cross-importing `@parse` from `@core` (core must not depend on parse/pilot/ui/scope/speech).
- Publishing npm packages.

## Implementation notes

### Import rules (enforce in comments; T00-09 may lint later)

- `@core` depends on nothing in `src/*` except itself.
- `@parse` may import `@core` only.
- `@pilot` may import `@core` only.
- `@scenario` may import `@core` only.
- `@speech` may import `@core` only (AudioClip is speech-owned; do not put vendor SDKs here yet).
- `@scope` may import `@core` and `@scenario`.
- `@ui` may import all of the above. The **sim tick must never wait on React render** (comment only in phase 0).

Because `Command` does not exist until T00-06, `parseCommand` / `applyCommand` may be typed as `...: never` **or** use a temporary `unknown` return and a `// T00-06 will type this as Command` comment. Prefer:

```ts
export function parseCommand(_text: string): never {
  throw new Error("parseCommand is phase 1");
}
```

After T00-06 the implementation agent for T00-06 must retarget the return type to `Command` while **keeping the throw**.

### `World` stub (T00-03)

```ts
export interface World {
  simTimeMs: number;
  simRate: 1 | 2;
  aircraft: readonly [];
}
```

`simRate` union matches glossary (phase 1 supports `1` and `2`). `aircraft` stays an empty tuple/array type until phase 1.

### Aliases

Configure both `vite.config.ts` `resolve.alias` and `tsconfig.json` `compilerOptions.paths` (and Vitest so tests resolve aliases).

## Acceptance criteria

- [ ] **AC1 —** Directories exist: `src/core`, `src/parse`, `src/pilot`, `src/scope`, `src/speech`, `src/scenario`, `src/ui`, each with `index.ts`.
- [ ] **AC2 —** TypeScript and Vite resolve `@core`, `@parse`, `@pilot`, `@scope`, `@speech`, `@scenario`, `@ui`.
- [ ] **AC3 —** `@core` exports `World` with `simTimeMs`, `simRate`, `aircraft`.
- [ ] **AC4 —** `parseCommand("H270")` throws an `Error` whose message includes `phase 1` (Vitest).
- [ ] **AC5 —** `applyCommand` throws an `Error` whose message includes `phase 1` (Vitest).
- [ ] **AC6 —** A Vitest file imports every barrel (`@core` … `@ui`) and succeeds (no circular init crash).
- [ ] **AC7 —** No `stepWorld`, no parser tokens, no Canvas drawing added in this ticket.

## Test plan

- Unit: `src/parse/parse.test.ts`, `src/pilot/pilot.test.ts`, `src/packages.import.test.ts` (or similar).
- Integration: `tsc --noEmit` still green.
- Manual: none required.

## Suggested files

- `src/core/index.ts`
- `src/core/world.ts`
- `src/parse/index.ts`
- `src/parse/parse.test.ts`
- `src/pilot/index.ts`
- `src/pilot/pilot.test.ts`
- `src/scope/index.ts`
- `src/speech/index.ts`
- `src/scenario/index.ts`
- `src/ui/index.ts`
- `src/packages.import.test.ts`
- `vite.config.ts` (aliases)
- `tsconfig.json` (paths)
