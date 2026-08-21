# T01-13 Integration test typed heading moves aircraft

**Phase:** 01 Closed loop
**Priority:** P0
**Size:** M
**Depends on:** T01-07, T01-04
**Blocks:** T01-14 (phase exit automated half)
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

One Vitest **integration** test proves the closed loop without canvas or rAF: load KDEM (or a minimal world with `DAL123`), submit `DAL123 H270`, step 2 sim seconds, and observe heading turning toward 270. Parser, pilot, and kinematics are all exercised.

## Context

Phase README exit: “Vitest covers parser, kinematics, pilot agent, and **one integration test**.”

Architecture: `stepWorld` exists so tests can run without rAF. This test **must** stay DOM-free (`src/core` + `src/parse` + `src/pilot` + `src/scenario` only).

Quality bar (architecture): typed command → aircraft starts turning in the **next physics step** (< 50 ms). After 2 sim seconds at 3 deg/s the heading change is ~6°.

## Scope

- Add `tests/integration/heading-command.test.ts` **or** `src/pilot/headingLoop.integration.test.ts` — pick one folder and stick (prefer `tests/integration/` if Phase 0 Vitest include covers it; otherwise colocate and name `*.integration.test.ts`).
- Fixture: default scenario **or** `createWorld()` + `DAL123` at heading **100**, 8000 ft, 220 kt, position irrelevant.
- Start heading must **not** already be 270 and must **not** be 090 (090→270 is a 180° SHORTEST tie → LEFT). Default `DAL123` is heading **100**; SHORTEST to 270 is **right**. If you load KDEM, assert that heading is 100±1.
- Act: `handleRadioText(world, "DAL123 H270", log)`.
- Assert accept, assigned 270, `turn === "SHORTEST"`, readback matches heading template (substring `two seven zero`).
- Act: `for (i in 0..39) stepWorld(world, SIM_DT_S)` = **2.0** sim seconds.
- Assert: `DAL123.headingDeg` moved toward 270 by about `6` degrees (±0.5). From 100 SHORTEST to 270 is **right**: after 2 s heading ≈ **106**.
- Also assert position is not NaN and speed/altitude still ~initial (intent those axes unchanged).
- Second case in the same file **or** `it`: after accept, **one** `stepWorld` changes heading by ~`3 * 0.05 = 0.15` deg (next-step latency).
- Do not import `src/scope` or `src/ui`.
- Do not use fake timers for physics; call `stepWorld` explicitly.

## Out of scope

- Canvas assertions, pixel diffs.
- Voice path.
- Full 90° capture (30 s) — optional extra `it`, not required.
- Ambiguous callsign (already unit-tested).

## Implementation notes

If default `DAL123` heading is 100:

```
start = 100
after 2s at 3 deg/s RIGHT toward 270 → 106
```

If someone spawned DAL123 on 090, SHORTEST is a 180° LEFT tie and this test fails — that is intentional (T01-04). **Assert initial heading is 100±1** or set it in the test after spawn.

Session log: assert at least one `command.accepted` whose `command.instructions[0].type === "FLY_HEADING"`.

Vitest include: update `vite.config` / `vitest.config` if `tests/` was not in Phase 0.

## Acceptance criteria

- [ ] **AC1 —** Integration test file exists and is run by `npm test`.
- [ ] **AC2 —** Given DAL123 heading 100, when `DAL123 H270` is handled, then command is accepted and `intent.assignedHeadingDeg === 270`.
- [ ] **AC3 —** After 2.0 sim seconds of `stepWorld`, heading is ~106° (distance to 270 has **decreased** by ~6°).
- [ ] **AC4 —** After a single `SIM_DT_S` step post-command, heading has changed from start (turn starts next step).
- [ ] **AC5 —** Test file has no `document`, `window`, `HTMLCanvasElement`, or rAF.
- [ ] **AC6 —** `npm test` green including this file.

## Test plan

- Unit: none new required
- Integration: this ticket **is** the integration test
- Manual: none

## Suggested files

- `tests/integration/heading-command.test.ts`
- `vitest.config.ts` (include glob if needed)
