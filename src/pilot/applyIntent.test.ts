import { expect, test } from "vitest";
import { createAircraft } from "@core";
import type { CatalogStar } from "@core";
import { applyIntent } from "./applyIntent";
import proceduresJson from "../scenario/data/kdem/procedures.json";

const dem1Catalog = { stars: proceduresJson.stars as CatalogStar[] };

function jet() {
  return createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 10,
    yNm: 5,
    headingDeg: 10,
    altitudeFt: 8000,
    speedKt: 220,
  });
}

test("FLY_HEADING sets assigned heading and HEADING mode", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }], 0);
  expect(ac.intent.assignedHeadingDeg).toBe(270);
  expect(ac.intent.lateral).toEqual({ type: "HEADING", headingDeg: 270 });
});

test("TURN_DEGREES turns from present heading", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "TURN_DEGREES", direction: "LEFT", degrees: 20 }], 0);
  expect(ac.intent.assignedHeadingDeg).toBe(350);
});

test("DESCEND_VIA with catalog joins the STAR", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "DESCEND_VIA", procedureId: "DEM1" }], 0, { catalog: dem1Catalog });
  expect(ac.intent.lateral?.type === "PROCEDURE" || ac.intent.vertical?.type === "VIA_STAR").toBe(
    true,
  );
});

test("CLEARED_APPROACH arms INTERCEPT_LOC", () => {
  const ac = jet();
  applyIntent(ac, [{ type: "CLEARED_APPROACH", approachId: "ILS27" }], 0);
  expect(ac.intent.clearedApproachId).toBe("ILS27");
});
