/**
 * Analog: CRC STARS display with DCB cells on the PPI glass (R07).
 * Trainer delta: equal-height green cells flush to the top of the host; the
 * canvas below is the drawable PPI (T02-01 view size already minus DCB height
 * so cells do not cover the north of the range circle). Command strip is a
 * footer in this column (T02-15). The flight-strip list overlays the canvas
 * (T02-20). Not a full-width web input. Not NAS STARS.
 */

import type { World } from "@core";
import type { ReactNode, MouseEvent, PointerEvent, WheelEvent } from "react";
import { PpiPlaceholder, type ScopeView } from "@scope";
import { DisplayControlBar } from "./DisplayControlBar";

export interface ScopeCanvasProps {
  scopeView: ScopeView;
  onScopeChange: () => void;
  world?: World;
  children?: ReactNode;
  /** Command strip sits under the PPI in this column. */
  footer?: ReactNode;
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
  world,
  children,
  footer,
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
      <PpiPlaceholder
        header={<DisplayControlBar view={scopeView} world={world} onChange={onScopeChange} />}
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
      {footer}
    </div>
  );
}
