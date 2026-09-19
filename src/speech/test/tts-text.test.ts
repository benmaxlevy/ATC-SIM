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

test("spells aviation identifiers for TTS without changing display readbacks", () => {
  expect(readbackForTts("Delta 123 cleared to KATL via direct")).toBe(
    "Delta one twenty three cleared to Kilo Alfa Tango Lima via direct",
  );
  expect(readbackForTts("Delta 123 cleared ILS runway 27 approach")).toBe(
    "Delta one twenty three cleared I L S runway twenty seven approach",
  );
});

test("VFR N-numbers speak digit-by-digit with phonetics", () => {
  expect(readbackForTts("N127S, request flight following")).toBe(
    "November one two seven Sierra, request flight following",
  );
  expect(readbackForTts("N172SP, canceling IFR")).toBe(
    "November one seven two Sierra Papa, canceling I F R",
  );
  // Already-expanded callsigns in controller readbacks keep single digits.
  expect(readbackForTts("November 127 Sierra heading 270")).toBe(
    "November one two seven Sierra heading two seventy",
  );
  // Airline callsign grouping is unchanged.
  expect(readbackForTts("Delta 123 heading 270")).toBe(
    "Delta one twenty three heading two seventy",
  );
});

test("airport, fix, and navaid codes speak as phonetics in identifier positions", () => {
  expect(
    readbackForTts("N123, 15 miles north of KPDK, C172, request flight following to KFTY at 4500"),
  ).toBe(
    "November one two three, fifteen miles north of Kilo Papa Delta Kilo, " +
      "C one seven two, request flight following to Kilo Foxtrot Tango Yankee " +
      "at forty five hundred",
  );
  expect(readbackForTts("N456, SR22, request flight following")).toBe(
    "November four five six, S R two two, request flight following",
  );
  expect(readbackForTts("Delta 123 radar contact 5 miles from DEM")).toBe(
    "Delta one twenty three radar contact five miles from Delta Echo Mike",
  );
  expect(readbackForTts("Delta 123 roger")).toBe("Delta one twenty three roger");
  expect(readbackForTts("Delta 123 direct NEMAX")).toBe(
    "Delta one twenty three direct November Echo Mike Alfa X-ray",
  );
  expect(readbackForTts("Delta 123 squawk VFR")).toBe("Delta one twenty three squawk V F R");
  expect(readbackForTts("Skyhawk 172SP, 15 miles north of KPDK, C172, request IFR to KFTY")).toBe(
    "Skyhawk one seventy two Sierra Papa, fifteen miles north of Kilo Papa Delta Kilo, " +
      "C one seven two, request I F R to Kilo Foxtrot Tango Yankee",
  );
  expect(readbackForTts("Skyhawk 172SP")).toBe("Skyhawk one seventy two Sierra Papa");
});

test("procedure names are never phoneticized", () => {
  expect(readbackForTts("descending via DEMO ONE arrival")).toBe("descending via Demo ONE arrival");
  expect(readbackForTts("NEMAX is not an N-number without a digit after N")).toContain("NEMAX");
});
