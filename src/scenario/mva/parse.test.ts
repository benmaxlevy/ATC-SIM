import { expect, test } from "vitest";
import { parseMvaChart } from "./parse";

test("parseMvaChart rejects empty polygons and short rings", () => {
  expect(() => parseMvaChart(null)).toThrow(/must be an object/);
  expect(() =>
    parseMvaChart({
      airportId: "KDEM",
      defaultMinAltitudeFt: 4000,
      polygons: [],
    }),
  ).toThrow(/non-empty/);
  expect(() =>
    parseMvaChart({
      airportId: "KDEM",
      defaultMinAltitudeFt: 4000,
      polygons: [
        {
          id: "thin",
          minAltitudeFt: 1500,
          verticesNm: [
            { xNm: 0, yNm: 0 },
            { xNm: 1, yNm: 0 },
          ],
        },
      ],
    }),
  ).toThrow(/at least 3 vertices/);
});
