import { expect, test } from "vitest";
import { SessionLog, createAircraft, createWorld, setSelectedAircraft } from "@core";
import { createWorldFromScenario, loadKdem } from "@scenario";
import { submitCommand } from "./submitCommand";
import {
  STRIP_BAY_HEADING,
  compareCallsigns,
  formatAssignedAltitudeHundreds,
  formatAssignedHeading,
  formatAssignedSpeed,
  selectTrackFromStrip,
  sortStripsByCallsign,
  stripsFromWorld,
} from "./flightStripModel";

function sample(callsign: string, extras: Partial<Parameters<typeof createAircraft>[0]> = {}) {
  return createAircraft({
    id: extras.id ?? `ac-${callsign.toLowerCase()}`,
    callsign,
    xNm: extras.xNm ?? 10,
    yNm: extras.yNm ?? 5,
    headingDeg: extras.headingDeg ?? 270,
    altitudeFt: extras.altitudeFt ?? 3000,
    speedKt: extras.speedKt ?? 210,
  });
}

test("format assigned heading/altitude/speed from intent, not kinematics", () => {
  expect(formatAssignedHeading(270)).toBe("H270");
  expect(formatAssignedHeading(0)).toBe("H000");
  expect(formatAssignedHeading(9)).toBe("H009");
  expect(formatAssignedHeading(null)).toBe("H---");
  expect(formatAssignedHeading(undefined)).toBe("H---");
  expect(formatAssignedHeading(Number.NaN)).toBe("H---");
  expect(formatAssignedAltitudeHundreds(3000)).toBe("A030");
  expect(formatAssignedAltitudeHundreds(5000)).toBe("A050");
  expect(formatAssignedSpeed(210)).toBe("S210");
});

test("AC8 — sort is callsign lexicographic and ignores position", () => {
  expect(compareCallsigns("AAL45", "DAL123")).toBeLessThan(0);
  const shuffled = [
    { callsign: "UAL200", xNm: 99 },
    { callsign: "AAL45", xNm: 1 },
    { callsign: "DAL123", xNm: 50 },
  ];
  const sorted = sortStripsByCallsign(shuffled);
  expect(sorted.map((row) => row.callsign)).toEqual(["AAL45", "DAL123", "UAL200"]);
  shuffled[0]!.xNm = -40;
  shuffled[1]!.xNm = 80;
  expect(sortStripsByCallsign(shuffled).map((row) => row.callsign)).toEqual([
    "AAL45",
    "DAL123",
    "UAL200",
  ]);
});

test("AC1 — six spawned KDEM arrivals yield six strips with those callsigns", () => {
  const world = createWorldFromScenario(loadKdem());
  expect(world.aircraft).toHaveLength(6);
  const strips = stripsFromWorld(world);
  expect(strips).toHaveLength(6);
  const callsigns = strips.map((s) => s.callsign);
  expect(callsigns).toEqual(["AAL45", "DAL123", "JBU17", "NKS310", "SWA88", "UAL200"]);
  for (const ac of world.aircraft) {
    expect(callsigns).toContain(ac.callsign);
  }
});

test("AC2 — DAL123 C50 updates strip A050 before Mode C moves", async () => {
  const dal = sample("DAL123", { altitudeFt: 3000, headingDeg: 270, speedKt: 210 });
  const world = createWorld({ aircraft: [dal] });
  const beforeModeC = dal.altitudeFt;
  const result = await submitCommand(world, "DAL123 C50", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedAltitudeFt).toBe(5000);
  expect(dal.altitudeFt).toBe(beforeModeC);
  const strip = stripsFromWorld(world).find((s) => s.callsign === "DAL123");
  expect(strip?.altitudeField).toBe("A050");
  expect(strip?.headingField).toBe("H270");
  expect(strip?.speedField).toBe("S210");
});

test("AC3 — clicking a strip selects that track id (shared with PPI)", () => {
  const dal = sample("DAL123", { id: "ac-dal" });
  const aal = sample("AAL45", { id: "ac-aal" });
  const world = createWorld({ aircraft: [dal, aal] });
  selectTrackFromStrip(world, "ac-dal");
  expect(world.selectedAircraftId).toBe("ac-dal");
  expect(stripsFromWorld(world).find((s) => s.callsign === "DAL123")?.selected).toBe(true);
  expect(stripsFromWorld(world).find((s) => s.callsign === "AAL45")?.selected).toBe(false);
});

test("AC4 — PPI selection id highlights the matching strip", () => {
  const dal = sample("DAL123", { id: "ac-dal" });
  const aal = sample("AAL45", { id: "ac-aal" });
  const world = createWorld({ aircraft: [dal, aal] });
  setSelectedAircraft(world, "ac-aal");
  const strips = stripsFromWorld(world);
  expect(strips.find((s) => s.callsign === "AAL45")?.selected).toBe(true);
  expect(strips.find((s) => s.callsign === "DAL123")?.selected).toBe(false);
});

test("AC5 — every aircraft keeps a strip regardless of Mode C (filter does not apply)", () => {
  const low = sample("LOAL1", { id: "ac-low", altitudeFt: 500 });
  const high = sample("HIAL2", { id: "ac-high", altitudeFt: 17000 });
  low.intent.assignedAltitudeFt = 3000;
  high.intent.assignedAltitudeFt = 5000;
  const world = createWorld({ aircraft: [low, high] });
  const strips = stripsFromWorld(world);
  expect(strips).toHaveLength(2);
  expect(strips.map((s) => s.callsign)).toEqual(["HIAL2", "LOAL1"]);
});

test("AC6 — strip select does not emit Command IR or change intent", () => {
  const dal = sample("DAL123", { id: "ac-dal", headingDeg: 100 });
  const before = { ...dal.intent };
  const world = createWorld({ aircraft: [dal] });
  const log = new SessionLog();
  selectTrackFromStrip(world, "ac-dal");
  expect(world.selectedAircraftId).toBe("ac-dal");
  expect(dal.intent).toEqual(before);
  expect(log.all()).toEqual([]);
});

test("empty world yields no strips (empty bay copy is not aircraft list)", () => {
  expect(stripsFromWorld(createWorld())).toEqual([]);
  expect(STRIP_BAY_HEADING.toLowerCase()).toBe("flight strips");
  expect(STRIP_BAY_HEADING.toLowerCase()).not.toContain("aircraft list");
});

test("typed DAL123 H270 still assigns heading with strips derived from World", async () => {
  const dal = sample("DAL123", { headingDeg: 100 });
  const world = createWorld({ aircraft: [dal] });
  const result = await submitCommand(world, "DAL123 H270", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(stripsFromWorld(world)[0]?.headingField).toBe("H270");
});

test("AC8 — moving aircraft does not reorder strips", () => {
  const world = createWorldFromScenario(loadKdem());
  const before = stripsFromWorld(world).map((s) => s.callsign);
  for (const ac of world.aircraft) {
    ac.xNm += 12;
    ac.yNm -= 7;
  }
  expect(stripsFromWorld(world).map((s) => s.callsign)).toEqual(before);
});

test("strip model source does not import the radio pipeline", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const model = sources["./flightStripModel.ts"];
  expect(model).toBeDefined();
  expect(model).not.toMatch(/from\s+["']@parse["']/);
  expect(model).not.toMatch(/from\s+["']@pilot["']/);
  expect(model).not.toMatch(/handleRadioText/);
  expect(model).not.toMatch(/submitCommand/);
  expect(model).not.toMatch(/\bparseRadioText\b/);
  expect(model).toMatch(/setSelectedAircraft/);
  expect(model).toMatch(/flight progress strip/);
});
