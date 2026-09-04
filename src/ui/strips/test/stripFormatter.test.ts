import { describe, expect, test } from "vitest";
import {
  formatArrivalTime,
  formatBeaconCode,
  formatEquipment,
  formatFlightRules,
  formatProposedDepartureTime,
  formatRevisionIndex,
  formatTimeZulu,
  truncateField,
} from "../stripFormatter";
import {
  MOCK_ARRIVALS,
  MOCK_DEPARTURES,
  MOCK_FLIGHT_STRIPS,
  mockAAL412,
  mockArrivals,
  mockDAL882,
  mockDepartures,
  mockFlightStrips,
  mockN415SP,
  mockSWA1902,
} from "../mockFixture";
import type { ArrivalStripData, CWTCategory, DepartureStripData, FlightStrip } from "../types";

describe("formatEquipment", () => {
  test("AC2 — produces correct prefixes for CWT, Heavy, and standard aircraft", () => {
    // CWT
    expect(formatEquipment("A321", "L", { cwtCategory: "F" })).toBe("F/A321/L");
    // Heavy
    expect(formatEquipment("B772", "L", { isHeavy: true })).toBe("H/B772/L");
    // Standard
    expect(formatEquipment("B738", "G")).toBe("B738/G");
  });

  test("handles standard aircraft without prefixes or suffixes", () => {
    expect(formatEquipment("B738")).toBe("B738");
    expect(formatEquipment("C172", "")).toBe("C172");
    expect(formatEquipment("A320", "L", {})).toBe("A320/L");
    expect(formatEquipment("A320", "L", { isHeavy: false })).toBe("A320/L");
    expect(formatEquipment("A320", "/L")).toBe("A320/L");
  });

  test("applies H/ prefix for heavy aircraft when CWT is inactive or omitted", () => {
    expect(formatEquipment("B772", "L", { isHeavy: true })).toBe("H/B772/L");
    expect(formatEquipment("B744", "L", { isHeavy: true, useCWT: false })).toBe("H/B744/L");
    expect(formatEquipment("B772", "L", { isHeavy: true, cwtCategory: "C", useCWT: false })).toBe(
      "H/B772/L",
    );
    expect(formatEquipment("A333", undefined, { isHeavy: true })).toBe("H/A333");
  });

  test("applies CWT category prefixes A through I when CWT is active", () => {
    const categories: CWTCategory[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
    for (const cat of categories) {
      expect(formatEquipment("TEST", "L", { cwtCategory: cat })).toBe(`${cat}/TEST/L`);
    }
  });

  test("CWT prefix takes precedence over isHeavy when CWT is active", () => {
    expect(formatEquipment("B772", "L", { isHeavy: true, cwtCategory: "B" })).toBe("B/B772/L");
    expect(formatEquipment("B772", "L", { isHeavy: true, cwtCategory: "B", useCWT: true })).toBe(
      "B/B772/L",
    );
  });

  test("trims whitespace from rawType and suffix", () => {
    expect(formatEquipment(" B738 ", " G ")).toBe("B738/G");
    expect(formatEquipment(" A321 ", " /L ")).toBe("A321/L");
  });
});

describe("truncateField", () => {
  test("AC3 — leaves strings <= maxLength untouched, and trims with *** when string exceeds maxLength", () => {
    const exact = "1234567890";
    expect(truncateField(exact, 10)).toBe(exact);

    const shorter = "12345";
    expect(truncateField(shorter, 10)).toBe(shorter);

    const longer = "12345678901";
    expect(truncateField(longer, 10)).toBe("1234567890***");
  });

  test("handles empty string and boundary lengths", () => {
    expect(truncateField("", 10)).toBe("");
    expect(truncateField("A", 1)).toBe("A");
    expect(truncateField("AB", 1)).toBe("A***");
    expect(truncateField("ABC", 0)).toBe("***");
  });

  test("truncates long flight plan routes and remarks over 65 characters", () => {
    const route = "PLIER2 PLIER SPA J51 FAK PHL EXTENDED OVERFLOW ROUTE WAYPOINTS EXCEEDING LIMIT";
    expect(route.length).toBeGreaterThan(65);
    const truncated = truncateField(route, 65);
    expect(truncated).toBe(`${route.slice(0, 65)}***`);
    expect(truncated.endsWith("***")).toBe(true);
  });
});

describe("formatRevisionIndex", () => {
  test("AC4 — returns empty string for undefined or 0, and stringified integers for >= 1", () => {
    expect(formatRevisionIndex(undefined)).toBe("");
    expect(formatRevisionIndex(0)).toBe("");
    expect(formatRevisionIndex(1)).toBe("1");
    expect(formatRevisionIndex(2)).toBe("2");
    expect(formatRevisionIndex(12)).toBe("12");
  });

  test("handles negative numbers, null, and non-integers safely", () => {
    expect(formatRevisionIndex(-1)).toBe("");
    expect(formatRevisionIndex(Number.NaN)).toBe("");
    expect(formatRevisionIndex(3.7)).toBe("3");
  });
});

describe("formatBeaconCode", () => {
  test("AC5 — pads squawks to 4 digits", () => {
    expect(formatBeaconCode("120")).toBe("0120");
    expect(formatBeaconCode("4215")).toBe("4215");
    expect(formatBeaconCode("7")).toBe("0007");
    expect(formatBeaconCode("42")).toBe("0042");
    expect(formatBeaconCode("")).toBe("0000");
  });

  test("trims whitespace from input code", () => {
    expect(formatBeaconCode(" 120 ")).toBe("0120");
    expect(formatBeaconCode(" 4215 ")).toBe("4215");
  });
});

describe("formatTimeZulu", () => {
  test("formats 4-digit Zulu HHMM representations", () => {
    expect(formatTimeZulu("1435")).toBe("1435");
    expect(formatTimeZulu("14:35")).toBe("1435");
    expect(formatTimeZulu("930")).toBe("0930");
    expect(formatTimeZulu("9:30")).toBe("0930");
    expect(formatTimeZulu("1435Z")).toBe("1435");
    expect(formatTimeZulu("1435z")).toBe("1435");
    expect(formatTimeZulu("0800")).toBe("0800");
    expect(formatTimeZulu("")).toBe("");
  });
});

describe("formatProposedDepartureTime", () => {
  test("formats proposed departure time with P prefix and 4-digit Zulu time", () => {
    expect(formatProposedDepartureTime("1430")).toBe("P1430");
    expect(formatProposedDepartureTime("930")).toBe("P0930");
    expect(formatProposedDepartureTime("14:30")).toBe("P1430");
    expect(formatProposedDepartureTime("P1430")).toBe("P1430");
    expect(formatProposedDepartureTime("p0930")).toBe("P0930");
    expect(formatProposedDepartureTime("")).toBe("");
    expect(formatProposedDepartureTime(undefined)).toBe("");
    expect(formatProposedDepartureTime(null)).toBe("");
  });
});

describe("formatArrivalTime", () => {
  test("formats arrival ETA with A prefix and 4-digit Zulu time", () => {
    expect(formatArrivalTime("2254")).toBe("A2254");
    expect(formatArrivalTime("930")).toBe("A0930");
    expect(formatArrivalTime("22:54")).toBe("A2254");
    expect(formatArrivalTime("A2254")).toBe("A2254");
    expect(formatArrivalTime("a1440")).toBe("A1440");
    expect(formatArrivalTime("")).toBe("");
    expect(formatArrivalTime(undefined)).toBe("");
    expect(formatArrivalTime(null)).toBe("");
  });
});

describe("formatFlightRules", () => {
  test("returns spelled-out IFR or VFR", () => {
    expect(formatFlightRules("IFR")).toBe("IFR");
    expect(formatFlightRules("VFR")).toBe("VFR");
    expect(formatFlightRules("vfr")).toBe("VFR");
    expect(formatFlightRules("ifr")).toBe("IFR");
    expect(formatFlightRules(undefined)).toBe("IFR");
    expect(formatFlightRules("")).toBe("IFR");
  });
});

describe("mockFixture", () => {
  test("AC6 — static mock fixture contains valid departures and arrivals matching the specification", () => {
    expect(mockDepartures).toHaveLength(2);
    expect(mockArrivals).toHaveLength(2);
    expect(mockFlightStrips).toHaveLength(4);

    expect(MOCK_DEPARTURES).toBe(mockDepartures);
    expect(MOCK_ARRIVALS).toBe(mockArrivals);
    expect(MOCK_FLIGHT_STRIPS).toBe(mockFlightStrips);

    // Departure 1: DAL882
    expect(mockDAL882.acid).toBe("DAL882");
    expect(mockDAL882.stripType).toBe("DEPARTURE");
    expect(mockDAL882.departureAirport).toBe("KATL");
    expect(mockDAL882.destinationAirport).toBe("KPHL");
    expect(mockDAL882.beaconCode).toBe("4215");
    expect(mockDAL882.annotationBoxes?.boxes10to18).toHaveLength(9);

    // Departure 2: SWA1902
    expect(mockSWA1902.acid).toBe("SWA1902");
    expect(mockSWA1902.stripType).toBe("DEPARTURE");
    expect(mockSWA1902.revisionNumber).toBe(1);
    expect(mockSWA1902.beaconCode).toBe("2104");
    expect(mockSWA1902.annotationBoxes?.boxes10to18).toHaveLength(9);

    // Arrival 1: AAL412
    expect(mockAAL412.acid).toBe("AAL412");
    expect(mockAAL412.stripType).toBe("ARRIVAL");
    expect(mockAAL412.flightRules).toBe("IFR");
    expect(mockAAL412.destinationAirport).toBe("KATL");
    expect(mockAAL412.coordinationFix).toBe("HONIE");
    expect(mockAAL412.beaconCode).toBe("0120");
    expect(mockAAL412.annotationBoxes?.boxes10to18).toHaveLength(9);

    // Arrival 2: N415SP
    expect(mockN415SP.acid).toBe("N415SP");
    expect(mockN415SP.stripType).toBe("ARRIVAL");
    expect(mockN415SP.flightRules).toBe("VFR");
    expect(mockN415SP.destinationAirport).toBe("KPDK");
    expect(mockN415SP.coordinationFix).toBe("PDK");
    expect(mockN415SP.beaconCode).toBe("1200");
    expect(mockN415SP.annotationBoxes?.boxes10to18).toHaveLength(9);
  });

  test("AC1 — TypeScript models compile cleanly and express DepartureStripData, ArrivalStripData, and FlightStrip", () => {
    const strips: FlightStrip[] = [mockDAL882, mockAAL412];
    for (const s of strips) {
      if (s.stripType === "DEPARTURE") {
        const dep: DepartureStripData = s;
        expect(dep.departureAirport).toBeDefined();
        expect(dep.route).toBeDefined();
      } else {
        const arr: ArrivalStripData = s;
        expect(arr.coordinationFix).toBeDefined();
        expect(arr.flightRules).toMatch(/IFR|VFR/);
      }
    }
  });

  test("formats equipment and beacon codes from fixture data correctly", () => {
    const dalEquipment = formatEquipment(mockDAL882.rawType, mockDAL882.equipmentSuffix, {
      cwtCategory: mockDAL882.cwtCategory,
      isHeavy: mockDAL882.isHeavy,
    });
    expect(dalEquipment).toBe("D/B738/L");

    const aalBeacon = formatBeaconCode(mockAAL412.beaconCode);
    expect(aalBeacon).toBe("0120");

    const swaRev = formatRevisionIndex(mockSWA1902.revisionNumber);
    expect(swaRev).toBe("1");

    const dalRev = formatRevisionIndex(mockDAL882.revisionNumber);
    expect(dalRev).toBe("");
  });
});
