import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { makeTestAircraft } from "@core";
import { applyIntent } from "@pilot";
import {
  DEFAULT_LEADER_DIR,
  LEADER_LENGTH_PX,
  datablockRect,
  datablockTopLeft,
  formatAltitudeHundreds,
  formatFullDatablock,
  formatGroundSpeedKt,
  formatLimitedDatablock,
  pointInDatablock,
} from "./datablock";
import { DATABLOCK_FONT, DATABLOCK_FONT_PX, SCOPE_FONT_STACK } from "./fonts";

function track(overrides: {
  callsign?: string;
  altitudeFt?: number;
  assignedAltitudeFt?: number;
  speedKt?: number;
}) {
  const ac = makeTestAircraft({
    callsign: overrides.callsign ?? "DAL123",
    altitudeFt: overrides.altitudeFt ?? 3000,
    speedKt: overrides.speedKt ?? 210,
  });
  if (overrides.assignedAltitudeFt != null) {
    ac.intent.assignedAltitudeFt = overrides.assignedAltitudeFt;
  }
  return ac;
}

test("AC1 — formatter fixtures: same-alt, different-alt, rounding 3250 ft, GS 210", () => {
  const same = formatFullDatablock(
    track({ altitudeFt: 3000, assignedAltitudeFt: 3000, speedKt: 210 }),
  );
  expect(same).toEqual({ line1: "DAL123", line2: "030  210" });

  const rounded = formatFullDatablock(
    track({ altitudeFt: 3250, assignedAltitudeFt: 3000, speedKt: 210 }),
  );
  expect(formatAltitudeHundreds(3250)).toBe("033");
  expect(rounded).toEqual({ line1: "DAL123", line2: "033  030  210" });

  expect(formatGroundSpeedKt(210)).toBe("210");
  expect(formatGroundSpeedKt(209.6)).toBe("210");
  expect(formatGroundSpeedKt(90)).toBe("090");
});

test("Mode C hidden: GS only when assigned matches; assigned + GS when different", () => {
  const same = formatFullDatablock(
    track({ altitudeFt: 3000, assignedAltitudeFt: 3000, speedKt: 210 }),
    {
      modeCVisible: false,
    },
  );
  expect(same.line2).toBe("210");

  const different = formatFullDatablock(
    track({ altitudeFt: 3200, assignedAltitudeFt: 4000, speedKt: 210 }),
    { modeCVisible: false },
  );
  expect(different.line2).toBe("040  210");
});

test("assigned field appears only when |assigned − Mode C| ≥ 100 ft", () => {
  const under = formatFullDatablock(
    track({ altitudeFt: 3050, assignedAltitudeFt: 3000, speedKt: 210 }),
  );
  expect(under.line2).toBe("031  210");

  const atBoundary = formatFullDatablock(
    track({ altitudeFt: 3100, assignedAltitudeFt: 3000, speedKt: 210 }),
  );
  expect(atBoundary.line2).toBe("031  030  210");
});

test("limited datablock is Mode C hundreds only and ignores M", () => {
  const ac = track({ altitudeFt: 3250, assignedAltitudeFt: 4000, speedKt: 210 });
  expect(formatLimitedDatablock(ac)).toEqual({ line1: "033" });
  expect(formatLimitedDatablock(ac).line1).toBe(formatAltitudeHundreds(ac.altitudeFt));
});

test("Mode C hundreds clamp to 000–999", () => {
  expect(formatAltitudeHundreds(-50)).toBe("000");
  expect(formatAltitudeHundreds(100_000)).toBe("999");
  expect(formatAltitudeHundreds(Number.NaN)).toBe("000");
});

test("AC3 — C/D/A assigned altitude with Mode C lag ≥ 100 ft shows both fields", () => {
  const ac = makeTestAircraft({
    callsign: "DAL123",
    altitudeFt: 8000,
    speedKt: 210,
  });
  applyIntent(ac, [{ type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }], 0);
  expect(ac.intent.assignedAltitudeFt).toBe(3000);
  expect(ac.altitudeFt).toBe(8000);
  expect(formatFullDatablock(ac).line2).toBe("080  030  210");

  applyIntent(ac, [{ type: "ALTITUDE", altitudeFt: 9000, verb: "CLIMB" }], 0);
  expect(formatFullDatablock(ac).line2).toBe("080  090  210");

  applyIntent(ac, [{ type: "ALTITUDE", altitudeFt: 8000, verb: "MAINTAIN" }], 0);
  expect(formatFullDatablock(ac).line2).toBe("080  210");
});

test("default L8 offset is north 24 px; rect contains the text cell", () => {
  expect(DEFAULT_LEADER_DIR).toBe(8);
  expect(LEADER_LENGTH_PX).toBe(24);
  expect(datablockTopLeft(100, 200)).toEqual({ x: 100, y: 176 });
  const full = datablockRect(100, 200, { line1: "DAL123", line2: "030  210" }, 7.2, 12);
  expect(full.y).toBe(176);
  expect(full.h).toBe(24);
  expect(pointInDatablock(110, 180, full)).toBe(true);
  expect(pointInDatablock(100, 200, full)).toBe(false);
  const limited = datablockRect(100, 200, { line1: "033" }, 7.2, 12);
  expect(limited.h).toBe(12);
});

test("AC9 — formatters and font say datablock / Mode C, not label; FDB/LDB + omitted fields", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./datablock.ts"] ?? "";
  expect(src).toMatch(/datablock/);
  expect(src).toMatch(/Mode C/);
  expect(src).toMatch(/PCG/);
  expect(src).toMatch(/FDB/);
  expect(src).toMatch(/LDB/);
  expect(src).toMatch(/scratchpad/);
  expect(src).toMatch(/beacon/);
  expect(src).toMatch(/CSI/);
  expect(src).toMatch(/Never a label/);
  expect(src).not.toMatch(/function formatLabel/);
  expect(DATABLOCK_FONT).toContain("IBM Plex Mono");
  expect(DATABLOCK_FONT).toContain("monospace");
  expect(DATABLOCK_FONT_PX).toBe(12);
  expect(SCOPE_FONT_STACK).toContain("IBM Plex Mono");
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  expect(html).toMatch(/IBM\+Plex\+Mono/);
});
