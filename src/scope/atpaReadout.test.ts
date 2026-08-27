import { expect, test } from "vitest";
import type { AtpaPair } from "@core";
import { PALETTE } from "./palette";
import {
  ATPA_CONE_MILEAGE_ALONG_FRAC,
  ATPA_CONE_MILEAGE_OFFSET_NM,
  atpaConeMileagePlacement,
  atpaConeMileageReadout,
  atpaInTrailDatablockReadout,
  atpaPairForTrailing,
  atpaReadoutColor,
  atpaReadoutEnabled,
  formatAtpaConeMileage,
  formatAtpaInTrailDistance,
} from "./atpaReadout";

function pair(
  partial: Partial<AtpaPair> & Pick<AtpaPair, "trailingCallsign" | "status">,
): AtpaPair {
  return {
    leadingCallsign: "AAL45",
    volumeId: "ATPA27",
    distanceNm: 9.88,
    requiredNm: 3,
    closureKt: 40,
    ...partial,
  };
}

const ON: { atpaOn: boolean; globalEnabled: boolean; trackEnabled: boolean } = {
  atpaOn: true,
  globalEnabled: true,
  trackEnabled: true,
};

test("AC2 — datablock in-trail distance is two decimal places (Fig 38/39)", () => {
  expect(formatAtpaInTrailDistance(9.88)).toBe("9.88");
  expect(formatAtpaInTrailDistance(3.97)).toBe("3.97");
  expect(formatAtpaInTrailDistance(2.4)).toBe("2.40");
  expect(formatAtpaInTrailDistance(3)).toBe("3.00");
  expect(formatAtpaInTrailDistance(2.5)).toBe("2.50");
  expect(formatAtpaInTrailDistance(0)).toBe("0.00");
});

test("AC4 — cone mileage is tenths for non-whole values, not two-decimal datablock strings", () => {
  expect(formatAtpaConeMileage(3)).toBe("3");
  expect(formatAtpaConeMileage(3.0)).toBe("3");
  expect(formatAtpaConeMileage(2.5)).toBe("2.5");
  expect(formatAtpaConeMileage(2.4)).toBe("2.4");
  expect(formatAtpaConeMileage(10)).toBe("10");
  expect(formatAtpaConeMileage(2.54)).toBe("2.5");
  expect(formatAtpaInTrailDistance(2.5)).not.toBe(formatAtpaConeMileage(2.5));
  expect(formatAtpaInTrailDistance(3)).not.toBe(formatAtpaConeMileage(3));
});

test("AC1 — trailing track gets a readout; frontmost does not; three-track chain is two pairs", () => {
  const pairs: AtpaPair[] = [
    pair({
      trailingCallsign: "DAL123",
      leadingCallsign: "AAL45",
      distanceNm: 3.97,
      status: "warning",
    }),
    pair({
      trailingCallsign: "SWA88",
      leadingCallsign: "DAL123",
      distanceNm: 9.88,
      status: "alert",
    }),
  ];
  expect(atpaPairForTrailing(pairs, "AAL45")).toBeUndefined();
  expect(atpaInTrailDatablockReadout(pairs, "AAL45", ON)).toBeNull();
  expect(atpaInTrailDatablockReadout(pairs, "DAL123", ON)).toEqual({
    text: "3.97",
    status: "warning",
  });
  expect(atpaInTrailDatablockReadout(pairs, "SWA88", ON)).toEqual({
    text: "9.88",
    status: "alert",
  });
});

test("AC3 — monitor pairs add no datablock field; warning and alert do", () => {
  const monitor = [pair({ trailingCallsign: "DAL123", status: "monitor", distanceNm: 5.12 })];
  const warning = [pair({ trailingCallsign: "DAL123", status: "warning", distanceNm: 4.2 })];
  const alert = [pair({ trailingCallsign: "DAL123", status: "alert", distanceNm: 2.4 })];
  expect(atpaInTrailDatablockReadout(monitor, "DAL123", ON)).toBeNull();
  expect(atpaInTrailDatablockReadout(warning, "DAL123", ON)).toEqual({
    text: "4.20",
    status: "warning",
  });
  expect(atpaInTrailDatablockReadout(alert, "DAL123", ON)).toEqual({
    text: "2.40",
    status: "alert",
  });
  expect(atpaReadoutColor("warning")).toBe(PALETTE.caution);
  expect(atpaReadoutColor("alert")).toBe(PALETTE.atpaAlert);
  expect(atpaReadoutColor("alert")).not.toBe(PALETTE.alert);
  expect(atpaReadoutColor("monitor")).toBe(PALETTE.tools);
});

test("AC5 — pair clear leaves no residue; inhibit matrix is independent per readout", () => {
  const live = [
    pair({ trailingCallsign: "DAL123", status: "warning", distanceNm: 9.88, requiredNm: 3 }),
  ];
  expect(atpaInTrailDatablockReadout(live, "DAL123", ON)?.text).toBe("9.88");
  expect(
    atpaConeMileageReadout(live, "DAL123", { xNm: 4, yNm: 0 }, { xNm: 0, yNm: 0 }, ON)?.text,
  ).toBe("3");
  expect(atpaInTrailDatablockReadout([], "DAL123", ON)).toBeNull();
  expect(
    atpaConeMileageReadout([], "DAL123", { xNm: 4, yNm: 0 }, { xNm: 0, yNm: 0 }, ON),
  ).toBeNull();

  const gates = [
    { atpaOn: true, globalEnabled: true, trackEnabled: true, expect: true },
    { atpaOn: true, globalEnabled: true, trackEnabled: false, expect: false },
    { atpaOn: true, globalEnabled: false, trackEnabled: true, expect: false },
    { atpaOn: true, globalEnabled: false, trackEnabled: false, expect: false },
    { atpaOn: false, globalEnabled: true, trackEnabled: true, expect: false },
  ];
  for (const gate of gates) {
    expect(atpaReadoutEnabled(gate)).toBe(gate.expect);
    expect(atpaInTrailDatablockReadout(live, "DAL123", gate) !== null).toBe(gate.expect);
    expect(
      atpaConeMileageReadout(live, "DAL123", { xNm: 4, yNm: 0 }, { xNm: 0, yNm: 0 }, gate) !== null,
    ).toBe(gate.expect);
  }

  const inTrailOff = { atpaOn: true, globalEnabled: false, trackEnabled: true };
  const mileageOn = { atpaOn: true, globalEnabled: true, trackEnabled: true };
  expect(atpaInTrailDatablockReadout(live, "DAL123", inTrailOff)).toBeNull();
  expect(
    atpaConeMileageReadout(live, "DAL123", { xNm: 4, yNm: 0 }, { xNm: 0, yNm: 0 }, mileageOn)?.text,
  ).toBe("3");
});

test("AC4 — cone mileage placement sits alongside the trailer→leader axis at requiredNm", () => {
  const placed = atpaConeMileagePlacement({
    trailing: { xNm: 4, yNm: 0 },
    leading: { xNm: 0, yNm: 0 },
    requiredNm: 2.5,
    status: "monitor",
  });
  expect(placed).not.toBeNull();
  expect(placed!.text).toBe("2.5");
  expect(placed!.status).toBe("monitor");
  expect(placed!.eastNm).toBeCloseTo(4 - 2.5 * ATPA_CONE_MILEAGE_ALONG_FRAC, 9);
  expect(placed!.northNm).toBeCloseTo(-ATPA_CONE_MILEAGE_OFFSET_NM, 9);
  expect(
    atpaConeMileagePlacement({
      trailing: { xNm: 0, yNm: 0 },
      leading: { xNm: 0, yNm: 0 },
      requiredNm: 3,
      status: "alert",
    }),
  ).toBeNull();
});

test("AC6 — module cites R07, Fig 38/39 two-decimal datablock, and tenths cone mileage", () => {
  const sources = import.meta.glob("./atpaReadout.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./atpaReadout.ts"] ?? "";
  expect(src).toMatch(/R07/);
  expect(src).toMatch(/Fig 38\/39/);
  expect(src).toMatch(/9\.88/);
  expect(src).toMatch(/two decimal/);
  expect(src).toMatch(/tenths/);
  expect(src).toMatch(/Intrail Distance/);
  expect(src).toMatch(/A\/TPA Mileage/);
  expect(src).toMatch(/caution yellow/);
  expect(src).toMatch(/orange/);
  expect(src).toMatch(/world\.alerts\.atpa/);
  expect(src).toMatch(/requiredNm/);
  expect(src).not.toMatch(/evaluateAtpa/);
});
