# T03-24 Catalog-aware ASR lexical repair

**Priority:** P1  
**Depends on:** T03-22, T03-23  
**Blocks:** T03-26

Add deterministic repair for recurring transcript noise such as `climber`,
`interceptor`, `fager/fogger`, `swept`, and carrier/callsign variants.

Acceptance criteria:

- Repair runs only in grammatical identifier or phrase slots.
- Catalog repair requires a unique existing candidate and the current margin/floor.
- Ties and unknown identifiers remain ungrounded and do not dispatch.
- Number values are not changed by lexical repair.
- Tests use synthetic catalogs plus the compact HAR transcript fixture.
- STT headers remain tiny priors; transcript retrieval stays in Path C context.
