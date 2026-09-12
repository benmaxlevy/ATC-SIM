import { flightPlanForAircraft, handoffFor, type Aircraft, type World } from "@core";
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
    const plan = flightPlanForAircraft(world, ac.id);
    const acid = plan?.acid ?? ac.callsign;
    const aircraftType = plan?.aircraftType ?? ac.aircraftType;
    const requestedAltitudeFt =
      plan?.requestedAltitudeFt ?? ac.requestedAltitudeFt ?? ac.intent.requestedAltitudeFt;
    const isDeparture =
      handoffFor(world, ac.id)?.kind === "departure" ||
      ac.intent.vertical?.type === "VIA_SID" ||
      (ac.intent.lateral?.type === "PROCEDURE" && Boolean(ac.intent.lateral.sidId)) ||
      Boolean(
        world.scheduledDepartures?.some(
          (sd) => sd.callsign.toUpperCase() === acid.toUpperCase() && sd.spawned,
        ),
      );

    const cwtCategory: CWTCategory | undefined = ac.cwtWakeCategory;
    const isHeavy = ac.wakeCategory?.toUpperCase() === "H";
    const beaconCode = plan?.assignedBeacon ?? ac.assignedSquawk ?? ac.squawk ?? "";
    const reportedSquawk = plan?.reportedBeacon ?? ac.reportedSquawk ?? ac.squawk;

    const cidDigits = acid.replace(/\D/g, "");

    if (isDeparture) {
      const cid = plan?.cid ?? (cidDigits.length > 0 ? cidDigits.padStart(3, "0").slice(-3) : "");
      const altFt = requestedAltitudeFt ?? ac.intent.assignedAltitudeFt;
      const requestedAltitude = String(Math.round(altFt / 100));

      const route =
        plan?.route ??
        (ac.intent.lateral?.type === "PROCEDURE" && ac.intent.lateral.routeFixIds?.length
          ? ac.intent.lateral.routeFixIds.join(" ")
          : "");

      const matchedSd = world.scheduledDepartures?.find(
        (sd) => sd.callsign.toUpperCase() === acid.toUpperCase() && sd.spawned,
      );
      const proposedTime =
        plan?.ptd ??
        (matchedSd?.scheduledSimMs !== undefined
          ? formatSimZuluTime(matchedSd.scheduledSimMs)
          : formatSimZuluTime(world.simTimeMs));

      const depStrip: DepartureStripData = {
        id: ac.id,
        stripType: "DEPARTURE",
        acid,
        revisionNumber: 0,
        rawType: aircraftType ?? "B738",
        aircraftCount: plan?.aircraftCount,
        equipmentSuffix: plan?.equipment,
        isHeavy,
        cwtCategory,
        cid,
        beaconCode,
        reportedSquawk,
        proposedDepartureTime: proposedTime,
        requestedAltitude,
        departureAirport: plan?.departureAirport ?? airportId,
        route,
        destinationAirport:
          plan?.airportId ??
          (ac as unknown as { destinationAirport?: string }).destinationAirport ??
          "",
        remarks: plan?.remarks ?? "",
        annotationBoxes: {
          box8A: activeRunway,
          box8B: "",
          boxes10to18: Array(9).fill(""),
        },
      };
      departures.push(depStrip);
    } else {
      const cid = plan?.cid ?? (cidDigits.length > 0 ? cidDigits.padStart(3, "0").slice(-3) : "");

      let previousFix: string | undefined = plan?.previousFix;
      let coordinationFix = plan?.coordinationFix ?? "";

      if (ac.intent.lateral?.type === "PROCEDURE") {
        const routeFixIds = ac.intent.lateral.routeFixIds ?? [];
        const toFixIndex = ac.intent.lateral.toFixIndex ?? 0;
        if (!previousFix && toFixIndex > 0 && routeFixIds[toFixIndex - 1]) {
          previousFix = routeFixIds[toFixIndex - 1];
        }
        if (!coordinationFix && routeFixIds.length > 0) {
          coordinationFix = routeFixIds[toFixIndex] ?? routeFixIds[0] ?? "";
        }
      } else if (
        !coordinationFix &&
        ac.intent.lateral?.type === "DIRECT" &&
        ac.intent.lateral.fixId
      ) {
        coordinationFix = ac.intent.lateral.fixId;
      }

      const eta = plan?.eta ?? formatSimZuluTime(world.simTimeMs, estimateArrivalMinutes(ac));
      const remarks =
        ac.intent.lateral?.type === "PROCEDURE" && ac.intent.lateral.starId
          ? ac.intent.lateral.starId
          : "";

      const arrStrip: ArrivalStripData = {
        id: ac.id,
        stripType: "ARRIVAL",
        acid,
        revisionNumber: 0,
        rawType: aircraftType ?? "A321",
        aircraftCount: plan?.aircraftCount,
        equipmentSuffix: plan?.equipment,
        isHeavy,
        cwtCategory,
        cid,
        beaconCode,
        reportedSquawk,
        previousFix,
        coordinationFix,
        estimatedTimeOfArrival: eta,
        altitude:
          plan?.assignedAltitudeFt === undefined && requestedAltitudeFt === undefined
            ? undefined
            : String(
                Math.round((plan?.assignedAltitudeFt ?? requestedAltitudeFt ?? 0) / 100),
              ).padStart(3, "0"),
        altitudeRemarks: plan?.remarks,
        flightRules: plan?.flightRules === "VFR" ? "VFR" : "IFR",
        minimumFuel: plan?.minimumFuel,
        destinationAirport: plan?.airportId ?? airportId,
        remarks: plan?.remarks ?? plan?.route ?? remarks,
        box9A: plan?.airportId ?? airportId,
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
