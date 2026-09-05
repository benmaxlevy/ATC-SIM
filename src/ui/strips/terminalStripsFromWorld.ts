import { handoffFor, type Aircraft, type World } from "@core";
import { compareCallsigns } from "./FlightStrips";
import type { ArrivalStripData, CWTCategory, DepartureStripData } from "./types";

/**
 * Formats a simulated Zulu time string (HHMM) based on simTimeMs plus an optional offset in minutes.
 * Defaults to 12:00 Zulu base time at sim start (0ms).
 */
function formatSimZuluTime(simTimeMs: number, offsetMinutes: number = 0): string {
  const totalMinutes = Math.floor(Math.max(0, simTimeMs) / 60000) + offsetMinutes;
  const baseMinutes = 12 * 60; // 12:00 Zulu base
  const currentMinutes = (((baseMinutes + totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(currentMinutes / 60);
  const mm = currentMinutes % 60;
  return `${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}`;
}

/**
 * Estimates arrival time offset in minutes based on distance from airport origin and groundspeed.
 */
function estimateArrivalMinutes(ac: Aircraft): number {
  if (ac.speedKt > 0) {
    const distNm = Math.hypot(ac.xNm, ac.yNm);
    const min = Math.round((distNm / ac.speedKt) * 60);
    return Math.max(1, min);
  }
  return 15;
}

/**
 * Derives live terminal departure and arrival flight progress strips from World state.
 *
 * Rules:
 * - Only pulls from `world.aircraft` (currently active spawned aircraft).
 * - Excludes scheduled departures/arrivals that have not spawned yet.
 * - Partitions into departures vs arrivals by handoff kind, SID intent, or spawned scheduled departure.
 * - Stably sorts departures and arrivals by callsign.
 */
export function terminalStripsFromWorld(world: World): {
  departures: DepartureStripData[];
  arrivals: ArrivalStripData[];
} {
  const departures: DepartureStripData[] = [];
  const arrivals: ArrivalStripData[] = [];

  const airportId = world.catalog?.airportId ?? "ATL";
  const activeRunway = world.activeRunwayId ?? "";

  for (const ac of world.aircraft) {
    const isDeparture =
      handoffFor(world, ac.id)?.kind === "departure" ||
      ac.intent.vertical?.type === "VIA_SID" ||
      (ac.intent.lateral?.type === "PROCEDURE" && Boolean(ac.intent.lateral.sidId)) ||
      Boolean(
        world.scheduledDepartures?.some(
          (sd) => sd.callsign.toUpperCase() === ac.callsign.toUpperCase() && sd.spawned,
        ),
      );

    const cwtCategory: CWTCategory | undefined =
      ac.wakeCategory && /^[A-I]$/i.test(ac.wakeCategory)
        ? (ac.wakeCategory.toUpperCase() as CWTCategory)
        : undefined;
    const isHeavy = ac.wakeCategory === "H";
    const beaconCode = ac.squawk ?? ac.assignedSquawk ?? "1200";

    const cidDigits = ac.callsign.replace(/\D/g, "");

    if (isDeparture) {
      const cid = cidDigits.length > 0 ? cidDigits.padStart(3, "0").slice(-3) : "101";
      const altFt =
        ac.requestedAltitudeFt ?? ac.intent.requestedAltitudeFt ?? ac.intent.assignedAltitudeFt;
      const requestedAltitude = String(Math.round(altFt / 100));

      const route =
        ac.intent.lateral?.type === "PROCEDURE" && ac.intent.lateral.routeFixIds?.length
          ? ac.intent.lateral.routeFixIds.join(" ")
          : "DIRECT";

      const matchedSd = world.scheduledDepartures?.find(
        (sd) => sd.callsign.toUpperCase() === ac.callsign.toUpperCase() && sd.spawned,
      );
      const proposedTime =
        matchedSd?.scheduledSimMs !== undefined
          ? formatSimZuluTime(matchedSd.scheduledSimMs)
          : formatSimZuluTime(world.simTimeMs);

      const depStrip: DepartureStripData = {
        id: ac.id,
        stripType: "DEPARTURE",
        acid: ac.callsign,
        revisionNumber: 0,
        rawType: ac.aircraftType ?? "B738",
        equipmentSuffix: "L",
        isHeavy,
        cwtCategory,
        cid,
        beaconCode,
        proposedDepartureTime: proposedTime,
        requestedAltitude,
        departureAirport: airportId,
        route,
        destinationAirport:
          (ac as unknown as { destinationAirport?: string }).destinationAirport ?? "DEST",
        remarks: "",
        annotationBoxes: {
          box8A: activeRunway,
          box8B: "",
          boxes10to18: Array(9).fill(""),
        },
      };
      departures.push(depStrip);
    } else {
      const cid = cidDigits.length > 0 ? cidDigits.padStart(3, "0").slice(-3) : "201";

      let previousFix: string | undefined = undefined;
      let coordinationFix = "ENTRY";

      if (ac.intent.lateral?.type === "PROCEDURE") {
        const routeFixIds = ac.intent.lateral.routeFixIds ?? [];
        const toFixIndex = ac.intent.lateral.toFixIndex ?? 0;
        if (toFixIndex > 0 && routeFixIds[toFixIndex - 1]) {
          previousFix = routeFixIds[toFixIndex - 1];
        }
        if (routeFixIds.length > 0) {
          coordinationFix = routeFixIds[toFixIndex] ?? routeFixIds[0] ?? "ENTRY";
        }
      } else if (ac.intent.lateral?.type === "DIRECT" && ac.intent.lateral.fixId) {
        coordinationFix = ac.intent.lateral.fixId;
      }

      const eta = formatSimZuluTime(world.simTimeMs, estimateArrivalMinutes(ac));
      const remarks =
        ac.intent.lateral?.type === "PROCEDURE" && ac.intent.lateral.starId
          ? ac.intent.lateral.starId
          : "";

      const arrStrip: ArrivalStripData = {
        id: ac.id,
        stripType: "ARRIVAL",
        acid: ac.callsign,
        revisionNumber: 0,
        rawType: ac.aircraftType ?? "A321",
        equipmentSuffix: "L",
        isHeavy,
        cwtCategory,
        cid,
        beaconCode,
        previousFix,
        coordinationFix,
        estimatedTimeOfArrival: eta,
        flightRules: "IFR",
        destinationAirport: airportId,
        remarks,
        annotationBoxes: {
          box8A: activeRunway,
          box8B: "",
          boxes10to18: Array(9).fill(""),
        },
      };
      arrivals.push(arrStrip);
    }
  }

  departures.sort((a, b) => compareCallsigns(a.acid, b.acid));
  arrivals.sort((a, b) => compareCallsigns(a.acid, b.acid));

  return { departures, arrivals };
}
