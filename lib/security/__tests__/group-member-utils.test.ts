import { describe, expect, it } from "vitest";
import {
  computeAssignmentStatus,
  isAssignmentCurrentlyEffective,
  validateAssignmentDates,
} from "../group-member-utils";

describe("group member utils", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");

  it("rejects expiration before effective date", () => {
    expect(
      validateAssignmentDates({
        effectiveAt: "2026-08-20T00:00:00.000Z",
        expiresAt: "2026-08-10T00:00:00.000Z",
      }),
    ).toBe("Expiration must be after the effective date");
  });

  it("marks future effective dates as scheduled", () => {
    expect(
      computeAssignmentStatus({
        status: "active",
        effectiveAt: "2026-09-01T00:00:00.000Z",
        expiresAt: null,
        now,
      }),
    ).toBe("scheduled");
  });

  it("marks near-term expiration as expiring soon", () => {
    expect(
      computeAssignmentStatus({
        status: "active",
        effectiveAt: null,
        expiresAt: "2026-08-18T00:00:00.000Z",
        now,
      }),
    ).toBe("expiring_soon");
  });

  it("treats past expiration as expired even when status is active", () => {
    expect(
      computeAssignmentStatus({
        status: "active",
        effectiveAt: null,
        expiresAt: "2026-08-01T00:00:00.000Z",
        now,
      }),
    ).toBe("expired");
  });

  it("considers scheduled assignments inactive for authorization checks", () => {
    expect(
      isAssignmentCurrentlyEffective({
        status: "active",
        effectiveAt: "2026-09-01T00:00:00.000Z",
        expiresAt: null,
        now,
      }),
    ).toBe(false);
  });

  it("considers active assignments effective for authorization checks", () => {
    expect(
      isAssignmentCurrentlyEffective({
        status: "active",
        effectiveAt: "2026-08-01T00:00:00.000Z",
        expiresAt: "2026-09-01T00:00:00.000Z",
        now,
      }),
    ).toBe(true);
  });
});
