# T04-08 CIFP subset importer (dev tool)

**Phase:** 04 Procedures
**Priority:** P0
**Size:** M
**Depends on:** T04-01
**Blocks:** none
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A developer-run importer converts a **frozen CIFP-like fixture** into the same `ProcedureCatalog` JSON schema as KDEM. Tests pass offline. KDEM JSON remains the runtime default. No chart scraping. No full FAA cycle in git.

## Context

CIFP (glossary) is the FAA Coded Instrument Flight Procedures product. Licensing/redistribution is awkward; `_shared/non-goals.md` forbids bundling non-redistributable FAA products without a documented source and forbids scraping Jeppesen/ForeFlight/etc.

Strategy (phase README): KDEM is first-class committed JSON. The importer proves schema compatibility. A tiny synthetic fixture lives in `testdata/cifp/`. Optional local CIFP cycle is documented, never fetched by the browser.

## Scope

- CLI: `npm run cifp:import -- --in testdata/cifp/frozen-subset.cifp --out <path>` (or `tsx tools/cifp-import/cli.ts`).
- Parse a **documented subset** of CIFP / ARINC-424-shaped records enough to emit:
  - terminal/enroute waypoint fixes (id + lat/lon → xNm/yNm using phase 0 projection, **or** fixture uses already-projected NM in a comment field if you keep the fixture fictional)
  - one STAR with 2–3 legs and altitude constraints
  - one ILS (loc course, GS angle, threshold, DA-ish fields you can map)
- Skip unknown record types; print skip counts.
- `testdata/cifp/frozen-subset.cifp` — synthetic, small, committed. **Not** a real cycle extract if that would be redistributable-encumbered; invent CIFP-shaped lines that the parser accepts.
- `testdata/cifp/frozen-subset.expected.json` — catalog snapshot. Test: importer(stdout or file) deep-equals expected (ignore key order).
- `tools/cifp-import/README.md`: official FAA download URL *as documentation only*, “do not commit the cycle,” “app runtime never downloads this,” “KDEM is not in CIFP; use KDEM JSON in the sim,” legal: developer is responsible for CIFP terms.
- Importer code is not imported from `stepWorld` or Vite app entry. Keep it in `tools/`.

## Out of scope

- Runtime download, CDN of CIFP, in-browser parse of 100 MB cycles.
- Scraping charts, PDFs, or web procedure pages.
- Full ARINC 424 (all SID/STAR/IAP encodings, holds, RF legs, procedure turns).
- Replacing KDEM as the default scenario.
- Shipping KDCA/KCLT/etc. as the demo.

## Implementation notes

Fixture design: easiest path is records that look like CIFP (fixed-width or comma, documented in the tool README) with **lat/lon of KDEM-like points** near 0°N 0°E so the phase 0 projector yields ALPHA/BRAVO/… within 0.05 NM of `kdem-procedures.json`. If the projector is painful, allow a test-only continuation field `XNM`/`YNM` in the synthetic dialect and document that **real CIFP uses lat/lon only**.

Map STAR altitude qualifiers to `AT` / `AT_OR_ABOVE` / `AT_OR_BELOW`.

ILS: loc front course, GP angle, threshold coordinates, TCH if present; default TCH 50, beam 2.5°, length 18 if missing.

Do not fail the ticket because real-world CIFP has dozens of continuation records. ACs are fixture-only.

Suggested package: no extra dependency if `fs` + line parser suffice. Node CLI is OK; this is a **dev tool**, not a browser module. Vitest can import the parse function without the CLI.

## Acceptance criteria

- [ ] **AC1 —** Given `testdata/cifp/frozen-subset.cifp`, when the parse function runs **with network disabled / no fetch**, then it returns a `ProcedureCatalog` that matches `frozen-subset.expected.json`.
- [ ] **AC2 —** Expected catalog includes ≥2 STAR legs with at-or-above (or AT) constraints, an ILS-type approach with a loc course, and every `fixId` resolved.
- [ ] **AC3 —** Unknown/garbage lines are skipped; importer does not throw on a documented extra record type in the fixture (include one skippable line).
- [ ] **AC4 —** Tool README states: KDEM remains default; do not scrape charts; do not commit FAA cycles; how to run the CLI on a local file.
- [ ] **AC5 —** App production bundle does not include `tools/cifp-import` as a runtime dependency of the tick (grep / do not import from `src/`).
- [ ] **AC6 —** Automated test for AC1–AC3. DOM-free.

## Test plan

- Unit: parse fixture; skip line; dangling fixId in a *bad* fixture fails the convert with an error (add `frozen-subset.bad.cifp` or inline string).
- Integration: CLI writes a temp file (optional).
- Manual: none required. Optional: developer runs CLI once.

## Suggested files

- `tools/cifp-import/README.md`
- `tools/cifp-import/parse.ts`
- `tools/cifp-import/cli.ts`
- `tools/cifp-import/parse.test.ts`
- `testdata/cifp/frozen-subset.cifp`
- `testdata/cifp/frozen-subset.expected.json`
- `package.json` script `cifp:import`
