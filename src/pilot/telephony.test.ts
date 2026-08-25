import { describe, expect, test } from "vitest";
import {
  formatAltitude,
  formatCallsignSpeech,
  formatDepartureCheckIn,
  roundAltitudeToHundreds,
  speakAltitude,
} from "./telephony";

describe("formatDepartureCheckIn (AC1)", () => {
  test("AC1 — formatDepartureCheckIn with climb-via SID", () => {
    const text = formatDepartureCheckIn({
      callsign: "DAL123",
      sidName: "BAY ONE",
      currentAltitudeFt: 1200,
      assignedAltitudeFt: 10000,
      isClimbVia: true,
    });
    expect(text).toBe(
      "Departure, Delta 123, passing one thousand two hundred climbing via the BAY ONE departure",
    );
  });

  test("formatDepartureCheckIn without climb-via (assigned altitude)", () => {
    const text = formatDepartureCheckIn({
      callsign: "DAL123",
      currentAltitudeFt: 1200,
      assignedAltitudeFt: 5000,
      isClimbVia: false,
    });
    expect(text).toBe("Departure, Delta 123, leaving one thousand two hundred for five thousand");
  });

  test("formatDepartureCheckIn with isClimbVia true but no sidName falls back to leaving/for", () => {
    const text = formatDepartureCheckIn({
      callsign: "AAL45",
      currentAltitudeFt: 900,
      assignedAltitudeFt: 10000,
      isClimbVia: true,
    });
    expect(text).toBe("Departure, American 45, leaving niner hundred for one-zero thousand");
  });

  test("formatDepartureCheckIn with flight level assigned altitude", () => {
    const text = formatDepartureCheckIn({
      callsign: "UAL890",
      currentAltitudeFt: 1500,
      assignedAltitudeFt: 19000,
      isClimbVia: false,
    });
    expect(text).toBe("Departure, United 890, leaving one thousand five hundred for FL 190");
  });

  test("formatDepartureCheckIn with flight level current altitude", () => {
    const text = formatDepartureCheckIn({
      callsign: "SWA210",
      currentAltitudeFt: 18000,
      assignedAltitudeFt: 23000,
      isClimbVia: false,
    });
    expect(text).toBe("Departure, Southwest 210, leaving FL 180 for FL 230");
  });

  test("formatDepartureCheckIn with unknown airline prefix uses phonetic alphabet", () => {
    const text = formatDepartureCheckIn({
      callsign: "XYZ99",
      sidName: "BAY ONE",
      currentAltitudeFt: 1000,
      assignedAltitudeFt: 5000,
      isClimbVia: true,
    });
    expect(text).toBe(
      "Departure, X-ray Yankee Zulu 99, passing one thousand climbing via the BAY ONE departure",
    );
  });

  test("rounds current and assigned altitude to nearest 100 ft", () => {
    const text = formatDepartureCheckIn({
      callsign: "DAL123",
      sidName: "BAY ONE",
      currentAltitudeFt: 1249,
      assignedAltitudeFt: 9951,
      isClimbVia: true,
    });
    expect(text).toBe(
      "Departure, Delta 123, passing one thousand two hundred climbing via the BAY ONE departure",
    );
  });
});

describe("Altitude telephony helpers", () => {
  test("roundAltitudeToHundreds snaps properly", () => {
    expect(roundAltitudeToHundreds(1234)).toBe(1200);
    expect(roundAltitudeToHundreds(1260)).toBe(1300);
    expect(roundAltitudeToHundreds(-50)).toBe(0);
    expect(roundAltitudeToHundreds(Number.NaN)).toBe(0);
  });

  test("speakAltitude handles various altitudes below and above 10,000 ft", () => {
    expect(speakAltitude(700)).toBe("seven hundred");
    expect(speakAltitude(1000)).toBe("one thousand");
    expect(speakAltitude(1200)).toBe("one thousand two hundred");
    expect(speakAltitude(5000)).toBe("five thousand");
    expect(speakAltitude(10000)).toBe("one-zero thousand");
    expect(speakAltitude(11500)).toBe("one-one thousand five hundred");
  });

  test("formatAltitude formats display string with parenthetical below FL180", () => {
    expect(formatAltitude(1200)).toBe("one thousand two hundred (1200)");
    expect(formatAltitude(18000)).toBe("FL 180");
  });

  test("formatCallsignSpeech expands known prefixes and phonetics", () => {
    expect(formatCallsignSpeech("DAL123")).toBe("Delta 123");
    expect(formatCallsignSpeech("AAL1")).toBe("American 1");
    expect(formatCallsignSpeech("UAL999")).toBe("United 999");
    expect(formatCallsignSpeech("")).toBe("");
  });
});
