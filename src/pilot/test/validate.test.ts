import { expect, test } from "vitest";
import { createAircraft, performanceRegistry, type Instruction } from "@core";
import { validateInstructions } from "../validate";

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
    detail: "unable speed 149, minimum is 150",
  });
  expect(validateInstructions(jet(), [{ type: "SPEED", speedKt: 281, verb: "MAINTAIN" }])).toEqual({
    ok: false,
    reason: "SPEED",
    detail: "unable speed 281, maximum is 280",
  });
  expect(validateInstructions(jet(), [{ type: "SPEED", speedKt: 150, verb: "MAINTAIN" }]).ok).toBe(
    true,
  );
  expect(validateInstructions(jet(), [{ type: "SPEED", speedKt: 280, verb: "MAINTAIN" }]).ok).toBe(
    true,
  );
});

test("performance profile overrides min/max controlled speed with unable details", () => {
  const customProfile = {
    icaoType: "CUSTOM",
    representativeVariant: "custom",
    representativeEngine: "custom",
    status: "SUPPORTED" as const,
    limits: {
      minControlledSpeedKt: 140,
      maxControlledSpeedKt: 350,
      serviceCeilingFt: 41000,
    },
    regimes: null,
  };
  const ac = jet({ speedKt: 250 });
  expect(
    validateInstructions(ac, [{ type: "SPEED", speedKt: 120, verb: "MAINTAIN" }], {
      performanceProfile: customProfile,
    }),
  ).toEqual({
    ok: false,
    reason: "SPEED",
    detail: "unable speed 120, minimum is 140",
  });
  expect(
    validateInstructions(ac, [{ type: "SPEED", speedKt: 380, verb: "MAINTAIN" }], {
      performanceProfile: customProfile,
    }),
  ).toEqual({
    ok: false,
    reason: "SPEED",
    detail: "unable speed 380, maximum is 350",
  });
  expect(
    validateInstructions(ac, [{ type: "SPEED", speedKt: 250, verb: "MAINTAIN" }], {
      performanceProfile: customProfile,
    }).ok,
  ).toBe(true);
});

test("performance profile service ceiling rejects higher altitude with detail", () => {
  const customProfile = {
    icaoType: "CUSTOM",
    representativeVariant: "custom",
    representativeEngine: "custom",
    status: "SUPPORTED" as const,
    limits: {
      minControlledSpeedKt: 140,
      maxControlledSpeedKt: 350,
      serviceCeilingFt: 41000,
    },
    regimes: null,
  };
  const ac = jet({ altitudeFt: 30000 });
  expect(
    validateInstructions(ac, [{ type: "ALTITUDE", altitudeFt: 45000, verb: "CLIMB" }], {
      performanceProfile: customProfile,
    }),
  ).toEqual({
    ok: false,
    reason: "ALTITUDE",
    detail: "unable altitude 45000, ceiling is 41000",
  });
  expect(
    validateInstructions(ac, [{ type: "ALTITUDE", altitudeFt: 41000, verb: "CLIMB" }], {
      performanceProfile: customProfile,
    }).ok,
  ).toBe(true);
});

test("aircraftType in registry validates against registered profile limits", () => {
  const a320 = createAircraft({
    id: "ac-a320",
    callsign: "AAL100",
    aircraftType: "A320",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 10000,
    speedKt: 250,
  });
  const profile = performanceRegistry.getProfile("A320");
  const minKt = profile.limits?.minControlledSpeedKt ?? 100;
  const maxKt = profile.limits?.maxControlledSpeedKt ?? 350;
  const ceilingFt = profile.limits?.serviceCeilingFt ?? 41010;

  expect(
    validateInstructions(a320, [{ type: "SPEED", speedKt: minKt - 20, verb: "MAINTAIN" }]),
  ).toEqual({
    ok: false,
    reason: "SPEED",
    detail: `unable speed ${minKt - 20}, minimum is ${minKt}`,
  });
  expect(
    validateInstructions(a320, [{ type: "SPEED", speedKt: maxKt + 10, verb: "MAINTAIN" }]),
  ).toEqual({
    ok: false,
    reason: "SPEED",
    detail: `unable speed ${maxKt + 10}, maximum is ${maxKt}`,
  });
  expect(
    validateInstructions(a320, [{ type: "ALTITUDE", altitudeFt: 45000, verb: "CLIMB" }]),
  ).toEqual({
    ok: false,
    reason: "ALTITUDE",
    detail: `unable altitude 45000, ceiling is ${ceilingFt}`,
  });
  expect(
    validateInstructions(a320, [{ type: "ALTITUDE", altitudeFt: 35000, verb: "CLIMB" }]).ok,
  ).toBe(true);
});

test("CLEARED_APPROACH needs a known approachId when catalog is present", () => {
  expect(validateInstructions(jet(), [{ type: "CLEARED_APPROACH", approachId: "ILS27" }]).ok).toBe(
    true,
  );
  expect(validateInstructions(jet(), [{ type: "CLEARED_APPROACH", approachId: "" }])).toEqual({
    ok: false,
    reason: "EMPTY",
  });
  expect(
    validateInstructions(jet(), [{ type: "CLEARED_APPROACH", approachId: "ILS99" }], {
      approachIds: ["ILS27"],
    }),
  ).toEqual({ ok: false, reason: "UNKNOWN_APPROACH" });
  expect(
    validateInstructions(jet(), [{ type: "EXPECT_APPROACH", approachId: "ILS27" }], {
      approachIds: ["ILS27"],
    }).ok,
  ).toBe(true);
  expect(
    validateInstructions(jet(), [{ type: "INTERCEPT_LOCALIZER", approachId: "ILS27" }], {
      approachIds: ["ILS27"],
    }).ok,
  ).toBe(true);
  expect(
    validateInstructions(jet(), [{ type: "INTERCEPT_LOCALIZER", approachId: "ILS99" }], {
      approachIds: ["ILS27"],
    }),
  ).toEqual({ ok: false, reason: "UNKNOWN_APPROACH" });
  expect(validateInstructions(jet(), [{ type: "IDENT" }]).ok).toBe(true);
});

test("T04-82: CLEARED_VISUAL validation", () => {
  // Empty runway
  expect(validateInstructions(jet(), [{ type: "CLEARED_VISUAL", runwayId: "" }])).toEqual({
    ok: false,
    reason: "EMPTY",
  });
  // Invalid runway format
  expect(validateInstructions(jet(), [{ type: "CLEARED_VISUAL", runwayId: "XYZ" }])).toEqual({
    ok: false,
    reason: "RUNWAY",
  });
  // Valid runway without explicit runwayIds in opts passes
  expect(validateInstructions(jet(), [{ type: "CLEARED_VISUAL", runwayId: "27L" }]).ok).toBe(true);

  // With explicit runwayIds:
  expect(
    validateInstructions(jet(), [{ type: "CLEARED_VISUAL", runwayId: "27L" }], {
      runwayIds: ["27L", "27R"],
    }).ok,
  ).toBe(true);
  expect(
    validateInstructions(jet(), [{ type: "CLEARED_VISUAL", runwayId: "21L" }], {
      runwayIds: ["27L", "27R"],
    }),
  ).toEqual({ ok: false, reason: "RUNWAY" });

  // Regional airport validation:
  const mockRegional = {
    getAirport: (icao: string) => {
      if (icao === "KPDK") {
        return {
          icao: "KPDK",
          runways: [{ id: "21L" }, { id: "03R" }],
        };
      }
      if (icao === "KATL") {
        return {
          icao: "KATL",
          runways: [{ id: "27L" }, { id: "27R" }, { id: "08L" }],
        };
      }
      return undefined;
    },
  } as unknown as import("../../scenario/regional").RegionalFacility;

  const pdkAc = { ...jet(), destination: "KPDK" };
  // KPDK has 21L -> ok
  expect(
    validateInstructions(pdkAc, [{ type: "CLEARED_VISUAL", runwayId: "21L" }], {
      regional: mockRegional,
    }).ok,
  ).toBe(true);
  // KPDK does not have 27L (KATL runway) -> rejected with RUNWAY
  expect(
    validateInstructions(pdkAc, [{ type: "CLEARED_VISUAL", runwayId: "27L" }], {
      regional: mockRegional,
    }),
  ).toEqual({ ok: false, reason: "RUNWAY" });

  // On visual final, altitude assignment is rejected
  const visualAc = {
    ...jet(),
    intent: {
      ...jet().intent,
      lateral: {
        type: "VISUAL_FINAL" as const,
        runwayId: "27L",
        threshold: { xNm: 0, yNm: 0 },
        headingDeg: 270,
      },
    },
  };
  expect(
    validateInstructions(visualAc, [{ type: "ALTITUDE", altitudeFt: 3000, verb: "MAINTAIN" }]),
  ).toEqual({
    ok: false,
    reason: "ALTITUDE",
    detail: "unable. cleared for the approach already.",
  });

  // On visual final, GO_AROUND is accepted
  expect(validateInstructions(visualAc, [{ type: "GO_AROUND" }]).ok).toBe(true);

  // On visual final, CANCEL_APPROACH is accepted
  expect(validateInstructions(visualAc, [{ type: "CANCEL_APPROACH" }]).ok).toBe(true);

  // CANCEL_APPROACH cannot be followed by CLEARED_VISUAL in same transmission
  expect(
    validateInstructions(visualAc, [
      { type: "CANCEL_APPROACH" },
      { type: "CLEARED_VISUAL", runwayId: "27L" },
    ]),
  ).toEqual({
    ok: false,
    reason: "CLEARANCE",
    detail: "CANCEL_APPROACH cannot be followed by approach or go-around instructions",
  });
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
    validateInstructions(jet(), [{ type: "JOIN_PROCEDURE", procedureId: "DEM1" }], { catalog }).ok,
  ).toBe(true);
  expect(
    validateInstructions(jet(), [{ type: "JOIN_PROCEDURE", procedureId: "NOPE" }], { catalog }),
  ).toEqual({ ok: false, reason: "UNKNOWN_PROCEDURE" });
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

test("AC4 — validateInstructions approves valid CLIMB_VIA and rejects unknown SID", () => {
  const catalog = {
    stars: [{ id: "DEM1", name: "DEMO ONE" }],
    sids: [{ id: "KDEM1", name: "KDEM ONE DEPARTURE" }],
  };
  expect(
    validateInstructions(jet(), [{ type: "CLIMB_VIA", procedureId: "KDEM1" }], { catalog }).ok,
  ).toBe(true);
  expect(
    validateInstructions(jet(), [{ type: "CLIMB_VIA", procedureId: "UNKNOWN" }], { catalog }),
  ).toEqual({ ok: false, reason: "UNKNOWN_PROCEDURE" });
  expect(
    validateInstructions(jet(), [{ type: "JOIN_PROCEDURE", procedureId: "KDEM1" }], { catalog }).ok,
  ).toBe(true);
});

test("GO_AROUND rejects unless clearedApproachId is set", () => {
  const ac = jet();
  expect(validateInstructions(ac, [{ type: "GO_AROUND" }])).toEqual({
    ok: false,
    reason: "NOT_ON_APPROACH",
  });
  ac.intent.clearedApproachId = "ILS27";
  expect(validateInstructions(ac, [{ type: "GO_AROUND" }]).ok).toBe(true);
});

const synCatalog = {
  stars: [
    {
      id: "SYN1",
      name: "SYN ONE",
      common: [{ fixId: "MERGE" }],
      transitions: [
        { id: "N", legs: [{ fixId: "NA" }, { fixId: "NB" }] },
        { id: "S", legs: [{ fixId: "SA" }, { fixId: "SB" }] },
        { id: "RW09", runwayId: "09", legs: [{ fixId: "RA" }] },
      ],
    },
  ],
};

test("named STAR transition validate accepts a shared fix and rejects the rest", () => {
  const ac = jet();
  ac.intent.lateral = {
    type: "PROCEDURE",
    starId: "SYN1",
    toFixIndex: 1,
    routeFixIds: ["NA", "NB", "MERGE"],
  };
  expect(
    validateInstructions(ac, [{ type: "DESCEND_VIA", procedureId: "SYN1", transitionId: "S" }], {
      catalog: synCatalog,
    }).ok,
  ).toBe(true);
  expect(
    validateInstructions(ac, [{ type: "JOIN_PROCEDURE", procedureId: "SYN1", transitionId: "S" }], {
      catalog: synCatalog,
    }).ok,
  ).toBe(true);
  expect(
    validateInstructions(ac, [{ type: "DESCEND_VIA", procedureId: "NOPE", transitionId: "S" }], {
      catalog: synCatalog,
    }),
  ).toEqual({ ok: false, reason: "UNKNOWN_PROCEDURE" });
  expect(
    validateInstructions(ac, [{ type: "DESCEND_VIA", procedureId: "SYN1", transitionId: "ZZ" }], {
      catalog: synCatalog,
    }),
  ).toEqual({ ok: false, reason: "UNKNOWN_TRANSITION" });
  expect(
    validateInstructions(ac, [{ type: "DESCEND_VIA", procedureId: "SYN1", transitionId: "RW09" }], {
      catalog: synCatalog,
      activeRunwayId: "27",
    }),
  ).toEqual({ ok: false, reason: "UNKNOWN_TRANSITION" });
  ac.intent.lateral = {
    type: "PROCEDURE",
    starId: "SYN1",
    toFixIndex: 0,
    routeFixIds: ["NA"],
  };
  expect(
    validateInstructions(ac, [{ type: "DESCEND_VIA", procedureId: "SYN1", transitionId: "S" }], {
      catalog: synCatalog,
    }),
  ).toEqual({ ok: false, reason: "NOT_ON_COURSE" });
});

const synSidCatalog = {
  sids: [
    {
      id: "SYNDEP",
      name: "SYN DEP",
      runwayTransitions: [
        { runwayId: "27", legs: [{ fixId: "R27A" }, { fixId: "R27B" }] },
        { runwayId: "09", legs: [{ fixId: "R09A" }] },
      ],
      common: [{ fixId: "JOIN" }],
      enrouteTransitions: [
        { id: "NORMA", name: "NORMA", legs: [{ fixId: "N1" }, { fixId: "NORMA" }] },
        { id: "OCTTA", name: "OCTTA", legs: [{ fixId: "O1" }, { fixId: "OCTTA" }] },
      ],
    },
  ],
};

test("named SID transition validate accepts a shared fix and rejects the rest", () => {
  const ac = jet();
  ac.intent.lateral = {
    type: "PROCEDURE",
    sidId: "SYNDEP",
    starId: "SYNDEP",
    toFixIndex: 2,
    routeFixIds: ["R27A", "R27B", "JOIN", "N1", "NORMA"],
  };
  expect(
    validateInstructions(
      ac,
      [{ type: "CLIMB_VIA", procedureId: "SYNDEP", transitionId: "OCTTA" }],
      {
        catalog: synSidCatalog,
      },
    ).ok,
  ).toBe(true);
  expect(
    validateInstructions(
      ac,
      [{ type: "JOIN_PROCEDURE", procedureId: "SYNDEP", transitionId: "OCTTA" }],
      {
        catalog: synSidCatalog,
      },
    ).ok,
  ).toBe(true);
  expect(
    validateInstructions(ac, [{ type: "CLIMB_VIA", procedureId: "NOPE", transitionId: "OCTTA" }], {
      catalog: synSidCatalog,
    }),
  ).toEqual({ ok: false, reason: "UNKNOWN_PROCEDURE" });
  expect(
    validateInstructions(ac, [{ type: "CLIMB_VIA", procedureId: "SYNDEP", transitionId: "ZZ" }], {
      catalog: synSidCatalog,
    }),
  ).toEqual({ ok: false, reason: "UNKNOWN_TRANSITION" });
  ac.intent.lateral = {
    type: "PROCEDURE",
    sidId: "SYNDEP",
    starId: "SYNDEP",
    toFixIndex: 0,
    routeFixIds: ["R27A", "R27B", "JOIN", "N1", "NORMA"],
  };
  expect(
    validateInstructions(ac, [{ type: "CLIMB_VIA", procedureId: "SYNDEP", transitionId: "RW09" }], {
      catalog: synSidCatalog,
    }).ok,
  ).toBe(true);
  ac.intent.lateral = {
    type: "PROCEDURE",
    sidId: "SYNDEP",
    starId: "SYNDEP",
    toFixIndex: 2,
    routeFixIds: ["R27A", "R27B", "JOIN", "N1", "NORMA"],
  };
  expect(
    validateInstructions(ac, [{ type: "CLIMB_VIA", procedureId: "SYNDEP", transitionId: "RW09" }], {
      catalog: synSidCatalog,
    }),
  ).toEqual({ ok: false, reason: "NOT_ON_COURSE" });
  ac.intent.lateral = {
    type: "PROCEDURE",
    sidId: "SYNDEP",
    starId: "SYNDEP",
    toFixIndex: 0,
    routeFixIds: ["NORMA"],
  };
  expect(
    validateInstructions(
      ac,
      [{ type: "CLIMB_VIA", procedureId: "SYNDEP", transitionId: "OCTTA" }],
      {
        catalog: synSidCatalog,
      },
    ),
  ).toEqual({ ok: false, reason: "NOT_ON_COURSE" });
});

test("one bad instruction rejects the whole list", () => {
  expect(
    validateInstructions(jet({ altitudeFt: 8000 }), [
      { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
      { type: "ALTITUDE", altitudeFt: 3000, verb: "CLIMB" },
    ]),
  ).toEqual({ ok: false, reason: "CLIMB_NOT_ABOVE" });
});

test("AC2: altitude rejected when cleared for approach", () => {
  const ac = jet({ altitudeFt: 3000 });
  ac.intent.clearedApproachId = "ILS27";

  expect(
    validateInstructions(ac, [{ type: "ALTITUDE", altitudeFt: 2000, verb: "DESCEND" }]),
  ).toEqual({
    ok: false,
    reason: "ALTITUDE",
    detail: "unable. cleared for the ILS already.",
  });

  const rnavAc = jet({ altitudeFt: 3000 });
  rnavAc.intent.clearedApproachId = "RNAV27";
  expect(
    validateInstructions(rnavAc, [{ type: "ALTITUDE", altitudeFt: 2000, verb: "DESCEND" }]),
  ).toEqual({
    ok: false,
    reason: "ALTITUDE",
    detail: "unable. cleared for the approach already.",
  });

  // When clearedApproachId is not set, altitude validates normally
  const unCleared = jet({ altitudeFt: 3000 });
  expect(
    validateInstructions(unCleared, [{ type: "ALTITUDE", altitudeFt: 2000, verb: "DESCEND" }]).ok,
  ).toBe(true);
});

test("CANCEL_APPROACH validates later altitude against projected post-approach state", () => {
  const ac = jet({ altitudeFt: 8000, headingDeg: 180 });
  ac.intent.clearedApproachId = "RNAV09";
  ac.intent.lateral = { type: "INTERCEPT_LOC", approachId: "RNAV09" };
  ac.intent.vertical = { type: "GS", approachId: "RNAV09" };

  expect(
    validateInstructions(ac, [
      { type: "CANCEL_APPROACH" },
      { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
      { type: "ALTITUDE", altitudeFt: 5000, verb: "DESCEND" },
    ]),
  ).toEqual({ ok: true });
  expect(ac.intent.clearedApproachId).toBe("RNAV09");
  expect(ac.intent.vertical).toEqual({ type: "GS", approachId: "RNAV09" });
});

test("CANCEL_APPROACH requires active approach and rejects missed/landing", () => {
  expect(validateInstructions(jet(), [{ type: "CANCEL_APPROACH" }])).toEqual({
    ok: false,
    reason: "NOT_ON_APPROACH",
  });

  for (const lateral of [
    { type: "MISSED", approachId: "RNAV09" } as const,
    { type: "LANDING", approachId: "RNAV09" } as const,
  ]) {
    const ac = jet();
    ac.intent.clearedApproachId = "RNAV09";
    ac.intent.lateral = lateral;
    expect(validateInstructions(ac, [{ type: "CANCEL_APPROACH" }])).toEqual({
      ok: false,
      reason: "NOT_ON_APPROACH",
    });
  }
});

test("CANCEL_APPROACH rejects ordering, duplicate, and lifecycle conflicts", () => {
  const active = () => {
    const ac = jet();
    ac.intent.clearedApproachId = "RNAV09";
    ac.intent.lateral = { type: "INTERCEPT_LOC", approachId: "RNAV09" };
    return ac;
  };

  expect(
    validateInstructions(active(), [
      { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
      { type: "CANCEL_APPROACH" },
    ]),
  ).toEqual({
    ok: false,
    reason: "CLEARANCE",
    detail: "CANCEL_APPROACH must be the first instruction",
  });
  expect(
    validateInstructions(active(), [{ type: "CANCEL_APPROACH" }, { type: "CANCEL_APPROACH" }]),
  ).toEqual({
    ok: false,
    reason: "CLEARANCE",
    detail: "CANCEL_APPROACH may be issued only once",
  });
  expect(
    validateInstructions(active(), [
      { type: "CANCEL_APPROACH" },
      { type: "CLEARED_APPROACH", approachId: "RNAV09" },
    ]),
  ).toEqual({
    ok: false,
    reason: "CLEARANCE",
    detail: "CANCEL_APPROACH cannot be followed by approach or go-around instructions",
  });
});

test("AC5: speed rejected inside 5 DME / FAF boundary when on approach", () => {
  const approaches = [
    {
      id: "ILS27",
      type: "ILS",
      courseDeg: 270,
      fafDistanceNm: 6, // hardBoundaryNm = min(6, 5) = 5 -> "5 DME"
      thresholdFixId: "RW27",
    },
    {
      id: "ILS09",
      type: "ILS",
      courseDeg: 90,
      fafDistanceNm: 4, // hardBoundaryNm = min(4, 5) = 4 -> "final approach fix"
      thresholdFixId: "RW09",
    },
  ];
  const fixRegistry = {
    has: (id: string) => id === "RW27" || id === "RW09",
    get: (id: string) => (id === "RW27" ? { xNm: 0, yNm: 0 } : { xNm: 0, yNm: 0 }),
  } as unknown as import("@core").FixRegistry;

  const catalog = {
    stars: [],
    sids: [],
    approaches,
  };

  // Inside 5 DME on ILS27: xNm = 4 (alongTrackNm = 4 <= 5)
  const inside5Dme = jet({ altitudeFt: 3000 });
  inside5Dme.xNm = 4;
  inside5Dme.yNm = 0;
  inside5Dme.headingDeg = 270;
  inside5Dme.intent.clearedApproachId = "ILS27";

  expect(
    validateInstructions(inside5Dme, [{ type: "SPEED", speedKt: 180, verb: "MAINTAIN" }], {
      catalog,
      fixRegistry,
    }),
  ).toEqual({
    ok: false,
    reason: "SPEED",
    detail: "unable. restriction too close to 5 DME",
  });

  // Outside 5 DME on ILS27: xNm = 6 (alongTrackNm = 6 > 5) -> passes
  const outside5Dme = jet({ altitudeFt: 3000 });
  outside5Dme.xNm = 6;
  outside5Dme.yNm = 0;
  outside5Dme.headingDeg = 270;
  outside5Dme.intent.clearedApproachId = "ILS27";

  expect(
    validateInstructions(outside5Dme, [{ type: "SPEED", speedKt: 180, verb: "MAINTAIN" }], {
      catalog,
      fixRegistry,
    }).ok,
  ).toBe(true);

  // Inside FAF boundary when fafDistanceNm is 4: heading 90, xNm = -3 (alongTrackNm = 3 <= 4)
  const insideFaf = jet({ altitudeFt: 3000 });
  insideFaf.xNm = -3;
  insideFaf.yNm = 0;
  insideFaf.headingDeg = 90;
  insideFaf.intent.clearedApproachId = "ILS09";

  expect(
    validateInstructions(insideFaf, [{ type: "SPEED", speedKt: 180, verb: "MAINTAIN" }], {
      catalog,
      fixRegistry,
    }),
  ).toEqual({
    ok: false,
    reason: "SPEED",
    detail: "unable. restriction too close to final approach fix",
  });

  // Not on approach: at xNm = 4, heading 270, but clearedApproachId is null and lateral is not LOC/LANDING
  const notOnApproach = jet({ altitudeFt: 3000 });
  notOnApproach.xNm = 4;
  notOnApproach.yNm = 0;
  expect(
    validateInstructions(notOnApproach, [{ type: "SPEED", speedKt: 180, verb: "MAINTAIN" }], {
      catalog,
      fixRegistry,
    }).ok,
  ).toBe(true);
});

test("AC6: speed until validation rejects gates inside boundary", () => {
  const approaches = [
    {
      id: "ILS27",
      type: "ILS",
      courseDeg: 270,
      fafDistanceNm: 6, // hardBoundaryNm = 5
      thresholdFixId: "RW27",
    },
  ];
  const fixRegistry = {
    has: (id: string) => id === "RW27" || id === "CLOSE" || id === "FAR",
    get: (id: string) => {
      if (id === "RW27") return { xNm: 0, yNm: 0 };
      if (id === "CLOSE") return { xNm: 3, yNm: 0 }; // 3 NM along-track (< 5)
      if (id === "FAR") return { xNm: 10, yNm: 0 }; // 10 NM along-track (>= 5)
      return undefined;
    },
  } as unknown as import("@core").FixRegistry;

  const catalog = {
    stars: [],
    sids: [],
    approaches,
  };

  const ac = jet({ altitudeFt: 5000 });
  ac.xNm = 15;
  ac.yNm = 0;
  ac.intent.clearedApproachId = "ILS27";

  // until 3 DME (< 5 DME) -> rejects
  expect(
    validateInstructions(
      ac,
      [{ type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "DME", distanceNm: 3 } }],
      { catalog, fixRegistry },
    ),
  ).toEqual({
    ok: false,
    reason: "SPEED",
    detail: "unable. restriction too close to 5 DME",
  });

  // until 5 DME (>= 5 DME) -> passes
  expect(
    validateInstructions(
      ac,
      [{ type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "DME", distanceNm: 5 } }],
      { catalog, fixRegistry },
    ).ok,
  ).toBe(true);

  // until 7 DME (>= 5 DME) -> passes
  expect(
    validateInstructions(
      ac,
      [{ type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "DME", distanceNm: 7 } }],
      { catalog, fixRegistry },
    ).ok,
  ).toBe(true);

  // until CLOSE fix (3 NM < 5 DME) -> rejects
  expect(
    validateInstructions(
      ac,
      [{ type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "FIX", fixId: "CLOSE" } }],
      { catalog, fixRegistry },
    ),
  ).toEqual({
    ok: false,
    reason: "SPEED",
    detail: "unable. restriction too close to 5 DME",
  });

  // until FAR fix (10 NM >= 5 DME) -> passes
  expect(
    validateInstructions(
      ac,
      [{ type: "SPEED", speedKt: 180, verb: "MAINTAIN", until: { type: "FIX", fixId: "FAR" } }],
      { catalog, fixRegistry },
    ).ok,
  ).toBe(true);
});

test("DELETE_SPEED_RESTRICTIONS validates successfully", () => {
  expect(validateInstructions(jet(), [{ type: "DELETE_SPEED_RESTRICTIONS" }]).ok).toBe(true);
});

test("VFR flight following and radio contact instruction validation (T04-73)", () => {
  const ac = jet();
  const catalog = {
    airportId: "KDEM",
    navaids: [{ id: "DEM" }],
    fixes: [{ id: "NEMAX" }],
  };

  // Single instruction check
  expect(
    validateInstructions(ac, [
      { type: "REQUEST_DETAILS" },
      { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
    ]),
  ).toEqual({
    ok: false,
    reason: "CLEARANCE",
    detail: "request control instruction must be the only instruction",
  });

  // REQUEST_DETAILS
  expect(validateInstructions(ac, [{ type: "REQUEST_DETAILS" }])).toEqual({
    ok: false,
    reason: "REQUEST",
    detail: "REQUEST: no pending radio request",
  });
  const openReq = {
    id: "req-1",
    aircraftId: ac.id,
    callsign: ac.callsign,
    kind: "FLIGHT_FOLLOWING" as const,
    requestedAtSimMs: 1000,
    status: "PENDING" as const,
    details: {},
  };
  expect(
    validateInstructions(ac, [{ type: "REQUEST_DETAILS" }], {
      radioRequests: [openReq],
    }).ok,
  ).toBe(true);
  const approvedReq = { ...openReq, status: "APPROVED" as const };
  expect(
    validateInstructions(ac, [{ type: "REQUEST_DETAILS" }], {
      radioRequests: [approvedReq],
    }),
  ).toEqual({
    ok: false,
    reason: "REQUEST",
    detail: "REQUEST: request is already resolved",
  });

  // STANDBY_REQUEST
  expect(validateInstructions(ac, [{ type: "STANDBY_REQUEST" }])).toEqual({
    ok: false,
    reason: "REQUEST",
    detail: "REQUEST: no pending radio request",
  });
  expect(
    validateInstructions(ac, [{ type: "STANDBY_REQUEST" }], {
      radioRequests: [openReq],
    }).ok,
  ).toBe(true);
  expect(
    validateInstructions(ac, [{ type: "STANDBY_REQUEST" }], {
      radioRequests: [approvedReq],
    }),
  ).toEqual({
    ok: false,
    reason: "REQUEST",
    detail: "REQUEST: request is already resolved",
  });

  // APPROVE_FLIGHT_FOLLOWING
  expect(validateInstructions(ac, [{ type: "APPROVE_FLIGHT_FOLLOWING" }])).toEqual({
    ok: false,
    reason: "REQUEST",
    detail: "REQUEST: no pending radio request",
  });
  expect(
    validateInstructions(ac, [{ type: "APPROVE_FLIGHT_FOLLOWING" }], {
      radioRequests: [openReq],
    }),
  ).toEqual({
    ok: false,
    reason: "REQUEST",
    detail: "REQUEST: radar identification required",
  });
  const identifiedReq = { ...openReq, status: "IDENTIFIED" as const };
  expect(
    validateInstructions(ac, [{ type: "APPROVE_FLIGHT_FOLLOWING" }], {
      radioRequests: [identifiedReq],
    }).ok,
  ).toBe(true);

  // DECLINE_REQUEST
  expect(
    validateInstructions(ac, [{ type: "DECLINE_REQUEST", service: "FLIGHT_FOLLOWING" }]),
  ).toEqual({
    ok: false,
    reason: "REQUEST",
    detail: "REQUEST: no pending radio request",
  });
  expect(
    validateInstructions(ac, [{ type: "DECLINE_REQUEST", service: "FLIGHT_FOLLOWING" }], {
      radioRequests: [openReq],
    }).ok,
  ).toBe(true);
  expect(
    validateInstructions(ac, [{ type: "DECLINE_REQUEST", service: "FLIGHT_FOLLOWING" }], {
      radioRequests: [approvedReq],
    }),
  ).toEqual({
    ok: false,
    reason: "REQUEST",
    detail: "REQUEST: active service must be terminated",
  });

  // RADAR_CONTACT
  expect(
    validateInstructions(ac, [
      {
        type: "RADAR_CONTACT",
        distanceNm: 0,
        referenceId: "DEM",
        referenceKind: "NAVAID",
      },
    ]),
  ).toEqual({
    ok: false,
    reason: "RADAR_CONTACT",
    detail: "RADAR_CONTACT: distance must be positive",
  });
  expect(
    validateInstructions(
      ac,
      [
        {
          type: "RADAR_CONTACT",
          distanceNm: 5,
          referenceId: "UNKNOWN",
          referenceKind: "FIX",
        },
      ],
      { catalog },
    ),
  ).toEqual({
    ok: false,
    reason: "UNKNOWN_FIX",
    detail: "UNKNOWN_FIX",
  });
  expect(
    validateInstructions(
      ac,
      [
        {
          type: "RADAR_CONTACT",
          distanceNm: 5,
          referenceId: "DEM",
          referenceKind: "NAVAID",
        },
      ],
      { catalog },
    ),
  ).toEqual({
    ok: false,
    reason: "REQUEST",
    detail: "REQUEST: no pending radio request",
  });
  expect(
    validateInstructions(
      ac,
      [
        {
          type: "RADAR_CONTACT",
          distanceNm: 5,
          referenceId: "DEM",
          referenceKind: "NAVAID",
        },
      ],
      { catalog, radioRequests: [openReq] },
    ).ok,
  ).toBe(true);
  // Bare `radar contact` (no position report) identifies with an open request.
  expect(validateInstructions(ac, [{ type: "RADAR_CONTACT" }])).toEqual({
    ok: false,
    reason: "REQUEST",
    detail: "REQUEST: no pending radio request",
  });
  expect(
    validateInstructions(ac, [{ type: "RADAR_CONTACT" }], {
      catalog,
      radioRequests: [openReq],
    }).ok,
  ).toBe(true);
  // A partial position never validates.
  expect(
    validateInstructions(ac, [{ type: "RADAR_CONTACT", distanceNm: 5 } as unknown as Instruction], {
      catalog,
      radioRequests: [openReq],
    }),
  ).toEqual({
    ok: false,
    reason: "UNKNOWN_FIX",
    detail: "UNKNOWN_FIX",
  });

  // TERMINATE_RADAR_SERVICE
  expect(validateInstructions(ac, [{ type: "TERMINATE_RADAR_SERVICE" }])).toEqual({
    ok: false,
    reason: "REQUEST",
    detail: "REQUEST: radar service is not active",
  });
  ac.flightFollowing = { active: true, approvedAtSimMs: 1000 };
  expect(validateInstructions(ac, [{ type: "TERMINATE_RADAR_SERVICE" }]).ok).toBe(true);
});
