/**
 * CRC ClipCursor analog for DCB: hide the OS cursor and clamp a software arrow
 * to the armed spinner cell, or to the whole DCB bar while a submenu is open.
 * Not Pointer Lock.
 */

import { useEffect, useRef, useState } from "react";
import {
  clampPointToRect,
  dcbCursorTrapKind,
  dcbTrapShouldBlockPointer,
  DCB_CURSOR_TRAP_CELL_SELECTOR,
  type DcbCursorTrapKind,
  type DcbTrapPoint,
  type ScopeView,
} from "@scope";

function trapHost(root: HTMLElement, kind: DcbCursorTrapKind): HTMLElement | null {
  if (kind === "cell") {
    return root.querySelector(DCB_CURSOR_TRAP_CELL_SELECTOR);
  }
  if (kind === "submenu") {
    return root.querySelector(".dcb-main-grid, .dcb-grid") ?? root;
  }
  return null;
}

function targetInside(host: HTMLElement, target: EventTarget | null): boolean {
  return target instanceof Node && host.contains(target);
}

function cellAt(x: number, y: number, host: HTMLElement): HTMLButtonElement | null {
  const hit = globalThis.document?.elementFromPoint(x, y);
  if (!(hit instanceof Element)) {
    return null;
  }
  const button = hit.closest("button.dcb-cell");
  if (button instanceof HTMLButtonElement && host.contains(button)) {
    return button;
  }
  return null;
}

export function useDcbCursorTrap(
  view: ScopeView,
  dcbRef: { readonly current: HTMLElement | null },
): { kind: DcbCursorTrapKind; cursor: DcbTrapPoint | null } {
  const kind = dcbCursorTrapKind(view);
  const [cursor, setCursor] = useState<DcbTrapPoint | null>(null);
  const lastPos = useRef<DcbTrapPoint | null>(null);
  const outsideDown = useRef(false);

  useEffect(() => {
    const save = (event: PointerEvent): void => {
      lastPos.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointerdown", save, true);
    window.addEventListener("pointermove", save, true);
    return () => {
      window.removeEventListener("pointerdown", save, true);
      window.removeEventListener("pointermove", save, true);
    };
  }, []);

  useEffect(() => {
    const root = dcbRef.current;
    const doc = globalThis.document;
    if (!root || !doc || kind === "none") {
      doc?.documentElement.removeAttribute("data-dcb-cursor-trap");
      setCursor(null);
      outsideDown.current = false;
      return;
    }

    doc.documentElement.setAttribute("data-dcb-cursor-trap", kind);

    function hostEl(): HTMLElement | null {
      return dcbRef.current ? trapHost(dcbRef.current, kind) : null;
    }

    function syncCursor(clientX: number, clientY: number): DcbTrapPoint | null {
      const host = hostEl();
      if (!host) {
        return null;
      }
      const next = clampPointToRect(clientX, clientY, host.getBoundingClientRect());
      setCursor(next);
      return next;
    }

    const seed = lastPos.current;
    if (seed) {
      syncCursor(seed.x, seed.y);
    }

    function onPointerMove(event: PointerEvent): void {
      syncCursor(event.clientX, event.clientY);
    }

    function onPointerDown(event: PointerEvent): void {
      const host = hostEl();
      if (!host) {
        return;
      }
      const rect = host.getBoundingClientRect();
      syncCursor(event.clientX, event.clientY);
      if (
        !dcbTrapShouldBlockPointer(
          event.clientX,
          event.clientY,
          rect,
          targetInside(host, event.target),
        )
      ) {
        outsideDown.current = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      outsideDown.current = true;
    }

    function onPointerUp(event: PointerEvent): void {
      const host = hostEl();
      if (!host) {
        outsideDown.current = false;
        return;
      }
      const rect = host.getBoundingClientRect();
      const blocked = dcbTrapShouldBlockPointer(
        event.clientX,
        event.clientY,
        rect,
        targetInside(host, event.target),
      );
      const wasOutside = outsideDown.current;
      outsideDown.current = false;
      if (!blocked) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!wasOutside) {
        return;
      }
      const point = clampPointToRect(event.clientX, event.clientY, rect);
      cellAt(point.x, point.y, host)?.click();
    }

    function onClick(event: MouseEvent): void {
      const host = hostEl();
      if (!host) {
        return;
      }
      const rect = host.getBoundingClientRect();
      if (
        !dcbTrapShouldBlockPointer(
          event.clientX,
          event.clientY,
          rect,
          targetInside(host, event.target),
        )
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    }

    function onWheel(event: WheelEvent): void {
      const host = hostEl();
      if (!host) {
        return;
      }
      const rect = host.getBoundingClientRect();
      if (
        !dcbTrapShouldBlockPointer(
          event.clientX,
          event.clientY,
          rect,
          targetInside(host, event.target),
        )
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const point = clampPointToRect(event.clientX, event.clientY, rect);
      const button = cellAt(point.x, point.y, host);
      if (!button) {
        return;
      }
      button.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: event.deltaY,
          deltaX: event.deltaX,
          deltaMode: event.deltaMode,
          bubbles: true,
          cancelable: true,
        }),
      );
    }

    function onBlur(): void {
      doc.documentElement.removeAttribute("data-dcb-cursor-trap");
      setCursor(null);
    }

    function onFocus(): void {
      doc.documentElement.setAttribute("data-dcb-cursor-trap", kind);
      const pos = lastPos.current;
      if (pos) {
        syncCursor(pos.x, pos.y);
      }
    }

    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      doc.documentElement.removeAttribute("data-dcb-cursor-trap");
    };
  }, [dcbRef, kind]);

  return { kind, cursor: kind === "none" ? null : cursor };
}
