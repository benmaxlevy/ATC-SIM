import { describe, expect, it } from "vitest";
import { parseRadioText } from "../parseRadioText";
import { parseSpokenGrammar } from "../spoken/grammar";
import { matchSpokenPatterns } from "../spoken/pattern-matcher";
import { isLegalInstruction, pathCResultIsComplete, schemaCheckPathC } from "../path-c";
import { INSTRUCTION_TYPES, type Instruction } from "../../core/command/types";

const FULL: Instruction = {
  type: "RADAR_CONTACT",
  distanceNm: 5,
  referenceId: "DEM",
  referenceKind: "NAVAID",
};
const BARE: Instruction = { type: "RADAR_CONTACT" };
const DEM_NAVAD = [{ id: "DEM", kind: "NAVAID" as const }];

describe("RADAR_CONTACT parser & parity", () => {
  it("includes RADAR_CONTACT in INSTRUCTION_TYPES", () => {
    expect(INSTRUCTION_TYPES).toContain("RADAR_CONTACT");
  });

  describe("Typed parsing (parseRadioText)", () => {
    it("parses bare radar contact with no position report", () => {
      const res = parseRadioText("DAL123 RADAR CONTACT");
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("DAL123");
      expect(res.instructions).toEqual([BARE]);
    });

    it("parses the full position form", () => {
      const res = parseRadioText("DAL123 RADAR CONTACT 5 MILES FROM DEM");
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([
        { type: "RADAR_CONTACT", distanceNm: 5, referenceId: "DEM", referenceKind: "NAVAID" },
      ]);
    });

    it("rejects a partial position report", () => {
      expect(parseRadioText("DAL123 RADAR CONTACT 5").ok).toBe(false);
      expect(parseRadioText("DAL123 RADAR CONTACT 5 MILES").ok).toBe(false);
    });

    it("rejects compound / multi-instruction commands", () => {
      expect(parseRadioText("DAL123 RADAR CONTACT C20").ok).toBe(false);
    });
  });

  describe("Spoken Path A (parseSpokenGrammar)", () => {
    it("parses bare spoken radar contact", () => {
      const res = parseSpokenGrammar(
        "delta one two three radar contact",
        undefined,
        "Delta 123, radar contact",
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("DAL123");
      expect(res.instructions).toEqual([BARE]);
    });

    it("parses the full spoken position form", () => {
      const res = parseSpokenGrammar(
        "delta one two three radar contact five miles from delta echo mike",
        undefined,
        "Delta 123, radar contact 5 miles from DEM",
        DEM_NAVAD,
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([FULL]);
    });
  });

  describe("Spoken Path B (matchSpokenPatterns)", () => {
    it("matches bare spoken radar contact", () => {
      const res = matchSpokenPatterns(
        "delta one two three radar contact",
        undefined,
        "Delta 123, radar contact",
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("DAL123");
      expect(res.instructions).toEqual([BARE]);
    });

    it("matches the full spoken position form", () => {
      const res = matchSpokenPatterns(
        "delta one two three radar contact five miles from delta echo mike",
        undefined,
        "Delta 123, radar contact 5 miles from DEM",
        DEM_NAVAD,
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([FULL]);
    });
  });

  describe("Path C schema & semantics", () => {
    it("accepts bare and full forms, rejects partial positions", () => {
      for (const inst of [BARE, FULL]) {
        expect(isLegalInstruction(inst)).toBe(true);
        expect(
          schemaCheckPathC({ ok: true, callsignToken: "DAL123", instructions: [inst] }),
        ).toEqual({ callsignToken: "DAL123", instructions: [inst] });
      }
      expect(
        isLegalInstruction({ type: "RADAR_CONTACT", distanceNm: 5 } as unknown as Instruction),
      ).toBe(false);
      expect(
        isLegalInstruction({
          type: "RADAR_CONTACT",
          distanceNm: 5,
          referenceId: "DEM",
        } as unknown as Instruction),
      ).toBe(false);
      expect(
        isLegalInstruction({ type: "RADAR_CONTACT", extra: 1 } as unknown as Instruction),
      ).toBe(false);
    });

    it("requires transcript evidence for the position when present", () => {
      expect(pathCResultIsComplete("DAL123 radar contact", [BARE])).toBe(true);
      expect(pathCResultIsComplete("DAL123 radar contact 5 miles from DEM", [FULL])).toBe(true);
      expect(pathCResultIsComplete("DAL123 radar contact", [FULL])).toBe(false);
      expect(
        pathCResultIsComplete("DAL123 radar contact", [
          { type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" },
        ]),
      ).toBe(false);
    });
  });
});
