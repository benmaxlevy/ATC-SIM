# T02-209 Range-Bearing Input and Removal

**Phase:** 02 Scope\
**Priority:** P1\
**Size:** L\
**Depends on:** T02-208; shipped T02-207 MULTI FUNC/splat separation\
**Blocks:** T02-210\
**Merge target:** `feature/minimum-separation-graphics`\
**Launch:** Implement this ticket only. T02-210 supplies RBL graphics.

## Mission

Implement literal-splat `*T` range-bearing creation/removal with two endpoint
stages, exact resolution precedence/errors, and scope-only state effects. Keep
F7 T list management and all other existing command families isolated.

## Research and authority

Source: `/home/ben/Documents/stars refs/full_manual.pdf`, TI 6191.409 Rev30.

- Section 6.7 p. 6-55, **PDF 585**: literal star then T; each endpoint may be
  selected by click or typed identity. First typed track requires SPACE then
  ACID/beacon and Enter; second typed track requires identity and Enter. Typed
  fix is 3–7 characters then Enter. Keyboard initiation; no DCB/DCP initiator.
- Section 6.7 p. 6-56, **PDF 586**: fix wins over an identical ACID; errors
  FORMAT, CAPACITY, DUP ID <ACID> with active/inactive TCP supplemental lines,
  DUP BCN, NO FLIGHT.
- Section 6.8 p. 6-58, **PDF 588**: `*T` [ID] Enter removes that line or all when
  ID omitted. Bad/nonexistent ID is RBL ID; extraneous data is FORMAT.
- Sections 4.9.6/11/15, pp. 4-53/58/63, **PDF 263/268/273**: MULTI FUNC T
  list relocation/toggle/resize remain separate. Appendix D Tables D-1–3,
  **PDF 942–944**, distinguishes F7 MULTI FUNC from Shift+8/keypad splat.
- Section 2.14 pp. 2-85–87, **PDF 141–143**: Preview input and error surfaces.

Endpoint cancellation, atomic insertion, hit ties, lost-report recovery and
focus policy below are explicit trainer choices, not additional manual commands.
No new DSF/DSA mode or proprietary identity/sensor protocol is required.

## Exact grammar and resolution

1. Enter via the existing literal-splat Preview route, `entryOrigin: literalSplat`.
   No new global star capture in radio/native inputs. Normal scope entry is
   `*`, `T`, followed by endpoint input or removal Enter. Keep F7 T/TV/etc. in
   MULTI FUNC. Do not compact away the leading SPACE after T: it marks a first
   typed track. An optional existing-style space between star and T may be
   tolerated, but it must not erase the operand's leading-space distinction.
2. At the initial stage, `*T Enter` removes all. An unspaced numeric operand,
   e.g. `*T3 Enter`, removes ID 3; missing/out-of-range IDs yield RBL ID. A valid
   catalog fix of length 3–7 is resolved before treating a longer numeric token
   as an invalid deletion ID. Leading SPACE selects the first typed-track form,
   not deletion; `*T SPACE 3 Enter` is an unresolved track and yields NO FLIGHT.
3. First fixed endpoint: `*T FIX Enter` (no separator required after T), or
   click a geographic location. First track: click a displayed track, or
   `*T SPACE ACID Enter` / `*T SPACE BCN Enter`. A first typed ACID without
   the required SPACE cannot become a track; unknown fix yields NO FLIGHT.
4. Second endpoint: click a location/track, or type FIX/ACID/BCN then Enter.
   No repeat star/T or required leading SPACE is needed. Enter with no second
   operand is FORMAT and never removes active lines. Click commits immediately;
   never require an extra Enter after a second click.
5. Catalog fix lookup is exact and case-normalized, 3–7 characters, via the
   generic registry. Fix wins over matching ACID even in the SPACE form. Use
   slew or beacon to select that homonymous track; SPACE does not override the
   manual's fix precedence. No fuzzy matching, facility alias, or selected-track
   fallback. A catalog numeric fix wins when its valid-length token is used.
6. Typed tracks resolve full ACID or four-digit reported beacon to a canonical
   living track with an available finite-position/time surveillance report.
   Offscreen typed tracks are valid; do not import MIN's visibility/altitude/
   heading requirement. Detect nonunique ACIDs and reported beacons; never use
   assigned-beacon metadata, numeric callsign tails, TAB indices, or array order
   as a fallback. Inactive plans alone cannot supply a track endpoint.
7. First/second typed unknown fix/ACID or beacon without an active track gives
   NO FLIGHT. Duplicate ACID gives `DUP ID ACID`; include known active/inactive
   TCP supplemental lines as `FLIGHT ACTIVE AT TCP` and `FLIGHT INACTIVE AT
   TCP(s)`, with multiple known TCPs comma-separated. Omit unavailable metadata;
   never invent TCP ownership. Duplicate beacon gives DUP BCN. Extraneous
   fields/malformed ordering gives FORMAT. Preserve existing brief-error timing.
8. Select click targets at the latest report pose and actual visible datablock
   hit geometry. An empty on-PPI click becomes a static ENU point, not a miss.
   On-screen symbols remain eligible when their datablock is altitude-filtered.
   Use existing datablock-first/nearest-hit rules; unresolved equal-priority ties
   give NO FLIGHT and abort pending creation as an explicit trainer extension.
   Native DCB/modal/Help controls retain their own clicks and keys.

## State, routing, and forbidden effects

Initial entry -> resolved first endpoint -> waiting second endpoint -> atomic
insertion. Allocate ID and check capacity only once both endpoints resolve.
Nine existing lines give CAPACITY on a valid tenth creation; deletion remains
available. No line is added on an incomplete, invalid, or cancelled operation.
Allow coincident/same-track endpoints; do not invent DUP TRK. Revalidate an
attached first track on second commit; if lost, give NO FLIGHT, abort pending,
and preserve existing lines that remain independently valid.

Esc cancels pending creation and preserves all active lines. Backspace edits
current operand without silently changing stage/family. A fresh literal star
starts replacement command entry and clears pending RBL selection; F7, MIN,
other targeting commands, or radio/native-input focus takeover cancel pending
RBL using explicit lifecycle helpers while retaining active lines. Starting RBL
cancels competing pending MIN/Preview/TPA/filter/placement/numeric entry with
existing rollback, retaining active MIN and existing tool graphics. Repeated
`*T` begins a fresh operation. No hidden pending arm survives a focus/session reset.

Intercept RBL endpoint clicks before list relocation, ordinary selection,
handoffs, pointouts, datablock toggles, and recording the End-centering last-click
point. Mutate only pending/active RBL state and Preview/error state, plus named
competing-entry cancellation. Never alter World selection, plans/association,
ownership, intent, kinematics, alerts, audio, PTLs, maps/lists, camera, or radio.

## Contract matrix

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `*T`, point click, point click | Create fixed/fixed line | Allocate one ID at second click | Coincident points allowed | 6.7 p. 6-55; PDF 585 |
| `*T`, track click, fix Enter / reverse order | Create mixed line; model supplies time | Report-backed track and fixed ENU endpoint | No selection or ordinary click effects | 6.7 p. 6-55; PDF 585 |
| `*T` FIX Enter, FIX Enter | Create fix/fix line | Generic registry IDs/coordinates | Fix must have 3–7 characters | 6.7 p. 6-55; PDF 585 |
| `*T` SPACE ACID/BCN Enter, ACID/BCN Enter | Create typed track pair | Canonical active track IDs | Unknown: NO FLIGHT; duplicate: DUP ID / DUP BCN | 6.7 pp. 6-55–56; PDF 585–586 |
| Homonymous fix/ACID | Fix endpoint wins | No guessed aircraft | SPACE does not force track over known fix | 6.7 p. 6-56; PDF 586 |
| `*T` Enter / `*T3` Enter | Remove all / ID 3 | Active RBL collection only | Bad/nonexistent ID: RBL ID | 6.8 p. 6-58; PDF 588 |
| First endpoint committed, then empty Enter | Reject incomplete creation | No deletion/insertion | FORMAT | Explicit trainer lifecycle; 2.14/Table 2-21 |
| Valid tenth creation / malformed extra fields | Reject | Existing lines unchanged; pending clears | CAPACITY / FORMAT | 6.7 p. 6-56; PDF 586 |
| Esc / F7 T / Del MIN / radio focus takeover | Cancel pending RBL; route new owner normally | Keep active RBLs and active MIN | No stale first endpoint or wrong-origin parser fallback | Explicit trainer lifecycle; T02-207 |
| F7 T Enter while RBLs exist | Existing TAB toggle only | RBLs untouched | Literal `*T` cannot toggle lists | 4.9.11 p. 4-58; PDF 268 |

## Files, Help, docs, and tests

Likely owners: `rangeBearingLines.ts`, `previewParse.ts` grammar, `previewArea.ts`
lifecycle/errors, `scopeKeys.ts` dispatch, `ppi.ts` click ordering, `pick.ts`
report-backed picking helpers, generic fix/plan identity lookup, and focus hooks
in the existing scope/UI attachment. Keep scopeKeys intact. Do not reuse the
permissive generic FLID resolver for this narrower grammar. Add minimal Preview
multiline-error painting if needed so DUP ID supplemental rows are actually
visible; a formatter-only array is insufficient. T02-210 owns RBL line painting.

Update `src/scope/keymap.ts` Help/search and command-reference registry,
`docs/USER.md`, and current phase README with exact `*T` creation/removal, SPACE,
fix precedence, errors, capacity, and cancellation. No new DCB button or `*RBL`
alias. In the existing Dynamic range-bearing lines subsection of
`phases/LATER-IMPLEMENTATION-BACKLOG.md`, record that input/model now work but
line graphics are pending. Do not duplicate the subsection or invent other
future backlog items.

- [ ] Automated: full endpoint matrix (point/fix/track, click/typed and mixed),
      required first-track SPACE, second-stage ordering, and fix-over-ACID.
- [ ] Automated: deletion/all-clear, numeric IDs/fixes, incomplete stages,
      extraneous fields, duplicates, missing reports, capacity, and ID reuse.
- [ ] Automated: offscreen typed tracks versus report-backed visible click hits;
      sampled/live divergence; ambiguous click recovery and side-effect snapshots.
- [ ] Automated: real native/radio/Help/modal focus, F7/Ctrl+F7, pending MIN,
      TPA/list ownership, spinner rollback, Esc/Backspace/new-command/session cases.
- [ ] Automated/inspection: exact errors and visible DUP ID supplemental lines;
      Help search/current docs match actual parser and do not promise painting yet.
- [ ] Gate: extend the one `rangeBearingLines.integration.test.ts`, reuse shared
      mockCanvas, pass focused tests, npm run ci, diff check, independent manual
      review. Mark live browser checks honestly as performed or unrun.

## Non-goals and handoff

No line renderer, new F7 family, Command IR, speech/Path C, airplane control,
unsupported datablocks/DSF/DSA, significant-point `*F`, airport emergency tools,
CPA/vertical prediction, persisted RBLs, or facility-specific data. Commit only
this ticket after gates; never merge, spawn, push, or start T02-210. Return
READY TO MERGE or BLOCKED with exact contract-row/test/manual evidence.
