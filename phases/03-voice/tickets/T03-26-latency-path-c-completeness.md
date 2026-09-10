# T03-26 Latency and Path C completeness

**Priority:** P1  
**Depends on:** T03-24, T03-25  
**Blocks:** none; final ticket

The HAR shows sequential STT plus Path C latency up to roughly 4.3 seconds,
and Path C has a 128-token output limit that can truncate long clearances.

Acceptance criteria:

- Cold and warm STT/parse/TTS latency are separately measured at p50 and p95.
- Explicit timeouts produce soft misses and never tick exceptions.
- Path C output budget is measured and increased only within resource limits.
- Truncated or instruction-incomplete output is rejected.
- Duplicate dispatch is impossible.
- The existing audio-start target is recorded from a real local run, never invented.
