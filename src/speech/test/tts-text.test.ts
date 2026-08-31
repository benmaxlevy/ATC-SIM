import { expect, test } from "vitest";
import { readbackForTts, speakGroupedNumber } from "../tts-text";

const groupedTable: [string, string][] = [
  ["1", "one"],
  ["9", "nine"],
  ["10", "ten"],
  ["20", "twenty"],
  ["23", "twenty three"],
  ["27", "twenty seven"],
  ["90", "ninety"],
  ["090", "ninety"],
  ["99", "ninety nine"],
  ["100", "one hundred"],
  ["101", "one zero one"],
  ["105", "one zero five"],
  ["110", "one ten"],
  ["123", "one twenty three"],
  ["180", "one eighty"],
  ["200", "two hundred"],
  ["210", "two ten"],
  ["270", "two seventy"],
  ["360", "three sixty"],
  ["1000", "one thousand"],
  ["1200", "twelve hundred"],
  ["1234", "twelve thirty four"],
  ["2000", "two thousand"],
];

test.each(groupedTable)("grouped number %s → %s", (raw, expected) => {
  expect(speakGroupedNumber(raw)).toBe(expected);
});

test("strips altitude parentheses then groups every remaining numeral", () => {
  expect(readbackForTts("descend and maintain three thousand (3000)")).toBe(
    "descend and maintain three thousand",
  );
  expect(readbackForTts("through one-zero thousand (10000)")).toBe("through one-zero thousand");
  expect(
    readbackForTts(
      "Delta 123 heading 270, descend and maintain three thousand (3000), maintain 210 knots",
    ),
  ).toBe(
    "Delta one twenty three heading two seventy, descend and maintain three thousand, maintain two ten knots",
  );
});

test("groups headings, runways, flight levels, and callsign numbers", () => {
  expect(readbackForTts("Delta 123 heading 270")).toBe(
    "Delta one twenty three heading two seventy",
  );
  expect(readbackForTts("Southwest 99 turn left heading 090")).toBe(
    "Southwest ninety nine turn left heading ninety",
  );
  expect(readbackForTts("American 100 climb and maintain FL 180")).toBe(
    "American one hundred climb and maintain FL one eighty",
  );
  expect(readbackForTts("intercept the runway 27 localizer")).toBe(
    "intercept the runway twenty seven localizer",
  );
  expect(readbackForTts("Delta 123 turn left 20 degrees")).toBe(
    "Delta one twenty three turn left twenty degrees",
  );
});
