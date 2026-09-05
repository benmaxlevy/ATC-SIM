import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import { StripsContextMenu } from "../StripsContextMenu";

const cssContent = readFileSync(new URL("../strips.css", import.meta.url), "utf8");

describe("T02-98 Strip Bay Custom Context Menu Component", () => {
  test("renders menu items with labels and styles", () => {
    const items = [
      { label: "Add Separator", action: vi.fn(), testId: "add-sep-item" },
      { label: "Delete", action: vi.fn(), danger: true, testId: "delete-item" },
    ];
    const html = renderToStaticMarkup(
      createElement(StripsContextMenu, {
        x: 100,
        y: 200,
        items,
        onClose: vi.fn(),
      }),
    );

    expect(html).toContain('class="strips-context-menu"');
    expect(html).toContain('data-testid="strips-context-menu"');
    expect(html).toContain('style="left:100px;top:200px"');
    expect(html).toContain("Add Separator");
    expect(html).toContain("Delete");
    expect(html).toContain("danger");
  });

  test("clicking an item calls its action and closes menu", () => {
    const actionMock = vi.fn();
    const onCloseMock = vi.fn();
    const items = [{ label: "Add Separator", action: actionMock }];

    const rendered = StripsContextMenu({
      x: 50,
      y: 50,
      items,
      onClose: onCloseMock,
    });

    const fakeClick = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    const buttonChild = rendered.props.children[0];
    buttonChild.props.onClick(fakeClick);

    expect(fakeClick.stopPropagation).toHaveBeenCalledTimes(1);
    expect(actionMock).toHaveBeenCalledTimes(1);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  test("CSS rules for .strips-context-menu are defined", () => {
    expect(cssContent).toContain(".strips-context-menu");
    expect(cssContent).toContain("position: fixed;");
    expect(cssContent).toContain("z-index: 1000;");
    expect(cssContent).toContain("background-color: #161b22;");
    expect(cssContent).toContain(".strips-context-menu-item.danger");
  });
});
