# T02-198 Flight-plan default beacon semantics

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-197  
**Blocks:** T02-199  
**Merge target:** `feature/beacon-pools`  
**Launch:** Implement this ticket only. Stop at the configured swarm boundary.

## Mission

Apply the generic pool contract to F6/`FLT DATA` and abbreviated creation.
Distinguish an omitted beacon from explicit `A` (no assigned code), while
preserving F1 pending-discrete requirements and Preview Area-only scope
behavior.

## Manual research

Authoritative sources:

- `/home/ben/Documents/stars refs/full_manual.pdf`:
  - Appendix D, Table D-1, printed p. D-2: RPO `F6` equals operational
    `FLT DATA`.
  - §5.5.1, pp. 5-85–5-89, Table 5-3: abbreviated creation.
  - §5.5.5, pp. 5-105–5-110, Table 5-7: F6 creation and optional beacon.
  - §5.5.7, pp. 5-116–5-119: pending discrete creation requires a beacon.
- `/home/ben/Documents/stars refs/quick_reference_manual.pdf`, p. 18:
  F6/FLT DATA, abbreviated creation, and selector forms.

Trainer delta: ATC-SIM uses F6/F1 Preview Area routing and does not emit
Command IR, readback, aircraft intent, or kinematics.

## Exact entry and state contract

All fields remain space-separated and order-independent where the manual allows
it. Beacon precedence is: explicit four-octal code, explicit pool selector,
explicit `A`, otherwise omitted/default policy. `A` must never fall through to
the default allocator.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `F6 AAL123 ENTER`, default `none` | Create pending IFR plan with no assigned beacon | Preview clears; no aircraft mutation | Invalid ACID → `ILL ACID` | Appendix D Table D-1; §5.5.5 |
| `F6 AAL123 ENTER`, default IFR pool | Create pending IFR plan with first free default-pool code | Plan only; no association/correlation | Exhausted pool → `CAPACITY — BCN` | §5.5.5/Table 5-7 |
| `F6 AAL123 A ENTER` | Create pending IFR plan with no assigned beacon | Explicit no-code policy overrides default | `A` is not aircraft data in F6 beacon position | Table 5-7 |
| `AAL123 ENTER`, default pool | Create pending abbreviated plan using default policy | No Command IR/readback/intent change | No config → no code | §5.5.1/Table 5-3 |
| `AAL123 + ENTER` | Allocate configured IFR pool | Plan receives assigned beacon | Exhaustion → `CAPACITY — BCN` | Table 5-3/Table 5-7 |
| `AAL123 /`, `/1`, `/2`, `/3`, `/4` | Allocate selected configured pool | Only plan-side beacon changes | Exhaustion → `CAPACITY — BCN` | Table 5-3/Table 5-7 |
| `F1 AAL123 ENTER` | Remain incomplete until discrete beacon is supplied | No plan is created | Missing beacon → `FORMAT`; F1 identity still requires slew/click | §5.5.7; T02-166 |
| `F6 AAL123 1289 ENTER` | Reject malformed beacon | World unchanged | `FORMAT` | §5.5.5 |
| `F6 AAL123 F16 250 KDEM*RW27` | Accept valid optional-field permutation | Plan receives fields and default beacon policy | Duplicate field or ambiguous token → `FORMAT` | §5.5.5/Table 5-7 |

## Preview modes and payload

- F6 remains always-on in both radio and scope focus and enters `FLT DATA`.
- Abbreviated creation remains the no-prefix path.
- F1 remains `INIT CNTL`; it is not reclassified as F6.
- The creation action carries an explicit beacon specification discriminator:
  omitted/default, pool selector, explicit code, or explicit no-code.
- Escape/cancel clears the Preview Area without world mutation.
- Accepted creation adds one pending plan; it does not add or mutate aircraft,
  association, Command IR, readback, intent, or kinematics.

## Tests

- Unit: parser precedence for omitted vs `A` vs pool vs explicit code.
- Unit: F6 and abbreviated optional-field permutations, duplicate fields,
  incomplete input, malformed octal, ambiguous two-character TCP/type cases.
- Integration: F6 with default `none`, F6 with configured default pool, explicit
  `A`, each pool selector, exhaustion, and F1 missing-beacon rejection.
- Regression: `*F` altitude filter, radio `L090`, and F6 in both focus modes.

## Help/docs

- `src/scope/keymap.ts` must state that F6 is `FLT DATA`, omitted beacon uses
  configured default policy, and `A` means no assigned beacon.
- `docs/USER.md` must include `F6 AAL123 ENTER`, explicit `A`, and selector
  examples; it must not promise random codes or NAS compatibility.

## Manual-review checklist

- [ ] F6 maps to `FLT DATA` using Appendix D Table D-1, not handoff/initiate.
- [ ] F6 and abbreviated forms accept the documented optional-field order.
- [ ] Omitted beacon and explicit `A` produce the distinct documented policies.
- [ ] Explicit selectors retain `+`, `/`, `/1`–`/4` meanings.
- [ ] Pending discrete F1 creation does not accept omitted beacon.
- [ ] Help/docs match actual Preview routing and trainer deltas.

## Non-goals

- Radio squawk assignment or reported-code updates.
- F1 unsupported datablocks, NAS association, handoff, or networking.
- New Command IR types, parser stages, speech behavior, or pilot effects.
- Random allocation requirement.

## Suggested files

- `src/scope/previewParse.ts`
- `src/scope/previewArea.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/keymap.ts`
- `src/scope/test/flightPlanCreation.test.ts`
- `src/scope/test/previewArea.integration.test.ts`
- `docs/USER.md`

## Handoff

Return exactly `READY TO MERGE` or `BLOCKED`, including changed paths, focused
tests, `npm run ci`, and manual-review notes. No merge or push by worker.
