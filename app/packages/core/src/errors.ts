export type BrainErrorCode =
  | "NOT_FOUND" // entity or file does not exist
  | "VALIDATION" // input does not match the schema
  | "CONFLICT" // already exists / changed since
  | "RULE"; // violates a business rule (e.g. AI level increase without evidence)

export class BrainError extends Error {
  readonly code: BrainErrorCode;
  readonly details: readonly {rule:string;path:string;message:string;fix:string}[]|undefined;
  constructor(code: BrainErrorCode, message: string, details?: readonly {rule:string;path:string;message:string;fix:string}[]) {
    super(message);
    this.name = "BrainError";
    this.code = code;
    this.details = details;
  }
}
