import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import { StripSeparator } from "../StripSeparator";
import type { StripSeparator as StripSeparatorModel } from "../types";
import { isStripSeparator } from "../types";

const cssContent = readFileSync(new URL("../strips.css", import.meta.url), "utf8");

describe("T02-97 Strip Separator Component and Direct Text Editing", () => {
  const sampleSeparator: StripSeparatorModel = {
    id: "sep-1",
    stripType: "SEPARATOR",
    label: "RWY 27L",
    section: "departures",
  };

  describe("AC1 & AC2 — Domain Model & Visual Structure", () => {
    test("isStripSeparator correctly identifies separator models", () => {
      expect(isStripSeparator(sampleSeparator)).toBe(true);
      expect(isStripSeparator({ id: "ac-1", stripType: "DEPARTURE" })).toBe(false);
      expect(isStripSeparator(null)).toBe(false);
      expect(isStripSeparator(undefined)).toBe(false);
    });

    test("renders .strip-separator element with role and aria-label", () => {
      const html = renderToStaticMarkup(
        createElement(StripSeparator, { separator: sampleSeparator }),
      );
      expect(html).toContain('class="strip-separator"');
      expect(html).toContain('data-testid="strip-separator-sep-1"');
      expect(html).toContain('role="separator"');
      expect(html).toContain('aria-label="Separator: RWY 27L"');
      expect(html).toContain("RWY 27L");
    });

    test("renders fallback text 'SEPARATOR' when label is empty", () => {
      const emptySep: StripSeparatorModel = {
        id: "sep-empty",
        stripType: "SEPARATOR",
        label: "",
        section: "arrivals",
      };
      const html = renderToStaticMarkup(createElement(StripSeparator, { separator: emptySep }));
      expect(html).toContain("SEPARATOR");
      expect(html).toContain('aria-label="Separator: SEPARATOR"');
    });

    test("applies .strip-dragging class when isDragging is true", () => {
      const html = renderToStaticMarkup(
        createElement(StripSeparator, { separator: sampleSeparator, isDragging: true }),
      );
      expect(html).toContain("strip-dragging");
    });
  });

  describe("AC3 & AC4 — Direct Text Entry and Editing", () => {
    test("renders input element when isEditing is true", () => {
      const html = renderToStaticMarkup(
        createElement(StripSeparator, { separator: sampleSeparator, isEditing: true }),
      );
      expect(html).toContain('class="strip-separator-input"');
      expect(html).toContain('data-testid="strip-separator-input-sep-1"');
      expect(html).toContain('value="RWY 27L"');
    });

    test("clicking card invokes onStartEdit when not editing", () => {
      const onStartEditMock = vi.fn();
      const rendered = StripSeparator({
        separator: sampleSeparator,
        isEditing: false,
        onStartEdit: onStartEditMock,
      });

      const fakeClick = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
      rendered.props.onClick?.(fakeClick);

      expect(fakeClick.stopPropagation).toHaveBeenCalledTimes(1);
      expect(onStartEditMock).toHaveBeenCalledTimes(1);
      expect(onStartEditMock).toHaveBeenCalledWith("sep-1");
    });

    test("right-click invokes onContextMenu and prevents default", () => {
      const onContextMenuMock = vi.fn();
      const rendered = StripSeparator({
        separator: sampleSeparator,
        onContextMenu: onContextMenuMock,
      });

      const fakeEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent;
      rendered.props.onContextMenu?.(fakeEvent);

      expect(fakeEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(fakeEvent.stopPropagation).toHaveBeenCalledTimes(1);
      expect(onContextMenuMock).toHaveBeenCalledTimes(1);
      expect(onContextMenuMock).toHaveBeenCalledWith(fakeEvent, sampleSeparator);
    });
  });

  describe("CSS specifications for compact divider bar", () => {
    test("defines .strip-separator with compact height 38px and distinct styling", () => {
      expect(cssContent).toContain(".strip-separator");
      expect(cssContent).toContain("height: 38px;");
      expect(cssContent).toContain("background-color: #22252a;");
      expect(cssContent).toContain("border: 1px solid #3a3f47;");
      expect(cssContent).not.toContain("#58a6ff");
    });

    test("defines .strip-separator-input for direct in-place editing", () => {
      expect(cssContent).toContain(".strip-separator-input");
      expect(cssContent).toContain("text-transform: uppercase;");
      expect(cssContent).toContain("color: #ffff00;");
    });
  });
});
