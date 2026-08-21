export class SpeechNotAvailableError extends Error {
  override name = "SpeechNotAvailableError";

  constructor(message: string) {
    super(message);
  }
}
