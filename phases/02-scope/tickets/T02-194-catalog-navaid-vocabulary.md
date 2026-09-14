# T02-194 structured catalog fix and navaid vocabulary

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-193  
**Blocks:** T02-195  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Preserve generic fix/navaid identity, kind, and spoken aliases through the
frontend parser wiring. Tactical direct and deterministic IFR routes must see
the same catalog vocabulary without adding facility-specific branches.

## Context

`fixRegistry.ids()` supplies IDs but discards navaid names. The live route
candidate projection also currently supplies only `{ id, kind }`. A navaid
such as `AHN` with published name `ATHENS` therefore cannot use the same
grounding path as its ident.

## Research

- **R01:** FAA JO 7110.65,
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/;
  Search: `FAA JO 7110.65 NAVAID name type clearance`.
- **R02:** FAA Pilot/Controller Glossary,
  https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/;
  Search: `FAA glossary NAVAID fix route`.
- **R11:** CIFP/NASR identifier source, via
  `phases/_shared/references.md`; Search: `FAA CIFP NASR NAVAID identifiers`.

The catalog is the authoritative facility vocabulary. Navaid-name support is
catalog plumbing; it does not claim complete real-world speech recognition.

## Contract

Use one generic entry shape for parser grounding:

```ts
{ id: string; kind: "FIX" | "NAVAID"; aliases?: string[] }
```

Existing string-ID inputs remain valid. Airport entries remain separate and
can ground only `IFR_CLEARANCE.limitId`.

Preview/mode state: none. No parser call changes scope state or aircraft state.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `cleared direct AHN` | Tactical `DIRECT AHN` | Existing command path only | Unknown ident remains rejected by existing pilot validation | R01; R02 |
| `cleared direct ATHENS` with unique navaid name | Tactical `DIRECT AHN` | No extra mutation | Duplicate name remains ambiguous | R01 NAVAID terminology |
| `cleared to KATL via ATHENS SWEPT` | `DIRECT AHN`, then `DIRECT SWEPT` | Existing active-clearance snapshot only after application | Unknown/ambiguous name returns `PARSE_MISS` | FAA JO 7110.65 §§ 4-2-1, 4-4-1 |
| `cleared to KATL via ATL` | No airport route leg | Airport remains clearance-limit-only | `PARSE_MISS`; never tactical `DIRECT ATL` | Existing namespace contract |
| `cleared to KATL via KIMMY` with no catalog entry | No candidate | No state change | `PARSE_MISS`; no LLM invention | Data-first rule |
| Existing `X-ATC-Fixes` STT call | Existing ID-only STT behavior | No speech provider change | Do not dump the full catalog into STT header | `phases/_shared/speech-port.md` |

## Scope

- Add/extend a shared catalog-fix entry type without a facility-specific loader.
- Build entries from `catalog.navaids` and `catalog.fixes`; include navaid
  `name` as a spoken alias when present.
- Feed the same entries to tactical grounding and route parsing.
- Keep a separate ID projection for STT headers and existing APIs that require
  `string[]`.
- Update `handleRadioText`, `create-app`, and voice-loop parser options so
  typed text and PTT use identical vocabulary.
- Preserve catalog order only as stable display/order metadata; never use it
  to resolve an ambiguous spoken match.

## Implementation notes

- Do not add `KIMMY` or another synthetic facility row to KATL data.
- Airport ICAOs must be filtered from route candidates before Path C context is
  built.
- A navaid `name` is an alias, not a replacement for the canonical ident.
- Duplicate aliases must produce candidate ties, not silent selection.
- Keep `fixRegistry` geometry and execution identity keyed by canonical ID.

## Acceptance criteria

- [ ] All existing string-array callers still compile and behave unchanged.
- [ ] Live navaid IDs and names reach both tactical and route grounding.
- [ ] Fixes and navaids share the matcher but retain their `kind` for Path C.
- [ ] Airports never enter generic route/fix candidate lists.
- [ ] A missing or ambiguous alias produces `PARSE_MISS` and no mutation.
- [ ] No facility-specific branch or new loader is added.
- [ ] The STT vocabulary remains bounded and separate from parser retrieval.

## Test plan

- Unit: structured entry normalization, canonical ID, navaid name alias,
  duplicate alias, airport exclusion, and string-input compatibility.
- Parser: tactical direct and IFR route parity for navaid ident/name and fix
  ID/name forms.
- Integration: `createWorld`/`create-app` catalog projection with synthetic
  navaid and fix entries.
- Regression: KATL airport limit remains valid while KATL is invalid as a
  route leg; `KIMMY` remains unavailable unless supplied by a test catalog.
- Manual: supplied STARS manual `/home/ben/Documents/stars refs/full_manual.pdf`,
  § 5.5.5 p. 5-105 and § 5.6.17 p. 5-167; mark alias matching as trainer
  behavior.

## Help/docs

No new shortcut. T02-196 documents supported navaid ident/name examples in
`docs/USER.md` and Help.

## Out of scope

- Global geographic lookup or route connectivity.
- New scenario data for KATL.
- Path C candidate-group schema and Python validator changes (T02-195).
- STT model/provider changes.

## Suggested files

- `src/parse/spoken/catalog-ground.ts`
- `src/parse/spoken/catalog-retrieve.ts`
- `src/parse/path-c.ts`
- `src/parse/parse-command.ts`
- `src/pilot/handleRadioText.ts`
- `src/app/create-app.ts`
- `src/speech/voice-loop.ts`
- `src/scenario/procedures/types.ts`
- Relevant parser and voice-loop tests

## Handoff

Return exactly `READY TO MERGE` or `BLOCKED`, including changed paths, focused
tests, `npm run ci`, and manual-review notes. No merge or push by worker.
