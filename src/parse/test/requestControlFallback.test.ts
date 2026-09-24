import { describe, expect, it, vi } from "vitest";
import { parseCommand } from "../parse-command";
import { parseRadioText } from "../parseRadioText";
import { parseSpokenGrammar } from "../spoken/grammar";
import { matchSpokenPatterns } from "../spoken/pattern-matcher";
import {
  isLegalInstruction,
  pathCHasSelfContainedCue,
  pathCResultIsComplete,
  type ParsePathCFn,
} from "../path-c";
import type { Instruction } from "../../core/command/types";

/**
 * Mocked-model Path C fallback for the branch request-control commands.
 * Each transcript breaks every deterministic stage (trailing unclaimed
 * trigger word) while keeping the transcript cues the completeness guard
 * requires, then proves the injected model result reaches `llm_c`.
 */
describe("request-control Path C fallback (mocked model)", () => {
  const cases: Array<{ name: string; text: string; instructions: Instruction[] }> = [
    {
      name: "say request",
      text: "dal123 say request squawk",
      instructions: [{ type: "REQUEST_DETAILS" }],
    },
    {
      name: "standby",
      text: "dal123 standby squawk",
      instructions: [{ type: "STANDBY_REQUEST" }],
    },
    {
      name: "approve flight following",
      text: "dal123 approve flight following squawk",
      instructions: [{ type: "APPROVE_FLIGHT_FOLLOWING" }],
    },
    {
      name: "unable flight following",
      text: "dal123 unable flight following squawk",
      instructions: [{ type: "DECLINE_REQUEST", service: "FLIGHT_FOLLOWING" }],
    },
    {
      name: "unable ifr pickup",
      text: "dal123 unable ifr pickup squawk",
      instructions: [{ type: "DECLINE_REQUEST", service: "IFR_PICKUP" }],
    },
    {
      name: "unable class b clearance",
      text: "dal123 unable class b clearance squawk",
      instructions: [{ type: "DECLINE_REQUEST", service: "CLASS_B_ACCESS" }],
    },
    {
      name: "radar service terminated",
      text: "dal123 radar service terminated squawk",
      instructions: [{ type: "TERMINATE_RADAR_SERVICE" }],
    },
    {
      name: "ifr cancellation received",
      text: "dal123 ifr cancellation received squawk",
      instructions: [{ type: "ACKNOWLEDGE_IFR_CANCELLATION" }],
    },
    {
      name: "cleared visual approach",
      text: "dal123 cleared visual approach runway two seven left squawk",
      instructions: [{ type: "CLEARED_VISUAL", runwayId: "27L" }],
    },
  ];

  for (const { name, text, instructions } of cases) {
    it(`salvages ${name} when local stages miss`, async () => {
      const model = vi.fn<ParsePathCFn>(async () => ({
        callsignToken: "DAL123",
        instructions,
      }));
      const res = await parseCommand(text, {
        source: "voice",
        callsigns: ["DAL123"],
        pathC: true,
        parsePathC: model,
      });
      expect(model).toHaveBeenCalled();
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.parseStage).toBe("llm_c");
      expect(res.instructions).toEqual(instructions);
    });
  }
});

describe("DECLINE_REQUEST IFR_PICKUP parity", () => {
  const IFR_DECLINE: Instruction = { type: "DECLINE_REQUEST", service: "IFR_PICKUP" };

  it("parses typed unable ifr pickup forms", () => {
    for (const text of ["DAL123 UNABLE IFR PICKUP", "DAL123 UNABLE TO PROVIDE IFR PICKUP"]) {
      const res = parseRadioText(text);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      expect(res.instructions).toEqual([IFR_DECLINE]);
    }
  });

  it("parses spoken unable ifr pickup (Paths A and B)", () => {
    const text = "delta one two three unable ifr pickup";
    const raw = "Delta 123, unable IFR pickup";
    const a = parseSpokenGrammar(text, undefined, raw);
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.instructions).toEqual([IFR_DECLINE]);
    const b = matchSpokenPatterns(text, undefined, raw);
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.instructions).toEqual([IFR_DECLINE]);
  });

  it("requires matching service evidence in Path C completeness", () => {
    expect(pathCResultIsComplete("DAL123 unable ifr pickup", [IFR_DECLINE])).toBe(true);
    expect(pathCResultIsComplete("DAL123 unable to provide ifr pickup", [IFR_DECLINE])).toBe(true);
    expect(pathCResultIsComplete("DAL123 unable flight following", [IFR_DECLINE])).toBe(false);
    expect(
      pathCResultIsComplete("DAL123 unable ifr pickup", [
        { type: "DECLINE_REQUEST", service: "FLIGHT_FOLLOWING" },
      ]),
    ).toBe(false);
    expect(isLegalInstruction({ type: "DECLINE_REQUEST", service: "IFR_PICKUP" })).toBe(true);
  });

  it("marks request-control transcripts as self-contained cues", () => {
    for (const text of [
      "dal123 say request squawk",
      "dal123 standby squawk",
      "dal123 approve flight following squawk",
      "dal123 unable flight following squawk",
      "dal123 unable ifr pickup squawk",
      "dal123 radar service terminated squawk",
      "dal123 ifr cancellation received squawk",
      "dal123 cleared visual approach runway two seven left squawk",
      "dal123 maintain vfr squawk",
    ]) {
      expect(pathCHasSelfContainedCue(text), text).toBe(true);
    }
    expect(pathCHasSelfContainedCue("dal123 turn left heading 270")).toBe(false);
    expect(pathCHasSelfContainedCue("pizza the runway")).toBe(false);
  });
});

describe("Class B request-response parity", () => {
  it.each(["DAL123 CLEARED AS REQUESTED", "DAL123 cleared as requested"])(
    "parses exact approval: %s",
    (text) => {
      const typed = parseRadioText(text);
      expect(typed.ok).toBe(true);
      if (typed.ok)
        expect(typed.instructions).toEqual([{ type: "CLASS_B_CLEARANCE_AS_REQUESTED" }]);
      const raw = "Delta 123 cleared as requested";
      const a = parseSpokenGrammar("delta one two three cleared as requested", undefined, raw);
      expect(a.ok).toBe(true);
      if (a.ok) expect(a.instructions).toEqual([{ type: "CLASS_B_CLEARANCE_AS_REQUESTED" }]);
      const b = matchSpokenPatterns("delta one two three cleared as requested", undefined, raw);
      expect(b.ok).toBe(true);
      if (b.ok) expect(b.instructions).toEqual([{ type: "CLASS_B_CLEARANCE_AS_REQUESTED" }]);
    },
  );

  it.each(["unable class b clearance", "unable to provide class b clearance"])(
    "parses exact denial: %s",
    (phrase) => {
      const res = parseRadioText(`DAL123 ${phrase}`);
      expect(res.ok).toBe(true);
      if (res.ok)
        expect(res.instructions).toEqual([{ type: "DECLINE_REQUEST", service: "CLASS_B_ACCESS" }]);
      expect(
        pathCResultIsComplete(`DAL123 ${phrase}`, [
          { type: "DECLINE_REQUEST", service: "CLASS_B_ACCESS" },
        ]),
      ).toBe(true);
    },
  );

  it("rejects approval modifiers and fuzzy denial", async () => {
    for (const phrase of [
      "cleared as requested via DEM",
      "cleared as requested maintain 3000",
      "unable transition through bravo",
    ]) {
      await expect(
        parseCommand(`DAL123 ${phrase}`, { source: "voice", pathC: false }),
      ).resolves.toMatchObject({ ok: false });
    }
    expect(isLegalInstruction({ type: "CLASS_B_CLEARANCE_AS_REQUESTED" })).toBe(true);
    expect(isLegalInstruction({ type: "CLASS_B_CLEARANCE_AS_REQUESTED", route: [] } as never)).toBe(
      false,
    );
  });
});
