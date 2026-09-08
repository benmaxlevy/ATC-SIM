# T02-121 — WX VIP Availability and Unconditional Refresh

**Phase:** 02 Scope — WX VIP follow-up  
**Priority:** P0  
**Size:** S  
**Depends on:** T02-68 through T02-72 (shipped)  
**Blocks:** none  
**Launch:** Implement this ticket only. Stop after acceptance.

## Goal

Show `AVL` on the second line of MAIN `WX1` through `WX6` exactly when the
latest N0Q mosaic contains at least one pixel in that VIP level. Fetch N0Q at
boot and every five minutes regardless of all WX latches being off.

## Context

The WX cells already are full-height MAIN latches and N0Q decoding already
stores one packed mask for each VIP level. The current session loop calls
`ensureWxMosaic` every frame, but that helper returns before fetching when all
six display latches are off. Thus the DCB cannot truthfully show availability
until an operator has enabled weather.

CRC documents that the BRITE WX control shows `AVL` when weather data is
available for that level. This trainer delta places the required availability
word on the bottom line of each MAIN VIP cap; it remains a display-only state
and is not a certified STARS/NAS claim.

## Research

- R07, [CRC/vNAS STARS DCB BRITE WX](https://docs.virtualnas.net/crc/stars/):
  WX shows `AVL` when data is available for that level.
- T02-68: IEM N0Q through `/wx-iem`, six generic packed VIP masks, no
  facility branch, failure-safe empty mosaic, and five-minute refresh.
- T02-70: MAIN WX1–WX6 are existing independent display latches; DCB clicks
  never emit Command IR.

## Scope

- Make `ensureWxMosaic` fetch the initial mosaic and refresh it at
  `WX_REFRESH_MS` even when all six `wxLevels` are false.
- Preserve its one-in-flight-request-per-view behavior, ARP/bounds refresh
  policy, fixture behavior, and non-blocking animation loop call.
- Add a pure generic helper that reports whether a requested VIP mask contains
  at least one set pixel. A level is available iff its own mask has one or
  more pixels; another VIP level never makes it available.
- Render `AVL` as the WX cap's bottom line iff its matching level is
  available. Keep `WX<n>` as the top line and retain existing pressed/latch
  behavior.
- Empty, never-fetched, and failed mosaics show no `AVL`.

## Out of scope

- NEXRAD source, WMS/proxy, RGB/dBZ mapping, VIP boundaries, paint ordering,
  WXC, BRITE behavior, weather history, wind, deviation, PREF migration, and
  any facility-specific condition.
- Command IR, radio grammar, or changing what WX latches paint.
- Restyling MAIN into a 2×3 grid or changing non-WX DCB cells.

## Implementation notes

- Keep packed-bit inspection out of the render animation work. It must be a
  small pure helper/test seam, not a decode or fetch in `renderWxCell`.
- Do not use `wxLevels` to decide data availability. They control display only.
- Do not refetch on DCB clicks; cadence is established by the existing frame
  loop and `shouldRefetch` policy.
- Keep generic tests synthetic: compact masks for availability and fixture PNG
  only for fetch/decode behavior. Do not assert production map geometry.

## Acceptance criteria

- [ ] **AC1 —** A new view with all six WX latches off starts one N0Q fetch;
  after a successful result it refreshes at five minutes without any WX click.
- [ ] **AC2 —** Concurrent frame calls still share one in-flight fetch and a
  non-stale mosaic causes no additional request.
- [ ] **AC3 —** Each WX cap shows top-line `WX<n>` and bottom-line `AVL` iff
  its corresponding packed VIP mask contains at least one pixel.
- [ ] **AC4 —** Empty, never-fetched, failed, and zero-pixel level masks show
  no `AVL`; availability for one VIP never leaks to another.
- [ ] **AC5 —** WX latch pressed state and weather painting remain controlled
  only by `wxLevels`; DCB clicks still never create Command IR.
- [ ] **AC6 —** No live path adds an ICAO/facility branch, network call in CI,
  fetch on a paint path, or external weather provider.
- [ ] **AC7 —** `npm run ci` passes.

## Test plan

- Unit: packed-mask availability for empty, zero, nonzero, and level-isolated
  masks.
- Unit: all-off boot fetch, one in-flight request, no refetch before five
  minutes, and refresh at five minutes with injected fixture fetch.
- UI: static MAIN DCB markup for populated versus empty synthetic mosaics;
  independent `AVL` lines and unchanged WX latch markup.
- Regression: existing WX paint/Command IR isolation tests and `npm run ci`.

## Suggested files

- `src/scope/wx/ensure.ts`
- `src/scope/wx/mosaic.ts` or `src/scope/wx/types.ts`
- `src/scope/wx/test/ensure.test.ts`
- `src/scope/wx/test/*.test.ts`
- `src/ui/dcb/dcbChrome.tsx`
- `src/ui/dcb/test/dcbPhysicalReplicaAcceptance.test.ts`
