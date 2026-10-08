import type { Instruction } from "@core";

/** Parser-only ordering rules for the CANCEL_APPROACH prefix. */
export function cancelApproachSequenceError(instructions: readonly Instruction[]): string | null {
  const cancellationIndexes = instructions.reduce<number[]>((indexes, instruction, index) => {
    if (instruction.type === "CANCEL_APPROACH") indexes.push(index);
    return indexes;
  }, []);
  if (cancellationIndexes.length === 0) return null;
  if (cancellationIndexes[0] !== 0) return "CANCEL_APPROACH must be the first instruction";
  if (cancellationIndexes.length !== 1) return "CANCEL_APPROACH may be issued only once";
  if (
    instructions
      .slice(1)
      .some((instruction) =>
        new Set([
          "CLEARED_APPROACH",
          "INTERCEPT_LOCALIZER",
          "EXPECT_APPROACH",
          "GO_AROUND",
          "CLEARED_VISUAL",
        ]).has(instruction.type),
      )
  ) {
    return "CANCEL_APPROACH cannot be followed by approach or go-around instructions";
  }
  return null;
}
