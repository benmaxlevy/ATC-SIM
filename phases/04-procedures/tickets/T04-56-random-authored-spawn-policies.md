# T04-56 Random/authored spawn policies

Rename arrival `star-inbound` to `random`; rename departure `auto` to `random`, retaining `none` and `authored`. Migrate shipped KDEM and KATL scenarios; KATL must use arrival `random`. Reject legacy strings with actionable errors. Random means seeded catalog route plus valid airline/type pair; authored preserves JSON pose/type. Update all tests/docs; no compatibility alias, parser, profile, or facility branch.

## Acceptance criteria

- [ ] Arrival policy accepts only `random`/`authored`; departure policy accepts only `none`/`random`/`authored`.
- [ ] KDEM/KATL standard scenarios declare arrival `random`; authored ILS fixtures remain `authored`.
- [ ] Random routes/types/callsigns are deterministic by seed; authored poses/types remain fixed.
- [ ] Legacy `star-inbound`/`auto` reject; CI passes.
