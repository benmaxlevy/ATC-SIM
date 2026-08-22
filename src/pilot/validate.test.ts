import { expect, test } from "vitest";
import { createAircraft, type Instruction } from "@core";
import { validateInstructions } from "./validate";

function jet(overrides: { altitudeFt?: number; headingDeg?: number; speedKt?: number } = {}) {
  return createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 10,
    yNm: 5,
    headingDeg: overrides.headingDeg ?? 100,
    altitudeFt: overrides.altitudeFt ?? 8000,
    speedKt: overrides.speedKt ?? 220,
  });
}

test("empty instructions are EMPTY", () => {
  expect(validateInstructions(jet(), [])).toEqual({ ok: false, reason: "EMPTY" });
});

test("heading 0 is valid; 360 is not in [0, 360)", () => {
  const h0: Instruction = { type: "FLY_HEADING", headingDeg: 0, turn: "SHORTEST" };
  const h360: Instruction = { type: "FLY_HEADING", headingDeg: 360, turn: "SHORTEST" };
  expect(validateInstructions(jet(), [h0]).ok).toBe(true);
  expect(validateInstructions(jet(), [h360])).toEqual({ ok: false, reason: "HEADING" });
});

test("TURN_DEGREES 1 and 180 pass; 181 is HEADING", () => {
  expect(
    validateInstructions(jet(), [{ type: "TURN_DEGREES", direction: "LEFT", degrees: 1 }]).ok,
  ).toBe(true);
  expect(
    validateInstructions(jet(), [{ type: "TURN_DEGREES", direction: "RIGHT", degrees: 180 }]).ok,
  ).toBe(true);
  expect(
    validateInstructions(jet(), [{ type: "TURN_DEGREES", direction: "LEFT", degrees: 181 }]),
  ).toEqual({ ok: false, reason: "HEADING" });
});

test("altitude must be a multiple of 100 in [1000, 18000]", () => {
  const ac = jet({ altitudeFt: 8000 });
  expect(
    validateInstructions(ac, [{ type: "ALTITUDE", altitudeFt: 3050, verb: "MAINTAIN" }]),
  ).toEqual({ ok: false, reason: "ALTITUDE" });
  expect(
    validateInstructions(ac, [{ type: "ALTITUDE", altitudeFt: 900, verb: "MAINTAIN" }]),
  ).toEqual({ ok: false, reason: "ALTITUDE" });
  expect(
    validateInstructions(ac, [{ type: "ALTITUDE", altitudeFt: 18100, verb: "MAINTAIN" }]),
  ).toEqual({ ok: false, reason: "ALTITUDE" });
  expect(
    validateInstructions(ac, [{ type: "ALTITUDE", altitudeFt: 18000, verb: "MAINTAIN" }]).ok,
  ).toBe(true);
});

test("CLIMB must be above present; DESCEND below; MAINTAIN any in range", () => {
  const ac = jet({ altitudeFt: 8000 });
  expect(validateInstructions(ac, [{ type: "ALTITUDE", altitudeFt: 3000, verb: "CLIMB" }])).toEqual(
    {
      ok: false,
      reason: "CLIMB_NOT_ABOVE",
    },
  );
  expect(validateInstructions(ac, [{ type: "ALTITUDE", altitudeFt: 8000, verb: "CLIMB" }])).toEqual(
    {
      ok: false,
      reason: "CLIMB_NOT_ABOVE",
    },
  );
  expect(validateInstructions(ac, [{ type: "ALTITUDE", altitudeFt: 9000, verb: "CLIMB" }]).ok).toBe(
    true,
  );
  expect(
    validateInstructions(ac, [{ type: "ALTITUDE", altitudeFt: 8000, verb: "DESCEND" }]),
  ).toEqual({ ok: false, reason: "DESCEND_NOT_BELOW" });
  expect(
    validateInstructions(ac, [{ type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }]).ok,
  ).toBe(true);
  expect(
    validateInstructions(ac, [{ type: "ALTITUDE", altitudeFt: 8000, verb: "MAINTAIN" }]).ok,
  ).toBe(true);
});

test("speed outside [150, 280] is SPEED; edges pass", () => {
  expect(validateInstructions(jet(), [{ type: "SPEED", speedKt: 149, verb: "MAINTAIN" }])).toEqual({
    ok: false,
    reason: "SPEED",
  });
  expect(validateInstructions(jet(), [{ type: "SPEED", speedKt: 281, verb: "MAINTAIN" }])).toEqual({
    ok: false,
    reason: "SPEED",
  });
  expect(validateInstructions(jet(), [{ type: "SPEED", speedKt: 150, verb: "MAINTAIN" }]).ok).toBe(
    true,
  );
  expect(validateInstructions(jet(), [{ type: "SPEED", speedKt: 280, verb: "MAINTAIN" }]).ok).toBe(
    true,
  );
});

test("CLEARED_APPROACH needs a non-empty approachId; SAY and IDENT pass", () => {
  expect(validateInstructions(jet(), [{ type: "CLEARED_APPROACH", approachId: "ILS27" }]).ok).toBe(
    true,
  );
  expect(validateInstructions(jet(), [{ type: "CLEARED_APPROACH", approachId: "" }])).toEqual({
    ok: false,
    reason: "EMPTY",
  });
  expect(validateInstructions(jet(), [{ type: "SAY_HEADING" }]).ok).toBe(true);
  expect(validateInstructions(jet(), [{ type: "IDENT" }]).ok).toBe(true);
});

test("DIRECT unknown fix is UNKNOWN_FIX; known catalog id passes", () => {
  const registry = {
    has: (id: string) => id.toUpperCase() === "NEMAX",
  } as import("@core").FixRegistry;
  expect(
    validateInstructions(jet(), [{ type: "DIRECT", fixId: "NOPE" }], { fixRegistry: registry }),
  ).toEqual({
    ok: false,
    reason: "UNKNOWN_FIX",
  });
  expect(
    validateInstructions(jet(), [{ type: "DIRECT", fixId: "NEMAX" }], { fixRegistry: registry }).ok,
  ).toBe(true);
  expect(validateInstructions(jet(), [{ type: "DIRECT", fixId: "NEMAX" }])).toEqual({
    ok: false,
    reason: "UNKNOWN_FIX",
  });
});

test("VIA unknown procedure rejects; CROSS not on course rejects", () => {
  const registry = {
    has: (id: string) => id.toUpperCase() === "NEMAX",
  } as import("@core").FixRegistry;
  const catalog = { stars: [{ id: "DEM1", name: "DEMO ONE" }] };
  expect(
    validateInstructions(jet(), [{ type: "DESCEND_VIA", procedureId: "NOPE" }], { catalog }),
  ).toEqual({ ok: false, reason: "UNKNOWN_PROCEDURE" });
  expect(
    validateInstructions(jet(), [{ type: "DESCEND_VIA", procedureId: "DEM1" }], { catalog }).ok,
  ).toBe(true);
  const ac = jet();
  expect(
    validateInstructions(
      ac,
      [{ type: "CROSS", fixId: "NEMAX", altitudeFt: 4000, restriction: "AT" }],
      { fixRegistry: registry, catalog },
    ),
  ).toEqual({ ok: false, reason: "NOT_ON_COURSE", detail: "NEMAX" });
  ac.intent.lateral = { type: "DIRECT", fixId: "NEMAX" };
  expect(
    validateInstructions(
      ac,
      [{ type: "CROSS", fixId: "NEMAX", altitudeFt: 4000, restriction: "AT" }],
      { fixRegistry: registry, catalog },
    ).ok,
  ).toBe(true);
});

test("one bad instruction rejects the whole list", () => {
  expect(
    validateInstructions(jet({ altitudeFt: 8000 }), [
      { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
      { type: "ALTITUDE", altitudeFt: 3000, verb: "CLIMB" },
    ]),
  ).toEqual({ ok: false, reason: "CLIMB_NOT_ABOVE" });
});
