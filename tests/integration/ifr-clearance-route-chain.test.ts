import { expect, test, vi } from "vitest";
import {
  applyIfrClearance,
  buildFixRegistry,
  createAircraft,
  createWorld,
  saveFlightPlanDraft,
  SessionLog,
  stepWorld,
  type Instruction,
} from "@core";
import { parseCommand, parseRadioText, proceduresFromCatalog, type ParsePathCFn } from "@parse";
import { formatReadback, handleRadioText } from "@pilot";

const routeIds = ["SWEPT", "VOR1", "KIMMY", "BLUFF"] as const;
const airports = [
  {
    icao: "KATL",
    name: "Atlanta International Airport",
    aliases: ["Atlanta Airport"],
  },
];

const worldCatalog = {
  airportId: "KATL",
  name: "Atlanta International Airport",
  spokenAliases: ["Atlanta Airport"],
  airportEndpoint: { xNm: 8, yNm: 0 },
  fixes: [
    { id: "SWEPT", xNm: 2, yNm: 0, kind: "fix" },
    { id: "KIMMY", xNm: 4, yNm: 0, kind: "fix" },
    { id: "BLUFF", xNm: 6, yNm: 0, kind: "fix" },
  ],
  navaids: [{ id: "VOR1", xNm: 3, yNm: 0, kind: "vor" }],
  stars: [],
  sids: [],
  approaches: [],
};

function setup() {
  const aircraft = createAircraft({
    id: "ac-route-chain",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const world = createWorld({
    aircraft: [aircraft],
    catalog: worldCatalog,
    fixRegistry: buildFixRegistry({ fixes: worldCatalog.fixes, navaids: worldCatalog.navaids }),
  });
  const draft = saveFlightPlanDraft(world, { acid: "DAL123", filedRoute: "SWEPT VOR1" });
  if (!draft.ok) throw new Error(draft.error.message);
  return { world, aircraft, plan: draft.plan };
}

const expectedSegments: Array<Extract<Instruction, { type: "IFR_CLEARANCE" }>> = [
  {
    type: "IFR_CLEARANCE",
    limitId: "KATL",
    access: {
      type: "EXPLICIT_ROUTE",
      segments: routeIds.map((fixId) => ({ type: "DIRECT" as const, fixId })),
    },
  },
];
const expectedAtlantaSegments: Array<Extract<Instruction, { type: "IFR_CLEARANCE" }>> = [
  {
    type: "IFR_CLEARANCE",
    limitId: "KATL",
    access: {
      type: "EXPLICIT_ROUTE",
      segments: ["SWEPT", "KIMMY", "BLUFF"].map((fixId) => ({
        type: "DIRECT" as const,
        fixId,
      })),
    },
  },
];

test("typed, spoken, and constrained Path C routes share one ordered IR", async () => {
  const typed = parseRadioText("DAL123 CLR TO KATL VIA SWEPT DIRECT VOR1 KIMMY DIRECT BLUFF", {
    fixes: ["KATL", ...routeIds],
  });
  expect(typed.ok).toBe(true);

  const spoken = await parseCommand(
    "DAL123 cleared to Atlanta International Airport via swept VOR1 kimmy bluff",
    {
      source: "voice",
      fixes: ["KATL", ...routeIds],
      airports,
      pathC: false,
    },
  );
  expect(spoken.ok).toBe(true);

  const pathC: ParsePathCFn = vi.fn(async () => ({
    callsignToken: "DAL123",
    instructions: expectedSegments,
  }));
  const recovered = await parseCommand("DAL123 cleared to KATL via swept VOR1 kimmy bluff", {
    source: "voice",
    fixes: [],
    airports,
    routeCandidates: routeIds.map((id, index) => ({
      id,
      kind: index === 1 ? ("NAVAID" as const) : ("FIX" as const),
      aliases: [id],
    })),
    pathC: true,
    parsePathC: pathC,
  });

  const typedClearance = typed.ok ? typed.instructions[0] : undefined;
  if (typedClearance?.type !== "IFR_CLEARANCE") {
    throw new Error("typed route missed");
  }
  const spokenClearance = spoken.ok ? spoken.instructions[0] : undefined;
  if (spokenClearance?.type !== "IFR_CLEARANCE") {
    throw new Error("spoken route missed");
  }
  const recoveredClearance = recovered.ok ? recovered.instructions[0] : undefined;
  if (recoveredClearance?.type !== "IFR_CLEARANCE") {
    throw new Error("Path C route missed");
  }
  expect(spoken).toMatchObject({ ok: true, instructions: [expectedSegments[0]] });
  expect(recovered).toMatchObject({
    ok: true,
    parseStage: "llm_c",
    instructions: expectedSegments,
  });
  expect(pathC).toHaveBeenCalledOnce();
  expect(typedClearance.access).toEqual(spokenClearance.access);
  expect(spokenClearance.access).toEqual(recoveredClearance.access);
});

test("the exact Atlanta adjacent-chain regression stays local and ordered", async () => {
  const parsePathC = vi.fn<ParsePathCFn>(async () => null);
  const result = await parseCommand(
    "endeavor 1155 clear to atlanta international airport via direct swept direct kimmy direct bluff direct",
    {
      source: "voice",
      fixes: ["SWEPT", "KIMMY", "BLUFF"],
      airports,
      pathC: true,
      parsePathC,
    },
  );

  expect(result).toMatchObject({
    ok: true,
    callsignToken: "EDV1155",
    instructions: expectedAtlantaSegments,
  });
  expect(parsePathC).not.toHaveBeenCalled();
});

test("accepted chain executes every leg, reads back in order, and leaves plan unchanged", async () => {
  const { world, aircraft, plan } = setup();
  const beforePlan = structuredClone(plan);
  const result = await handleRadioText(
    world,
    "DAL123 CLR TO KATL VIA SWEPT DIRECT VOR1 DIRECT KIMMY DIRECT BLUFF",
    new SessionLog(),
  );

  expect(result.accepted).toBe(true);
  expect(result.readback).toContain("SWEPT");
  expect(result.readback).toContain("VOR1");
  expect(result.readback).toContain("KIMMY");
  expect(result.readback).toContain("BLUFF");
  expect(plan).toEqual(beforePlan);

  const route = aircraft.activeClearance?.route;
  expect(route?.route.segments.flatMap((segment) => segment.fixIds)).toEqual([...routeIds, "KATL"]);
  expect(aircraft.activeClearance?.access).toEqual(expectedSegments[0]!.access);

  const visited: number[] = [];
  let previous = 0;
  for (let i = 0; i < 500 && previous < routeIds.length + 1; i += 1) {
    stepWorld(world, 1);
    const next = aircraft.activeClearance?.route.nextIndex ?? previous;
    while (previous < next) {
      previous += 1;
      visited.push(previous);
    }
  }
  expect(visited).toEqual([1, 2, 3, 4, 5]);
  expect(
    formatReadback({
      callsign: aircraft.callsign,
      instructions: [expectedSegments[0]!],
      aircraft,
    }),
  ).toBe(
    "Delta 123 cleared to KATL via direct SWEPT then direct VOR1 then direct KIMMY then direct BLUFF then direct",
  );
});

test("invalid replacement returns UNABLE_ROUTE and preserves the active route atomically", async () => {
  const { world, aircraft, plan } = setup();
  const issued = await handleRadioText(
    world,
    "DAL123 CLR TO KATL VIA SWEPT DIRECT VOR1",
    new SessionLog(),
  );
  expect(issued.accepted).toBe(true);
  const beforePlan = structuredClone(plan);
  const beforeAircraft = structuredClone(aircraft);

  const rejected = applyIfrClearance(world, aircraft, {
    type: "IFR_CLEARANCE",
    limitId: "KATL",
    access: { type: "EXPLICIT_ROUTE", segments: [{ type: "DIRECT", fixId: "UNKNOWN" }] },
  });

  expect(rejected).toMatchObject({ ok: false, error: { code: "UNABLE_ROUTE" } });
  expect(plan).toEqual(beforePlan);
  expect(aircraft).toEqual(beforeAircraft);
});

test("mixed procedure and navaid chain remains catalog-grounded", async () => {
  const procedure = await parseCommand("DAL123 cleared to KATL via SID1 NORTH transition VOR1", {
    source: "voice",
    fixes: ["VOR1"],
    procedures: [{ id: "SID1", transitions: [{ id: "NORTH" }] }],
    airports,
    pathC: false,
  });
  expect(procedure).toMatchObject({
    ok: true,
    instructions: [
      {
        type: "IFR_CLEARANCE",
        access: {
          type: "EXPLICIT_ROUTE",
          segments: [
            { type: "PROCEDURE", procedureId: "SID1", transitionId: "NORTH" },
            { type: "DIRECT", fixId: "VOR1" },
          ],
        },
      },
    ],
  });
  expect(
    proceduresFromCatalog({ sids: [{ id: "SID1", enrouteTransitions: [{ id: "NORTH" }] }] }),
  ).toHaveLength(1);
});
