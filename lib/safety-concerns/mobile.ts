/**
 * Mobile / Expo readiness surface for Known Safety Concerns.
 *
 * Import this module from a future React Native app — not `@/lib/safety-concerns`
 * (that barrel pulls Next.js server defaults and cron scanners).
 *
 * Authorization for mobile must use:
 *   1. Supabase Auth session (JWT) on the device — never cookie bridging
 *   2. Postgres RLS (`can_view_safety_concerns` / `can_manage_safety_concerns`)
 *   3. Pure helpers below for UI gating (`evaluateSafetyConcernAccess`, role checks)
 *
 * Do not persist signed photo URLs. Regenerate per session/view.
 */

import { SAFETY_CONCERN_SIGNED_URL_SECONDS } from "@/lib/safety-concerns/attachment-storage";
import type { SafetyConcernPhoto } from "@/lib/safety-concerns/types";

export type {
  SafetyConcernBrowseItem,
  SafetyConcernBrowsePhoto,
  SafetyConcernChurchSettings,
  SafetyConcernListOptions,
  SafetyConcernPhoto,
  SafetyConcernProfile,
  SafetyConcernProfileStatus,
  SafetyConcernRestrictionStatus,
  SafetyConcernRestrictionType,
} from "@/lib/safety-concerns/types";

export {
  SAFETY_CONCERN_BROWSE_STATUSES,
  SAFETY_CONCERN_FACTUAL_NOTE_GUIDANCE,
  SAFETY_CONCERN_RESTRICTED_BANNER,
  SAFETY_CONCERN_REVIEW_INTERVALS,
  labelForSafetyConcernEnum,
  SAFETY_CONCERN_PROFILE_STATUSES,
  SAFETY_CONCERN_RESTRICTION_TYPES,
} from "@/lib/safety-concerns/constants";

export {
  canManageSafetyConcerns,
  canManageSafetyConcernSettings,
  canReadSafetyConcernAudit,
  canViewSafetyConcernsWhenEntitled,
} from "@/lib/safety-concerns/permissions";

export {
  evaluateSafetyConcernAccess,
  type SafetyConcernAccessDecision,
} from "@/lib/safety-concerns/access-policy";

export {
  SAFETY_CONCERN_MEDIA_BUCKET,
  SAFETY_CONCERN_SIGNED_URL_SECONDS,
  SAFETY_CONCERN_EXIF_POLICY,
  SAFETY_CONCERN_PHOTO_ALLOWED_MIME,
  SAFETY_CONCERN_PHOTO_MAX_BYTES,
  SAFETY_CONCERN_PHOTO_MAX_COUNT,
  extensionForSafetyConcernPhotoMime,
  isSafetyConcernPhotoStoragePath,
  sniffImageMimeFromBytes,
  validateSafetyConcernPhotoBytes,
} from "@/lib/safety-concerns/attachment-storage";

export {
  createSafetyConcernPhotoSignedUrl,
  attachSignedUrlsToSafetyConcernPhotos,
} from "@/lib/safety-concerns/photo-urls";

/** Secure-cache policy for Expo / React Native clients. */
export const SAFETY_CONCERN_MOBILE_CACHE_POLICY = {
  signedUrlTtlSeconds: SAFETY_CONCERN_SIGNED_URL_SECONDS,
  /** Persist signed URLs in AsyncStorage / disk — always regenerate. */
  persistSignedUrls: false as const,
  /** Prefer in-memory image cache keyed by photo id + expiry timestamp. */
  preferredImageCache: "memory" as const,
  /** If using disk cache, encrypt and expire at or before signed URL TTL. */
  maxDiskCacheTtlSeconds: SAFETY_CONCERN_SIGNED_URL_SECONDS,
  /** On 401/403 from storage, discard cached URL and request a new signed URL. */
  refreshOnForbidden: true as const,
  /** Do not include display names or photo bytes in analytics/crash logs. */
  redactIdentifyingLogs: true as const,
  /**
   * EXIF may still exist in uploaded bytes until a server strip pipeline ships.
   * Avoid writing full originals to long-lived shared galleries.
   */
  treatPhotoBytesAsSensitive: true as const,
} as const;

/**
 * Stable swipe order for photos within a profile:
 * primary first, then ascending display_order, then id.
 */
export function orderSafetyConcernPhotosForBrowse<
  T extends Pick<SafetyConcernPhoto, "id" | "is_primary" | "display_order">,
>(photos: T[]): T[] {
  return [...photos].sort((a, b) => {
    if (a.is_primary !== b.is_primary) {
      return a.is_primary ? -1 : 1;
    }
    if (a.display_order !== b.display_order) {
      return a.display_order - b.display_order;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Future Expo integration checklist (do not implement native app here):
 * 1. Supabase Auth with secure refresh-token storage
 * 2. Call browse/list helpers with an authenticated SupabaseClient (required arg)
 * 3. Sign photos via createSafetyConcernPhotoSignedUrl after RLS allows SELECT
 * 4. Honor SAFETY_CONCERN_MOBILE_CACHE_POLICY
 * 5. Optional BFF: GET browse JSON if you want to hide storage paths from the client
 */
export const SAFETY_CONCERN_EXPO_INTEGRATION_POINTS = [
  "auth.supabase_session",
  "data.listSafetyConcernBrowseItems(organizationId, options, client)",
  "images.createSafetyConcernPhotoSignedUrl",
  "cache.SAFETY_CONCERN_MOBILE_CACHE_POLICY",
  "rls.can_view_safety_concern_profile",
  "optional_bff.GET /api/safety-concerns/browse",
] as const;
