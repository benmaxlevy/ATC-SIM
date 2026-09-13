import { describe, expect, it } from "vitest";
import { parseCommand, parseRadioText } from "@parse";

describe("T02-177 MAINTAIN VFR parsing", () => {
  it("parses the exact typed token to the canonical IR", () => {
    expect(parseRadioText("DAL123 MVFR")).toMatchObject({
      ok: true,
      instructions: [{ type: "MAINTAIN_VFR" }],
    });
  });

  it("keeps spoken and typed forms source-parallel", async () => {
    const result = await parseCommand("maintain VFR", { source: "voice", pathC: false });
    expect(result).toMatchObject({
      ok: true,
      parseStage: "spoken_a",
      source: "voice",
      instructions: [{ type: "MAINTAIN_VFR" }],
    });
  });

  it("does not map VFR ON TOP to MAINTAIN_VFR", async () => {
    expect(parseRadioText("DAL123 VFR ON TOP")).toMatchObject({ ok: false });
    expect(await parseCommand("VFR ON TOP", { source: "voice", pathC: false })).toMatchObject({
      ok: false,
    });
  });

  it("preserves ordered combined instructions", async () => {
    const result = await parseCommand("DAL123 maintain VFR squawk VFR", {
      source: "text",
      pathC: false,
    });
    expect(result).toMatchObject({
      ok: true,
      instructions: [
        { type: "MAINTAIN_VFR" },
        { type: "ASSIGN_SQUAWK", code: "1200", source: "VFR" },
      ],
    });
  });
});
