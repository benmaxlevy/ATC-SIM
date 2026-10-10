# T02-204 Minimum-Separation Model and Prediction

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** M\
**Depends on:** T02-07, T02-75, T02-77 (shipped baseline)\
**Blocks:** T02-205, T02-206\
**Merge target:** `feature/minimum-separation-graphics`\
**Launch:** Implement this ticket only. Stop before downstream tickets.

## Mission

Add the session-only state and pure prediction adapter for one
controller-selected minimum-separation pair. T02-205 owns operator entry;
T02-206 owns painting, lifecycle integration, and feature acceptance. This
ticket must not expose an incomplete keyboard control or change any aircraft.

## Research and authority

The user-supplied Raytheon TI 6191.409, Full STARS FSL TCW/TDW Operator's
Manual, Final Revision 30, 20 August 2019, is authoritative for this feature.
Local source: `/home/ben/Documents/stars refs/full_manual.pdf`.

- **Section 6.4, p. 6-17 (PDF page 547):** `<MIN>` followed by two track
  selections displays and dynamically updates one minimum-separation pair.
  `<MIN><ENTER>` removes the graphics; a new selected pair replaces the old
  pair. `DUP TRK` and `ILL TRK` are exact errors. The feature is unavailable
  in DSF/DSA modes, which this trainer does not implement.
- **Figure 6-1, p. 6-18 (PDF page 548), and the supplied reference image:**
  two projected positions, joining separation graphic, boxed NM value, and
  `NO XING` beneath the value when horizontal distance increases. Zero
  predicted horizontal separation is `0.00 NM` regardless of altitude.
- **Visual evidence overrides OCR:** the supplied page image says `NO XING`,
  not `NO XING?`. The OCR text adds an unsupported question mark.
- **R07:** <https://docs.virtualnas.net/crc/stars/#tools> confirms the command
  forms; CRC mapping/behavior is secondary to the supplied manual.
- **Repository seams:** `src/core/alerts/conflictAlert.ts` exports
  `computeKinematicCpa`; `TrackDisplay.lastReport` contains displayed
  surveillance pose; `world.navigation.magVarDeg` supplies heading-frame
  conversion. `src/scope/ptl.ts` supplies pure projection helpers.

### Explicit trainer choices, not claimed STARS algorithms

The manual specifies presentation and entry, not the numerical predictor,
forecast horizon, or invalid-number handling. The approved predictor is
straight-line current motion from the two latest displayed reports, with no
future route/turn forecasting and no CA look-ahead cap. Reports remain at
their displayed poses; do not advance them to live truth or synchronize their
timestamps by adding hidden extrapolation. Preserve that distinction in
comments and later user documentation.

## Scope and ownership

- Add `src/scope/minimumSeparation.ts` for pure prediction and state helpers.
- Add session state to `src/scope/scopeView.ts`; initialize it empty.
- Add `@scope` exports in `src/scope/index.ts` as needed by later integration.
- Add focused unit coverage in `src/scope/test/minimumSeparation.test.ts`.
- Do not modify the CA evaluator, thresholds, inhibit state, or alert arrays.

## State and prediction contract

The logical state has an optional active pair of distinct aircraft IDs and
pending selection of none, first target, or second target with a first ID.
Names of concrete TypeScript fields are an implementation detail. Never key
the pair by callsign, beacon code, array index, or current World selection.

Logical inputs are begin, select displayed aircraft ID, cancel pending,
clear all, and invalidate active pair. Starting/restarting or cancelling a
pending selection preserves the previous active pair. Only a valid second
selection replaces it. A duplicate or invalid pair aborts the pending entry
atomically; it must not clear a still-valid previous pair. These recovery
rules are documented trainer choices where the manual does not specify them.

Use the existing pure CPA helper with minimal report-backed inputs, not an
alert evaluation call or projected pilot intent. Convert magnetic heading to
true ENU exactly once. With relative position `r` and velocity `v`, future
closest approach uses `max(0, -dot(r, v) / dot(v, v))`; preserve the existing
helper's near-zero-relative-speed guard. Project both aircraft to that same
future time using the existing coordinate/projection helpers. Equal velocities
use time zero and current distance. Return the two projected positions,
unrounded horizontal NM distance, and whether horizontal distance is increasing.

`NO XING` requires increasing horizontal separation; do not equate every
non-converging result with increasing separation. Equal-velocity parallel
tracks must not show the cue. Altitude, ownership, flight rules, pilot intent,
CA/ATPA status, and global/per-track PTL enablement do not qualify or suppress
this horizontal calculation.

Reject non-finite positions, headings, speeds, variation, or results. Invalid
prediction has no drawable result; never emit NaN/Infinity coordinates or
fabricate zero distance. T02-205 maps invalid selectable report input to its
documented `ILL TRK` trainer extension. Formatting to two decimals belongs
to T02-206; mathematical zero must display as positive `0.00 NM`, never `-0.00 NM`.

## Acceptance Contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Valid report pair with future convergence | Common future CPA time, two projected positions, horizontal distance | Pure result; no World mutation | No alert horizon or altitude qualification | §6.4 p. 6-17; Figure 6-1 p. 6-18; approved predictor delta |
| Diverging reports | Future minimum is current distance; increasing-distance flag is true | Pure result | Never project to a past crossing | Figure 6-1; approved future-time delta |
| Equal-velocity or stationary reports | Finite current distance and time-zero positions | Pure result; increasing-distance flag false | No divide-by-zero or false `NO XING` | Approved numerical delta; Figure 6-1 cue condition |
| Same horizontal crossing, different altitudes | Zero horizontal distance | Pure result | Vertical separation must not change result | Figure 6-1 p. 6-18 |
| Begin, select A, select B | One new active distinct pair; pending cleared | MIN state only | No World selected-aircraft fallback | §6.4 p. 6-17 |
| Begin, select A, select A | Abort pending; preserve previous valid pair | Exact logical error `DUP TRK` | No replacement or duplicated pair | §6.4 p. 6-17; approved recovery delta |
| Cancel pending, restart, or clear | Cancel/restart preserves active pair; clear removes active and pending | MIN state only | Repeated clear is harmless | §6.4 clear/replacement; approved cancellation delta |
| Non-finite report or prediction | No drawable prediction | No aircraft or alert mutation | Invalid input is not zero separation | Explicit trainer numerical guard |

## Acceptance criteria

- [ ] **AC1 — Automated:** State stores only stable aircraft IDs, initializes
  empty, supports one active pair, and performs atomic replacement/clear.
- [ ] **AC2 — Automated:** A synthetic converging pair produces independently
  checked CPA time, positions, and horizontal distance. Nonzero magnetic
  variation changes the world-frame projection exactly once.
- [ ] **AC3 — Automated:** Parameterized parallel/stationary and diverging
  edges produce finite results and correct increasing-distance flags.
- [ ] **AC4 — Automated:** Invalid-number edge rejects; vertical separation
  does not alter horizontal result; input reports/World/alerts are unchanged.
- [ ] **AC5 — Inspection:** No Command IR, parser, readback, pilot, scenario,
  preference persistence, or alert-evaluator changes. No visible MIN binding.
- [ ] **AC6 — Manual-source review:** Every claimed manual requirement is
  checked against §6.4 and Figure 6-1, with predictor/recovery choices labeled
  as trainer choices rather than sourced STARS internals.

## Tests, user surfaces, and non-goals

Keep one mathematical happy path plus two or three real edge groups in the
unit file. T02-206 owns the single feature acceptance/integration file, Help
registry, `docs/USER.md`, phase README addendum, and backlog completion update.
No production airport fixtures or facility-specific branches. Run focused
tests and `npm run ci` before the implementation commit.

No route-aware forecasting, CA/MSAW/MCI changes, range-bearing lines,
surveillance/coast redesign, persisted MIN pairs, new API/schema, speech
changes, DSF/DSA simulation, or claims of full STARS/NAS compatibility.

## Manual-review checklist and handoff

- [ ] §6.4 p. 6-17: one pair, replacement, clear, and distinct displayed tracks.
- [ ] Figure 6-1 p. 6-18: horizontal-only zero and increasing-distance cue.
- [ ] Visual page/reference image: correct `NO XING` spelling, no OCR `?`.
- [ ] Predictor choices and finite-number guards are explicitly marked deltas.

Return exactly `READY TO MERGE` or `BLOCKED`, followed by branch/commit,
acceptance evidence, tests, manual-source findings, and any unresolved issue.
Do not merge, push, start T02-205, or spawn another agent.
