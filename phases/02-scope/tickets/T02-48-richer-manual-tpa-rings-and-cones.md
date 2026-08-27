# T02-48 Richer manual TPA rings and cones

**Phase:** 02 Scope (TPA / ATPA addendum)
**Priority:** P1
**Size:** L
**Depends on:** T02-45, T02-49
**Blocks:** T02-50
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Manual TPA becomes **per-track** and gains **cones**, driven by the chords T02-49 parses.

Today `ScopeView.tpa` is a single global `{ on, radiusNm }` (`src/scope/scopeView.ts`, `TpaState` in `src/scope/tpa.ts`). `drawTpaRings` (~line 667 of `src/scope/renderScope.ts`) calls `aircraftForTpaRings`, which paints that one radius on the **selected** track, or every F3-**owned** track when nothing is selected. Radii are frozen to `TPA_RADIUS_NM = [2, 3, 5, 10]` with `DEFAULT_TPA_RADIUS_NM = 5`. There is no cone, no per-track radius, and no size-readout digit.

That global singleton becomes a map of per-track manual TPA graphics so several tracks can carry different radii and lengths at once — which is what R07 Fig 36 and Fig 37 show.

## Context

T02-28 shipped the DCB TPA toggle, the `TPA_MI` spinner, and the selected-else-owned J-ring. T02-47 **leaves that TPA freeze in place** and only lives the ATPA cells. Do not expand the spinner; do not remove the DCB path.

T02-49 ships `parseStarsChord` and `applyStarsChordAction`. Until this ticket, `*J`, `*P`, `**J`, `**P`, and the `*D+` family parse but dispatch returns `"unsupported"`. Fill those actions in. Do not re-parse.

T02-45 owns `atpaConePoints`, the needle half-angle, the flat end cap, and `atpaSuppressesManualTpaCone`. Manual `*P` drawing is this ticket; suppression is already the T02-45 predicate. Do not implement a second wedge.

`phases/LATER-IMPLEMENTATION-BACKLOG.md` **"Richer TPA controls"** still lists the `*J` chord, multi-ring targeting, and richer styling as follow-ups. This ticket closes that subsection.

## Frozen facts (R07)

Read **R07** `docs.virtualnas.net/crc/stars` — "TPA J-Rings and Cones". These facts are frozen:

- A **J-ring** is a circle centered on the target. The controller specifies the radius in nautical miles. Allowable range **1–30 NM** (`*J(#.#)`).
- A **TPA cone** is a cone projecting out from the target location along the target's calculated **ground track**. The controller specifies the length in nautical miles. Allowable range **1–30 NM** (`*P(#.#)`).
- Display of the J-ring radius or cone length can be **inhibited** by keyboard command (`*D+`, `*D+E`, `*D+I`).
- `**J` removes **all** rings. `**P` removes **all** cones.

## Visual — from R07 Fig 36 and Fig 37

Fig 36 (TPA J-Rings) and Fig 37 (TPA Cones) actually show:

- **Fig 36:** two tracks (`AAL122`, `DAL495`) each carry their **own independent J-ring at the same time**. Rings are thin unfilled light-blue circles centered on the target symbol. The radius digit (`3`) sits **inside the ring at its lower-left** (about 7–8 o'clock). This is the multi-target requirement for rings.
- **Fig 37:** two tracks (`AAL766`, `DAL276`) each carry their **own independent cone**. Cones are **long, narrow, unfilled wedges** with a **flat far end cap** (not a pointed tip). Mileage digits sit **inside / next to the body**. `AAL766` is labeled `3`; `DAL276` is labeled `2.5` on a visibly shorter cone. That is the multi-target requirement for cones **and** the proof that tenths render.
- Stroke is TPA blue (`TPA_STROKE_COLOR` / `PALETTE.tools`). Nothing is filled. J-rings are never suppressed by ATPA.

## Research

Read **R07** `docs.virtualnas.net/crc/stars` — "TPA J-Rings and Cones", Command Reference Table 36 (`*J`, `*P`, `**J`, `**P`, `*D+`).

- Search: `CRC STARS TPA J-ring cone *J *P ground track`
- **Terms:** J-ring, TPA cone, ground track, size readout. Not CA halo, not TCAS, not DRI, not ATPA pairing.
- Comment: DCB spinner stays 2/3/5/10 by T02-28 freeze; the 1–30 chord range is R07. They are deliberately different.

## Scope

- Per-track manual TPA state, keyed by track id, **replacing the single global graphic**. Keep the DCB fields `{ on, radiusNm }` on `ScopeView.tpa` so the toggle, spinner, and PREF round-trip of those two values are unchanged. Each per-track entry holds:
  - optional ring radius (`ringNm`);
  - optional cone length (`coneNm`);
  - a size-readout inhibit flag.
  Suggested home: `TrackDisplay` (alongside T02-45's ATPA flags) or a map on `ScopeView.tpa`. Either is fine; a second global singleton is not. Drop the entry when the track leaves the world.
- DCB **TPA_MI** spinner (`DisplayControlBar.tsx` ~line 1371) keeps frozen presets **2 / 3 / 5 / 10** NM, default 5 NM off. It supplies the **default radius applied when the DCB TPA toggle turns rings on**. Chord-entered values accept the full **1–30 NM** range with tenths (already validated by T02-49 — out of range is `invalid`, not clamped). **The DCB presets and the chord range are deliberately different:** T02-28 froze the spinner as four trainer analog steps; R07 chords are the full range. Do not expand the spinner to 1–30. Do not clamp a parsed `*J7.5` down to 5 or 10.
- Backward compatibility: DCB TPA on still rings the **selected** track, or every **owned** track when nothing is selected, at the spinner radius. `aircraftForTpaRings` (or a successor that unions DCB targets with per-track entries) must preserve that. Existing `src/scope/tpa.test.ts` cases stay green **or** are migrated with a stated reason (AC3/AC6 stub wording is already T02-45/T02-47's rewrite; AC1/AC2/no-selection/AC4/AC5 are this ticket's regression).
- Cone geometry along the track's **ground track** (velocity heading, not assigned heading, not leader bearing). Reuse the T02-45 wedge helper — same named half-angle, flat end cap, closed polyline, `TPA_STROKE_PX`. A thin wrapper that projects a point along ground track and calls `atpaConePoints` is fine; a second wedge implementation is not. Stroke `PALETTE.tools`. Never fill.
- Ring digits: tenths-for-non-whole (`3`, `2.5`), **inside the ring at lower-left**, TPA color. Cone digits: same formatter, **alongside / inside the body**. Honor the per-track inhibit flag. Share T02-46's tenths formatter if it exists; do not invent a third format.
- `applyStarsChordAction` (T02-49) stops returning `"unsupported"` for:

  | Chord | Mutation |
  | --- | --- |
  | `*J(#.#)` | set slewed track's `ringNm` |
  | `*J` | clear that track's ring only |
  | `**J` | clear every ring |
  | `*P(#.#)` | set slewed track's `coneNm` |
  | `*P` | clear that track's cone only |
  | `**P` | clear every cone |
  | `*D+` / `*D+E` / `*D+I` | toggle / enable / inhibit that track's size-readout flag |

  T02-46 already consumes `*D+` for ATPA cone-mileage flags. This ticket fills the **manual TPA** half of the same action (J-ring radius digits and `*P` length digits). Do not add a second parser.
- An ATPA **warning** or **alert** cone on a track suppresses that track's **manual cone**, via `atpaSuppressesManualTpaCone` (T02-45). Monitor does not suppress. J-rings are not cones and are never suppressed.
- **PREF:** per-track manual graphics **do not persist**. They are per-session track state, not display preferences. Do **not** add them to `serializeDcbPref` / `applyDcbPref`. Do **not** bump `DCB_PREF_SCHEMA_VERSION`. T02-47's PREF schema (`tpa.on` / `tpa.radiusNm` plus the five `AtpaState` fields) is undisturbed. A PREF restore may re-apply DCB rings via selected-else-owned at the saved spinner radius; chord-entered rings and cones do not come back.
- Same commit, per `.cursor/rules/later-implementation-backlog.mdc`: **close** the **"Richer TPA controls"** subsection. It currently lists `*J`, multi-ring targeting, and richer styling as follow-ups; those are now this ticket. Remove it, or replace it with a one-line "shipped in T02-48/T02-49" note that is not an open follow-up. Do not delete "ATPA separation criteria not yet modeled" (T02-44). `<MULTI FUNC>` inhibit commands stay deferred elsewhere.

## Out of scope

- ATPA pairing and automatic cones (T02-44 / T02-45).
- Datablock in-trail distance (T02-46).
- DCB ATPA cells (T02-47).
- `<MULTI FUNC>` inhibit commands (`M`, `C`, `Y`) — still backlog.
- Any change to conflict alert (T04-09). Still no 3 NM CA halo.
- Expanding the DCB spinner beyond 2/3/5/10.

## Implementation notes

Keep `tpaRingPoints` / `tpaScreenRadiusPx` / `stepTpaRadiusNm` / `TPA_RADIUS_NM`. If `TpaState` grows a tracks map, migrate `DEFAULT_TPA_STATE` equality in `tpa.test.ts` AC2 with a stated reason — do not silently break `{ on: false, radiusNm: 5 }`.

Chords are scope-only. No Command IR. `DAL123 H270` still turns.

World is `+x` east, `+y` north; ground-track bearing uses the same `sin` east / `cos` north convention as `tpaRingPoints`.

## Trainer deltas

Single TCP, so every painted ring and cone is visible on this TCW. No TDW variant. CA stays T04-09 datablock text; circles on this scope are TPA J-rings only.

## Acceptance criteria

- [ ] **AC1 —** Two tracks carry different J-ring radii at the same time (for example 3 NM and 5 NM). Each ring is centered on its own target. DCB TPA on still rings the selected track, or every owned track when nothing is selected, at the spinner radius. Existing `tpa.test.ts` AC1 / AC2 / no-selection cases stay green or are migrated with a stated reason.
- [ ] **AC2 —** `*J` on the slewed track removes **only that** track's ring; the other track's ring remains. `**J` clears every ring. `*P` / `**P` behave the same for cones.
- [ ] **AC3 —** A `*P` cone is a narrow unfilled wedge with a flat far end cap, vertex on the target, axis along the track's **ground track**, length equal to the commanded NM. Tenths render: two tracks with lengths `3` and `2.5` paint simultaneously, matching Fig 37. Axial pixel length at a known camera is `lengthNm * pxPerNm` (± a small epsilon for the flat cap).
- [ ] **AC4 —** A chord accepts the full 1–30 NM range with tenths (`*J1`, `*J7.5`, `*J30`, `*P2.5`). The DCB `TPA_MI` spinner still steps only 2 / 3 / 5 / 10 and still supplies the default radius when the DCB TPA toggle turns rings on. The two ranges stay different by design.
- [ ] **AC5 —** `*D+I` (or inhibit via `*D+`) hides the radius / length digits on that track and **keeps** the ring and/or cone stroke. `*D+E` restores the digits.
- [ ] **AC6 —** A warning or alert ATPA cone on a track suppresses that track's manual `*P` cone (`atpaSuppressesManualTpaCone`). A monitor cone does not. The same track's J-ring still paints. No CA 3 NM halo.
- [ ] **AC7 — Research:** module comment cites R07 "TPA J-Rings and Cones" for 1–30 NM, ground-track cones, size-readout inhibit, and `**J` / `**P`; it states that DCB presets and the chord range are deliberately different, and that per-track graphics are session state not PREF. The **"Richer TPA controls"** backlog subsection is closed in the same commit.

## Test plan

- Unit: `src/scope/tpa.test.ts` — two radii at once; DCB selected-else-owned regression; spinner still `[2, 3, 5, 10]`; size-readout inhibit hides digits only; CA-no-halo.
- Unit: extend `src/scope/starsChord.test.ts` (or a new apply test) — `*J` / `*P` / `**J` / `**P` / `*D+` family mutate per-track state and no longer return `"unsupported"`.
- Unit: cone along ground track, 3 and 2.5 lengths, reuse of T02-45 half-angle / end cap; warning/alert suppress the manual cone, monitor does not.
- Regression: existing `tpa.test.ts` AC1/AC2/no-selection/AC4/AC5; T02-47 PREF tests still round-trip `tpa.on` / `tpa.radiusNm` without a per-track map; heading command still works.
- `npm test`.

## Suggested files

- `src/scope/tpa.ts`
- `src/scope/tpa.test.ts`
- `src/scope/scopeView.ts`
- `src/scope/renderScope.ts`
- `src/scope/starsChord.ts`
- `src/scope/starsChord.test.ts`
- `src/scope/atpaCone.ts` (reuse only)
- `src/scope/trackDisplay.ts`
- `src/ui/DisplayControlBar.tsx` (spinner freeze; DCB toggle wiring)
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
