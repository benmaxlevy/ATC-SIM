import { expect, test } from "vitest";
import { SessionLog, createAircraft, createWorld, type Aircraft, type Intent } from "@core";
import { formatReadback } from "./readback";
import { IDENT_FLASH_MS } from "./applyIntent";
import { handleRadioText } from "./handleRadioText";

function sample(
  callsign: string,
  id: string,
  extras: Partial<Parameters<typeof createAircraft>[0]> = {},
) {
  return createAircraft({
    id,
    callsign,
    xNm: extras.xNm ?? 10,
    yNm: extras.yNm ?? 5,
    headingDeg: extras.headingDeg ?? 100,
    altitudeFt: extras.altitudeFt ?? 8000,
    speedKt: extras.speedKt ?? 220,
  });
}

function cloneIntent(intent: Intent): Intent {
  return { ...intent };
}

function snapshot(ac: Aircraft) {
  return {
    headingDeg: ac.headingDeg,
    altitudeFt: ac.altitudeFt,
    speedKt: ac.speedKt,
    xNm: ac.xNm,
    yNm: ac.yNm,
    identUntilSimMs: ac.identUntilSimMs,
    intent: cloneIntent(ac.intent),
  };
}

test("AC1 — DAL123 H270 accepted; assigned 270 SHORTEST; others unchanged; heading template; command.accepted", async () => {
  const dal = sample("DAL123", "ac-dal", { headingDeg: 100 });
  const aal = sample("AAL456", "ac-aal", { headingDeg: 90, xNm: 12 });
  const otherBefore = snapshot(aal);
  const world = createWorld({ aircraft: [dal, aal], simTimeMs: 250 });
  const log = new SessionLog();

  const result = await handleRadioText(world, "DAL123 H270", log);

  expect(result.accepted).toBe(true);
  expect(result.reason).toBeUndefined();
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(dal.intent.turn).toBe("SHORTEST");
  expect(aal.intent).toEqual(otherBefore.intent);
  expect(aal.headingDeg).toBe(otherBefore.headingDeg);
  expect(result.readback).toBe(
    formatReadback({
      callsign: "DAL123",
      instructions: [{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }],
      aircraft: dal,
    }),
  );
  expect(result.readback.toLowerCase()).toContain("heading two seven zero");
  expect(result.command?.source).toBe("text");
  expect(result.command?.callsign).toBe("DAL123");
  expect(result.command?.issuedAtSimMs).toBe(250);
  const accepted = log.byType("command.accepted");
  expect(accepted).toHaveLength(1);
  expect(accepted[0]?.command.id).toBe(result.command?.id);
  expect(log.byType("command.rejected")).toHaveLength(0);
});

test("T03-02 AC3 — typed H270 still yields source text", async () => {
  const dal = sample("DAL123", "ac-dal");
  const world = createWorld({ aircraft: [dal], selectedAircraftId: "ac-dal" });
  const result = await handleRadioText(world, "H270", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(result.command?.source).toBe("text");
  expect(result.command?.parseStage).toBe("typed");
});

test("AC2 — SAY_HEADING / SAY_ALTITUDE / IDENT accepted; kinematics intent unchanged", async () => {
  const dal = sample("DAL123", "ac-dal");
  const world = createWorld({ aircraft: [dal], simTimeMs: 1_000 });
  const log = new SessionLog();

  const beforeSay = snapshot(dal);
  const sayH = await handleRadioText(world, "DAL123 SH", log);
  expect(sayH.accepted).toBe(true);
  expect(snapshot(dal)).toEqual(beforeSay);

  const beforeAlt = snapshot(dal);
  const sayA = await handleRadioText(world, "DAL123 SA", log);
  expect(sayA.accepted).toBe(true);
  expect(snapshot(dal)).toEqual(beforeAlt);

  const beforeIdent = snapshot(dal);
  const ident = await handleRadioText(world, "DAL123 I", log);
  expect(ident.accepted).toBe(true);
  expect(dal.headingDeg).toBe(beforeIdent.headingDeg);
  expect(dal.altitudeFt).toBe(beforeIdent.altitudeFt);
  expect(dal.speedKt).toBe(beforeIdent.speedKt);
  expect(dal.intent).toEqual(beforeIdent.intent);
  expect(dal.identUntilSimMs).toBe(world.simTimeMs + IDENT_FLASH_MS);
  expect(log.byType("command.accepted")).toHaveLength(3);
});

test("AC3 — APP ILS27 sets INTERCEPT_LOC; heading/alt/speed intent unchanged", async () => {
  const dal = sample("DAL123", "ac-dal");
  const before = snapshot(dal);
  const world = createWorld({ aircraft: [dal] });
  const log = new SessionLog();

  const result = await handleRadioText(world, "DAL123 APP ILS27", log);
  expect(result.accepted).toBe(true);
  expect(dal.intent.clearedApproachId).toBe("ILS27");
  expect(dal.intent.lateral).toEqual({ type: "INTERCEPT_LOC", approachId: "ILS27" });
  expect(dal.intent.assignedHeadingDeg).toBe(before.intent.assignedHeadingDeg);
  expect(dal.intent.assignedAltitudeFt).toBe(before.intent.assignedAltitudeFt);
  expect(dal.intent.assignedSpeedKt).toBe(before.intent.assignedSpeedKt);
  expect(dal.intent.turn).toBe(before.intent.turn);
});

test("AC4 — C30 at 8000 rejected CLIMB_NOT_ABOVE; intent unchanged; command.rejected", async () => {
  const dal = sample("DAL123", "ac-dal", { altitudeFt: 8000 });
  const before = snapshot(dal);
  const world = createWorld({ aircraft: [dal] });
  const log = new SessionLog();

  const result = await handleRadioText(world, "DAL123 C30", log);
  expect(result.accepted).toBe(false);
  expect(result.reason).toBe("CLIMB_NOT_ABOVE");
  expect(dal.intent).toEqual(before.intent);
  expect(log.byType("command.rejected")).toHaveLength(1);
  expect(log.byType("command.rejected")[0]?.reason).toBe("CLIMB_NOT_ABOVE");
  expect(log.byType("command.accepted")).toHaveLength(0);
});

test("AC5 — S400 speed reject; H370 parse reject; empty string reject; no intent change", async () => {
  const dal = sample("DAL123", "ac-dal");
  const world = createWorld({ aircraft: [dal] });
  const log = new SessionLog();

  const beforeSpeed = snapshot(dal);
  const speed = await handleRadioText(world, "DAL123 S400", log);
  expect(speed.accepted).toBe(false);
  expect(speed.reason).toBe("SPEED");
  expect(dal.intent).toEqual(beforeSpeed.intent);

  const beforeHdg = snapshot(dal);
  const heading = await handleRadioText(world, "DAL123 H370", log);
  expect(heading.accepted).toBe(false);
  expect(heading.reason).toBe("PARSE");
  expect(heading.command).toBeUndefined();
  expect(dal.intent).toEqual(beforeHdg.intent);
  const parseReject = log.byType("command.rejected").find((e) => e.reason === "PARSE");
  expect(parseReject?.command).toBeNull();
  expect(parseReject?.sourceText).toBe("DAL123 H370");

  const beforeEmpty = snapshot(dal);
  const empty = await handleRadioText(world, "", log);
  expect(empty.accepted).toBe(false);
  expect(empty.reason).toBe("PARSE");
  expect(dal.intent).toEqual(beforeEmpty.intent);
});

test("AC6 — ambiguous suffix 123 rejects; both assigned headings unchanged", async () => {
  const dal = sample("DAL123", "ac-dal", { headingDeg: 100 });
  const aal = sample("AAL123", "ac-aal", { headingDeg: 90, xNm: 12 });
  const dalBefore = cloneIntent(dal.intent);
  const aalBefore = cloneIntent(aal.intent);
  const world = createWorld({ aircraft: [dal, aal] });
  const log = new SessionLog();

  const result = await handleRadioText(world, "123 H270", log);
  expect(result.accepted).toBe(false);
  expect(result.reason).toBe("AMBIGUOUS_CALLSIGN");
  expect(dal.intent.assignedHeadingDeg).toBe(dalBefore.assignedHeadingDeg);
  expect(aal.intent.assignedHeadingDeg).toBe(aalBefore.assignedHeadingDeg);
  expect(dal.intent).toEqual(dalBefore);
  expect(aal.intent).toEqual(aalBefore);
  expect(log.byType("command.rejected")[0]?.reason).toBe("AMBIGUOUS_CALLSIGN");
});

test("AC7 — D30 assigns 3000; S210 assigns 210; PH snaps assigned heading to current", async () => {
  const dal = sample("DAL123", "ac-dal", { altitudeFt: 8000, headingDeg: 10, speedKt: 220 });
  const world = createWorld({ aircraft: [dal] });
  const log = new SessionLog();

  const descend = await handleRadioText(world, "DAL123 D30", log);
  expect(descend.accepted).toBe(true);
  expect(dal.intent.assignedAltitudeFt).toBe(3000);

  const speed = await handleRadioText(world, "DAL123 S210", log);
  expect(speed.accepted).toBe(true);
  expect(dal.intent.assignedSpeedKt).toBe(210);

  dal.intent.assignedHeadingDeg = 90;
  dal.intent.turn = "RIGHT";
  const ph = await handleRadioText(world, "DAL123 PH", log);
  expect(ph.accepted).toBe(true);
  expect(dal.headingDeg).toBe(10);
  expect(dal.intent.assignedHeadingDeg).toBe(10);
  expect(dal.intent.turn).toBe("SHORTEST");
});

test("T20L alone turns from present heading", async () => {
  const dal = sample("DAL123", "ac-dal", { headingDeg: 10 });
  const world = createWorld({ aircraft: [dal] });
  const result = await handleRadioText(world, "DAL123 T20L", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(350);
  expect(dal.intent.turn).toBe("LEFT");
});

test("combined apply is last-wins for heading: H270 then T20L uses present heading", async () => {
  const dal = sample("DAL123", "ac-dal", { headingDeg: 10 });
  const world = createWorld({ aircraft: [dal] });
  const result = await handleRadioText(world, "DAL123 H270 T20L", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(350);
  expect(dal.intent.turn).toBe("LEFT");
});

test("reject does not partially apply a combined command", async () => {
  const dal = sample("DAL123", "ac-dal", { altitudeFt: 8000, headingDeg: 100 });
  const before = snapshot(dal);
  const world = createWorld({ aircraft: [dal] });
  const result = await handleRadioText(world, "DAL123 H270 C30", new SessionLog());
  expect(result.accepted).toBe(false);
  expect(result.reason).toBe("CLIMB_NOT_ABOVE");
  expect(dal.intent).toEqual(before.intent);
});

test("AC8 — handleRadioText tests run without window, document, or rAF", async () => {
  expect(typeof globalThis.window).toBe("undefined");
  expect(typeof globalThis.document).toBe("undefined");
  expect(typeof globalThis.requestAnimationFrame).toBe("undefined");
});

test("pilot sources do not import @scope, @ui, or stepWorld", async () => {
  const sources = import.meta.glob("./!(*.test).ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  expect(Object.keys(sources).length).toBeGreaterThan(0);
  for (const [path, src] of Object.entries(sources)) {
    expect(src, path).not.toMatch(/from\s+["']@scope["']/);
    expect(src, path).not.toMatch(/from\s+["']@ui["']/);
    expect(src, path).not.toMatch(/\bstepWorld\b/);
  }
});

test("grep guard: no intent.assigned writes outside src/pilot except tests and createAircraft", async () => {
  const sources = import.meta.glob("../**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const assignRe = /intent\.assigned(?:HeadingDeg|AltitudeFt|SpeedKt)\s*=/;
  for (const [path, src] of Object.entries(sources)) {
    if (path.includes(".test.")) continue;
    if (path.startsWith("./") || path.includes("/pilot/") || path.includes("\\pilot\\")) {
      continue;
    }
    if (path.endsWith("/core/aircraft.ts") || path.endsWith("\\core\\aircraft.ts")) continue;
    if (path.includes("/core/fms/") || path.includes("\\core\\fms\\")) continue;
    expect(src, path).not.toMatch(assignRe);
  }
});
