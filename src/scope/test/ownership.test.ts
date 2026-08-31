import { expect, test } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import {
  applyDropTrack,
  applyInitiateTrack,
  ownershipStubChar,
  trackPaintColor,
} from "../ownership";
import { PALETTE } from "../palette";
import {
  applyDropTrackToSelection,
  applyInitiateTrackToSelection,
  syncTrackDisplays,
} from "../trackDisplay";

test("F3 owns, F4 drops; stub is * then G", () => {
  expect(applyInitiateTrack("unowned")).toBe("owned");
  expect(applyDropTrack("owned")).toBe("unowned");
  expect(ownershipStubChar("unowned")).toBe("*");
  expect(ownershipStubChar("owned")).toBe("G");
});

test("F3 paints only the selected track owned", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const aal = makeTestAircraft({ id: "ac-aal", callsign: "AAL45" });
  const world = createWorld({ aircraft: [dal, aal] });
  const tracks = new Map();
  syncTrackDisplays(tracks, world);
  expect(trackPaintColor("unowned")).toBe(PALETTE.unowned);
  world.selectedAircraftId = dal.id;
  expect(applyInitiateTrackToSelection(tracks, world).applied).toBe(true);
  expect(tracks.get("ac-dal")!.ownership).toBe("owned");
  expect(tracks.get("ac-aal")!.ownership).toBe("unowned");
  expect(applyDropTrackToSelection(tracks, world).applied).toBe(true);
  expect(tracks.get("ac-dal")!.ownership).toBe("unowned");
});
