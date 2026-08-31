/**
 * T02-67 UI acceptance — Tab isolation between Preview Area and radio line.
 *
 * Chrome visual Tab walk is skip-with-reason: this worker has no visual operator.
 * Do not invent a visual pass. Same pattern as dcbAddendumAcceptance.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { createWorld, makeTestAircraft } from "@core";
import {
  PpiPlaceholder,
  PpiPlaceholderId,
  RADIO_COMMAND_LINE_ID,
  createScopeView,
  cycleScopeRadioFocus,
  handleScopeKeyDown,
  syncTrackDisplays,
} from "@scope";
import { COMMAND_LINE_INPUT_ID, CommandLine } from "./command-line";

function keyEvent(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

function leftoverKeys(
  keys: string[],
  view: ReturnType<typeof createScopeView>,
  world: ReturnType<typeof createWorld>,
  focus: "scope" | "radio",
): string {
  let leftover = "";
  let now = 0;
  for (const key of keys) {
    const event = keyEvent(key);
    if (!handleScopeKeyDown(event, view, focus, world, now) && key.length === 1) {
      leftover += key;
    }
    now += 100;
  }
  return leftover;
}

test.skip("AC3 — Chrome visual Tab isolation walk (manual)", () => {
  // skip-with-reason: this worker has no visual operator. Do not invent a visual pass.
});

test("AC3 — command-line and PPI ids; Tab consumes and calls cycleFocus", () => {
  expect(COMMAND_LINE_INPUT_ID).toBe("command-line-input");
  expect(RADIO_COMMAND_LINE_ID).toBe(COMMAND_LINE_INPUT_ID);
  expect(PpiPlaceholderId).toBe("ppi-placeholder");

  const radioHtml = renderToStaticMarkup(
    createElement(CommandLine, { readback: "", onSubmit: () => undefined }),
  );
  expect(radioHtml).toContain(`id="${COMMAND_LINE_INPUT_ID}"`);

  const ppiHtml = renderToStaticMarkup(createElement(PpiPlaceholder));
  expect(ppiHtml).toContain(`id="${PpiPlaceholderId}"`);

  const view = createScopeView();
  const cycleFocus = vi.fn();
  const scopeTab = keyEvent("Tab");
  expect(handleScopeKeyDown(scopeTab, view, "scope", undefined, 0, { cycleFocus })).toBe(true);
  expect(scopeTab.preventDefault).toHaveBeenCalled();
  expect(scopeTab.stopPropagation).toHaveBeenCalled();
  expect(cycleFocus).toHaveBeenCalledTimes(1);
  expect(view.preview.phase).toBe("idle");
  expect(view.preview.buffer).toBe("");

  const radioTab = keyEvent("Tab");
  expect(handleScopeKeyDown(radioTab, view, "radio", undefined, 1, { cycleFocus })).toBe(true);
  expect(cycleFocus).toHaveBeenCalledTimes(2);

  expect(typeof cycleScopeRadioFocus).toBe("function");
});

test("AC3 — radio-focus typing does not mutate preview; leftover would go to the input", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  const leftover = leftoverKeys(["*", "T", "D", "A", "L", "1", "2", "3"], view, world, "radio");
  expect(leftover).toBe("*TDAL123");
  expect(view.preview.phase).toBe("idle");
  expect(view.preview.buffer).toBe("");
  expect(view.systemLists.TAB.visible).toBe(false);
});

test("AC3 — scope-focus * + / alnum never leftover for the radio line", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const view = createScopeView();
  syncTrackDisplays(view.tracks, world);

  expect(leftoverKeys(["*", "T", "Enter"], view, world, "scope")).toBe("");
  expect(view.systemLists.TAB.visible).toBe(true);

  const plus = createScopeView();
  syncTrackDisplays(plus.tracks, world);
  expect(leftoverKeys(["+", "D", "A", "L"], plus, world, "scope")).toBe("");
  expect(plus.preview.phase).toBe("entry");
  expect(plus.preview.buffer.startsWith("+")).toBe(true);

  const slash = createScopeView();
  syncTrackDisplays(slash.tracks, world);
  expect(leftoverKeys(["/"], slash, world, "scope")).toBe("");
  expect(slash.preview.buffer).toBe("/");
});

test("T02-71 — radio leftover *WX1 does not latch WX; scope *WX 1 is not leftover", () => {
  const dal = makeTestAircraft({ id: "ac-dal", callsign: "DAL123" });
  const world = createWorld({ aircraft: [dal] });
  const radio = createScopeView();
  syncTrackDisplays(radio.tracks, world);
  expect(leftoverKeys(["*", "W", "X", "1"], radio, world, "radio")).toBe("*WX1");
  expect(radio.wxLevels).toEqual([false, false, false, false, false, false]);
  expect(radio.preview.phase).toBe("idle");

  const scope = createScopeView();
  syncTrackDisplays(scope.tracks, world);
  expect(leftoverKeys(["*", "W", "X", "1", "Enter"], scope, world, "scope")).toBe("");
  expect(scope.wxLevels).toEqual([true, false, false, false, false, false]);
});
