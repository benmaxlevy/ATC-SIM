# T03-22 HAR replay regression

**Priority:** P0  
**Depends on:** T03-21  
**Blocks:** T03-24, T03-25

Create a compact, redacted replay fixture from `fullrun.har`. Commit transcript,
context, response, and expected classification only; never commit audio.

Acceptance criteria:

- Replay covers all 30 `/parse` requests and the seven observed misses.
- Unsafe IDs, wrong headings, implicit turns, and incomplete commands are classified.
- The fixture does not assert production map counts, ordering, or geometry.
- Existing synthetic parser tests remain and continue to pass.
- Replay reports accepted, expected miss, unsafe acceptance, and incomplete acceptance.
