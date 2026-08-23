import { createAircraft, INSTRUCTION_TYPES } from "@core";
import { expect, test } from "vitest";
import { formatCheckIn, isStarViaArrival, starSpokenName } from "./checkin";
import { formatReadback } from "./readback";

const GOLDEN_LOWER =
  "approach, delta one two three, descending via demo one arrival through one one thousand feet";

test("AC1 — formatCheckIn golden string for DAL123 / DEMO ONE / 11000", () => {
  const text = formatCheckIn({
    callsign: "DAL123",
    starName: "DEMO ONE",
    altitudeFt: 11000,
  });
  expect(text.toLowerCase()).toBe(GOLDEN_LOWER);
  expect(text).toBe(
    "approach, delta one two three, descending via DEMO ONE arrival through one one thousand feet",
  );
});

test("AC2 — catalog lookup speaks DEMO ONE and never the coded id DEM1", () => {
  const starName = starSpokenName({ stars: [{ id: "DEM1", name: "DEMO ONE" }] }, "DEM1");
  expect(starName).toBe("DEMO ONE");
  const text = formatCheckIn({
    callsign: "DAL123",
    starName,
    altitudeFt: 11000,
  });
  expect(text).toContain("DEMO ONE");
  expect(text.toLowerCase()).toContain("demo one");
  expect(text).not.toContain("DEM1");
  expect(text.toLowerCase()).not.toContain("dem1");
});

test("3000 ft is spoken as through three thousand feet", () => {
  const text = formatCheckIn({
    callsign: "DAL123",
    starName: "DEMO ONE",
    altitudeFt: 3000,
  });
  expect(text.toLowerCase()).toContain("through three thousand feet");
});

test("AC11 — formatter comments analog AIM/7110.65 vs trainer delta", async () => {
  const sources = import.meta.glob("./checkin.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./checkin.ts"];
  expect(src).toBeDefined();
  expect(src).toMatch(/AIM initial contact/i);
  expect(src).toMatch(/descend-via/i);
  expect(src).toMatch(/Trainer delta/i);
  expect(src).toMatch(/through/);
  expect(src).not.toMatch(/from\s+["']\.\/readback["']/);
  expect(src).not.toMatch(/formatReadback\s*\(/);
});

test("isStarViaArrival requires PROCEDURE and VIA_STAR with the same starId", () => {
  const ac = createAircraft({
    callsign: "DAL123",
    xNm: 18,
    yNm: 13,
    headingDeg: 225,
    altitudeFt: 11000,
    speedKt: 250,
  });
  expect(isStarViaArrival(ac)).toBe(false);
  ac.intent.lateral = {
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: ["NEMAX"],
  };
  expect(isStarViaArrival(ac)).toBe(false);
  ac.intent.vertical = { type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" };
  expect(isStarViaArrival(ac)).toBe(true);
  ac.intent.vertical = { type: "VIA_STAR", starId: "OTHER", sense: "DESCEND" };
  expect(isStarViaArrival(ac)).toBe(false);
});

test("AC10 — DESCEND_VIA command readback is unchanged and not a check-in", () => {
  expect(
    formatReadback({
      callsign: "DAL123",
      instructions: [{ type: "DESCEND_VIA", procedureId: "DEM1" }],
      aircraft: { headingDeg: 225, altitudeFt: 11000 },
      procedureNames: { DEM1: "DEMO ONE" },
    }).toLowerCase(),
  ).toBe("delta one two three descend via demo one");
  expect(INSTRUCTION_TYPES.includes("DESCEND_VIA")).toBe(true);
  expect((INSTRUCTION_TYPES as readonly string[]).includes("CHECKIN")).toBe(false);
});
