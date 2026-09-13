import { createElement } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { createAircraft, createWorld } from "@core";
import { loadPlayableScenario } from "@scenario";
import { createScopeView, handleScopeKeyDown, nmToScreen } from "@scope";
import { NullSpeechPort } from "@speech";
import { createApp } from "../../app/create-app";
import type { ScopeCanvasProps } from "../canvas/ScopeCanvas";

type CanvasHandlers = Pick<ScopeCanvasProps, "onCanvasClick">;

let canvasProps: CanvasHandlers = {};

vi.mock("../canvas/ScopeCanvas", () => ({
  ScopeCanvas: (props: ScopeCanvasProps) => {
    canvasProps = props;
    return null;
  },
}));

import { Shell } from "../shell";

function keyEvent(key: string) {
  return { key, preventDefault() {}, stopPropagation() {} };
}

function clickEvent(x: number, y: number) {
  return {
    clientX: x,
    clientY: y,
    currentTarget: {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }),
      focus() {},
      setPointerCapture() {},
    },
  };
}

beforeEach(() => {
  canvasProps = {};
  (globalThis as { document?: unknown }).document = {
    getElementById: () => ({ value: "" }),
  };
});

test("Shell forwards compact *P empty click to the real PPI callback", () => {
  const scenario = loadPlayableScenario("kdem");
  const world = createWorld();
  const app = createApp({ speech: new NullSpeechPort(), world });
  const scopeView = createScopeView(scenario.arpNm.xNm, scenario.arpNm.yNm);

  renderToStaticMarkup(createElement(Shell, { app, scenario, scopeView }));
  expect(canvasProps.onCanvasClick).toEqual(expect.any(Function));

  handleScopeKeyDown(keyEvent("*"), scopeView, "scope", world, 0);
  handleScopeKeyDown(keyEvent("P"), scopeView, "scope", world, 100);
  expect(scopeView.preview.buffer).toBe("*P");

  canvasProps.onCanvasClick!(clickEvent(700, 600) as unknown as ReactMouseEvent<HTMLCanvasElement>);
  expect(scopeView.systemLists.PREVIEW.x).toBeCloseTo(0.875);
  expect(scopeView.systemLists.PREVIEW.y).toBeCloseTo(0.75);
  expect(scopeView.preview.phase).toBe("idle");
});

test("Shell click callback preserves *P3 target slew and Enter tower toggle", () => {
  const scenario = loadPlayableScenario("kdem");
  const world = createWorld();
  const app = createApp({ speech: new NullSpeechPort(), world });
  const scopeView = createScopeView(scenario.arpNm.xNm, scenario.arpNm.yNm);

  renderToStaticMarkup(createElement(Shell, { app, scenario, scopeView }));
  handleScopeKeyDown(keyEvent("*"), scopeView, "scope", world, 0);
  handleScopeKeyDown(keyEvent("P"), scopeView, "scope", world, 100);
  handleScopeKeyDown(keyEvent("3"), scopeView, "scope", world, 200);
  // Empty callback click should complete relocation only when no target is hit.
  canvasProps.onCanvasClick!(clickEvent(20, 780) as unknown as ReactMouseEvent<HTMLCanvasElement>);
  expect(scopeView.systemLists.PREVIEW.x).toBeCloseTo(0.02);
  expect(scopeView.systemLists.PREVIEW.y).toBeCloseTo(0.28);

  handleScopeKeyDown(keyEvent("Escape"), scopeView, "scope", world, 250);
  handleScopeKeyDown(keyEvent("*"), scopeView, "scope", world, 300);
  handleScopeKeyDown(keyEvent("P"), scopeView, "scope", world, 400);
  handleScopeKeyDown(keyEvent("3"), scopeView, "scope", world, 500);
  expect(scopeView.preview.buffer).toBe("*P3");
  handleScopeKeyDown(keyEvent("Enter"), scopeView, "scope", world, 600);
  expect(scopeView.systemLists.TOWER_3.visible).toBe(true);
});

test("Shell rejects a slewed target with a blank ACID as NO FLIGHT", () => {
  const scenario = loadPlayableScenario("kdem");
  const target = createAircraft({
    id: "ac-blank-acid",
    callsign: "   ",
    xNm: scenario.arpNm.xNm,
    yNm: scenario.arpNm.yNm,
    headingDeg: 90,
    altitudeFt: 7000,
    speedKt: 210,
  });
  const world = createWorld({ aircraft: [target] });
  const app = createApp({ speech: new NullSpeechPort(), world });
  const scopeView = createScopeView(scenario.arpNm.xNm, scenario.arpNm.yNm);
  const rejectionWrites: Array<string | null> = [];
  let rejection = scopeView.preview.rejection;
  Object.defineProperty(scopeView.preview, "rejection", {
    configurable: true,
    get: () => rejection,
    set: (value: string | null) => {
      rejectionWrites.push(value);
      rejection = value;
    },
  });

  renderToStaticMarkup(createElement(Shell, { app, scenario, scopeView }));
  handleScopeKeyDown(keyEvent("*"), scopeView, "scope", world, 0);
  handleScopeKeyDown(keyEvent("F"), scopeView, "scope", world, 100);
  handleScopeKeyDown(keyEvent("P"), scopeView, "scope", world, 200);
  expect(scopeView.preview.buffer).toBe("*FP");
  const targetPoint = nmToScreen(target.xNm, target.yNm, scopeView.camera, {
    widthPx: 800,
    heightPx: 800,
  });
  canvasProps.onCanvasClick!(
    clickEvent(targetPoint.x, targetPoint.y) as unknown as ReactMouseEvent<HTMLCanvasElement>,
  );

  expect(rejectionWrites).toContain("NO FLIGHT");
  expect(scopeView.preview.rejection).toBe("NO FLIGHT");
});
