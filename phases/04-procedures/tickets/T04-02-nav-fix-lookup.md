# T04-02 Nav fix lookup

**Phase:** 04 Procedures
**Priority:** P0
**Size:** S
**Depends on:** T04-01
**Blocks:** T04-03
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The sim can resolve a **fix or navaid** id from the loaded KDEM catalog to a position in the local NM plane in O(1). Unknown ids fail closed. DIRECT (`DCT DEM`, `DCT NEMAX`) and STAR code will use this; they do not exist yet.

## Context

Command IR already has `{ type: "DIRECT"; fixId: string }` (`phases/_shared/command-ir.md`). Phase 1 may parse nothing for it. Lookup must be a core/scenario API, not string matching in the parser.

Glossary: distances NM, true north. Architecture: single `World` / facility catalog.

## Scope

- `FixRegistry` (or `catalog.fix(id)`) built when the catalog loads. **One namespace:** STAR fixes, FAF/threshold, **and** VORs/NDBs/ILS component ids (`DEM`, `DMO`, `IDEM`).
- Case: store uppercase; lookup trims and uppercases (`nemax` → `NEMAX`, `dem` → `DEM`).
- `getPosition(id): { xNm, yNm } | undefined` and `require(id)` that throws/returns Result.
- List/search not required beyond `has` / `get`.
- Unit tests with the KDEM catalog: NEMAX, MERGE, FI27, RW27, MISSD, **DEM**, **DMO**; unknown `ZZZZZ`.

## Out of scope

- Flying DIRECT, parser token `DCT`, CIFP, lat/lon conversion (already done at catalog load).
- Fuzzy match / soundex / “closest fix.”
- Enroute navaids **outside** the committed KDEM files. (In-catalog VORs/NDBs **are** in scope.)

## Implementation notes

Keep the registry immutable for a session. Rebuild only on scenario load.

Do not key by name phrase (“DEMO”) — only `id`. `get("DEM")` is the VOR, not the airport ICAO `KDEM` unless you also register ARP as a fix (do **not** — `DCT KDEM` may already exist as a phase 3 grammar quirk; lookup should not invent an airport-center fix unless it is in the JSON).

If two fixes share an id, catalog load (T04-01) should already reject; add a registry assert if you want defense in depth.

Suggested signature:

```ts
export interface FixRegistry {
  get(id: string): NavFix | undefined;
  require(id: string): NavFix; // throws Error with code "unknown-fix"
  has(id: string): boolean;
  ids(): readonly string[];
}

export function buildFixRegistry(catalog: ProcedureCatalog): FixRegistry;
```

Pilot validation (later tickets) calls `has` and rejects with a readback; this ticket only provides the map.

## Acceptance criteria

- [ ] **AC1 —** Given KDEM catalog, when `get("NEMAX")` or `get("nemax")`, then `xNm === 17` and `yNm === 12` (or the documented translated coordinates from T04-01).
- [ ] **AC1b —** Given `get("DEM")`, when called, then position matches `vors.json` (`0.4`, `0.8` unless translated).
- [ ] **AC2 —** Given `get("NOPE")`, when called, then result is `undefined` and `has("NOPE")` is false.
- [ ] **AC3 —** Given `require("NOPE")`, when called, then it throws or returns a typed failure; it must not return `(0,0)` silently.
- [ ] **AC4 —** Automated test covers AC1–AC3. DOM-free.

## Test plan

- Unit: KDEM ids, case fold, unknown, duplicate-id if you add a builder test with a fake catalog.
- Integration: none required.
- Manual: none.

## Suggested files

- `src/core/nav/fixRegistry.ts`
- `src/core/nav/fixRegistry.test.ts`
