import type { MembershipRole } from "@/lib/organization/types";
import {
  evaluateSafetyConcernAccess,
  type SafetyConcernAccessDecision,
} from "@/lib/safety-concerns/access-policy";
import { EntitlementError } from "@/lib/subscriptions/errors";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import {
  getFeatureLimit,
  hasFeature,
  requireFeature,
  requireFeatureCapacity,
} from "@/lib/subscriptions/resolver";

export { evaluateSafetyConcernAccess } from "@/lib/safety-concerns/access-policy";

/**
 * Downgrade behavior (documented):
 * - Historical profiles and photos are preserved.
 * - Authorized security leadership (security_leader+) retains read-only access.
 * - Creation, editing, photo upload, archive, and linking are blocked.
 * - Security members lose access when the feature is not entitled.
 */
export type SafetyConcernAccess = SafetyConcernAccessDecision & {
  maxPhotosPerProfile: number;
  maxPhotoSizeMb: number;
  maxPhotoBytes: number;
  /** null = unlimited active profiles */
  maxActiveProfiles: number | null;
};

export type SafetyConcernRouteMode = "read" | "write";

export async function getSafetyConcernAccess(params: {
  organizationId: string;
  role: MembershipRole;
  allowSecurityMemberView?: boolean;
}): Promise<SafetyConcernAccess> {
  const [featureAccess, photoCount, photoSize, profileLimit] = await Promise.all([
    hasFeature({
      organizationId: params.organizationId,
      featureKey: FEATURE_KEYS.SAFETY_CONCERN_PROFILES,
    }),
    getFeatureLimit({
      organizationId: params.organizationId,
      featureKey: FEATURE_KEYS.SAFETY_CONCERN_PHOTO_LIMIT,
    }),
    getFeatureLimit({
      organizationId: params.organizationId,
      featureKey: FEATURE_KEYS.SAFETY_CONCERN_PHOTO_SIZE_MB,
    }),
    getFeatureLimit({
      organizationId: params.organizationId,
      featureKey: FEATURE_KEYS.SAFETY_CONCERN_PROFILE_LIMIT,
    }),
  ]);

  const evaluated = evaluateSafetyConcernAccess({
    entitled: featureAccess.allowed,
    role: params.role,
    allowSecurityMemberView: params.allowSecurityMemberView,
    reason: featureAccess.reason,
  });

  const maxPhotosPerProfile = featureAccess.allowed
    ? Math.max(0, photoCount.limit ?? 0)
    : 0;
  const maxPhotoSizeMb = featureAccess.allowed
    ? Math.max(0, photoSize.limit ?? 0)
    : 0;

  return {
    ...evaluated,
    maxPhotosPerProfile,
    maxPhotoSizeMb,
    maxPhotoBytes: maxPhotoSizeMb * 1024 * 1024,
    maxActiveProfiles: profileLimit.unlimited
      ? null
      : Math.max(0, profileLimit.limit ?? 0),
  };
}

/**
 * Route / page gate for Known Safety Concerns.
 * - read: entitled viewers, or leadership read-only after downgrade
 * - write: requires active entitlement + manage role (checked separately)
 */
export async function resolveSafetyConcernRouteAccess(params: {
  organizationId: string;
  role: MembershipRole;
  mode: SafetyConcernRouteMode;
  allowSecurityMemberView?: boolean;
}): Promise<{
  allowed: boolean;
  access: SafetyConcernAccess;
  reason?: string;
}> {
  const access = await getSafetyConcernAccess({
    organizationId: params.organizationId,
    role: params.role,
    allowSecurityMemberView: params.allowSecurityMemberView,
  });

  if (params.mode === "read") {
    return {
      allowed: access.canRead,
      access,
      reason: access.canRead ? undefined : access.upgradeMessage,
    };
  }

  if (!access.canWrite) {
    return {
      allowed: false,
      access,
      reason: access.readOnly
        ? `${access.upgradeMessage} Existing profiles remain available in read-only mode.`
        : access.upgradeMessage,
    };
  }

  return { allowed: true, access };
}

/** Throws unless the church may create/edit/upload Safety Concern records. */
export async function requireSafetyConcernWrite(params: {
  organizationId: string;
  role: MembershipRole;
}): Promise<SafetyConcernAccess> {
  const route = await resolveSafetyConcernRouteAccess({
    organizationId: params.organizationId,
    role: params.role,
    mode: "write",
  });

  if (!route.allowed) {
    throw new EntitlementError(
      route.reason ??
        "Known Safety Concerns editing is not available on your current plan.",
      {
        code: route.access.entitled ? "feature_disabled" : "feature_disabled",
        featureKey: FEATURE_KEYS.SAFETY_CONCERN_PROFILES,
      },
    );
  }

  await requireFeature({
    organizationId: params.organizationId,
    featureKey: FEATURE_KEYS.SAFETY_CONCERN_PROFILES,
  });

  return route.access;
}

export async function requireSafetyConcernPhotoUpload(params: {
  organizationId: string;
  role: MembershipRole;
  existingCount: number;
  newCount: number;
  files: Array<{ size: number }>;
}): Promise<{ maxCount: number; maxBytes: number; maxSizeMb: number }> {
  const access = await requireSafetyConcernWrite({
    organizationId: params.organizationId,
    role: params.role,
  });

  if (access.maxPhotosPerProfile <= 0 || access.maxPhotoSizeMb <= 0) {
    throw new EntitlementError(
      "Safety Concern photos are not available on your current plan.",
      {
        code: "feature_disabled",
        featureKey: FEATURE_KEYS.SAFETY_CONCERN_PROFILES,
      },
    );
  }

  await requireFeatureCapacity({
    organizationId: params.organizationId,
    featureKey: FEATURE_KEYS.SAFETY_CONCERN_PHOTO_LIMIT,
    currentUsage: params.existingCount,
    requestedIncrease: params.newCount,
  });

  for (const file of params.files) {
    if (file.size > access.maxPhotoBytes) {
      throw new EntitlementError(
        `Each photo must be ${access.maxPhotoSizeMb} MB or smaller on your plan.`,
        {
          code: "limit_exceeded",
          featureKey: FEATURE_KEYS.SAFETY_CONCERN_PHOTO_SIZE_MB,
        },
      );
    }
  }

  return {
    maxCount: access.maxPhotosPerProfile,
    maxBytes: access.maxPhotoBytes,
    maxSizeMb: access.maxPhotoSizeMb,
  };
}

export async function requireSafetyConcernProfileCapacity(params: {
  organizationId: string;
  role: MembershipRole;
  currentActiveCount: number;
}): Promise<void> {
  await requireSafetyConcernWrite({
    organizationId: params.organizationId,
    role: params.role,
  });

  await requireFeatureCapacity({
    organizationId: params.organizationId,
    featureKey: FEATURE_KEYS.SAFETY_CONCERN_PROFILE_LIMIT,
    currentUsage: params.currentActiveCount,
    requestedIncrease: 1,
  });
}
