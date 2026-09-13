# T02-181 Generic airport voice grounding

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-180  
**Blocks:** T02-182  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only.

## Mission

Make every loaded scenario catalog airport an explicit, data-first voice and
Path-C clearance-limit candidate. ICAO and catalog-owned spoken names/aliases
must resolve only in an IFR clearance-limit slot; they are never generic DCT
fixes or FixRegistry entries.

| Input/form | Expected action/result | State/side effect | Error/negative case | Evidence |
| --- | --- | --- | --- | --- |
| `CLEARED TO KATL VIA DIRECT` | limit grounds to `KATL` | normal IFR transaction | unknown ICAO misses | JO 7110.65 §4-2-1 |
| `CLEARED TO HARTSFIELD JACKSON ATLANTA AIRPORT VIA DIRECT` | listed alias grounds to `KATL` | same as ICAO | unknown/ambiguous name misses | §4-2-1 |
| `DIRECT KATL` | unchanged direct grammar | no airport-as-fix admission | reject unless an actual catalog fix/navaid | trainer law |

## Scope

- Add canonical airport name plus optional spoken aliases to the generic
  catalog schema/loader; validate every shipped catalog has usable airport
  identity/name data.
- Pass a separate airport candidate namespace through app → voice loop →
  `parseCommand` → Path-C context. ICAO and aliases ground only new IFR
  clearance limits.
- Include all airports in loaded scenario data through generic catalog walkers;
  never KATL/KDEM branches and never add airport IDs to `FixRegistry`.
- Add synthetic ambiguity/unknown tests and one all-shipped-catalog acceptance
  test. Update user docs with voice airport limit examples.

## Non-goals

Airport database search, arbitrary city-name guessing, airport direct commands,
VFR pickup, or changing tactical direct semantics.

## Acceptance criteria

- [ ] Every shipped scenario catalog airport supplies ICAO and a validated
  spoken name/alias set through generic data.
- [ ] Voice/text clearance limit accepts canonical ICAO and listed names;
  unknown/ambiguous aliases have no mutation.
- [ ] Airport candidates stay separate from fixes/navaids and tactical direct.
- [ ] Existing clearance/parser/facility tests stay green.

## Test plan

Synthetic two-airport name/alias and ambiguity tests; voice parser tests for
ICAO/name/unknown; loaded-catalog inventory acceptance; `npm run ci`.

