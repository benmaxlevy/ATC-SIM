import { expect, test } from "vitest";
import { readbackForTts } from "./tts-text";

test("strips altitude hundreds in parentheses and leaves spoken grouping", () => {
  expect(readbackForTts("descend and maintain three thousand (3000)")).toBe(
    "descend and maintain three thousand",
  );
  expect(readbackForTts("through one-zero thousand (10000)")).toBe("through one-zero thousand");
  expect(
    readbackForTts(
      "Delta 123 heading 270, descend and maintain three thousand (3000), maintain 210 knots",
    ),
  ).toBe("Delta 123 heading 270, descend and maintain three thousand, maintain 210 knots");
});

test("leaves flight levels and text without parens unchanged", () => {
  expect(readbackForTts("climb and maintain FL 180")).toBe("climb and maintain FL 180");
  expect(readbackForTts("Delta 123 heading 270")).toBe("Delta 123 heading 270");
});
