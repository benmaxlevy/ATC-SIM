/**
 * Analog: CRC STARS display with DCB above the PPI (R07).
 * Trainer delta: DCB-lite is a sibling above the canvas so the drawable PPI
 * (T02-01 camera view size) is the canvas CSS size — already minus bar height.
 * Not NAS STARS.
 */

import type { ReactNode, MouseEvent, PointerEvent, WheelEvent } from "react";
import { PpiPlaceholder, type ScopeView } from "@scope";
import { DisplayControlBar } from "./DisplayControlBar";

export interface ScopeCanvasProps {
  scopeView: ScopeView;
  onScopeChange: () => void;
  children?: ReactNode;
  onCanvasClick?: (event: MouseEvent<HTMLCanvasElement>) => void;
  onCanvasDoubleClick?: (event: MouseEvent<HTMLCanvasElement>) => void;
  onCanvasWheel?: (event: WheelEvent<HTMLCanvasElement>) => void;
  onCanvasPointerDown?: (event: PointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerMove?: (event: PointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerUp?: (event: PointerEvent<HTMLCanvasElement>) => void;
  onCanvasContextMenu?: (event: MouseEvent<HTMLCanvasElement>) => void;
}

export function ScopeCanvas({
  scopeView,
  onScopeChange,
  children,
  onCanvasClick,
  onCanvasDoubleClick,
  onCanvasWheel,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onCanvasContextMenu,
}: ScopeCanvasProps) {
  return (
    <div className="ppi-column">
      <DisplayControlBar view={scopeView} onChange={onScopeChange} />
      <PpiPlaceholder
        onCanvasClick={onCanvasClick}
        onCanvasDoubleClick={onCanvasDoubleClick}
        onCanvasWheel={onCanvasWheel}
        onCanvasPointerDown={onCanvasPointerDown}
        onCanvasPointerMove={onCanvasPointerMove}
        onCanvasPointerUp={onCanvasPointerUp}
        onCanvasContextMenu={onCanvasContextMenu}
      >
        {children}
      </PpiPlaceholder>
    </div>
  );
}
