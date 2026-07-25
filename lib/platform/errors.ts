export class PlatformAccessError extends Error {
  code?:
    | "UNAUTHENTICATED"
    | "NO_PLATFORM_ACCOUNT"
    | "ACCOUNT_DISABLED"
    | "ACCOUNT_LOCKED"
    | "ACCOUNT_ARCHIVED"
    | "ACCOUNT_NOT_ACTIVE"
    | "SETUP_PASSWORD_REQUIRED"
    | "SETUP_MFA_REQUIRED"
    | "MFA_REQUIRED"
    | "REAUTH_REQUIRED"
    | "FORBIDDEN_PERMISSION"
    | "TABLES_UNAVAILABLE"
    | "LOAD_FAILED";

  constructor(message: string, code?: PlatformAccessError["code"]) {
    super(message);
    this.name = "PlatformAccessError";
    this.code = code;
  }
}
