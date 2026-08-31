export interface MockPathStroke {
  points: { x: number; y: number }[];
  strokeStyle: string;
  lineWidth: number;
}

export interface MockFillText {
  text: string;
  font: string;
  x?: number;
  y?: number;
  fillStyle?: string;
  textAlign?: string;
  textBaseline?: string;
}

export interface MockStrokeRect {
  x: number;
  y: number;
  w: number;
  h: number;
  strokeStyle: string;
}

export interface MockFillRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MockCanvas {
  ctx: CanvasRenderingContext2D;
  fillTexts: MockFillText[];
  pathStrokes: MockPathStroke[];
  strokeRects: MockStrokeRect[];
  fillRects: MockFillRect[];
  drawImages: unknown[];
  fills: { count: number };
}

export function createMockCtx(options?: { closePathJoinsStart?: boolean }): MockCanvas {
  const fillTexts: MockFillText[] = [];
  const pathStrokes: MockPathStroke[] = [];
  const strokeRects: MockStrokeRect[] = [];
  const fillRects: MockFillRect[] = [];
  const drawImages: unknown[] = [];
  const fills = { count: 0 };
  let currentPath: { x: number; y: number }[] = [];
  let currentFillStyle = "#FFFFFF";
  let currentStrokeStyle = "#FFFFFF";
  let currentLineWidth = 1;
  let currentFont = "12px monospace";
  let currentTextAlign = "start";
  let currentTextBaseline = "alphabetic";
  const closePathJoinsStart = options?.closePathJoinsStart === true;

  const ctx = {
    save() {},
    restore() {},
    beginPath() {
      currentPath = [];
    },
    closePath() {
      if (closePathJoinsStart && currentPath[0]) {
        currentPath.push({ ...currentPath[0] });
      }
    },
    arc() {},
    clip() {},
    rect() {},
    fillRect(x: number, y: number, w: number, h: number) {
      fillRects.push({ x, y, w, h });
    },
    clearRect() {},
    setLineDash() {},
    setTransform() {},
    strokeRect(x: number, y: number, w: number, h: number) {
      strokeRects.push({ x, y, w, h, strokeStyle: currentStrokeStyle });
    },
    measureText(text: string) {
      return { width: Math.max(0, text.length) * 7.2 };
    },
    moveTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    lineTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    stroke() {
      if (currentPath.length >= 2) {
        pathStrokes.push({
          points: currentPath.slice(),
          strokeStyle: currentStrokeStyle,
          lineWidth: currentLineWidth,
        });
      }
    },
    fill() {
      fills.count += 1;
    },
    drawImage(image: unknown) {
      drawImages.push(image);
    },
    fillText(text: string, x?: number, y?: number) {
      fillTexts.push({
        text,
        font: currentFont,
        x,
        y,
        fillStyle: String(currentFillStyle),
        textAlign: currentTextAlign,
        textBaseline: currentTextBaseline,
      });
    },
    get fillStyle() {
      return currentFillStyle;
    },
    set fillStyle(val: string | CanvasGradient | CanvasPattern) {
      currentFillStyle = String(val);
    },
    get strokeStyle() {
      return currentStrokeStyle;
    },
    set strokeStyle(val: string | CanvasGradient | CanvasPattern) {
      currentStrokeStyle = String(val);
    },
    get lineWidth() {
      return currentLineWidth;
    },
    set lineWidth(val: number) {
      currentLineWidth = val;
    },
    get font() {
      return currentFont;
    },
    set font(val: string) {
      currentFont = val;
    },
    get textAlign() {
      return currentTextAlign;
    },
    set textAlign(val: string) {
      currentTextAlign = val;
    },
    get textBaseline() {
      return currentTextBaseline;
    },
    set textBaseline(val: string) {
      currentTextBaseline = val;
    },
  };

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    fillTexts,
    pathStrokes,
    strokeRects,
    fillRects,
    drawImages,
    fills,
  };
}
