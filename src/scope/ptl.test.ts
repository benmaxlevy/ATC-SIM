import { expect, test } from "vitest";
import { PTL_MINUTES, ptlEndpoint } from "./ptl";

test("180 kt / 090° / 1 min is +3 NM east", () => {
  const end = ptlEndpoint(0, 0, 90, 180, PTL_MINUTES);
  expect(end.eastNm).toBeCloseTo(3, 6);
  expect(end.northNm).toBeCloseTo(0, 6);
});
