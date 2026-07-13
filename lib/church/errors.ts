export class ChurchAccessError extends Error {
  code?:
    | "UNAUTHENTICATED"
    | "NO_PROFILE"
    | "NO_ACTIVE_MEMBERSHIP"
    | "FORBIDDEN_ROLE"
    | "LOAD_FAILED";

  constructor(message: string, code?: ChurchAccessError["code"]) {
    super(message);
    this.name = "ChurchAccessError";
    this.code = code;
  }
}
