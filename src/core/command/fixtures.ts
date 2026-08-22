import type { Command } from "./types";

export const fixtureFlyHeading = {
  id: "cmd-fly-heading",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }],
  sourceText: "DAL123 H270",
  source: "text",
} satisfies Command;

export const fixtureTurnDegrees = {
  id: "cmd-turn-degrees",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "TURN_DEGREES", direction: "LEFT", degrees: 20 }],
  sourceText: "DAL123 T20L",
  source: "text",
} satisfies Command;

export const fixturePresentHeading = {
  id: "cmd-present-heading",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "PRESENT_HEADING" }],
  sourceText: "DAL123 PH",
  source: "text",
} satisfies Command;

export const fixtureAltitude = {
  id: "cmd-altitude",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }],
  sourceText: "DAL123 D30",
  source: "text",
} satisfies Command;

export const fixtureSpeed = {
  id: "cmd-speed",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "SPEED", speedKt: 210, verb: "MAINTAIN" }],
  sourceText: "DAL123 S210",
  source: "text",
} satisfies Command;

export const fixtureDirect = {
  id: "cmd-direct",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "DIRECT", fixId: "FIX01" }],
  sourceText: "DAL123 DIRECT FIX01",
  source: "text",
} satisfies Command;

export const fixtureExpectApproach = {
  id: "cmd-expect-approach",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "EXPECT_APPROACH", approachId: "ILS27" }],
  sourceText: "DAL123 EXPECT ILS27",
  source: "text",
} satisfies Command;

export const fixtureClearedApproach = {
  id: "cmd-cleared-approach",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "CLEARED_APPROACH", approachId: "ILS27" }],
  sourceText: "DAL123 APP ILS27",
  source: "text",
} satisfies Command;

export const fixtureInterceptLocalizer = {
  id: "cmd-intercept-localizer",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "INTERCEPT_LOCALIZER", approachId: "ILS27" }],
  sourceText: "DAL123 IL ILS27",
  source: "text",
} satisfies Command;

export const fixtureIdent = {
  id: "cmd-ident",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "IDENT" }],
  sourceText: "DAL123 I",
  source: "text",
} satisfies Command;

export const fixtureSayHeading = {
  id: "cmd-say-heading",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "SAY_HEADING" }],
  sourceText: "DAL123 SAY HEADING",
  source: "text",
} satisfies Command;

export const fixtureSayAltitude = {
  id: "cmd-say-altitude",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "SAY_ALTITUDE" }],
  sourceText: "DAL123 SAY ALTITUDE",
  source: "text",
} satisfies Command;

export const fixtureDescendVia = {
  id: "cmd-descend-via",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "DESCEND_VIA", procedureId: "DEM1" }],
  sourceText: "DAL123 VIA DEM1",
  source: "text",
} satisfies Command;

export const fixtureClimbVia = {
  id: "cmd-climb-via",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "CLIMB_VIA", procedureId: "DEM1" }],
  sourceText: "DAL123 CVIA DEM1",
  source: "text",
} satisfies Command;

export const fixtureCross = {
  id: "cmd-cross",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "CROSS", fixId: "NEMAX", altitudeFt: 4000, restriction: "AT" }],
  sourceText: "DAL123 X NEMAX 40",
  source: "text",
} satisfies Command;

export const fixtureGoAround = {
  id: "cmd-go-around",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [{ type: "GO_AROUND" }],
  sourceText: "DAL123 GA",
  source: "text",
} satisfies Command;

/** Combined clearance: heading and altitude on one radio transmission. */
export const fixtureFlyHeadingAndAltitude = {
  id: "cmd-fly-heading-and-altitude",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [
    { type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" },
    { type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" },
  ],
  sourceText: "DAL123 H270 D30",
  source: "text",
} satisfies Command;

export const commandFixtures = [
  fixtureFlyHeading,
  fixtureTurnDegrees,
  fixturePresentHeading,
  fixtureAltitude,
  fixtureSpeed,
  fixtureDirect,
  fixtureExpectApproach,
  fixtureClearedApproach,
  fixtureInterceptLocalizer,
  fixtureIdent,
  fixtureSayHeading,
  fixtureSayAltitude,
  fixtureDescendVia,
  fixtureClimbVia,
  fixtureCross,
  fixtureGoAround,
  fixtureFlyHeadingAndAltitude,
] as const;
