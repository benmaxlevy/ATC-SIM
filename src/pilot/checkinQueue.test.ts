import {
  INSTRUCTION_TYPES,
  SessionLog,
  SIM_DT_S,
  acceptInboundHandoff,
  createAircraft,
  createWorld,
  offerInboundHandoff,
  stepWorld,
  type Aircraft,
  type World,
} from "@core";
import { applyIntent } from "./applyIntent";
import { expect, test, vi } from "vitest";
import { formatReadback } from "./readback";
import {
  CHECKIN_IDLE_GAP_MS,
  CHECKIN_STAGGER_MAX_MS,
  CHECKIN_STAGGER_MIN_MS,
  CHECKIN_STAGGER_QUANT_MS,
  DEPARTURE_CHECKIN_STAGGER_MAX_MS,
  DEPARTURE_CHECKIN_STAGGER_MIN_MS,
  CheckInQueue,
  createCheckInQueue,
  formatCheckIn,
  isSidDeparture,
  isStarViaArrival,
  starSpokenName,
  type CheckInRadio,
} from "./checkinQueue";

const GOLDEN =
  "Approach, Delta 123, descending via DEMO ONE arrival through one-one thousand (11000)";

function dem1Catalog(): NonNullable<World["catalog"]> {
  return {
    airportId: "KDEM",
    navaids: [],
    fixes: [],
    stars: [{ id: "DEM1", name: "DEMO ONE" }],
    approaches: [],
    sids: [{ id: "BAY1", name: "BAY ONE DEPARTURE", common: [] }],
  };
}

function viaArrival(callsign: string, id = `ac-${callsign.toLowerCase()}`): Aircraft {
  const ac = createAircraft({
    id,
    callsign,
    xNm: 18.5,
    yNm: 13.5,
    headingDeg: 225,
    altitudeFt: 11000,
    speedKt: 250,
  });
  ac.intent.lateral = {
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
  };
  ac.intent.vertical = { type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" };
  return ac;
}

function downwind(callsign: string): Aircraft {
  return createAircraft({
    id: `ac-${callsign.toLowerCase()}`,
    callsign,
    xNm: 8,
    yNm: 10,
    headingDeg: 100,
    altitudeFt: 6000,
    speedKt: 210,
  });
}

function silentRadio(plays: string[] = []): CheckInRadio {
  return {
    isBusy: () => false,
    async play(text) {
      plays.push(text);
    },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

test("AC3 — PROCEDURE+VIA_STAR past due with idle radio delivers one check-in", () => {
  const dal = viaArrival("DAL123");
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [dal],
    catalog: dem1Catalog(),
    sessionLog: log,
  });
  const queue = createCheckInQueue({ seed: 1 });
  queue.scheduleFromWorld(world, 0);
  expect(queue.scheduled()).toHaveLength(1);

  while (world.simTimeMs < CHECKIN_STAGGER_MAX_MS + SIM_DT_S * 1000) {
    stepWorld(world, SIM_DT_S);
  }
  let status: string | null = null;
  queue.drain({
    world,
    log,
    radio: silentRadio(),
    setStatus: (text) => {
      status = text;
    },
    nowWallMs: () => 1_000,
  });
  const events = log.byType("radio.checkin");
  expect(events).toHaveLength(1);
  expect(events[0]?.callsign).toBe("DAL123");
  expect(events[0]?.starId).toBe("DEM1");
  expect(events[0]?.starName).toBe("DEMO ONE");
  expect(events[0]?.altitudeFt).toBe(dal.altitudeFt);
  expect(events[0]?.text).toBe(GOLDEN);
  expect(status).toBe(GOLDEN);
});

test("AC4 — heading that cancels VIA before due skips check-in", () => {
  const dal = viaArrival("DAL123");
  const log = new SessionLog();
  const world = createWorld({ aircraft: [dal], catalog: dem1Catalog(), sessionLog: log });
  const queue = createCheckInQueue({ seed: 1 });
  queue.scheduleFromWorld(world, 0);
  applyIntent(dal, [{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }], 0);
  world.simTimeMs = CHECKIN_STAGGER_MAX_MS + 1000;
  const plays: string[] = [];
  let status: string | null = null;
  queue.drain({
    world,
    log,
    radio: silentRadio(plays),
    setStatus: (text) => {
      status = text;
    },
    nowWallMs: () => 1,
  });
  expect(log.byType("radio.checkin")).toHaveLength(0);
  expect(plays).toEqual([]);
  expect(status).toBeNull();
  expect(queue.scheduled()[0]?.state).toBe("skipped");
});

test("AC5 — no second check-in after done; vectors before due skips", () => {
  const dal = viaArrival("DAL123");
  const log = new SessionLog();
  const world = createWorld({ aircraft: [dal], catalog: dem1Catalog(), sessionLog: log });
  const queue = createCheckInQueue({ seed: 1 });
  queue.scheduleFromWorld(world, 0);
  world.simTimeMs = CHECKIN_STAGGER_MAX_MS + 1000;
  queue.drain({
    world,
    log,
    radio: silentRadio(),
    setStatus: () => {},
    nowWallMs: () => 1,
  });
  expect(log.byType("radio.checkin")).toHaveLength(1);
  applyIntent(dal, [{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }], world.simTimeMs);
  dal.intent.lateral = {
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: ["NEMAX", "NELBO", "NJOIN", "MERGE"],
  };
  dal.intent.vertical = { type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" };
  world.simTimeMs += 10_000;
  queue.drain({
    world,
    log,
    radio: silentRadio(),
    setStatus: () => {},
    nowWallMs: () => 2,
  });
  expect(log.byType("radio.checkin")).toHaveLength(1);

  const other = viaArrival("AAL45");
  const vectorsLog = new SessionLog();
  const vectorsWorld = createWorld({
    aircraft: [other],
    catalog: dem1Catalog(),
    sessionLog: vectorsLog,
  });
  const vectorsQueue = createCheckInQueue({ seed: 1 });
  vectorsQueue.scheduleFromWorld(vectorsWorld, 0);
  vectorsLog.append({
    type: "nav.star.vectors",
    atSimMs: 100,
    atWallMs: 1,
    callsign: "AAL45",
    starId: "DEM1",
  });
  vectorsWorld.simTimeMs = CHECKIN_STAGGER_MAX_MS + 1000;
  vectorsQueue.drain({
    world: vectorsWorld,
    log: vectorsLog,
    radio: silentRadio(),
    setStatus: () => {},
    nowWallMs: () => 1,
  });
  expect(vectorsLog.byType("radio.checkin")).toHaveLength(0);
});

test("AC6 — six STAR+VIA staggers are in range, 50 ms quantized, no Math.random", () => {
  const aircraft = ["DAL1", "DAL2", "DAL3", "DAL4", "DAL5", "DAL6"].map((cs) => viaArrival(cs));
  const world = createWorld({ aircraft, catalog: dem1Catalog() });
  const queue = createCheckInQueue({ seed: 7 });
  queue.scheduleFromWorld(world, 0);
  expect(queue.scheduled()).toHaveLength(6);
  for (const entry of queue.scheduled()) {
    expect(entry.staggerMs).toBeGreaterThanOrEqual(CHECKIN_STAGGER_MIN_MS);
    expect(entry.staggerMs).toBeLessThanOrEqual(CHECKIN_STAGGER_MAX_MS);
    expect(entry.staggerMs % CHECKIN_STAGGER_QUANT_MS).toBe(0);
    expect(entry.dueSimMs).toBe(entry.staggerMs);
  }
  const again = createCheckInQueue({ seed: 7 });
  again.scheduleFromWorld(world, 0);
  expect(again.scheduled().map((entry) => entry.staggerMs)).toEqual(
    queue.scheduled().map((entry) => entry.staggerMs),
  );
  const sources = import.meta.glob("./checkinQueue.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  expect(sources["./checkinQueue.ts"]).not.toMatch(/Math\.random\s*\(/);
});

test("AC7 — second check-in waits for first play plus 500 ms sim; controller busy blocks", async () => {
  const dal = viaArrival("DAL123");
  const aal = viaArrival("AAL45");
  const log = new SessionLog();
  const world = createWorld({ aircraft: [dal, aal], catalog: dem1Catalog(), sessionLog: log });
  const queue = createCheckInQueue({ seed: 1 });
  queue.scheduleFromWorld(world, 0);
  world.simTimeMs = CHECKIN_STAGGER_MAX_MS + 1000;

  let releaseFirst: (() => void) | undefined;
  let started = 0;
  let playing = false;
  const radio: CheckInRadio = {
    isBusy: () => playing,
    play() {
      started += 1;
      playing = true;
      return new Promise<void>((resolve) => {
        releaseFirst = resolve;
      }).then(() => {
        playing = false;
      });
    },
  };
  const drain = (): void => {
    queue.drain({
      world,
      log,
      radio,
      setStatus: () => {},
      nowWallMs: () => 1,
    });
  };

  drain();
  await flush();
  expect(started).toBe(1);
  drain();
  expect(started).toBe(1);

  releaseFirst?.();
  await flush();
  drain();
  expect(started).toBe(1);
  world.simTimeMs += CHECKIN_IDLE_GAP_MS - 50;
  drain();
  expect(started).toBe(1);
  world.simTimeMs += 50;
  await flush();
  drain();
  await flush();
  expect(started).toBe(2);

  const busyWorld = createWorld({
    aircraft: [viaArrival("UAL1")],
    catalog: dem1Catalog(),
    sessionLog: new SessionLog(),
  });
  const busyQueue = createCheckInQueue({ seed: 1 });
  busyQueue.scheduleFromWorld(busyWorld, 0);
  busyWorld.simTimeMs = CHECKIN_STAGGER_MAX_MS + 1000;
  const busyPlay = vi.fn();
  busyQueue.drain({
    world: busyWorld,
    log: busyWorld.sessionLog!,
    radio: { isBusy: () => true, play: busyPlay },
    setStatus: () => {},
    nowWallMs: () => 1,
  });
  expect(busyPlay).not.toHaveBeenCalled();
  expect(busyWorld.sessionLog!.byType("radio.checkin")).toHaveLength(0);
});

test("AC8 — null/silent play still sets status and logs without throwing", () => {
  const dal = viaArrival("DAL123");
  const log = new SessionLog();
  const world = createWorld({ aircraft: [dal], catalog: dem1Catalog(), sessionLog: log });
  const queue = createCheckInQueue({ seed: 1 });
  queue.scheduleFromWorld(world, 0);
  world.simTimeMs = CHECKIN_STAGGER_MAX_MS + 1000;
  let status: string | null = null;
  expect(() => {
    queue.drain({
      world,
      log,
      radio: {
        isBusy: () => false,
        play() {
          return Promise.reject(new Error("tts down"));
        },
      },
      setStatus: (text) => {
        status = text;
      },
      nowWallMs: () => 1,
    });
  }).not.toThrow();
  expect(status).toBe(GOLDEN);
  expect(log.byType("radio.checkin")).toHaveLength(1);
});

test("AC9 — downwind bench without VIA never schedules a check-in", () => {
  const ac = downwind("DAL200");
  const log = new SessionLog();
  const world = createWorld({ aircraft: [ac], catalog: dem1Catalog(), sessionLog: log });
  const queue = createCheckInQueue({ seed: 1 });
  queue.scheduleFromWorld(world, 0);
  expect(queue.scheduled()).toHaveLength(0);
  while (world.simTimeMs < 10_000) {
    stepWorld(world, SIM_DT_S);
  }
  queue.drain({
    world,
    log,
    radio: silentRadio(),
    setStatus: () => {},
    nowWallMs: () => 1,
  });
  expect(log.byType("radio.checkin")).toHaveLength(0);
});

test("T04-17 AC3 — inbound pending holds check-in until accept, then one fires", () => {
  const dal = viaArrival("DAL123");
  const log = new SessionLog();
  const world = createWorld({ aircraft: [dal], catalog: dem1Catalog(), sessionLog: log });
  offerInboundHandoff(world, dal);
  const queue = createCheckInQueue({ seed: 1 });
  queue.scheduleFromWorld(world, 0);
  world.simTimeMs = CHECKIN_STAGGER_MAX_MS + 1000;
  const plays: string[] = [];
  let status: string | null = null;
  queue.drain({
    world,
    log,
    radio: silentRadio(plays),
    setStatus: (text) => {
      status = text;
    },
    nowWallMs: () => 1,
  });
  expect(log.byType("radio.checkin")).toHaveLength(0);
  expect(plays).toEqual([]);
  expect(status).toBeNull();
  expect(queue.scheduled()[0]?.state).toBe("pending");

  expect(acceptInboundHandoff(world, dal.id)).toBe(true);
  queue.drain({
    world,
    log,
    radio: silentRadio(plays),
    setStatus: (text) => {
      status = text;
    },
    nowWallMs: () => 2,
  });
  expect(log.byType("radio.checkin")).toHaveLength(1);
  expect(log.byType("radio.checkin")[0]?.callsign).toBe("DAL123");
  expect(status).toBe(GOLDEN);
  expect(plays).toEqual([GOLDEN]);

  queue.drain({
    world,
    log,
    radio: silentRadio(plays),
    setStatus: () => {},
    nowWallMs: () => 3,
  });
  expect(log.byType("radio.checkin")).toHaveLength(1);
});

test("T04-17 AC3 — heading after accept before due still skips check-in", () => {
  const dal = viaArrival("DAL123");
  const log = new SessionLog();
  const world = createWorld({ aircraft: [dal], catalog: dem1Catalog(), sessionLog: log });
  offerInboundHandoff(world, dal);
  const queue = createCheckInQueue({ seed: 1 });
  queue.scheduleFromWorld(world, 0);
  expect(acceptInboundHandoff(world, dal.id)).toBe(true);
  applyIntent(dal, [{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }], 0);
  world.simTimeMs = CHECKIN_STAGGER_MAX_MS + 1000;
  const plays: string[] = [];
  queue.drain({
    world,
    log,
    radio: silentRadio(plays),
    setStatus: () => {},
    nowWallMs: () => 1,
  });
  expect(log.byType("radio.checkin")).toHaveLength(0);
  expect(plays).toEqual([]);
  expect(queue.scheduled()[0]?.state).toBe("skipped");
});

test("AC10 — parse and scope do not import formatCheckIn or emit radio.checkin", () => {
  const parse = import.meta.glob("../parse/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const scope = import.meta.glob("../scope/**/*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  for (const [path, src] of Object.entries({ ...parse, ...scope })) {
    if (path.includes(".test.")) {
      continue;
    }
    expect(src, path).not.toMatch(/formatCheckIn/);
    expect(src, path).not.toMatch(/radio\.checkin/);
  }
});

test("CheckInQueue is constructible via class or factory", () => {
  expect(new CheckInQueue({ seed: 1 }).scheduled()).toEqual([]);
  expect(createCheckInQueue().scheduled()).toEqual([]);
});

test("AC1 — formatCheckIn golden string for DAL123 / DEMO ONE / 11000", () => {
  const text = formatCheckIn({
    callsign: "DAL123",
    starName: "DEMO ONE",
    altitudeFt: 11000,
  });
  expect(text).toBe(GOLDEN);
});

test("AC2 — catalog lookup speaks DEMO ONE and never the coded id DEM1", () => {
  const starName = starSpokenName({ stars: [{ id: "DEM1", name: "DEMO ONE" }] }, "DEM1");
  expect(starName).toBe("DEMO ONE");
  const text = formatCheckIn({
    callsign: "DAL123",
    starName,
    altitudeFt: 11000,
  });
  expect(text).toContain("DEMO ONE");
  expect(text.toLowerCase()).toContain("demo one");
  expect(text).not.toContain("DEM1");
  expect(text.toLowerCase()).not.toContain("dem1");
});

test("3000 ft is through three thousand (3000)", () => {
  const text = formatCheckIn({
    callsign: "DAL123",
    starName: "DEMO ONE",
    altitudeFt: 3000,
  });
  expect(text).toContain("through three thousand (3000)");
});

test("18000 ft check-in uses FL 180", () => {
  const text = formatCheckIn({
    callsign: "DAL123",
    starName: "DEMO ONE",
    altitudeFt: 18000,
  });
  expect(text).toContain("through FL 180");
  expect(text).not.toContain("feet");
});

test("AC11 — formatter comments analog AIM/7110.65 vs trainer delta", async () => {
  const sources = import.meta.glob("./checkinQueue.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./checkinQueue.ts"];
  expect(src).toBeDefined();
  expect(src).toMatch(/AIM initial contact/i);
  expect(src).toMatch(/descend-via/i);
  expect(src).toMatch(/Trainer delta/i);
  expect(src).toMatch(/through/);
  expect(src).not.toMatch(/from\s+["']\.\/readback["']/);
  expect(src).not.toMatch(/formatReadback\s*\(/);
});

test("isStarViaArrival requires PROCEDURE and VIA_STAR with the same starId", () => {
  const ac = createAircraft({
    callsign: "DAL123",
    xNm: 18,
    yNm: 13,
    headingDeg: 225,
    altitudeFt: 11000,
    speedKt: 250,
  });
  expect(isStarViaArrival(ac)).toBe(false);
  ac.intent.lateral = {
    type: "PROCEDURE",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: ["NEMAX"],
  };
  expect(isStarViaArrival(ac)).toBe(false);
  ac.intent.vertical = { type: "VIA_STAR", starId: "DEM1", sense: "DESCEND" };
  expect(isStarViaArrival(ac)).toBe(true);
  ac.intent.vertical = { type: "VIA_STAR", starId: "OTHER", sense: "DESCEND" };
  expect(isStarViaArrival(ac)).toBe(false);
});

test("AC10 — DESCEND_VIA command readback is unchanged and not a check-in", () => {
  expect(
    formatReadback({
      callsign: "DAL123",
      instructions: [{ type: "DESCEND_VIA", procedureId: "DEM1" }],
      aircraft: { headingDeg: 225, altitudeFt: 11000 },
      procedureNames: { DEM1: "DEMO ONE" },
    }),
  ).toBe("Delta 123 descend via DEMO ONE");
  expect(INSTRUCTION_TYPES.includes("DESCEND_VIA")).toBe(true);
  expect((INSTRUCTION_TYPES as readonly string[]).includes("CHECKIN")).toBe(false);
});

function viaDeparture(callsign: string, id = `ac-${callsign.toLowerCase()}`): Aircraft {
  const ac = createAircraft({
    id,
    callsign,
    xNm: 0,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 1200,
    speedKt: 180,
  });
  ac.intent.lateral = {
    type: "PROCEDURE",
    sidId: "BAY1",
    starId: "BAY1",
    toFixIndex: 0,
    routeFixIds: ["BAYEE", "BAYNO", "NORMA"],
  };
  ac.intent.vertical = { type: "VIA_SID", sidId: "BAY1" };
  ac.intent.assignedAltitudeFt = 10000;
  return ac;
}

test("AC3 & AC4 — departure schedules check-in within 2-5s and SessionLog records transmission", () => {
  const dal = viaDeparture("DAL123");
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [dal],
    catalog: dem1Catalog(),
    sessionLog: log,
  });
  const queue = createCheckInQueue({ seed: 1 });
  queue.scheduleFromWorld(world, 0);
  expect(queue.scheduled()).toHaveLength(1);
  const entry = queue.scheduled()[0]!;
  expect(entry.kind).toBe("departure");
  expect(entry.staggerMs).toBeGreaterThanOrEqual(DEPARTURE_CHECKIN_STAGGER_MIN_MS);
  expect(entry.staggerMs).toBeLessThanOrEqual(DEPARTURE_CHECKIN_STAGGER_MAX_MS);

  while (world.simTimeMs < DEPARTURE_CHECKIN_STAGGER_MAX_MS + 1000) {
    world.simTimeMs += 1000;
  }
  let status: string | null = null;
  const plays: string[] = [];
  queue.drain({
    world,
    log,
    radio: {
      isBusy: () => false,
      play: (text) => {
        plays.push(text);
      },
    },
    setStatus: (text) => {
      status = text;
    },
    nowWallMs: () => 1_000,
  });
  const expectedText =
    "Departure, Delta 123, passing one thousand two hundred climbing via the BAY ONE departure";
  const events = log.byType("radio.checkin");
  expect(events).toHaveLength(1);
  expect(events[0]?.callsign).toBe("DAL123");
  expect(events[0]?.sidId).toBe("BAY1");
  expect(events[0]?.sidName).toBe("BAY ONE");
  expect(events[0]?.altitudeFt).toBe(1200);
  expect(events[0]?.text).toBe(expectedText);
  expect(status).toBe(expectedText);
  expect(plays).toEqual([expectedText]);
});

test("AC3 — simultaneous arrival and departure check-ins are sequenced without collision", async () => {
  const arr = viaArrival("AAL45");
  const dep = viaDeparture("DAL123");
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [arr, dep],
    catalog: dem1Catalog(),
    sessionLog: log,
  });
  const queue = createCheckInQueue({ seed: 1 });
  queue.scheduleFromWorld(world, 0);
  expect(queue.scheduled()).toHaveLength(2);

  world.simTimeMs = 10000;
  let releaseFirst: (() => void) | undefined;
  const plays: string[] = [];
  let playing = false;
  const radio: CheckInRadio = {
    isBusy: () => playing,
    play(text) {
      plays.push(text);
      playing = true;
      return new Promise<void>((resolve) => {
        releaseFirst = resolve;
      }).then(() => {
        playing = false;
      });
    },
  };

  const drain = (): void => {
    queue.drain({
      world,
      log,
      radio,
      setStatus: () => {},
      nowWallMs: () => 1,
    });
  };

  drain();
  await flush();
  expect(plays).toHaveLength(1);

  // Still playing first transmission: second check-in must NOT start
  drain();
  expect(plays).toHaveLength(1);

  // Finish first play: must wait for CHECKIN_IDLE_GAP_MS quiet gap
  releaseFirst?.();
  await flush();
  drain();
  expect(plays).toHaveLength(1);

  world.simTimeMs += CHECKIN_IDLE_GAP_MS - 50;
  drain();
  expect(plays).toHaveLength(1);

  world.simTimeMs += 50;
  drain();
  await flush();
  expect(plays).toHaveLength(2);
});

test("Departure stagger draws are 2000-5000 ms, 50ms quantized, deterministic", () => {
  const aircraft = ["DAL1", "DAL2", "DAL3", "DAL4", "DAL5", "DAL6"].map((cs) => viaDeparture(cs));
  const world = createWorld({ aircraft, catalog: dem1Catalog() });
  const queue = createCheckInQueue({ seed: 42 });
  queue.scheduleFromWorld(world, 0);
  expect(queue.scheduled()).toHaveLength(6);
  for (const entry of queue.scheduled()) {
    expect(entry.kind).toBe("departure");
    expect(entry.staggerMs).toBeGreaterThanOrEqual(DEPARTURE_CHECKIN_STAGGER_MIN_MS);
    expect(entry.staggerMs).toBeLessThanOrEqual(DEPARTURE_CHECKIN_STAGGER_MAX_MS);
    expect(entry.staggerMs % CHECKIN_STAGGER_QUANT_MS).toBe(0);
    expect(entry.dueSimMs).toBe(entry.staggerMs);
  }
  const again = createCheckInQueue({ seed: 42 });
  again.scheduleFromWorld(world, 0);
  expect(again.scheduled().map((entry) => entry.staggerMs)).toEqual(
    queue.scheduled().map((entry) => entry.staggerMs),
  );
});

test("Departure assigned altitude check-in when not climbing via SID", () => {
  const dal = viaDeparture("DAL123");
  dal.intent.vertical = { type: "ASSIGNED" };
  dal.intent.assignedAltitudeFt = 5000;
  const log = new SessionLog();
  const world = createWorld({
    aircraft: [dal],
    catalog: dem1Catalog(),
    sessionLog: log,
  });
  const queue = createCheckInQueue({ seed: 1 });
  queue.scheduleFromWorld(world, 0);
  world.simTimeMs = 6000;
  let status: string | null = null;
  queue.drain({
    world,
    log,
    radio: silentRadio(),
    setStatus: (text) => {
      status = text;
    },
    nowWallMs: () => 1,
  });
  expect(status).toBe("Departure, Delta 123, leaving one thousand two hundred for five thousand");
});

test("isSidDeparture identifies VIA_SID and lateral PROCEDURE with sidId", () => {
  const ac = createAircraft({
    callsign: "DAL123",
    xNm: 0,
    yNm: 0,
    headingDeg: 270,
    altitudeFt: 1200,
    speedKt: 180,
  });
  expect(isSidDeparture(ac)).toBe(false);
  ac.intent.lateral = {
    type: "PROCEDURE",
    sidId: "DEM1",
    starId: "DEM1",
    toFixIndex: 0,
    routeFixIds: ["MISSD"],
  };
  expect(isSidDeparture(ac)).toBe(true);
  ac.intent.lateral = undefined;
  ac.intent.vertical = { type: "VIA_SID", sidId: "DEM1" };
  expect(isSidDeparture(ac)).toBe(true);
});
