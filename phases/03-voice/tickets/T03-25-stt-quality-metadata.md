# T03-25 STT quality metadata

**Priority:** P1  
**Depends on:** T03-22  
**Blocks:** T03-26

All HAR STT responses reported confidence `1.0`, including corrupted text.
Replace misleading confidence behavior with explicit, measurable metadata.

Acceptance criteria:

- The API no longer presents hardcoded `1.0` as calibrated confidence.
- Transcript metadata includes model, audio duration, inference latency, and
  available no-speech/empty-signal information.
- Parser execution does not depend on uncalibrated confidence.
- UI/status and tests reflect the new contract.
- No audio is committed; no paid or remote inference is added.
