import { describe, expect, it } from "vitest";
import { parseRadioText } from "../parseRadioText";
import { parseSpokenGrammar } from "../spoken/grammar";
import { matchSpokenPatterns } from "../spoken/pattern-matcher";
import { isLegalInstruction, pathCResultIsComplete, schemaCheckPathC } from "../path-c";
import { INSTRUCTION_TYPES, type Instruction } from "../../core/command/types";

describe("ACKNOWLEDGE_IFR_CANCELLATION parser & parity", () => {
  it("includes ACKNOWLEDGE_IFR_CANCELLATION in INSTRUCTION_TYPES", () => {
    expect(INSTRUCTION_TYPES).toContain("ACKNOWLEDGE_IFR_CANCELLATION");
  });

  describe("Typed parsing (parseRadioText)", () => {
    it("parses valid full typed phrase", () => {
      const res = parseRadioText("DAL123 IFR cancellation received");
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("DAL123");
      expect(res.instructions).toEqual([{ type: "ACKNOWLEDGE_IFR_CANCELLATION" }]);
    });

    it("parses case-insensitively", () => {
      const res = parseRadioText("dal123 ifr cancellation received");
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([{ type: "ACKNOWLEDGE_IFR_CANCELLATION" }]);
    });

    it("rejects incomplete phrase", () => {
      const res = parseRadioText("DAL123 IFR cancellation");
      expect(res.ok).toBe(false);
    });

    it("rejects compound / multi-instruction commands", () => {
      const res = parseRadioText("DAL123 IFR cancellation received C20");
      expect(res.ok).toBe(false);
    });
  });

  describe("Spoken Path A (parseSpokenGrammar)", () => {
    it("parses spoken full phrase", () => {
      const res = parseSpokenGrammar(
        "delta one two three ifr cancellation received",
        undefined,
        "Delta 123, IFR cancellation received",
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("DAL123");
      expect(res.instructions).toEqual([{ type: "ACKNOWLEDGE_IFR_CANCELLATION" }]);
    });
  });

  describe("Spoken Path B (matchSpokenPatterns)", () => {
    it("matches spoken patterns for cancellation acknowledgment", () => {
      const res = matchSpokenPatterns(
        "delta one two three ifr cancellation received",
        undefined,
        "Delta 123, IFR cancellation received",
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("DAL123");
      expect(res.instructions).toEqual([{ type: "ACKNOWLEDGE_IFR_CANCELLATION" }]);
    });
  });

  describe("Path C schema & semantics", () => {
    const validInst: Instruction = { type: "ACKNOWLEDGE_IFR_CANCELLATION" };

    it("accepts valid zero-argument instruction", () => {
      expect(isLegalInstruction(validInst)).toBe(true);
      expect(
        schemaCheckPathC({
          ok: true,
          callsignToken: "DAL123",
          instructions: [validInst],
        }),
      ).toEqual({
        callsignToken: "DAL123",
        instructions: [validInst],
      });
    });

    it("rejects instruction with extra keys", () => {
      expect(
        isLegalInstruction({
          type: "ACKNOWLEDGE_IFR_CANCELLATION",
          extra: 123,
        } as unknown as Instruction),
      ).toBe(false);
    });

    it("validates semantic completeness requiring transcript evidence via pathCResultIsComplete", () => {
      expect(pathCResultIsComplete("DAL123 IFR cancellation received", [validInst])).toBe(true);
      expect(
        pathCResultIsComplete("DAL123 IFR cancellation received", [
          { type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" },
        ]),
      ).toBe(false);
    });
  });
});
