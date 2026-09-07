# KDEM Conflict Alert bench

Playable training fixture for the STARS CA controls. Load with
`?scenario=kdem-ca` after starting the dev server. The bench uses authored
positions, so restarting the scenario restores the same geometry; callsigns
are assigned dynamically and must be read from the datablocks.

## Initial picture

Six aircraft form three opposing, same-altitude pairs on the 27 flow:

- **Outer pair** — 15 NM east, 8 NM north/south, 8,000 ft, 210 kt. This is
  the long-range pair for predictive CA timing.
- **Core pair** — 8 NM east, 4 NM north/south, 4,000/4,200 ft, 180 kt. This
  pair provides the mid-range convergence.
- **Inner pair** — 4 NM east, 0.4 NM north/south, 1,000/1,050 ft, 150 kt.
  This pair starts active and is the first pair to work.

The runtime assigns callsigns from the session pool. Do not rely on a fixed
airline or tail number; select the two visible tracks in the pair.

## Control drills

1. On the initial inner alert, use `CA K` and slew the first track. The
   selected track's CA inhibit state should toggle without Enter; this is not
   an acknowledgement command.
2. Raise or wait for another active pair, then use `CA P` and slew both tracks
   to inhibit that pair. Confirm the upright `Δ` immediately beside each ACID
   and that the alert tone and AL row are suppressed for the pair.
3. Use `CA E` and slew the same pair. Confirm the inhibit mark is removed and
   the alert presentation/tone can return when the pair remains active.
4. Use the explicit forms `CA K <ACID>`, `CA P <ACID> <ACID>`, and
   `CA E <ACID> <ACID>` to repeat the same operations without track slews.

This is a trainer fixture, not certified STARS adaptation. The CA engine owns
the live alert state; this scenario only supplies deterministic traffic.
