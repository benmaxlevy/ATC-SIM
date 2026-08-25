/**
 * Core ownership and handoff module.
 * Re-exports tower, center, inbound, and departure handoff lifecycle functions.
 */

export {
  DEFAULT_CENTER_SECTOR_ID,
  DEFAULT_INBOUND_SECTOR_ID,
  DEFAULT_TOWER_SECTOR_ID,
  HANDOFF_PENDING_REASON,
  NONE_HANDOFF,
  acceptInboundHandoff,
  assertHandoffOwned,
  handoffFor,
  initiateCenterHandoff,
  isCenterHandoffEligible,
  isRadioCommandAllowed,
  offerDepartureHandoff,
  offerInboundHandoff,
  setHandoffNone,
  type CenterHandoffContext,
  type TrackHandoff,
} from "./handoff";

export { acceptTowerHandoff, isTowerHandoffEligible, type LandingFmsContext } from "./fms/landing";
