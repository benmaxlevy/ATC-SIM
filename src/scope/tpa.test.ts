import { expect, test } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import { pxPerNm, type ScopeViewSize } from "./camera";
import { createScopeView, stepTpaRadius, toggleTpaOn } from "./scopeView";
import {
  DEFAULT_TPA_RADIUS_NM,
  DEFAULT_TPA_STATE,
  TPA_RADIUS_NM,
  aircraftForTpaRings,
  formatDcbTpaMiReadout,
  stepTpaRadiusNm,
  tpaScreenRadiusPx,
} from "./tpa";
import { syncTrackDisplays } from "./trackDisplay";

const VIEW: ScopeViewSize = { widthPx: 800, heightPx: 800 };

test("TPA screen radius matches camera scale; spinner is 2/3/5/10", () => {
  const view = createScopeView();
  expect(TPA_RADIUS_NM).toEqual([2, 3, 5, 10]);
  expect(DEFAULT_TPA_RADIUS_NM).toBe(5);
  expect(DEFAULT_TPA_STATE).toEqual({ on: false, radiusNm: 5 });
  expect(tpaScreenRadiusPx(3, view.camera, VIEW)).toBeCloseTo(3 * pxPerNm(view.camera, VIEW), 6);
  expect(stepTpaRadiusNm(5, -1)).toBe(3);
  stepTpaRadius(view, -1);
  expect(view.tpa.radiusNm).toBe(3);
  expect(formatDcbTpaMiReadout(view.tpa.radiusNm)).toBe("3");
  toggleTpaOn(view);
  expect(view.tpa.on).toBe(true);
});

test("with no selection, TPA rings owned tracks only", () => {
  const view = createScopeView();
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123", xNm: 0, yNm: 0 });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL45", xNm: 8, yNm: 0 });
  const world = createWorld({ aircraft: [dal, aal], selectedAircraftId: null });
  syncTrackDisplays(view.tracks, world);
  view.tracks.get(dal.id)!.ownership = "owned";
  expect(
    aircraftForTpaRings(true, world.selectedAircraftId, world.aircraft, view.tracks).map(
      (ac) => ac.id,
    ),
  ).toEqual([dal.id]);
});
