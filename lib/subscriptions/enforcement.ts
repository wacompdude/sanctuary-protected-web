import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { EntitlementError } from "@/lib/subscriptions/errors";
import { FEATURE_KEYS, type FeatureKey } from "@/lib/subscriptions/feature-keys";
import {
  getFeatureLimit,
  hasFeature,
  requireFeature,
  requireFeatureCapacity,
} from "@/lib/subscriptions/resolver";

export function isEntitlementError(error: unknown): error is EntitlementError {
  return error instanceof EntitlementError;
}

export function entitlementErrorMessage(error: unknown): string | null {
  if (error instanceof EntitlementError) return error.message;
  return null;
}

export async function countActiveChurchMembers(
  churchId: string,
  client?: SupabaseClient,
): Promise<number> {
  const supabase = client ?? (await createClient());
  const { count, error } = await supabase
    .from("church_memberships")
    .select("id", { count: "exact", head: true })
    .eq("church_id", churchId)
    .eq("status", "active");

  if (error) {
    throw new Error("Unable to count active church members.");
  }
  return count ?? 0;
}

export async function countActiveCampuses(
  churchId: string,
  client?: SupabaseClient,
): Promise<number> {
  const supabase = client ?? (await createClient());
  const { count, error } = await supabase
    .from("campuses")
    .select("id", { count: "exact", head: true })
    .eq("church_id", churchId)
    .eq("status", "active");

  if (error) {
    throw new Error("Unable to count active campuses.");
  }
  return count ?? 0;
}

/** Seat check for flows that create/reactivate an active membership. Pending invites are excluded. */
export async function requireActiveSeatCapacity(params: {
  churchId: string;
  requestedIncrease?: number;
  /** Use admin/service client when the caller is not yet a church member (invite accept). */
  client?: SupabaseClient;
}): Promise<void> {
  const currentUsage = await countActiveChurchMembers(
    params.churchId,
    params.client,
  );
  await requireFeatureCapacity({
    churchId: params.churchId,
    featureKey: FEATURE_KEYS.USERS_ACTIVE_LIMIT,
    currentUsage,
    requestedIncrease: params.requestedIncrease ?? 1,
  });
}

export { NAV_FEATURE_REQUIREMENTS } from "@/lib/subscriptions/nav-features";

export async function getEnabledFeatureKeys(
  churchId: string,
  featureKeys: FeatureKey[],
): Promise<Set<FeatureKey>> {
  const results = await Promise.all(
    featureKeys.map(async (featureKey) => {
      const access = await hasFeature({ churchId, featureKey });
      return access.allowed ? featureKey : null;
    }),
  );
  return new Set(results.filter((key): key is FeatureKey => key != null));
}

/**
 * Gate creating another campus or reactivating one.
 * Multi-campus is required once any campus already exists.
 * Numeric capacity applies only when the resulting campus will be active.
 */
export async function requireCampusCreateCapacity(params: {
  churchId: string;
  /** True when this write produces/keeps an active campus. */
  willBeActive?: boolean;
  client?: SupabaseClient;
}): Promise<void> {
  const supabase = params.client ?? (await createClient());
  const activeCount = await countActiveCampuses(params.churchId, supabase);

  const { count: existingCount, error } = await supabase
    .from("campuses")
    .select("id", { count: "exact", head: true })
    .eq("church_id", params.churchId);

  if (error) {
    throw new Error("Unable to count campuses.");
  }

  if ((existingCount ?? 0) >= 1) {
    await requireFeature({
      churchId: params.churchId,
      featureKey: FEATURE_KEYS.MULTI_CAMPUS,
    });
  }

  if (params.willBeActive !== false) {
    await requireFeatureCapacity({
      churchId: params.churchId,
      featureKey: FEATURE_KEYS.CAMPUS_LIMIT,
      currentUsage: activeCount,
      requestedIncrease: 1,
    });
  }
}

export async function getIncidentPhotoEntitlements(churchId: string): Promise<{
  enabled: boolean;
  maxCount: number;
  maxSizeMb: number;
  maxBytes: number;
  reason?: string;
}> {
  const [access, countLimit, sizeLimit] = await Promise.all([
    hasFeature({
      churchId,
      featureKey: FEATURE_KEYS.INCIDENT_PHOTOS,
    }),
    getFeatureLimit({
      churchId,
      featureKey: FEATURE_KEYS.INCIDENT_PHOTO_COUNT_LIMIT,
    }),
    getFeatureLimit({
      churchId,
      featureKey: FEATURE_KEYS.INCIDENT_PHOTO_SIZE_LIMIT_MB,
    }),
  ]);

  const maxCount = access.allowed
    ? Math.max(0, countLimit.limit ?? 0)
    : 0;
  const maxSizeMb = access.allowed
    ? Math.max(0, sizeLimit.limit ?? 0)
    : 0;

  return {
    enabled: access.allowed && maxCount > 0 && maxSizeMb > 0,
    maxCount,
    maxSizeMb,
    maxBytes: maxSizeMb * 1024 * 1024,
    reason: access.allowed ? undefined : access.reason,
  };
}

export async function requireIncidentPhotoUpload(params: {
  churchId: string;
  existingCount: number;
  newCount: number;
  files: Array<{ size: number }>;
}): Promise<{ maxCount: number; maxBytes: number; maxSizeMb: number }> {
  await requireFeature({
    churchId: params.churchId,
    featureKey: FEATURE_KEYS.INCIDENT_PHOTOS,
  });

  const limits = await getIncidentPhotoEntitlements(params.churchId);
  if (!limits.enabled) {
    throw new EntitlementError(
      limits.reason ??
        "Incident photos are not available on your current plan. Upgrade to unlock them.",
      {
        code: "feature_disabled",
        featureKey: FEATURE_KEYS.INCIDENT_PHOTOS,
      },
    );
  }

  await requireFeatureCapacity({
    churchId: params.churchId,
    featureKey: FEATURE_KEYS.INCIDENT_PHOTO_COUNT_LIMIT,
    currentUsage: params.existingCount,
    requestedIncrease: params.newCount,
  });

  for (const file of params.files) {
    if (file.size > limits.maxBytes) {
      throw new EntitlementError(
        `Each photo must be ${limits.maxSizeMb} MB or smaller on your plan.`,
        {
          code: "limit_exceeded",
          featureKey: FEATURE_KEYS.INCIDENT_PHOTO_SIZE_LIMIT_MB,
        },
      );
    }
  }

  return {
    maxCount: limits.maxCount,
    maxBytes: limits.maxBytes,
    maxSizeMb: limits.maxSizeMb,
  };
}
