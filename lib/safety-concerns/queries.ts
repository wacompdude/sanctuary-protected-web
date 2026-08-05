import type { SupabaseClient } from "@supabase/supabase-js";
import {
  labelForSafetyConcernEnum,
  SAFETY_CONCERN_BROWSE_STATUSES,
  SAFETY_CONCERN_RESTRICTION_TYPES,
} from "@/lib/safety-concerns/constants";
import { orderSafetyConcernPhotosForBrowse } from "@/lib/safety-concerns/mobile";
import { attachSignedUrlsToSafetyConcernPhotos } from "@/lib/safety-concerns/photo-urls";
import type {
  SafetyConcernBrowseItem,
  SafetyConcernChurchSettings,
  SafetyConcernIncidentLink,
  SafetyConcernListOptions,
  SafetyConcernPhoto,
  SafetyConcernProfile,
  SafetyConcernProfileCampus,
  SafetyConcernReview,
} from "@/lib/safety-concerns/types";

/** Lazy Next server client — mobile callers must pass their own SupabaseClient. */
async function getServerSupabaseClient(): Promise<SupabaseClient> {
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    Boolean(error.message?.includes("safety_concern_"))
  );
}

export async function getSafetyConcernChurchSettings(
  churchId: string,
  client?: SupabaseClient,
): Promise<SafetyConcernChurchSettings> {
  const supabase = client ?? (await getServerSupabaseClient());
  const { data, error } = await supabase
    .from("organizations")
    .select(
      "safety_concerns_allow_security_member_view, safety_concerns_review_interval_days, safety_concerns_require_linked_incident, safety_concerns_require_photo_to_activate",
    )
    .eq("id", churchId)
    .maybeSingle();

  if (error || !data) {
    return {
      allow_security_member_view: true,
      review_interval_days: 180,
      require_linked_incident: false,
      require_photo_to_activate: true,
    };
  }

  const interval = Number(data.safety_concerns_review_interval_days ?? 180);
  const review_interval_days =
    interval === 90 || interval === 365 ? interval : 180;

  return {
    allow_security_member_view:
      data.safety_concerns_allow_security_member_view !== false,
    review_interval_days,
    require_linked_incident: Boolean(
      data.safety_concerns_require_linked_incident,
    ),
    require_photo_to_activate:
      data.safety_concerns_require_photo_to_activate !== false,
  };
}

export async function updateSafetyConcernChurchSettings(
  churchId: string,
  settings: SafetyConcernChurchSettings,
  client?: SupabaseClient,
): Promise<{ error: string | null }> {
  const supabase = client ?? (await getServerSupabaseClient());
  const { error } = await supabase
    .from("organizations")
    .update({
      safety_concerns_allow_security_member_view:
        settings.allow_security_member_view,
      safety_concerns_review_interval_days: settings.review_interval_days,
      safety_concerns_require_linked_incident: settings.require_linked_incident,
      safety_concerns_require_photo_to_activate:
        settings.require_photo_to_activate,
    })
    .eq("id", churchId);

  if (error) {
    if (isMissingTableError(error)) {
      return {
        error:
          "Safety concern settings columns are unavailable. Apply migration 048.",
      };
    }
    return { error: error.message };
  }
  return { error: null };
}

/**
 * Enforce church activation gates before setting a profile to active.
 * Pass `profileId: null` for create-as-active (photo/link cannot exist yet).
 */
export async function getSafetyConcernActivationBlockers(params: {
  churchId: string;
  profileId: string | null;
  settings: SafetyConcernChurchSettings;
  client?: SupabaseClient;
}): Promise<string[]> {
  const blockers: string[] = [];
  const supabase = params.client ?? (await getServerSupabaseClient());

  if (params.settings.require_photo_to_activate) {
    if (!params.profileId) {
      blockers.push(
        "A photo is required before activating. Create as draft, upload a photo, then activate.",
      );
    } else {
      const { count, error } = await supabase
        .from("safety_concern_photos")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", params.churchId)
        .eq("profile_id", params.profileId)
        .is("archived_at", null);
      if (error && !isMissingTableError(error)) {
        blockers.push(error.message);
      } else if ((count ?? 0) < 1) {
        blockers.push("Upload at least one photo before activating this profile.");
      }
    }
  }

  if (params.settings.require_linked_incident) {
    if (!params.profileId) {
      blockers.push(
        "A linked incident is required before activating. Create as draft, link an incident, then activate.",
      );
    } else {
      const { count, error } = await supabase
        .from("safety_concern_incidents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", params.churchId)
        .eq("profile_id", params.profileId);
      if (error && !isMissingTableError(error)) {
        blockers.push(error.message);
      } else if ((count ?? 0) < 1) {
        blockers.push(
          "Link at least one same-church incident before activating this profile.",
        );
      }
    }
  }

  return blockers;
}

export async function listSafetyConcernProfiles(
  churchId: string,
  options: SafetyConcernListOptions = {},
  client?: SupabaseClient,
): Promise<SafetyConcernProfile[]> {
  const supabase = client ?? (await getServerSupabaseClient());
  let query = supabase
    .from("safety_concern_profiles")
    .select("*")
    .eq("organization_id", churchId)
    .order("updated_at", { ascending: false });

  if (!options.includeInactive) {
    query = query.is("archived_at", null);
  }

  if (options.status) {
    const statuses = Array.isArray(options.status)
      ? options.status
      : [options.status];
    query = query.in("profile_status", statuses);
  } else if (!options.includeInactive) {
    query = query.in("profile_status", SAFETY_CONCERN_BROWSE_STATUSES);
  }

  const search = options.search?.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, "");
    query = query.or(
      `display_name.ilike.%${escaped}%,known_aliases.ilike.%${escaped}%`,
    );
  }

  if (options.restrictionType) {
    query = query.eq("restriction_type", options.restrictionType);
  }

  if (options.reviewDue) {
    const today = new Date().toISOString().slice(0, 10);
    query = query.lte("next_review_date", today).not("next_review_date", "is", null);
  }

  if (options.limit != null) {
    const from = options.offset ?? 0;
    query = query.range(from, from + options.limit - 1);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }

  let profiles = (data ?? []) as SafetyConcernProfile[];

  if (options.linkedIncidentId && profiles.length > 0) {
    const { data: linkRows, error: linkError } = await supabase
      .from("safety_concern_incidents")
      .select("profile_id")
      .eq("organization_id", churchId)
      .eq("incident_id", options.linkedIncidentId);
    if (linkError && !isMissingTableError(linkError)) {
      throw new Error(linkError.message);
    }
    const linkedIds = new Set(
      (linkRows ?? []).map((row) => String(row.profile_id)),
    );
    profiles = profiles.filter((profile) => linkedIds.has(profile.id));
  }

  if (options.campusId && profiles.length > 0) {
    const campusId = options.campusId;
    const profileIds = profiles.map((profile) => profile.id);
    const { data: campusRows, error: campusError } = await supabase
      .from("safety_concern_profile_campuses")
      .select("profile_id")
      .eq("organization_id", churchId)
      .eq("campus_id", campusId)
      .in("profile_id", profileIds);
    if (campusError && !isMissingTableError(campusError)) {
      throw new Error(campusError.message);
    }
    const scopedIds = new Set(
      (campusRows ?? []).map((row) => String(row.profile_id)),
    );
    profiles = profiles.filter(
      (profile) =>
        profile.scope_type === "church_wide" ||
        profile.primary_campus_id === campusId ||
        scopedIds.has(profile.id),
    );
  }

  return profiles;
}

/**
 * Count active (non-archived) Safety Concern Profiles the caller may see.
 * RLS already scopes by church/role/campus membership. Optional `campusId`
 * further narrows to church-wide + profiles scoped to that campus (dashboard filter).
 * Never returns names or photo metadata — id/count only.
 */
export async function countActiveSafetyConcernProfiles(
  churchId: string,
  options: { campusId?: string | null } = {},
  client?: SupabaseClient,
): Promise<number> {
  const supabase = client ?? (await getServerSupabaseClient());
  const campusId = options.campusId?.trim() || null;

  if (!campusId) {
    const { count, error } = await supabase
      .from("safety_concern_profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", churchId)
      .eq("profile_status", "active")
      .is("archived_at", null);

    if (error) {
      if (isMissingTableError(error)) return 0;
      throw new Error(error.message);
    }
    return count ?? 0;
  }

  const { data, error } = await supabase
    .from("safety_concern_profiles")
    .select("id, scope_type, primary_campus_id")
    .eq("organization_id", churchId)
    .eq("profile_status", "active")
    .is("archived_at", null);

  if (error) {
    if (isMissingTableError(error)) return 0;
    throw new Error(error.message);
  }

  const profiles = (data ?? []) as Pick<
    SafetyConcernProfile,
    "id" | "scope_type" | "primary_campus_id"
  >[];
  if (profiles.length === 0) return 0;

  const profileIds = profiles.map((profile) => profile.id);
  const { data: campusRows, error: campusError } = await supabase
    .from("safety_concern_profile_campuses")
    .select("profile_id")
    .eq("organization_id", churchId)
    .eq("campus_id", campusId)
    .in("profile_id", profileIds);

  if (campusError && !isMissingTableError(campusError)) {
    throw new Error(campusError.message);
  }

  const scopedIds = new Set(
    (campusRows ?? []).map((row) => String(row.profile_id)),
  );

  return profiles.filter(
    (profile) =>
      profile.scope_type === "church_wide" ||
      profile.primary_campus_id === campusId ||
      scopedIds.has(profile.id),
  ).length;
}

export async function getSafetyConcernProfile(
  churchId: string,
  profileId: string,
  client?: SupabaseClient,
): Promise<SafetyConcernProfile | null> {
  const supabase = client ?? (await getServerSupabaseClient());
  const { data, error } = await supabase
    .from("safety_concern_profiles")
    .select("*")
    .eq("organization_id", churchId)
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(error.message);
  }
  return (data as SafetyConcernProfile | null) ?? null;
}

export async function listSafetyConcernPhotos(
  churchId: string,
  profileId: string,
  options?: { includeArchived?: boolean; withSignedUrls?: boolean },
  client?: SupabaseClient,
): Promise<SafetyConcernPhoto[]> {
  const supabase = client ?? (await getServerSupabaseClient());
  let query = supabase
    .from("safety_concern_photos")
    .select("*")
    .eq("organization_id", churchId)
    .eq("profile_id", profileId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!options?.includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }

  const photos = (data ?? []) as SafetyConcernPhoto[];
  if (!options?.withSignedUrls) return photos;

  return attachSignedUrlsToSafetyConcernPhotos({
    supabase,
    churchId,
    photos,
  });
}

export async function listSafetyConcernProfileCampuses(
  churchId: string,
  profileId: string,
  client?: SupabaseClient,
): Promise<SafetyConcernProfileCampus[]> {
  const supabase = client ?? (await getServerSupabaseClient());
  const { data, error } = await supabase
    .from("safety_concern_profile_campuses")
    .select("*")
    .eq("organization_id", churchId)
    .eq("profile_id", profileId);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as SafetyConcernProfileCampus[];
}

export async function listSafetyConcernIncidentLinks(
  churchId: string,
  profileId: string,
  client?: SupabaseClient,
): Promise<SafetyConcernIncidentLink[]> {
  const supabase = client ?? (await getServerSupabaseClient());
  const { data, error } = await supabase
    .from("safety_concern_incidents")
    .select("*")
    .eq("organization_id", churchId)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as SafetyConcernIncidentLink[];
}

export async function listSafetyConcernReviews(
  churchId: string,
  profileId: string,
  client?: SupabaseClient,
): Promise<SafetyConcernReview[]> {
  const supabase = client ?? (await getServerSupabaseClient());
  const { data, error } = await supabase
    .from("safety_concern_reviews")
    .select("*")
    .eq("organization_id", churchId)
    .eq("profile_id", profileId)
    .order("reviewed_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as SafetyConcernReview[];
}

export async function getSafetyConcernProfileDetail(
  churchId: string,
  profileId: string,
  options?: { withSignedUrls?: boolean },
  client?: SupabaseClient,
): Promise<{
  profile: SafetyConcernProfile;
  photos: SafetyConcernPhoto[];
  campuses: SafetyConcernProfileCampus[];
  incidents: SafetyConcernIncidentLink[];
  reviews: SafetyConcernReview[];
} | null> {
  const supabase = client ?? (await getServerSupabaseClient());
  const profile = await getSafetyConcernProfile(churchId, profileId, supabase);
  if (!profile) return null;

  const [photos, campuses, incidents, reviews] = await Promise.all([
    listSafetyConcernPhotos(
      churchId,
      profileId,
      { withSignedUrls: options?.withSignedUrls ?? true },
      supabase,
    ),
    listSafetyConcernProfileCampuses(churchId, profileId, supabase),
    listSafetyConcernIncidentLinks(churchId, profileId, supabase),
    listSafetyConcernReviews(churchId, profileId, supabase),
  ]);

  return { profile, photos, campuses, incidents, reviews };
}

/**
 * Build mobile-ready browse items with signed photo URLs for the deck.
 * Prefer calling this for the active browse set (not unbounded archives).
 */
export async function listSafetyConcernBrowseItems(
  churchId: string,
  options: SafetyConcernListOptions = {},
  client?: SupabaseClient,
): Promise<SafetyConcernBrowseItem[]> {
  const supabase = client ?? (await getServerSupabaseClient());
  const profiles = await listSafetyConcernProfiles(churchId, options, supabase);
  if (profiles.length === 0) return [];

  const profileIds = profiles.map((profile) => profile.id);
  const { data: photoRows, error: photoError } = await supabase
    .from("safety_concern_photos")
    .select("*")
    .eq("organization_id", churchId)
    .in("profile_id", profileIds)
    .is("archived_at", null)
    .order("display_order", { ascending: true });

  if (photoError && !isMissingTableError(photoError)) {
    throw new Error(photoError.message);
  }

  const photosByProfile = new Map<string, SafetyConcernPhoto[]>();
  for (const row of (photoRows ?? []) as SafetyConcernPhoto[]) {
    const list = photosByProfile.get(row.profile_id) ?? [];
    list.push(row);
    photosByProfile.set(row.profile_id, list);
  }

  const { data: campusLinkRows } = await supabase
    .from("safety_concern_profile_campuses")
    .select("profile_id, campus_id")
    .eq("organization_id", churchId)
    .in("profile_id", profileIds);

  const campusIds = [
    ...new Set(
      (campusLinkRows ?? []).map((row) => String(row.campus_id)).filter(Boolean),
    ),
  ];
  const campusNameById = new Map<string, string>();
  if (campusIds.length > 0) {
    const { data: campusRows } = await supabase
      .from("campuses")
      .select("id, name")
      .eq("organization_id", churchId)
      .in("id", campusIds);
    for (const campus of campusRows ?? []) {
      campusNameById.set(String(campus.id), String(campus.name ?? ""));
    }
  }

  const campusNamesByProfile = new Map<string, string[]>();
  for (const row of campusLinkRows ?? []) {
    const profileId = String(row.profile_id);
    const name = campusNameById.get(String(row.campus_id)) ?? "";
    if (!name) continue;
    const list = campusNamesByProfile.get(profileId) ?? [];
    list.push(name);
    campusNamesByProfile.set(profileId, list);
  }

  const items: SafetyConcernBrowseItem[] = [];

  for (const profile of profiles) {
    const photos = photosByProfile.get(profile.id) ?? [];
    const signedPhotos = await attachSignedUrlsToSafetyConcernPhotos({
      supabase,
      churchId,
      photos,
    });
    const ordered = orderSafetyConcernPhotosForBrowse(signedPhotos);
    const primary = ordered[0] ?? null;

    items.push({
      id: profile.id,
      displayName: profile.display_name,
      status: profile.profile_status,
      primaryPhotoUrl: primary?.signed_url ?? null,
      photoCount: ordered.length,
      photos: ordered.map((photo) => ({
        id: photo.id,
        signedUrl: photo.signed_url ?? null,
        contextNote: photo.photo_context_note,
        isPrimary: photo.is_primary,
        displayOrder: photo.display_order,
      })),
      shortNote: profile.short_note,
      responseGuidance: profile.response_guidance,
      aliases: profile.known_aliases,
      restriction:
        profile.restriction_type === "none"
          ? null
          : {
              type: profile.restriction_type,
              status: profile.restriction_status,
              endDate: profile.restriction_end_date,
              label: labelForSafetyConcernEnum(
                SAFETY_CONCERN_RESTRICTION_TYPES,
                profile.restriction_type,
              ),
            },
      campusNames: campusNamesByProfile.get(profile.id) ?? [],
      lastReviewedAt: profile.last_reviewed_at,
      nextReviewDate: profile.next_review_date,
    });
  }

  return items;
}
