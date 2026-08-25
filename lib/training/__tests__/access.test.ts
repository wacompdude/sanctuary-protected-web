import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTrainingAccess } from "@/lib/training/access";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";

vi.mock("@/lib/subscriptions/resolver", () => ({
  hasFeature: vi.fn(),
}));

import { hasFeature } from "@/lib/subscriptions/resolver";

describe("getTrainingAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows access when feature is enabled", async () => {
    vi.mocked(hasFeature).mockResolvedValue({
      allowed: true,
      reason: undefined,
      featureKey: FEATURE_KEYS.TRAINING_MANAGEMENT,
    });

    const result = await getTrainingAccess("church-1");
    expect(result.allowed).toBe(true);
    expect(hasFeature).toHaveBeenCalledWith({
      organizationId: "church-1",
      featureKey: FEATURE_KEYS.TRAINING_MANAGEMENT,
    });
  });

  it("denies access with exact upgrade message when feature is disabled", async () => {
    vi.mocked(hasFeature).mockResolvedValue({
      allowed: false,
      reason: "Upgrade required",
      featureKey: FEATURE_KEYS.TRAINING_MANAGEMENT,
    });

    const result = await getTrainingAccess("church-1");
    expect(result.allowed).toBe(false);
    expect(result.upgradeMessage).toBe("Upgrade required");
  });
});
