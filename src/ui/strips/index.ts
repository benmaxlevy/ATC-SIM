// Existing FlightStrips component and scope list utilities
export {
  FlightStrips,
  STRIP_BAY_EMPTY,
  STRIP_BAY_HEADING,
  compareCallsigns,
  focusPpi,
  formatAssignedAltitudeHundreds,
  formatAssignedHeading,
  formatAssignedSpeed,
  selectTrackFromStrip,
  sortStripsByCallsign,
  stripsFromWorld,
  syncStripCallsignColors,
} from "./FlightStrips";
export type { FlightStripView, FlightStripsProps } from "./FlightStrips";

// Domain models & types
export type {
  ArrivalStripData,
  BaseStripData,
  CWTCategory,
  DepartureStripData,
  FlightRules,
  FlightStrip,
  StripAnnotationBoxes,
} from "./types";

// Formatting utilities
export {
  formatBeaconCode,
  formatEquipment,
  formatRevisionIndex,
  formatTimeZulu,
  truncateField,
} from "./stripFormatter";

// Mock fixtures
export {
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
} from "./mockFixture";

// Strip components
export { DepartureStrip } from "./DepartureStrip";
export type { DepartureStripProps } from "./DepartureStrip";
export { ArrivalStrip } from "./ArrivalStrip";
export type { ArrivalStripProps } from "./ArrivalStrip";

// Strips board & bay layout
export { StripsBoard, DEFAULT_FACILITY_TITLE } from "./StripsBoard";
export type { StripsBoardProps } from "./StripsBoard";
