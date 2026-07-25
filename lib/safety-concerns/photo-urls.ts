import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SAFETY_CONCERN_MEDIA_BUCKET,
  SAFETY_CONCERN_SIGNED_URL_SECONDS,
  isSafetyConcernPhotoStoragePath,
} from "@/lib/safety-concerns/attachment-storage";
import type { SafetyConcernPhoto } from "@/lib/safety-concerns/types";

/**
 * Create a short-lived signed URL for an authorized photo row.
 * Call only after church/role/entitlement checks have succeeded.
 * Do not log the returned URL.
 */
export async function createSafetyConcernPhotoSignedUrl(params: {
  supabase: SupabaseClient;
  churchId: string;
  profileId: string;
  storagePath: string;
  expiresInSeconds?: number;
}): Promise<string | null> {
  if (
    !isSafetyConcernPhotoStoragePath(
      params.storagePath,
      params.churchId,
      params.profileId,
    )
  ) {
    return null;
  }

  const { data, error } = await params.supabase.storage
    .from(SAFETY_CONCERN_MEDIA_BUCKET)
    .createSignedUrl(
      params.storagePath,
      params.expiresInSeconds ?? SAFETY_CONCERN_SIGNED_URL_SECONDS,
    );

  if (error || !data?.signedUrl) {
    return null;
  }
  return data.signedUrl;
}

/** Attach signed URLs for photos that will be displayed (not the full catalog). */
export async function attachSignedUrlsToSafetyConcernPhotos(params: {
  supabase: SupabaseClient;
  churchId: string;
  photos: SafetyConcernPhoto[];
  expiresInSeconds?: number;
}): Promise<SafetyConcernPhoto[]> {
  const results: SafetyConcernPhoto[] = [];

  for (const photo of params.photos) {
    if (photo.archived_at) {
      results.push({ ...photo, signed_url: null });
      continue;
    }

    const signedUrl = await createSafetyConcernPhotoSignedUrl({
      supabase: params.supabase,
      churchId: params.churchId,
      profileId: photo.profile_id,
      storagePath: photo.storage_path,
      expiresInSeconds: params.expiresInSeconds,
    });

    results.push({ ...photo, signed_url: signedUrl });
  }

  return results;
}

/**
 * Remove a storage object after a failed DB write.
 * Best-effort; failures are ignored so the caller can surface the primary error.
 */
export async function removeSafetyConcernPhotoObject(params: {
  supabase: SupabaseClient;
  storagePath: string;
}): Promise<void> {
  await params.supabase.storage
    .from(SAFETY_CONCERN_MEDIA_BUCKET)
    .remove([params.storagePath]);
}
