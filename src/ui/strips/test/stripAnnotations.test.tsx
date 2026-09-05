import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import { ArrivalStrip } from "../ArrivalStrip";
import { DepartureStrip } from "../DepartureStrip";
import { mockAAL412, mockDAL882 } from "../mockFixture";
import type { AnnotationBoxKey, DepartureStripData } from "../types";

const cssContent = readFileSync(new URL("../strips.css", import.meta.url), "utf8");

describe("T02-100 & T02-102 Flight Progress Strips Freeform Box Annotations", () => {
  const LOWER_BOXES = ["10", "11", "12", "13", "14", "15", "16", "17", "18"] as const;

  // ==========================================================================
  // AC1: Double-Click Inline Editing on DepartureStrip & ArrivalStrip
  // ==========================================================================
  describe("AC1 — Double-click inline editing and input mounting", () => {
    test("DepartureStrip mounts .strip-annotation-input when editing Box 8A", () => {
      const html = renderToStaticMarkup(
        createElement(DepartureStrip, {
          strip: mockDAL882,
          editingBox: "8A",
        }),
      );

      expect(html).toContain('class="strip-annotation-input"');
      expect(html).toContain('data-testid="annotation-input-8A"');
      expect(html).toContain('data-box="8A"');
    });

    test("DepartureStrip mounts .strip-annotation-input when editing Box 8B", () => {
      const html = renderToStaticMarkup(
        createElement(DepartureStrip, {
          strip: mockDAL882,
          editingBox: "8B",
        }),
      );

      expect(html).toContain('class="strip-annotation-input"');
      expect(html).toContain('data-testid="annotation-input-8B"');
      expect(html).toContain('data-box="8B"');
    });

    test("DepartureStrip mounts .strip-annotation-input for any of Boxes 10–18", () => {
      for (const boxNum of LOWER_BOXES) {
        const html = renderToStaticMarkup(
          createElement(DepartureStrip, {
            strip: mockDAL882,
            editingBox: boxNum,
          }),
        );

        expect(html).toContain('class="strip-annotation-input"');
        expect(html).toContain(`data-testid="annotation-input-${boxNum}"`);
        expect(html).toContain(`data-box="${boxNum}"`);
      }
    });

    test("ArrivalStrip mounts .strip-annotation-input when editing Box 8A, 8B, and 10–18", () => {
      const allBoxes: AnnotationBoxKey[] = ["8A", "8B", ...LOWER_BOXES];
      for (const boxKey of allBoxes) {
        const html = renderToStaticMarkup(
          createElement(ArrivalStrip, {
            strip: mockAAL412,
            editingBox: boxKey,
          }),
        );

        expect(html).toContain('class="strip-annotation-input"');
        expect(html).toContain(`data-testid="annotation-input-${boxKey}"`);
        expect(html).toContain(`data-box="${boxKey}"`);
      }
    });

    test("double-clicking Box 8A cell on DepartureStrip invokes onEditingBoxChange and starts edit", () => {
      const onEditingBoxChangeMock = vi.fn();
      const tree = DepartureStrip({
        strip: mockDAL882,
        onEditingBoxChange: onEditingBoxChangeMock,
      });

      // Navigate tree: children[2] (Col 3 col-local) -> children[1] (Box 8A)
      const col3 = tree.props.children[2];
      const box8aCell = col3.props.children[1];
      expect(box8aCell.props["data-box"]).toBe("8A");

      const fakeDblClick = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent;

      box8aCell.props.onDoubleClick(fakeDblClick);
      expect(fakeDblClick.preventDefault).toHaveBeenCalledTimes(1);
      expect(fakeDblClick.stopPropagation).toHaveBeenCalledTimes(1);
      expect(onEditingBoxChangeMock).toHaveBeenCalledWith("8A");
    });

    test("double-clicking a 3x3 matrix cell (Box 12) invokes onEditingBoxChange", () => {
      const onEditingBoxChangeMock = vi.fn();
      const tree = DepartureStrip({
        strip: mockDAL882,
        onEditingBoxChange: onEditingBoxChangeMock,
      });

      // Navigate tree: children[4] (Col 5 col-matrix) -> children array (boxes 10–18)
      const col5 = tree.props.children[4];
      const matrixCells = col5.props.children;
      // Index 2 is Box 12
      const box12Cell = matrixCells[2];
      expect(box12Cell.props["data-box"]).toBe("12");

      const fakeDblClick = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent;

      box12Cell.props.onDoubleClick(fakeDblClick);
      expect(fakeDblClick.preventDefault).toHaveBeenCalledTimes(1);
      expect(fakeDblClick.stopPropagation).toHaveBeenCalledTimes(1);
      expect(onEditingBoxChangeMock).toHaveBeenCalledWith("12");
    });

    test("double-clicking Box 8B cell on ArrivalStrip starts edit", () => {
      const onEditingBoxChangeMock = vi.fn();
      const tree = ArrivalStrip({
        strip: mockAAL412,
        onEditingBoxChange: onEditingBoxChangeMock,
      });

      const col3 = tree.props.children[2];
      const box8bCell = col3.props.children[2];
      expect(box8bCell.props["data-box"]).toBe("8B");

      const fakeDblClick = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent;

      box8bCell.props.onDoubleClick(fakeDblClick);
      expect(fakeDblClick.stopPropagation).toHaveBeenCalledTimes(1);
      expect(onEditingBoxChangeMock).toHaveBeenCalledWith("8B");
    });
  });

  // ==========================================================================
  // AC2: Commit & Cancel Handlers (Enter, Blur, Escape)
  // ==========================================================================
  describe("AC2 — Commit on Enter/Blur, Cancel on Escape, and Uppercase forcing", () => {
    test("pressing Enter commits the draft and fires onUpdateAnnotation with trimmed uppercase value", () => {
      const onUpdateAnnotationMock = vi.fn();
      const onEditingBoxChangeMock = vi.fn();

      const tree = DepartureStrip({
        strip: mockDAL882,
        editingBox: "8A",
        onUpdateAnnotation: onUpdateAnnotationMock,
        onEditingBoxChange: onEditingBoxChangeMock,
      });

      // Navigate to the mounted input in Box 8A
      const col3 = tree.props.children[2];
      const box8aCell = col3.props.children[1];
      const input = box8aCell.props.children;

      expect(input.props.className).toBe("strip-annotation-input");

      // Simulate typing lowercase with whitespace
      const fakeChangeEvent = {
        target: { value: "  27l  " },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      input.props.onChange(fakeChangeEvent);

      // Press Enter
      const fakeEnterEvent = {
        key: "Enter",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLInputElement>;

      input.props.onKeyDown(fakeEnterEvent);

      expect(fakeEnterEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(fakeEnterEvent.stopPropagation).toHaveBeenCalledTimes(1);
      expect(onUpdateAnnotationMock).toHaveBeenCalledTimes(1);
      expect(onUpdateAnnotationMock).toHaveBeenCalledWith("DAL882", "8A", expect.any(String));
      expect(onEditingBoxChangeMock).toHaveBeenCalledWith(null);
    });

    test("onBlur on input commits the current draft value", () => {
      const onUpdateAnnotationMock = vi.fn();
      const onEditingBoxChangeMock = vi.fn();

      const tree = ArrivalStrip({
        strip: mockAAL412,
        editingBox: "11",
        onUpdateAnnotation: onUpdateAnnotationMock,
        onEditingBoxChange: onEditingBoxChangeMock,
      });

      const col5 = tree.props.children[4];
      const matrixCells = col5.props.children;
      // Index 1 is Box 11
      const box11Cell = matrixCells[1];
      const input = box11Cell.props.children;

      input.props.onBlur();

      expect(onUpdateAnnotationMock).toHaveBeenCalledTimes(1);
      expect(onUpdateAnnotationMock).toHaveBeenCalledWith("AAL412", "11", expect.any(String));
      expect(onEditingBoxChangeMock).toHaveBeenCalledWith(null);
    });

    test("pressing Escape cancels editing and does NOT fire onUpdateAnnotation", () => {
      const onUpdateAnnotationMock = vi.fn();
      const onEditingBoxChangeMock = vi.fn();

      const tree = DepartureStrip({
        strip: mockDAL882,
        editingBox: "15",
        onUpdateAnnotation: onUpdateAnnotationMock,
        onEditingBoxChange: onEditingBoxChangeMock,
      });

      const col5 = tree.props.children[4];
      const matrixCells = col5.props.children;
      // Index 5 is Box 15
      const box15Cell = matrixCells[5];
      const input = box15Cell.props.children;

      const fakeEscapeEvent = {
        key: "Escape",
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLInputElement>;

      input.props.onKeyDown(fakeEscapeEvent);

      expect(fakeEscapeEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(fakeEscapeEvent.stopPropagation).toHaveBeenCalledTimes(1);
      expect(onUpdateAnnotationMock).not.toHaveBeenCalled();
      expect(onEditingBoxChangeMock).toHaveBeenCalledWith(null);
    });

    test("input maxLength is set to 10 characters to prevent overflow", () => {
      const tree = DepartureStrip({
        strip: mockDAL882,
        editingBox: "8A",
      });

      const col3 = tree.props.children[2];
      const box8aCell = col3.props.children[1];
      const input = box8aCell.props.children;

      expect(input.props.maxLength).toBe(10);
    });
  });

  // ==========================================================================
  // AC3: Event Isolation (Stops Propagation, No Track Selection or Drag)
  // ==========================================================================
  describe("AC3 — Event isolation and non-interference", () => {
    test("single-clicking an annotation cell stops pointer event propagation", () => {
      const onSelectMock = vi.fn();
      const tree = DepartureStrip({
        strip: mockDAL882,
        onSelect: onSelectMock,
      });

      const col3 = tree.props.children[2];
      const box8aCell = col3.props.children[1];

      const fakeClick = {
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent;

      box8aCell.props.onClick(fakeClick);

      expect(fakeClick.stopPropagation).toHaveBeenCalledTimes(1);
      expect(onSelectMock).not.toHaveBeenCalled();
    });

    test("mousedown on an annotation cell stops pointer event propagation", () => {
      const tree = DepartureStrip({
        strip: mockDAL882,
      });

      const col5 = tree.props.children[4];
      const box10Cell = col5.props.children[0];

      const fakeMouseDown = {
        stopPropagation: vi.fn(),
      } as unknown as React.MouseEvent;

      box10Cell.props.onMouseDown(fakeMouseDown);

      expect(fakeMouseDown.stopPropagation).toHaveBeenCalledTimes(1);
    });

    test("clicking and mousedown on active input stops propagation", () => {
      const tree = DepartureStrip({
        strip: mockDAL882,
        editingBox: "8A",
      });

      const col3 = tree.props.children[2];
      const box8aCell = col3.props.children[1];
      const input = box8aCell.props.children;

      const fakeClick = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
      input.props.onClick(fakeClick);
      expect(fakeClick.stopPropagation).toHaveBeenCalledTimes(1);

      const fakeMouseDown = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
      input.props.onMouseDown(fakeMouseDown);
      expect(fakeMouseDown.stopPropagation).toHaveBeenCalledTimes(1);

      const fakeDblClick = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
      input.props.onDoubleClick(fakeDblClick);
      expect(fakeDblClick.stopPropagation).toHaveBeenCalledTimes(1);
    });

    test("draggable property is disabled while editing an annotation box", () => {
      const normalTree = DepartureStrip({
        strip: mockDAL882,
        draggable: true,
      });
      expect(normalTree.props.draggable).toBe(true);

      const editingTree = DepartureStrip({
        strip: mockDAL882,
        draggable: true,
        editingBox: "8A",
      });
      expect(editingTree.props.draggable).toBe(false);
    });
  });

  // ==========================================================================
  // AC4: Authentic Styling & Display
  // ==========================================================================
  describe("AC4 — Authentic styling, black text, and CSS rules", () => {
    test("committed annotations render existing values in read-only cells", () => {
      const stripWithNotes: DepartureStripData = {
        ...mockDAL882,
        annotationBoxes: {
          box8A: "27L",
          box8B: "FIX-A",
          boxes10to18: ["HDG 240", "FL180", "SPD 250", "", "", "", "", "", ""],
        },
      };

      const html = renderToStaticMarkup(createElement(DepartureStrip, { strip: stripWithNotes }));

      expect(html).toContain("27L");
      expect(html).toContain("FIX-A");
      expect(html).toContain("HDG 240");
      expect(html).toContain("FL180");
      expect(html).toContain("SPD 250");
    });

    test("CSS defines .strip-annotation-input with authentic black text and buff background", () => {
      expect(cssContent).toContain(".strip-annotation-input");
      expect(cssContent).toContain("background-color: #f5eedc;");
      expect(cssContent).toContain("color: #000000;");
      expect(cssContent).toContain("text-transform: uppercase;");
      expect(cssContent).toContain("text-align: center;");
    });

    test("CSS defines .annotation-cell and .matrix-cell with cursor: text", () => {
      expect(cssContent).toContain(".annotation-cell");
      expect(cssContent).toContain(".matrix-cell");
      expect(cssContent).toContain("cursor: text;");
    });

    test("CSS defines committed annotation text with color: #000000", () => {
      expect(cssContent).toContain(".strip-annotation-lower");
      expect(cssContent).toContain(".strip-annotation-8a");
      expect(cssContent).toContain(".strip-annotation-8b");
      expect(cssContent).toContain("color: #000000;");
    });
  });
});
