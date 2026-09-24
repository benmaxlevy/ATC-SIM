import { createAircraft, createWorld, SessionLog } from "@core";
import { readbackForTts } from "../../speech/tts-text";
import { describe, expect, test } from "vitest";
import { handleRadioText } from "../handleRadioText";
import { formatCheckIn } from "../checkinQueue";
import { formatReadback } from "../readback";
import { formatCallsignSpeech, formatDepartureCheckIn } from "../telephony";
import {
  formatIfrPickupRequest,
  formatVfrClassBRequest,
  formatVfrFlightFollowingRequest,
} from "../vfrRequestQueue";

const VFR_ALIASES = [
  ["B350", "Bonanza"],
  ["C172", "Skyhawk"],
  ["C182", "Skylane"],
  ["C208", "Caravan"],
  ["DA40", "Diamond"],
  ["PA28", "Archer"],
  ["SR22", "Cirrus"],
] as const;

describe("pilot spoken-alias callsign output", () => {
  test.each(VFR_ALIASES)("uses preferred alias for %s", (_aircraftType, alias) => {
    expect(
      formatCallsignSpeech("N12345", {
        spokenAliases: [alias],
      }),
    ).toBe(`${alias} one two three four five`);
  });

  test("speaks suffix letters and keeps canonical N-number unchanged", () => {
    const callsign = "N172SP";
    const aliases = ["Skyhawk", "Cessna"];

    expect(formatCallsignSpeech(callsign, { spokenAliases: aliases })).toBe(
      "Skyhawk one seven two Sierra Papa",
    );
    expect(callsign).toBe("N172SP");
    expect(aliases).toEqual(["Skyhawk", "Cessna"]);
  });

  test("keeps no-alias and airline formatting unchanged", () => {
    expect(formatCallsignSpeech("N12345")).toBe("November 12345");
    expect(formatCallsignSpeech("DAL123", { spokenAliases: ["Airliner"] })).toBe("Delta 123");
  });

  test("passes alias plus complete tail unchanged into pilot TTS text", () => {
    expect(readbackForTts("Skyhawk one seven two Sierra Papa request IFR")).toBe(
      "Skyhawk one seven two Sierra Papa request I F R",
    );
  });

  test("routes check-in, departure, readback, VFR, and IFR pickup through alias output", () => {
    const common = { callsign: "N172SP", spokenAliases: ["Skyhawk"] } as const;
    const expected = "Skyhawk one seven two Sierra Papa";

    expect(
      formatCheckIn({
        ...common,
        starName: "DEMO ONE",
        altitudeFt: 3000,
      }),
    ).toContain(`Approach, ${expected},`);
    expect(
      formatDepartureCheckIn({
        ...common,
        currentAltitudeFt: 1200,
        assignedAltitudeFt: 5000,
        isClimbVia: false,
      }),
    ).toContain(`Departure, ${expected},`);
    expect(
      formatReadback({
        ...common,
        instructions: [{ type: "IDENT" }],
        aircraft: {
          headingDeg: 90,
          altitudeFt: 3000,
          wakeCategory: undefined,
          spokenAliases: common.spokenAliases,
        },
      }),
    ).toBe("Skyhawk 172SP ident");
    expect(
      readbackForTts(
        formatReadback({
          ...common,
          instructions: [{ type: "IDENT" }],
          aircraft: {
            headingDeg: 90,
            altitudeFt: 3000,
            wakeCategory: undefined,
            spokenAliases: common.spokenAliases,
          },
        }),
      ),
    ).toBe(`${expected} ident`);
    const ffReq = formatVfrFlightFollowingRequest({
      ...common,
      aircraftType: "C172",
      destinationAirportId: "KPDK",
    });
    expect(ffReq).toContain("Skyhawk 172SP,");
    expect(readbackForTts(ffReq)).toContain(`${expected},`);

    const classBReq = formatVfrClassBRequest({
      ...common,
      aircraftType: "C172",
      classBIntent: "TRANSITION",
      classBOperation: "THROUGH",
    });
    expect(classBReq).toContain("Skyhawk 172SP,");
    expect(readbackForTts(classBReq)).toContain(`${expected},`);

    const ifrReq = formatIfrPickupRequest({
      ...common,
      aircraftType: "C172",
      destinationAirportId: "KPDK",
    });
    expect(ifrReq).toContain("Skyhawk 172SP,");
    expect(readbackForTts(ifrReq)).toContain(`${expected},`);
  });

  test("accepted readback uses alias without mutating aircraft identity", async () => {
    const aircraft = createAircraft({
      id: "ac-skyhawk",
      callsign: "N172SP",
      spokenAliases: ["Skyhawk"],
      xNm: 0,
      yNm: 0,
      headingDeg: 90,
      altitudeFt: 3000,
      speedKt: 110,
    });
    const world = createWorld({ aircraft: [aircraft] });
    const result = await handleRadioText(world, "N172SP H270", new SessionLog());

    expect(result.accepted).toBe(true);
    expect(result.readback).toBe("Skyhawk 172SP heading 270");
    expect(result.spokenReadback).toContain("Skyhawk one seven two Sierra Papa");
    expect(world.aircraft[0]?.callsign).toBe("N172SP");
  });
});
