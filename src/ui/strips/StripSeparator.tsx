import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { StripSeparator as StripSeparatorModel } from "./types";
import "./strips.css";

function useSafeState<T>(initialValue: T | (() => T)): [T, (action: T | ((prev: T) => T)) => void] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatcher = (React as any)?.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
    ?.ReactCurrentDispatcher?.current;
  if (!dispatcher) {
    const val = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
    return [val, () => {}];
  }
  return useState(initialValue);
}

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

export interface StripSeparatorProps {
  /** The separator data model. */
  separator: StripSeparatorModel;
  /** Whether the separator is currently in direct text editing mode. */
  isEditing?: boolean;
  /** Whether this separator is actively being dragged. */
  isDragging?: boolean;
  /** Callback fired when the user commits an edited label. */
  onUpdateLabel?: (id: string, newLabel: string) => void;
  /** Callback fired when entering edit mode. */
  onStartEdit?: (id: string) => void;
  /** Callback fired when exiting edit mode. */
  onEndEdit?: (id: string) => void;
  /** Callback fired when right-clicking the separator. */
  onContextMenu?: (e: React.MouseEvent, separator: StripSeparatorModel) => void;
  /** Whether the separator is draggable (defaults to true when not editing). */
  draggable?: boolean;
  /** HTML5 drag start handler. */
  onDragStart?: (e: React.DragEvent) => void;
  /** HTML5 drag end handler. */
  onDragEnd?: (e: React.DragEvent) => void;
  /** HTML5 drag over handler. */
  onDragOver?: (e: React.DragEvent) => void;
  /** HTML5 drop handler. */
  onDrop?: (e: React.DragEvent) => void;
  /** Custom CSS class. */
  className?: string;
}

export function StripSeparator({
  separator,
  isEditing = false,
  isDragging = false,
  onUpdateLabel,
  onStartEdit,
  onEndEdit,
  onContextMenu,
  draggable = true,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  className = "",
}: StripSeparatorProps) {
  const [draft, setDraft] = useSafeState(separator.label);
  const inputRef = useSafeRef<HTMLInputElement | null>(null);

  // Sync draft if external separator label changes while not editing
  useSafeEffect(() => {
    if (!isEditing) {
      setDraft(separator.label);
    }
  }, [separator.label, isEditing]);

  // Focus and select input text when entering editing mode
  useSafeEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleCommit = () => {
    const trimmed = draft.trim().toUpperCase();
    onUpdateLabel?.(separator.id, trimmed);
    onEndEdit?.(separator.id);
  };

  const handleCancel = () => {
    setDraft(separator.label);
    onEndEdit?.(separator.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      handleCommit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e, separator);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // If not editing, clicking or double-clicking starts edit
    if (!isEditing) {
      e.stopPropagation();
      onStartEdit?.(separator.id);
    }
  };

  const displayLabel = separator.label.trim() !== "" ? separator.label : "SEPARATOR";

  return (
    <div
      className={`strip-separator ${isDragging ? "strip-dragging" : ""} ${className}`.trim()}
      data-testid={`strip-separator-${separator.id}`}
      data-separator-id={separator.id}
      data-section={separator.section}
      role="separator"
      aria-label={`Separator: ${displayLabel}`}
      tabIndex={0}
      draggable={!isEditing && draggable}
      onClick={handleCardClick}
      onContextMenu={handleContextMenu}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="strip-separator-accent" aria-hidden="true" />
      <div className="strip-separator-body">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className="strip-separator-input"
            data-testid={`strip-separator-input-${separator.id}`}
            value={draft}
            placeholder="SEPARATOR"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleCommit}
            onClick={(e) => e.stopPropagation()}
            aria-label="Separator text label"
            maxLength={40}
          />
        ) : (
          <span
            className="strip-separator-label"
            data-testid={`strip-separator-label-${separator.id}`}
          >
            {displayLabel}
          </span>
        )}
      </div>
    </div>
  );
}
