import { describe, it, expect } from "vitest";
import {
  classifyRenewalStatus,
  computeRenewalDueAt,
} from "@/lib/training/renewal";

describe("computeRenewalDueAt", () => {
  it("returns null when renewal months is missing", () => {
    expect(computeRenewalDueAt("2026-01-15T12:00:00.000Z", null)).toBeNull();
  });

  it("adds renewal months to completion date", () => {
    expect(
      computeRenewalDueAt("2026-01-15T12:00:00.000Z", 12),
    ).toBe("2027-01-15");
  });
});

describe("classifyRenewalStatus", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");

  it("returns exempt when flagged", () => {
    expect(
      classifyRenewalStatus({
        dueAt: "2026-01-01",
        dueSoonDays: 30,
        now,
        exempt: true,
      }),
    ).toBe("exempt");
  });

  it("returns current when no due date", () => {
    expect(
      classifyRenewalStatus({ dueAt: null, dueSoonDays: 30, now }),
    ).toBe("current");
  });

  it("returns overdue when due date is in the past", () => {
    expect(
      classifyRenewalStatus({
        dueAt: "2026-05-01",
        dueSoonDays: 30,
        now,
      }),
    ).toBe("overdue");
  });

  it("returns due_soon inside the window", () => {
    expect(
      classifyRenewalStatus({
        dueAt: "2026-06-20",
        dueSoonDays: 30,
        now,
      }),
    ).toBe("due_soon");
  });

  it("returns due on the due date", () => {
    expect(
      classifyRenewalStatus({
        dueAt: "2026-06-01",
        dueSoonDays: 30,
        now,
      }),
    ).toBe("due");
  });
});
