import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

// Generated KATL regional pack files are absent from the repo checkout, so the
// committed katl inventory entries load without `regional` here. Attach a
// synthetic regional facility to katl entries so the VFR density UI path
// renders; all other @scenario behavior passes through untouched.
vi.mock("@scenario", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@scenario")>();
  const regional = actual.parseRegionalPack(
    {
      schemaVersion: 1,
      centerAirportId: "KSYN",
      radiusNm: 40,
      source: { families: ["CIFP", "NASR_APT"] },
      files: { airports: "regional-airports.json", airspace: "regional-airspace.json" },
    },
    [
      {
        icao: "KSYN",
        name: "SYNTHETIC CENTER",
        arp: { latDeg: 33.0, lonDeg: -84.0 },
        fieldElevFt: 1000,
        magVarDeg: 0,
        publicUse: true,
        towered: true,
        eligible: true,
        runways: [
          {
            id: "27",
            threshold: { latDeg: 33.0, lonDeg: -83.98 },
            headingTrueDeg: 270,
            headingMagDeg: 270,
            lengthFt: 9000,
          },
        ],
        hasPublishedApproaches: true,
      },
    ],
    [
      {
        id: "SYNTH_BRAVO",
        name: "SYNTHETIC BRAVO",
        type: "CONTROLLED",
        class: "B",
        centerAirportId: "KSYN",
        lowerLimit: { altitudeFt: 0, unit: "GND", reference: "SURFACE", rawAltitude: "SFC" },
        upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
        segments: [
          {
            sequence: 1,
            boundaryVia: "C",
            boundaryViaType: "CIRCLE",
            position: { latDeg: 33.0, lonDeg: -84.0 },
            arcOrigin: { latDeg: 33.0, lonDeg: -84.0 },
            arcDistanceNm: 5,
          },
        ],
      },
    ],
    { latDeg: 33.0, lonDeg: -84.0 },
  );
  return {
    ...actual,
    loadPlayableScenario: (id?: string | null) => {
      const scenario = actual.loadPlayableScenario(id);
      if (scenario.icao === "KATL") {
        return { ...scenario, regional };
      }
      return scenario;
    },
  };
});

import {
  applyVfrDensityPreset,
  loadPlayableScenario,
  type SessionSetup as SessionSetupType,
} from "@scenario";
import { SessionSetup } from "../session-setup";

function render(initial: SessionSetupType): string {
  return renderToStaticMarkup(
    createElement(SessionSetup, {
      open: true,
      initial,
      onCancel: () => {},
      onApply: () => {},
    }),
  );
}

describe("T04-78 VFR density presets and tune dropdown", () => {
  test("Regional scenario renders density select with tune disclosure, no zone or mix inputs", () => {
    const katl = loadPlayableScenario("katl");
    const html = render({
      scenarioId: "katl",
      arrivalCount: 6,
      arrivalsPerHour: 14,
      departuresPerHour: 0,
      seed: 1,
      ...applyVfrDensityPreset("moderate", katl),
    });

    expect(html).toMatch(/<select[^>]*aria-label="VFR density"/);
    expect(html).toContain('value="off"');
    expect(html).toContain('value="light"');
    expect(html).toContain('value="moderate"');
    expect(html).toContain('value="busy"');
    expect(html).toContain("Tune VFR numbers");
    expect(html).toContain("scope-help-section");
    expect(html).toContain("Initial VFR count");
    expect(html).toContain("Target VFR population");
    expect(html).toContain("VFR entries/hour");
    expect(html).toContain("Maximum VFR population");
    expect(html).toContain("Flight following %");
    expect(html).toContain("IFR pickup %");
    expect(html).toContain("Request cap/hour");
    expect(html).toContain("IFR cancellation %");
    expect(html).not.toContain("Named zone weights");
    expect(html).not.toContain("Movement mix (%)");
    expect(html).not.toContain("Local movement %");
    expect(html).not.toContain("Airport-bound %");
  });

  test("Tuned numbers derive a Custom option; Off disables tune inputs", () => {
    const katl = loadPlayableScenario("katl");
    const moderate = applyVfrDensityPreset("moderate", katl);
    const customHtml = render({
      scenarioId: "katl",
      arrivalCount: 6,
      arrivalsPerHour: 14,
      departuresPerHour: 0,
      seed: 1,
      vfrTraffic: { ...moderate.vfrTraffic, entriesPerHour: 7 },
      vfrRequests: moderate.vfrRequests,
    });
    expect(customHtml).toContain("Custom (tuned)");

    const offHtml = render({
      scenarioId: "katl",
      arrivalCount: 6,
      arrivalsPerHour: 14,
      departuresPerHour: 0,
      seed: 1,
    });
    expect(offHtml).toMatch(/<select[^>]*aria-label="VFR density"/);
    expect(offHtml).not.toContain("Custom (tuned)");
    const disabledCount = (offHtml.match(/disabled=""/g) ?? []).length;
    expect(disabledCount).toBeGreaterThanOrEqual(8);
  });
});
