/**
 * PTT is ignored while a text field is focused so the command line can take
 * backtick (default bind) and callsigns. Match `input`, `textarea`, and
 * `contenteditable` (T03-01). Keyboard matching uses `event.key`.
 */

const TEXT_FIELD_SELECTOR = "input, textarea, [contenteditable]:not([contenteditable='false'])";

export function isTextFieldTarget(target: unknown): boolean {
  if (target == null || typeof target !== "object") {
    return false;
  }
  const node = target as {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => unknown;
  };
  if (typeof node.closest === "function") {
    try {
      if (node.closest(TEXT_FIELD_SELECTOR)) {
        return true;
      }
    } catch {
      // Non-Element test doubles may throw; fall through to tagName.
    }
  }
  const tag = typeof node.tagName === "string" ? node.tagName.toUpperCase() : "";
  if (tag === "INPUT" || tag === "TEXTAREA") {
    return true;
  }
  return node.isContentEditable === true;
}
