import { expect, expectTypeOf, test } from "vitest";
import {
  createAircraft,
  makeTestAircraft,
  type Aircraft,
  type Intent,
  type LateralMode,
  type TurnDir,
} from "@core";

function sampleInit(overrides: Partial<Parameters<typeof createAircraft>[0]> = {}) {
  return {
    callsign: "UAL1",
    xNm: 12,
    yNm: 6,
    headingDeg: 100,
    altitudeFt: 7000,
    speedKt: 230,
    ...overrides,
  };
}

test("Aircraft and Intent compile under strict and export from @core (AC1)", () => {
  expectTypeOf<Aircraft>().toHaveProperty("id");
  expectTypeOf<Aircraft>().toHaveProperty("intent");
  expectTypeOf<Aircraft["intent"]>().toEqualTypeOf<Intent>();
  expectTypeOf<Intent["turn"]>().toEqualTypeOf<TurnDir>();
  expectTypeOf<Intent>().toHaveProperty("assignedHeadingDeg");
  expectTypeOf<Intent>().toHaveProperty("assignedAltitudeFt");
  expectTypeOf<Intent>().toHaveProperty("assignedSpeedKt");
  expectTypeOf<Intent>().toHaveProperty("expectedApproachId");
  expectTypeOf<Intent>().toHaveProperty("clearedApproachId");
  expectTypeOf<Intent>().toHaveProperty("lateral");
  expectTypeOf<Intent>().toHaveProperty("vertical");
  expectTypeOf<Intent["lateral"]>().toEqualTypeOf<LateralMode | undefined>();
  expectTypeOf<Aircraft>().toHaveProperty("identUntilSimMs");
});

test("createAircraft uppercases callsign and normalizes heading 360 to 0 (AC2)", () => {
  const ac = createAircraft(
    sampleInit({
      callsign: "dal123",
      headingDeg: 360,
      xNm: 10,
      yNm: 5,
      altitudeFt: 8000,
      speedKt: 220,
    }),
  );
  expect(ac.callsign).toBe("DAL123");
  expect(ac.headingDeg).toBe(0);
  expect(ac.intent.assignedHeadingDeg).toBe(0);
});

test("createAircraft wraps negative headings into [0, 360)", () => {
  const ac = createAircraft(sampleInit({ headingDeg: -90 }));
  expect(ac.headingDeg).toBe(270);
  expect(ac.intent.assignedHeadingDeg).toBe(270);
});

test("fresh aircraft intent matches present heading, altitude, and speed (AC3)", () => {
  const ac = createAircraft(sampleInit());
  expect(ac.headingDeg).toBe(100);
  expect(ac.altitudeFt).toBe(7000);
  expect(ac.speedKt).toBe(230);
  expect(ac.intent.assignedHeadingDeg).toBe(ac.headingDeg);
  expect(ac.intent.assignedAltitudeFt).toBe(ac.altitudeFt);
  expect(ac.intent.assignedSpeedKt).toBe(ac.speedKt);
  expect(ac.intent.turn).toBe("SHORTEST");
  expect(ac.intent.expectedApproachId).toBeNull();
  expect(ac.intent.clearedApproachId).toBeNull();
  expect(ac.identUntilSimMs).toBe(0);
});

test("aircraftType is copied from spawn and does not change kinematics fields", () => {
  const withType = createAircraft(sampleInit({ aircraftType: "b738" }));
  const without = createAircraft(sampleInit());
  expect(withType.aircraftType).toBe("B738");
  expect(without.aircraftType).toBeUndefined();
  expect(withType.headingDeg).toBe(without.headingDeg);
  expect(withType.altitudeFt).toBe(without.altitudeFt);
  expect(withType.speedKt).toBe(without.speedKt);
  expect(withType.intent).toEqual(without.intent);
});

test("makeTestAircraft ids are stable only when passed in (AC5)", () => {
  const withIdA = makeTestAircraft({ callsign: "DAL123", id: "ac-fixed" });
  const withIdB = makeTestAircraft({ callsign: "DAL123", id: "ac-fixed" });
  expect(withIdA.id).toBe("ac-fixed");
  expect(withIdB.id).toBe(withIdA.id);

  const autoA = makeTestAircraft({ callsign: "DAL123" });
  const autoB = makeTestAircraft({ callsign: "DAL123" });
  expect(autoA.callsign).toBe("DAL123");
  expect(autoB.callsign).toBe("DAL123");
  expect(autoA.id).not.toBe(autoB.id);
});

test("src/core does not import src/scope or src/ui (AC6)", () => {
  const coreSources = import.meta.glob("./**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  const forbidden = /from\s+["'](?:@scope|@ui|[^"']*\/(?:scope|ui)(?:\/[^"']*)?)["']/;
  for (const [path, src] of Object.entries(coreSources)) {
    expect(src, path).not.toMatch(forbidden);
  }
});
