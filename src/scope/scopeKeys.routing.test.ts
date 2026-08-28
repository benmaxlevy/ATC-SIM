import { expect, test, vi } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import { parseCommand } from "@parse";
import { handleScopeKeyDown, type ScopeFocus } from "./scopeKeys";
import { createScopeView } from "./scopeView";
import { syncTrackDisplays } from "./trackDisplay";

function keyEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

function routeKeys(
  keys: string[],
  view: ReturnType<typeof createScopeView>,
  world: ReturnType<typeof createWorld>,
  focus: ScopeFocus,
  parseCommandFn: (text: string) => unknown,
  nowMs = 10_000,
): string {
  let buffer = "";
  for (const key of keys) {
    const event = keyEvent(key);
    if (handleScopeKeyDown(event, view, focus, world, nowMs)) {
      continue;
    }
    if (key === "Enter") {
      parseCommandFn(buffer);
      buffer = "";
      continue;
    }
    if (key.length === 1) {
      buffer += key;
    }
  }
  return buffer;
}

test("AC6 — radio-focus PageUp/F3/F7/F8 mutate camera/PTL/history/ownership; parseCommand not called", () => {
  expect(parseCommand).toBeTypeOf("function");
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  world.selectedAircraftId = dal.id;
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const parseCommandSpy = vi.fn();

  expect(view.camera.rangeNm).toBe(20);
  expect(view.ptlOn).toBe(false);
  expect(view.historyEnabled).toBe(true);
  expect(view.tracks.get("ac-dal")!.ownership).toBe("unowned");

  const leftover = routeKeys(["PageUp", "F3", "F7", "F8"], view, world, "radio", parseCommandSpy);
  expect(leftover).toBe("");
  expect(view.camera.rangeNm).toBe(15);
  expect(view.tracks.get("ac-dal")!.ownership).toBe("owned");
  expect(view.ptlOn).toBe(true);
  expect(view.historyEnabled).toBe(false);
  expect(parseCommandSpy).not.toHaveBeenCalled();
});

test("AC4 — radio-focus L 0 9 0 Enter calls parseCommand; leaders unchanged", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const parseCommandSpy = vi.fn();

  const leftover = routeKeys(["L", "0", "9", "0", "Enter"], view, world, "radio", parseCommandSpy);
  expect(leftover).toBe("");
  expect(parseCommandSpy).toHaveBeenCalledTimes(1);
  expect(parseCommandSpy).toHaveBeenCalledWith("L090");
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(8);
  expect(view.pendingChord).toBeNull();
});

test("AC5 — scope-focus L then 6 changes leader; parseCommand spy call count 0", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const parseCommandSpy = vi.fn();

  const leftover = routeKeys(["L", "6"], view, world, "scope", parseCommandSpy);
  expect(leftover).toBe("");
  expect(view.tracks.get("ac-dal")!.leaderDir).toBe(6);
  expect(parseCommandSpy).toHaveBeenCalledTimes(0);
  expect(view.pendingChord).toBeNull();
});

test("AC6 — radio-focus PageUp does not add text to the command buffer and does change range", () => {
  const world = createWorld();
  const view = createScopeView();
  const parseCommandSpy = vi.fn();

  let buffer = "DAL123 ";
  for (const key of ["PageUp", "H", "2", "7", "0"]) {
    const event = keyEvent(key);
    if (handleScopeKeyDown(event, view, "radio", world)) {
      continue;
    }
    if (key.length === 1) {
      buffer += key;
    }
  }
  expect(buffer).toBe("DAL123 H270");
  expect(view.camera.rangeNm).toBe(15);
  expect(parseCommandSpy).not.toHaveBeenCalled();
});

test("AC4 — radio-focus * is not a slew chord; parseCommand still sees the character", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const parseCommandSpy = vi.fn();

  const leftover = routeKeys(["*", "J", "3"], view, world, "radio", parseCommandSpy);
  expect(leftover).toBe("*J3");
  expect(parseCommandSpy).not.toHaveBeenCalled();
  expect(view.starsChordEntry.phase).toBe("idle");
  expect(view.pendingChord).toBeNull();
});

test("AC5 — scope-focus * J 3 Enter consumes keys; parseCommand spy call count 0", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);
  const parseCommandSpy = vi.fn();

  const leftover = routeKeys(["*", "J", "3", "Enter"], view, world, "scope", parseCommandSpy);
  expect(leftover).toBe("");
  expect(parseCommandSpy).toHaveBeenCalledTimes(0);
  expect(view.starsChordEntry.phase).toBe("idle");
});

test("radio-focus B is not consumed; parseCommand still sees the character", () => {
  const world = createWorld();
  const view = createScopeView();
  const parseCommandSpy = vi.fn();

  const leftover = routeKeys(["B", "W", "A"], view, world, "radio", parseCommandSpy);
  expect(leftover).toBe("BWA");
  expect(parseCommandSpy).not.toHaveBeenCalled();
  expect(view.preview.phase).toBe("idle");
  expect(view.beaconSelectCodes).toEqual([]);
});

test("scope-focus B 4 5 Enter consumes keys; parseCommand spy call count 0", () => {
  const world = createWorld();
  const view = createScopeView();
  const parseCommandSpy = vi.fn();

  const leftover = routeKeys(["B", "4", "5", "Enter"], view, world, "scope", parseCommandSpy);
  expect(leftover).toBe("");
  expect(parseCommandSpy).toHaveBeenCalledTimes(0);
  expect(view.beaconSelectCodes).toEqual(["45"]);
  expect(view.preview.phase).toBe("idle");
});
