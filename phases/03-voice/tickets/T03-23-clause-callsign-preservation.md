# T03-23 Clause and callsign preservation

**Priority:** P0  
**Depends on:** T03-21  
**Blocks:** T03-24

The HAR assigned a noisy command to the wrong selected aircraft and dropped
speed from a heading-plus-speed clearance. Strict grammar also missed
`climb maintain ...` without `and`.

Acceptance criteria:

- Explicit spoken callsigns uniquely match the live roster or produce a miss.
- Selected callsign fallback is used only when no callsign is spoken.
- Ambiguous callsigns never dispatch.
- Heading plus speed preserves both instructions and their order.
- `climb maintain` and `climb and maintain` produce equivalent IR.
- Safe `descend by/via the arrival` variants are covered without broad guessing.
