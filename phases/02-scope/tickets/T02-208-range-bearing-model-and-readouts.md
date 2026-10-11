# T02-208 Range-Bearing Model and Readouts

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** M\
**Depends on:** shipped T02-207; T02-75–77 surveillance reports\
**Blocks:** T02-209, T02-210\
**Merge target:** `feature/minimum-separation-graphics`\
**Launch:** Implement this ticket only. No RBL operator entry or painting yet.

## Mission

Provide a bounded, session-only range-bearing line (RBL) model, current-distance
geometry, magnetic-bearing/traversal readouts, report-driven range smoothing,
and generic optional radar-tileset boundary adaptation. T02-209 adds keyboard
entry; T02-210 adds graphics and completes lifecycle acceptance.

## Research and authority

Authoritative source: Raytheon TI 6191.409 Final Revision 30, 20 August 2019,
`/home/ben/Documents/stars refs/full_manual.pdf`.

- Section 6.7, printed pp. 6-55–56, **PDF pages 585–586**: at most nine RBLs;
  fixed points or tracks at either endpoint; current range and adapted magnetic
  bearing; traversal time only when exactly one endpoint is a track.
- Section 6.7, p. 6-56, **PDF 586**: readout `078/5.14/3-1`; range hundredths
  of NM; time minutes; range overflow above 999.99 NM and time overflow above
  99 minutes replace numerals with asterisks; outside radar tileset bearing 777.
- Section 6.7, p. 6-56, **PDF 586**: any range decrease or increase of at least
  0.1 NM updates immediately. Otherwise update on the next track update at
  least 4.5 seconds after the last range-data update.
- Section 6.8, p. 6-58, **PDF 588**: separately numbered removal and all removal.

The manual does not publish the complete smoothing algorithm, ID allocation,
rounding, zero-speed, or endpoint-loss policy. The explicit trainer choices
below fill those gaps; do not invent a proprietary filter or a new safety claim.
DSF/DSA are not modeled here and must not be confused with the FSL display latch.

## State and geometry contract

1. Keep a session collection with IDs 1–9 and endpoint variants: static clicked
   ENU location, catalog fix ID plus resolved ENU location, or canonical aircraft
   track ID. Static coordinates never change with camera range/pan. No PREF or
   persistent storage. Allocate the lowest free ID on successful insertion;
   deletion never renumbers surviving lines. Identical/coincident endpoints and
   duplicate endpoint pairs are allowed; no invented DUP TRK error.
2. Track endpoints use their last displayed surveillance report, not live World
   truth, interpolated aircraft motion, or a future prediction. Position/time
   must be finite; RBL does not require altitude, heading, ownership, or on-screen
   visibility for an already attached/typed track. Missing speed suppresses
   traversal time rather than inventing speed. World membership/report loss is
   handled through the explicit lifecycle in T02-210.
3. Bearing always runs from the chosen first endpoint to the second. Use generic
   ENU course/distance helpers and `trueToMagneticDeg` with authored navigation
   magVar applied once. Traversal uses `60 * distanceNm / groundSpeedKt`, using
   the track's report speed irrespective of heading or which endpoint is track.
   Two tracks or no tracks omit the entire traversal field.
4. Exact format is `BBB/RR.RR[/M]-ID`, without NM suffix or box. Bearing is
   nearest whole degree, zero-padded, with rounded north normalized to 000.
   Range has two decimal places; time is nearest integer with no leading zero.
   Overflow masks are `***.**` and `**`; compare raw values with the manual's
   limits before rounding. Positive distance with zero speed gives traversal
   `**`; coincident distance with zero speed gives 0. These are trainer choices.
5. Implement the prescribed range cadence per line on new endpoint-report
   events, using simulation/report time, not Date.now, rAF frequency, or hidden
   physics ticks. Compare calculated range with currently displayed range;
   decreases of any size and increases >=0.1 NM update immediately. Smaller
   increases wait for a report event at >=4,500 ms since the last range update.
   Unchanged frames do not postpone that deadline. Bearing/time refresh on new
   reports; do not invent additional low-pass filtering. Preserve raw geometry
   independently from displayed rounded range. Fixed/fixed lines need no ticking.
6. Add optional generic scenario `radarTilesetBoundaryNm` polygon adaptation in
   local ENU NM, validated and passed through normal loading/session binding.
   Use finite vertices, at least three points, and boundary-inclusive containment.
   An endpoint outside the authored polygon gives bearing 777. Missing adaptation
   means an explicitly documented unbounded trainer plane. Never infer tileset
   bounds from viewport, weather tiles, MVA geometry, radar coverage circles, or
   a facility switch. Do not invent bounds for shipped airports.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Fixed A to fixed B | Three-digit magnetic bearing and two-decimal range, no time | One numbered line | Coincident endpoints show zero range | 6.7 pp. 6-55–56; PDF 585–586 |
| Track to fix / fix to track | Current distance; traversal from the single track's GS | Report pose only; direction follows endpoint order | Reverse order reverses bearing, not traversal duration | 6.7 p. 6-55; PDF 585 |
| Track to track | Moving range/bearing, no traversal field | Independent latest endpoint reports | No heading/altitude/CPA qualification | 6.7 p. 6-55; PDF 585 |
| Range decrease / increase >=0.1 NM | Immediate displayed update | Update range timestamp | Test 0.099 versus 0.100 NM increases | 6.7 p. 6-56; PDF 586 |
| Smaller increase | Next report event at >=4,500 ms updates | Per-line simulated-time cadence | Pause/render-only frames do not update or reset deadline | 6.7 p. 6-56; PDF 586 |
| Range >999.99 / time >99 | Asterisk masks | Readout only | Test exact limit and just-over limit before rounding | 6.7 p. 6-56; PDF 586 |
| Outside authored tileset / merely offscreen | Bearing 777 / normal adapted bearing | No line deletion | Camera bounds never substitute for tileset | 6.7 p. 6-56; PDF 586 |
| Remove ID 2; insert another line | Other IDs stay stable; new line receives 2 | Bounded collection only | Maximum nine lines; no allocation before insertion | 6.8 p. 6-58; PDF 588; explicit trainer ID policy |

## Files and acceptance criteria

Likely owners: new `src/scope/rangeBearingLines.ts`, `scopeView.ts`, generic nav
geometry/heading helpers, `src/scenario/types.ts`, `src/scenario/load.ts`, and
normal bootstrap/session adaptation binding in `src/main.tsx`/`src/ui/shell.tsx`.
Do not add a facility-specific path or alter existing schema shapes unnecessarily.

- [ ] Automated: endpoint-order/magVar and one-track/two-track/fixed cases use
      synthetic reports with sampled pose different from live aircraft truth.
- [ ] Automated: range cadence has decreases, subthreshold/threshold increases,
      exact 4,500 ms boundary, independent report events, paused/accelerated sim,
      unchanged frames, and overflow/zero-speed cases.
- [ ] Automated: bounded IDs and optional polygon JSON contract work generically;
      absent bounds and on-boundary/offscreen cases follow the explicit policy.
- [ ] Inspection: model mutates no World aircraft, plan, intent, selection, alert,
      audio, handoff, PTL, camera, or persistent preference state.
- [ ] Gate: focused tests, `npm run ci`, `git diff --check`, and independent
      supplied-manual review pass.

Begin the single synthetic feature acceptance file
`src/scope/test/rangeBearingLines.integration.test.ts`; later tickets extend it.
Keep pure numeric units minimal and parameterized. Model-only work exposes no
callable RBL surface, so do not add a new future backlog item.

## Non-goals and handoff

No input, line painting, new F7 commands, CPA/minimum-separation behavior,
significant-point `*F`, emergency-airport tools, real sensor feeds, DSF/DSA modes,
wind model, Command IR, speech, or facility data. Document adaptation/rounding
trainer choices in source and ticket evidence. Work from the configured feature
base in an isolated ticket branch/worktree. Commit explicit paths only after
CI. Return READY TO MERGE or BLOCKED with AC/test/manual evidence; never merge,
spawn, push, or start T02-209.
