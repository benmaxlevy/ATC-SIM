import * as React from "react";
import { useEffect, useRef } from "react";
import "./strips.css";

function useSafeRef<T>(initialValue: T): { current: T } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatcher = (React as any)?.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
    ?.ReactCurrentDispatcher?.current;
  if (!dispatcher) {
    return { current: initialValue };
  }
  return useRef(initialValue);
}

function useSafeEffect(effect: React.EffectCallback, deps?: React.DependencyList): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatcher = (React as any)?.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
    ?.ReactCurrentDispatcher?.current;
  if (!dispatcher) {
    return;
  }
  useEffect(effect, deps);
}

export interface ContextMenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
  testId?: string;
}

export interface StripsContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  className?: string;
}

export function StripsContextMenu({
  x,
  y,
  items,
  onClose,
  className = "",
}: StripsContextMenuProps) {
  const menuRef = useSafeRef<HTMLDivElement | null>(null);

  // Close on outside pointerdown or Escape key
  useSafeEffect(() => {
    const handlePointerDown = (e: PointerEvent | MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Adjust coordinates if near viewport edges
  let left = x;
  let top = y;
  if (typeof window !== "undefined") {
    const maxX = (window.innerWidth || 1024) - 180;
    const maxY = (window.innerHeight || 768) - 120;
    if (left > maxX) left = Math.max(10, maxX);
    if (top > maxY) top = Math.max(10, maxY);
  }

  return (
    <div
      ref={menuRef}
      className={`strips-context-menu ${className}`.trim()}
      data-testid="strips-context-menu"
      style={{ left: `${left}px`, top: `${top}px` }}
      role="menu"
      aria-label="Strip bay options"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) => (
        <button
          key={idx}
          type="button"
          className={`strips-context-menu-item ${item.danger ? "danger" : ""}`.trim()}
          data-testid={item.testId ?? `context-menu-item-${idx}`}
          role="menuitem"
          onClick={(e) => {
            e.stopPropagation();
            item.action();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
