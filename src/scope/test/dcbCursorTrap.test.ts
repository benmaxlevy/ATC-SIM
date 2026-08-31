import { expect, test } from "vitest";
import {
  clampPointToRect,
  dcbCursorTrapKind,
  dcbTrapShouldBlockPointer,
  pointInTrapRect,
  type DcbTrapRect,
} from "../dcb/dcbCursorTrap";
import { armDcbSpinner, idleDcbSpinner, openDcbMenu, type DcbMenuHost } from "../dcb/dcbMenu";

function host(): DcbMenuHost {
  return { dcbMenu: "MAIN", dcbSpinner: idleDcbSpinner() };
}

const cell: DcbTrapRect = { left: 10, top: 20, right: 50, bottom: 80 };

test("MAIN and AUX do not trap; RANGE spinner traps the cell; PREF traps the submenu", () => {
  const h = host();
  expect(dcbCursorTrapKind(h)).toBe("none");
  h.dcbMenu = "AUX";
  expect(dcbCursorTrapKind(h)).toBe("none");

  h.dcbMenu = "MAIN";
  armDcbSpinner(h, "RANGE");
  expect(dcbCursorTrapKind(h)).toBe("cell");

  h.dcbSpinner = idleDcbSpinner();
  openDcbMenu(h, "PREF");
  expect(dcbCursorTrapKind(h)).toBe("submenu");
});

test("armed spinner inside a submenu stays a cell trap", () => {
  const h = host();
  openDcbMenu(h, "BRITE");
  expect(dcbCursorTrapKind(h)).toBe("submenu");
  armDcbSpinner(h, "BRITE_DCB");
  expect(dcbCursorTrapKind(h)).toBe("cell");
});

test("clampPointToRect keeps interior points and pins the rest to the last inside pixel", () => {
  expect(clampPointToRect(30, 40, cell)).toEqual({ x: 30, y: 40 });
  expect(clampPointToRect(10, 20, cell)).toEqual({ x: 10, y: 20 });
  expect(clampPointToRect(0, 0, cell)).toEqual({ x: 10, y: 20 });
  expect(clampPointToRect(50, 80, cell)).toEqual({ x: 49, y: 79 });
  expect(clampPointToRect(200, 400, cell)).toEqual({ x: 49, y: 79 });
});

test("pointInTrapRect is half-open so the max clamp pixel still counts as inside", () => {
  expect(pointInTrapRect(10, 20, cell)).toBe(true);
  expect(pointInTrapRect(49, 79, cell)).toBe(true);
  expect(pointInTrapRect(50, 40, cell)).toBe(false);
  expect(pointInTrapRect(30, 80, cell)).toBe(false);
  expect(pointInTrapRect(9, 40, cell)).toBe(false);
});

test("dcbTrapShouldBlockPointer lets captured-target events through even when the OS pointer left", () => {
  expect(dcbTrapShouldBlockPointer(30, 40, cell, false)).toBe(false);
  expect(dcbTrapShouldBlockPointer(300, 400, cell, true)).toBe(false);
  expect(dcbTrapShouldBlockPointer(300, 400, cell, false)).toBe(true);
});
