import type { ArrivalStripData, DepartureStripData, FlightStrip } from "./types";

export const mockDAL882: DepartureStripData = {
  id: "DAL882",
  stripType: "DEPARTURE",
  acid: "DAL882",
  revisionNumber: 0,
  rawType: "B738",
  equipmentSuffix: "L",
  isHeavy: false,
  cwtCategory: "D",
  cid: "101",
  beaconCode: "4215",
  proposedDepartureTime: "1430",
  requestedAltitude: "330",
  departureAirport: "KATL",
  route: "PLIER2 PLIER SPA J51 FAK PHL",
  destinationAirport: "KPHL",
  remarks: "RNAV / CPDLC",
  annotationBoxes: {
    box8A: "26L",
    box8B: "D",
    boxes10to18: ["", "", "", "", "", "", "", "", ""],
  },
};

export const mockSWA1902: DepartureStripData = {
  id: "SWA1902",
  stripType: "DEPARTURE",
  acid: "SWA1902",
  revisionNumber: 1,
  rawType: "B737",
  equipmentSuffix: "G",
  isHeavy: false,
  cwtCategory: "E",
  cid: "102",
  beaconCode: "2104",
  proposedDepartureTime: "1435",
  requestedAltitude: "310",
  departureAirport: "KATL",
  route: "POUNC2 POUNC BNA STL",
  destinationAirport: "KMDW",
  remarks: "WTR NO",
  annotationBoxes: {
    box8A: "27R",
    box8B: "T",
    boxes10to18: ["", "", "", "", "", "", "", "", ""],
  },
};

export const mockAAL412: ArrivalStripData = {
  id: "AAL412",
  stripType: "ARRIVAL",
  acid: "AAL412",
  revisionNumber: 0,
  rawType: "A321",
  equipmentSuffix: "L",
  isHeavy: false,
  cwtCategory: "D",
  cid: "201",
  beaconCode: "0120",
  previousFix: "BOS",
  coordinationFix: "HONIE",
  estimatedTimeOfArrival: "1440",
  flightRules: "IFR",
  destinationAirport: "KATL",
  remarks: "RNAV STAR",
  annotationBoxes: {
    box8A: "26R",
    box8B: "A",
    boxes10to18: ["", "", "", "", "", "", "", "", ""],
  },
};

export const mockN415SP: ArrivalStripData = {
  id: "N415SP",
  stripType: "ARRIVAL",
  acid: "N415SP",
  revisionNumber: 0,
  rawType: "C172",
  equipmentSuffix: "G",
  isHeavy: false,
  cwtCategory: "I",
  cid: "202",
  beaconCode: "1200",
  previousFix: "FFC",
  coordinationFix: "PDK",
  estimatedTimeOfArrival: "1445",
  flightRules: "VFR",
  destinationAirport: "KPDK",
  remarks: "TOUCH AND GO",
  annotationBoxes: {
    box8A: "21L",
    box8B: "V",
    boxes10to18: ["", "", "", "", "", "", "", "", ""],
  },
};

export const mockDepartures: DepartureStripData[] = [mockDAL882, mockSWA1902];
export const mockArrivals: ArrivalStripData[] = [mockAAL412, mockN415SP];
export const mockFlightStrips: FlightStrip[] = [...mockDepartures, ...mockArrivals];

export const MOCK_DEPARTURES = mockDepartures;
export const MOCK_ARRIVALS = mockArrivals;
export const MOCK_FLIGHT_STRIPS = mockFlightStrips;
