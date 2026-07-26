import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HELP_ASSET_SIGNED_URL_SECONDS,
  HELP_CENTER_ASSETS_BUCKET,
  isHelpAssetStoragePath,
} from "@/lib/help/attachment-storage";

/**
 * Short-lived signed URL for a Help screenshot/attachment.
 * Call only with an authenticated Supabase client after RLS allows the row.
 * Do not log or persist the returned URL.
 */
export async function createHelpAssetSignedUrl(params: {
  client: SupabaseClient;
  storagePath: string;
  articleId?: string;
  expiresInSeconds?: number;
}): Promise<string | null> {
  if (!isHelpAssetStoragePath(params.storagePath, params.articleId)) {
    return null;
  }

  const { data, error } = await params.client.storage
    .from(HELP_CENTER_ASSETS_BUCKET)
    .createSignedUrl(
      params.storagePath,
      params.expiresInSeconds ?? HELP_ASSET_SIGNED_URL_SECONDS,
    );

  if (error || !data?.signedUrl) {
    return null;
  }
  return data.signedUrl;
}
