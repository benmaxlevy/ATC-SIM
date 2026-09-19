import { describe, expect, it, vi } from "vitest";
import { parseCommand } from "../parse-command";
import { parseRadioText } from "../parseRadioText";
import { parseSpokenGrammar } from "../spoken/grammar";
import { matchSpokenPatterns } from "../spoken/pattern-matcher";
import {
  isLegalInstruction,
  pathCHasSelfContainedCue,
  pathCResultIsComplete,
  schemaCheckPathC,
  type ParsePathCFn,
} from "../path-c";
import { INSTRUCTION_TYPES, type Instruction } from "../../core/command/types";

const FULL: Instruction = {
  type: "RADAR_CONTACT",
  distanceNm: 5,
  referenceId: "DEM",
  referenceKind: "NAVAID",
};
const BARE: Instruction = { type: "RADAR_CONTACT" };
const DEM_NAVAD = [{ id: "DEM", kind: "NAVAID" as const }];
const KATL_AIRPORT = [
  { icao: "KATL", name: "Atlanta International", aliases: ["Atlanta Airport"] },
];
const AIRPORT_POS: Instruction = {
  type: "RADAR_CONTACT",
  distanceNm: 25,
  referenceId: "KATL",
  referenceKind: "AIRPORT",
};

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

    it("parses direction + of with a navaid reference", () => {
      const res = parseRadioText("DAL123 RADAR CONTACT 5 MILES SOUTHEAST OF DEM", {
        fixes: DEM_NAVAD,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.instructions).toEqual([FULL]);
    });

    it("parses an airport reference by name", () => {
      const res = parseRadioText(
        "N7214L RADAR CONTACT 25 MILES SOUTHEAST OF ATLANTA INTERNATIONAL AIRPORT",
        { airports: KATL_AIRPORT },
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("N7214L");
      expect(res.instructions).toEqual([AIRPORT_POS]);
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

    it("parses direction + of with a phonetic airport reference (field report)", () => {
      const text =
        "november seven two one four lima radar contact two five miles southeast of kilo alpha tango lima";
      const res = parseSpokenGrammar(text, undefined, text, [], undefined, undefined, KATL_AIRPORT);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("N7214L");
      expect(res.instructions).toEqual([AIRPORT_POS]);
    });

    it("parses direction + of with an airport name reference (field report)", () => {
      const text =
        "november seven two one four lima radar contact two eight miles southeast of atlanta international airport";
      const res = parseSpokenGrammar(text, undefined, text, [], undefined, undefined, KATL_AIRPORT);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("N7214L");
      expect(res.instructions).toEqual([{ ...AIRPORT_POS, distanceNm: 28 }]);
    });

    it("parses distances >= 100 NM (hundreds group and 3-digit digits)", () => {
      const text1 =
        "november seven two one four lima radar contact one hundred miles southeast of atlanta airport";
      const res1 = parseSpokenGrammar(
        text1,
        undefined,
        text1,
        [],
        undefined,
        undefined,
        KATL_AIRPORT,
      );
      expect(res1.ok).toBe(true);
      if (res1.ok) {
        expect(res1.instructions).toEqual([{ ...AIRPORT_POS, distanceNm: 100 }]);
      }

      const text2 =
        "november seven two one four lima radar contact one two zero miles southeast of atlanta airport";
      const res2 = parseSpokenGrammar(
        text2,
        undefined,
        text2,
        [],
        undefined,
        undefined,
        KATL_AIRPORT,
      );
      expect(res2.ok).toBe(true);
      if (res2.ok) {
        expect(res2.instructions).toEqual([{ ...AIRPORT_POS, distanceNm: 120 }]);
      }
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

    it("matches direction + of with a phonetic airport reference (field report)", () => {
      const text =
        "november seven two one four lima radar contact two five miles southeast of kilo alpha tango lima";
      const res = matchSpokenPatterns(
        text,
        undefined,
        text,
        [],
        undefined,
        undefined,
        undefined,
        KATL_AIRPORT,
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("N7214L");
      expect(res.instructions).toEqual([AIRPORT_POS]);
    });

    it("matches direction + of with an airport name reference (field report)", () => {
      const text =
        "november seven two one four lima radar contact two eight miles southeast of atlanta international airport";
      const res = matchSpokenPatterns(
        text,
        undefined,
        text,
        [],
        undefined,
        undefined,
        undefined,
        KATL_AIRPORT,
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("N7214L");
      expect(res.instructions).toEqual([{ ...AIRPORT_POS, distanceNm: 28 }]);
    });
  });

  describe("Path C schema & semantics", () => {
    it("accepts bare and full forms, rejects partial positions", () => {
      for (const inst of [BARE, FULL, AIRPORT_POS]) {
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
      expect(
        pathCResultIsComplete("DAL123 radar contact 25 miles southeast of KATL", [AIRPORT_POS]),
      ).toBe(true);
      expect(pathCResultIsComplete("DAL123 radar contact", [FULL])).toBe(false);
      expect(pathCResultIsComplete("DAL123 radar contact", [AIRPORT_POS])).toBe(false);
      expect(
        pathCResultIsComplete("DAL123 radar contact", [
          { type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" },
        ]),
      ).toBe(false);
    });

    it("accepts split-cardinal position evidence", () => {
      expect(
        pathCResultIsComplete("DAL123 radar contact 25 miles south east of KATL", [AIRPORT_POS]),
      ).toBe(true);
    });
  });

  describe("Path C fallback (mocked model)", () => {
    it("salvages bare radar contact when local stages miss", async () => {
      const model = vi.fn<ParsePathCFn>(async () => ({
        callsignToken: "N7214L",
        instructions: [BARE],
      }));
      const res = await parseCommand("november seven two one four lima radar contact squawk", {
        source: "voice",
        pathC: true,
        parsePathC: model,
      });
      expect(model).toHaveBeenCalled();
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.parseStage).toBe("llm_c");
      expect(res.instructions).toEqual([BARE]);
    });

    it("salvages an of-form fix position when local grounding misses", async () => {
      const fullFix: Instruction = {
        type: "RADAR_CONTACT",
        distanceNm: 25,
        referenceId: "KATL",
        referenceKind: "FIX",
      };
      const model = vi.fn<ParsePathCFn>(async () => ({
        callsignToken: null,
        instructions: [fullFix],
      }));
      const res = await parseCommand("radar contact 25 miles southeast of katl squawk", {
        source: "voice",
        pathC: true,
        fixes: ["KATL"],
        parsePathC: model,
      });
      expect(model).toHaveBeenCalled();
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.parseStage).toBe("llm_c");
      expect(res.instructions).toEqual([fullFix]);
    });

    it("salvages an airport reference with airports context", async () => {
      const model = vi.fn<ParsePathCFn>(async () => ({
        callsignToken: null,
        instructions: [AIRPORT_POS],
      }));
      const res = await parseCommand(
        "radar contact 25 miles southeast of kilo alpha tango lima squawk",
        {
          source: "voice",
          pathC: true,
          fixes: ["XXX"],
          airports: KATL_AIRPORT,
          parsePathC: model,
        },
      );
      expect(model).toHaveBeenCalled();
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.parseStage).toBe("llm_c");
      expect(res.instructions).toEqual([AIRPORT_POS]);
    });

    it("rejects an unlisted airport reference in Path C", async () => {
      const model = vi.fn<ParsePathCFn>(async () => ({
        callsignToken: null,
        instructions: [
          {
            type: "RADAR_CONTACT",
            distanceNm: 25,
            referenceId: "KUNK",
            referenceKind: "AIRPORT",
          },
        ],
      }));
      const res = await parseCommand("radar contact 25 miles southeast of unknown airport squawk", {
        source: "voice",
        pathC: true,
        fixes: ["XXX"],
        airports: KATL_AIRPORT,
        parsePathC: model,
      });
      expect(model).toHaveBeenCalled();
      expect(res.ok).toBe(false);
    });

    it("requires position fields when transcript contains position report", () => {
      expect(pathCResultIsComplete("radar contact 25 miles southeast of katl", [AIRPORT_POS])).toBe(
        true,
      );
      expect(pathCResultIsComplete("radar contact 25 miles southeast of katl", [BARE])).toBe(false);
      expect(pathCResultIsComplete("radar contact", [BARE])).toBe(true);
    });

    it("marks radar contact transcripts as self-contained cues", () => {
      expect(pathCHasSelfContainedCue("radar contact 25 miles southeast of katl over")).toBe(true);
      expect(pathCHasSelfContainedCue("dal123 radar contact")).toBe(true);
      expect(pathCHasSelfContainedCue("dal123 turn left heading 270")).toBe(false);
    });
  });

  describe("CLEARED_VISUAL spoken grammar (Path A)", () => {
    it("parses cleared visual approach in Path A", () => {
      const res = parseSpokenGrammar(
        "delta one two three cleared visual approach runway two seven left",
        undefined,
        "Delta 123, cleared visual approach runway 27L",
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("DAL123");
      expect(res.instructions).toEqual([{ type: "CLEARED_VISUAL", runwayId: "27L" }]);
    });

    it("parses cleared visual without approach word", () => {
      const res = parseSpokenGrammar(
        "delta one two three cleared visual runway two seven",
        undefined,
        "Delta 123, cleared visual runway 27",
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.callsignToken).toBe("DAL123");
      expect(res.instructions).toEqual([{ type: "CLEARED_VISUAL", runwayId: "27" }]);
    });
  });
});
