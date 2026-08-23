import { expect, test } from "vitest";
import { SessionLog, acceptInboundHandoff, handoffFor } from "@core";
import { handleRadioText } from "./handleRadioText";
import { createWorldFromScenario, loadKdem, loadKdemIls27 } from "@scenario";

test("T04-16 AC2 — DAL123 H270 on pending inbound is rejected; heading unchanged", async () => {
  const world = createWorldFromScenario(loadKdem(), 1);
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  const headingBefore = dal.headingDeg;
  const assignedBefore = dal.intent.assignedHeadingDeg;
  const lateralBefore = dal.intent.lateral;
  const log = new SessionLog();

  const result = await handleRadioText(world, "DAL123 H270", log);

  expect(result.accepted).toBe(false);
  expect(result.reason).toBe("handoff-pending");
  expect(dal.headingDeg).toBe(headingBefore);
  expect(dal.intent.assignedHeadingDeg).toBe(assignedBefore);
  expect(dal.intent.lateral).toEqual(lateralBefore);
  expect(log.byType("command.rejected")).toHaveLength(1);
  expect(log.byType("command.rejected")[0]?.reason).toBe("handoff-pending");
  expect(log.byType("command.accepted")).toHaveLength(0);
  expect(handoffFor(world, dal.id).kind).toBe("inbound");
});

test("T04-16 AC3 — after acceptInboundHandoff, H270 applies and cancels FMS", async () => {
  const world = createWorldFromScenario(loadKdem(), 1);
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  expect(dal.intent.lateral?.type).toBe("PROCEDURE");
  expect(acceptInboundHandoff(world, dal.id)).toBe(true);
  expect(handoffFor(world, dal.id)).toEqual({ kind: "none" });

  const log = new SessionLog();
  const result = await handleRadioText(world, "DAL123 H270", log);

  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(dal.intent.lateral).toEqual({ type: "HEADING", headingDeg: 270 });
  expect(dal.intent.vertical).toEqual({ type: "ASSIGNED" });
  expect(log.byType("command.accepted")).toHaveLength(1);
  expect(log.byType("command.rejected")).toHaveLength(0);
  expect(world.sessionLog?.byType("handoff.inbound.accepted")).toHaveLength(1);
});

test("T04-16 AC4 — kdem-ils27 DAL123 H270 still applies without accept", async () => {
  const world = createWorldFromScenario(loadKdemIls27());
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  const aal = world.aircraft.find((ac) => ac.callsign === "AAL45")!;
  expect(handoffFor(world, dal.id)).toEqual({ kind: "none" });
  expect(handoffFor(world, aal.id)).toEqual({ kind: "none" });

  const log = new SessionLog();
  const result = await handleRadioText(world, "DAL123 H270", log);

  expect(result.accepted).toBe(true);
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(log.byType("command.accepted")).toHaveLength(1);
  expect(log.byType("command.rejected")).toHaveLength(0);
});
