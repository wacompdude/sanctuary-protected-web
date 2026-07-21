import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_POLICY_MANAGE_PAGE_SIZE,
  DEFAULT_POLICY_PAGE_SIZE,
  estimateReadTimeMinutes,
  policyMigrationHintFromError,
} from "@/lib/policies/constants";
import {
  POLICY_MEDIA_BUCKET,
  POLICY_SIGNED_URL_SECONDS,
} from "@/lib/policies/attachment-storage";
import type {
  PolicyApproval,
  PolicyApprovalDecision,
  PolicyAttachment,
  PolicyAttachmentType,
  PolicyCategory,
  PolicyContentFormat,
  PolicyDocumentDetail,
  PolicyDocumentListItem,
  PolicyDocumentStatus,
  PolicyDocumentType,
  PolicyAudienceScope,
  PolicyLibraryFilters,
  PolicyLibraryResult,
  PolicyManageFilters,
  PolicyManageResult,
  PolicyVersion,
  PolicyVersionStatus,
} from "@/lib/policies/types";

export { ChurchAccessError } from "@/lib/church/errors";

type DocumentRow = {
  id: string;
  church_id: string;
  campus_id: string | null;
  category_id: string | null;
  document_type: string;
  title: string;
  slug: string;
  summary: string | null;
  status: string;
  current_version_id: string | null;
  owner_user_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  published_by: string | null;
  published_at: string | null;
  effective_date: string | null;
  review_due_date: string | null;
  retired_at: string | null;
  archived_at: string | null;
  requires_acknowledgment: boolean | null;
  acknowledgment_due_days: number | null;
  reacknowledge_on_publish: boolean | null;
  is_emergency_document: boolean | null;
  is_featured: boolean | null;
  mobile_available: boolean | null;
  offline_mobile_allowed: boolean | null;
  audience_scope: string;
  minimum_role: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  policy_categories?: { id: string; key: string; label: string } | null;
  campuses?: { id: string; name: string } | null;
};

type VersionRow = {
  id: string;
  church_id: string;
  policy_document_id: string;
  version_number: number | string;
  version_label: string;
  title_snapshot: string;
  summary_snapshot: string | null;
  content: string;
  content_format: string;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
  submitted_for_review_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  superseded_at: string | null;
  status: string;
  word_count: number | null;
  checksum: string | null;
};

const DOCUMENT_SELECT = `
  id, church_id, campus_id, category_id, document_type, title, slug, summary,
  status, current_version_id, owner_user_id, created_by, updated_by, published_by,
  published_at, effective_date, review_due_date, retired_at, archived_at,
  requires_acknowledgment, acknowledgment_due_days, reacknowledge_on_publish,
  is_emergency_document, is_featured, mobile_available, offline_mobile_allowed,
  audience_scope, minimum_role, metadata, created_at, updated_at,
  policy_categories ( id, key, label ),
  campuses ( id, name )
`;

function isMissingTableError(message: string) {
  return Boolean(policyMigrationHintFromError(message));
}

function mapVersion(row: VersionRow): PolicyVersion {
  return {
    id: row.id,
    church_id: row.church_id,
    policy_document_id: row.policy_document_id,
    version_number: Number(row.version_number),
    version_label: row.version_label,
    title_snapshot: row.title_snapshot,
    summary_snapshot: row.summary_snapshot,
    content: row.content ?? "",
    content_format: (row.content_format as PolicyContentFormat) || "markdown",
    change_summary: row.change_summary,
    created_by: row.created_by,
    created_at: row.created_at,
    submitted_for_review_at: row.submitted_for_review_at,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    published_at: row.published_at,
    superseded_at: row.superseded_at,
    status: (row.status as PolicyVersionStatus) || "published",
    word_count: Number(row.word_count ?? 0),
    checksum: row.checksum,
  };
}

function mapListItem(
  row: DocumentRow,
  version: Pick<
    VersionRow,
    "version_label" | "version_number" | "word_count"
  > | null,
  extras?: {
    acknowledgment_status?: string | null;
    tags?: string[];
  },
): PolicyDocumentListItem {
  return {
    id: row.id,
    church_id: row.church_id,
    campus_id: row.campus_id,
    category_id: row.category_id,
    document_type: row.document_type as PolicyDocumentType,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    status: row.status as PolicyDocumentStatus,
    current_version_id: row.current_version_id,
    owner_user_id: row.owner_user_id,
    created_by: row.created_by,
    updated_by: row.updated_by,
    published_by: row.published_by,
    published_at: row.published_at,
    effective_date: row.effective_date,
    review_due_date: row.review_due_date,
    retired_at: row.retired_at,
    archived_at: row.archived_at,
    requires_acknowledgment: Boolean(row.requires_acknowledgment),
    acknowledgment_due_days: row.acknowledgment_due_days,
    reacknowledge_on_publish: Boolean(row.reacknowledge_on_publish ?? true),
    is_emergency_document: Boolean(row.is_emergency_document),
    is_featured: Boolean(row.is_featured),
    mobile_available: row.mobile_available !== false,
    offline_mobile_allowed: Boolean(row.offline_mobile_allowed),
    audience_scope: row.audience_scope as PolicyAudienceScope,
    minimum_role: row.minimum_role,
    metadata: row.metadata ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
    category_label: row.policy_categories?.label ?? null,
    category_key: row.policy_categories?.key ?? null,
    version_label: version?.version_label ?? null,
    version_number:
      version?.version_number != null ? Number(version.version_number) : null,
    campus_name: row.campuses?.name ?? null,
    read_time_minutes: estimateReadTimeMinutes(version?.word_count),
    acknowledgment_status: extras?.acknowledgment_status ?? null,
    tags: extras?.tags ?? [],
  };
}

async function arePolicyTablesAvailable(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  const { error } = await supabase
    .from("policy_documents")
    .select("id")
    .limit(1);
  if (!error) return true;
  if (isMissingTableError(error.message)) return false;
  throw new Error(error.message);
}

async function loadVersionsByIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  versionIds: string[],
): Promise<Map<string, VersionRow>> {
  const map = new Map<string, VersionRow>();
  if (versionIds.length === 0) return map;
  const { data, error } = await supabase
    .from("policy_versions")
    .select(
      `id, church_id, policy_document_id, version_number, version_label,
       title_snapshot, summary_snapshot, content, content_format, change_summary,
       created_by, created_at, submitted_for_review_at, approved_by, approved_at,
       published_at, superseded_at, status, word_count, checksum`,
    )
    .in("id", versionIds);
  if (error) {
    if (isMissingTableError(error.message)) return map;
    throw new Error(error.message);
  }
  for (const row of (data ?? []) as VersionRow[]) {
    map.set(row.id, row);
  }
  return map;
}

export async function listPolicyCategories(
  churchId: string,
): Promise<PolicyCategory[]> {
  const supabase = await createClient();
  const available = await arePolicyTablesAvailable(supabase);
  if (!available) return [];

  try {
    await supabase.rpc("ensure_default_policy_categories", {
      p_church_id: churchId,
    });
  } catch {
    // Seed is best-effort when RPC is unavailable.
  }

  const { data, error } = await supabase
    .from("policy_categories")
    .select(
      "id, church_id, key, label, description, is_system, sort_order, archived_at",
    )
    .eq("church_id", churchId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as PolicyCategory[];
}

export async function countMyPendingPolicyAcknowledgments(
  churchId: string,
  userId: string,
): Promise<number> {
  const supabase = await createClient();
  const available = await arePolicyTablesAvailable(supabase);
  if (!available) return 0;

  const { count, error } = await supabase
    .from("policy_acknowledgments")
    .select("id", { count: "exact", head: true })
    .eq("church_id", churchId)
    .eq("user_id", userId)
    .in("acknowledgment_status", ["assigned", "viewed", "overdue"]);

  if (error) {
    if (isMissingTableError(error.message)) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

async function enrichDocuments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  churchId: string,
  rows: DocumentRow[],
  userId?: string | null,
): Promise<PolicyDocumentListItem[]> {
  const versionIds = rows
    .map((row) => row.current_version_id)
    .filter((id): id is string => Boolean(id));
  const versions = await loadVersionsByIds(supabase, versionIds);
  const ids = rows.map((row) => row.id);

  const ackByDoc = new Map<string, string>();
  if (userId && ids.length > 0) {
    const { data: acks } = await supabase
      .from("policy_acknowledgments")
      .select("policy_document_id, acknowledgment_status")
      .eq("church_id", churchId)
      .eq("user_id", userId)
      .in("policy_document_id", ids);
    for (const ack of acks ?? []) {
      ackByDoc.set(
        String(ack.policy_document_id),
        String(ack.acknowledgment_status),
      );
    }
  }

  const tagsByDoc = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: tagRows } = await supabase
      .from("policy_document_tags")
      .select("policy_document_id, policy_tags ( name )")
      .eq("church_id", churchId)
      .in("policy_document_id", ids);
    for (const row of tagRows ?? []) {
      const docId = String(row.policy_document_id);
      const name = (row.policy_tags as { name?: string } | null)?.name;
      if (!name) continue;
      const list = tagsByDoc.get(docId) ?? [];
      list.push(name);
      tagsByDoc.set(docId, list);
    }
  }

  return rows.map((row) => {
    const version = row.current_version_id
      ? versions.get(row.current_version_id) ?? null
      : null;
    return mapListItem(row, version, {
      acknowledgment_status: ackByDoc.get(row.id) ?? null,
      tags: tagsByDoc.get(row.id) ?? [],
    });
  });
}

export async function getPublishedPolicies(
  churchId: string,
  filters: PolicyLibraryFilters = {},
): Promise<PolicyLibraryResult> {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    100,
    Math.max(1, filters.pageSize ?? DEFAULT_POLICY_PAGE_SIZE),
  );
  const empty: PolicyLibraryResult = {
    items: [],
    total: 0,
    page,
    pageSize,
    emergency: [],
    featured: [],
    recentlyUpdated: [],
    myPendingAcknowledgments: 0,
    tablesAvailable: false,
  };

  const available = await arePolicyTablesAvailable(supabase);
  if (!available) return empty;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let query = supabase
    .from("policy_documents")
    .select(DOCUMENT_SELECT, { count: "exact" })
    .eq("church_id", churchId)
    .eq("status", "published");

  if (filters.documentType) query = query.eq("document_type", filters.documentType);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.campusFilterOr) {
    query = query.or(filters.campusFilterOr);
  } else if (filters.campusId) {
    query = query.or(
      `campus_id.eq.${filters.campusId},campus_id.is.null`,
    );
  }
  if (filters.emergencyOnly) query = query.eq("is_emergency_document", true);
  if (filters.acknowledgmentRequired) {
    query = query.eq("requires_acknowledgment", true);
  }
  if (filters.featuredOnly) query = query.eq("is_featured", true);
  if (filters.mobileAvailable) query = query.eq("mobile_available", true);
  if (filters.q?.trim()) {
    const q = filters.q.trim().replace(/[%_,]/g, " ");
    query = query.or(
      `title.ilike.%${q}%,summary.ilike.%${q}%,slug.ilike.%${q}%`,
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query
    .order("is_emergency_document", { ascending: false })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    if (isMissingTableError(error.message)) return empty;
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as DocumentRow[];
  const items = await enrichDocuments(supabase, churchId, rows, user?.id);

  const [{ data: emergencyRows }, { data: featuredRows }, { data: recentRows }] =
    await Promise.all([
      supabase
        .from("policy_documents")
        .select(DOCUMENT_SELECT)
        .eq("church_id", churchId)
        .eq("status", "published")
        .eq("is_emergency_document", true)
        .order("updated_at", { ascending: false })
        .limit(6),
      supabase
        .from("policy_documents")
        .select(DOCUMENT_SELECT)
        .eq("church_id", churchId)
        .eq("status", "published")
        .eq("is_featured", true)
        .order("updated_at", { ascending: false })
        .limit(6),
      supabase
        .from("policy_documents")
        .select(DOCUMENT_SELECT)
        .eq("church_id", churchId)
        .eq("status", "published")
        .order("updated_at", { ascending: false })
        .limit(6),
    ]);

  const [emergency, featured, recentlyUpdated, myPendingAcknowledgments] =
    await Promise.all([
      enrichDocuments(
        supabase,
        churchId,
        (emergencyRows ?? []) as unknown as DocumentRow[],
        user?.id,
      ),
      enrichDocuments(
        supabase,
        churchId,
        (featuredRows ?? []) as unknown as DocumentRow[],
        user?.id,
      ),
      enrichDocuments(
        supabase,
        churchId,
        (recentRows ?? []) as unknown as DocumentRow[],
        user?.id,
      ),
      user
        ? countMyPendingPolicyAcknowledgments(churchId, user.id)
        : Promise.resolve(0),
    ]);

  return {
    items,
    total: count ?? items.length,
    page,
    pageSize,
    emergency,
    featured,
    recentlyUpdated,
    myPendingAcknowledgments,
    tablesAvailable: true,
  };
}

export async function getPolicyById(
  churchId: string,
  policyId: string,
): Promise<PolicyDocumentDetail | null> {
  const supabase = await createClient();
  const available = await arePolicyTablesAvailable(supabase);
  if (!available) return null;

  const { data, error } = await supabase
    .from("policy_documents")
    .select(DOCUMENT_SELECT)
    .eq("church_id", churchId)
    .eq("id", policyId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;

  const row = data as unknown as DocumentRow;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [listItem] = await enrichDocuments(
    supabase,
    churchId,
    [row],
    user?.id,
  );

  let current_version: PolicyVersion | null = null;
  if (row.current_version_id) {
    const versions = await loadVersionsByIds(supabase, [
      row.current_version_id,
    ]);
    const version = versions.get(row.current_version_id);
    if (version) current_version = mapVersion(version);
  }

  return {
    ...listItem,
    current_version,
  };
}

export async function getCurrentPolicyVersion(
  churchId: string,
  policyId: string,
): Promise<PolicyVersion | null> {
  const detail = await getPolicyById(churchId, policyId);
  return detail?.current_version ?? null;
}

export async function searchPolicies(
  churchId: string,
  query: string,
  filters: Omit<PolicyLibraryFilters, "q"> = {},
) {
  return getPublishedPolicies(churchId, { ...filters, q: query });
}

export async function listCampusesForPolicies(churchId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campuses")
    .select("id, name, status")
    .eq("church_id", churchId)
    .order("name", { ascending: true });

  if (error) return [];
  return (data ?? []) as { id: string; name: string; status: string }[];
}

export async function listManagedPolicies(
  churchId: string,
  filters: PolicyManageFilters = {},
): Promise<PolicyManageResult> {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    100,
    Math.max(1, filters.pageSize ?? DEFAULT_POLICY_MANAGE_PAGE_SIZE),
  );
  const empty: PolicyManageResult = {
    items: [],
    total: 0,
    page,
    pageSize,
    tablesAvailable: false,
  };

  const available = await arePolicyTablesAvailable(supabase);
  if (!available) return empty;

  let query = supabase
    .from("policy_documents")
    .select(DOCUMENT_SELECT, { count: "exact" })
    .eq("church_id", churchId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.documentType) {
    query = query.eq("document_type", filters.documentType);
  }
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.campusFilterOr) {
    query = query.or(filters.campusFilterOr);
  } else if (filters.campusId) {
    query = query.or(
      `campus_id.eq.${filters.campusId},campus_id.is.null`,
    );
  }
  if (!filters.includeArchived && !filters.status) {
    query = query.neq("status", "archived");
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim().replace(/[%_,]/g, " ");
    query = query.or(
      `title.ilike.%${q}%,summary.ilike.%${q}%,slug.ilike.%${q}%`,
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    if (isMissingTableError(error.message)) return empty;
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as DocumentRow[];
  const items = await enrichDocuments(supabase, churchId, rows);

  return {
    items,
    total: count ?? items.length,
    page,
    pageSize,
    tablesAvailable: true,
  };
}

export async function listPolicyVersions(
  churchId: string,
  policyId: string,
): Promise<PolicyVersion[]> {
  const supabase = await createClient();
  const available = await arePolicyTablesAvailable(supabase);
  if (!available) return [];

  const { data, error } = await supabase
    .from("policy_versions")
    .select(
      `id, church_id, policy_document_id, version_number, version_label,
       title_snapshot, summary_snapshot, content, content_format, change_summary,
       created_by, created_at, submitted_for_review_at, approved_by, approved_at,
       published_at, superseded_at, status, word_count, checksum`,
    )
    .eq("church_id", churchId)
    .eq("policy_document_id", policyId)
    .order("version_number", { ascending: false });

  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as VersionRow[]).map(mapVersion);
}

export async function listPolicyApprovals(
  churchId: string,
  policyId: string,
): Promise<PolicyApproval[]> {
  const supabase = await createClient();
  const available = await arePolicyTablesAvailable(supabase);
  if (!available) return [];

  const { data, error } = await supabase
    .from("policy_approvals")
    .select(
      "id, church_id, policy_document_id, policy_version_id, decision, notes, actor_user_id, created_at",
    )
    .eq("church_id", churchId)
    .eq("policy_document_id", policyId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as PolicyApproval[]).map((row) => ({
    ...row,
    decision: row.decision as PolicyApprovalDecision,
  }));
}

export async function getDefaultReviewPeriodDays(
  churchId: string,
): Promise<number> {
  const supabase = await createClient();
  const available = await arePolicyTablesAvailable(supabase);
  if (!available) return 365;

  const { data, error } = await supabase
    .from("church_policy_settings")
    .select("default_review_period_days")
    .eq("church_id", churchId)
    .maybeSingle();

  if (error || !data) return 365;
  return Number(data.default_review_period_days ?? 365) || 365;
}

export async function listPolicyAttachments(
  churchId: string,
  policyId: string,
): Promise<PolicyAttachment[]> {
  const supabase = await createClient();
  const available = await arePolicyTablesAvailable(supabase);
  if (!available) return [];

  const { data, error } = await supabase
    .from("policy_attachments")
    .select(
      `id, church_id, policy_document_id, policy_version_id, file_name,
       storage_path, mime_type, size_bytes, attachment_type, description,
       uploaded_by, created_at, archived_at`,
    )
    .eq("church_id", churchId)
    .eq("policy_document_id", policyId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw new Error(error.message);
  }

  const items: PolicyAttachment[] = [];
  for (const row of data ?? []) {
    let signed_url: string | null = null;
    const { data: signed } = await supabase.storage
      .from(POLICY_MEDIA_BUCKET)
      .createSignedUrl(String(row.storage_path), POLICY_SIGNED_URL_SECONDS);
    signed_url = signed?.signedUrl ?? null;

    items.push({
      id: String(row.id),
      church_id: String(row.church_id),
      policy_document_id: String(row.policy_document_id),
      policy_version_id: row.policy_version_id
        ? String(row.policy_version_id)
        : null,
      file_name: String(row.file_name),
      storage_path: String(row.storage_path),
      mime_type: String(row.mime_type),
      size_bytes: Number(row.size_bytes ?? 0),
      attachment_type: row.attachment_type as PolicyAttachmentType,
      description: row.description ? String(row.description) : null,
      uploaded_by: row.uploaded_by ? String(row.uploaded_by) : null,
      created_at: String(row.created_at),
      archived_at: row.archived_at ? String(row.archived_at) : null,
      signed_url,
    });
  }
  return items;
}
