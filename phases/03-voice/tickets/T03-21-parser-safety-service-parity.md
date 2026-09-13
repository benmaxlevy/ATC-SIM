# T03-21 Parser safety and service parity

**Priority:** P0  
**Depends on:** T03-20  
**Blocks:** T03-22, T03-23

The HAR accepted unlisted approaches (`T26R`, `ONLY26`), inferred `LEFT` when
turn direction was absent, and changed heading 290 to 270. Make browser and
speech-api guards agree and make unsafe output fail closed.

Acceptance criteria:

- Unlisted callsigns, fixes, procedures, and approaches are rejected.
- `fly heading 250` uses `SHORTEST`, never an implicit turn direction.
- `turn left heading two nine zero` preserves 290.
- `/health` exposes a parser contract/version sufficient to detect stale service code.
- No unsafe Path C result reaches pilot dispatch.

Keep the change generic and local. Do not add facility branches or vendors.
