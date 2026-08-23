import {
  SessionLog,
  SIM_DT_S,
  createAircraft,
  createWorld,
  stepWorld,
  type Aircraft,
  type World,
} from "@core";
import { applyIntent } from "./applyIntent";
import { expect, test, vi } from "vitest";
import {
  CHECKIN_IDLE_GAP_MS,
  CHECKIN_STAGGER_MAX_MS,
  CHECKIN_STAGGER_MIN_MS,
  CHECKIN_STAGGER_QUANT_MS,
  CheckInQueue,
  createCheckInQueue,
  type CheckInRadio,
} from "./checkinQueue";

const GOLDEN =
  "approach, delta one two three, descending via DEMO ONE arrival through one one thousand feet";

function dem1Catalog(): NonNullable<World["catalog"]> {
  return {
    airportId: "KDEM",
    navaids: [],
    fixes: [],
    stars: [{ id: "DEM1", name: "DEMO ONE" }],
    approaches: [],
    sids: [],
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
  expect(events[0]?.text.toLowerCase()).toBe(
    "approach, delta one two three, descending via demo one arrival through one one thousand feet",
  );
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
