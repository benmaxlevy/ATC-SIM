import { expect, test } from "vitest";
import {
  DEMO_ONE_NORTH_FIX_IDS,
  SIM_DT_S,
  SessionLog,
  buildFixRegistry,
  createAircraft,
  createWorld,
  stepWorld,
} from "@core";
import type { CatalogStar, FixRegistrySource } from "@core";
import { formatReadback } from "./readback";
import { handleRadioText } from "./handleRadioText";
import fixesJson from "../scenario/data/kdem/fixes.json";
import ilsJson from "../scenario/data/kdem/ils.json";
import ndbsJson from "../scenario/data/kdem/ndbs.json";
import proceduresJson from "../scenario/data/kdem/procedures.json";
import vorsJson from "../scenario/data/kdem/vors.json";

function kdemSource(): FixRegistrySource {
  return {
    navaids: [...vorsJson.vors, ...ndbsJson.ndbs, ...ilsJson.components],
    fixes: fixesJson.fixes,
  };
}

function kdemStars(): readonly CatalogStar[] {
  return proceduresJson.stars as readonly CatalogStar[];
}

function worldOnDem1North() {
  const nemax = { xNm: 17, yNm: 12 };
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: nemax.xNm + 8,
    yNm: nemax.yNm,
    headingDeg: 270,
    altitudeFt: 11000,
    speedKt: 250,
  });
  dal.intent.lateral = {
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: [...DEMO_ONE_NORTH_FIX_IDS],
  };
  const world = createWorld({
    aircraft: [dal],
    fixRegistry: buildFixRegistry(kdemSource()),
    catalog: {
      airportId: "KDEM",
      navaids: [],
      fixes: [],
      stars: kdemStars(),
      approaches: [],
      sids: [],
    },
  });
  return { dal, world };
}

test("VIA DEM1 is accepted and arms VIA_STAR with DEMO ONE readback", async () => {
  const { dal, world } = worldOnDem1North();
  const beforeLateral = dal.intent.lateral;
  const result = await handleRadioText(world, "DAL123 VIA DEM1", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.vertical).toEqual({ type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" });
  expect(dal.intent.lateral).toEqual(beforeLateral);
  expect(result.readback.toLowerCase()).toContain("descend via demo one");
});

test("spoken descend via demo 1 is accepted as DEM1", async () => {
  const { dal, world } = worldOnDem1North();
  dal.callsign = "DAL200";
  const result = await handleRadioText(world, "Delta 200 descend via demo 1", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(result.reason).toBeUndefined();
  expect(dal.intent.vertical).toEqual({ type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" });
  expect(result.readback.toLowerCase()).toContain("descend via demo one");
});

test("AC5 — VIA NOPE is rejected with no vertical change", async () => {
  const { dal, world } = worldOnDem1North();
  const before = { ...dal.intent };
  const log = new SessionLog();
  const result = await handleRadioText(world, "DAL123 VIA NOPE", log);
  expect(result.accepted).toBe(false);
  expect(result.reason).toBe("UNKNOWN_PROCEDURE");
  expect(dal.intent).toEqual(before);
  expect(dal.intent.vertical).toBeUndefined();
  expect(result.readback.toLowerCase()).toContain("unknown procedure");
  expect(log.byType("command.rejected")).toHaveLength(1);
  expect(log.byType("command.accepted")).toHaveLength(0);
});

test("AC5 — X ZZZZ 30 is rejected with no vertical change", async () => {
  const { dal, world } = worldOnDem1North();
  dal.intent.lateral = { type: "DIRECT", fixId: "NEMAX" };
  const before = { ...dal.intent, lateral: { ...dal.intent.lateral } };
  const log = new SessionLog();
  const result = await handleRadioText(world, "DAL123 X ZZZZ 30", log);
  expect(result.accepted).toBe(false);
  expect(result.reason).toBe("UNKNOWN_FIX");
  expect(dal.intent.vertical).toBeUndefined();
  expect(dal.intent.cross).toBeUndefined();
  expect(dal.intent.lateral).toEqual(before.lateral);
  expect(log.byType("command.rejected")).toHaveLength(1);
});

test("CROSS without being on course is rejected", async () => {
  const { dal, world } = worldOnDem1North();
  dal.intent.lateral = { type: "HEADING", headingDeg: 270 };
  const result = await handleRadioText(world, "DAL123 X NEMAX 40", new SessionLog());
  expect(result.accepted).toBe(false);
  expect(result.reason).toBe("NOT_ON_COURSE");
  expect(dal.intent.cross).toBeUndefined();
  expect(result.readback.toLowerCase()).toContain("not on course to nemax");
});

test("AC4 — DCT NEMAX then X NEMAX 40 is at 4000 when sequenced", async () => {
  const registry = buildFixRegistry(kdemSource());
  const nemax = registry.require("NEMAX");
  const dal = createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: nemax.xNm + 16,
    yNm: nemax.yNm,
    headingDeg: 270,
    altitudeFt: 8000,
    speedKt: 220,
  });
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [dal],
    fixRegistry: registry,
    sessionLog: log,
    catalog: {
      airportId: "KDEM",
      navaids: [],
      fixes: [],
      stars: kdemStars(),
      approaches: [],
      sids: [],
    },
  });
  const direct = await handleRadioText(world, "DAL123 DCT NEMAX", log);
  expect(direct.accepted).toBe(true);
  const cross = await handleRadioText(world, "DAL123 X NEMAX 40", log);
  expect(cross.accepted).toBe(true);
  expect(dal.intent.cross).toEqual({
    fixId: "NEMAX",
    altitudeFt: 4000,
    restriction: "AT",
  });
  const steps = Math.round(400 / SIM_DT_S);
  let sequenced = false;
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, SIM_DT_S);
    if (log.byType("nav.direct.sequenced").some((event) => event.fixId === "NEMAX")) {
      sequenced = true;
      break;
    }
  }
  expect(sequenced).toBe(true);
  expect(Math.abs(dal.altitudeFt - 4000)).toBeLessThanOrEqual(200);
});

test("CROSS AT readback is cross NEMAX at 4000", () => {
  expect(
    formatReadback({
      callsign: "DAL123",
      instructions: [{ type: "CROSS", fixId: "NEMAX", altitudeFt: 4000, restriction: "AT" }],
      aircraft: { headingDeg: 270, altitudeFt: 8000 },
    }),
  ).toBe("Delta 123 cross NEMAX at four thousand (4000)");
});

test("DCT NELBO is lone DIRECT and sequences to present heading", async () => {
  const { dal, world } = worldOnDem1North();
  dal.intent.lateral = { type: "HEADING", headingDeg: 270 };
  const log = new SessionLog();
  world.sessionLog = log;
  const result = await handleRadioText(world, "DAL123 DCT NELBO", log);
  expect(result.accepted).toBe(true);
  expect(dal.intent.lateral).toEqual({ type: "DIRECT", fixId: "NELBO" });
  expect(dal.intent.vertical?.type === "VIA_STAR").toBe(false);
  const steps = Math.round(600 / SIM_DT_S);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, SIM_DT_S);
    if (log.byType("nav.direct.sequenced").some((event) => event.fixId === "NELBO")) {
      break;
    }
  }
  expect(log.byType("nav.direct.sequenced").map((event) => event.fixId)).toEqual(["NELBO"]);
  expect(log.byType("nav.star.vectors")).toHaveLength(0);
  expect(dal.intent.lateral?.type).toBe("HEADING");
});

test("DCT NELBO JOIN DEM1 joins remaining legs without VIA", async () => {
  const { dal, world } = worldOnDem1North();
  dal.intent.lateral = { type: "HEADING", headingDeg: 270 };
  const result = await handleRadioText(world, "DAL123 DCT NELBO JOIN DEM1", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.lateral).toEqual({
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 1,
    routeFixIds: [...DEMO_ONE_NORTH_FIX_IDS],
  });
  expect(dal.intent.vertical?.type === "VIA_STAR").toBe(false);
});

test("DCT NELBO VIA DEM1 joins the STAR and arms VIA", async () => {
  const { dal, world } = worldOnDem1North();
  dal.intent.lateral = { type: "HEADING", headingDeg: 270 };
  const result = await handleRadioText(world, "DAL123 DCT NELBO VIA DEM1", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.lateral?.type).toBe("PROCEDURE");
  expect(dal.intent.lateral).toMatchObject({ starId: "DEM1", toFixIndex: 1 });
  expect(dal.intent.vertical).toEqual({ type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" });
});

test("JOIN DEM1 off a heading joins laterally without VIA", async () => {
  const { dal, world } = worldOnDem1North();
  dal.intent.lateral = { type: "HEADING", headingDeg: 270 };
  const result = await handleRadioText(world, "DAL123 JOIN DEM1", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.lateral).toEqual({
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: [...DEMO_ONE_NORTH_FIX_IDS],
  });
  expect(dal.intent.vertical?.type === "VIA_STAR").toBe(false);
});

test("VIA DEM1 off a heading joins the nearest STAR transition and arms VIA", async () => {
  const { dal, world } = worldOnDem1North();
  dal.intent.lateral = { type: "HEADING", headingDeg: 270 };
  const result = await handleRadioText(world, "DAL123 VIA DEM1", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.vertical).toEqual({ type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" });
  expect(dal.intent.lateral).toEqual({
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: [...DEMO_ONE_NORTH_FIX_IDS],
  });
});

test("heading after VIA cancels VIA_STAR", async () => {
  const { dal, world } = worldOnDem1North();
  await handleRadioText(world, "DAL123 VIA DEM1", new SessionLog());
  expect(dal.intent.vertical?.type).toBe("VIA_STAR");
  const result = await handleRadioText(world, "DAL123 H090", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(dal.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(dal.intent.lateral).toEqual({ type: "HEADING", headingDeg: 90 });
});

test("pilot via tests are DOM-free", () => {
  expect(typeof document).toBe("undefined");
  expect(typeof window).toBe("undefined");
});
