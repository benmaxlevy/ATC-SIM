# T00-09 Tooling: lint format ci script

**Phase:** 00 Slice
**Priority:** P0
**Size:** S
**Depends on:** T00-03
**Blocks:** T00-10
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

`npm run lint`, `npm run format`, `npm run typecheck`, and `npm run ci` exist and pass on the current tree. CI is runnable locally without a cloud account; a GitHub Actions workflow runs the same `npm run ci`.

## Context

Quality bar in architecture is FPS/latency later; phase 0 quality bar is **repeatable checks**. Core/parse/pilot must remain lint-clean as DOM-free TS.

Do not fight Prettier with conflicting ESLint formatting rules — use ESLint for bugs/imports, Prettier for format.

## Scope

- ESLint 9 flat config (`eslint.config.js`) with `typescript-eslint` recommended (type-checked **optional**; if type-checked is slow, `recommended` without type-checking is acceptable). Apply to `src/**/*.{ts,tsx}`.
- Prettier: `prettier` + `.prettierrc` (narrow: 80 or 100 print width — pick **100**, `trailingComma: "all"`).
- Ignore: `dist`, `node_modules`, `coverage`, `package-lock.json`.
- Scripts:
  - `typecheck`: `tsc --noEmit`
  - `lint`: `eslint src`
  - `format`: `prettier --write .`
  - `format:check`: `prettier --check .`
  - `ci`: `npm run typecheck && npm run lint && npm run format:check && npm test`
- `.github/workflows/ci.yml`: on `push` and `pull_request`, Node 20, `npm ci`, `npm run ci`.
- Fix any lint/format issues this ticket introduces in existing `src/`.
- Optional: `eslint-plugin-import` no-cycle **off** unless cheap; do not spend the ticket on a perfect dependency graph linter.

## Out of scope

- Husky / lint-staged (do not add git hooks unless already present).
- Codecov, Sonar, Cypress, Playwright.
- Changing TypeScript `strict`.
- Formatting `phases/**` markdown in a way that rewrites other phases — if Prettier is run on `phases/`, it may reflow files. **Constrain Prettier to `src`, `index.html`, `vite.config.ts`, `docs`, `package.json`, `*.yml` in `.prettierignore` excluding `phases/`** so this ticket does not mutate planning docs.

## Implementation notes

- `.prettierignore` **must** include `phases/` so implementation agents do not churn ticket checkboxes’ wrapping.
- `npm run ci` must be **non-interactive** and must not start `vite` or `vitest` watch.
- GitHub Action:

```yaml
name: ci
on:
  push:
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - run: npm ci
      - run: npm run ci
```

- If ESLint flags `no-explicit-any`, do not add `any` in src; fix types.
- `src/vite-env.d.ts` and JSON imports must remain legal.

## Acceptance criteria

- [ ] **AC1 —** `package.json` scripts `lint`, `format`, `format:check`, `typecheck`, `ci` exist.
- [ ] **AC2 —** `npm run typecheck` exits 0.
- [ ] **AC3 —** `npm run lint` exits 0.
- [ ] **AC4 —** `npm run format:check` exits 0 after `format` (or already formatted).
- [ ] **AC5 —** `npm run ci` runs typecheck, lint, format:check, and `vitest run`, then exits 0.
- [ ] **AC6 —** `.github/workflows/ci.yml` runs `npm ci` and `npm run ci` on Node 20.
- [ ] **AC7 —** `.prettierignore` includes `phases/` so phase markdown is not rewritten by `format`.
- [ ] **AC8 —** `npm run ci` does not start a dev server or hang waiting for stdin.

## Test plan

- Unit: none new.
- Integration: run `npm run ci` locally.
- Manual: none.

## Suggested files

- `eslint.config.js`
- `.prettierrc`
- `.prettierignore`
- `.gitignore` (if needed)
- `.github/workflows/ci.yml`
- `package.json`
