import { expect, test } from "vitest";
import {
  DEFAULT_CAMERA,
  DEFAULT_RANGE_NM,
  canvasToWorld,
  pxPerNm,
  worldToCanvas,
  type Camera,
} from "./camera";

const FIXTURE: Camera = { rangeNm: 40, centerXNm: 0, centerYNm: 0 };
const CSS_W = 800;
const CSS_H = 800;

test("default camera is 40 NM centered on the airport ref", () => {
  expect(DEFAULT_RANGE_NM).toBe(40);
  expect(DEFAULT_CAMERA).toEqual({ rangeNm: 40, centerXNm: 0, centerYNm: 0 });
});

test("pxPerNm fits rangeNm in the smaller canvas dimension", () => {
  expect(pxPerNm(FIXTURE, CSS_W, CSS_H)).toBe(10);
  expect(pxPerNm(FIXTURE, 800, 400)).toBe(5);
});

test("airport (0,0) maps to canvas center (AC4)", () => {
  const p = worldToCanvas(0, 0, FIXTURE, CSS_W, CSS_H);
  expect(p.x).toBeCloseTo(400);
  expect(p.y).toBeCloseTo(400);
});

test("xNm = rangeNm, yNm = 0 maps near the right-edge midpoint ±2 px (AC4)", () => {
  const p = worldToCanvas(FIXTURE.rangeNm, 0, FIXTURE, CSS_W, CSS_H);
  expect(Math.abs(p.x - CSS_W)).toBeLessThanOrEqual(2);
  expect(Math.abs(p.y - CSS_H / 2)).toBeLessThanOrEqual(2);
});

test("north is up: +y NM maps toward the top midpoint", () => {
  const p = worldToCanvas(0, FIXTURE.rangeNm, FIXTURE, CSS_W, CSS_H);
  expect(p.x).toBeCloseTo(CSS_W / 2);
  expect(Math.abs(p.y - 0)).toBeLessThanOrEqual(2);
});

test("canvasToWorld inverts worldToCanvas on a square viewport", () => {
  const orig = { xNm: 16, yNm: 8 };
  const p = worldToCanvas(orig.xNm, orig.yNm, FIXTURE, CSS_W, CSS_H);
  const back = canvasToWorld(p.x, p.y, FIXTURE, CSS_W, CSS_H);
  expect(back.xNm).toBeCloseTo(orig.xNm);
  expect(back.yNm).toBeCloseTo(orig.yNm);
});

test("DAL123 spawn east of origin projects to the right half (north-up)", () => {
  const p = worldToCanvas(16, 8, FIXTURE, CSS_W, CSS_H);
  expect(p.x).toBeGreaterThan(CSS_W / 2);
});
