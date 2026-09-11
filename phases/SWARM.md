# ATC-SIM swarm orchestrator — Forty-fourth swarm (Random/Author Spawn Policies)

## Fifty-fourth swarm started — 2026-09-10 (Unified outbound handoff positions)

Captain owns `fix/datablocks` and will run T02-137 through T02-139 with one
isolated worker at a time. The swarm unifies current outbound handoff-to-C and
handoff-to-Tower paths around one destination-aware initiation/acceptance
function. No manual audit runs during implementation; user will audit after
the swarm completes.

| Key | Value |
| --- | --- |
| Goal | Unify supported outbound handoffs by receiving position and preserve shared accepted-handoff UI. |
| Include | **T02-137**, **T02-138**, **T02-139** only. |
| Skip | Pointouts, quicklook, inbound redesign, networking, second-sector model, new handoff types, new SPCs, new alerts, parser, Command IR, speech, DCB, and facility branches. |
| Stop | After T02-139 acceptance and `npm run ci`. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `fix/datablocks`. |
| Model | Inherit current session model; no speculative override. |
| Push | No push unless separately authorized. |
| Manual audit | Deferred until after swarm completion, per user instruction. |

**Product law:** Supported outbound handoffs use one destination-aware path.
The destination ID is data, not a branch-specific display convention. Center
`C` and Tower use the same pending/accepted lifecycle; Tower-specific landing
effects happen only after acceptance. Existing eligibility, logs, movement, and
single-position trainer constraints remain intact.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-137 | T02-136 complete and current `fix/datablocks` clean |
| B | T02-138 | T02-137 merge and CI |
| C | T02-139 | T02-138 merge and CI |

**Ticket ownership:**

- T02-137: destination-aware outbound handoff initiation.
- T02-138: shared five-second simulated acceptance and destination effects.
- T02-139: shared accepted-handoff datablock UI for Center and Tower.

**Ticket files / branches:**

- `ticket/T02-137-unified-outbound-handoff-initiation` ← `phases/02-scope/tickets/T02-137-unified-outbound-handoff-initiation.md`
- `ticket/T02-138-shared-outbound-handoff-acceptance` ← `phases/02-scope/tickets/T02-138-shared-outbound-handoff-acceptance.md`
- `ticket/T02-139-shared-handoff-datablock-ui` ← `phases/02-scope/tickets/T02-139-shared-handoff-datablock-ui.md`

**Captain return:**

```text
PHASE EXIT GREEN
Phase: 2 unified outbound handoff positions T02-137–139
Merge target: fix/datablocks
Merged: T02-137, T02-138, T02-139
Tests: <focused gates and npm run ci result>
Notes: Manual audit deferred to user; C/Tower share destination-aware lifecycle
```

## Fifty-third swarm started — 2026-09-10 (Outbound handoff UI/manual alignment)

Captain owns `fix/datablocks` and will create one isolated worker at a time for
T02-135 then T02-136. The swarm strictly aligns outbound handoff datablock UI
with the supplied TI 6191.409 Rev. 30 manual, while T02-136 adds only the
approved trainer simulation of Center `C` accepting after five simulated
seconds. After each ticket, captain runs `check-stars-manual` against
`/home/ben/Documents/stars refs/full_manual.pdf` with an independent pass.

| Key | Value |
| --- | --- |
| Goal | Remove unsupported blue outbound handoff datablock UI and simulate Center C acceptance after five seconds. |
| Include | **T02-135**, **T02-136** only. |
| Skip | New handoff types, second-sector/network model, pointouts, quicklook, new SPCs, new alerts, parser, Command IR, speech, DCB, and facility branches. |
| Stop | After T02-136 acceptance, manual review, and `npm run ci`. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `fix/datablocks`. |
| Model | Inherit current session model; no speculative override. |
| Push | No push unless separately authorized. |

**Product law:** Manual display semantics win. Initiated outbound handoffs
retain a white sender FDB with receiver TCP `C`; accepted handoffs blink white
for five seconds, retain `C` for five seconds, then remain solid white without
automatic PDB/LDB collapse. T02-136’s five-second Center acceptance is an
explicit trainer delta and must call existing acceptance logic exactly once.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-135 | T02-134 complete and current `fix/datablocks` clean |
| B | T02-136 | T02-135 merge, CI, and manual review |

**Ticket ownership:**

- T02-135: manual-aligned pending outbound handoff datablock color.
- T02-136: simulated Center acceptance timing and post-acceptance UI.

**Ticket files / branches:**

- `ticket/T02-135-manual-outbound-handoff-color` ← `phases/02-scope/tickets/T02-135-manual-outbound-handoff-color.md`
- `ticket/T02-136-simulated-center-handoff-acceptance` ← `phases/02-scope/tickets/T02-136-simulated-center-handoff-acceptance.md`

**Captain return:**

```text
PHASE EXIT GREEN
Phase: 2 outbound handoff UI/manual alignment T02-135–136
Merge target: fix/datablocks
Merged: T02-135, T02-136
Tests: <focused gates, manual reviews, and npm run ci result>
Notes: <manual visual leftovers; C acceptance trainer delta>
```

## Fifty-third swarm planned — 2026-09-10 (Outbound handoff UI/manual alignment)

User approved T02-135 and T02-136. T02-135 removes the unsupported blue sender
datablock while preserving handoff-to-C logic. T02-136 adds only a five-second
simulated Center acceptance using existing acceptance logic; it does not add a
second position or network model. Captain reviews each merged ticket with
`check-stars-manual` against
`/home/ben/Documents/stars refs/full_manual.pdf`, including independent
verification, before the next wave.

| Key | Value |
| --- | --- |
| Goal | Strictly align outbound handoff UI and simulate Center C acceptance. |
| Include | **T02-135**, **T02-136** only. |
| Skip | New handoff types, second-sector/network model, pointouts, quicklook, new SPCs, new alerts, parser, Command IR, speech, DCB, and facility branches. |
| Stop | After T02-136 acceptance, manual review, and `npm run ci`. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `fix/datablocks`. |
| Model | Inherit current session model; no speculative override. |
| Push | No push unless separately authorized. |

**Product law:** Manual display semantics are strict. Pending outbound sender
datablocks use white FDB presentation with receiver TCP `C`. Simulated Center
acceptance occurs once after five simulated seconds; accepted sender UI then
uses the manual’s white five-second flash/TCP window and remains white until
explicit return-to-unowned control.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-135 | T02-134 complete and current `fix/datablocks` clean |
| B | T02-136 | T02-135 merge, CI, and manual review |

**Ticket ownership:**

- T02-135: pending outbound handoff datablock color.
- T02-136: simulated Center acceptance timing and post-acceptance display.

**Ticket files / branches:**

- `ticket/T02-135-manual-outbound-handoff-color` ← `phases/02-scope/tickets/T02-135-manual-outbound-handoff-color.md`
- `ticket/T02-136-simulated-center-handoff-acceptance` ← `phases/02-scope/tickets/T02-136-simulated-center-handoff-acceptance.md`

## Fifty-second swarm started — 2026-09-10 (Accepted outbound handoff UI)

Captain owns `fix/datablocks` and will create one isolated worker for the
approved T02-134 ticket. The ticket preserves existing handoff logic to the
configured Center sector (`C`) and aligns only the visible accepted-handoff
datablock UI with the supplied TI 6191.409 Rev. 30 manual. After completion,
captain runs `check-stars-manual` against
`/home/ben/Documents/stars refs/full_manual.pdf` with an independent
verification pass, then runs final CI and stops.

| Key | Value |
| --- | --- |
| Goal | Align accepted outbound handoff datablock presentation with the supplied manual. |
| Include | **T02-134** only. |
| Skip | Handoff state/acceptance logic, multi-position simulation, new handoff types, pointouts, quicklook, networking, new SPCs, new alerts, parser, Command IR, speech, DCB, and facility branches. |
| Stop | After T02-134 acceptance, manual review, and `npm run ci`. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `fix/datablocks`. |
| Model | Inherit current session model; no speculative override. |
| Push | No push unless separately authorized. |

**Product law:** Existing outbound handoff logic remains authoritative. The
UI shows the accepted handoff as a white FDB; the receiver TCP remains visible
for five seconds after acceptance, then disappears. The UI does not invent a
receiver position or alter ownership state.

**Wave:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-134 | Current `fix/datablocks` is clean and T02-133 is complete |

**Ticket ownership:**

- T02-134: accepted outbound handoff datablock UI and rendering tests.

**Ticket file / branch:**

- `ticket/T02-134-accepted-outbound-handoff-ui` ← `phases/02-scope/tickets/T02-134-accepted-outbound-handoff-ui.md`

**Captain return:**

```text
PHASE EXIT GREEN
Phase: 2 accepted outbound handoff UI T02-134
Merge target: fix/datablocks
Merged: T02-134
Tests: <focused gate, manual review, and npm run ci result>
Notes: <manual visual leftovers; handoff logic unchanged>
```

## Fifty-second swarm planned — 2026-09-10 (Accepted outbound handoff UI)

User approved T02-134 after research against the supplied TI 6191.409 Rev. 30
manual. The ticket changes visible accepted outbound handoff datablock UI only;
existing handoff routing to Center sector `C`, acceptance state, logs, and
aircraft lifecycle remain unchanged. Captain reviews the completed ticket with
`check-stars-manual` using only
`/home/ben/Documents/stars refs/full_manual.pdf` and its independent
verification pass before final CI.

| Key | Value |
| --- | --- |
| Goal | Align accepted outbound handoff datablock UI with the manual. |
| Include | **T02-134** only. |
| Skip | Core handoff logic, C routing, multi-position simulation, new handoff types, pointouts, quicklook, networking, new SPCs, new alerts, parser, Command IR, speech, DCB, and facility branches. |
| Stop | After T02-134 acceptance, manual review, and `npm run ci`. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `fix/datablocks`. |
| Model | Inherit current session model; no speculative override. |
| Push | No push unless separately authorized. |

**Product law:** Existing handoff state remains authoritative. Accepted
outbound handoffs render as white FDBs; sender-side receiver TCP remains for
five seconds after acceptance, then disappears. The UI does not create a
receiver position or alter core ownership/acceptance logic.

**Wave:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-134 | T02-133 complete and current `fix/datablocks` clean |

**Ticket ownership:**

- T02-134: accepted outbound handoff datablock presentation and tests.

**Ticket file / branch:**

- `ticket/T02-134-accepted-outbound-handoff-ui` ← `phases/02-scope/tickets/T02-134-accepted-outbound-handoff-ui.md`

## Fifty-first swarm planned — 2026-09-10 (Existing datablock field alignment)

User approved execution of T02-131 through T02-133 against the supplied
TI 6191.409 Rev. 30 manual. After each ticket merge, captain must run
`check-stars-manual` with the supplied PDF and an independent verification pass
before starting the next ticket. No CRC or other substitute source may be used.
No new SPCs or alert types are added.

| Key | Value |
| --- | --- |
| Goal | Align existing PDB, LDB, and FDB Field 0 presentation with the supplied STARS manual. |
| Include | **T02-131**, **T02-132**, **T02-133** only. |
| Skip | New SPCs, new alerts, MI, LL, FMA, RNP, ADS-B, pointout expansion, quicklook, TSAS runtime, networking, parser, Command IR, speech, DCB, facility branches. |
| Stop | After T02-133 acceptance, manual review, and `npm run ci`. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `fix/datablocks`. |
| Model | Inherit current session model; no speculative override. |
| Push | No push unless separately authorized. |

**Product law:** Existing datablock state maps to manual field positions.
Formatter and renderer preserve absent values, never invent operational state,
and add no new SPC or alert types. Field 0 renders separately above the
callsign. PDB and LDB use their manual-defined reduced projections. Product
remains STARS-like, not NAS-compatible.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-131 | T02-130 complete |
| B | T02-132 | T02-131 merge, CI, and manual review |
| C | T02-133 | T02-132 merge, CI, and manual review |

**Ticket ownership:**

- T02-131: PDB field projection and compatibility.
- T02-132: existing LDB SPC/safety-alert Field 0 display.
- T02-133: FDB Field 0 physical rendering and layout metrics.

**Ticket files / branches:**

- `ticket/T02-131-pdb-manual-field-projection` ← `phases/02-scope/tickets/T02-131-pdb-manual-field-projection.md`
- `ticket/T02-132-ldb-existing-field0-display` ← `phases/02-scope/tickets/T02-132-ldb-existing-field0-display.md`
- `ticket/T02-133-fdb-field0-physical-rendering` ← `phases/02-scope/tickets/T02-133-fdb-field0-physical-rendering.md`

**Captain return:**

```text
PHASE EXIT GREEN
Phase: 2 existing datablock field alignment T02-131–133
Merge target: fix/datablocks
Merged: T02-131, T02-132, T02-133
Tests: <focused gates, manual reviews, and npm run ci result>
Notes: <manual visual leftovers; no new SPC or alert types>
```

## Fifty-first swarm started — 2026-09-10 (Existing datablock field alignment)

Captain owns `fix/datablocks`, creates one isolated worker at a time, and
squash-merges each completed ticket after focused tests. After every merge,
captain runs `check-stars-manual` against
`/home/ben/Documents/stars refs/full_manual.pdf`, including its independent
verification pass, before starting the next wave. No CRC or substitute source.

## Fiftieth swarm worker started — 2026-09-10 (T02-130)

Worker executes exactly T02-130 in isolated branch/worktree
`ticket/T02-130-fdb-physical-field-alignment`, based on `fix/datablocks`. No
merge or push. Scope is limited to logical-to-physical FDB/PDB Field 0–8
alignment, Field 4 consistency, stable one-/two-character TCP cell positions,
pending/accepted inbound plus outbound/pointout coverage, and the documented
aircraft-type Line 3 delta.

## Fiftieth swarm worker started — 2026-09-10 (T02-129)

Worker executes exactly T02-129 in isolated branch/worktree
`ticket/T02-129-pending-inbound-handoff-tcp-semantics`, based on the captain
target `fix/datablocks`. No merge or push. Scope is limited to separating
inbound origin from local receiving TCP, target-symbol control, Field 4/TCP
origin display, removal of inbound `HO`, and synthetic coverage for preserved
PO/blink/filter/acceptance behavior.

## Fiftieth swarm planned — 2026-09-10 (Pending inbound datablock fidelity)

User approved execution of the pending inbound datablock fidelity plan.
Captain owns `fix/datablocks`, runs one isolated worker at a time, squash-merges
each completed ticket back onto `fix/datablocks`, commits throughout, pushes only
after the final gate, and stops at T02-130.

| Key | Value |
| --- | --- |
| Goal | Align pending inbound handoff TCP/origin semantics and physical FDB/PDB field presentation with TI 6191.409 Rev. 30. |
| Include | **T02-129**, **T02-130** only. |
| Skip | Networking, multi-user positions, redirects, TSAS runtime, ADS-B, parser, Command IR, speech, DCB, scenario data, facility branches. |
| Stop | After T02-130 acceptance and `npm run ci`. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `fix/datablocks`. |
| Model | Inherit current session model; no speculative override. |
| Push | Captain pushes `fix/datablocks` after final CI and STATUS update. |

**Product law:** Inbound origin and receiving TCP are separate values. The
receiving TCP controls the target symbol; the originating value occupies Field
4. Pending inbound status uses STARS-like FDB blinking and field placement,
not an invented `HO` suffix. No NAS compatibility claim and no facility branch.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-129 | planning commit |
| B | T02-130 | T02-129 merge and focused gate |

**Ticket ownership:**

- T02-129: inbound handoff origin/receiving TCP adapter, symbol, and pending
  FDB behavior.
- T02-130: logical-to-physical FDB/PDB mapping, aircraft-type placement
  decision, fidelity acceptance, and documentation.

**Ticket files / branches:**

- `ticket/T02-129-pending-inbound-handoff-tcp-semantics` ← `phases/02-scope/tickets/T02-129-pending-inbound-handoff-tcp-semantics.md`
- `ticket/T02-130-fdb-physical-field-alignment` ← `phases/02-scope/tickets/T02-130-fdb-physical-field-alignment.md`

**Captain return:**

```text
PHASE EXIT GREEN
Phase: 2 pending inbound datablock fidelity T02-129–130
Merge target: fix/datablocks
Merged: T02-129, T02-130
Tests: <focused gates and npm run ci result>
Notes: <aircraft-type placement decision; manual visual leftovers>
```

## Forty-ninth swarm planned — 2026-09-10 (ATPA CWT wake minima)

User approved the ATPA wake-only plan. Captain owns `fix/datablocks`, spawns
one isolated worker at a time, squash-merges each completed ticket back onto
`fix/datablocks`, runs the required focused gate after each merge, and stops
after final `npm run ci`. No push.

| Key | Value |
| --- | --- |
| Goal | Add FAA JO 7110.65 CWT wake categories, data-driven ATPA minima, and explicit NOWGT/10 NM behavior. |
| Include | **T02-125**, **T02-126**, **T02-127**, **T02-128** only. |
| Skip | ICAO-type inference, aircraft performance changes, TSAS, CRDA, networking, per-position adaptation, aural ATPA, UI redesign, live FAA downloads. |
| Stop | After T02-128 acceptance and `npm run ci`. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `fix/datablocks`. |
| Model | Inherit current session model; no speculative override. |

**Product law:** Operational CWT category data is separate from display
category letters. The evaluator uses leader-row/follower-column adaptation
data. Missing required category or blank required matrix cell produces
`NOWGT` and `10 NM`. Wake minima never fall below applicable volume radar
minima. No facility or ICAO-type branch.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-125 | planning commit |
| B | T02-126 | T02-125 merge and focused gate |
| C | T02-127 | T02-126 merge and focused gate |
| D | T02-128 | T02-127 merge and focused gate |

**Ticket ownership:**

- T02-125: CWT category type and aircraft contract.
- T02-126: FAA wake matrix data, schema, and NOWGT adaptation.
- T02-127: pure wake-aware ATPA evaluator and world state.
- T02-128: acceptance, regression updates, and documentation.

**Ticket files / branches:**

- `ticket/T02-125-atpa-cwt-category-contract` ← `phases/02-scope/tickets/T02-125-atpa-cwt-category-contract.md`
- `ticket/T02-126-atpa-faa-wake-matrix-and-nowgt` ← `phases/02-scope/tickets/T02-126-atpa-faa-wake-matrix-and-nowgt.md`
- `ticket/T02-127-atpa-wake-aware-evaluator` ← `phases/02-scope/tickets/T02-127-atpa-wake-aware-evaluator.md`
- `ticket/T02-128-atpa-wake-acceptance-and-docs` ← `phases/02-scope/tickets/T02-128-atpa-wake-acceptance-and-docs.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 ATPA CWT wake minima T02-125–128
Merge target: fix/datablocks
Merged: T02-125, T02-126, T02-127, T02-128
Tests: <focused gates and npm run ci result>
Notes: <NOWGT policy; remaining manual leftovers>
```

## Forty-ninth swarm started — 2026-09-10 (ATPA CWT wake minima)

Captain start/configuration confirmed after planning. This swarm runs
T02-125 through T02-128 sequentially on `fix/datablocks`, with one isolated
worker at a time and captain-owned squash merges. `NOWGT` plus `10 NM` is the
approved policy for missing required categories and blank required matrix
cells. No push.

## Forty-eighth swarm started — 2026-09-10 (Datablock field-format fidelity)

User authorized execution using isolated subagents after the planning addendum
below. Captain owns `fix/datablocks`, creates one isolated worker at a time,
implements T02-122 then T02-123/T02-124, squash-merges each completed ticket,
and stops at the configured boundary. No push.

## Forty-eighth swarm planned — 2026-09-10 (Datablock field-format fidelity)

User-approved format-model work follows Figure 2-20 supplied in chat. This
swarm defines explicit Fields 0–8, Field 5 data grammar, TSAS/exit-gate/fix
format inputs, duplicate-beacon formatting, and one-/two-character TCPs. It
does not implement missing simulation subsystems.

| Key | Value |
| --- | --- |
| Goal | Align STARS-like FDB/PDB format logic with Figure 2-20 using a generic explicit field model. |
| Include | **T02-122**, **T02-123**, **T02-124** only. |
| Skip | Field 1 ADS-B markers, new Field 2 glyphs, TSAS scheduling, ADS-B detection, MOA/CSMM workflows, beacon selection, parser, Command IR, DCB, networking, facility branches. |
| Stop | After T02-123 and T02-124 focused gates plus `npm run ci`. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `fix/datablocks`. |
| Model | `gpt-5.6-luna`, medium reasoning. |

**Product law:** Formatter consumes explicit generic datablock fields. It
preserves documented literals, omits absent values, never guesses missing
operational state, and never adds facility-specific branches. Synthetic fixtures
may populate format-only values not yet produced by runtime logic.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-122 | planning commit |
| B | T02-123, T02-124 | T02-122 merge and focused gate |

**Ticket ownership:**

- T02-122: explicit Fields 0–5, Field 5 alternatives, exit gate/fix input,
  TSAS sequence input, tests.
- T02-123: Fields 6–8, TSAS indicator inputs, duplicate-beacon distinction,
  tests, runtime-gap documentation.
- T02-124: one-/two-character TCP adaptation and tests.

**Ticket files / branches:**

- `ticket/T02-122-datablock-explicit-fields-0-5` ← `phases/02-scope/tickets/T02-122-datablock-explicit-fields-0-5.md`
- `ticket/T02-123-datablock-fields-6-8-and-tsas` ← `phases/02-scope/tickets/T02-123-datablock-fields-6-8-and-tsas.md`
- `ticket/T02-124-datablock-tcp-width` ← `phases/02-scope/tickets/T02-124-datablock-tcp-width.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 datablock field-format fidelity T02-122–124
Merge target: fix/datablocks
Merged: T02-122, T02-123, T02-124
Tests: <focused gates and npm run ci result>
Notes: <format-only fields; runtime-backed gaps; manual leftovers>
```

## Forty-seventh swarm planned — 2026-09-09 (Balanced random arrival packs)

| Key | Value |
| --- | --- |
| Goal | Seeded random arrival packs traverse scenario route pools before repeating. |
| Include | **T04-59** only. |
| Skip | New route data, camera/UI, entry geometry, departure logic, facility branches. |
| Stop | After T04-59 CI. |
| Max workers | 1 |
| Merge lock | Orchestrator squash-merges to `feature/aircraft-performance`. |
| Model | `gpt-5.6-luna`, medium reasoning. |

**Product law:** Random means deterministic seed variation over scenario-owned
choices, not accidental concentration on a primary route. Each route-pool
entry is used before a pack repeats any entry.

**Wave:** A — T04-59 after T04-58.

**Ticket:** `ticket/T04-59-balanced-random-arrival-route-packs` ←
`phases/04-procedures/tickets/T04-59-balanced-random-arrival-route-packs.md`.

**Captain return:**

```
PHASE EXIT GREEN
Phase: 4 balanced random arrival packs T04-59
Merge target: feature/aircraft-performance
Merged: T04-59
Tests: <focused gates and npm run ci result>
Notes: <KATL pack route spread>
```

## Forty-sixth swarm planned — 2026-09-09 (Random arrival entry fixes)

| Key | Value |
| --- | --- |
| Goal | Make random arrival entry fixes scenario-defined and terminal-visible. |
| Include | **T04-58** only. |
| Skip | Camera auto-range, arbitrary coordinate spawn, live traffic, departure changes, parser/UI, facility branches. |
| Stop | After T04-58 CI. |
| Max workers | 1 |
| Merge lock | Orchestrator squash-merges to `feature/aircraft-performance`. |
| Model | `gpt-5.6-luna`, medium reasoning. |

**Product law:** A scenario owns the eligible STAR, transition, and entry fix.
Random generation starts on the remaining published route at that fix; it does
not infer a terminal spawn from a facility-wide catalog or fly outward to an
earlier fix.

**Wave:** A — T04-58 after T04-57.

**Ticket:** `ticket/T04-58-random-arrival-entry-fixes` ←
`phases/04-procedures/tickets/T04-58-random-arrival-entry-fixes.md`.

**Captain return:**

```
PHASE EXIT GREEN
Phase: 4 random arrival entry fixes T04-58
Merge target: feature/aircraft-performance
Merged: T04-58
Tests: <focused gates and npm run ci result>
Notes: <KATL initial-route visibility result>
```

## Forty-fifth swarm planned — 2026-09-09 (Scenario random route pools)

| Key | Value |
| --- | --- |
| Goal | Make scenario-declared arrival/departure route pools and first-load traffic defaults authoritative for random traffic. |
| Include | **T04-57** only. |
| Skip | Live schedules/airline data, procedure imports, parser/UI redesign, OpenAP, compatibility aliases, facility branches. |
| Stop | After T04-57 CI. |
| Max workers | 1 |
| Merge lock | Orchestrator squash-merges to `feature/aircraft-performance`. |
| Model | `gpt-5.6-luna`, medium reasoning. |

**Product law:** A random scenario samples only its declared STAR/SID pools;
the catalog validates and executes those routes but never becomes an implicit
all-procedure pool. On a clean boot, selected scenario defaults apply before
global fallbacks. Stored user setup and valid URL overrides remain explicit
higher-precedence intent. No airport-specific code paths.

**Wave:** A — T04-57 after T04-56.

**Ticket:** `ticket/T04-57-scenario-random-route-pools-and-boot-defaults` ←
`phases/04-procedures/tickets/T04-57-scenario-random-route-pools-and-boot-defaults.md`.

**Captain return:**

```
PHASE EXIT GREEN
Phase: 4 scenario random route pools T04-57
Merge target: feature/aircraft-performance
Merged: T04-57
Tests: <focused gates and npm run ci result>
Notes: <first-load and route-pool contract; manual browser result>
```

## Forty-fourth swarm planned — 2026-09-09

One Luna-medium worker owns T04-56 only. Merge target: `feature/aircraft-performance`.
Arrival policy is `random|authored`; departure policy is `none|random|authored`.
KATL scenarios use arrival `random`. Stop after T04-56 CI; no compatibility aliases.

# ATC-SIM swarm orchestrator — Forty-third swarm (Random Airline Aircraft Traffic)

## Forty-third swarm planned — 2026-09-09

| Key | Value |
| --- | --- |
| Goal | Generated scenario traffic uses deterministic valid airline/aircraft pairs. |
| Include | **T04-55** only. |
| Skip | Fleet sources, provenance, APIs, per-engine variants, authored scenario changes, parser/UI/profile changes. |
| Stop | After T04-55 and CI. |
| Max workers | 1 |
| Merge lock | Orchestrator squash-merges to `feature/aircraft-performance`. |
| Model | `gpt-5.6-luna`, medium reasoning. |

**Product law:** roster rows contain only airline ICAO/name and exact valid
types. Seeded generation chooses one eligible pair before allocating a callsign;
no independent airline/type sampling. Authored scenarios stay authored.

# ATC-SIM swarm orchestrator — Forty-second swarm (Aircraft Performance Profiles)

## Forty-second swarm planned — 2026-09-09 (Aircraft Performance Profiles)

User-approved aircraft-performance follow-up: build a pinned offline
Python/OpenAP profile generator, commit immutable generated profile JSON, then
consume it through generic deterministic kinematics. This plan creates tickets
and freezes execution order; it does not launch workers.

| Key | Value |
| --- | --- |
| Goal | Per-ICAO, auditable aircraft-performance profiles generated offline and consumed by generic 20 Hz kinematics. |
| Include | **T04-51**, **T04-52**, **T04-53**, **T04-54** only. |
| Source | User-approved data contract; OpenAP WRAP handbook and repository. |
| Skip | Runtime Python/OpenAP/network fetch; per-engine runtime variants; mass/fuel/flaps/stall; wind; wake separation; profile-aware alerts; parser/UI/scenario branches. |
| Stop | After T04-54 acceptance and final CI. No later phase. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `feature/aircraft-performance`, then runs focused gates and `npm run ci` after each ticket. |
| Model | `gpt-5.6-luna`, medium reasoning. |

**Product law:**

- Runtime imports committed JSON plus a TypeScript `DEFAULT_PROFILE`; it never
  imports Python/OpenAP, parses source datasets, or fetches a network resource.
- `Aircraft.aircraftType` is the sole runtime lookup key. Scenario data never
  provides engines or performance values. Missing, unknown, and `UNRESOLVED`
  types use only the explicit default profile.
- One mapping row selects one representative airframe/engine per ICAO key.
  Initial preset `terminal-v1` includes B737/B738/B739/B752/B753/B744/B788/B789/B78X,
  A320/A321/A20N/A21N/A333, E135/E140/E145/E170/E175/E190/E195/E290/E295,
  CRJ1/CRJ2/CRJ7/CRJ9/CRJX, and B38M/B39M/B763/B772/B77W. CLI `--types`
  supports any mapped, caller-supplied ICAO set.
- OpenAP measurements/statistical envelopes, transformations, and simulator
  policy retain separate field-level provenance. No profile claims certification.
- Profile/regime resolution and kinematics/FMS behavior are generic: no
  airport, runway, procedure, scenario, callsign, or aircraft-type conditional
  outside the data registry.
- The physical turn, fly-by radius, and localizer lead calculation use one
  resolved turn constraint. Alert prediction remains its existing conservative
  policy until a later explicit ticket.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T04-51 | planning commit |
| B | T04-52 | T04-51 merge and focused gate |
| C | T04-53 | T04-52 merge and focused gate |
| D | T04-54 | T04-53 merge and focused gate |

**Ticket ownership:**

- T04-51: pinned offline generator, mappings/policies, provenance, generated
  artifact, CLI, and generator tests.
- T04-52: strict runtime types, registry/default fallback, generic regime
  resolver, and tests.
- T04-53: profile-driven kinematics plus FMS turn/vertical plumbing and tests.
- T04-54: reproducibility/CI/data-contract/world acceptance and documentation.

**Ticket files / branches:**

- `ticket/T04-51-openap-profile-generator-and-data-contract` ← `phases/04-procedures/tickets/T04-51-openap-profile-generator-and-data-contract.md`
- `ticket/T04-52-performance-registry-and-regime-resolution` ← `phases/04-procedures/tickets/T04-52-performance-registry-and-regime-resolution.md`
- `ticket/T04-53-profile-driven-kinematics-and-fms-turns` ← `phases/04-procedures/tickets/T04-53-profile-driven-kinematics-and-fms-turns.md`
- `ticket/T04-54-performance-pipeline-acceptance-and-ci` ← `phases/04-procedures/tickets/T04-54-performance-pipeline-acceptance-and-ci.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 4 procedures aircraft performance profiles T04-51–54
Merge target: feature/aircraft-performance
Merged: T04-51, T04-52, T04-53, T04-54
Tests: <focused tests and npm run ci result>
Notes: <OpenAP version; initial-preset support/unresolved rows; provenance/license review; manual leftovers>
```

## Forty-second swarm started — 2026-09-09

User authorized execution on a new `feature/aircraft-performance` merge target
cut from the planning commit. One `gpt-5.6-luna` worker at medium reasoning
runs in an isolated ticket worktree at a time: T04-51, focused gate and captain
squash merge; then T04-52; then T04-53; then T04-54. Captain owns every merge,
runs `npm run ci` after every ticket, and runs the pinned Python profile gate
when its dependencies are available. No push, no profile-aware alert work, no
later phase, and no work outside these four tickets. Workers return only
`READY TO MERGE` or `BLOCKED`; captain returns only `PHASE EXIT GREEN` or
`PHASE EXIT BLOCKED`.

## Forty-second swarm resumed — 2026-09-09

User explicitly authorized a fresh orchestration attempt after the prior
worker-spawn capability report. The same approved tickets, merge target,
single-worker limit, waves, `gpt-5.6-luna` medium model, and stop boundary
remain unchanged. This resume supersedes only the capability block: the
orchestrator will create one captain; the captain must create one isolated
ticket worker at a time. If that worker capability is unavailable again, stop
without substituting an unisolated implementation.

## Forty-second swarm orchestration override — 2026-09-09

User clarified that the root orchestrator may directly spawn the configured
isolated `gpt-5.6-luna` medium ticket workers because child captains lack the
collaboration-spawn capability in this session. The orchestrator holds the
merge lock for `feature/aircraft-performance`, creates at most one ticket
worktree/worker at a time, squash-merges only completed worker branches, runs
the required gates after each merge, and updates status. All ticket scope,
waves, stop boundary, no-push rule, and worker leaf restrictions remain
unchanged. This is a session capability routing override only.

# ATC-SIM swarm orchestrator — Forty-first swarm (Magnetic Heading Frames)

## Forty-first swarm planned — 2026-09-08 (Magnetic Heading Frames)

User-approved heading-frame migration follows the ILS lead-capture swarm.
Controller-facing headings and published courses are magnetic; all ENU/world
geometry is true. This plan only creates tickets and freezes their order. It
does not launch workers or start implementation.

| Key | Value |
| --- | --- |
| Goal | Make magnetic command/published-heading data and true ENU geometry explicit, generic, and testable. |
| Include | **T04-48**, then **T04-49**, then **T04-50** only. |
| Source | User-approved heading-frame contract; existing Phase 4 catalog/FMS architecture. |
| Skip | Wind/crab, new parser grammar or phraseology, ILS signal-envelope redesign, map-art changes, facility-specific behavior, CIFP import changes. |
| Stop | After T04-50 acceptance. No later phase. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `feature/ils-guidance`, then runs focused tests and `npm run ci` after each ticket. |
| Model | `gpt-5.6-luna`, medium reasoning. |

**Heading-frame law:**

- Commands, parser, speech/readback, displayed aircraft heading, and published
  procedure courses are magnetic degrees. `true = magnetic + magVarDeg`.
- ENU x/y, runway and map line geometry, LOC/GS math, PTL, predicted motion,
  conflict/ATPA geometry, and all bearing calculations used for geometry are
  true degrees.
- `magVarDeg` belongs to generic core world navigation context, never an
  implicit KDEM-zero assumption or airport/facility branch. KDEM at 0 degrees
  remains behaviorally unchanged.
- True/magnetic conversions are named helpers. Geometry and command fields
  must not retain an ambiguous bare `courseDeg` when both frames exist.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T04-48 | planning commit |
| B | T04-49 | T04-48 merge and focused gate |
| C | T04-50 | T04-49 merge and focused gate |

**Ticket ownership:**

- T04-48: contract, typed conversions, generic world/catalog `magVarDeg`
  plumbing, and zero/plus/minus variation unit coverage.
- T04-49: magnetic-command-to-true-motion, direct/procedure bearings, LOC/GS
  dual-axis migration, PTL and alert prediction migration, generic behavior
  tests.
- T04-50: KATL ILS 26R scenario-level intercept regression and KDEM
  non-regression acceptance only.

**Ticket files / branches:**

- `ticket/T04-48-heading-frame-contract-and-world-magvar` ← `phases/04-procedures/tickets/T04-48-heading-frame-contract-and-world-magvar.md`
- `ticket/T04-49-heading-frame-navigation-migration` ← `phases/04-procedures/tickets/T04-49-heading-frame-navigation-migration.md`
- `ticket/T04-50-katl-ils26r-heading-frame-acceptance` ← `phases/04-procedures/tickets/T04-50-katl-ils26r-heading-frame-acceptance.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 4 procedures magnetic heading frames T04-48–50
Merge target: feature/ils-guidance
Merged: T04-48, T04-49, T04-50
Tests: <focused tests and npm run ci result>
Notes: <magnetic controller contract; true ENU geometry; KATL 26R capture; KDEM 0-degree regression>
```

## Forty-first swarm started — 2026-09-08

User authorized implementation. The prior completed ILS guidance swarm makes
`feature/ils-guidance` the required merge target and base; do not reset or
rebase it onto `master`. One `gpt-5.6-luna` worker runs in an isolated ticket
worktree at a time: T04-48, focused gate and captain squash merge; then T04-49;
then T04-50. Captain owns every merge and runs `npm run ci` after each merge.
No push, no later phase, and no work outside these tickets. Workers return only
`READY TO MERGE` or `BLOCKED`; captain returns only `PHASE EXIT GREEN` or
`PHASE EXIT BLOCKED`.

# ATC-SIM swarm orchestrator — Fortieth swarm (ILS Signal Envelopes and Lead Capture)

## Fortieth swarm planned — 2026-09-08 (ILS Signal Envelopes and Lead Capture)

User-approved procedures follow-up: replace fixed localizer/glidepath capture
windows with data-driven ILS full-scale envelopes, then remove rate-limited
localizer fly-through with predictive lead capture and cross-track tracking.
Captain squash-merges ticket branches into `master`. Do not push.

| Key | Value |
| --- | --- |
| Goal | Full-scale ILS signal geometry and non-fly-through LOC intercept/tracking. |
| Include | **T04-46**, then **T04-47** only. |
| Source | FAA AIM 1-1-9; FAA JO 7110.65 5-9-2; R01. |
| Skip | Wind/crab, ILS instruments/needles, false lobes, autoland/flare, RNAV, parser/readback changes, runway/facility branches. |
| Stop | After T04-47 acceptance. No later phase. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `master`, then runs focused tests and `npm run ci` after each ticket. |
| Model | Session default model. |

**Product law:**

- Localizer full scale is 700 ft total / 350 ft per side at threshold and
  widens by range. GS full scale is 1.4 deg total / plus-or-minus 0.7 deg
  about catalog centerline, normally 3.0 deg. Both are data-driven trainer
  guidance envelopes, not certified radio-propagation models.
- Existing angular `beamHalfWidthDeg` remains compatible catalog data; no
  video-map feather becomes navigation truth and no airport/runway branch is allowed.
- Lead turn uses existing rate-limited kinematics. No direct heading snap at
  LOC capture. LOC-first, GS-from-below, and heading-cancels-APP remain.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T04-46 | planning commit |
| B | T04-47 | T04-46 merge and focused gate |

**Ticket ownership:**

- T04-46: generic schema/defaults, LOC/GS full-scale geometry, FMS envelope
  policy, data contracts, and focused DOM-free tests.
- T04-47: rate-limited lead prediction, bounded LOC cross-track tracking,
  breakout/re-arm behavior, full-world synthetic vector acceptance, and README wording.

**Ticket files / branches:**

- `ticket/T04-46-ils-signal-envelope-geometry` ← `phases/04-procedures/tickets/T04-46-ils-signal-envelope-geometry.md`
- `ticket/T04-47-lead-turn-localizer-capture-and-tracking` ← `phases/04-procedures/tickets/T04-47-lead-turn-localizer-capture-and-tracking.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 4 procedures ILS signal envelopes and lead capture T04-46–47
Merge target: master
Merged: T04-46, T04-47
Tests: <focused tests and npm run ci result>
Notes: <700-ft LOC / 1.4-deg GS envelopes; rate-limited lead capture; no facility branch>
```

## Fortieth swarm started — 2026-09-08

Execution is user-authorized on `feature/ils-guidance`, cut from planning
commit `42cd7dc`; this start record overrides the planned `master` merge target.
One worker operates at a time in an isolated worktree. The captain squash-merges
T04-46, runs its focused tests plus `npm run ci`, then starts T04-47 from the
updated feature branch. No push, no later phase, and no work outside these two
tickets. Worker handoff is exactly `READY TO MERGE` or `BLOCKED`; captain
handoff is exactly `PHASE EXIT GREEN` or `PHASE EXIT BLOCKED`.

# ATC-SIM swarm orchestrator — Thirty-ninth swarm (MSAW MULTI FUNC Q/V)

## Thirty-ninth swarm planned — 2026-09-07 (MSAW MULTI FUNC Q/V)

T02-120 resumes after its prior CI gate was repaired. User clarified the
existing MULTI FUNC entry: `*` is MULTI FUNC, so `*Q` and `*V`, followed by a
slew/click, are required. They remain Preview-area scope controls, never radio
commands. One worker owns T02-120 and captain squash-merges into
`feature/stars-ca-alignment`. Do not push.

| Key | Value |
| --- | --- |
| Goal | Implement `*Q` current-alert-only and `*V` persistent MSAW inhibition. |
| Include | **T02-120** only, with this exact input clarification. |
| Source | TI 6191.409 Rev. 30 §§7.14–7.15; R01/R02/R05/R07. |
| Skip | Other MULTI FUNC grammar; MCI; supervisor/facility controls; MSAW geometry; Command IR. |
| Stop | After T02-120 acceptance. No later phase. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `feature/stars-ca-alignment`, then runs focused tests and `npm run ci`. |
| Model | Session default model. |

**Product law:**

- `*Q` / `*V` are exact MULTI FUNC Preview inputs, then selected-track slew;
  no literal-radio command or unrelated shorthand is added.
- `*Q` suppresses only current selected MSAW alert and clears with it. `*V`
  persistently toggles selected-track MSAW processing. Neither acknowledges.
- Generic ScopeView-local trainer state only; no certified MSAW claim, no
  facility branch, no Command IR.

**Wave:** A — T02-120 after planning commit.

**Ticket / branch:**

- `ticket/T02-120-msaw-multifunc-q-v` ← `phases/02-scope/tickets/T02-120-msaw-multifunc-q-v.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope MSAW MULTI FUNC Q/V T02-120
Merge target: feature/stars-ca-alignment
Merged: T02-120
Tests: <focused tests and npm run ci result>
Notes: <*Q current-only; *V persistent; no Command IR>
```

## Thirty-ninth swarm started — 2026-09-07

Planning frozen: one worker, T02-120 only, exact `*Q`/`*V` Preview grammar,
merge target `feature/stars-ca-alignment`, no push. Worker uses an isolated
worktree and returns only `READY TO MERGE` or `BLOCKED`; captain gates merge
with focused tests and `npm run ci`.

# ATC-SIM swarm orchestrator — Thirty-eighth swarm (WX VIP Availability)

## Thirty-eighth swarm planned — 2026-09-07 (WX VIP Availability)

User-approved follow-up: MAIN `WX1`–`WX6` show bottom-line `AVL` exactly when
the current N0Q mosaic has one or more pixels in that corresponding VIP mask.
N0Q fetches at boot and every five minutes even while all WX display latches
are off. One worker owns this small integrated WX/DCB ticket; captain
squash-merges into `feature/stars-ca-alignment`. Do not push.

| Key | Value |
| --- | --- |
| Goal | Truthful per-VIP `AVL` DCB indication with unconditional five-minute N0Q refresh. |
| Include | **T02-121** only. |
| Source | R07 CRC/vNAS STARS DCB BRITE WX; T02-68 N0Q/VIP architecture. |
| Skip | NEXRAD source/proxy/decoding changes; WX paint/BRITE/WXC/history/wind/deviation; PREF; Command IR; DCB redesign. |
| Stop | After T02-121 acceptance. No later phase. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `feature/stars-ca-alignment`, then runs focused tests and `npm run ci`. |
| Model | Session default model. |

**Product law:**

- `AVL` is per packed VIP mask: displayed iff that level has at least one
  pixel; it is never inferred from WX latch state or another level.
- N0Q fetch/refresh is independent of WX display latches, remains one
  in-flight request per view, non-blocking, failure-safe, and CI-fixture-only.
- WX latches remain display-only and DCB never emits Command IR. No airport or
  facility branch.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-121 | planning update |

**Ticket ownership:** T02-121 owns unconditional N0Q cadence, pure VIP-mask
availability, WX cap second-line rendering, and focused generic tests.

**Ticket / branch:**

- `ticket/T02-121-wx-vip-availability-and-unconditional-refresh` ← `phases/02-scope/tickets/T02-121-wx-vip-availability-and-unconditional-refresh.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope WX VIP availability T02-121
Merge target: feature/stars-ca-alignment
Merged: T02-121
Tests: <focused tests and npm run ci result>
Notes: <all-off five-minute fetch; per-mask AVL; latches/Command IR unchanged>
```

## Thirty-eighth swarm started — 2026-09-07

Planning is frozen: T02-121 is the only ticket, uses one worker, merges only
to `feature/stars-ca-alignment`, and does not push. The worker starts from the
planning commit on that merge target, works in its isolated ticket worktree,
and returns only `READY TO MERGE` or `BLOCKED`. Captain runs focused WX/DCB
tests and `npm run ci` after squash merge; existing unrelated test failures
must be reported, not repaired outside this ticket.

# ATC-SIM swarm orchestrator — Thirty-seventh swarm (Controller CA/MSAW Controls)

## Thirty-seventh swarm planned — 2026-09-07 (Controller CA/MSAW Controls)

User-approved normal-controller follow-up: retire non-manual `CA E`, make
`CA P` state-dependent, add `CA C` / `CA C E|I`, and implement the manual
`<MULTI FUNC> Q/V` MSAW slew controls. This is not authorization for MCI or
supervisor/facility commands. One Luna worker runs one ticket at a time because
both tickets touch Scope preview grammar and state. Captain squash-merges into
`feature/stars-ca-alignment`; do not push.

| Key | Value |
| --- | --- |
| Goal | Manual-correct controller CA pair controls and MSAW Q/V controls. |
| Include | **T02-119**, then **T02-120**. |
| Source | TI 6191.409 Rev. 30 §§7.11–7.15, pp. 7-21–7-26; R01/R02/R05/R07. |
| Skip | `CA M`; MCI detection/lists; §8.1 and §8.3 supervisor/facility controls; all other MULTI FUNC grammar; CA/MSAW detection thresholds. |
| Stop | After T02-120 acceptance. No later phase. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `feature/stars-ca-alignment`; after each merge runs focused tests and `npm run ci`. |
| Model | `gpt-5.6-luna`, medium reasoning. |

**Product law:**

- `CA P` is the sole explicit pair operation: absent pair inhibition becomes
  inhibited; present pair inhibition becomes enabled. `CA E` is rejected.
- Bare `CA C` toggles, and `CA C I` / `CA C E` force, the qualifying-pair
  state where both tracks are owned by the entering controller. They never
  alter `CA K` state or nonqualifying pairs.
- `<MULTI FUNC> Q` suppresses only the current selected MSAW alert and clears
  with it. `<MULTI FUNC> V` persistently toggles selected-track MSAW
  processing. Neither is an acknowledgement or literal `*Q` / `*V` Preview
  alias; `*LA` remains altitude filter only.
- This is trainer-local state, never certified NAS/system-wide MSAW or CA.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-119 | planning update |
| B | T02-120 | T02-119 merge and gate |

**Ticket ownership:**

- T02-119: CA P grammar migration, CA E retirement, controller-owned-pair
  `CA C` / `CA C E|I` state/action/tests plus `docs/USER.md` and Phase 2
  README updates where command wording changed.
- T02-120: minimal MULTI FUNC Q/V grammar, MSAW current/persistent inhibit
  state/lifecycle/presentation/tests, `docs/USER.md` and Phase 2 README
  updates where command wording changed, and backlog correction.

**Ticket files / branches:**

- `ticket/T02-119-ca-p-grammar-and-controller-pair-controls` ← `phases/02-scope/tickets/T02-119-ca-p-grammar-and-controller-pair-controls.md`
- `ticket/T02-120-msaw-multifunc-q-v` ← `phases/02-scope/tickets/T02-120-msaw-multifunc-q-v.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope controller CA/MSAW controls T02-119–120
Merge target: feature/stars-ca-alignment
Merged: T02-119, T02-120
Tests: <focused tests and npm run ci result>
Notes: <CA P toggle/CA E rejection; CA C/C E/I scope; Q current-only and V persistent lifecycle; README updates>
```

## Thirty-seventh swarm started — 2026-09-07

Configuration amended before launch: bare `CA C Enter` is in scope as the
manual §7.13 toggle; `CA C E/I` are its force-state forms. Both tickets must
update `docs/USER.md` and the applicable Phase 2 README command/checklist
wording where their observable grammar changes. This start record freezes the
approved scope, wave order, Luna model, single-worker limit, merge target, and
no-push rule above. Planning commit precedes all ticket branches/worktrees.

# ATC-SIM swarm orchestrator — Thirty-fourth swarm (STARS Conflict Alert Alignment)

## Thirty-sixth swarm planned — 2026-09-07 (CA Pair-Inhibit Manual Correction)

Manual review of TI 6191.409 §7.10–7.11 corrected the prior T02-117 display
interpretation. `CA` is a one-slew toggle for an existing conflict/pairwise
inhibit; `CA P` accepts two selected tracks, each by ACID entry or slew. Both
commands remove CA presentation for the pair and show normal inline `Δ` on both
member datablocks. One Luna worker owns T02-118 in an isolated worktree; captain
squash-merges to `feature/stars-ca-alignment`. Do not push.

| Key | Value |
| --- | --- |
| Goal | Restore manual-correct pair-inhibit `Δ` presentation and verify `CA P` two-slew behavior. |
| Include | **T02-118** only. |
| Source | TI 6191.409 §7.10 pp. 7-19–7-20; §7.11 p. 7-21; §2.16.3/Table 2-26. |
| Acceptance | `CA` one-slew and `CA P` two-slew both suppress only that pair's CA Line 0/list/tone and show normal inline `Δ` on both pair members. A separate active pair sharing a track remains visible/listed/audible. `CA E` restores presentation. |
| Skip | CA detection, MSAW/MCI behavior, list layout redesign, and unrelated fixes. |
| Stop | After T02-118 acceptance. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `feature/stars-ca-alignment`, then runs focused tests and `npm run ci`. |
| Model | `gpt-5.6-luna`, medium reasoning. |

**Ticket:** `phases/02-scope/tickets/T02-118-ca-pair-inhibit-manual-correction.md`
on `ticket/T02-118-ca-pair-inhibit-manual-correction`.

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope CA pair-inhibit manual correction T02-118
Merge target: feature/stars-ca-alignment
Merged: T02-118
Tests: <focused tests and npm run ci result>
Notes: <CA / CA P slew behavior; pair Δ; shared-pair isolation>
```

## Thirty-fifth swarm planned — 2026-09-07 (CA Pair-Inhibit Presentation)

Follow-up to the completed Thirty-fourth swarm. The merge target remains
`feature/stars-ca-alignment`; no work starts a later phase. One Luna worker
owns T02-117 in an isolated ticket branch/worktree; captain squash-merges only
after acceptance. Do not push.

| Key | Value |
| --- | --- |
| Goal | Make CA pair inhibits disable the same alert presentation as a track inhibit. |
| Include | **T02-117** only. |
| Source | TI 6191.409 §2.16.3/Table 2-26: disabled CA alert presentation; §2.15.3 alert list. |
| Acceptance | For an inhibited pair only: no red Line 0 `CA` on either member, no CA AL-list row, and no CA tone. `Δ` remains exclusively the track-level CA-disabled symbol; pair suppression has no separate datablock glyph. Other active pairs sharing either aircraft remain alerting. Re-enable restores the pair alert if the condition persists. |
| Skip | CA detection thresholds, MSAW/MCI semantics, command grammar, broad alert-list redesign, and unrelated dirty work. |
| Stop | After T02-117 acceptance. |
| Max workers | 1 |
| Merge lock | Captain squash-merges to `feature/stars-ca-alignment`, then runs focused tests and `npm run ci`. |
| Model | `gpt-5.6-luna`, medium reasoning. |

**Ticket:** `phases/02-scope/tickets/T02-117-ca-pair-inhibit-presentation.md` on
`ticket/T02-117-ca-pair-inhibit-presentation`.

**Manual clarification:** TI 6191.409 §2.16.3/Table 2-26 defines `Δ` only as
“CA alerts disabled for this track.” The manual preserves CA pair-suppression
settings (p. 7-14) but specifies no pair-only glyph. Therefore pair suppression
does not borrow the track-level `Δ` symbol.

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope CA pair-inhibit presentation T02-117
Merge target: feature/stars-ca-alignment
Merged: T02-117
Tests: <focused tests and npm run ci result>
Notes: <pair suppression for Line 0/list/tone; Δ shown; other pairs preserved>
```

## Thirty-fourth swarm resumed — 2026-09-07

User requested continuation at Wave D. This resume retains the existing
Thirty-fourth-swarm contract unchanged: merge target remains
`feature/stars-ca-alignment`, scope is only T02-115 after confirmed Wave C,
maximum active workers is 2, and every worker uses `gpt-5.6-luna` at medium
reasoning. The captain will verify the completed-wave ancestry and all ticket
status before spawning T02-115. Stop after its acceptance; do not push.

---

Thirty-third (Datablock Other-Target Geometry Avoidance T02-110) landed on
`feature/datablock-overlap-fixing`. This file keeps that history, then this
new swarm on `feature/stars-ca-alignment`.

## Thirty-fourth swarm planned — 2026-09-06 (STARS Conflict Alert Alignment)

This configuration aligns Conflict Alert (CA) detection, prediction, data block
Line 0 display, cadence, pair/track inhibits, audio gating, and preview commands
with the Raytheon STARS manual (TI 6191.409). It implements 4 Airspace Type Areas,
kinematic Closest Point of Approach (CPA) lookahead, genuine 800 ms ON / 800 ms OFF
blink clock, solid vs flashing red Line 0 alert state, Line 0 `▲` inhibit symbol,
pair inhibit isolation, and authentic STARS keyboard commands (`CA K`, `CA P`,
`CA E`, `CA` + 2-click, implied slew-to-ack), while purging all non-standard invented
aliases (`*CA`, `*LA`). Captain squash-merges into **`feature/stars-ca-alignment`**,
not `master`. Do not push.

| Key | Value |
| --- | --- |
| Goal | Full STARS alignment of Conflict Alert kinematic prediction, 4-tier airspace areas, 800ms blink cadence, pair/track inhibits, and authentic preview commands. |
| Include | **T02-111**, **T02-112**, **T02-113**, **T02-114**, **T02-115** |
| Source | Raytheon STARS System Manual TI 6191.409 (Sections 2.15.3, 2.16, 2.16.3, 7.3, 7.9, 7.10, 7.11, 7.12). |
| Skip | Supervisor commands (`CA A`, `CA M`, `CA Q`); Mode C unverified / pilot-reported altitude suppression exclusions; invented aliases (`*CA`, `*LA`). |
| Stop | After T02-115 acceptance. No next phase. |
| Max workers | 2 |
| Merge lock | captain squash to `feature/stars-ca-alignment`, then `npm test` / `npm run ci` |
| Model | `gpt-5.6-luna`, medium reasoning, every worker |
| Paid STT/TTS/LLM | Forbidden |

**Product law:**

- Airspace Type Area separation standards: Type 1: 0.5 NM / 100 ft / 15 s; Type 2: 2.5 NM / 500 ft / 25 s; Type 3: 3.0 NM / 1000 ft / 35 s; Type 4: 3.0 NM / 1000 ft / 45 s.
- A pair of tracks $(A, B)$ evaluates conflict based on $\min(\text{Tier}(A), \text{Tier}(B))$.
- Kinematic CPA lookahead projects relative velocity vectors; diverging tracks ($t_{\text{CPA}} \le 0$) do not trigger predictive alerts.
- Alert display cadence is exactly 800 ms ON / 800 ms OFF (0.625 Hz). Line 0 renders blinking red `CA` when unacknowledged, solid red `CA` when acknowledged.
- Inhibited track displays white/normal `▲` triangle glyph on Line 0.
- Pairwise inhibits isolate between $(A, B)$ without suppressing $(A, C)$ or $(B, C)$; auto-purged on track drop, termination, or handoff.
- Only authentic STARS commands (`CA K`, `CA P`, `CA E`, `CA`, Slew-to-Ack) are supported. Non-standard aliases (`*CA`, `*LA`) are completely purged.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-111 | planning commit |
| B | T02-112, T02-113 | Wave A merge |
| C | T02-114 | Wave B merge |
| D | T02-115 | Wave C merge |

**Ticket ownership:**

- T02-111: Kinematic CPA engine, 4 airspace type areas, lookahead projection, pure detection math.
- T02-112: 800 ms square-wave blink clock, Line 0 blinking/solid red CA, `▲` inhibit glyph.
- T02-113: Pair inhibit table (`Set<PairKey>`), acknowledgment state, lifecycle pruning.
- T02-114: Preview grammar for `CA K`, `CA P`, `CA E`, `CA` + 2-click, slew-to-ack; purge `*CA`/`*LA`.
- T02-115: Audio tone gating, dynamic list sync, and end-to-end integration acceptance tests.

**Ticket files / branches:**

- `ticket/T02-111-kinematic-cpa-engine-and-type-areas` ← `phases/02-scope/tickets/T02-111-kinematic-cpa-engine-and-type-areas.md`
- `ticket/T02-112-alert-blinking-line0-render-and-inhibit-glyph` ← `phases/02-scope/tickets/T02-112-alert-blinking-line0-render-and-inhibit-glyph.md`
- `ticket/T02-113-pair-inhibit-table-and-ack-state` ← `phases/02-scope/tickets/T02-113-pair-inhibit-table-and-ack-state.md`
- `ticket/T02-114-stars-ca-preview-grammar-and-purge-aliases` ← `phases/02-scope/tickets/T02-114-stars-ca-preview-grammar-and-purge-aliases.md`
- `ticket/T02-115-audio-tone-integ-and-ca-acceptance` ← `phases/02-scope/tickets/T02-115-audio-tone-integ-and-ca-acceptance.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope follow-up (STARS Conflict Alert Alignment T02-111–115)
Merge target: `feature/stars-ca-alignment`
Merged: T02-111, T02-112, T02-113, T02-114, T02-115
Tests: npm test / npm run ci exit 0
Notes: <kinematic CPA 4 type areas; 800ms blink; Line 0 steady/flashing red CA and ▲; pair inhibit table; CA K/P/E/ack commands; audio gating>
```

---

# ATC-SIM swarm orchestrator — Thirty-third swarm (Datablock Other-Target Geometry Avoidance)

Thirty-second (Automatic Datablock Overlap Avoidance T02-108–109) landed on
`feature/datablock-overlap-fixing`. This file keeps that history, then this
follow-up on the same branch.

## Thirty-third swarm planned — 2026-09-06 (Datablock Other-Target Geometry Avoidance)

This configuration makes datablocks move when their boundaries intersect
scope geometry belonging to another target: symbols, PTLs, leaders, history,
A/TPA cones, and TPA J-rings. Geometry belonging to the datablock's own target
is intentionally exempt. Captain squash-merges into
**`feature/datablock-overlap-fixing`**, not `master`. Do not push.

| Key | Value |
| --- | --- |
| Goal | Keep visible datablocks clear of every other target's protected scope geometry, without system-list avoidance or simulation-state mutation. |
| Include | **T02-110** |
| Source | FAA PCG R02 terminology; CRC/vNAS STARS R07 data-block positioning / leader controls. |
| Skip | System lists; SSA/DCB/preview/maps/weather avoidance; own-target geometry; graphics rerouting; manual placement; new keys/DCB; World/Command IR/radio/aircraft/parser/speech changes. |
| Stop | After T02-110 acceptance. No next phase. |
| Max workers | 1 |
| Merge lock | captain squash to `feature/datablock-overlap-fixing`, then `npm test` / `npm run ci` |
| Model | `gpt-5.6-luna`, medium reasoning, every worker |
| Paid STT/TTS/LLM | Forbidden |

**Product law:**

- A datablock treats another target's symbol, PTL, leader, history, A/TPA cone, and TPA J-ring as protected geometry. It never treats its own target's geometry as an obstacle.
- System lists are never inputs to this solver.
- Protected geometry and datablock candidates use DOM-free, CSS-pixel intersection math with documented clearance; placement remains deterministic and priority-preserving.
- Accepted datablocks do not intersect other-target protected geometry or other accepted datablocks when capacity exists. `DATABLOCK DENSITY` is the only no-slot fallback.
- Paint and pick consume the same resolved layout. No TrackDisplay/World/Command IR/readback/intent/kinematics mutation; trainer-only, not NAS STARS.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-110 | planning commit |

**Ticket ownership:**

- T02-110 owns obstacle model/intersection math, render and pick obstacle collection, shared layout integration, all tests, performance, README wording, and manual acceptance.

**Ticket file / branch:**

- `ticket/T02-110-datablock-other-target-geometry-avoidance` ← `phases/02-scope/tickets/T02-110-datablock-other-target-geometry-avoidance.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope follow-up (T02-110 Datablock Other-Target Geometry Avoidance)
Merge target: `feature/datablock-overlap-fixing`
Merged: T02-110
Tests: npm test / npm run ci exit 0
Notes: <other-target symbols/PTLs/leaders/history/cones/J-rings protected; own-target exemption; no lists; shared paint/pick layout>
```

---

# ATC-SIM swarm orchestrator — Thirty-second swarm (Automatic Datablock Overlap Avoidance)

Thirty-first (STARS In-Scope System Lists Architecture & Interactive Lists
T02-103–107) landed. This file keeps that history, then this addendum on
**`feature/datablock-overlap-fixing`** (cut from `master`).

## Thirty-second swarm planned — 2026-09-06 (Automatic Datablock Overlap Avoidance)

This configuration lifts Phase 2's documented datablock-overlap limitation. It
adds a deterministic display-only screen-space resolver: retain configured
leader placement if possible, then relocate only conflicting later datablocks.
Captain squash-merges ticket branches into **`feature/datablock-overlap-fixing`**,
not `master`. Do not push. Existing swarm history stays intact.

| Key | Value |
| --- | --- |
| Goal | Automatic non-overlapping visible datablock layout shared by Canvas2D paint and pointer hit-testing, without leader-preference or simulation-state mutation. |
| Include | **T02-108**, **T02-109** |
| Source | FAA PCG R02 terminology; CRC/vNAS STARS R07 data-block positioning and leader controls. |
| Skip | Manual dragging; system-list layout; new DCB/keys; leader-line obstacle routing; World, Command IR, radio, aircraft, parser, or speech changes. |
| Stop | After T02-109 acceptance. No next phase. |
| Max workers | 2 |
| Merge lock | captain squash to `feature/datablock-overlap-fixing`, then `npm test` / `npm run ci` |
| Model | `gpt-5.6-luna`, medium reasoning, every worker |
| Paid STT/TTS/LLM | Forbidden |

**Product law:**

- One resolved rectangle/leader anchor is shared by paint and picking.
- Configured `leaderDir` / `leaderLengthPx` is first-choice input only; automatic layout never writes TrackDisplay or World.
- Stable priority: selected, FDB, PDB, LDB, aircraft ID. Identical inputs yield identical placements.
- Accepted rectangles are wholly in-bounds and pairwise non-overlapping. No free slot means explicit unplaced lower-priority block plus `DATABLOCK DENSITY`, never silent overpaint.
- Canvas2D/display-only: no new keys/DCB, no Command IR/readback/intent/kinematics mutation; automatic avoidance is trainer-only, not NAS STARS.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-108 | planning commit |
| B | T02-109 | T02-108 |

**Ticket ownership:**

- T02-108: pure layout contract/candidates/priority/no-slot result/synthetic tests.
- T02-109: paint/pick integration, resolved leaders, density indicator, docs, performance, integration/manual acceptance.

**Ticket files / branches:**

- `ticket/T02-108-datablock-overlap-layout-solver` ← `phases/02-scope/tickets/T02-108-datablock-overlap-layout-solver.md`
- `ticket/T02-109-datablock-overlap-render-pick-and-acceptance` ← `phases/02-scope/tickets/T02-109-datablock-overlap-render-pick-and-acceptance.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope addendum (T02-108–109 Automatic Datablock Overlap Avoidance)
Merge target: `feature/datablock-overlap-fixing`
Merged: T02-108, T02-109
Tests: npm test / npm run ci exit 0
Notes: <shared paint/pick layout; no intersecting placed datablocks; density fallback; no controller/simulation-state mutation>
```

---

# ATC-SIM swarm orchestrator — Thirty-first swarm (STARS In-Scope System Lists Architecture & Interactive Lists)

Thirtieth (Flight Progress Strips Interactive Freeform Box Annotations T02-100–102) landed.
This file keeps that history, then the thirty-first addendum on
**`feature/system-lists`** (cut from `master`).

## Thirty-first swarm planned — 2026-09-05 (STARS In-Scope System Lists Architecture & Interactive Lists)

This configuration implements the full FAA STARS in-scope System Lists suite on the radar display:
standard list IDs (`FL`, `TL`, `VL`, `ML`, `AL`), adaptation default anchors, title header left/middle-click dragging,
Shift-Click default reset, keyboard relocation and reset (`*ID D Enter`), DCB PREF profile persistence,
Flight Plan List (`FL`) buffering and auto-correlation, Tower List (`TL`) and VFR List (`VL`) sequences,
Video Map Lists (`ML`) with active `> ` caret indicators and direct canvas row toggling, and the dynamic
LA/CA/MCI Status Box (`AL`) with flashing/audio alerts, on **`feature/system-lists`**.
Captain squash-merges ticket branches into **`feature/system-lists`**, not `master`. Do not push. Existing swarm history stays intact.

| Key | Value |
| --- | --- |
| Goal | Establish the FAA STARS in-scope system list window architecture, complete with title header dragging, default anchor resets, DCB PREF persistence, and interactive implementations for FL, TL, VL, ML, and AL on the scope canvas. |
| Include | **T02-103**, **T02-104**, **T02-105**, **T02-106**, **T02-107** |
| Source | FAA STARS R07 System Lists specifications, CRC STARS Command Reference (Tables 31/32), and virtual NAS terminal radar workstation standards. |
| Skip | CRDA Status List (`CR`), Coast/Suspend List (`CS`), and Sign-On List (`SO`) for now (deferred per request); paid speech/LLM APIs. |
| Stop | After T02-107 acceptance. No next phase. |
| Max workers | 3 |
| Merge lock | captain squash to `feature/system-lists`, then `npm test` / `npm run ci` |
| Model | **inherit** on captain and every worker |
| Paid STT/TTS/LLM | Forbidden |

**Product law (thirty-first swarm — STARS In-Scope System Lists Architecture & Interactive Lists):**

- **Authentic STARS list architecture & IDs.** Active lists use official identifiers: `FL` (Flight Plan), `TL` (Tower), `VL` (VFR), `ML` (Video Maps), and `AL` (LA/CA/MCI), alongside `SSA`. Legacy tokens (`TAB`, `T`, `TV`, `TM`, `TX`, `P1`–`P3`) are preserved as aliases.
- **Direct title header repositioning & default resets.** Holding left-click or middle-click on any list title header initiates dragging with green anchor and white ghost frames. Shift-left-clicking the title bar or typing `* [List ID] D Enter` instantly resets the window to its adaptation default coordinates.
- **Workstation PREF profile persistence.** Active list visibility, normalized coordinates `(x, y)`, and capacity `maxLines` persist seamlessly across profile save/recall via DCB PREF runtime.
- **Flight Plan List (`FL`) buffering & correlation.** Buffers unassociated tracks and pending departures with quick-action indices and `MORE: X/Y` pagination. Squawk-matching automatically converts tracks to FDB and purges entries from `FL`. Direct track pairing via `[Index#] [Click]` and manual deletion via `*DEL [Index#]` / `F1` + row click are fully supported.
- **Tower (`TL`) & VFR (`VL`) sequences.** Multi-tower support (`*TL`, `*TL [Tower ID]`) displays staged departures and arrivals formatted as `[Callsign] [Type]`. VFR list displays advisory targets formatted as `[Callsign] [Beacon] [AltitudeHundreds]`. Both support `F1` + click entry dropping.
- **Interactive Video Maps List (`ML`) with active caret indicators.** Geographic maps directory (`VIDEO MAPS`) indicates active maps with a **`>`** followed by a space to the left of the map identifier/name (`>  1 BOS AIRSPACE`), while inactive maps show spaces. Active maps directory (`CURRENT`) lists enabled layers. Left-clicking any map row directly on the scope toggles the layer without navigating DCB submenus.
- **Dynamic Safety Alert Box (`AL`).** Renders idle header `LA/CA/MCI` when normal, dynamically unfurling alert rows (`CA`, `LA`, `MCI`) when triggered, flashing synchronously at 1 Hz with radar datablocks and sounding audible warnings until acknowledged (`*CA [Click]`, `*LA [Click]`) or resolved.
- **Zero regressions.** Scope navigation, radar tracking, datablocks, flight strips, DCB submenus, and radio parsing stay 100% operational.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-103 | `feature/system-lists` + planning commit |
| B | T02-104, T02-105 | T02-103 |
| C | T02-106, T02-107 | T02-103 |

**Ticket ownership:**

- T02-103 owns standard list registry, adaptation default anchors, title header drag state machine, `Shift+Click` & `*ID D` reset, slew staging, and DCB PREF persistence.
- T02-104 owns Flight Plan List (`FL`) buffering, quick-action index, `MORE: X/Y` pagination, auto-correlation/purging, `*DEL`, and `F1` deletion.
- T02-105 owns Tower List (`TL`) multi-tower handling, VFR List (`VL`), formatting (`[ACID] [TYPE]` and `[ACID] [BEACON] [ALT]`), and `F1` drop entry interactions.
- T02-106 owns Video Map Lists (`ML`) directory formatting (`> ` active indicators), `CURRENT` list, interactive canvas row toggling, and `MAP [ID]` commands.
- T02-107 owns LA/CA/MCI Status Box (`AL`) dynamic unfurling, alert target formatting, 1 Hz datablock flash sync, audio chime, and `*CA`/`*LA`/`*MCI` inhibit commands.

**Ticket files / branches:**

- `ticket/T02-103-system-lists-core-architecture-and-window-manager` ← `phases/02-scope/tickets/T02-103-system-lists-core-architecture-and-window-manager.md`
- `ticket/T02-104-flight-plan-list-buffering-and-correlation` ← `phases/02-scope/tickets/T02-104-flight-plan-list-buffering-and-correlation.md`
- `ticket/T02-105-tower-and-vfr-lists-sequences-and-drop` ← `phases/02-scope/tickets/T02-105-tower-and-vfr-lists-sequences-and-drop.md`
- `ticket/T02-106-video-map-lists-active-indicators-and-scope-toggling` ← `phases/02-scope/tickets/T02-106-video-map-lists-active-indicators-and-scope-toggling.md`
- `ticket/T02-107-alert-status-box-dynamic-unfurling-and-controls` ← `phases/02-scope/tickets/T02-107-alert-status-box-dynamic-unfurling-and-controls.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope addendum (T02-103–107 STARS In-Scope System Lists Architecture & Interactive Lists)
Merge target: `feature/system-lists`
Merged: T02-103, T02-104, T02-105, T02-106, T02-107
Tests: npm test / npm run ci exit 0
Notes: <STARS list IDs; title drag & default reset; PREF persistence; FL/TL/VL/ML/AL operational lists; active map > indicators; dynamic alerts>
```

---

# ATC-SIM swarm orchestrator — Thirtieth swarm (Flight Progress Strips Interactive Freeform Box Annotations)

Twenty-ninth (Flight Progress Strips Bay Separators & Custom Context Menus T02-97–99) landed on `feature/flight-strips`.
This file keeps that history, then the thirtieth addendum on
**`feature/flight-strips`**.

## Thirtieth swarm planned — 2026-09-05 (Flight Progress Strips Interactive Freeform Box Annotations)

This configuration implements interactive freeform box annotations on flight progress strips, supporting double-click inline editing on Boxes 10–18 (3×3 coordination matrix) and Boxes 8A/8B with authentic black text, keyboard commit/cancel, isolation from strip dragging/selection, and telemetry persistence on **`feature/flight-strips`**.
Captain squash-merges ticket branches into **`feature/flight-strips`**, not `master`. Do not push. Existing swarm history stays intact.

| Key | Value |
| --- | --- |
| Goal | Enable controllers to double-click any cell in Boxes 10–18 or Boxes 8A/8B on Departure and Arrival strips to edit freeform text annotations directly inline with authentic black text, commit on Enter/blur, cancel on Escape, prevent accidental strip dragging or radar track selection, and persist annotations across live World telemetry ticks. |
| Include | **T02-100**, **T02-101**, **T02-102** |
| Source | FAA Order 7110.65 Chapter 2 §3 & Appendix A, virtual NAS terminal flight strip scratchpad specifications, and terminal radar workstation UI architecture. |
| Skip | Paid speech/LLM APIs; server-side database storage; freehand canvas pen drawing; multi-selection bulk annotations. |
| Stop | After T02-102 acceptance. No next phase. |
| Max workers | 3 |
| Merge lock | captain squash to `feature/flight-strips`, then `npm test` / `npm run ci` |
| Model | **inherit** on captain and every worker |
| Paid STT/TTS/LLM | Forbidden |

**Product law (thirtieth swarm — Flight Progress Strips Interactive Freeform Box Annotations):**

- **Authentic strip annotation appearance.** Annotations render in authentic black text (`color: #000000;`) on the pale buff strip cardstock (`#f5eedc`), with bold uppercase monospace typography (`Consolas`, `IBM Plex Mono`).
- **Direct double-click inline editing.** Double-clicking an annotatable box (10–18 or 8A/8B) immediately mounts an inline micro-input fitted to that cell with auto-focus and text selection.
- **Keyboard navigation & commit.** Pressing `Enter` or blurring commits changes; pressing `Escape` reverts to previous text.
- **Interaction isolation.** Clicking or double-clicking an annotation cell stops propagation (`e.stopPropagation()`) so it never triggers radar track selection (`World.selectedAircraftId`) or initiates an HTML5 drag reorder.
- **Telemetry persistence.** When live simulation ticks stream updated traffic via `terminalStripsFromWorld`, controller-written annotations for active aircraft are merged and preserved without reset.
- **Zero regressions.** Strip cocking (~28px right-click indent), bay separators, custom context menus, and intra-rack drag reordering remain 100% operational.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-100 | `feature/flight-strips` + planning commit |
| B | T02-101 | T02-100 |
| C | T02-102 | T02-101 |

**Ticket ownership:**

- T02-100 owns `StripAnnotationBoxes` model extensions, double-click inline micro-input cell component, keyboard commit/cancel, and event isolation in `DepartureStrip` and `ArrivalStrip`.
- T02-101 owns `StripsBoard` annotation state tracking, merging with live `terminalStripsFromWorld` telemetry updates, and update callbacks.
- T02-102 owns CSS styling (`.strip-annotation-input`, hover cues), unit tests, and acceptance test suite (AC13–AC16).

**Ticket files / branches:**

- `ticket/T02-100-strips-freeform-box-annotations-component` ← `phases/02-scope/tickets/T02-100-strips-freeform-box-annotations-component.md`
- `ticket/T02-101-strips-annotation-state-and-telemetry-persistence` ← `phases/02-scope/tickets/T02-101-strips-annotation-state-and-telemetry-persistence.md`
- `ticket/T02-102-strips-box-annotations-acceptance-and-styling` ← `phases/02-scope/tickets/T02-102-strips-box-annotations-acceptance-and-styling.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope addendum (T02-100–102 Flight Progress Strips Interactive Freeform Box Annotations)
Merge target: `feature/flight-strips`
Merged: T02-100, T02-101, T02-102
Tests: npm test / npm run ci exit 0
Notes: <Double-click inline freeform annotations; black text; telemetry persistence; zero regressions>
```

---

# ATC-SIM swarm orchestrator — Twenty-ninth swarm (Flight Progress Strips Bay Separators & Custom Context Menus)

Twenty-eighth (Flight Progress Strips Drag Reordering & Indentation T02-94–96) landed.
This file keeps that history, then the twenty-ninth addendum on
**`feature/flight-strips`**.

## Twenty-ninth swarm planned — 2026-09-05 (Flight Progress Strips Bay Separators & Custom Context Menus)

This configuration implements user-created strip bay separators with direct in-place text editing, custom context menu on empty bay space ("Add Separator") and on separators ("Delete"), intra-section drag-and-drop reordering alongside flight strips with visual insertion indicator lines, and telemetry reconciliation on **`feature/flight-strips`**.
Captain squash-merges ticket branches into **`feature/flight-strips`**, not `master`. Do not push. Existing swarm history stays intact.

| Key | Value |
| --- | --- |
| Goal | Implement interactive flight progress strip bay separators that controllers can create by right-clicking empty space in either rack, type text directly on the separator bar, drag and drop to reorder as though it were a strip, and right-click to delete via a custom context menu, preserving separator positions across dynamic telemetry updates. |
| Include | **T02-97**, **T02-98**, **T02-99** |
| Source | FAA Order 7110.65 Chapter 2 §3, virtual NAS flight strip specifications (vNAS / vStrips divider bars / strip spacers), and terminal radar workstation UI architecture. |
| Skip | Paid speech/LLM APIs; multi-rack bulk selection; server-side database persistence; freehand pen drawing. |
| Stop | After T02-99 acceptance. No next phase. |
| Max workers | 3 |
| Merge lock | captain squash to `feature/flight-strips`, then `npm test` / `npm run ci` |
| Model | **inherit** on captain and every worker |
| Paid STT/TTS/LLM | Forbidden |

**Product law (twenty-ninth swarm — Flight Progress Strips Bay Separators & Custom Context Menus):**

- **Authentic bay separator dividers.** Separators render as distinct horizontal divider bars across the rack width with high-contrast cab styling, bold uppercase monospace typography, and clear visual differentiation from flight cards.
- **Direct in-place text editing.** New separators allow typing text directly (auto-focused input upon creation; editable on click/double-click), saving changes on Enter or blur, and escaping to cancel without losing position.
- **Custom right-click context menus with native menu suppression.** Right-clicking empty space in a bay intercepts `contextmenu`, calls `e.preventDefault()`, and displays a custom context menu with "Add Separator". Right-clicking a separator displays a custom context menu with "Delete". Right-clicking normal flight strips retains authentic cocking/indentation (~28px horizontal offset).
- **Seamless drag-and-drop reordering with flight strips.** Separators are draggable within their rack section (Departures or Arrivals), participate in candidate drop indicator lines, and can be positioned above, between, or below flight strips.
- **Dynamic telemetry state reconciliation.** When live simulation ticks update flight plans or spawn/remove aircraft via `terminalStripsFromWorld`, user-created separators retain their positions, labels, and order without being pruned or reset.
- **Radar track synchronization preservation.** Left-clicking flight strips continues to select the matching aircraft in `World.selectedAircraftId` without interference from separator interactions.
- **Zero simulation regressions.** Scope canvas, radar tracking, datablocks, DCB submenus, system lists, and radio parsing stay 100% operational.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-97 | `feature/flight-strips` + planning commit |
| B | T02-98 | T02-97 |
| C | T02-99 | T02-98 |

**Ticket ownership:**

- T02-97 owns `StripSeparator` domain model, component, inline direct text editing, and visual styling.
- T02-98 owns custom context menu component, empty bay space right-click "Add Separator", separator right-click "Delete", and auto-dismissal.
- T02-99 owns drag-and-drop reordering of separators alongside flight strips, telemetry reconciliation across live World ticks, and acceptance tests.

**Ticket files / branches:**

- `ticket/T02-97-strips-separator-component-and-text-editing` ← `phases/02-scope/tickets/T02-97-strips-separator-component-and-text-editing.md`
- `ticket/T02-98-strips-custom-context-menus` ← `phases/02-scope/tickets/T02-98-strips-custom-context-menus.md`
- `ticket/T02-99-strips-separator-drag-reorder-and-acceptance` ← `phases/02-scope/tickets/T02-99-strips-separator-drag-reorder-and-acceptance.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope addendum (T02-97–99 Flight Progress Strips Bay Separators & Custom Context Menus)
Merge target: `feature/flight-strips`
Merged: T02-97, T02-98, T02-99
Tests: npm test / npm run ci exit 0
```

---

## Twenty-eighth swarm planned — 2026-09-05 (Flight Progress Strips Drag Reordering & Indentation)

This configuration implements drag-and-drop strip reordering constrained within rack sections (Departures and Arrivals), real-time visual drop insertion indicator lines, and single right-click horizontal strip indentation ("cocking") with browser context-menu suppression on **`feature/flight-strips`**.
Captain squash-merges ticket branches into **`feature/flight-strips`**, not `master`. Do not push. Existing swarm history stays intact.

| Key | Value |
| --- | --- |
| Goal | Implement intra-section drag-and-drop reordering for Departures and Arrivals racks in `StripsBoard`, render a real-time insertion indicator line showing target drop position, enable single right-click indentation/cocking (~28px horizontal offset) with context menu suppression, and maintain custom sequence and indent state across dynamic simulation telemetry updates. |
| Include | **T02-94**, **T02-95**, **T02-96** |
| Source | FAA Order 7110.65 Chapter 2 §3, virtual NAS flight strip specifications (vNAS / vStrips), and terminal radar workstation UI architecture. |
| Skip | Paid speech/LLM APIs; freehand stylus/pen drawings; cross-rack moves (moving departures into arrivals or vice versa); external cloud sync. |
| Stop | After T02-96 acceptance. No next phase. |
| Max workers | 3 |
| Merge lock | captain squash to `feature/flight-strips`, then `npm test` / `npm run ci` |
| Model | **inherit** on captain and every worker |
| Paid STT/TTS/LLM | Forbidden |

**Product law (twenty-eighth swarm — Flight Progress Strips Drag Reordering & Indentation):**

- **Authentic right-click strip indentation ("cocking").** Right-clicking once on a departure or arrival strip card intercepts `contextmenu`, calls `e.preventDefault()`, and indents the strip horizontally (~28px) to visually mark pending actions. Subsequent right-clicking toggles back to normal unindented alignment.
- **Strict intra-section drag reordering.** Strips are draggable exclusively within their own section (Departures within Departures, Arrivals within Arrivals). Cross-section drags (e.g. dragging a departure over the arrivals rack) are disallowed and ignored.
- **Real-time drop insertion indicator line.** While dragging over an eligible rack, an insertion indicator line clearly previews the exact drop index between strips where the dragged strip will land upon release.
- **Dynamic telemetry state reconciliation.** When live simulation ticks update flight plans or spawn/remove aircraft via `terminalStripsFromWorld`, custom user-ordered sequence and strip indentation states are preserved.
- **Radar track synchronization preservation.** Left-clicking a strip continues to select the matching aircraft in `World.selectedAircraftId` and update radar datablock highlighting without conflict with drag or right-click.
- **Zero simulation regressions.** Scope canvas, radar tracking, datablocks, DCB submenus, system lists, and radio parsing stay 100% operational.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-94 | `feature/flight-strips` + planning commit |
| B | T02-95 | T02-94 |
| C | T02-96 | T02-95 |

**Ticket ownership:**

- T02-94 owns right-click indentation, `indented?: boolean` type support, `.strip-indented` CSS offset styling, context menu suppression, and unit tests.
- T02-95 owns intra-section drag-and-drop mechanics, drag events, `.strip-drop-indicator` line rendering, drop reordering in `StripsBoard`, and rack boundary checks.
- T02-96 owns live simulation telemetry reconciliation in `shell.tsx`, persistence across World updates, and end-to-end acceptance tests.

**Ticket files / branches:**

- `ticket/T02-94-strips-right-click-indentation` ← `phases/02-scope/tickets/T02-94-strips-right-click-indentation.md`
- `ticket/T02-95-strips-drag-reorder-and-drop-indicator` ← `phases/02-scope/tickets/T02-95-strips-drag-reorder-and-drop-indicator.md`
- `ticket/T02-96-strips-reorder-and-indent-acceptance` ← `phases/02-scope/tickets/T02-96-strips-reorder-and-indent-acceptance.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope addendum (T02-94–96 Flight Progress Strips Drag Reordering & Indentation)
Merge target: `feature/flight-strips`
Merged: T02-94, T02-95, T02-96
Tests: npm test / npm run ci exit 0
```

---

## Twenty-seventh swarm planned — 2026-09-04 (Terminal Flight Progress Strips)

This configuration implements the FAA/vNAS terminal flight progress strip system, complete with 4-column physical grid layouts, pale buff cardstock background, CWT/wake formatting, route truncation, and a 2-column rack board (Departures & Arrivals) on **`feature/flight-strips`**, cut from current `master`.
Captain squash-merges ticket branches into **`feature/flight-strips`**, not `master`. Do not push. Existing swarm history stays intact.

| Key | Value |
| --- | --- |
| Goal | Implement the FAA/vNAS Terminal Flight Progress Strip board with rigid physical proportions (800x140px), 4-column departure and arrival grid components, CWT/wake equipment formatting, route truncation with `***`, and a 2-column controller cab rack layout (Departures / Arrivals) supporting independent scrolling and radar target selection synchronization. |
| Include | **T02-90**, **T02-91**, **T02-92**, **T02-93** |
| Source | FAA Order 7110.65 Chapter 2 §3, virtual NAS flight strip specifications (vNAS / vStrips), and terminal radar display architecture. |
| Skip | Paid speech/LLM APIs; drag-and-drop animations; handwritten signature OCR; external cloud sync. |
| Stop | After T02-93 acceptance. No next phase. |
| Max workers | 3 |
| Merge lock | captain squash to `feature/flight-strips`, then `npm test` / `npm run ci` |
| Model | **inherit** on captain and every worker |
| Paid STT/TTS/LLM | Forbidden |

**Product law (twenty-seventh swarm — Terminal Flight Progress Strips):**

- **Authentic FAA / vNAS physical proportions and typography.** Strips use rigid aspect ratios (~800px × 140px), pale matte beige/buff background (`#F5EEDC`), dark holder border (`#222`), muted grid borders (`#333`), and uppercase monospaced machine-printed typography (`Consolas`, `Courier New`, monospace).
- **Equipment string formatting (Box 3).** Prefix with CWT wake turbulence category (`A/` through `I/`) or `H/` for heavy aircraft when CWT is inactive, followed by type and optional equipment suffix (`/L`, `/G`).
- **Route and remarks truncation.** Route and remarks fields exceeding fixed character thresholds append `***` on overflow.
- **Two-column rack board layout.** Main bay organizes strips into two vertical rack columns ("Departures" on the left, "Arrivals" on the right) within a dark cab container (`#1A1E24`).
- **Independent rack scrolling.** Racks scroll independently vertically while viewport height is locked (`100vh`, `overflow: hidden`).
- **Radar track synchronization.** Clicking a strip's ACID selects the matching aircraft in `World.selectedAircraftId`.
- **Zero simulation regressions.** Scope camera, radar tracking, datablocks, DCB submenus, system lists, and radio parsing stay 100% operational.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-90 | `feature/flight-strips` + planning commit |
| B | T02-91 | T02-90 |
| C | T02-92 | T02-91 |
| D | T02-93 | T02-92 |

**Ticket ownership:**

- T02-90 owns domain types (`FlightRules`, `CWTCategory`, `FlightStrip`), strip transformation utilities (`formatEquipment`, `truncateField`, beacon padding, time formatting), static seed fixture, and unit tests.
- T02-91 owns React components `DepartureStrip` and `ArrivalStrip` with 4-column physical CSS Grid layouts and styling.
- T02-92 owns `StripsBoard` 2-column rack container (Departures / Arrivals), rack count headers, and scrollable bays.
- T02-93 owns `?view=strips` routing, shell toggle integration, track selection synchronization, and end-to-end acceptance tests.

**Ticket files / branches:**

- `ticket/T02-90-strips-data-models-and-formatter` ← `phases/02-scope/tickets/T02-90-strips-data-models-and-formatter.md`
- `ticket/T02-91-strips-departure-and-arrival-components` ← `phases/02-scope/tickets/T02-91-strips-departure-and-arrival-components.md`
- `ticket/T02-92-strips-two-column-board-and-layout` ← `phases/02-scope/tickets/T02-92-strips-two-column-board-and-layout.md`
- `ticket/T02-93-strips-integration-and-acceptance` ← `phases/02-scope/tickets/T02-93-strips-integration-and-acceptance.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope addendum (T02-90–93 Terminal Flight Progress Strips)
Merge target: `feature/flight-strips`
Merged: T02-90, T02-91, T02-92, T02-93
Tests: npm test / npm run ci exit 0
```

---

## Twenty-sixth swarm planned — 2026-09-01 (STARS Compass Rose Heading Overlay)

This configuration implements the STARS Radar Scope Compass Rose overlay with radial tick marks (5° minor, 10° medium, 30° major) and 3-digit heading numerals (`360`, `030`, `060`, `090`, `120`, `150`, `180`, `210`, `240`, `270`, `300`, `330`), `BRITE CMP` brightness modulation, `CHAR SIZE TOOLS` font sizing, and PREF persistence on **`feature/compass-rose-headings`**, cut from current `master`.
Captain squash-merges ticket branches into **`feature/compass-rose-headings`**, not `master`. Do not push. Existing swarm history stays intact.

| Key | Value |
| --- | --- |
| Goal | Implement the STARS Compass Rose overlay around the radar scope for rapid vector heading reference, complete with 72 radial tick marks (5° minor, 10° medium, 30° major), twelve 3-digit heading labels (`360`..`330`), BRITE CMP brightness modulation, CHAR SIZE TOOLS font scaling, map cache integration, and PREF persistence. |
| Include | **T02-87**, **T02-88**, **T02-89** |
| Source | FAA STARS TCW radar display standard, CRC STARS specifications (R07), Scope canvas renderer, and MapCache architecture. |
| Skip | Paid vendors; audio synth; unrelated UI redesigns. |
| Stop | After T02-89 acceptance. No next phase. |
| Max workers | 3 |
| Merge lock | captain squash to `feature/compass-rose-headings`, then `npm test` / `npm run ci` |
| Model | **cursor-grok-4.6-high only, non-fast** on captain and every worker |
| Paid STT/TTS/LLM | Forbidden |

**Product law (twenty-sixth swarm — STARS Compass Rose Heading Overlay):**

- **Authentic STARS Compass Rose geometry.** The compass rose circular ring is rendered at the outer range ring boundary / scope radius. Radial tick marks are generated every 5° (minor inward tick), 10° (medium inward tick), and 30° (major inward tick).
- **3-digit heading numeral labels.** Twelve 3-digit numerals (`360`, `030`, `060`, `090`, `120`, `150`, `180`, `210`, `240`, `270`, `300`, `330`) are positioned radially inside each 30° major tick line.
- **BRITE CMP modulation.** Compass rose ring, tick marks, and heading labels are stroked and painted using `PALETTE.mapDim` modulated by `applyBrite(PALETTE.mapDim, view.brite.cmp)`. When `BRITE CMP` is `0` / `OFF`, the compass rose is completely dimmed.
- **CHAR SIZE TOOLS font scaling.** Compass rose numerals are rendered using `datablockFontCss(view.charSizes.tools)` in IBM Plex Mono.
- **Map cache performance.** Compass rose geometry and labels are cached in `MapCache` and invalidated whenever `view.brite.cmp`, `view.charSizes.tools`, range, or camera change.
- **PREF persistence.** `showCompassRose` and `brite.cmp` serialize and restore cleanly in DCB PREF slot profiles.
- **Zero simulation regressions.** Scope camera, radar tracking, datablocks, DCB submenus, and radio parsing stay 100% operational.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-87 | `feature/compass-rose-headings` + planning commit |
| B | T02-88 | T02-87 |
| C | T02-89 | T02-88 |

**Ticket ownership:**

- T02-87 owns Compass Rose mathematical geometry generator, 72 tick marks, 12 heading labels, `showCompassRose` flag, and `MapCache` integration.
- T02-88 owns canvas rendering in `drawMapLayers`, `BRITE CMP` modulation, `CHAR SIZE TOOLS` font scaling, and PREF persistence.
- T02-89 owns end-to-end automated integration acceptance tests, documentation updates, and backlog sync.

**Ticket files / branches:**

- `ticket/T02-87-compass-rose-geometry-and-cache` ← `phases/02-scope/tickets/T02-87-compass-rose-geometry-and-cache.md`
- `ticket/T02-88-compass-rose-canvas-rendering-and-brite` ← `phases/02-scope/tickets/T02-88-compass-rose-canvas-rendering-and-brite.md`
- `ticket/T02-89-compass-rose-acceptance` ← `phases/02-scope/tickets/T02-89-compass-rose-acceptance.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope addendum (T02-87–89 STARS Compass Rose)
Merge target: `feature/compass-rose-headings`
Merged: T02-87, T02-88, T02-89
Tests: npm test / npm run ci exit 0
```

---

## Twenty-fifth swarm planned — 2026-09-01 (DCB AUX H_RATE, DWELL, Cursor Controls, and BRITE CMP/BCN)

This configuration enables previously disabled/stubbed DCB controls on AUX (`H_RATE`, `DWELL`, `CURSOR HOME`, `CSR SPD`) and BRITE (`CMP`, `BCN`) on **`feature/dcb-aux-and-brite-controls`**, cut from current `master`.
Captain squash-merges ticket branches into **`feature/dcb-aux-and-brite-controls`**, not `master`. Do not push. Existing swarm history stays intact.

| Key | Value |
| --- | --- |
| Goal | Enable DCB AUX H_RATE (history update interval scan rate spinner), DWELL (OFF/ON/LOCK datablock hover brightening mode), CURSOR HOME toggle, CSR SPD (cursor speed multiplier spinner), and BRITE CMP (compass rose tick marks) & BCN (secondary radar beacon symbol) brightness spinners with PREF persistence. |
| Include | **T02-84**, **T02-85**, **T02-86** |
| Source | STARS DCB physical layout specifications (R07), Vice `stars/dcb.go`, Scope canvas renderer, and history buffer sampling. |
| Skip | SSA filter submenu overhaul; TSAS / Time Line complex scheduling; Beacon Mode 2 / RTQC / UNCOR / MCP inert hardware diagnostic simulations; paid vendors. |
| Stop | After T02-86 acceptance. No next phase. |
| Max workers | 3 |
| Merge lock | captain squash to `feature/dcb-aux-and-brite-controls`, then `npm test` / `npm run ci` |
| Model | **cursor-grok-4.6-high only, non-fast** on captain and every worker |
| Paid STT/TTS/LLM | Forbidden |

**Product law (twenty-fifth swarm — DCB AUX & BRITE controls):**

- **H_RATE authentic history scan rate.** DCB `H_RATE` spinner modulates the history dot update interval (presets: `1.0`, `2.0`, `3.0`, `4.0`, `4.5`, `5.0`, `6.0`, `8.0`, `10.0` s, default `4.5` s). New history samples are gated by this interval.
- **DWELL mode authentic hover brightening.** AUX `DWELL` cycles `OFF` -> `ON` -> `LOCK`. In `ON` mode, datablocks brighten on mouse hover over the target. In `LOCK` mode, datablock stays brightened on the last hovered target until moving near another target. In `OFF` mode, standard datablock brightness applies.
- **CURSOR HOME & CSR SPD controls.** `CURSOR HOME` is an active toggle button on AUX DCB. `CSR SPD` is an active spinner (1–10, default 4).
- **BRITE CMP & BCN active channels.** `CMP` (compass rose / range ring tick mark brightness) and `BCN` (secondary radar beacon symbol brightness) are enabled as live spinners (0–100%) on the BRITE submenu.
- **PREF persistence.** Active settings for `historyRateSec`, `dwellMode`, `cursorHome`, `cursorSpeed`, `brite.cmp`, and `brite.bcn` are serialized and restored via PREF save/restore.
- **Zero simulation regressions.** Scope camera, radar tracking, datablocks, DCB submenus, system lists, and radio parsing stay 100% operational.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-84 | `feature/dcb-aux-and-brite-controls` + planning commit |
| B | T02-85 | T02-84 |
| C | T02-86 | T02-85 |

**Ticket ownership:**

- T02-84 owns DCB AUX `H_RATE` history scan rate spinner, `DWELL` mode OFF/ON/LOCK, `CURSOR HOME` toggle, `CSR SPD` spinner, and PREF persistence.
- T02-85 owns DCB BRITE `CMP` and `BCN` brightness spinners and canvas rendering integration.
- T02-86 owns end-to-end automated integration tests, documentation updates, and backlog sync.

**Ticket files / branches:**

- `ticket/T02-84-dcb-aux-hrate-dwell-and-cursor-controls` ← `phases/02-scope/tickets/T02-84-dcb-aux-hrate-dwell-and-cursor-controls.md`
- `ticket/T02-85-dcb-brite-cmp-bcn-channel-spinners` ← `phases/02-scope/tickets/T02-85-dcb-brite-cmp-bcn-channel-spinners.md`
- `ticket/T02-86-dcb-aux-and-brite-acceptance` ← `phases/02-scope/tickets/T02-86-dcb-aux-and-brite-acceptance.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope addendum (T02-84–86 DCB AUX & BRITE controls)
Merge target: `feature/dcb-aux-and-brite-controls`
Merged: T02-84, T02-85, T02-86
Tests: npm test / npm run ci exit 0
```

---

## Twenty-fourth swarm planned — 2026-09-01 (DCB VOL, MODE FSL, BRITE BKC and SSA WX Telemetry)

This configuration enables previously disabled/stubbed DCB controls (`VOL`, `MODE FSL`, `BRITE BKC`) and adds live SSA weather mosaic telemetry (`WX`, `WX HIST`) on **`feature/dcb-controls-ssa-wx`**, cut from current `master`.
Captain squash-merges ticket branches into **`feature/dcb-controls-ssa-wx`**, not `master`. Do not push. Existing swarm history stays intact.

| Key | Value |
| --- | --- |
| Goal | Enable DCB VOL (aural alert tone gain), MODE FSL (3-way datablock mode latch), BRITE BKC (background contrast), and SSA WX/WX HIST status telemetry with DCB SSA FILTER support and PREF persistence. |
| Include | **T02-81**, **T02-82**, **T02-83** |
| Source | STARS DCB physical layout specifications, Web Audio CA alert tone graph, Scope canvas renderer, and IEM NEXRAD mosaic timestamp telemetry. |
| Skip | Paid weather APIs; OSM; pilot aircraft kinematic deviation; voice synthesis of ATIS audio; manual keyboard altimeter editing prompts. |
| Stop | After T02-83 acceptance. No next phase. |
| Max workers | 3 |
| Merge lock | captain squash to `feature/dcb-controls-ssa-wx`, then `npm test` / `npm run ci` |
| Model | **cursor-grok-4.6-high only, non-fast** on captain and every worker |
| Paid STT/TTS/LLM | Forbidden |

**Product law (twenty-fourth swarm — DCB controls & SSA weather telemetry):**

- **VOL spinner authentic semantics.** DCB `VOL` spinner modulates the workstation aural alert tone gain (`caAlertTone.ts`) linearly from 0.0 (silent) to 1.0. Pilot voice readback playback level remains independent on the radio line.
- **MODE FSL 3-way toggle latch.** MAIN DCB `MODE FSL` replaces the disabled cell with an active 3-state toggle cycling `MODE F` -> `MODE S` -> `MODE L`. When in `MODE S`, unselected associated tracks show Partial Data Blocks (PDB); when in `MODE L`, unassociated tracks show Limited Data Blocks (LDB). Selected tracks retain FDB.
- **BRITE BKC background contrast.** `BRITE BKC` spinner modulates canvas background darkness/contrast level from pure black to higher contrast slate.
- **SSA WX and WX HIST telemetry.** SSA renders live radar weather status (`WX ON/OFF`) and mosaic age (`WX HIST <age>M`). Exceeding 15 minutes flags data as stale. DCB `SSA FILTER` `WX` toggle controls visibility.
- **PREF persistence.** Active settings for `vol`, `modeFsl`, and `brite.bkc` are serialized and restored via PREF save/restore.
- **Zero simulation regressions.** Scope camera, radar tracking, datablocks, DCB submenus, system lists, and radio parsing stay 100% operational.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-81 | `feature/dcb-controls-ssa-wx` + planning commit |
| B | T02-82 | T02-81 |
| C | T02-83 | T02-82 |

**Ticket ownership:**

- T02-81 owns DCB `VOL` audio gain wiring, `MODE FSL` datablock mode latch, `BRITE BKC` canvas background contrast, and PREF persistence.
- T02-82 owns SSA `WX` and `WX HIST` telemetry rendering, age calculation, stale-data flagging, and `SSA FILTER` `WX` visibility toggling.
- T02-83 owns end-to-end automated integration tests, documentation updates, and backlog sync.

**Ticket files / branches:**

- `ticket/T02-81-dcb-vol-fsl-and-bkc-controls` ← `phases/02-scope/tickets/T02-81-dcb-vol-fsl-and-bkc-controls.md` (MERGED)
- `ticket/T02-82-ssa-wx-history-status-telemetry` ← `phases/02-scope/tickets/T02-82-ssa-wx-history-status-telemetry.md` (MERGED)
- `ticket/T02-83-dcb-controls-and-ssa-wx-acceptance` ← `phases/02-scope/tickets/T02-83-dcb-controls-and-ssa-wx-acceptance.md` (MERGED)

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope addendum (T02-81–83 DCB controls & SSA WX telemetry)
Merge target: `feature/dcb-controls-ssa-wx`
Merged: T02-81, T02-82, T02-83
Tests: npm test / npm run ci exit 0
```

---


## Twenty-third swarm planned — 2026-08-31 (Live METAR weather, SSA primary/satellite altimeters, GI text)

This configuration adds real-time METAR weather and altimeter display across the STARS scope and SSA on **`feature/metar-weather-altimeter`**, cut from current `master`.
Captain squash-merges ticket branches into **`feature/metar-weather-altimeter`**, not `master`. Do not push. Existing swarm history stays intact.

| Key | Value |
| --- | --- |
| Goal | Fetch real-time METAR weather from `aviationweather.gov/api/data/metar`, decode observations and altimeter inHg, display live primary altimeter and multi-airport satellite altimeter matrix in SSA, render surface wind/weather in GI text lines, respect SSA/GI filters, and fallback gracefully offline. |
| Include | **T02-78**, **T02-79**, **T02-80** |
| Source | AviationWeather METAR JSON API (`https://aviationweather.gov/api/data/metar?ids=<ICAO>&format=json`), scenario primary/satellite airports, and offline fixture `testdata/wx/metar-katl.json`. |
| Skip | Paid weather APIs; OSM; pilot aircraft kinematic deviation; voice synthesis of ATIS audio; manual keyboard altimeter editing prompts. |
| Stop | After T02-80 acceptance. No next phase. |
| Max workers | 3 |
| Merge lock | captain squash to `feature/metar-weather-altimeter`, then `npm test` / `npm run ci` |
| Model | **cursor-grok-4.6-high only, non-fast** on captain and every worker |
| Paid STT/TTS/LLM | Forbidden |

**Product law (twenty-third swarm — METAR weather & altimeter display):**

- **AviationWeather JSON API only.** Fetch by scenario primary airport ID and configured satellite airport IDs (e.g. `ids=KATL,KFTY,KPDK,KMGE,KRYY` or single `ids=KATL`). Vite `/api-metar` proxy or direct fetch. CI uses `testdata/wx/` fixture; no live network calls in Vitest suite.
- **Altimeter decoding.** Decode `altim` hPa to inHg `(altim * 0.029529983).toFixed(2)` and verify against `rawOb` `A(\d{4})` (e.g. `1022.1` hPa / `A3018` → `"30.18"`). Altimeters must always be formatted with 2 decimal places.
- **SSA primary and satellite altimeter matrix.** Line 3 displays Zulu/Sim time + primary altimeter (`1620/02  30.18`). Configured satellite towered airports render in 3-airport matrix rows (e.g. `KATL 30.18  FTY 30.18  PDK 30.18`).
- **SSA & GI FILTER compliance.** DCB `SSA FILTER` `ALTSTG` toggle hides/shows primary and satellite altimeter readings without altering time or layout. DCB `GI TEXT FILTER` toggles individual GI weather lines.
- **Graceful fallback.** Synthetic KDEM and offline/network drop fallback cleanly to scenario default altimeters (`30.17` / `29.92`) without throwing errors.
- **Zero simulation regressions.** Scope camera, radar tracking, datablocks, DCB submenus, system lists, and radio parsing stay 100% operational.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-78 | `feature/metar-weather-altimeter` + planning commit |
| B | T02-79 | T02-78 |
| C | T02-80 | T02-79 |

**Ticket ownership:**

- T02-78 owns the AviationWeather METAR client, JSON decoder, altimeter inHg conversion, in-memory cache, and mock fixture.
- T02-79 owns SSA primary altimeter line integration, satellite altimeter matrix formatting, and SSA FILTER ALTSTG handling.
- T02-80 owns GI text weather surface conditions, scope view periodic polling, end-to-end integration tests, docs, and backlog updates.

**Ticket files / branches:**

- `ticket/T02-78-metar-weather-fetch-and-decode` ← `phases/02-scope/tickets/T02-78-metar-weather-fetch-and-decode.md`
- `ticket/T02-79-ssa-primary-and-satellite-altimeter-display` ← `phases/02-scope/tickets/T02-79-ssa-primary-and-satellite-altimeter-display.md`
- `ticket/T02-80-weather-gi-text-and-acceptance` ← `phases/02-scope/tickets/T02-80-weather-gi-text-and-acceptance.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope addendum (T02-78–80 Real METAR weather & SSA altimeter)
Merge target: `feature/metar-weather-altimeter`
Merged: T02-78, T02-79, T02-80
Tests: npm test / npm run ci exit 0
Manual leftover: <METAR / SSA altimeter walk or none>
Notes: <AviationWeather API; altimeter inHg; SSA primary + satellite matrix; ALTSTG filter; GI weather; offline fallback>
```

or `PHASE EXIT BLOCKED` with reason.

---


## Twenty-first swarm planned — 2026-08-30 (WX mosaic NEXRAD VIP)

This configuration is planning-only until `/run-swarm` execution begins.
Execution branch is **`feature/wx-mosaic`**, created from current `master`.
The captain squash-merges ticket branches into **`feature/wx-mosaic`**, not
`master`. Do not push. Existing swarm history stays intact.

| Key | Value |
| --- | --- |
| Goal | Live IEM CONUS N0Q mosaic on the PPI as STARS VIP 1–6. DCB WX1–6 + `*WX` + BRITE WX/WXC. Display only. |
| Include | T02-68, T02-69, T02-70, T02-71, T02-72 |
| Skip | BKC, SSA WX / WX HIST, AVL 2×3 restyle, wind, METAR, pilot deviate, RainViewer default, OSM, paid weather APIs, phase 5, T03 redo, T04-36–42 redo |
| Stop | After T02-72. No next phase. |
| Max workers | 3 |
| Merge lock | captain squash to `feature/wx-mosaic`, then `npm test` / `npm run ci` |
| Model | **cursor-grok-4.6-high only, non-fast** on captain and every worker |
| Paid STT/TTS/LLM | Forbidden |

**Product law:**

- IEM N0Q WMS only. One GetMap for ARP ± ~80 NM. Vite `/wx-iem` proxy.
  CI uses `testdata/wx/` fixture, no live IEM in tests.
- Fetch by `scenario.arp`. KDEM 0,0 empty is valid. No airport-id branch.
- VIP breaks in data (7110.65 30/40/50 + trainer splits). Decode ramp →
  dBZ → 6 masks. Trainer fills, not NWS rainbow.
- `drawImage` only in weather module. Decode off rAF. 30/60 Canvas2D envelope.
- DCB never Command IR. Preview unknown stays INV.
- Display only. `vipAtNm` for later deviate. Do not steer aircraft.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-68 | `feature/wx-mosaic` + planning commit |
| B | T02-69 | T02-68 |
| C | T02-70 ∥ T02-71 | T02-69 |
| D | T02-72 | T02-70, T02-71 |

**Ticket ownership:**

- T02-68 owns IEM client and VIP decode.
- T02-69 owns weather paint under tracks.
- T02-70 owns DCB WX levels and PREF.
- T02-71 owns preview WX commands.
- T02-72 owns BRITE WX/WXC, docs, and acceptance.

**Ticket files / branches:**

- `ticket/T02-68-wx-mosaic-iem-client-and-vip` ← `phases/02-scope/tickets/T02-68-wx-mosaic-iem-client-and-vip.md`
- `ticket/T02-69-wx-vip-paint-under-tracks` ← `phases/02-scope/tickets/T02-69-wx-vip-paint-under-tracks.md`
- `ticket/T02-70-dcb-wx-levels-and-pref` ← `phases/02-scope/tickets/T02-70-dcb-wx-levels-and-pref.md`
- `ticket/T02-71-preview-wx-commands` ← `phases/02-scope/tickets/T02-71-preview-wx-commands.md`
- `ticket/T02-72-brite-wx-wxc-and-acceptance` ← `phases/02-scope/tickets/T02-72-brite-wx-wxc-and-acceptance.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2 scope addendum (T02-68–72 WX mosaic)
Merge target: `feature/wx-mosaic`
Merged: T02-68, T02-69, T02-70, T02-71, T02-72
Tests: npm test / npm run ci exit 0
Manual leftover: <WX mosaic / BRITE WX/WXC walk or none>
Notes: <IEM N0Q; VIP 1–6; display-only; no paid APIs>
```

or `PHASE EXIT BLOCKED` with reason.

## Twenty-first swarm execution — 2026-08-30 (WX mosaic NEXRAD VIP)

Human invoked `/run-swarm` with **cursor grok 4.6 high (non-fast)**. Execute
T02-68–72 only. Planning tickets must land on **`feature/wx-mosaic`** so
workers see them. Use isolated worktrees. Max 3 workers. Captain squash-merges
ticket branches into **`feature/wx-mosaic`**, not `master`. Do not push. Stop
after T02-72. Captain appends `SWARM-STATUS.md` after phase exit.

Every captain and worker uses **cursor-grok-4.6-high only, non-fast**.
Preserve untracked `.cursor/rules/caveman-ultra.mdc` and `e2e/`; do not stage
or delete them. Paid STT/TTS/LLM forbidden.

Execution waves:

1. T02-68
2. T02-69
3. T02-70 ∥ T02-71
4. T02-72

Product law: IEM N0Q WMS only; one ARP-centered GetMap; `/wx-iem` proxy;
scenario.arp fetch; data-driven VIP breaks; weather-module-only `drawImage`;
decode off rAF; DCB scope-only; preview unknown `INV`; display-only; `vipAtNm`
reserved for later deviate; no aircraft steering.

No push. No merge to `master`. No next phase.

---

---

## Twenty-second swarm planned — 2026-08-30 (PREF named SAVE AS, per-track PTL, STAR/SID transition amend, radar sites)

Adds a scope/procedures addendum on **`feature/pref-ptl-via-radar`**. WX
T02-68–72 already landed on `master`. Captain squash-merges ticket branches
into that feature branch. Isolated worktrees. Do not merge onto `master`
unless the human asks.

| Key | Value |
| --- | --- |
| Goal | Named PREF SAVE AS, per-track PTL toggle, controller STAR/SID transition amend, and authored radar sites with FUSED / MULTI / single-site paints and 1.0 s / 4.8 s reports |
| Include | **T02-73**, **T02-74**, **T04-43**, **T04-44**, **T04-45**, **T02-75**, **T02-76**, **T02-77** |
| Skip | T04-11 wind; phase 5; wake ATPA; WX mosaic (T02-68–72); 30 s coast; RF/hold/heading-leg FMS; `faa:update`; MODE FSL; redo T04-19 climb-via engine; live sensors; paid vendors |
| Stop | After T02-77 acceptance. Do not start phase 5 or merge to `master` without a new ask |
| Max ticket workers in flight | **3** |
| Merge lock | Only the phase captain squash-merges ticket branches to **`feature/pref-ptl-via-radar`**, then runs `npm test` / `npm run ci` |
| Model | **cursor-grok-4.6-high only, non-fast** on captain and every worker |
| Paid STT/TTS/LLM | **Forbidden** |

**Product law (twenty-second swarm — PREF / PTL / VIA / radar):**

- **PREF name is a PPI chord.** SAVE AS collects a short alnum name via the
  preview / status-line buffer (same no-dialog rule as FILTER). Enter commits
  to the first empty slot (slot 8 if all eight are full). Esc cancels. No
  `window.prompt`, no HTML `<input>`. Slot caps show the stored name.
- **Per-track PTL is session state.** CRC Table 24 `R` + slew. Ours: `*R` +
  click. Do not steal `*RR`. Not PREF (same as `*J` / `*P`). Global ALL / OWN
  / LNTH stay. Per-track on draws that track even if ALL/OWN are off.
  Per-track off hides that track when ALL is on. Length stays global.
- **Transition amend is catalog data.** Optional `transitionId` on
  `DESCEND_VIA` / `CLIMB_VIA` / `JOIN_PROCEDURE`. Join only at a matching
  common fix. Past the branch with no join → reject. No airport-id branch.
  Heading still cancels VIA. Do not flatten RF / hold / heading-only CIFP
  legs. T04-19 VIA_SID fly-through stays; T04-44 does not rebuild it.
- **Radar: truth vs report.** World / FMS / CA / MSAW stay 20 Hz truth. PPI
  symbol, datablock, PTL, history, and ATPA cones use the last surveillance
  report. Default boot is FUSED.
- **Report periods (frozen).** FUSED = **1.0 s** (R07 fusion). Single site
  and MULTI (nearest covering site) = that site’s `periodMs`, **4800** for
  airport / ASR rows. Out of coverage: no paint. No 30 s coast.
- **Site paints (frozen, operator shots).** FUSED = current blue circle puck
  (`TARGET_PUCK_BG`). MULTI = small filled blue rectangle, **long axis
  perpendicular to PTL / history**. Single-site = filled blue rectangle
  **facing the site** (long axis ⊥ radial), size grows with range, green
  far-side line ~30% longer than the blue block; very far is outline only.
  BRITE PRI tints the
  position mark. Glyph / stub stays on top. History dots unchanged.
- **Sites are authored JSON.** `kind: "asr" | "airport"`, ENU or lat/lon→ENU,
  `rangeNm`, `periodMs`. Trainer-authored, not NAS adaptation. Empty
  `radarSites` → implicit FUSED, no SITE buttons. MODE FSL stays disabled.
- **Generic tests.** Synthetic catalogs / sites. No KATL production counts.
  KDEM stays the authored default.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-73 ∥ T02-74 ∥ T04-45 | `feature/pref-ptl-via-radar` |
| B | T04-43 | Wave A |
| C | T04-44 ∥ T02-75 | T04-43, T04-45 |
| D | T02-76 | T02-75 |
| E | T02-77 | T02-76, T04-44 |

**Ticket ownership:**

- T02-73 owns PREF SAVE AS name chord and slot-cap names. Owns preview name prompt.
- T02-74 owns per-track PTL session map and `*R` click (not `*RR`). If both
  Wave A workers touch `previewArea.ts`, T02-73 owns SAVE AS prompt; T02-74
  owns `*R` parse only. Captain rebases, no force.
- T04-45 owns `RadarSite` schema, loader, and KDEM/KATL authored fixtures.
- T04-43 owns STAR `transitionId` on DESCEND_VIA / JOIN and catalog join.
- T04-44 owns SID `transitionId` on CLIMB_VIA / JOIN; does not redo T04-19.
- T02-75 owns the display sampler, report pose, history-on-report, and the
  three site paints.
- T02-76 owns live SITE DCB submenu and SSA radar word.
- T02-77 owns end-to-end acceptance, backlog, and leftover honesty.

**Ticket files / branches:**

- `ticket/T02-73-pref-save-as-named-sets` ← `phases/02-scope/tickets/T02-73-pref-save-as-named-sets.md`
- `ticket/T02-74-per-track-ptl` ← `phases/02-scope/tickets/T02-74-per-track-ptl.md`
- `ticket/T04-43-star-descend-via-transition-amend` ← `phases/04-procedures/tickets/T04-43-star-descend-via-transition-amend.md`
- `ticket/T04-44-sid-climb-via-transition-amend` ← `phases/04-procedures/tickets/T04-44-sid-climb-via-transition-amend.md`
- `ticket/T04-45-radar-site-schema-and-scenario-fixtures` ← `phases/04-procedures/tickets/T04-45-radar-site-schema-and-scenario-fixtures.md`
- `ticket/T02-75-surveillance-display-sampler` ← `phases/02-scope/tickets/T02-75-surveillance-display-sampler.md`
- `ticket/T02-76-site-dcb-and-ssa-radar-word` ← `phases/02-scope/tickets/T02-76-site-dcb-and-ssa-radar-word.md`
- `ticket/T02-77-radar-sites-integration-and-acceptance` ← `phases/02-scope/tickets/T02-77-radar-sites-integration-and-acceptance.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 2/4 addendum (T02-73–77 / T04-43–45 PREF, PTL, VIA, radar sites)
Merged: T02-73, T02-74, T04-45, T04-43, T04-44, T02-75, T02-76, T02-77
Tests: npm test / npm run ci exit 0
Manual leftover: <Chrome SITE FUSED/MULTI/site walk or none>
Notes: <PREF name chord; *R PTL; transitionId; FUSED circle / MULTI rect / site green slash; 1.0s / 4.8s; no 30s coast>
```

or `PHASE EXIT BLOCKED` with reason.

## Twenty-second swarm execution — 2026-08-30 (PREF / PTL / VIA / radar sites)

Human said use worktrees and implement. Captain owns
**`feature/pref-ptl-via-radar`**. Isolated worktrees from that feature.
Max 3 workers. Model **cursor-grok-4.6-high** only, non-fast. WX T02-68–72
is already on `master`. Do not merge to `master` unless asked. Do not push.

Execution waves:

1. T02-73 ∥ T02-74 ∥ T04-45
2. T04-43
3. T04-44 ∥ T02-75
4. T02-76
5. T02-77

---

## Twentieth swarm planned — 2026-08-30 (catalog retrieve, margin snap, Path C candidates)

This configuration is planning-only until `/run-swarm` execution begins. It
extends phase 3 voice/parse for large CIFP catalogs. Existing swarm history
stays intact. Ticket workers branch from current `master` after the
prerequisite snap (below) is on `master`. Captain squash-merges to `master`.

| Key | Value |
| --- | --- |
| Goal | Rank spoken fix/navaid/approach tokens against the **full** facility catalog. Snap a unique high-margin winner locally. On tie or weak score, do not invent an id — treat the identifier as ungrounded so Path C can run with a **retrieved** candidate list, not file-order 64. Stop dumping the first 64 registry ids into STT. |
| Include | **T03-16**, **T03-17**, **T03-18**, **T03-19**, **T03-20** |
| Prerequisite | Squash-merge `fix/katl-spoken-approach-and-fix-grounding` onto `master` before Wave A if it is not already there (CIFP `I26R` / Haynes→`HAINZ` / AJ→`AJAAY` unique snap; local cap 4096). Do not re-implement that snap. |
| Skip | Second LLM besides Path C `/parse`; always-on LLM after STT; dumping the full catalog into STT or Path C prompts; paid vendors; replacing Path A; kinematics/pilot executor; phase 5 scoring; KATL-only runtime branches |
| Stop | After T03-20 acceptance. Do not start a later phase without a new swarm section. |
| Max ticket workers in flight | **3** |
| Merge lock | Only the phase captain squash-merges ticket branches to `master`, then runs `npm test` / `npm run ci` |
| Model | **cursor-grok-4.6-high only, non-fast** on captain and every worker |
| Paid STT/TTS/LLM | **Forbidden** |

**Product law (twentieth swarm — catalog retrieve + margin snap):**

- **Retrieve, then maybe LLM.** Local ranker walks the full facility. Path C
  sees 8–16 **retrieved** ids for this transcript, never `ids().slice(0, 64)`
  and never the whole pack.
- **Margin, not raw argmax.** Snap only when `best ≥ floor` and
  (`unique` or `best − second ≥ margin`). Tie includes “too close.” Weak or
  empty cluster does not snap the least-bad 5-letter id.
- **Ungrounded identifier is not a finished Command.** Island/A/B that emit
  DIRECT/CROSS/VIA/APP with a raw unmatched token must **miss** so Path C can
  run. Do not validate `UNKNOWN_FIX` as the only salvage. Typed `DCT NOPE`
  still rejects at the pilot when Path C is off or also misses.
- **One salvage model.** Same `POST /parse`, miss-only, schema-checked
  Command IR. No extra round-trip that only rewrites names. No always-on
  post-STT LLM (PTT budget / Path A must still win unique snaps).
- **STT header is not a search index.** Do not send first-64 file-order ids.
  Either omit `X-ATC-Fixes` or send a tiny high-value prior (procedure names,
  published STAR/SID words). Retrieval from the transcript is Path C context,
  not the STT prompt.
- **Unique local snap stays the happy path.** Haynes / AJ / ILS 26R must stay
  `spoken_a` / `spoken_b` with catalog ids. Path C is salvage.
- **Generic tests.** Synthetic catalogs. No KATL production counts, map IDs,
  or facility-id branches. KDEM `ILS27` / `SEMAX` fixtures stay green.
- **Self-hosted only.** Path C remains our `speech-api`. No paid LLM hosts.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T03-16 | Prerequisite snap on `master` |
| B | T03-17 ∥ T03-19 | T03-16 |
| C | T03-18 | T03-16, T03-17 |
| D | T03-20 | T03-18, T03-19 |

**Ticket ownership:**

- T03-16 owns the spoken index and retrieve API over the full catalog
  (aliases, fold, optional metaphone, ranked candidates). It does not change
  Path C trigger or STT headers.
- T03-17 owns floor + margin snap and the ungrounded-id signal. It must not
  argmax without margin. Procedure/on-route ids are a **tie-break**, not a
  hard filter.
- T03-18 owns parse-pipeline behavior: ungrounded identifier → local miss;
  Path C `fixes=` / `approaches=` / `procedures=` = retrieved cluster.
  Same `/parse`. Update `phases/_shared/parse-pipeline.md` in this ticket or
  T03-20 — T03-18 writes the behavior, T03-20 may finish docs if split.
- T03-19 owns STT `X-ATC-Fixes` hygiene (none or tiny high-value prior).
- T03-20 owns end-to-end acceptance, phase 3 README ticket table, leftover
  honesty, and grep-ban paid hosts.

**Ticket files / branches:**

- `ticket/T03-16-spoken-catalog-index-and-retrieve` ← `phases/03-voice/tickets/T03-16-spoken-catalog-index-and-retrieve.md`
- `ticket/T03-17-margin-snap-for-catalog-ids` ← `phases/03-voice/tickets/T03-17-margin-snap-for-catalog-ids.md`
- `ticket/T03-18-ungrounded-id-path-c-candidates` ← `phases/03-voice/tickets/T03-18-ungrounded-id-path-c-candidates.md`
- `ticket/T03-19-stt-fix-header-hygiene` ← `phases/03-voice/tickets/T03-19-stt-fix-header-hygiene.md`
- `ticket/T03-20-catalog-retrieve-acceptance` ← `phases/03-voice/tickets/T03-20-catalog-retrieve-acceptance.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 3 voice addendum (T03-16–20 catalog retrieve + margin snap)
Merged: T03-16 … T03-20
Tests: npm test / npm run ci exit 0
Manual leftover: <Path C live Haynes-tie salvage or none>
Notes: <retrieve+margin; ungrounded miss; Path C candidates not slice-64; STT header hygiene; no second LLM; unique snap still local>
```

or `PHASE EXIT BLOCKED` with reason.

## Twentieth swarm execution — 2026-08-30 (catalog retrieve, margin snap, Path C candidates)

Human invoked `/run-swarm` with **cursor grok 4.6 high (non-fast)**. Execute
**T03-16–20** only. Planning is the twentieth swarm section above (tickets
under `phases/03-voice/tickets/`). Captain squash-merges each ticket onto
**`master`**. Do **not** start phase 5. Do **not** redo T04-36–42. Do **not**
push.

Role: **captain** owns the merge lock on `master`. Isolated worktrees. At
most three workers. Wait for terminal `READY TO MERGE` or `BLOCKED`. Every
captain and worker spawn must set `model: "cursor-grok-4.6-high"`. Non-fast.

Prerequisite before Wave A: squash-merge
`fix/katl-spoken-approach-and-fix-grounding` onto `master` if that unique
snap (CIFP `I26R` / Haynes→`HAINZ` / AJ→`AJAAY`, local cap 4096) is not
already there. Land planning tickets (`chore/T03-16-20-catalog-retrieve-swarm`)
on `master` so workers see T03-16–20 files. Do not re-implement the snap.

Preflight: preserve untracked `.cursor/rules/caveman-ultra.mdc` and `e2e/`
QA artifacts. Do not reset/clean. Do not touch speech vendor rules, phase 5,
or unrelated tickets.

Execution waves:

1. T03-16
2. T03-17 ∥ T03-19
3. T03-18
4. T03-20

Product law: retrieve then maybe Path C; floor+margin snap, never raw
argmax; ungrounded identifier is a local miss; Path C `fixes=` is an 8–16
retrieved cluster, not `ids().slice(0, 64)`; STT header is not a search
index; one salvage model (`POST /parse`); unique Haynes/AJ/ILS26R stay
local; synthetic tests only; no paid LLM hosts.

No push. Stop after T03-20. Captain runs `npm run ci` after each merge and
at phase exit, appends `SWARM-STATUS.md`, and returns the exact phase
result format above.

---

## Nineteenth swarm planned — 2026-08-29 (CRC A80 videomap import)

This configuration is planning-only until `/run-swarm` execution begins. It
adds an offline, permissioned CRC/vNAS videomap conversion phase. Existing
swarm history stays intact. Execution branch is
`feature/crc-a80-videomaps`, created from current `master`; the captain
squash-merges ticket branches into that feature branch. Push that feature
branch only after phase exit.

| Key | Value |
| --- | --- |
| Goal | Import complete permitted A80 STARS videomap inventory into the existing `arp-enu-nm` trainer format, preserve CRC map identity, model CRC map groups, and make every imported map reachable through GEO MAPS or map-ID commands |
| Include | **T04-36**, **T04-37**, **T04-38**, **T04-39**, **T04-40**, **T04-41**, **T04-42** |
| Source | Local CRC cache: `C:\Users\Ben\AppData\Local\CRC\ARTCCs\ZTL.json` plus `C:\Users\Ben\AppData\Local\CRC\VideoMaps\ZTL\`; select maps tagged `A80` and `STARS`; scenario ARP supplies projection origin |
| Output | Committed, permissioned converted KATL A80 trainer maps; local source CRC cache and generated national/intermediate data remain uncommitted |
| Skip | Runtime CRC/vNAS fetch; ERAM/Cab/ASDE-X semantics; chart scraping; proprietary fonts; OSM; map identity renumbering; unrelated phase 5 work |
| Stop | After T04-42 acceptance. Do not start phase 5 or live FAA/vNAS update automation |
| Max ticket workers in flight | **3** |
| Merge lock | Only phase captain squash-merges ticket branches to `feature/crc-a80-videomaps`, then runs `npm test` / `npm run ci` |
| Model | **cursor-grok-4.6-high only, non-fast** on captain and every worker |
| Paid STT/TTS/LLM | **Forbidden** |

**Source facts frozen for this swarm:** ZTL `ARTCCs\ZTL.json` contains
`facility.childFacilities[0]` Atlanta TRACON, its `starsConfiguration.videoMapIds`,
and fourteen `mapGroups`. The A80 inventory contains 90 assigned maps, while
each group supplies up to six MAIN plus 32 submenu assignments. Map metadata
comes from `videoMaps[]`; geometry comes from the matching ULID-named
`.geojson` file. CRC `starsId` remains identity. DCB position is separate
layout metadata. A→`map`, B→`mapDim`.

**Product law (nineteenth swarm — CRC A80 videomap import):**

- **Offline conversion only.** Developer tooling reads the explicit local CRC
  paths above. Browser/runtime never reads CRC files, calls vNAS, or parses a
  national source pack.
- **Complete inventory.** Facility-assigned A80 STARS maps remain loadable even
  when absent from a selected DCB group. GEO MAPS and map-ID lookup must reach
  DCB maps and GEO-only maps.
- **Identity is not renumbered.** Preserve CRC `starsId` and source ULID. DCB
  slots are group layout positions, not replacement map IDs. Do not use dense
  1–30 numbering as map identity.
- **ARP projection.** Convert WGS84 GeoJSON `[lon, lat]` to `[eastNm, northNm]`
  using selected scenario ARP and existing `latLonToNm`. Do not bake KATL ENU
  into reusable source data.
- **Geometry policy.** Support LineString, MultiLineString, Polygon outline,
  and Point text. Skip null/empty/default features and invalid zero vertices
  with deterministic diagnostics. Preserve stroke-font labels as polylines.
- **Map groups are data.** Preserve group order, TCP assignments, MAIN order,
  submenu order, duplicates, and empty slots where source semantics require
  them. No A80-specific runtime branch.
- **Brightness stays separate.** CRC A/B maps become existing `map`/`mapDim`
  channels. BRITE changes intensity; it does not change map availability.
- **Legal boundary.** Human confirms permission to commit converted maps.
  Record source/provenance in committed metadata. Do not commit local CRC
  cache, secrets, caches, or unrelated QA screenshots.
- **Performance is measured.** Import all maps first. Simplification, culling,
  or lazy loading requires measured acceptance evidence and must preserve
  reproducible unsimplified conversion.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T04-36 | `feature/crc-a80-videomaps` |
| B | T04-37 ∥ T04-38 | T04-36 |
| C | T04-39 | T04-37, T04-38 |
| D | T04-40 ∥ T04-41 | T04-39 |
| E | T04-42 | T04-40, T04-41 |

**Ticket ownership:**

- T04-36 owns normalized CRC source metadata and schema split between stable
  internal map identity, `starsId`, and optional DCB layout.
- T04-37 owns offline GeoJSON conversion, ARP projection, geometry cleanup,
  deterministic output, and converter diagnostics.
- T04-38 owns CRC facility/map-group extraction and preserved group layout.
- T04-39 owns full permitted A80/KATL generation, manifest, attribution, and
  committed converted output.
- T04-40 owns runtime map identity, GEO/CURRENT reachability, high-ID lookup,
  and DCB group-slot rendering without renumbering.
- T04-41 owns rendering compatibility, A/B brightness, large-map behavior,
  and measured performance safeguards.
- T04-42 owns end-to-end acceptance, CI, docs, and migration guardrails.

**Ticket files / branches:**

- `ticket/T04-36-crc-videomap-source-schema` ← `phases/04-procedures/tickets/T04-36-crc-videomap-source-schema.md`
- `ticket/T04-37-crc-geojson-converter` ← `phases/04-procedures/tickets/T04-37-crc-geojson-converter.md`
- `ticket/T04-38-crc-map-groups-and-dcb-layout` ← `phases/04-procedures/tickets/T04-38-crc-map-groups-and-dcb-layout.md`
- `ticket/T04-39-a80-videomap-pack-generation` ← `phases/04-procedures/tickets/T04-39-a80-videomap-pack-generation.md`
- `ticket/T04-40-videomap-identity-and-geo-reachability` ← `phases/04-procedures/tickets/T04-40-videomap-identity-and-geo-reachability.md`
- `ticket/T04-41-videomap-rendering-and-performance-acceptance` ← `phases/04-procedures/tickets/T04-41-videomap-rendering-and-performance-acceptance.md`
- `ticket/T04-42-a80-videomap-integration-and-acceptance` ← `phases/04-procedures/tickets/T04-42-a80-videomap-integration-and-acceptance.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 4 procedures addendum (T04-36–42 CRC A80 videomap import)
Merged: T04-36 … T04-42
Tests: npm test / npm run ci exit 0
Manual leftover: <Chrome KATL map/group walk or none>
Notes: <local CRC ZTL/A80 source; complete inventory; ARP conversion; CRC identity preserved; map groups; GEO reachability; no runtime vNAS>
```

or `PHASE EXIT BLOCKED` with reason.

## Nineteenth swarm execution — 2026-08-29 (CRC A80 videomap import)

Human invoked `/run-swarm` with **cursor grok 4.6 high**. Execute T04-36–42
only. Planning commits `fdd5155`, `8d91110`, and `037812b` are on
`feature/crc-a80-videomaps` (cut from current `master` `47d2ad0`). Ticket
workers branch from that feature base. Captain squash-merges each ticket
into `feature/crc-a80-videomaps`. Do **not** merge this swarm onto `master`.
Push is the parent’s job after phase exit.

Role: captain owns the merge lock on `feature/crc-a80-videomaps`. Isolated
worktrees. At most three workers. Wait for terminal `READY TO MERGE` or
`BLOCKED`. Every captain and worker spawn must set
`model: "cursor-grok-4.6-high"`. Non-fast.

Preflight: working tree clean except untracked
`.cursor/rules/caveman-ultra.mdc` and `e2e/` QA artifacts — preserve them.
Do not reset/clean. Do not touch speech vendor rules, phase 5, or unrelated
tickets.

Execution waves:

1. T04-36
2. T04-37 ∥ T04-38
3. T04-39
4. T04-40 ∥ T04-41
5. T04-42

Frozen source: local CRC metadata
`C:\Users\Ben\AppData\Local\CRC\ARTCCs\ZTL.json`; geometry
`C:\Users\Ben\AppData\Local\CRC\VideoMaps\ZTL\<ULID>.geojson`. A80 selection
uses Atlanta TRACON `facility.childFacilities[0].starsConfiguration.videoMapIds`
and maps tagged A80 + STARS. Scenario ARP is projection origin. Preserve CRC
`starsId`; DCB slots are layout only. A→`map`, B→`mapDim`. Runtime never
reads CRC/vNAS. Commit converted maps with permission/provenance; never
commit local source cache, secrets, caches, or QA screenshots.

No push. No phase 5. At completion, captain runs `npm run ci`, appends
`SWARM-STATUS.md`, and returns the exact phase result format above.

---

Paste **this entire file** into a new agent. That agent is the **orchestrator**. It may run for hours. It writes almost no application code.

Workspace: `/home/ben/ATC-SIM`
Shell: **bash** (Linux).

## Mandatory first action

Before checking git, spawning agents, creating worktrees, or editing application code, update this file for the current swarm. Append a new swarm-start heading/configuration; do not overwrite prior swarm history. If the requested swarm configuration is incomplete, ask before making any other swarm move. Then commit the planning/status update before creating ticket branches or worktrees.

This is the **eighteenth swarm**. Phases **0 → 1 → 2 (T02-01–13) → 2 polish (T02-14–21) → 2 DCB addendum (T02-22–30) → 2 physical replica (T02-31–33) → 3 → 4 (T04-01–10, T04-12) → 4 addenda (T04-13–25) → 2 STARS CRC scope fidelity (T02-34–42) → 5 setup menu (T05-13, T05-14) → 4 dual runway (T04-26–30) → 2 TPA / ATPA (T02-43–50) → 2 STARS Preview Area (T02-51–54) → 2 STARS In-Scope System Lists & Complete DCB (T02-55–60) → 2 STARS Keyboard Commands & Preview Area Expansion (T02-61–67)** are already green on `master`. Do **not** redo completed work. Skip **T04-11** (wind) unless the human names it. This run is **T04-31–35 only**.

---

## Eighteenth swarm execution — 2026-08-29 (CIFP-derived catalog packs)

Human invoked `/run-swarm` with **cursor grok 4.6 high**. Execute T04-31–35
only. Planning commits `317bc86`, `d2df65e`, and `f92894f` contain this configuration
and must be present on the execution base before ticket work starts.

Role: orchestrator coordinates one captain. Captain uses isolated worktrees,
spawns at most three workers, waits for terminal `READY TO MERGE` or
`BLOCKED`, squash-merges each ticket to `master`, and runs `npm test` after
each merge. Every captain and worker spawn must set
`model: "cursor-grok-4.6-high"`.

Preflight: verify `master` contains the planning commits, read
`SWARM-STATUS.md`, phase README, captain/worker prompts, and T04-31–35. Stop
if application changes are dirty or another swarm is active. Preserve
untracked `.cursor/rules/caveman-ultra.mdc` and `e2e/`.

Execution waves:

1. T04-31
2. T04-32 ∥ T04-33
3. T04-34
4. T04-35

No push. No phase 5. At completion, captain returns the exact phase result
format above; orchestrator verifies `master`, runs final `npm run ci`, appends
`SWARM-STATUS.md`, and stops.

**Scope correction — 2026-08-29:** Human clarified that generated packs must
cover supported **SIDs, STARs, and approaches**. T04-31 parses SID records;
T04-33 closes SID references; T04-34 emits SID data. SID *flying* remains out
of scope unless separately approved.

---

## Eighteenth swarm planned — 2026-08-29 (CIFP-derived catalog packs)

This configuration is planning-only until the human invokes `/run-swarm`. It
extends phase 4 procedures. Ticket workers must branch from current `master`;
the captain squash-merges completed tickets back to `master`.

| Key | Value |
| --- | --- |
| Goal | Convert official local FAA CIFP data once into the existing `ProcedureCatalog` schema, then generate small scenario-ready catalog packs from a geographic seed plus procedure-reference closure. Remove KATL-specific extraction logic without putting national CIFP or ARINC parsing in the browser. |
| Include | **T04-31**, **T04-32**, **T04-33**, **T04-34**, **T04-35** |
| Skip | T04-11 wind; chart scraping; browser CIFP fetch; paid services; full FAA cycle or full derived national dump in git; RNAV/holds/RF flying; unrelated phase 5 scoring/replay |
| Stop | After T04-35 acceptance. Do not start phase 5 or live FAA update automation beyond the approved local-input developer tool. |
| Max ticket workers in flight | **3** |
| Merge lock | Only the phase captain squash-merges ticket branches to `master`, then runs `npm test` / `npm run ci` |
| Model | Inherit |
| Paid STT/TTS/LLM | Forbidden |

**Product law (eighteenth swarm — CIFP-derived catalog packs):**

- **One source conversion.** A local CIFP file is parsed by a developer tool
  into a normalized intermediate representation, then emitted into the
  existing catalog schema. Runtime code does not parse ARINC 424.
- **Pack selection is two-stage.** Radius around scenario ARP is a geographic
  seed. Selected STARs, approaches, and their referenced fixes/navaids are
  then recursively included until reference closure is stable. Radius alone
  must never silently truncate a procedure.
- **Coordinates stay portable.** Preserve source `latDeg` / `lonDeg`; derive
  scenario-local `xNm` / `yNm` when loading a pack. Do not bake one facility's
  ENU projection into national source data.
- **Runtime contract stays stable.** `loadCatalog(icao)`, catalog validation,
  fix registry, FMS walkers, scenario inventory, and video-map loading remain
  generic. New airports require data, not airport-id branches.
- **Separate layers stay separate.** CIFP procedure geometry, authored scenario
  routes/spawns, video-map artwork, MVA/ATPA, and telephony remain distinct.
  CIFP-derived packs may contain only fields the current schema can represent.
- **Legal and distribution boundary.** Input CIFP is local and gitignored.
  Generated national/intermediate data is not committed. Only intentionally
  selected, reviewable trainer packs may be committed. No browser network
  fetch, chart scrape, or vendor API.
- **Compatibility before migration.** KDEM remains authored and default.
  Existing KATL behavior must remain green while its pack is regenerated by
  the generic tool.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T04-31 | Current `master` |
| B | T04-32 ∥ T04-33 | T04-31 |
| C | T04-34 | T04-32, T04-33 |
| D | T04-35 | T04-34 |

**State ownership:**

- T04-31 owns the normalized CIFP importer interface and record-to-schema
  mapping. It must extend fixture coverage without importing tools from
  `src/`.
- T04-32 owns the reusable geographic seed/index and pack output boundaries.
- T04-33 owns procedure-reference closure, missing-reference diagnostics, and
  radius-vs-closure tests. It must not duplicate T04-32's spatial index.
- T04-34 owns generic CLI wiring and KATL regeneration through the pack
  pipeline. It may update committed KATL JSON, never add a KATL-only runtime
  branch.
- T04-35 owns end-to-end acceptance, docs, and migration guardrails. It adds
  no second parser or alternate catalog loader.

**Backlog ownership:**

| Ticket | Backlog edit |
| --- | --- |
| T04-31 | Documents unsupported CIFP behaviors retained as authored/unsupported |
| T04-32 | Documents national-source storage and pack-generation boundary |
| T04-33 | Documents radius seed limitations and closure requirement |
| T04-34 | Closes the KATL-specific extractor follow-up if generic regeneration passes |
| T04-35 | Updates remaining `faa:update` / RNAV / SID limitations without deleting prior rows |

**Ticket files / branches:**

- `ticket/T04-31-cifp-normalized-source-parser` ← `phases/04-procedures/tickets/T04-31-cifp-normalized-source-parser.md`
- `ticket/T04-32-cifp-spatial-index-and-pack-seed` ← `phases/04-procedures/tickets/T04-32-cifp-spatial-index-and-pack-seed.md`
- `ticket/T04-33-cifp-procedure-reference-closure` ← `phases/04-procedures/tickets/T04-33-cifp-procedure-reference-closure.md`
- `ticket/T04-34-generic-cifp-pack-cli-and-katl-migration` ← `phases/04-procedures/tickets/T04-34-generic-cifp-pack-cli-and-katl-migration.md`
- `ticket/T04-35-cifp-pack-integration-and-acceptance` ← `phases/04-procedures/tickets/T04-35-cifp-pack-integration-and-acceptance.md`

**Captain return:**

```
PHASE EXIT GREEN
Phase: 4 procedures addendum (T04-31–35 CIFP-derived catalog packs)
Merged: T04-31 … T04-35
Tests: npm test / npm run ci exit 0
Manual leftover: <developer pack generation or none>
Notes: <local CIFP normalized once; radius seed plus procedure closure; generic KATL migration; no national/browser CIFP>
```

or `PHASE EXIT BLOCKED` with reason.

---

## Seventeenth swarm planned — 2026-08-28 (STARS Keyboard Commands & Preview Area Expansion)

This configuration runs on feature branch `feature/stars-keyboard-commands`, cut from `master`. Ticket workers branch from that base; the captain squash-merges back into that base.

| Key | Value |
| --- | --- |
| Goal | Complete vNAS / FAA STARS single-controller keyboard command set: unified Preview Area buffer lexer under SSA with `<Backspace>` / `<Esc>` / `<buffer> INV` flash; system list management (`*T`, `*TV`, `*TC`, `*TS`, `*P1`–`P3`, `*TM`, `*TX`, `*TN`) with line limits (`[1-100]`) and click-to-relocate (`* [List] [Click]` / `* S [Click]`); video map toggles (`*D [ID]`, `*D OFF [ID]`, `*D ALL`, `*D NONE`, `M [ID]`); scope display manipulation (`*C [Click]`, `*OFF`, `*RR [Spacing]`, `*RR C [Click]`, `*RR OFF`, `*PTL [Min]`, `*HIST [0-9]`); altitude filter controls (`*F`, `*LA [Floor] [Ceiling]`) and beacon filters (`*BCN [Code]`, `*BCN DEL [Code]`); standard tracking chords (`+ [Click]`, `+ [Callsign] Enter [Click]`, `/ [Click]`, `Enter [Click]` accept handoff, `* [Click]` pointout ack/highlight, `/ [Click DB]` PDB/FDB, `* [1-8]` leader line direction, `* 0` default leader, `*B` beacon readout); and strict focus isolation from the bottom radio command line (`#command-line-input`). |
| Player loop | `npm run dev` → type `*T` with scope focus → preview shows `*T` → `Enter` toggles TAB list → type `*D LOC27` `Enter` toggles localizer map → type `*RR 10` `Enter` changes range rings to 10 NM → type `+` click target initiates track → type `/` click target drops track → `Tab` key cleanly switches focus to `#command-line-input` for pilot radio commands. |
| Include | **T02-61**, **T02-62**, **T02-63**, **T02-64**, **T02-65**, **T02-66**, **T02-67** |
| Skip | T04-11; all completed work (T00–T02-60, T03-*, T04-*, T05-*); flight plan edit modals (`*F`, `*V`, `*A`, `*DEL`); scratchpads & assigned alt/spd/hdg (`* [Text]`, `* /[Text]`, `* [Alt]`, `*H`, `*S`); advanced track overrides (`+HOLD`, `+UNS`, `+R`, `/ALL`); multi-controller networking & coordination (`[Handoff ID]`, `[TCP ID]*`, `/*`, `INIT CONSOL`, `DECONSOL`, `DISP CONSOL`, `QL`, `ZDE`, `ZCL`); weather radar reflectivity (`*WX`); CRDA ghost prediction (`*CRDA`); TDM ground targets (`*G`); conflict alert suppression (`*K`). |
| Stop | After T02-67 acceptance. Do not start flight plan modals or multi-controller networking. |
| Max ticket workers in flight | **3** |
| Merge lock | Only the phase captain squash-merges ticket branches to `feature/stars-keyboard-commands`, then runs `npm test` |
| Model | **cursor grok 4.6 high only.** `model: "cursor-grok-4.6-high"` on every captain and worker spawn. Not a fast model |
| Paid STT/TTS/LLM | **Forbidden** |

**Product law (seventeenth swarm — STARS Keyboard Commands & Preview Area Expansion):**

- **Two Isolated Pipes.** Preview Area is the scope command surface under the SSA. The bottom radio command line (`#command-line-input`) stays `DAL123 H270` → Command IR. Scope commands never emit Command, readback, or pilot intent. Keystrokes with scope focus never bleed into the radio input, and radio typing never alters the Preview Area. `<Tab>` strictly toggles keyboard focus between the two.
- **Unified Preview Machine.** All scope command entries buffer into `PreviewAreaState.buffer` and render under the SSA in real time. `<Backspace>` edits; `<Escape>` resets to idle; `<Enter>` commits; unrecognized commands flash `<buffer> INV` for 1.5 seconds.
- **Command-then-Slew Consistency.** Slew commands (`+ [Click]`, `+ [Callsign] Enter [Click]`, `/ [Click]`, `Enter [Click]`, `* [Click]`, `* [List] [Click]`, `* S [Click]`, `* C [Click]`, `* RR C [Click]`) arm the scope, and the subsequent canvas click completes the action.
- **Data-Driven Map & List Identifiers.** Video maps match by catalog slot number (1–32) or map ID (`RWY`, `LOC27`, `DEM1_27`, etc.). System lists match standard STARS abbreviations (`T`/`TAB`, `TV`, `TC`, `TS`, `P1`–`P3`, `TM`, `TX`, `TN`, `S`).
- **Exact STARS Syntax.** ATPA and J-Rings strictly use `*J [Radius]`, `*J 0`, `*AI [Click]`, `*AE Enter`. No pseudo-text keywords, no dot commands.
- **Zero simulation regressions.** Kinematics, SIDs/STARs, ILS, dual-runway, radio telephony, DCB, and in-scope draggable system lists stay 100% operational.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-61 | Base `feature/stars-keyboard-commands` |
| B | T02-62 ∥ T02-63 ∥ T02-64 ∥ T02-65 ∥ T02-66 | T02-61 |
| C | T02-67 | T02-62, T02-63, T02-64, T02-65, T02-66 |

**State ownership:**

- `src/scope/previewArea.ts` and `src/scope/scopeKeys.ts` are initialized in T02-61 with the unified buffer lexer and extended in T02-62 through T02-66.
- `src/scope/systemLists.ts` is modified in T02-62 for command toggling and slew relocation.
- `src/scope/dcbFunctions.ts` is modified in T02-63 for map command parsing and token resolution.
- `src/scope/camera.ts` and range ring state are modified in T02-64.
- `src/scope/altitudeFilter.ts` is modified in T02-65.
- `src/scope/trackDisplay.ts`, `ownership.ts`, and `leader.ts` are modified in T02-66.

**Ticket files / branches:**

- `ticket/T02-61-stars-command-buffer-lexer-and-scope-capture` ← `phases/02-scope/tickets/T02-61-stars-command-buffer-lexer-and-scope-capture.md`
- `ticket/T02-62-system-list-management-and-slew-relocate` ← `phases/02-scope/tickets/T02-62-system-list-management-and-slew-relocate.md`
- `ticket/T02-63-video-map-display-commands` ← `phases/02-scope/tickets/T02-63-video-map-display-commands.md`
- `ticket/T02-64-scope-centering-range-rings-ptl-and-history` ← `phases/02-scope/tickets/T02-64-scope-centering-range-rings-ptl-and-history.md`
- `ticket/T02-65-altitude-filters-and-beacon-code-preview` ← `phases/02-scope/tickets/T02-65-altitude-filters-and-beacon-code-preview.md`
- `ticket/T02-66-tracking-handoff-and-datablock-key-chords` ← `phases/02-scope/tickets/T02-66-tracking-handoff-and-datablock-key-chords.md`
- `ticket/T02-67-stars-commands-integration-and-acceptance` ← `phases/02-scope/tickets/T02-67-stars-commands-integration-and-acceptance.md`

Captain return:

```
PHASE EXIT GREEN
Phase: 2 Scope addendum (T02-61–67 STARS Keyboard Commands & Preview Area Expansion)
Merged: T02-61 … T02-67
Tests: npm test / npm run ci exit 0
Manual leftover: <Chrome preview command walk or none>
Notes: <unified preview lexer; list toggles & click relocate; map D-commands; scope centering/RR/PTL/HIST; altitude & beacon filters; track +, drop /, handoff accept Enter, datablock chords; zero radio bleeding>
```

or `PHASE EXIT BLOCKED` with reason.

---

## Seventeenth swarm execution — 2026-08-28 (STARS Keyboard Commands & Preview Area Expansion)

Human invoked `/run-swarm` on this file. Config complete; no open questions. Orchestrator+captain in one session (captain subagent cannot spawn workers). Merge lock is `feature/stars-keyboard-commands`, cut from current `master`. Ticket workers branch from that base; captain squash-merges back into that base. Do not merge this swarm onto `master`. Preserve unrelated dirty `src/` files and untracked QA artifacts; do not stage them.

Wave A is T02-61 alone in an isolated worktree. Wave B is five tickets with max 3 in flight: first T02-62 ∥ T02-63 ∥ T02-64, then T02-65 ∥ T02-66 after those three merge and rebase. Wave C is T02-67. Stop after T02-67. Do not push. Do not start flight plan modals or multi-controller networking.

---

## Sixteenth swarm planned — 2026-08-28 (STARS In-Scope System Lists & Complete DCB)

This configuration runs on feature branch `feature/stars-lists-and-dcb`, cut from `master`. Ticket workers branch from that base; the captain squash-merges back into that base.

| Key | Value |
| --- | --- |
| Goal | Full in-scope STARS system lists engine (TAB Flight Plan, VFR, Tower sequences, Alert list, Coast/Suspend, Coordination departures, Video Maps list) with middle-click drag/drop, collision detection warning frames, and 1:1 DCB parity with Vice (19-column MAIN grid, spinner mouse-drag delta & typed entry, continuous `PLACE CNTR` PPI panning, AUX `H_RATE`/`DWELL`/`CURSOR HOME`, 16-channel BRITE, 32-slot PREF, 22-filter SSA, and `Scale to Fit`). |
| Player loop | `npm run dev` → TAB list shows unassociated flights with `[MULTIFUNC]T` → middle-click list moves it across scope; dragging onto Tower list displays green overlap conflict frames → `[F13]` releases unreleased departure from Coordination list → DCB `RANGE` spinner steps on wheel or drag and accepts typed number → DCB `BRITE` opens 16-channel $12\times 2$ grid → DCB `PREF` displays 32 profiles with active highlight. |
| Include | **T02-55**, **T02-56**, **T02-57**, **T02-58**, **T02-59**, **T02-60** |
| Skip | T04-11; all completed work (T00–T02-54, T03-*, T04-*, T05-*); downstream FMS holding pattern navigation & crossing constraints (Phase 3); pointout lifecycle & TG mode expansions (Phase 4); multi-TRACON scenario importer (Phase 5). |
| Stop | After T02-60 acceptance. Do not start phase 3/4 navigation or command parsing. |
| Max ticket workers in flight | **3** |
| Merge lock | Only the phase captain squash-merges ticket branches to `feature/stars-lists-and-dcb`, then runs `npm test` |
| Model | **cursor grok 4.6 high only.** `model: "cursor-grok-4.6-high"` on every captain and worker spawn. Not a fast model |
| Paid STT/TTS/LLM | **Forbidden** |

**Product law (sixteenth swarm — STARS In-Scope System Lists & Complete DCB):**

- **Canvas-native System Lists.** All system lists (SSA, Preview Area, TAB, VFR, Tower, Alert, Coordination, Coast/Suspend, Video Maps, CRDA, MCI, Sign-On) render directly onto Canvas2D in STARS green, governed by `CHAR SIZE -> LISTS` (0–5) and `BRITE -> LST`.
- **Middle-Click Drag & Drop.** Clicking middle mouse button inside list bounds starts drag (green anchor frame + white moving frame); second click commits new normalized $[x, y]$ coords; Esc cancels.
- **Overlap Detection.** Colliding list bounds render green line-loop frames around both lists when not actively dragging.
- **DCB 19-Column Grid Parity.** Align MAIN DCB with Vice/STARS standard: `RANGE`, `PLACE CNTR`/`OFF CNTR`, `RR`, `PLACE RR`/`RR CNTR`, `MAPS`, Quick Maps, `WX` (with `AVL` badges), `BRITE`, `LDR DIR`/`LDR`, `CHAR SIZE`, `MODE FSL`, `SITE`, `PREF`, `SSA FILTER`/`GI TEXT FILTER`, `SHIFT`.
- **Spinner Physics.** Spinners step directly on mouse wheel over cell without opening submenus, capture vertical mouse drag when clicked, and accept direct numeric keyboard entry + Enter commit.
- **Zero simulation regressions.** Kinematics, SIDs/STARs, ILS, dual-runway, radio telephony, Preview Area command buffer, and ATPA/TPA stay 100% operational.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-55 ∥ T02-58 | Base `feature/stars-lists-and-dcb` |
| B | T02-56 ∥ T02-59 | T02-55 (56), T02-58 (59) |
| C | T02-57 | T02-56 |
| D | T02-60 | T02-57, T02-59 |

**State ownership:**

- `src/scope/systemLists.ts` and `src/scope/listFormatter.ts` are T02-55's. Later tickets (T02-56, T02-57) extend list formatters and selectors.
- `DisplayControlBar.tsx`, `dcbMenu.ts`, and `dcbFunctions.ts` are updated by T02-58 (MAIN grid & spinner physics) and extended by T02-59 (AUX, 16-channel BRITE, 32-slot PREF, 22-filter SSA).
- `ScopeView.systemLists` and `ScopeView.dcbScaleToFit` are persisted via `src/scope/dcbPref.ts`.

**Ticket files / branches:**

- `ticket/T02-55-in-scope-system-lists-core-and-middle-click-drag` ← `phases/02-scope/tickets/T02-55-in-scope-system-lists-core-and-middle-click-drag.md`
- `ticket/T02-56-flight-plan-tab-vfr-tower-and-alert-lists` ← `phases/02-scope/tickets/T02-56-flight-plan-tab-vfr-tower-and-alert-lists.md`
- `ticket/T02-57-coordination-and-video-maps-lists` ← `phases/02-scope/tickets/T02-57-coordination-and-video-maps-lists.md`
- `ticket/T02-58-dcb-main-grid-and-spinner-mouse-delta-pan` ← `phases/02-scope/tickets/T02-58-dcb-main-grid-and-spinner-mouse-delta-pan.md`
- `ticket/T02-59-dcb-aux-and-full-submenus-parity` ← `phases/02-scope/tickets/T02-59-dcb-aux-and-full-submenus-parity.md`
- `ticket/T02-60-dcb-scale-to-fit-scroll-and-ui-acceptance` ← `phases/02-scope/tickets/T02-60-dcb-scale-to-fit-scroll-and-ui-acceptance.md`

Captain return:

```
PHASE EXIT GREEN
Phase: 2 Scope addendum (T02-55–60 STARS In-Scope System Lists & Complete DCB)
Merged: T02-55 … T02-60
Tests: npm test / npm run ci exit 0
Manual leftover: <Chrome visual walk or none>
Notes: <in-scope draggable lists; overlap detection; full 19-col DCB; 16-ch BRITE; 32-slot PREF; 22-filter SSA; scale-to-fit>
```

or `PHASE EXIT BLOCKED` with reason.

---

## Fifteenth swarm planned — 2026-08-27 (STARS Preview Area)

This configuration runs on feature branch `feature/stars-preview-area`, cut from `master` at `5e9bc0f` (ATPA already on `master` via #9). Ticket workers branch from that base; the captain squash-merges back into that base.

| Key | Value |
| --- | --- |
| Goal | CRC STARS Preview Area for backed scope commands: buffer under the SSA, F3 INIT CNTL / F4 TERM CNTL command-then-slew plus FLID Enter, and Table 30 `B##` / `B####` beacon-code select. Radio `DAL123 H270` unchanged. |
| Player loop | `npm run dev` → F3 → preview shows **INIT CNTL** → click unowned arrival → owned white FDB; F3 `DAL123` Enter owns that callsign with nothing selected; F4 slew drops; `B4500` then unassociated 4500 paints □; `*J3` still arms/slews; radio heading still turns |
| Include | **T02-51**, **T02-52**, **T02-53**, **T02-54** |
| Skip | T04-11; all completed work (T00–T02-50, T03-*, T04-*, T05-*); **all pointouts** (`UN`, `**`, `(ID)*`, initiate/recall PO — leave existing click / radio-buffer `UN`/`**`); TERM CNTL ALL; typed TCP / Δ handoffs; quicklook; scratchpad `Y`/`+`; per-track PTL `R`; MULTIFUNC / F7 inhibit; highlight keyboard (stays middle-click); CRDA; WX; list relocate; RBL / `.dot` commands |
| Stop | After T02-54 acceptance. Do not start phase 5 scoring. |
| Max ticket workers in flight | **3** |
| Merge lock | Only the phase captain squash-merges ticket branches to `feature/stars-preview-area`, then runs `npm test` |
| Model | **cursor grok 4.6 high only.** `model: "cursor-grok-4.6-high"` on every captain and worker spawn. Not a fast model |
| Paid STT/TTS/LLM | **Forbidden** |

**Product law (fifteenth swarm — STARS Preview Area):**

- **Two pipes.** Preview Area is the CRC analog under the SSA. The bottom radio command line stays `DAL123 H270` → Command IR. Scope commands never emit Command, readback, or intent.
- **Command-then-slew.** Reuse T02-49 `starsChordArmed`: arm on the PPI, next target click applies, empty click does not consume the arm. No `window.prompt`, no extra HTML `<input>`. Esc cancels. Invalid commit flashes `INV` — reject unknown, never parse-and-no-op.
- **CRC mnemonics.** F3 paints `INIT CNTL`, F4 paints `TERM CNTL`, not the strings `"F3"` / `"F4"`. SSA/preview green via `drawChordHint`. A live `*` chord still wins the hint.
- **Implied form stays.** Select-then-F3 / select-then-F4 still apply immediately so T02-08 tests stay green. No-selection F3/F4 **arm** (today they no-op).
- **FLID lookup is scope-local.** `resolveScopeFlid`: full callsign, numeric tail, unique 4-digit squawk. Do **not** import `@pilot` or the radio parser from `@scope`.
- **Skip all pointouts this swarm.** Do not move `UN`/`**` onto the preview. Do not add `(ID)*`.
- **F-key jobs stay frozen.** F7 = PTL ALL (not MULTIFUNC). F1 = beaconator hold. `*` Table 36 stays T02-49. Trainer F3 is still a color/ownership stub (not NAS associate); F4 is still trainer drop. Pending inbound + INIT CNTL still `acceptInboundHandoff`.
- **Zero simulation regressions.** Kinematics, SIDs/STARs, ILS, dual-runway, radio telephony, DCB, ATPA, and `*J`/`*P` stay operational.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-51 | Base `feature/stars-preview-area` |
| B | T02-52 ∥ T02-53 | T02-51 |
| C | T02-54 | T02-52, T02-53 |

Wave B both extend `parsePreviewCommand` / `PreviewArmedAction` and `src/scope/scopeKeys.ts`. Use isolated sibling worktrees. T02-52 owns INIT/TERM, F3/F4 branches, `resolveScopeFlid`, and the PPI armed-slew path for those actions. T02-53 owns the `B` prefix, `beaconSelectCodes` toggle, and scope-focus `B` (never always-on). The captain rebases the second ticket after the first squash; extend the union, do not redefine it.

**State ownership:**

- Preview machine (`idle` \| `entry` \| `armed`, buffer, mnemonic, INV flash) is T02-51's. Later tickets **extend** `PreviewArmedAction`; they do not replace `previewArea.ts`.
- T02-52 is the only ticket that changes F3/F4 from selected-only apply to arm-when-unselected.
- T02-53 is the only ticket that writes `beaconSelectCodes` from the keyboard. `targetSymbol` □ paint stays T02-34 unless prefix matching requires a matcher tweak.
- T02-49 `starsChordArmed` / `*` parser is frozen. Preview Esc precedence: live preview > live `*` chord > DCB.
- Do not stage or edit `src/scope/starsFidelity.integration.test.ts` (unrelated dirty file on the planner tree). T02-54 adds a **new** integration file.

**Backlog ownership** (per `.cursor/rules/later-implementation-backlog.mdc`, each in the same commit as its slice):

| Ticket | Backlog edit |
| --- | --- |
| T02-51 | adds **STARS preview area — commands not parsed** (unparsed CRC tables; pointouts skipped; highlight stays middle-click; pointer to existing MULTIFUNC subsection) |
| T02-53 | updates that subsection: `B##` / `B####` now parsed; `BE`/`BI` and `M ####` remain later. Must not delete other rows |

**Ticket files / branches:**

- `ticket/T02-51-stars-preview-area-command-buffer` ← `phases/02-scope/tickets/T02-51-stars-preview-area-command-buffer.md`
- `ticket/T02-52-init-term-cntl-command-then-slew` ← `phases/02-scope/tickets/T02-52-init-term-cntl-command-then-slew.md`
- `ticket/T02-53-beacon-code-select-preview` ← `phases/02-scope/tickets/T02-53-beacon-code-select-preview.md`
- `ticket/T02-54-preview-area-integration-and-acceptance` ← `phases/02-scope/tickets/T02-54-preview-area-integration-and-acceptance.md`

Captain return:

```
PHASE EXIT GREEN
Phase: 2 Scope addendum (T02-51–54 STARS Preview Area)
Merged: T02-51 … T02-54
Tests: npm test / npm run ci exit 0
Manual leftover: <Chrome F3 INIT CNTL slew walk or none>
Notes: <preview ≠ radio; INIT/TERM command-then-slew + FLID; B## select; no pointouts; *J still arms>
```

or `PHASE EXIT BLOCKED` with reason.

---

## Fifteenth swarm execution — 2026-08-27 (STARS Preview Area)

Human invoked `/run-swarm` on this file. Config complete; no open questions. Orchestrator+captain in one session (captain subagent cannot spawn workers). Merge lock is `feature/stars-preview-area` at `679bf94` (planning) over `master` `5e9bc0f`. Preserve dirty `src/scope/starsFidelity.integration.test.ts` (`rect()` mock); do not stage it. Wave A is T02-51 alone in an isolated worktree. Stop after T02-54. Do not push. Do not start phase 5.

---

## Fourteenth swarm planned — 2026-08-26 (TPA / ATPA)

This configuration runs on feature branch `feature/atpa-tpa`, cut from `master` at `997902c`. Ticket workers branch from that base; the captain squash-merges back into that base.

| Key | Value |
| --- | --- |
| Goal | Real ATPA: adapted approach volumes, in-trail pairing and sequencing, predicted monitor/warning/alert status, wedge cones, datablock in-trail distance, live DCB TPA/ATPA cells; plus richer manual TPA (per-track rings, `*P` cones) and the STARS slew-chord parser that drives them |
| Player loop | `npm run dev` → two arrivals sequenced onto ILS 27 → trailing track shows a blue ATPA monitor cone pointing at its leader with the required mileage → closure turns the cone yellow, then orange, and the in-trail distance appears in the datablock → `*J3` on a slewed track still draws a manual J-ring |
| Include | **T02-43**, **T02-44**, **T02-45**, **T02-46**, **T02-47**, **T02-48**, **T02-49**, **T02-50** |
| Skip | T04-11; all completed work (T00–T02-42, T03-*, T04-*, T05-*); wake-category separation minima (see product law); multi-controller ATPA adaptation; CRDA |
| Stop | After T02-50 acceptance. Do not start phase 5 scoring. |
| Max ticket workers in flight | **3** |
| Merge lock | Only the phase captain squash-merges ticket branches to `feature/atpa-tpa`, then runs `npm test` |
| Model | **cursor grok 4.6 high only.** `model: "cursor-grok-4.6-high"` on every captain and worker spawn. Not a fast model |
| Paid STT/TTS/LLM | **Forbidden** |

**Product law (fourteenth swarm — TPA / ATPA):**

- **Separation minima are basic radar only.** 3 NM, reduced to 2.5 NM when both tracks of a pair are established on the same final inside 10 NM of the threshold. Cone length never varies by aircraft type. R07 states cone length is "the distance required by wake category or basic radar separation" but publishes **no matrix** — its CWT A–I table is only the datablock category letter with weight ranges. Do **not** fill a wake matrix from model recall. The gap is documented in `phases/LATER-IMPLEMENTATION-BACKLOG.md` by T02-44.
- **Minima live in JSON, not code.** `basicSeparationNm`, `reducedSeparationNm`, and `reducedWithinNm` are per-volume adaptation fields. No hardcoded 3 or 2.5 on a live path.
- **Volumes are data, walked by `approachId`.** A second airport or a third runway adds a volume row, never an `if`. Threshold and final course come from the referenced approach, which already exists for both `ILS27` and `ILS09`.
- **Frozen ATPA grammar (R07):** cone vertex on the trailing target, oriented toward its leader, length equal to the required in-trail minimum, tenths for non-whole values. Monitor cone in TPA blue. Warning cone yellow when the trailing track is predicted to violate within **45 s**. Alert cone orange when already violating or predicted within **24 s**. Alert supersedes warning supersedes monitor supersedes manual TPA cone.
- **Trainer deltas, stated in every ticket:** single TCP, so there is no per-position "adapted to display" matrix. No TDW white variant. No aural ATPA tone. Volumes are authored trainer geometry, not NAS adaptation.
- **CA is untouched.** T04-09 conflict alert stays `CA` datablock text plus tone. Still **no** 3 NM CA halo. Circles on this scope are TPA J-rings only.
- **Chords are scope-only.** `*J`, `*P`, `*A`, `*B`, `*D` chords resolve against the slewed track and emit scope actions. They never produce Command IR; `DAL123 H270` still turns.
- **Zero simulation regressions.** Kinematics, SIDs/STARs, ILS, dual-runway configuration, radio telephony, and DCB menus stay 100% operational.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T02-43 ∥ T02-49 | Base `feature/atpa-tpa` |
| B | T02-44 | T02-43 |
| C | T02-45 ∥ T02-46 | T02-44 |
| D | T02-47 ∥ T02-48 | T02-45, T02-46 (48 also needs T02-49) |
| E | T02-50 | T02-47, T02-48 |

Wave C and Wave D both touch `renderScope.ts` and `DisplayControlBar.tsx`; use isolated sibling worktrees and rebase the second ticket after each squash merge.

**State ownership (so parallel tickets do not redefine each other):**

- Global ATPA display flags live on `AtpaState` in `src/scope/tpa.ts`. T02-46 and T02-47 both add fields there; whichever merges first introduces them and the second **extends** rather than redefines. The captain resolves that collision at rebase, not by respawning either ticket.
- Per-track ATPA enable/inhibit flags live on `TrackDisplay`. Per-track manual TPA graphics (rings, cones, size inhibit) are T02-48's and are **session state, not PREF**.
- Only T02-47 bumps `DCB_PREF_SCHEMA_VERSION`. No other ticket touches the PREF schema.
- Only T02-45 defines the cone wedge. T02-48 reuses it for manual `*P` cones; a second wedge implementation is a review failure.

**Backlog ownership** (per `.cursor/rules/later-implementation-backlog.mdc`, each in the same commit as its slice):

| Ticket | Backlog edit |
| --- | --- |
| T02-44 | adds "ATPA separation criteria not yet modeled" — wake minima, adapted 2.5 NM conditions, per-position adaptation, TDW variant, aural alerting, authored volumes |
| T02-47 | rewrites "Real ATPA pairing and predicted geometry"; must not delete the T02-44 subsection |
| T02-48 | closes "Richer TPA controls" |

**Ticket files / branches:**

- `ticket/T02-43-atpa-approach-volume-schema-and-kdem-fixture` ← `phases/02-scope/tickets/T02-43-atpa-approach-volume-schema-and-kdem-fixture.md`
- `ticket/T02-44-atpa-in-trail-pairing-engine` ← `phases/02-scope/tickets/T02-44-atpa-in-trail-pairing-engine.md`
- `ticket/T02-45-atpa-cone-geometry-and-rendering` ← `phases/02-scope/tickets/T02-45-atpa-cone-geometry-and-rendering.md`
- `ticket/T02-46-atpa-intrail-distance-and-cone-mileage` ← `phases/02-scope/tickets/T02-46-atpa-intrail-distance-and-cone-mileage.md`
- `ticket/T02-47-dcb-tpa-atpa-submenu-live-cells` ← `phases/02-scope/tickets/T02-47-dcb-tpa-atpa-submenu-live-cells.md`
- `ticket/T02-48-richer-manual-tpa-rings-and-cones` ← `phases/02-scope/tickets/T02-48-richer-manual-tpa-rings-and-cones.md`
- `ticket/T02-49-stars-tpa-atpa-slew-chord-parser` ← `phases/02-scope/tickets/T02-49-stars-tpa-atpa-slew-chord-parser.md`
- `ticket/T02-50-tpa-atpa-integration-and-acceptance` ← `phases/02-scope/tickets/T02-50-tpa-atpa-integration-and-acceptance.md`

Captain return:

```
PHASE EXIT GREEN
Phase: 2 Scope addendum (T02-43–50 TPA / ATPA)
Merged: T02-43 … T02-50
Tests: npm test / npm run ci exit 0
Manual leftover: <Chrome ATPA walk or none>
Notes: <volumes as data; monitor/warning/alert; basic radar minima only; no CA halo>
```

or `PHASE EXIT BLOCKED` with reason.

---

## Thirteenth swarm execution — 2026-08-26

Human approved feature-branch execution on branch `feature/dual-runway-configuration`.

---

## Thirteenth swarm planned — 2026-08-26 (dual-runway configuration & selectors)

This configuration runs on feature branch `feature/dual-runway-configuration`. Ticket workers branch from that base; captain squash-merges back into that base.

| Key | Value |
| --- | --- |
| Goal | Dual-runway configuration support for KDEM (Runway 27 and reciprocal Runway 09): ILS 09 approach and navaids, dual-runway BAY1 SID and DEM1 STAR transitions, video maps, configuration-aware traffic spawning/departures, and dual Airport + Configuration dropdown selectors in Session Setup |
| Include | **T04-26**, **T04-27**, **T04-28**, **T04-29**, **T05-14**, **T04-30** |
| Skip | T04-11; all completed work (T00–T04-25, T05-01–13); third airport data; scoring/replay |
| Stop | After T04-30 acceptance. |
| Max ticket workers in flight | **2** |
| Merge lock | Only phase captain squash-merges ticket branches to `feature/dual-runway-configuration`, then runs `npm test` |
| Model | Inherit |
| Paid STT/TTS/LLM | Forbidden |

**Product law:**
- **Data-First Multi-Runway Extensibility:** All navaids, fixes, approaches, SIDs, and STARs are defined via JSON in `src/scenario/data/kdem/`. No hardcoded runway switches in FMS or kinematics.
- **Runway 09 Geometry:** Threshold `RW09` at `(-1.645, 0)` (10,000 ft runway, opposite `RW27` at `(0, 0)`), heading 090°.
- **Dual-Runway Procedures:** `BAY1` departure supports runway transitions `27` and `09`. `DEM1` STAR supports West Flow (`N`, `S` $\to$ `MERGE`) and East Flow (`WN`, `WS` $\to$ `WMERG`).
- **Configuration-Aware Spawning:** Active scenario configuration dictates arrival STAR transitions, departure roll pose, and downwind spawn offsets.
- **Dual Selectors in Session Setup:** Session Setup UI provides separate Airport and Configuration selectors derived purely from inventory metadata.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T04-26 | Current `master` / base |
| B | T04-27 | T04-26 |
| C | T04-28 ∥ T04-29 | T04-27 |
| D | T05-14 | T04-28 |
| E | T04-30 | T04-29, T05-14 |

---

## Twelfth swarm execution — 2026-08-26

Human approved feature-base execution. Worktree base is `feature/session-setup`; captain merges only into that branch. Do not push or merge feature work into `master`.

---

## Twelfth swarm captain start — 2026-08-26

Captain executes **T04-24**, **T04-25**, then **T05-13** from `feature/session-setup`. Workers use isolated worktrees based on that branch; captain alone squash-merges each ready ticket back into `feature/session-setup`, runs `npm test` after every merge, then runs `npm run ci`. Wave A is T04-24 ∥ T04-25 (two workers maximum); Wave B is T05-13 after both merge and existing T04-21 behavior is verified. Keep untracked `.cursor/rules/caveman-ultra.mdc` and `e2e/` artifacts untouched. Scope stops after T05-13; manual UI acceptance remains an explicit leftover.

---

## Twelfth swarm planned — 2026-08-26 (session setup)

This configuration runs from feature base `feature/session-setup`, created by merging the planning branch. Ticket workers branch from that base; captain squash-merges back into that base. It builds session setup foundations and menu only; it does not begin Phase 5 scoring.

| Key | Value |
| --- | --- |
| Goal | Inventory-driven airport/scenario picker plus deterministic arrival count/rate and existing departure-rate controls in a setup/restart menu |
| Include | **T04-24**, **T04-25**, **T05-13** only |
| Skip | T04-11; all completed work; T05-01–12; second airport data; live traffic edits; DCB PREF; radio-frequency Command IR |
| Stop | After T05-13. No scoring, replay, imperfect pilots, second position, or phase acceptance script. |
| Max ticket workers in flight | **2** |
| Merge lock | Only phase captain squash-merges ticket branches to `feature/session-setup`, then runs `npm test` |
| Model | **GPT-5.6 Luna Medium only.** `model: "gpt-5.6-luna-medium"` on every newly spawned worker |
| Paid STT/TTS/LLM | Forbidden |

**Product law:**

- Airport/scenario options come only from T04-24 playable inventory. No hardcoded KDEM, ICAO, or scenario-id picker list.
- T04-25 normal arrival count/rate stays catalog STAR inbound/VIA. `?traffic=N` remains heading-090 downwind FPS benchmark.
- T04-21 remains departure-rate implementation. T05-13 never shows an active control for unavailable scenario capability.
- Apply/restart creates a new World only after confirmation. No live add/remove/reposition controls.
- `atc-sim.session.v1` stores session setup draft only. It does not replace DCB PREF or trainer settings.

**Waves:**

| Wave | Tickets | Wait for |
| --- | --- | --- |
| A | T04-24 ∥ T04-25 | T04-23 on `master` |
| B | T05-13 | T04-21, T04-24, T04-25 |

Before execution: merge this planning branch into `feature/session-setup`, verify no swarm is in flight, then create isolated worktrees from that base. Captain records manual restart confirmation honestly and stops after T05-13. Do not merge feature work into `master` in this swarm.

---

## Eleventh swarm started — T02-39–42 STARS CRC datablock & scratchpad fidelity addendum

Orchestrator planning **2026-08-26**. Human requested tickets for dual scratchpad auto-derivation, ground speed tens & category indicators, multi-phase time-sharing with center handoff placement, and Special Purpose Codes (docs.virtualnas.net/crc/stars). Historical swarms 1–10 stay green. This run is **T02-39–42 only**. Not phase 5. Not a redo of T00–T02-38.

| Key | Value |
| --- | --- |
| Goal | Complete datablock fidelity alignment with STARS CRC (docs.virtualnas.net/crc/stars): dual scratchpad state (`sp1`, `sp2`) with automatic derivation from clearances (approach shorthand `I27`/`R22L`/`V28`, interim alt `040`, speed `S21`), tens-based groundspeed (`18`, `25`) & wake/RNAV category indicators (`18H`, `25R`), multi-phase Line 2 time-sharing (left Mode C/SP1/SP2, right GS/Type/Req Alt, center handoff sector ID), emergency transponder SPC tags (`EM`, `RF`, `HJ`), and end-to-end integration acceptance (manual inhibit glyphs and tactical SPCs deferred to backlog) |
| Player loop | `npm run dev` → issue approach clearance (`"expect ils runway 27"`) → SP1 automatically shows `I27`; assign speed (`"reduce speed to 210 knots"`) → SP2 shows `S21`; Line 2 alternates between Mode C / `I27` / `S21` on the left and GS tens `21H` / aircraft type `B738` on the right; initiating handoff places sector ID `D` in the center of Line 2; emergency squawk 7700 displays `EM` on Line 1 |
| Skip | **T04-11** (wind); all of **T00–T03**, **T02-01–38**, **T04-***, **T05-***; manual `<MULTI FUNC>` inhibit icons and tactical SPCs (deferred to backlog) |
| Include | **T02-39**, **T02-40**, **T02-41**, **T02-42** |
| Stop | **Do not start phase 5.** No scoring, replay, imperfect pilots, or second TCP |
| Do not redo | T00–T02-38. If STATUS says eleventh swarm complete, **stop** |
| Max ticket workers in flight | **2** (Wave A = 2; Wave B = 1; Wave C = 1) |
| Merge lock | **Only the phase captain** merges to `master` (squash merge, one commit per ticket) |
| Model | Inherit / default |
| Paid STT/TTS/LLM | **Forbidden** |

**Waves:**
- **Wave A (2 workers):** `T02-39` (Automatic scratchpad SP1/SP2 derivation from aircraft intent) ∥ `T02-40` (STARS FDB ground speed tens and category indicators)
- **Wave B (1 worker):** `T02-41` (STARS FDB multi-phase time-sharing and handoff center placement)
- **Wave C (1 worker):** `T02-42` (STARS datablock fidelity integration and acceptance)

**Product law (eleventh swarm — STARS CRC datablock & scratchpad fidelity):**
- **Dual Scratchpad Derivation:** `TrackDisplay` maintains `sp1` and `sp2`. Approach clearances automatically derive approach shorthand into SP1 (`I27`, `R22L`, `V28`, `L09`, `O15`); assigned interim altitudes derive 3-digit hundreds (`040`) in SP1 when no approach is set; assigned speeds derive `S` + tens (`S21`) in SP2. Manual entries override and persist until cleared.
- **Tens-Based Ground Speed & Category Indicators:** Ground speed on FDB and PDB formats in 2-digit tens (e.g. `18` for 180 kt) via `formatGroundSpeedTens()`. Wake/RNAV category indicators (`H`, `B`, `R`, `J`, `M`, `F`, `L` or CWT `A`–`I`) append directly to GS (`18H`, `25R`). `suppressPdbSpeed` suppresses PDB ground speed when configured.
- **Multi-Phase Line 2 Time-Sharing:** Left field cycles `Mode C` $\leftrightarrow$ `SP1` $\leftrightarrow$ `SP2` (~2.5s interval), seamlessly omitting unassigned scratchpad slots. Right field cycles `GS (tens)` $\leftrightarrow$ `Type` $\leftrightarrow$ `Requested Alt (R###)`. Inbound/outbound handoff displays partner sector ID letter in the center position.
- **Emergency Special Purpose Codes (SPCs):** Emergency transponder codes auto-trigger 2-letter SPCs on Line 1: 7700 (`EM`), 7600 (`RF`), 7500 (`HJ`). Manual inhibit glyphs (`▲`, `*`) and tactical SPCs (`OD`, `ME`, `MF`, `LN`) are deferred to `phases/LATER-IMPLEMENTATION-BACKLOG.md`.
- **Zero Simulation Regressions:** All existing kinematics, procedural navigation (SIDs/STARs), ILS approaches, radio telephony, and DCB physical menus remain 100% operational.

---

## Tenth swarm started — T02-34–38 STARS CRC scope fidelity addendum

Orchestrator planning **2026-08-25**. Human requested tickets to close the gap between ATC-SIM and STARS CRC (docs.virtualnas.net/crc/stars). Historical swarms 1–9 stay green. This run is **T02-34–38 only**. Not phase 5. Not a redo of T00–T04-23.

| Key | Value |
| --- | --- |
| Goal | Full fidelity alignment with STARS CRC (docs.virtualnas.net/crc/stars): target symbol shapes (primary diamond, unassociated asterisk, VFR V, sector letters), LDB/PDB datablock modes, FDB dynamic time-sharing (alt/scratchpad, GS/type/req alt) & Line 3 assigned altitude (`A<alt>`), handoff/pointout blinking & states, and cyan track highlight |
| Player loop | `npm run dev` → unassociated targets show `*` or `V` in green LDB; clicking queries speed; unowned associated tracks show PDB; clicking toggles to FDB; taking control (`F3`/accept) turns FDB white and updates target symbol to owning sector ID; FDB line 2 time-shares fields; climbing/descending tracks show `A<alt>` on Line 3; middle-click highlights track in cyan; `F4` drops control back to `*` |
| Skip | **T04-11** (wind); all of **T00–T03**, **T02-01–33**, **T04-***, **T05-*** |
| Include | **T02-34**, **T02-35**, **T02-36**, **T02-37**, **T02-38** |
| Stop | **Do not start phase 5.** No scoring, replay, imperfect pilots, or second TCP |
| Do not redo | T00–T04-23. If STATUS says tenth swarm complete, **stop** |
| Max ticket workers in flight | **3** (Wave A = 1; Wave B = 2; Wave C = 1; Wave D = 1) |
| Merge lock | **Only the phase captain** merges to `master` (squash merge, one commit per ticket) |
| Model | Inherit / default |
| Paid STT/TTS/LLM | **Forbidden** |

**Waves:**
- **Wave A (1 worker):** `T02-34` (STARS target symbols, position indicators, and primary/secondary radar targets)
- **Wave B (2 workers):** `T02-35` (STARS Limited Data Block & Partial Data Block modes) ∥ `T02-36` (STARS Full Data Block dynamic time-sharing and Line 3 layout)
- **Wave C (1 worker):** `T02-37` (STARS handoff blinking states, pointout indicators, and cyan track highlight)
- **Wave D (1 worker):** `T02-38` (STARS CRC scope fidelity acceptance & integration)

**Product law (tenth swarm — STARS CRC scope fidelity):**
- **Surveillance-Driven Position Symbols:** Target symbol shape is derived from surveillance state: primary-only is diamond `◇` (no datablock); unassociated secondary is `*` (or `V` for 1200, `□` for selected beacon); controlled target is owning sector ID letter (e.g. `D`). No fixed heading tick attached to target symbol (PTL lines handle vector projection).
- **LDB & PDB Modes:** Unassociated tracks display LDB (squawk + altitude), with click-to-query temporary ground speed; associated tracks owned by other controllers display PDB (Line 2 only) by default, toggling to Green FDB on click. `F1` momentarily forces beacon code readout.
- **FDB Time-Sharing:** FDB Line 2 alternates (~2.5s cycle) between [Mode C altitude + Ground speed] and [Scratchpad + Aircraft type / requested altitude]. Line 3 renders temporary assigned altitude (`A040`) when assigned altitude differs from Mode C.
- **Handoff & Pointout Visual Grammar:** Inbound handoffs blink white at receiving controller; accepted handoff blinks white 5s on sender; pointouts display blinking yellow FDB with `PO`; middle-click toggles standard STARS cyan highlight (`#00FFFF`).
- **Zero Simulation Regressions:** All existing kinematics, procedural navigation (SIDs/STARs), ILS approaches, radio telephony, and DCB physical menus remain 100% operational.

---

## Ninth swarm started — T04-18–23 SIDs and randomized departures addendum

Orchestrator planning **2026-08-25**. Human requested SIDs and randomized (customizable) departures tickets. Historical swarms 1–8 stay green. This run is **T04-18–23 only**. Not phase 5. Not a redo of T04-01–17.

| Key | Value |
| --- | --- |
| Goal | Standard Instrument Departures (SIDs) and customizable/randomized departures: catalog schema & KDEM `DEM1` SID, FMS `CLIMB_VIA` & SID fly-by navigation, departure spawning off RW27, customizable/seeded traffic generator (`?departures=auto`), radio telephony check-in, end-to-end integration |
| Player loop | `npm run dev -- ?departures=auto` → STAR arrivals on DEMO ONE + periodic departures rolling off RW27, checking in on Departure frequency ("passing 1,200 climbing via the DEMO ONE departure"), climbing via SID constraints to top altitude, accepting radar vectors, and exiting airspace cleanly |
| Skip | **T04-11** (wind); all of **T00–T03**, **T02-***, **T04-01–17**, **T05-*** |
| Include | **T04-18**, **T04-19**, **T04-20**, **T04-21**, **T04-22**, **T04-23** |
| Stop | **Do not start phase 5.** No scoring, replay, imperfect pilots, or second TCP |
| Do not redo | T00–T04-17. If STATUS says ninth swarm complete, **stop** |
| Max ticket workers in flight | **3** (Wave A = 1; Wave B = 2; Wave C = 2; Wave D = 1) |
| Merge lock | **Only the phase captain** merges to `master` (squash merge, one commit per ticket) |
| Model | Inherit / default |
| Paid STT/TTS/LLM | **Forbidden** |

**Waves:**
- **Wave A (1 worker):** `T04-18` (SID procedure schema, KDEM fixture & video map) — **COMPLETE** (`15a2314`)
- **Wave B (2 workers):** `T04-19` (SID climb-via and FMS guidance) ∥ `T04-20` (Departure spawning and handoff lifecycle) — **COMPLETE** (`4ed8a58`, `f640363`)
- **Wave C (2 workers):** `T04-21` (Randomized & customizable departure generator) ∥ `T04-22` (Departure radio check-in & telephony) — **COMPLETE** (`d3dc743`, `65cdc39`)
- **Wave D (1 worker):** `T04-23` (SIDs and departures integration & acceptance) — **COMPLETE** (`54c56a2`)

**Ninth Swarm Status: COMPLETE & GREEN** (116/116 test files passed, 1275 tests passed, 0 failures, CI clean)

**Product law (ninth swarm — SIDs & departures):**
- **Data-first SIDs:** KDEM `DEM1` departure in `src/scenario/data/kdem/sids.json` is the shipped fixture; no `"DEM1"` or `"KDEM"` code branches in runtime FMS or helpers.
- **Climb Via & Vector Cancellation:** `CLIMB_VIA` honors published `AT_OR_BELOW` / `AT_OR_ABOVE` constraints and speed limits up to assigned top altitude. Radar vectors (`FLY_HEADING`, `TURN_DEGREES`) immediately cancel SID published routing and climb-via constraints.
- **Departure Spawning:** Roll/airborne spawn off active runway (RW27) with initial climb and initial SID leg armed; Tower handoff is auto-acquired / owned on radar (`white` FDB) per CRC STARS standard.
- **Smart Shift+H Handoff:** Pressing `Shift+H` on a selected track contextually detects destination: initiates handoff to **Tower** (`LANDING` mode) if arrival on final (inside 5 NM gate on LOC/GS), or initiates handoff to **Center** (`handoff.center`) if climbing outbound departure.
- **Customizable Traffic Stream:** Query parameter `?departures=auto` (or `?dep_rate=N`) enables periodic departures; default session without query parameter retains backward compatibility.
- **Deterministic PRNG:** Independent stream XOR for departure generator so arrival seeds remain bit-stable.
- **Telephony:** AIM 4-2-3 standard phraseology (`"Departure, <callsign>, passing <alt> climbing via the <SID> departure"`), queued cleanly through `CheckInQueue` without radio collisions.
- **Airspace Exit:** Departures reaching TRACON boundary (~28 NM) or cruising altitude are handed off out to Center and despawned cleanly (`nav.departed`).

---

## Seventh swarm started — T02-22–30 trainer DCB addendum

Orchestrator planning **2026-08-23**. Human: DCB spec → tickets T02-22–30, then “I’m away — make any calls.” Historical phase 2 exit/polish and sixth swarm (T04-16–17) stay green. This run is **T02-22–30 only**. Not phase 5. Not a redo of T02-01–21.

| Key | Value |
| --- | --- |
| Goal | Trainer DCB grows toward CRC STARS **jobs and grammar**: MAIN/AUX via SHIFT, submenu replace, spinners, disabled WX, local PREF 1–8 |
| Player loop | `npm run dev` → green DCB on glass → SHIFT AUX → RANGE spinner (presets) → MAPS 1–6 → WX cells visible and dead → PREF save/restore after reload |
| Skip | **T04-11**. All of **T00–T01**, **T02-01–21** (already merged). All of **T03-***, **T04-***, **T05-*** |
| Include | **T02-22**, **T02-23**, **T02-24**, **T02-25**, **T02-26**, **T02-27**, **T02-28**, **T02-29**, **T02-30** |
| Stop | **Do not start phase 5.** No scoring, replay, imperfect pilots, or second TCP. Do not reopen T02-01–21 |
| Do not redo | T00–T04-17. If STATUS says seventh swarm complete, **stop** |
| Max ticket workers in flight | **3** (wave A = 1; B = 3; C = 3; D = 1; E = 1) |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** `model: "cursor-grok-4.6-high"` on every Task spawn |
| Paid STT/TTS/LLM | **Forbidden** |

**Judgement — WX is chrome only.** WX1–4 (and BRITE WX/WXC/BKC) exist **disabled**. No mosaic, precip, NEXRAD, or weather draw. Human named this freeze.

**Judgement — RANGE stays eight presets.** Spinner arms/steps `5, 10, 15, 20, 30, 40, 50, 60` NM. No continuous zoom, no CRC extra values.

**Judgement — spinner cursor trap is analog, not Pointer Lock.** Arm on click, `setPointerCapture` / clamp-to-cell if cheap, wheel steps, second click or Esc commits. Do **not** require `requestPointerLock` (hostile in a browser trainer, painful to test).

**Judgement — FILTER stays on MAIN.** Altitude filter cell is a trainer delta. SSA FILTER (T02-27) only hides SSA lines.

**Judgement — MAPS 7–30 empty.** KDEM catalog has six maps. Unused numbered slots are disabled. No OSM filler.

**Judgement — PREF is 8 localStorage slots.** Not 32 NAS sets. No `prompt()` / `<input>`. SAVE AS → first empty `PREF n`.

**Judgement — TPA J-rings yes; ATPA stub.** 2/3/5/10 NM circles. ATPA is toggle/disabled with no pairing engine. CA stays T04-09 text — **no** 3 NM CA halo.

**Judgement — VOL / MODE / SITE disabled.** Labels may read `FSL` / `FUSION`. Do not touch OS audio.

**Judgement — leave `e2e/` untracked.** Do not stage QA screenshots.

If `phases/SWARM-STATUS.md` already lists **seventh-swarm** exit green with T02-22–30 merged, **stop**.

---

## Seventh swarm resume — 2026-08-23 (captain interrupted)

Human interrupted the captain mid-wave (~45 min). **T02-22 is on `master`.** Wave B worktrees exist with **uncommitted** work:

| Ticket | Worktree | Branch |
| --- | --- | --- |
| T02-23 | `C:\Users\Ben\Documents\ATC-SIM-wt-T02-23` | `ticket/T02-23-dcb-main-range-cntr-rr-ldr` |
| T02-24 | `C:\Users\Ben\Documents\ATC-SIM-wt-T02-24` | `ticket/T02-24-dcb-maps-wx-disabled` |
| T02-25 | `C:\Users\Ben\Documents\ATC-SIM-wt-T02-25` | `ticket/T02-25-dcb-aux-history-ptl-dock` |

**Do not discard that work.** Resume Wave B in those worktrees: finish ACs, progressive commits, `READY TO MERGE`. Then Wave C (T02-26∥27∥28) from updated `master`, then D T02-29, then E T02-30. Same frozen judgements. Still do not start phase 5.

---

## Seventh swarm resume — 2026-08-23 (Wave C)

Human: Wave **C is not done** — finish it. Prior captain ([cec8ebcb](cec8ebcb-dde2-4f84-993c-05a86f6a1a17)) merged A+B then spawned C workers and was interrupted (`check status` abort) before any C merge.

**On `master` now:** T02-22, T02-23, T02-24, T02-25 (`62a1e34`). Do **not** redo A/B.

**Wave C worktrees — preserve; do not reset/clean/discard:**

| Ticket | Worktree | Branch | State |
| --- | --- | --- | --- |
| T02-26 | `C:\Users\Ben\Documents\ATC-SIM-wt-T02-26` | `ticket/T02-26-dcb-brite-char-size-submenus` | **READY TO MERGE** (clean; 3 commits; worker ACs 6/6, `npm test` 1132 passed) |
| T02-27 | `C:\Users\Ben\Documents\ATC-SIM-wt-T02-27` | `ticket/T02-27-dcb-ssa-gi-filters` | **READY TO MERGE** (clean; 5 commits; worker ACs 6/6) |
| T02-28 | `C:\Users\Ben\Documents\ATC-SIM-wt-T02-28` | `ticket/T02-28-dcb-tpa-atpa-submenu` | **Not done.** Uncommitted `src/` + untracked `tpa.ts` / `tpa.test.ts`. Worker aborted mid-AC. Finish that tree. |

**C merge order (dirty-tree safe):**

1. Spawn **one** worker in the T02-28 worktree. Finish ACs on **current** `master` (same base as 26/27). Progressive commits. **Do not discard** uncommitted files. Wait for `READY TO MERGE`.
2. Captain `--no-ff` merge **T02-26**, then `npm test`.
3. Rebase **T02-27** onto updated `master`, `--no-ff` merge, `npm test`.
4. Rebase **T02-28** onto updated `master` (DCB collisions expected). Resolve or spawn one conflict worker. `--no-ff` merge, `npm test`.
5. Then Wave **D** T02-29 (needs 23–27; 28 optional), then Wave **E** T02-30. Isolated worktrees from then-current `master`.
6. Same frozen judgements. Do **not** start phase 5. Do not reopen T02-01–21.

Captain must **not** end the turn while a C worker is running. Do not return “wave C is running” as done.

---

## Eighth swarm started — 2026-08-23 (T02-31–33 physical DCB replica)

Human approved the physical DCB follow-up tickets after identifying the live bar as a flat neon-green ribbon rather than a two-row button grid. The seventh swarm is complete through T02-30; this is a separate, post-exit visual-replica addendum.

| Key | Value |
| --- | --- |
| Goal | MAIN reads as a compact **two-row physical DCB**: correct button grouping/order, six disabled WX caps, raised/inset bevels, off-white normal text, muted disabled text, and a documented visual gate |
| Player loop | `npm run dev` → MAIN has RANGE / center / RR / map 3×2 / WX1–6 / BRITE / leader / CHAR SIZE / MODE / PREF / SITE / SSA-GI / SHIFT in the frozen order → active cap presses inset → `DAL123 H270` still turns |
| Include | **T02-31**, **T02-32**, **T02-33** only |
| Skip | **T04-11**; all T00–T01, **T02-01–30**, T03-*, T04-*, T05-*; weather paint; actual FSL/fusion/site modes; any proprietary STARS/FAA font |
| Stop | Do not start phase 5. Do not add DCB jobs beyond the approved tickets. T02-33 is the visual-replica gate. |
| Max ticket workers in flight | **3**, but this dependency chain is serialized: A T02-31 → B T02-32 → C T02-33 |
| Merge lock | Only the phase captain squash-merges to `master` (one commit per ticket branch) and runs `npm test` after every merge |
| Model | **GPT-5.6 Luna Medium only.** `model: "gpt-5.6-luna-medium"` on every captain/worker spawn; do not use a fast model |
| Paid STT/TTS/LLM | Forbidden |

**Dependency gate:** T02-30 is already merged and its `npm test` / CI gate is green. Start T02-31 from current `master`; T02-32 follows a green T02-31 merge; T02-33 follows a green T02-32 merge.

**Frozen visual MAIN layout:** Use the T02-31 data-driven two-row descriptor. Full-height columns are RANGE; RR; MAPS; WX1–WX6; BRITE; CHAR SIZE; MODE FSL (disabled); PREF 22/27; SITE FUSED (disabled); SHIFT. Stacked columns are PLACE CNTR / OFF CNTR, PLACE RR / RR CNTR, LDR DIR / LDR, and SSA FILTER / GI TEXT FILTER. Quick maps 1–6 are exactly a **3 × 2** matrix. Keep the 22-column order documented in T02-31; do not position controls with KDEM-specific branches.

**Frozen physical-cap treatment:** Normal caps are dark tactical olive with off-white text, a light top/left edge, black bottom/right edge, and visible 1–2 px cap gaps. Active/armed caps reverse to an inset bevel and lighter olive body. Disabled WX1–6, MODE FSL, and SITE FUSED use muted gray-green text and stay inert. Remove quick-map stripe/raster backgrounds. PPI/FDB/map/alert palette roles do not change.

**Frozen typography/legal boundary:** Center title/value lines in a legal system/redistributable monospace stack. Do **not** download, embed, claim, or imitate an FAA/STARS proprietary bitmap/vector font.

**Visual evidence:** T02-33 records Chrome Windows observations at 1440×900 and 804×900. QA screenshots remain untracked unless the human explicitly requests an approved artifact. A missing visual operator is a skip-with-reason, never an invented pass.

**Existing frozen behaviors remain:** WX never paints weather; MAPS 7–30 remain disabled when unpopulated; RANGE retains eight presets; FILTER remains the altitude filter on MAIN; PREF remains eight local slots; TPA is J-rings and ATPA is a stub; DCB clicks never emit Command IR.

If `phases/SWARM-STATUS.md` lists eighth-swarm exit green through T02-33, stop. Otherwise resume at the first incomplete dependency; preserve every existing worktree and untracked QA artifact.

**Model override — human instruction 2026-08-23:** every captain and ticket worker for this swarm uses **GPT-5.6 Luna Medium** (`gpt-5.6-luna-medium`), never a fast model. This explicit human override supersedes the historical seventh-swarm Grok requirement above.

---

## Fifth swarm started — T04-13–15 STAR inbound spawn + check-in

Orchestrator planning update. Historical phase 4 exit stays green. This run is a **post-exit addendum** only.

| Key | Value |
| --- | --- |
| Goal | Default student traffic spawns on catalog STAR **entry** fixes (VIA descending). Seeded random STAR × transition. VIA arrivals check in with frozen phraseology |
| Player loop | `npm run dev` → six arrivals on DEMO ONE N/S at NEMAX/SEMAX (catalog-derived), descending via, check-in on the radio → vectors → ILS still works |
| Skip | **T04-11** (wind). All of **T04-01–10, T04-12** (already merged). All of **T05-*** |
| Include | **T04-13**, **T04-14**, **T04-15** only |
| Stop | **Do not start phase 5.** No scoring, replay, imperfect pilots, or second TCP |
| Do not redo | T00-*, T01-*, T02-*, T03-*, T04-01–12. If STATUS says fifth swarm complete, **stop** |
| Max ticket workers in flight | **3** (this run: wave A is 1; wave B is 2) |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** Every Task spawn sets `model: "cursor-grok-4.6-high"`. No `composer-2.5-fast`, no omitting `model` |
| Paid STT/TTS/LLM | **Forbidden.** Do not regress speech-api onto vendors. Do not edit phase 3 tickets |

If `phases/SWARM-STATUS.md` already lists fifth-swarm exit green with T04-13–15 merged, **do not redo them.** Continue with the sixth swarm below.

If STATUS already lists **sixth-swarm** exit green with T04-16–17 merged, **stop**.

---

## Sixth swarm started — T04-16–17 inbound handoff (spawn accept)

Orchestrator planning **2026-08-23**. Human: `/run-swarm` for spawn **handoff accept** (untracked → accept → yours) plus a CA 3 NM circle **only if** CRC/vSTARS/STARS analog exists. Human is away; judgements below are frozen. Not phase 5. Not a redo of T04-13–15.

| Key | Value |
| --- | --- |
| Goal | Default STAR arrivals spawn **pending inbound handoff** from sector `C`. Student **slew/click** to accept. Then owned **white** FDB; radio vectors work. Check-in waits until owned |
| Player loop | `npm run dev` → green unowned FDBs with HO cue → click DAL123 → white owned → `DAL123 H270` turns / cancels FMS → check-in after accept |
| Skip | **T04-11**. All of **T04-01–15** (already merged). All of **T05-***. **CA 3 NM circles** (see judgement) |
| Include | **T04-16**, **T04-17** only |
| Stop | **Do not start phase 5.** No scoring, replay, imperfect pilots, or second TCP |
| Do not redo | T00–T04-15. If STATUS says sixth swarm complete, **stop** |
| Max ticket workers in flight | **3** (this run: wave A = 1; wave B = 1) |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** `model: "cursor-grok-4.6-high"` on every Task spawn |
| Paid STT/TTS/LLM | **Forbidden** |

**Judgement — CA 3 NM circles: DO NOT IMPLEMENT.** CRC STARS STCA (R07) paints blinking **`CA`** in the datablock + a tone when predicted/current sep `< 3 NM` and `< 1000 ft`. It does **not** draw a 3 NM circle on CA. Circles in CRC are **TPA J-rings** (manual `*J`, controller-chosen radius) or **ERAM DRI/halos** (QP; 5 NM standard / gapped 3 NM reduced) — ERAM, not STARS CA. VRC optional “separation rings on conflict” is a VATSIM client, not CRC STARS. Authority order: CRC STARS > vSTARS lore > VRC. Existing T04-09 CA lite (yellow then red FDB) stays. No halo ticket.

**Judgement — owned color is white, not green.** CRC + our `PALETTE`: unowned/other-TCP **green**, owned-by-you **white**. Human said “become green”; we keep CRC grammar already frozen in T02-08. Pending HO = green + HO cue; accept = white.

**Judgement — authored / FPS bench skip HO.** `kdem-ils27` and `?traffic=N` stay commandable without accept so T04-12 and the FPS bench do not break.

**Chore before Wave A (captain):** if `fix/star-inbound-spawn-spacing` is not on `master`, merge it `--no-ff` first (8 NM same-STAR stagger; already implemented). Then start T04-16 from that `master`.

Captain spawn follows this planning commit.

---

## Fifth swarm execution — 2026-08-23 (star plane spawning)

Human invoked `/run-swarm` for **STAR plane spawning**. This is the existing fifth-swarm contract (T04-13–15). It is **not** a sixth swarm and **not** phase 5.

| Key | Value |
| --- | --- |
| Goal | Default student traffic spawns on catalog STAR **entry** fixes (VIA descending). Seeded random STAR × transition. VIA arrivals check in with frozen phraseology |
| Include | **T04-13**, **T04-14**, **T04-15** only |
| Skip | **T04-11**. All of **T04-01–10, T04-12**. All of **T05-*** |
| Stop | **Do not start phase 5.** No scoring, replay, imperfect pilots, or second TCP |
| Max ticket workers in flight | **3** (wave A = 1; wave B = 2) |
| Merge lock | **Only the phase captain** merges to `master` (`--no-ff`) |
| Model | **cursor grok 4.6 high only.** `model: "cursor-grok-4.6-high"` on every Task spawn |

Waves unchanged: **A** T04-13 alone → **B** T04-14 ∥ T04-15 (isolated worktrees). Captain spawn follows this planning commit.

---

## Seventh swarm — roles, product law, waves

Phase folder: `phases/02-scope/`  
Tickets: **T02-22–30**. **Skip T02-01–21** (already on master).

| Wave | Tickets (≤3) | Wait for |
| --- | --- | --- |
| A | T02-22 | T02-21 on `master` |
| B | T02-23 ∥ T02-24 ∥ T02-25 | A. Isolated worktrees |
| C | T02-26 ∥ T02-27 ∥ T02-28 | B (28 needs **T02-25**) |
| D | T02-29 | C (23–27 at least; 28 optional) |
| E | T02-30 | D |

Captain prompt extras: full `phases/SWARM-CAPTAIN.md` + **`Phase folder: phases/02-scope/`** + **`Tickets: T02-22–30 only (waves above). Skip T02-01–21`** + **`model: cursor-grok-4.6-high` on every worker** + frozen judgements in this seventh-swarm section.

Worker extras: full `phases/SWARM-TICKET-WORKER.md` + ticket id/path + this run’s product law.

**Product law (seventh swarm — trainer DCB):**

- Scope/DCB **never** emit Command IR. `DAL123 H270` still turns. Inbound HO from T04-16–17 stays: unowned green pending from `C`, click/F3 accept → white owned; do not regress that.
- Discrete RANGE presets only (`5 10 15 20 30 40 50 60`). No zoom-to-cursor. RANGE is a **spinner**, not ± buttons.
- Disabled WX/VOL/MODE/SITE. No weather paint. No OS volume. WX1–4 exist on MAIN and must be unpressable.
- MAPS from `video-maps` catalog JSON only. Quick 1–6 + submenu slots 1–30. Unused numbers **disabled**, not OSM filler. CLR ALL / GEO MAPS / CURRENT as T02-24.
- PREF 1–8 in `localStorage`, ICAO-keyed, versioned. DEFAULT / RESTORE / SAVE / SAVE AS / DELETE. No `prompt()` / `<input>`. Display state only (not world/speech).
- TPA = selected/owned J-rings at frozen 2/3/5/10 NM. ATPA = stub (no pairing, no cones). CA stays T04-09 **text** — no 3 NM CA halo.
- CHAR SIZE stays Plex/system mono. No STARS `.ttf`. BRITE multiplies existing palette channels; WX/WXC/BKC disabled.
- Spinner: arm / wheel / commit / Esc disarm. Pointer Lock **not** required (`setPointerCapture` OK).
- FILTER (altitude) stays on MAIN. SSA FILTER hides existing SSA lines. GI TEXT is 10 authored facility lines, not METAR HTTP.
- DCB docks TOP/LEFT/RIGHT/BOTTOM; PPI padding follows the bar. HISTORY spinner 0–5; PTL minutes include 0.5/1/2 (+ optional 4); PTL OWN vs ALL.
- Do not start T05-*. Do not edit phase 3 tickets. Paid speech forbidden.

**Code home (do not fork a second DCB):**

Existing glass is `src/ui/DisplayControlBar.tsx` + `src/scope/dcbFunctions.ts` + `src/scope/scopeView.ts`. Tickets that say `DisplayControlBar.tsx` mean this component. Add `src/scope/dcbMenu.ts`, `dcbPref.ts`, `tpa.ts` as tickets name them. Reducers stay DOM-free in `src/scope`.

**Wave B/C collision:** T02-23, T02-24, and T02-25 all touch the DCB component. Isolated worktrees, then captain rebases the remaining two onto `master` after each `--no-ff`. Same for T02-26/27/28 vs `DisplayControlBar.tsx`. Do not share one working tree.

**T02-21 greps:** T02-16/21 forbade SHIFT / WX / PREF. **T02-22** allows SHIFT (keep CSA/CRDA/FMA/OSM forbidden). **T02-24** allows disabled WX cells (still forbid mosaic/precip draw). **T02-29** allows PREF submenu. T02-30 confirms the amended grammar; do not re-fail the old freeze.

**Ticket notes (paste into the matching worker):**

| ID | Must |
| --- | --- |
| T02-22 | Menu machine first. `DcbMenu` MAIN/AUX/MAPS/BRITE/CHAR_SIZE/PREF/SSA_FILTER/GI_FILTER/TPA_ATPA. SHIFT swaps MAIN↔AUX. Submenu **replaces** the bar. DONE/Esc → MAIN. Cell kinds: action / toggle / spinner / submenu / disabled. VOL disabled. Do not skip this ticket to “just add SHIFT.” |
| T02-23 | Split PLACE CNTR, OFF CNTR, RR spinner (2/5/10), PLACE RR, RR CNTR, LDR DIR spinner 1–9, LDR length spinner including **0** and **36** (e.g. 0/24/36/48). Ring origin is world NM, not glued to airport. `L090` radio-focus remains a left turn. |
| T02-24 | Quick maps 1–6; MAPS submenu 1–30; empty slots disabled; WX1–4 disabled; GEO/CURRENT on-PPI lists; CLR ALL. No NEXRAD. |
| T02-25 | AUX real: HISTORY 0–5, dock four edges, PTL length + OWN + ALL, TPA/ATPA opener (DONE stub OK). F7/F8 still work if cells leave MAIN. |
| T02-26 | BRITE + CHAR SIZE **submenus**. Wire real channels we already draw. WX/WXC/BKC disabled. |
| T02-27 | SSA FILTER toggles existing SSA lines only. GI TEXT: `giTextLines[10]` in facility JSON (KDEM ships a few non-empty). No live METAR. Altitude FILTER chord stays on MAIN. |
| T02-28 | P1 but **in wave C** — implement J-rings + ATPA stub. Do not skip the wave. Do not add CA halos. |
| T02-29 | 8 slots. Serialize display fields from 22–27 (TPA optional). Corrupt JSON → factory. No world/speech persistence. |
| T02-30 | **No features.** Grep grammar + `npm test`. Manual Chrome script skip-with-reason if no operator — do not invent a visual pass. |

Ticket files / branches:

- `ticket/T02-22-dcb-menu-model-and-primitives` ← `phases/02-scope/tickets/T02-22-dcb-menu-model-and-primitives.md`
- `ticket/T02-23-dcb-main-range-cntr-rr-ldr` ← `phases/02-scope/tickets/T02-23-dcb-main-range-cntr-rr-ldr.md`
- `ticket/T02-24-dcb-maps-wx-disabled` ← `phases/02-scope/tickets/T02-24-dcb-maps-wx-disabled.md`
- `ticket/T02-25-dcb-aux-history-ptl-dock` ← `phases/02-scope/tickets/T02-25-dcb-aux-history-ptl-dock.md`
- `ticket/T02-26-dcb-brite-char-size-submenus` ← `phases/02-scope/tickets/T02-26-dcb-brite-char-size-submenus.md`
- `ticket/T02-27-dcb-ssa-gi-filters` ← `phases/02-scope/tickets/T02-27-dcb-ssa-gi-filters.md`
- `ticket/T02-28-dcb-tpa-atpa-submenu` ← `phases/02-scope/tickets/T02-28-dcb-tpa-atpa-submenu.md`
- `ticket/T02-29-dcb-pref-sets` ← `phases/02-scope/tickets/T02-29-dcb-pref-sets.md`
- `ticket/T02-30-dcb-addendum-visual-acceptance` ← `phases/02-scope/tickets/T02-30-dcb-addendum-visual-acceptance.md`

Captain return:

```
PHASE EXIT GREEN
Phase: 2 Scope addendum (T02-22–30 trainer DCB)
Merged: T02-22 … T02-30
Tests: npm test / npm run ci exit 0
Manual leftover: <Chrome DCB walk or none>
Notes: <SHIFT/AUX; disabled WX; PREF 1–8; TPA rings; no phase 5>
```

or `PHASE EXIT BLOCKED` with reason.

---

## Roles (do not collapse them)

```
YOU (orchestrator)
  └── at most ONE phase captain at a time
        └── up to 3 ticket workers
              └── no children
```

| Role | Writes app code? | Merges `master`? | Spawns |
| --- | --- | --- | --- |
| **Orchestrator** | No (except `SWARM-STATUS.md`) | No | One phase captain |
| **Phase captain** | No | **Yes** | ≤3 ticket workers |
| **Ticket worker** | Yes, **one ticket** | **No** | Nobody |

Do **not** paste `phases/02-scope/AGENT.md` (or phase 4 AGENT) into one agent. Swarm mode uses **one worker per ticket**.

**This run (seventh swarm):** captain prompt extras and waves are in **Seventh swarm — roles, product law, waves** above. Do not run T04-16–17 again.

Workers **must not** end the captain’s turn. Captain **must not** `run_in_background: true` on a worker and then exit. Wait for `READY TO MERGE` / `BLOCKED`. Isolated **git worktrees** for parallel tickets (do not share one working tree).

---

## Product law (every descendant)

CRC/vNAS STARS and vice are **references for feel**. Training/entertainment only. Not a Raytheon clone. Not NAS-certified. Alerts are **lite**, never “MSAW certified.”

**Addendum (seventh swarm — trainer DCB, this run):** MAIN/AUX via SHIFT; submenus replace the bar; RANGE/RR/LDR spinners; disabled WX/VOL/MODE/SITE; local PREF 1–8; TPA J-rings; ATPA stub. DCB never emits Command IR. Do not paint weather. Do not use Pointer Lock. Do not reopen T02-01–21.

**Still true (sixth swarm — inbound HO):**

- **KDEM stays the default facility.** Mag var 0°, elev 0 ft, rwy 27.
- **Default STAR pack** (`spawnPolicy: "star-inbound"`): each arrival spawns `handoff.kind === "inbound"` from sector **`C`**, `ownership === "unowned"` (green FDB). Radio that changes intent is **rejected** until accept.
- **Accept analog is CRC slew:** click/slew the track (T04-17). F3 on a pending inbound track **accepts** (same helper). After accept: `owned` **white** FDB (CRC + existing `PALETTE`). Do **not** invert owned to green.
- **`kdem-ils27` and `?traffic=N`:** `handoff.kind === "none"`; T04-12 ILS script and FPS bench stay commandable without a click.
- **Check-in waits for owned.** T04-15 phraseology unchanged. Do not fire `radio.checkin` while inbound pending; fire once after accept if due.
- **No CA 3 NM halo.** CRC STARS CA is `CA` text + tone; 3 NM circles are TPA J-rings or ERAM DRI.
- **VIA / STAR spawn already exist.** Do not rebuild FMS. Heading still **cancels** published path after the track is owned.
- **No new Command IR type.** Handoff is a **scope** action. Session events `handoff.inbound.offered` / `handoff.inbound.accepted` only. Phase 5 must **ignore** them (do not score).
- **No `"NEMAX"` / `"DEM1"` live branches.** Paid vendor speech forbidden. Do not edit phase 3 tickets. Do not start T05-*.

**Still true from phase 4 (do not reopen):** ILS from below after loc; heading cancels STAR; CA/MSAW lite (FDB color, no halo); CIFP fixture-only; no chart scrape; STAR entry spawn + check-in phraseology.

Research: `phases/_shared/references.md` **R07** DCB MAIN/AUX/SHIFT/BRITE/PREF/TPA; still **R07** accept-handoff / datablock colors / STCA and **R01** radar handoff. This run’s tickets: `T02-22` … `T02-30`. HO tickets `T04-16` / `T04-17` are already on `master` — do not redo them.

---

## Your loop (orchestrator)

1. Update this file first: append the current swarm-start heading/configuration and preserve all earlier swarm history. Commit the planning update before any branch/worktree or agent action.
2. Read `phases/SWARM-STATUS.md`, then `git checkout master` && `git status`. If dirty and it is not yours, **stop**. Preserve untracked `e2e/`.
3. Confirm sixth swarm (T04-16–17) is complete on `master`. If STATUS already shows **seventh** swarm complete, **stop**. Do **not** redo T04-16–17.
4. Spawn **one** captain for **T02-22–30 only** (waves in **Seventh swarm — roles, product law, waves**). Wait until `PHASE EXIT GREEN` or `BLOCKED`.
5. If `BLOCKED`: copy the note into STATUS, **stop**. Do not start phase 5. Human is away — do not wait for a question.
6. If green: run the final required tests yourself, write the swarm-complete STATUS note, list honest manual leftovers and remaining work, and **stop**.

Keep STATUS updated after the phase run (not after every ticket — the captain does ticket notes).

Manual UI ACs (DCB MAIN/AUX/submenus, disabled WX, PREF persist): captain/workers do what they can; leftover Chrome steps go in STATUS. Automated `npm test` / `npm run ci` must be green. Do not invent a visual pass. T02-30 may skip-with-reason.

---

## Git law (overrides whole-phase AGENT.md)

- Default branch: `master`.
- Worker: `ticket/<ticket-filename-without-.md>` off **current** `master`, progressive commits, **never merge**.
- Captain: `git merge --squash`, one commit with ticket id + why, delete local ticket branch, then `npm test`.
- No `--force` on `master`. No `--no-verify`. No push unless the human asked (they have not).
- After a squash merge, rebase or re-spawn stale in-flight workers. Isolated worktrees for same-wave tickets.
- Ignore junk branches named `list` or `ls`. Do not merge them.
- You do not merge from here unless the captain died mid-merge — then finish that one squash merge and stop.

PowerShell commit:

```text
git commit -m @"
T02-22: message why.

Second paragraph why.
"@
```

---

## Waves (captain must follow)

Dependencies on the ticket still win if a wave disagrees. **This run uses the seventh-swarm table** in **Seventh swarm — roles, product law, waves** (T02-22–30). Do not execute the archived T04-16–17 table.

Phase folder: `phases/02-scope/`  
Tickets: **T02-22–30**. **Skip T02-01–21.** Skip all T03/T04/T05.

| Wave | Tickets (≤3) | Wait for |
| --- | --- | --- |
| A | T02-22 | T02-21 on `master` |
| B | T02-23 ∥ T02-24 ∥ T02-25 | A. Isolated worktrees |
| C | T02-26 ∥ T02-27 ∥ T02-28 | B (28 needs **T02-25**) |
| D | T02-29 | C (23–27 at least; 28 optional) |
| E | T02-30 | D |

Do **not** paint weather. Do **not** use Pointer Lock. Do **not** invert owned color. Do **not** start T05-*. Do **not** reopen T02-01–21.

**Not this run:** T04-11. All T05-*. Redo of T02-01–21 or T04-*. CA halo. NAS PREF 32. Continuous zoom.

Exit: T02-22–30 ACs. MAIN/AUX SHIFT; RANGE presets via spinner; disabled WX; PREF 1–8; TPA rings; ATPA stub. `npm test` / `npm run ci` green. Manual leftovers listed, not faked.

---

## Burden limits

- Orchestrator: no `src/` or `tools/` edits except STATUS. No “I’ll just do T02-22 myself.”
- Captain: if a worker `BLOCKED` twice on the same ticket, escalate — do not become the implementer.
- Worker: one ticket. No bonus tickets. No weather paint “while you are here.” No phase 5 scoring. No reopening T02-01–21.
- Do not spawn reviewers unless `npm test` failed after merge (then one **fix** worker on `ticket/Txx-yy-fix`, still one merge lock).

Size this run: **T02-22 L, T02-25 L, others M/S**. T02-28 is P1 but **in wave C** — implement the stub, do not skip the wave.

---

## Captain return (mandatory)

```
PHASE EXIT GREEN
Phase: 2 Scope addendum (T02-22–30 trainer DCB)
Merged: T02-22 … T02-30
Tests: npm test / npm run ci exit 0
Manual leftover: <Chrome DCB walk or none>
Notes: <SHIFT/AUX; disabled WX; PREF 1–8; TPA rings; no phase 5>
```

or `PHASE EXIT BLOCKED` with reason. Do not return “wave A is running” as done.

---

## Done when

T02-22–30 ACs can be argued green, `npm test` green on `master`, STATUS says **seventh swarm complete**, MAIN/AUX via SHIFT, RANGE spinner uses discrete presets, WX cells exist and never paint, PREF 1–8 persist, TPA J-rings work, ATPA is a stub, **no** phase 5, T02-01–21 **not** redone.

Then stop. Training / scoring wait on a new paste of this file with config changed.

---

## Archive — Fourth swarm (complete)

Frozen config from the completed phase 4 procedures swarm (T04-01–10, T04-12; skip T04-11). Do not execute this archive. STATUS: **FOURTH SWARM COMPLETE**.

| Key | Value |
| --- | --- |
| Goal | Implement **phase 4 procedures** until `phases/04-procedures/README.md` **Phase exit** is green |
| Skip | **T04-11** |
| Include | **T04-08** CIFP subset importer — required, offline fixture |
| Stop | Did not start phase 5 |
| Tickets | T04-01–10, T04-12 |

Waves executed: A (T04-01 ∥ T04-09) → B (T04-02 ∥ T04-08 ∥ T04-10) → C (T04-03) → D (T04-04 ∥ T04-05) → E (T04-06) → F (T04-07) → G (T04-12).

Captain return (historical): `PHASE EXIT GREEN` — Phase 4 Procedures (T04-01–10, 12; skipped 11). Merged T04-01–10, T04-12 plus CI fix/format. Tests 927 passed, 1 skipped.

---

## Seventh swarm resume — 2026-08-23 (finish D/E with checkpoint discipline)

Human approved finishing the remaining seventh-swarm tickets using subagents. Wave C is already merged on `master`; run only **T02-29 (Wave D)** and **T02-30 (Wave E)**. Do not touch the unrelated `fix/ca-blink-and-tone` worktree or its dirty application files.

Safety requirements for the captain:

- Work only from `master`; verify the branch and clean application status before each phase action. Preserve untracked `e2e/` and unrelated CA work.
- Use one isolated worker worktree per ticket. The worker must commit and return `READY TO MERGE` before the captain merges.
- After every worker completion: record the worker result, verify its worktree status, squash merge (one commit on `master`), run `npm test`, and confirm `master` before starting the next ticket.
- Never background a worker and finish the captain turn. If a worker stalls, resume or replace that worker explicitly; do not leave a half-finished ticket silently.
- After T02-30: run both `npm test` and `npm run ci`, append STATUS, and return `PHASE EXIT GREEN` only after all results are recorded. Do not start phase 5.
