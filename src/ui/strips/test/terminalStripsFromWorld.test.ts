import { describe, expect, test } from "vitest";
import { createAircraft, createFlightPlan, createWorld, offerDepartureHandoff } from "@core";
import { terminalStripsFromWorld } from "../terminalStripsFromWorld";

describe("terminalStripsFromWorld", () => {
  test("projects associated plan values ahead of surveillance and intent fallbacks", () => {
    const departure = createAircraft({
      id: "dep-plan-aircraft",
      callsign: "OLD123",
      xNm: 0,
      yNm: 0,
      headingDeg: 90,
      altitudeFt: 2000,
      speedKt: 180,
      aircraftType: "C172",
      cwtWakeCategory: "B",
      wakeCategory: "H",
      assignedSquawk: "1111",
      reportedSquawk: "2222",
      squawk: "3333",
      requestedAltitudeFt: 5000,
    });
    departure.intent.lateral = {
      type: "PROCEDURE",
      sidId: "SID1",
      toFixIndex: 0,
      routeFixIds: ["OLD"],
    };
    const arrival = createAircraft({
      id: "arr-plan-aircraft",
      callsign: "OLD456",
      xNm: 10,
      yNm: 10,
      headingDeg: 270,
      altitudeFt: 7000,
      speedKt: 210,
      aircraftType: "C172",
      cwtWakeCategory: "C",
      assignedSquawk: "4444",
      reportedSquawk: "5555",
      squawk: "6666",
      requestedAltitudeFt: 4000,
    });
    const makePlan = (input: Parameters<typeof createFlightPlan>[0]) => {
      const result = createFlightPlan(input);
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    };
    const plans = [
      makePlan({
        id: "fp-dep",
        status: "active",
        associatedAircraftId: departure.id,
        acid: "DAL789",
        cid: "789",
        assignedBeacon: "7042",
        reportedBeacon: "7043",
        aircraftType: "B738",
        aircraftCount: 1,
        equipment: "G",
        ptd: "1430E",
        requestedAltitudeFt: 33000,
        departureAirport: "KATL",
        airportId: "KPHL",
        route: "PLIER2 PHL",
        remarks: "CAF",
        fixes: [],
        scratchpads: [],
      }),
      makePlan({
        id: "fp-arr",
        status: "active",
        associatedAircraftId: arrival.id,
        acid: "AAL321",
        cid: "321",
        assignedBeacon: "7060",
        reportedBeacon: "7061",
        aircraftType: "A321",
        equipment: "L",
        eta: "1515E",
        assignedAltitudeFt: 6000,
        previousFix: "BOS",
        coordinationFix: "HONIE",
        airportId: "KATL",
        remarks: "ILS27",
        fixes: [],
        scratchpads: [],
      }),
    ];
    if (!plans[0] || !plans[1]) throw new Error("plan fixture failed");

    const world = createWorld({ aircraft: [departure, arrival], flightPlans: plans });
    const strips = terminalStripsFromWorld(world);
    const dep = strips.departures[0]!;
    const arr = strips.arrivals[0]!;

    expect(dep).toMatchObject({
      acid: "DAL789",
      rawType: "B738",
      equipmentSuffix: "G",
      cwtCategory: "B",
      beaconCode: "7042",
      reportedSquawk: "7043",
      cid: "789",
      proposedDepartureTime: "1430E",
      requestedAltitude: "330",
      departureAirport: "KATL",
      destinationAirport: "KPHL",
      route: "PLIER2 PHL",
      remarks: "CAF",
    });
    expect(arr).toMatchObject({
      acid: "AAL321",
      rawType: "A321",
      equipmentSuffix: "L",
      cwtCategory: "C",
      beaconCode: "7060",
      reportedSquawk: "7061",
      cid: "321",
      previousFix: "BOS",
      coordinationFix: "HONIE",
      estimatedTimeOfArrival: "1515E",
      altitude: "060",
      destinationAirport: "KATL",
      remarks: "ILS27",
    });
  });

  test("derives strips for aircraft in world.aircraft", () => {
    const arrAc = createAircraft({
      callsign: "AAL412",
      xNm: 10,
      yNm: 15,
      headingDeg: 270,
      altitudeFt: 6000,
      speedKt: 210,
      aircraftType: "A321",
      squawk: "0120",
    });

    const world = createWorld({
      aircraft: [arrAc],
      simTimeMs: 0,
    });

    const { departures, arrivals } = terminalStripsFromWorld(world);

    expect(departures).toHaveLength(0);
    expect(arrivals).toHaveLength(1);

    const arr = arrivals[0]!;
    expect(arr.acid).toBe("AAL412");
    expect(arr.stripType).toBe("ARRIVAL");
    expect(arr.rawType).toBe("A321");
    expect(arr.beaconCode).toBe("0120");
    expect(arr.flightRules).toBe("IFR");
    expect(arr.destinationAirport).toBe("ATL");
    expect(arr.cid).toBe("412");
  });

  test("does NOT include unspawned scheduled departures (spawned !== true)", () => {
    const activeDep = createAircraft({
      callsign: "DAL882",
      xNm: 0,
      yNm: 0,
      headingDeg: 90,
      altitudeFt: 1500,
      speedKt: 180,
      aircraftType: "B738",
      squawk: "4215",
    });

    const world = createWorld({
      aircraft: [activeDep],
      scheduledDepartures: [
        {
          callsign: "DAL882",
          runwayId: "26L",
          sidId: "PLIER2",
          scheduledSimMs: 0,
          spawned: true,
        },
        {
          callsign: "SWA999",
          runwayId: "27R",
          sidId: "POUNC2",
          scheduledSimMs: 120_000,
          spawned: false, // NOT spawned
        },
        {
          callsign: "UAL111",
          runwayId: "26L",
          sidId: "PLIER2",
          scheduledSimMs: 240_000,
          // spawned undefined
        },
      ],
    });

    const { departures, arrivals } = terminalStripsFromWorld(world);

    // Only activeDep is in world.aircraft
    expect(departures).toHaveLength(1);
    expect(departures[0]?.acid).toBe("DAL882");
    expect(arrivals).toHaveLength(0);

    // Unspawned scheduled departures must never appear in strips
    expect(departures.some((d) => d.acid === "SWA999")).toBe(false);
    expect(departures.some((d) => d.acid === "UAL111")).toBe(false);
  });

  test("correctly partitions departures vs arrivals based on SID, handoff, or scheduled flag", () => {
    // 1. VIA_SID vertical mode -> Departure
    const sidAc = createAircraft({
      callsign: "SWA1902",
      xNm: 2,
      yNm: 2,
      headingDeg: 90,
      altitudeFt: 2000,
      speedKt: 200,
      aircraftType: "B737",
    });
    sidAc.intent.vertical = { type: "VIA_SID", sidId: "POUNC2" };

    // 2. PROCEDURE lateral mode with sidId -> Departure
    const procSidAc = createAircraft({
      callsign: "FFT555",
      xNm: 3,
      yNm: 3,
      headingDeg: 90,
      altitudeFt: 2500,
      speedKt: 210,
    });
    procSidAc.intent.lateral = {
      type: "PROCEDURE",
      sidId: "PLIER2",
      toFixIndex: 0,
      routeFixIds: ["PLIER", "SPA"],
    };

    // 3. Departure handoff offered -> Departure
    const handoffAc = createAircraft({
      callsign: "JBU333",
      xNm: 1,
      yNm: 1,
      headingDeg: 270,
      altitudeFt: 1000,
      speedKt: 180,
    });

    // 4. Standard arrival -> Arrival
    const arrivalAc = createAircraft({
      callsign: "AAL222",
      xNm: 20,
      yNm: 20,
      headingDeg: 270,
      altitudeFt: 8000,
      speedKt: 250,
    });
    arrivalAc.intent.lateral = {
      type: "PROCEDURE",
      starId: "CHUNK2",
      toFixIndex: 1,
      routeFixIds: ["HONIE", "CHUNK"],
    };

    const world = createWorld({
      aircraft: [sidAc, procSidAc, handoffAc, arrivalAc],
    });
    offerDepartureHandoff(world, handoffAc);

    const { departures, arrivals } = terminalStripsFromWorld(world);

    expect(departures).toHaveLength(3);
    const depCallsigns = departures.map((d) => d.acid);
    expect(depCallsigns).toContain("SWA1902");
    expect(depCallsigns).toContain("FFT555");
    expect(depCallsigns).toContain("JBU333");

    expect(arrivals).toHaveLength(1);
    expect(arrivals[0]?.acid).toBe("AAL222");
    expect(arrivals[0]?.previousFix).toBe("HONIE");
    expect(arrivals[0]?.coordinationFix).toBe("CHUNK");
    expect(arrivals[0]?.remarks).toBe("");
    expect(arrivals[0]?.box9C).toBe("CHUNK2");
  });

  test("stably sorts departures and arrivals by callsign", () => {
    const acZ = createAircraft({
      callsign: "ZBW100",
      xNm: 0,
      yNm: 0,
      headingDeg: 0,
      altitudeFt: 5000,
      speedKt: 200,
    });
    const acA = createAircraft({
      callsign: "AAL100",
      xNm: 0,
      yNm: 0,
      headingDeg: 0,
      altitudeFt: 5000,
      speedKt: 200,
    });
    const acM = createAircraft({
      callsign: "DAL100",
      xNm: 0,
      yNm: 0,
      headingDeg: 0,
      altitudeFt: 5000,
      speedKt: 200,
    });

    const world = createWorld({
      aircraft: [acZ, acA, acM],
    });

    const { arrivals } = terminalStripsFromWorld(world);
    expect(arrivals.map((a) => a.acid)).toEqual(["AAL100", "DAL100", "ZBW100"]);
  });
});
