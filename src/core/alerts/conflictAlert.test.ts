import { expect, test } from "vitest";
import { makeTestAircraft } from "../aircraft";
import {
  CA_LATERAL_NM,
  CA_VERTICAL_FT,
  caSeverityForCallsign,
  evaluateConflictAlert,
} from "./conflictAlert";

test("CA constants are the frozen lite trainer thresholds", () => {
  expect(CA_LATERAL_NM).toBe(3);
  expect(CA_VERTICAL_FT).toBe(1000);
});

test("AC1 — 2.0 NM apart, Δalt 200 ft is red (alert)", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 250,
  });
  const aal = makeTestAircraft({
    id: "ac-aal",
    callsign: "AAL45",
    xNm: 2,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8200,
    speedKt: 250,
  });
  const alerts = evaluateConflictAlert([dal, aal]);
  expect(alerts).toHaveLength(1);
  expect(alerts[0]).toMatchObject({
    callsignA: "AAL45",
    callsignB: "DAL123",
    severity: "alert",
  });
  expect(alerts[0]!.distNm).toBeCloseTo(2, 5);
  expect(alerts[0]!.deltaAltFt).toBeCloseTo(200, 5);
  expect(caSeverityForCallsign(alerts, "DAL123")).toBe("alert");
  expect(caSeverityForCallsign(alerts, "AAL45")).toBe("alert");
});

test("AC2 — 8 NM head-on at 250 kt co-altitude is not a current CA", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 250,
  });
  const aal = makeTestAircraft({
    id: "ac-aal",
    callsign: "AAL45",
    xNm: 8,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 8000,
    speedKt: 250,
  });
  const alerts = evaluateConflictAlert([dal, aal]);
  expect(alerts).toEqual([]);
});

test("AC3 — 10 NM parallel co-altitude is not a current CA", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 250,
  });
  const aal = makeTestAircraft({
    id: "ac-aal",
    callsign: "AAL45",
    xNm: 0,
    yNm: 10,
    headingDeg: 90,
    altitudeFt: 8000,
    speedKt: 250,
  });
  expect(evaluateConflictAlert([dal, aal])).toEqual([]);
});

test("three aircraft yield two unique undirected pairs", () => {
  const dal = makeTestAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    altitudeFt: 8000,
    speedKt: 0,
  });
  const aal = makeTestAircraft({
    id: "ac-aal",
    callsign: "AAL45",
    xNm: 2,
    yNm: 0,
    altitudeFt: 8000,
    speedKt: 0,
  });
  const ual = makeTestAircraft({
    id: "ac-ual",
    callsign: "UAL100",
    xNm: 4,
    yNm: 0,
    altitudeFt: 8000,
    speedKt: 0,
  });
  const alerts = evaluateConflictAlert([dal, aal, ual]);
  expect(alerts.map((a) => `${a.callsignA}|${a.callsignB}|${a.severity}`)).toEqual([
    "AAL45|DAL123|alert",
    "AAL45|UAL100|alert",
  ]);
  expect(caSeverityForCallsign(alerts, "UAL100")).toBe("alert");
  expect(caSeverityForCallsign(alerts, "NKS1")).toBeNull();
});

test("self pairs and a single aircraft produce no CA", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", xNm: 0, yNm: 0 });
  expect(evaluateConflictAlert([])).toEqual([]);
  expect(evaluateConflictAlert([dal])).toEqual([]);
});

test("comments name CA as lite trainer, not TCAS or STARS CA", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./conflictAlert.ts"]!;
  expect(src).toMatch(/lite 3 NM/);
  expect(src).toMatch(/Not NAS/);
  expect(src).toMatch(/conflict alert/);
  expect(src).not.toMatch(/STARS CA/);
});
