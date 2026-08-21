# T00-02 Repo skeleton Vite TypeScript Vitest

**Phase:** 00 Slice
**Priority:** P0
**Size:** M
**Depends on:** none
**Blocks:** T00-03, T00-09
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

`npm install`, `npm run dev`, and `npm test` work on a strict TypeScript Vite SPA with Vitest. The default Vite demo content is gone.

## Context

`phases/_shared/architecture.md`: Language TypeScript strict; app Vite + one HTML entry; tests Vitest; no server tick. Phase README freezes **React 18** for `src/ui` chrome and a **single app** (not a pnpm/turbo monorepo).

T00-01 docs may already exist; leave them alone.

## Scope

- Scaffold at **repo root**: `package.json` name `atc-sim`, `"type": "module"`.
- Vite 6.x, TypeScript 5.x, React 18, `react-dom`, Vitest 3.x, `@vitejs/plugin-react`.
- `tsconfig.json`: `"strict": true`, `"noEmit": true` (or project references with app `noEmit` for `tsc --noEmit`). Include `src`. JSX `react-jsx`.
- `vite.config.ts`: React plugin; `test` config **or** `vitest.config.ts`. Vitest default environment **`node`** (DOM-free core tests later).
- `index.html` at repo root, script entry `src/main.tsx`.
- `src/main.tsx` mounts a minimal React tree into `#root` (placeholder text `ATC-SIM` is enough; T00-10 replaces chrome).
- `src/App.tsx` optional; keep it tiny.
- One smoke test: `src/smoke.test.ts` asserting `true` or a trivial pure function, proving Vitest runs.
- `.gitignore`: `node_modules`, `dist`, `coverage`, `*.local`, `.env`, `.env.*`.
- Engines: Node `>=20`.
- Scripts: `dev` → `vite`, `build` → `tsc --noEmit && vite build`, `preview` → `vite preview`, `test` → `vitest run`, `test:watch` → `vitest`.
- Do **not** add ESLint/Prettier/CI yet (T00-09).
- Do **not** create the `src/core`… package tree yet (T00-03).

## Out of scope

- Path aliases for `@core` etc. (T00-03).
- Disclaimer UI, command line, PPI.
- Monorepo workspaces, Next.js, SSR.
- `strict: false`, `any` to silence the skeleton.

## Implementation notes

- Use npm (lockfile `package-lock.json`). Do not add pnpm-workspace or Lerna.
- `src/vite-env.d.ts` with `/// <reference types="vite/client" />`.
- CSS: a few lines in `src/index.css` resetting `html, body, #root { height: 100%; margin: 0; }` is OK; dark theme polish is T00-10.
- If you use `create-vite`, delete counter/logo/assets demo and unused CSS modules.
- Ensure `npm test` is non-watch (`vitest run`) so CI will not hang.

## Acceptance criteria

- [ ] **AC1 —** `package.json` has `dev`, `build`, `test` (`vitest run`), and `"type": "module"`.
- [ ] **AC2 —** `tsconfig.json` (or the app tsconfig used for src) has `"strict": true`.
- [ ] **AC3 —** `npx tsc --noEmit` exits 0.
- [ ] **AC4 —** `npm test` exits 0 and runs at least one Vitest test.
- [ ] **AC5 —** `npm run dev` starts Vite and serves `index.html` → `src/main.tsx` without crashing. **Manual**
- [ ] **AC6 —** Loaded page is not the stock Vite+React counter/logo demo. **Manual**
- [ ] **AC7 —** No `packages/*` workspace; app lives at repo root.

## Test plan

- Unit: `src/smoke.test.ts` (or equivalent).
- Integration: `tsc --noEmit`, `vitest run`.
- Manual: `npm run dev`, open the URL, confirm a blank/minimal page titled or labeled ATC-SIM.

## Suggested files

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `tsconfig.node.json` (Vite config typing)
- `vite.config.ts`
- `vitest.config.ts` (if not merged into Vite config)
- `index.html`
- `src/main.tsx`
- `src/App.tsx`
- `src/index.css`
- `src/vite-env.d.ts`
- `src/smoke.test.ts`
- `.gitignore`
