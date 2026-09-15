/**
 * VFR pilot request data types (T04-72).
 *
 * Models unsolicited airborne VFR pilot calls for flight following and IFR pickups,
 * as well as pilot IFR cancellation scheduling candidates.
 *
 * State boundary: request records only. No mutation of aircraft operational state,
 * radio contact, radar identification, service, or flight rules.
 */

export type VfrPilotRequestKind = "FLIGHT_FOLLOWING" | "IFR_PICKUP";
export type VfrPilotRequestState = "PENDING" | "TRANSMITTED" | "WITHDRAWN";

export interface VfrPilotRequest {
  id: string;
  aircraftId: string;
  callsign: string;
  kind: VfrPilotRequestKind;
  createdAtSimMs: number;
  dueAtSimMs: number;
  state: VfrPilotRequestState;
  positionNm: { xNm: number; yNm: number };
  altitudeFt: number;
  headingDeg: number;
  aircraftType?: string;
  destinationAirportId?: string;
  requestedAltitudeFt?: number;
  withdrawnReason?: string;
}

export type IfrCancellationState = "PENDING" | "TRANSMITTED" | "WITHDRAWN";

export interface IfrCancellationCandidate {
  id: string;
  aircraftId: string;
  callsign: string;
  scheduledAtSimMs: number;
  dueAtSimMs: number;
  state: IfrCancellationState;
  withdrawnReason?: string;
}
