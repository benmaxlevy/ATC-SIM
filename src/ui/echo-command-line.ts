/** Trim typed command-line text. Does not parse or apply a Command. */
export function echoCommandLine(input: string): string {
  return input.trim();
}

/**
 * Echo reducer for the command line. Whitespace-only submit is ignored so the
 * last echoed line stays put.
 */
export function submitCommandLine(currentEcho: string, input: string): string {
  const next = echoCommandLine(input);
  if (next === "") {
    return currentEcho;
  }
  return next;
}
