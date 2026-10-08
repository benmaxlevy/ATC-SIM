/**
 * Operational service view (T04-73).
 *
 * Provides an effective operational-service view (flight following, radar identification)
 * for scope and list consumers without rewriting flight plans, mutating flight rules,
 * changing active IFR clearances, or altering CA/MSAW evaluations.
 */

import type { Aircraft } from "../aircraft";
import type { World } from "../world";
import {
  findLatestRadioRequest,
  findOpenRadioRequest,
  type RadioContactReport,
  type RadioRequest,
} from "./requests";

export interface OperationalServiceState {
  aircraftId: string;
  callsign: string;
  flightRules: string;
  flightFollowingActive: boolean;
  flightFollowingApprovedAtSimMs?: number;
  radarIdentified: boolean;
  radarContact?: RadioContactReport;
  activeRequest?: RadioRequest;
  latestRequest?: RadioRequest;
}

export function getOperationalService(world: World, aircraft: Aircraft): OperationalServiceState {
  const activeRequest = findOpenRadioRequest(world.radioRequests, aircraft.id);
  const latestRequest = findLatestRadioRequest(world.radioRequests, aircraft.id);

  const flightFollowingActive = Boolean(aircraft.flightFollowing?.active);
  const radarContact = aircraft.radarContact ?? activeRequest?.radarContact;
  const radarIdentified = Boolean(
    aircraft.radarContact ||
    activeRequest?.status === "IDENTIFIED" ||
    activeRequest?.status === "APPROVED" ||
    flightFollowingActive,
  );

  return {
    aircraftId: aircraft.id,
    callsign: aircraft.callsign,
    flightRules: aircraft.flightRules ?? "VFR",
    flightFollowingActive,
    flightFollowingApprovedAtSimMs: aircraft.flightFollowing?.approvedAtSimMs,
    radarIdentified,
    radarContact,
    activeRequest,
    latestRequest,
  };
}
