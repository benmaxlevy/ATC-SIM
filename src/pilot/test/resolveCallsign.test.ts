import { expect, test } from "vitest";
import { createAircraft, createWorld, setSelectedAircraft, type Aircraft } from "@core";
import { numericTail, resolveCallsign } from "../handleRadioText";

function sampleAircraft(callsign: string, id: string): Aircraft {
  return createAircraft({
    id,
    callsign,
    xNm: 10,
    yNm: 5,
    headingDeg: 100,
    altitudeFt: 8000,
    speedKt: 220,
  });
}

test("numericTail strips the ICAO prefix; 123 does not equal 123A", () => {
  expect(numericTail("DAL123")).toBe("123");
  expect(numericTail("DAL123A")).toBe("123A");
  expect(numericTail("AAL1230")).toBe("1230");
});

test("AC1 — only DAL123: full callsign and unambiguous suffix both resolve", () => {
  const dal = sampleAircraft("DAL123", "ac-dal");
  const world = createWorld({ aircraft: [dal] });

  const byFull = resolveCallsign({ callsignToken: "DAL123", world });
  expect(byFull).toEqual({ ok: true, aircraftId: "ac-dal", callsign: "DAL123" });

  const bySuffix = resolveCallsign({ callsignToken: "123", world });
  expect(bySuffix).toEqual({ ok: true, aircraftId: "ac-dal", callsign: "DAL123" });
});

test("AC2 — DAL123 and AAL123: suffix 123 is ambiguous; full DAL123 is DAL only", () => {
  const dal = sampleAircraft("DAL123", "ac-dal");
  const aal = sampleAircraft("AAL123", "ac-aal");
  const world = createWorld({ aircraft: [dal, aal] });

  expect(resolveCallsign({ callsignToken: "123", world })).toEqual({
    ok: false,
    reason: "AMBIGUOUS_CALLSIGN",
  });
  expect(resolveCallsign({ callsignToken: "DAL123", world })).toEqual({
    ok: true,
    aircraftId: "ac-dal",
    callsign: "DAL123",
  });
});

test("suffix 123 does not match DAL123A; suffix 123A matches only 123A", () => {
  const dal = sampleAircraft("DAL123A", "ac-dal-a");
  const world = createWorld({ aircraft: [dal] });

  expect(resolveCallsign({ callsignToken: "123", world })).toEqual({
    ok: false,
    reason: "UNKNOWN_CALLSIGN",
  });
  expect(resolveCallsign({ callsignToken: "123A", world })).toEqual({
    ok: true,
    aircraftId: "ac-dal-a",
    callsign: "DAL123A",
  });
});

test("suffix 123 does not match DAL1230 unless the token is 1230", () => {
  const dal = sampleAircraft("DAL1230", "ac-dal-0");
  const world = createWorld({ aircraft: [dal] });

  expect(resolveCallsign({ callsignToken: "123", world })).toEqual({
    ok: false,
    reason: "UNKNOWN_CALLSIGN",
  });
  expect(resolveCallsign({ callsignToken: "1230", world })).toEqual({
    ok: true,
    aircraftId: "ac-dal-0",
    callsign: "DAL1230",
  });
});

test("AC3 — unknown full callsign is UNKNOWN_CALLSIGN", () => {
  const world = createWorld({ aircraft: [sampleAircraft("DAL123", "ac-dal")] });
  expect(resolveCallsign({ callsignToken: "ZZZ9", world })).toEqual({
    ok: false,
    reason: "UNKNOWN_CALLSIGN",
  });
});

test("AC4 — null token uses selection; null selection is NO_CALLSIGN_OR_SELECTION", () => {
  const dal = sampleAircraft("DAL123", "ac-dal");
  const world = createWorld({ aircraft: [dal] });

  setSelectedAircraft(world, dal.id);
  expect(resolveCallsign({ callsignToken: null, world })).toEqual({
    ok: true,
    aircraftId: "ac-dal",
    callsign: "DAL123",
  });

  setSelectedAircraft(world, null);
  expect(resolveCallsign({ callsignToken: null, world })).toEqual({
    ok: false,
    reason: "NO_CALLSIGN_OR_SELECTION",
  });
});

test("AC5 — explicit callsign wins over selection", () => {
  const dal = sampleAircraft("DAL123", "ac-dal");
  const aal = sampleAircraft("AAL123", "ac-aal");
  const world = createWorld({ aircraft: [dal, aal] });
  setSelectedAircraft(world, dal.id);

  expect(resolveCallsign({ callsignToken: "AAL123", world })).toEqual({
    ok: true,
    aircraftId: "ac-aal",
    callsign: "AAL123",
  });
});

test("AC6 — stale selectedAircraftId and null token is SELECTED_NOT_FOUND", () => {
  const dal = sampleAircraft("DAL123", "ac-dal");
  const world = createWorld({ aircraft: [dal], selectedAircraftId: "stale-id" });

  expect(resolveCallsign({ callsignToken: null, world })).toEqual({
    ok: false,
    reason: "SELECTED_NOT_FOUND",
  });
});

test("AC7 — resolver tests run without window, document, or rAF", () => {
  expect(typeof globalThis.window).toBe("undefined");
  expect(typeof globalThis.document).toBe("undefined");
  expect(typeof globalThis.requestAnimationFrame).toBe("undefined");
});
