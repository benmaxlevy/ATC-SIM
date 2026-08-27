import { expect, test } from "vitest";
import { SIM_DT_S, stepWorld, type AtpaPair } from "@core";
import { loadPlayableScenario } from "./playableScenarios";
import { createWorldForSession } from "./spawn";

/**
 * The `?scenario=kdem-atpa` bench exists so ATPA can be exercised by hand:
 * one chain on the ILS 27 final that shows an alert, a warning, and monitor
 * cones on the first frame. Pin the statuses so a later geometry or minima
 * change cannot quietly flatten the bench into six monitor pairs.
 */
function benchPairs(): Map<string, AtpaPair> {
  const world = createWorldForSession(loadPlayableScenario("kdem-atpa"), null, 1);
  stepWorld(world, SIM_DT_S);
  return new Map(world.alerts.atpa.map((pair) => [pair.trailingCallsign, pair]));
}

test("kdem-atpa bench opens with an alert, a warning, and two monitor pairs", () => {
  const pairs = benchPairs();

  expect(pairs.get("AAL100")?.status).toBe("alert");
  expect(pairs.get("UAL300")?.status).toBe("warning");
  expect(pairs.get("SWA200")?.status).toBe("monitor");
  expect(pairs.get("JBU400")?.status).toBe("monitor");
});

test("kdem-atpa bench leaves the frontmost and the off-final track unpaired", () => {
  const pairs = benchPairs();

  expect(pairs.has("DAL500")).toBe(false);
  expect(pairs.has("NKS600")).toBe(false);
});

test("kdem-atpa bench keeps basic radar minima behind a heavy leader", () => {
  const pairs = benchPairs();

  // SWA200 trails the B744. Required stays the volume's basic 3 NM because the
  // pair straddles 10 DME, and no wake bump exists.
  const behindHeavy = pairs.get("SWA200");
  expect(behindHeavy?.leadingCallsign).toBe("UAL300");
  expect(behindHeavy?.requiredNm).toBe(3);

  // Both inside 10 DME drops to the volume's reduced 2.5 NM.
  expect(pairs.get("JBU400")?.requiredNm).toBe(2.5);
});
