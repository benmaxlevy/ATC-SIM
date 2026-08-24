import { expect, test } from "vitest";
import { RANGE_PRESETS_NM, stepRange } from "./camera";
import { createScopeView } from "./scopeView";
import {
  applyDcbShift,
  armDcbSpinner,
  closeDcbMenu,
  commitDcbSpinner,
  handleDcbEscape,
  idleDcbSpinner,
  openDcbMenu,
  stepDcbSpinner,
  toggleDcbMenu,
  type DcbMenu,
  type DcbMenuHost,
} from "./dcbMenu";

function host(menu: DcbMenu = "MAIN"): DcbMenuHost {
  return { dcbMenu: menu, dcbSpinner: idleDcbSpinner() };
}

test("AC1 — SHIFT swaps MAIN and AUX", () => {
  const h = host("MAIN");
  applyDcbShift(h);
  expect(h.dcbMenu).toBe("AUX");
  applyDcbShift(h);
  expect(h.dcbMenu).toBe("MAIN");
});

test("AC2 — DONE and Esc return a submenu to MAIN", () => {
  const h = host("MAIN");
  openDcbMenu(h, "MAPS");
  expect(h.dcbMenu).toBe("MAPS");
  closeDcbMenu(h);
  expect(h.dcbMenu).toBe("MAIN");

  toggleDcbMenu(h, "LDR");
  expect(h.dcbMenu).toBe("LDR");
  expect(handleDcbEscape(h)).toBe(true);
  expect(h.dcbMenu).toBe("MAIN");
  expect(handleDcbEscape(h)).toBe(false);
});

test("AC3 — spinner arm → step(+1/−1) → commit; Esc while armed disarms with no extra mutation", () => {
  const h = host();
  let value = 20;
  armDcbSpinner(h, "RANGE");
  expect(h.dcbSpinner.armed).toBe(true);
  expect(stepDcbSpinner(h, 1, (delta) => {
    value += delta * 10;
  })).toBe(true);
  expect(value).toBe(30);
  expect(stepDcbSpinner(h, -1, (delta) => {
    value += delta * 10;
  })).toBe(true);
  expect(value).toBe(20);
  commitDcbSpinner(h);
  expect(h.dcbSpinner.armed).toBe(false);
  expect(stepDcbSpinner(h, 1, (delta) => {
    value += delta * 10;
  })).toBe(false);
  expect(value).toBe(20);

  armDcbSpinner(h, "RANGE");
  expect(stepDcbSpinner(h, 1, (delta) => {
    value += delta * 10;
  })).toBe(true);
  expect(value).toBe(30);
  expect(handleDcbEscape(h)).toBe(true);
  expect(h.dcbSpinner.armed).toBe(false);
  expect(value).toBe(30);
  expect(handleDcbEscape(h)).toBe(false);
});

test("RANGE spinner steps the same 8 presets as stepRange", () => {
  expect(RANGE_PRESETS_NM).toEqual([5, 10, 15, 20, 30, 40, 50, 60]);
  const view = createScopeView();
  armDcbSpinner(view, "RANGE");
  expect(view.camera.rangeNm).toBe(20);
  stepDcbSpinner(view, 1, (delta) => stepRange(view.camera, delta));
  expect(view.camera.rangeNm).toBe(30);
  stepDcbSpinner(view, -1, (delta) => stepRange(view.camera, delta));
  expect(view.camera.rangeNm).toBe(20);
  const before = view.camera.rangeNm;
  expect(handleDcbEscape(view)).toBe(true);
  expect(view.camera.rangeNm).toBe(before);
  expect(view.dcbSpinner.armed).toBe(false);
});
