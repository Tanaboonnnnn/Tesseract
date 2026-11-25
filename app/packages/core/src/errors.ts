export type BrainErrorCode =
  | "NOT_FOUND" // entity or file does not exist
  | "VALIDATION" // input does not match the schema
  | "CONFLICT" // already exists / changed since
  | "RULE"; // violates a business rule (e.g. AI level increase without evidence)

export class BrainError extends Error {
  readonly code: BrainErrorCode;
  constructor(code: BrainErrorCode, message: string) {
    super(message);
    this.name = "BrainError";
    this.code = code;
  }
}
