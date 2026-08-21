export type SpeechPortErrorKind =
  "http" | "network" | "timeout" | "empty" | "in_flight" | "invalid_response";

/**
 * Typed SpeechPort failure. The voice loop catches these (T03-08 copy).
 * Never put Authorization / shared-secret values in `message`.
 */
export class SpeechPortError extends Error {
  override name = "SpeechPortError";
  readonly kind: SpeechPortErrorKind;
  readonly status: number | undefined;

  constructor(
    kind: SpeechPortErrorKind,
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.kind = kind;
    this.status = options?.status;
  }
}
