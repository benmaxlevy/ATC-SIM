import { expect, test } from "vitest";
import { applyVerticalFms, createAircraft, targetAltitudeFt, targetSpeedKt } from "@core";

test("targetAltitudeFt holds next AOA/AT while VIA is armed", () => {
  const via = { type: "VIA_STAR" as const, starId: "DEM1", sense: "DESCEND" as const };
  expect(
    targetAltitudeFt({
      assignedFt: 11000,
      vertical: via,
      nextConstraint: { type: "AT_OR_ABOVE", altitudeFt: 10000 },
      onStar: true,
    }),
  ).toBe(10000);
  expect(
    targetAltitudeFt({
      assignedFt: 4000,
      vertical: via,
      nextConstraint: { type: "AT", altitudeFt: 4000 },
      onStar: true,
    }),
  ).toBe(4000);
});

test("AC1 — controller assigned speed takes precedence over published STAR speed constraints", () => {
  const via = { type: "VIA_STAR" as const, starId: "DEM1", sense: "DESCEND" as const };

  // S210 on STAR with 250 kt restriction -> flies 210 kt
  expect(
    targetSpeedKt({
      assignedKt: 210,
      vertical: via,
      nextConstraint: { type: "AT_OR_BELOW", speedKt: 250 },
      onStar: true,
      controllerAssignedKt: 210,
    }),
  ).toBe(210);

  // S250 on STAR with 210 kt restriction -> flies 250 kt (overrides restriction)
  expect(
    targetSpeedKt({
      assignedKt: 250,
      vertical: via,
      nextConstraint: { type: "AT_OR_BELOW", speedKt: 210 },
      onStar: true,
      controllerAssignedKt: 250,
    }),
  ).toBe(250);

  // Controller speed is bounded by aircraft envelope
  expect(
    targetSpeedKt({
      assignedKt: 350,
      vertical: via,
      nextConstraint: { type: "AT_OR_BELOW", speedKt: 250 },
      onStar: true,
      controllerAssignedKt: 350,
      envelope: { minSpeedKt: 140, maxSpeedKt: 300 },
    }),
  ).toBe(300);
});

test("AC2 — DSR ignores published procedure fix speed constraints and flies normal arrival speed", () => {
  const via = { type: "VIA_STAR" as const, starId: "DEM1", sense: "DESCEND" as const };

  // DSR below 10,000 ft caps at 250 kt
  expect(
    targetSpeedKt({
      assignedKt: 280,
      vertical: via,
      nextConstraint: { type: "AT_OR_BELOW", speedKt: 210 },
      onStar: true,
      speedRestrictionsDeleted: true,
      altitudeFt: 8000,
      normalArrivalSpeedKt: 280,
    }),
  ).toBe(250);

  // DSR above 10,000 ft allows profile arrival speed (e.g. 280 kt), ignoring 250 kt published constraint
  expect(
    targetSpeedKt({
      assignedKt: 280,
      vertical: via,
      nextConstraint: { type: "AT", speedKt: 250 },
      onStar: true,
      speedRestrictionsDeleted: true,
      altitudeFt: 14000,
      normalArrivalSpeedKt: 280,
    }),
  ).toBe(280);
});

test("targetSpeedKt complies with published fix speed constraints when no controller assignment or DSR", () => {
  const via = { type: "VIA_STAR" as const, starId: "DEM1", sense: "DESCEND" as const };

  expect(
    targetSpeedKt({
      assignedKt: 250,
      vertical: via,
      nextConstraint: { type: "AT_OR_BELOW", speedKt: 210 },
      onStar: true,
    }),
  ).toBe(210);

  expect(
    targetSpeedKt({
      assignedKt: 200,
      vertical: via,
      nextConstraint: { type: "AT_OR_ABOVE", speedKt: 230 },
      onStar: true,
    }),
  ).toBe(230);

  expect(
    targetSpeedKt({
      assignedKt: 250,
      vertical: via,
      nextConstraint: { type: "AT", speedKt: 220 },
      onStar: true,
    }),
  ).toBe(220);
});

test("applyVerticalFms applies controllerAssignedSpeedKt and DSR for aircraft", () => {
  const catalog = {
    stars: [
      {
        id: "DEM1",
        common: [
          {
            fixId: "BAMMI",
            speedConstraint: { type: "AT_OR_BELOW" as const, speedKt: 210 },
          },
        ],
      },
    ],
  };

  const ac = createAircraft({
    id: "ac-1",
    callsign: "AAL123",
    xNm: 10,
    yNm: 10,
    headingDeg: 270,
    altitudeFt: 8000,
    speedKt: 250,
  });
  ac.intent.lateral = {
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: ["BAMMI"],
  };
  ac.intent.vertical = { type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" };

  // 1. Without controller assignment or DSR: complies with published BAMMI speed <= 210
  let res = applyVerticalFms(ac, catalog);
  expect(res.speedKt).toBe(210);

  // 2. AC1: With controller assignment: controller speed takes precedence (e.g. 240 kt)
  ac.intent.controllerAssignedSpeedKt = 240;
  res = applyVerticalFms(ac, catalog);
  expect(res.speedKt).toBe(240);

  // 3. AC2: With DSR: ignores 210 constraint and flies arrival speed (capped at 250 below 10,000 ft)
  ac.intent.controllerAssignedSpeedKt = undefined;
  ac.intent.speedRestrictionsDeleted = true;
  res = applyVerticalFms(ac, catalog);
  expect(res.speedKt).toBe(250);
});
