# T02-210 Range-Bearing Graphics and Acceptance

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** M\
**Depends on:** T02-208, T02-209\
**Merge target:** `feature/minimum-separation-graphics`\
**Launch:** Implement this ticket only, then stop this feature.

## Mission

Render all session RBLs with manual-aligned lines/readouts, edge retention,
TOOLS/TLS settings, protected datablock geometry, and complete drop/report-loss/
session cleanup. Complete operator acceptance and user documentation.

## Research and authority

Manual: `/home/ben/Documents/stars refs/full_manual.pdf`, TI 6191.409 Rev30.

- Section 6.7 pp. 6-55–56, **PDF 585–586**: dynamic endpoints/readouts and
  label near the end point; label remains at screen edge if it reaches the edge
  or the endpoint goes offscreen. Outside radar tileset gives 777, not merely
  outside the viewport.
- Figure 6-6 p. 6-57, **PDF 587**: straight thin connecting RBL and plain
  readout `078/5.14/3-1`. Inspect the actual raster figure; annotation arrows,
  outer figure frame and surrounding explanatory text are not scope graphics.
- Section 4.9.1 p. 4-47, **PDF 257**: TOOLS character size includes RBL text.
- Section 4.10 Table 4-1 p. 4-74, **PDF 284**: TLS brightness includes RBLs.
- Appendix B Table B-1 p. B-4, **PDF 932**: default RBL color white 255,255,255.
- Section 6.8 p. 6-58, **PDF 588**: single/all deletion removes graphics.

Pixel offsets/line width, ID reuse, cancellation and missing-endpoint cleanup
are explicit trainer policies, not proprietary manual algorithms. Do not
reintroduce viewport clamping in existing minimum-separation graphics.

## Rendering, geometry, and lifecycle contract

1. Draw each RBL as a straight thin white connection between its current endpoint
   positions. Render a plain unboxed readout near the chosen second endpoint,
   using T02-208's format and held range value. Use current report pose for
   tracks and stored ENU for fixed points. Do not draw CPA triangles, a distance
   box, NO XING, extra RBL endpoint markers, or prediction/PTL lines. Existing
   target symbols and separately enabled PTLs keep their own owners.
2. TOOLS controls readout font size; TLS controls line/text brightness, including
   off. Use existing Canvas/font/brightness helpers. Line width and a small
   label offset are trainer layout choices. No new palette or DCB control.
3. Keep the entire readout visible when it contacts an edge or its endpoint moves
   offscreen. Clamp its measured text bounds to the PPI viewport using an
   RBL-specific layout path. Keep attached offscreen tracks/lines alive; clip
   only drawing as necessary. Camera range/pan changes do not change endpoints,
   displayed bearing/range, IDs, or range-update timers.
4. Add actually visible RBL segments and measured text rectangles to the
   datablock protected geometry pipeline. Do not rewrite the solver or change
   ordinary hit testing. TLS-off graphics do not reserve invisible obstacles.
   RBL text/lines are measurement display, not aircraft-selection hit regions.
5. Remove affected lines on explicit track drop/termination, despawn, or absent/
   invalid endpoint report, as the approved trainer lifecycle. Do not remove
   merely offscreen endpoints. Revalidate first pending track when committing
   creation; failed creation preserves independently valid active lines.
6. Session replacement clears all active/pending lines and errors using the
   existing reset path, including clear-to-empty sessions. No PREF persistence
   or stale scenario fix/report references. F7/list/TPA/MIN coexistence keeps
   each active feature and its settings independent.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Any valid numbered RBL | Thin white line and unboxed readout near end | Paint and protected geometry only | No MIN/CPA symbols or prediction side effects | Fig. 6-6; PDF 587; Table B-1 PDF 932 |
| Exactly one track / both tracks | Traversal field / no traversal field | T02-208 report-driven readout | Heading-away track still uses GS/distance; no NO XING | 6.7 pp. 6-55–56; PDF 585–586 |
| Endpoint goes offscreen / readout touches edge | Full readout stays at screen edge | Line remains active | No viewport-derived 777 or MIN clamp change | 6.7 p. 6-56; PDF 586 |
| TOOLS size / TLS brightness/off | Correct text sizing and brightness | Existing display controls only | Off graphics contribute no protected obstacles | 4.9.1/4.10; PDF 257/284 |
| `*T3` Enter / `*T` Enter | Remove one/all graphics | Same model IDs; survivors stable | Bad ID preserves existing lines and shows RBL ID | 6.8 p. 6-58; PDF 588 |
| Drop/despawn/report loss / scenario reset | Remove attached lines / clear session | No stale IDs/references | Offscreen alone is not loss | Explicit trainer lifecycle |
| F7 T and active MIN/TPA alongside RBL | Independent lists/tools | No ownership/selection/PTL/intent changes | Wrong-origin entry cannot cross families | T02-207; 4.9.11 PDF 268 |

## Files, user surfaces, and acceptance

Likely owners: `rangeBearingLines.ts`, `render/renderScopePaint.ts`, the existing
protected-geometry collector, thin `render/renderScope.ts` draw-order hookup,
`scopeView.ts`, existing explicit track-drop paths, and `src/ui/shell.tsx` session
reset. Preserve shipped render/DCB/Preview splits; scopeKeys remains intact.

Finish `keymap.ts` Help/search and command reference, `docs/USER.md`, current phase
README and the existing backlog subsection with what is actually shipped and
any real remaining callable gaps. Remove the intermediate "painting pending"
claim. Do not create future backlog entries for excluded modes or undisclosed
proprietary algorithms. State optional tileset/unbounded-plane, ID/rounding,
zero-speed, error metadata, and lifecycle trainer choices plainly.

- [x] Automated: extend the sole `rangeBearingLines.integration.test.ts` through
      key entry -> endpoint selection -> report changes -> Canvas paint ->
      individual/all deletion. Reuse `src/scope/test/mockCanvas.ts`.
- [x] Automated: 1–9 lines, all endpoint combinations, orientation/readout,
      magVar applied once, traversal omission, overflow/zero speed and prescribed
      range cadence appear correctly in painted output.
- [x] Automated: labels at every edge/corner, camera range/pan, offscreen tracks,
      authored tileset 777, TOOLS/TLS off, and datablock protected geometry.
- [x] Automated: explicit drop/despawn/report loss, failed replacement, session
      reset, PREF exclusion, and coexistence with MIN/F7 lists/TPA preserve the
      named state boundaries. No World/plan/intent/selection side effects.
- [x] Manual-source review: compare every contract row and actual Figure 6-6
      raster, color/settings references, and all user-facing help examples.
- [ ] Manual-browser check (UNRUN): demonstrate click/click, typed/mixed endpoints,
      nine lines, moving/offscreen endpoint edge labels, single/all deletion,
      errors and MIN/list/TPA coexistence. Save evidence outside tracked files;
      record unrun checks honestly if no browser is available.
- [x] Gate: focused acceptance, `npm run ci`, and `git diff --check` pass.
      Captain's independent supplied-manual review remains a post-merge gate;
      browser work remains unrun because the browser was unavailable.

Worker manual-source review: PDF 585–586 §§6.7–6.8 confirms the endpoint forms,
readout, range cadence, edge retention, tileset `777`, and deletion behavior;
the opened PDF 587 raster shows the plain thin line and unboxed `078/5.14/3-1`
readout. PDF 257 names TOOLS for RBL size, PDF 284 names TLS for RBL brightness,
and PDF 932 sets default RBL color white. No annotation arrows, figure frame,
endpoint markers, or MIN graphics were used as RBL scope graphics.

Manual browser check remains unrun: no browser surface was available in the
worker environment. No live visual result is claimed.

## Non-goals and handoff

No new surveillance modes, CPA/vertical advice, global/per-track PTL changes,
Command IR, speech/Path C, significant-point `*F`/emergency tools, scenario-specific
branches, persisted lines, or further tickets. Worker commits explicit paths
only after gates and returns READY TO MERGE or BLOCKED. Never merge, spawn, or
push. Captain's merge target remains the authorized feature branch, not master.
