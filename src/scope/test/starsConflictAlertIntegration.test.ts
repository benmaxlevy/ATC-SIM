import { createWorld, makeTestAircraft, type CaAlert } from "@core";
import { NullSpeechPort } from "@speech";
import { loadPlayableScenario } from "@scenario";
import { expect, test } from "vitest";
import { createApp } from "../../app/create-app";
import {
  acknowledgeAlert,
  createTrackDisplayState,
  filterActiveCaAlerts,
  setCaPairInhibited,
} from "../trackDisplay";
import { getAlertEntries, hasActiveUninhibitedConflict } from "../systemLists";

function alert(a: string, b: string, areaTier: 1 | 2 | 3 | 4): CaAlert {
  return {
    callsignA: a,
    callsignB: b,
    severity: "alert",
    distNm: 1,
    deltaAltFt: 100,
    areaTier,
    conflictType: "active",
  };
}

test("kdem-ca is registered as a playable conflict-alert bench", () => {
  const scenario = loadPlayableScenario("kdem-ca");
  expect(scenario.name).toContain("Conflict Alert Bench");
  expect(scenario.arrivals).toHaveLength(6);
  expect(scenario.giTextLines.join(" ")).toContain("TYPE 4 / 3 / 2 / 1 PAIRS");
});

test("CA integration gates audio and AL rows by active unacknowledged uninhibited pairs", () => {
  const first = makeTestAircraft({ id: "a", callsign: "AAL100" });
  const second = makeTestAircraft({ id: "b", callsign: "DAL200" });
  const third = makeTestAircraft({ id: "c", callsign: "JBU300" });
  const world = createWorld({ aircraft: [first, second, third] });
  const state = createTrackDisplayState(new Map());
  const pairAB = alert("AAL100", "DAL200", 3);
  const pairBC = alert("DAL200", "JBU300", 2);
  world.alerts.ca = [pairAB, pairBC];

  expect(filterActiveCaAlerts(world.alerts.ca, world, state, { forTone: true })).toHaveLength(2);
  expect(getAlertEntries(world, state as never)).toEqual(["CA AAL100 DAL200", "CA DAL200 JBU300"]);

  acknowledgeAlert(state, "AAL100", "DAL200");
  expect(filterActiveCaAlerts(world.alerts.ca, world, state, { forTone: true })).toEqual([pairBC]);
  setCaPairInhibited(state, "DAL200", "JBU300", true);
  expect(filterActiveCaAlerts(world.alerts.ca, world, state, { forTone: true })).toEqual([]);

  const toneStates: boolean[] = [];
  const app = createApp({
    speech: new NullSpeechPort(),
    world,
    caAlertTone: {
      sync: (active) => toneStates.push(active),
      setVolume: () => undefined,
      dispose: () => undefined,
    },
  });
  app.afterPhysicsTick(hasActiveUninhibitedConflict(world, state as never));
  expect(toneStates).toEqual([false]);

  // A newly raised pair retriggers audio after the original pair was acked.
  world.alerts.ca = [pairAB, alert("AAL100", "JBU300", 1)];
  setCaPairInhibited(state, "DAL200", "JBU300", false);
  app.afterPhysicsTick(hasActiveUninhibitedConflict(world, state as never));
  expect(toneStates).toEqual([false, true]);
});
