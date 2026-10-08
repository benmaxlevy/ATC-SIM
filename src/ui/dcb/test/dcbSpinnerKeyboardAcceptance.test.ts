import { createElement } from "react";
import type { WheelEvent as ReactWheelEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  armDcbSpinner,
  createScopeView,
  handleScopeKeyDown,
  openDcbMenu,
  stepRange,
  type ScopeView,
} from "@scope";
import {
  DisplayControlBar,
  DCB_LDR_LENGTH_READOUT_ID,
  DCB_PTL_MINUTES_READOUT_ID,
  DCB_RANGE_READOUT_ID,
  DCB_RR_READOUT_ID,
  formatSpinnerCellReadout,
  syncDisplayControlBar,
} from "../DisplayControlBar";
import { onSpinnerWheel } from "../dcbChrome";

function renderDcb(view: ScopeView): string {
  return renderToStaticMarkup(
    createElement(DisplayControlBar, { view, onChange: () => undefined }),
  );
}

function getReadoutText(html: string, id: string): string {
  const match = new RegExp(`<span[^>]*id="${id}"[^>]*>(.*?)<\\/span>`).exec(html);
  return match ? match[1] : "";
}

interface KeyPressEvent {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

function makeKeyEvent(key: string, code?: string): KeyPressEvent {
  return {
    key,
    code: code ?? key,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

function pressKey(view: ScopeView, key: string, code?: string): void {
  handleScopeKeyDown(makeKeyEvent(key, code), view, "scope", undefined, Date.now());
}

function typeString(view: ScopeView, text: string): void {
  for (const ch of text) {
    pressKey(view, ch);
  }
}

function makeMockWheelEvent(deltaY: number): ReactWheelEvent<HTMLButtonElement> {
  return {
    deltaY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as ReactWheelEvent<HTMLButtonElement>;
}

describe("T02-201: DCB spinner live digit rendering and integration acceptance", () => {
  describe("formatSpinnerCellReadout helper", () => {
    it("returns default readout when spinner is idle", () => {
      const view = createScopeView();
      view.camera.rangeNm = 40;
      expect(formatSpinnerCellReadout(view, "RANGE", 40)).toBe(40);
    });

    it("returns default readout when armed with empty buffer", () => {
      const view = createScopeView();
      view.camera.rangeNm = 40;
      armDcbSpinner(view, "RANGE");
      expect(formatSpinnerCellReadout(view, "RANGE", 40)).toBe(40);
    });

    it("returns typed buffer when armed with non-empty buffer", () => {
      const view = createScopeView();
      armDcbSpinner(view, "RANGE");
      view.dcbSpinner.buffer = "12";
      expect(formatSpinnerCellReadout(view, "RANGE", 40)).toBe("12");
    });

    it("handles LDR_LEN and LDR_LENGTH aliases interchangeably", () => {
      const view = createScopeView();
      armDcbSpinner(view, "LDR_LEN");
      view.dcbSpinner.buffer = "5";
      expect(formatSpinnerCellReadout(view, "LDR_LENGTH", "2")).toBe("5");

      armDcbSpinner(view, "LDR_LENGTH");
      view.dcbSpinner.buffer = "3";
      expect(formatSpinnerCellReadout(view, "LDR_LEN", "2")).toBe("3");
    });
  });

  describe("RANGE spinner: live rendering, validation, and layout preservation", () => {
    it("renders camera range initially, live digits while armed, and updates range on Enter", () => {
      const view = createScopeView();
      view.camera.rangeNm = 40;

      // 1. Initial render
      let html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("40");
      expect(html).toContain('data-dcb-cell="range"');
      expect(html).toContain('aria-label="RANGE 40"');

      // 2. Arm RANGE
      armDcbSpinner(view, "RANGE");
      html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("40");
      expect(html).toContain('aria-pressed="true"');

      // 3. Type digits '1' then '2'
      pressKey(view, "1");
      html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("1");

      pressKey(view, "2");
      html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("12");

      // Verify layout, IDs, and attributes are preserved
      expect(html).toContain('data-dcb-layout-id="range"');
      expect(html).toContain('id="dcb-range-readout"');
      expect(html).toContain('<span class="dcb-cell-line">RANGE</span>');

      // 4. Press Enter to commit
      pressKey(view, "Enter");
      expect(view.camera.rangeNm).toBe(12);
      expect(view.dcbSpinner.armed).toBe(false);

      html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("12");
      expect(html).toContain('aria-pressed="false"');
    });

    it("reverts display and camera range on invalid entry (< 6 NM)", () => {
      const view = createScopeView();
      view.camera.rangeNm = 40;

      armDcbSpinner(view, "RANGE");
      pressKey(view, "5");
      let html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("5");

      // Enter on invalid value (< 6) reverts
      pressKey(view, "Enter");
      expect(view.camera.rangeNm).toBe(40);
      expect(view.dcbSpinner.armed).toBe(false);

      html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("40");
    });

    it("reverts display and camera range on invalid entry (> 512 NM)", () => {
      const view = createScopeView();
      view.camera.rangeNm = 40;

      armDcbSpinner(view, "RANGE");
      typeString(view, "600");
      let html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("600");

      pressKey(view, "Enter");
      expect(view.camera.rangeNm).toBe(40);
      expect(view.dcbSpinner.armed).toBe(false);

      html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("40");
    });
  });

  describe("RR (Range Rings) spinner: live rendering and spacing validation", () => {
    it("renders typed digits and updates interval to 20 NM on Enter", () => {
      const view = createScopeView();
      view.ringIntervalNm = 5;
      view.showRings = true;

      let html = renderDcb(view);
      expect(getReadoutText(html, DCB_RR_READOUT_ID)).toBe("5");

      armDcbSpinner(view, "RR");
      typeString(view, "20");

      html = renderDcb(view);
      expect(getReadoutText(html, DCB_RR_READOUT_ID)).toBe("20");

      pressKey(view, "Enter");
      expect(view.ringIntervalNm).toBe(20);
      expect(view.showRings).toBe(true);
      expect(view.dcbSpinner.armed).toBe(false);

      html = renderDcb(view);
      expect(getReadoutText(html, DCB_RR_READOUT_ID)).toBe("20");
    });

    it("reverts on invalid range ring interval (e.g. 15 NM)", () => {
      const view = createScopeView();
      view.ringIntervalNm = 10;
      view.showRings = true;

      armDcbSpinner(view, "RR");
      typeString(view, "15");

      let html = renderDcb(view);
      expect(getReadoutText(html, DCB_RR_READOUT_ID)).toBe("15");

      pressKey(view, "Enter");
      expect(view.ringIntervalNm).toBe(10);
      expect(view.dcbSpinner.armed).toBe(false);

      html = renderDcb(view);
      expect(getReadoutText(html, DCB_RR_READOUT_ID)).toBe("10");
    });
  });

  describe("LDR LEN (Leader Length) spinner: live rendering and step validation", () => {
    it("renders typed digit and updates leader line length on Enter", () => {
      const view = createScopeView();
      view.leaderLengthPx = 24; // step 2

      let html = renderDcb(view);
      expect(getReadoutText(html, DCB_LDR_LENGTH_READOUT_ID)).toBe("2");

      armDcbSpinner(view, "LDR_LENGTH");
      pressKey(view, "4");

      html = renderDcb(view);
      expect(getReadoutText(html, DCB_LDR_LENGTH_READOUT_ID)).toBe("4");

      pressKey(view, "Enter");
      expect(view.leaderLengthPx).toBe(48); // step 4
      expect(view.dcbSpinner.armed).toBe(false);

      html = renderDcb(view);
      expect(getReadoutText(html, DCB_LDR_LENGTH_READOUT_ID)).toBe("4");
    });

    it("reverts when typing invalid leader length (> 7)", () => {
      const view = createScopeView();
      view.leaderLengthPx = 24; // step 2

      armDcbSpinner(view, "LDR_LENGTH");
      pressKey(view, "8");

      let html = renderDcb(view);
      expect(getReadoutText(html, DCB_LDR_LENGTH_READOUT_ID)).toBe("8");

      pressKey(view, "Enter");
      expect(view.leaderLengthPx).toBe(24);
      expect(view.dcbSpinner.armed).toBe(false);

      html = renderDcb(view);
      expect(getReadoutText(html, DCB_LDR_LENGTH_READOUT_ID)).toBe("2");
    });
  });

  describe("PTL (Predicted Track Line) spinner in AUX menu: decimal input and formatting", () => {
    it("renders partial decimal '3.' and updates ptlMinutes to 3.5 on Enter", () => {
      const view = createScopeView();
      view.ptlMinutes = 1.0;
      openDcbMenu(view, "AUX");

      let html = renderDcb(view);
      expect(getReadoutText(html, DCB_PTL_MINUTES_READOUT_ID)).toBe("1.0");

      armDcbSpinner(view, "PTL");

      // Type "3"
      pressKey(view, "3");
      html = renderDcb(view);
      expect(getReadoutText(html, DCB_PTL_MINUTES_READOUT_ID)).toBe("3");

      // Type "." -> partial decimal input displays "3."
      pressKey(view, ".");
      html = renderDcb(view);
      expect(getReadoutText(html, DCB_PTL_MINUTES_READOUT_ID)).toBe("3.");

      // Type "5" -> "3.5"
      pressKey(view, "5");
      html = renderDcb(view);
      expect(getReadoutText(html, DCB_PTL_MINUTES_READOUT_ID)).toBe("3.5");

      pressKey(view, "Enter");
      expect(view.ptlMinutes).toBe(3.5);
      expect(view.ptlOn).toBe(true);
      expect(view.dcbSpinner.armed).toBe(false);

      html = renderDcb(view);
      expect(getReadoutText(html, DCB_PTL_MINUTES_READOUT_ID)).toBe("3.5");
    });

    it("reverts on invalid PTL entry (e.g. 7.0 or non-0.5 step like 2.3)", () => {
      const view = createScopeView();
      view.ptlMinutes = 2.0;
      openDcbMenu(view, "AUX");

      armDcbSpinner(view, "PTL");
      typeString(view, "2.3");

      let html = renderDcb(view);
      expect(getReadoutText(html, DCB_PTL_MINUTES_READOUT_ID)).toBe("2.3");

      pressKey(view, "Enter");
      expect(view.ptlMinutes).toBe(2.0);
      expect(view.dcbSpinner.armed).toBe(false);

      html = renderDcb(view);
      expect(getReadoutText(html, DCB_PTL_MINUTES_READOUT_ID)).toBe("2.0");
    });
  });

  describe("Escape and Clear behavior", () => {
    it("cancels RANGE adjustment and restores previous display and value", () => {
      const view = createScopeView();
      view.camera.rangeNm = 40;

      armDcbSpinner(view, "RANGE");
      typeString(view, "120");

      let html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("120");

      pressKey(view, "Escape");
      expect(view.camera.rangeNm).toBe(40);
      expect(view.dcbSpinner.armed).toBe(false);
      expect(view.dcbSpinner.buffer).toBe("");

      html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("40");
    });

    it("cancels PTL adjustment on Clear key and restores previous value", () => {
      const view = createScopeView();
      view.ptlMinutes = 1.5;
      openDcbMenu(view, "AUX");

      armDcbSpinner(view, "PTL");
      typeString(view, "4.5");

      let html = renderDcb(view);
      expect(getReadoutText(html, DCB_PTL_MINUTES_READOUT_ID)).toBe("4.5");

      pressKey(view, "Clear");
      expect(view.ptlMinutes).toBe(1.5);
      expect(view.dcbSpinner.armed).toBe(false);

      html = renderDcb(view);
      expect(getReadoutText(html, DCB_PTL_MINUTES_READOUT_ID)).toBe("1.5");
    });
  });

  describe("Backspace editing behavior", () => {
    it("deletes characters in buffer and reverts to default display when empty", () => {
      const view = createScopeView();
      view.camera.rangeNm = 50;

      armDcbSpinner(view, "RANGE");
      typeString(view, "123");

      let html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("123");

      pressKey(view, "Backspace");
      html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("12");

      pressKey(view, "Backspace");
      html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("1");

      pressKey(view, "Backspace");
      html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("50");

      // Backspace on empty buffer is harmless
      pressKey(view, "Backspace");
      html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("50");
    });
  });

  describe("Mouse wheel stepping while armed", () => {
    it("synchronizes buffer and updates readout on wheel step", () => {
      const view = createScopeView();
      view.camera.rangeNm = 40;

      armDcbSpinner(view, "RANGE");
      typeString(view, "10");

      let html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("10");

      // Step forward via mouse wheel
      const wheelEv = makeMockWheelEvent(-100);
      onSpinnerWheel(
        view,
        "RANGE",
        wheelEv,
        (step) => stepRange(view.camera, step),
        () => undefined,
      );

      // Camera stepped from 40 to 50, and buffer synchronized to "50"
      expect(view.camera.rangeNm).toBe(50);
      expect(view.dcbSpinner.buffer).toBe("50");

      html = renderDcb(view);
      expect(getReadoutText(html, DCB_RANGE_READOUT_ID)).toBe("50");

      // Committing now confirms 50
      pressKey(view, "Enter");
      expect(view.camera.rangeNm).toBe(50);
      expect(view.dcbSpinner.armed).toBe(false);
    });
  });

  describe("DOM sync via syncDisplayControlBar", () => {
    it("updates DOM element text content to reflect active buffer", () => {
      const view = createScopeView();
      view.camera.rangeNm = 30;

      const mockElements: Record<string, { textContent: string }> = {
        [DCB_RANGE_READOUT_ID]: { textContent: "30" },
      };

      const originalDoc = globalThis.document;
      globalThis.document = {
        getElementById: (id: string) => mockElements[id] ?? null,
        querySelector: () => null,
        querySelectorAll: () => [],
      } as unknown as Document;

      try {
        armDcbSpinner(view, "RANGE");
        view.dcbSpinner.buffer = "75";

        syncDisplayControlBar(view);
        expect(mockElements[DCB_RANGE_READOUT_ID]?.textContent).toBe("75");
      } finally {
        globalThis.document = originalDoc;
      }
    });
  });
});
