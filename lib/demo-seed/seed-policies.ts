import {
  getRegisteredId,
  registerSeedRecord,
  track,
} from "@/lib/demo-seed/registry";
import type { DemoSeedContext } from "@/lib/demo-seed/types";
import { log, warn } from "@/lib/demo-seed/types";

const DOCUMENT_TYPES = [
  "policy",
  "procedure",
  "standard_operating_procedure",
  "emergency_plan",
  "checklist",
  "guideline",
  "training_document",
  "reference",
  "form",
  "other",
] as const;

const CATEGORY_KEYS = [
  "emergency_response",
  "medical_response",
  "security_operations",
  "communications",
  "facility_security",
  "child_safety",
  "volunteer_conduct",
  "access_control",
  "camera_operations",
  "incident_management",
  "cybersecurity",
  "data_privacy",
  "equipment",
  "training",
  "administration",
  "other",
] as const;

const TYPE_LABEL: Record<(typeof DOCUMENT_TYPES)[number], string> = {
  policy: "Policy",
  procedure: "Procedure",
  standard_operating_procedure: "SOP",
  emergency_plan: "Emergency Plan",
  checklist: "Checklist",
  guideline: "Guideline",
  training_document: "Training Document",
  reference: "Reference",
  form: "Form",
  other: "Document",
};

const CATEGORY_LABEL: Record<(typeof CATEGORY_KEYS)[number], string> = {
  emergency_response: "Emergency Response",
  medical_response: "Medical Response",
  security_operations: "Security Operations",
  communications: "Communications",
  facility_security: "Facility Security",
  child_safety: "Child Safety",
  volunteer_conduct: "Volunteer Conduct",
  access_control: "Access Control",
  camera_operations: "Camera Operations",
  incident_management: "Incident Management",
  cybersecurity: "Cybersecurity",
  data_privacy: "Data Privacy",
  equipment: "Equipment",
  training: "Training",
  administration: "Administration",
  other: "General",
};

type PolicySeedDef = {
  seedKey: string;
  document_type: (typeof DOCUMENT_TYPES)[number];
  categoryKey: (typeof CATEGORY_KEYS)[number];
  title: string;
  slug: string;
  status: "published" | "draft" | "under_review" | "approved";
  requires_acknowledgment: boolean;
  is_emergency_document: boolean;
  audience_scope:
    | "all_members"
    | "security_team"
    | "security_leadership"
    | "administrators";
};

function buildPolicyDefs(): PolicySeedDef[] {
  const defs: PolicySeedDef[] = [];
  for (let i = 0; i < 50; i++) {
    const n = i + 1;
    const document_type = DOCUMENT_TYPES[i % DOCUMENT_TYPES.length]!;
    const categoryKey = CATEGORY_KEYS[i % CATEGORY_KEYS.length]!;
    const typeLabel = TYPE_LABEL[document_type];
    const categoryLabel = CATEGORY_LABEL[categoryKey];
    const status: PolicySeedDef["status"] =
      n % 17 === 0 ? "draft" : n % 13 === 0 ? "under_review" : n % 11 === 0 ? "approved" : "published";

    defs.push({
      seedKey: `policy.${String(n).padStart(2, "0")}`,
      document_type,
      categoryKey,
      title: `${categoryLabel} ${typeLabel} ${n}`.slice(0, 200),
      slug: `demo-policy-${String(n).padStart(2, "0")}`,
      status,
      requires_acknowledgment: n % 5 === 0,
      is_emergency_document:
        document_type === "emergency_plan" ||
        categoryKey === "emergency_response",
      audience_scope:
        n % 7 === 0
          ? "security_leadership"
          : n % 4 === 0
            ? "security_team"
            : n % 9 === 0
              ? "administrators"
              : "all_members",
    });
  }
  return defs;
}

function markdownBody(def: PolicySeedDef): string {
  return [
    `# ${def.title}`,
    "",
    "> **FICTITIOUS TEST DOCUMENT** — First Church of the First Church demo seed. Not an official policy.",
    "",
    "## Purpose",
    `This ${TYPE_LABEL[def.document_type].toLowerCase()} covers **${CATEGORY_LABEL[def.categoryKey]}** for all campuses (church-wide).`,
    "",
    "## Scope",
    "- Applies to Anytown Campus and Sunshine Campus",
    "- Applies to all security and ministry volunteers within the audience scope",
    "",
    "## Procedure summary",
    "1. Assess the situation and notify the Security Leader when required.",
    "2. Document actions in the incident or operations log.",
    "3. Preserve evidence and follow escalation contacts.",
    "4. Complete any required acknowledgments after reading.",
    "",
    "## Related notes",
    `- Document type: \`${def.document_type}\``,
    `- Category: \`${def.categoryKey}\``,
    `- Campus scope: church-wide (all campuses)`,
    "",
    "## Revision",
    "Demo seed version 1.0 — for training and UI validation only.",
  ].join("\n");
}

/**
 * Seeds 50 church-wide policy/procedure documents covering every
 * document_type and every default policy category.
 */
export async function seedPoliciesAndProcedures(
  ctx: DemoSeedContext,
): Promise<void> {
  log(ctx.summary, "Seeding 50 policies & procedures (church-wide)");

  const { error: catError } = await ctx.admin.rpc(
    "ensure_default_policy_categories",
    { p_church_id: ctx.churchId },
  );
  if (catError) {
    warn(
      ctx.summary,
      `ensure_default_policy_categories failed: ${catError.message}`,
    );
  }

  const { data: categories, error: listError } = await ctx.admin
    .from("policy_categories")
    .select("id, key")
    .eq("church_id", ctx.churchId);

  if (listError || !categories?.length) {
    warn(
      ctx.summary,
      `Unable to load policy categories: ${listError?.message ?? "none found"}`,
    );
    return;
  }

  const categoryIdByKey = new Map(
    categories.map((c) => [String(c.key), String(c.id)]),
  );

  const today = new Date();
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const reviewDue = new Date(today);
  reviewDue.setMonth(reviewDue.getMonth() + 12);

  const ownerId = ctx.ownerUserId;
  const defs = buildPolicyDefs();

  for (const def of defs) {
    const categoryId = categoryIdByKey.get(def.categoryKey) ?? null;
    if (!categoryId) {
      warn(ctx.summary, `Missing category ${def.categoryKey} for ${def.seedKey}`);
    }

    const content = markdownBody(def);
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const published =
      def.status === "published"
        ? {
            status: "published" as const,
            published_by: ownerId,
            published_at: today.toISOString(),
          }
        : {
            status: def.status,
            published_by: null as string | null,
            published_at: null as string | null,
          };

    const docPayload = {
      church_id: ctx.churchId,
      campus_id: null, // church-wide → all campuses
      category_id: categoryId,
      document_type: def.document_type,
      title: def.title,
      slug: def.slug,
      summary: `Church-wide ${TYPE_LABEL[def.document_type].toLowerCase()} for ${CATEGORY_LABEL[def.categoryKey]} (demo).`,
      ...published,
      owner_user_id: ownerId,
      created_by: ownerId,
      updated_by: ownerId,
      effective_date: ymd(today),
      review_due_date: ymd(reviewDue),
      requires_acknowledgment: def.requires_acknowledgment,
      acknowledgment_due_days: def.requires_acknowledgment ? 14 : null,
      reacknowledge_on_publish: true,
      is_emergency_document: def.is_emergency_document,
      is_featured: def.seedKey === "policy.01" || def.is_emergency_document,
      mobile_available: true,
      offline_mobile_allowed: def.is_emergency_document,
      audience_scope: def.audience_scope,
      minimum_role: "viewer",
      metadata: {
        is_test_data: true,
        seed_source: ctx.seedSource,
        seed_key: def.seedKey,
      },
      updated_at: today.toISOString(),
    };

    const existingDocId = await getRegisteredId(
      ctx.admin,
      ctx.seedSource,
      def.seedKey,
    );

    let documentId: string;
    let created = false;

    if (existingDocId) {
      const { error } = await ctx.admin
        .from("policy_documents")
        .update(docPayload)
        .eq("id", existingDocId);
      if (error) {
        warn(ctx.summary, `Policy update ${def.seedKey}: ${error.message}`);
        continue;
      }
      documentId = existingDocId;
      await track(ctx.summary, "policy_documents", "updated", `Updated ${def.title}`);
    } else {
      const { data, error } = await ctx.admin
        .from("policy_documents")
        .insert({ ...docPayload, created_at: today.toISOString() })
        .select("id")
        .single();
      if (error || !data?.id) {
        warn(
          ctx.summary,
          `Policy insert ${def.seedKey}: ${error?.message ?? "unknown"}`,
        );
        continue;
      }
      documentId = String(data.id);
      created = true;
      await registerSeedRecord({
        admin: ctx.admin,
        seedSource: ctx.seedSource,
        entityTable: "policy_documents",
        entityId: documentId,
        seedKey: def.seedKey,
        metadata: {
          document_type: def.document_type,
          category_key: def.categoryKey,
          campus_scope: "church_wide",
        },
      });
      await track(ctx.summary, "policy_documents", "created", `Created ${def.title}`);
    }

    ctx.ids.set(def.seedKey, documentId);

    const versionKey = `${def.seedKey}.version.1`;
    const versionStatus =
      def.status === "published"
        ? "published"
        : def.status === "under_review"
          ? "under_review"
          : def.status === "approved"
            ? "approved"
            : "draft";

    const versionPayload = {
      church_id: ctx.churchId,
      policy_document_id: documentId,
      version_number: 1,
      version_label: "1.0",
      title_snapshot: def.title,
      summary_snapshot: docPayload.summary,
      content,
      content_format: "markdown",
      change_summary: "Demo seed initial version",
      created_by: ownerId,
      status: versionStatus,
      word_count: wordCount,
      published_at: def.status === "published" ? today.toISOString() : null,
      approved_by: def.status === "published" || def.status === "approved" ? ownerId : null,
      approved_at:
        def.status === "published" || def.status === "approved"
          ? today.toISOString()
          : null,
    };

    const existingVersionId = await getRegisteredId(
      ctx.admin,
      ctx.seedSource,
      versionKey,
    );

    let versionId: string;
    if (existingVersionId) {
      const { error } = await ctx.admin
        .from("policy_versions")
        .update(versionPayload)
        .eq("id", existingVersionId);
      if (error) {
        warn(ctx.summary, `Policy version update ${versionKey}: ${error.message}`);
        continue;
      }
      versionId = existingVersionId;
      await track(ctx.summary, "policy_versions", "updated", `Updated version ${versionKey}`);
    } else {
      const { data, error } = await ctx.admin
        .from("policy_versions")
        .insert(versionPayload)
        .select("id")
        .single();
      if (error || !data?.id) {
        warn(
          ctx.summary,
          `Policy version insert ${versionKey}: ${error?.message ?? "unknown"}`,
        );
        continue;
      }
      versionId = String(data.id);
      await registerSeedRecord({
        admin: ctx.admin,
        seedSource: ctx.seedSource,
        entityTable: "policy_versions",
        entityId: versionId,
        seedKey: versionKey,
      });
      await track(ctx.summary, "policy_versions", "created", `Created version ${versionKey}`);
    }

    const { error: linkError } = await ctx.admin
      .from("policy_documents")
      .update({
        current_version_id: versionId,
        updated_by: ownerId,
        updated_at: today.toISOString(),
      })
      .eq("id", documentId);

    if (linkError) {
      warn(
        ctx.summary,
        `Policy current_version link ${def.seedKey}: ${linkError.message}`,
      );
    }

    // Best-effort search refresh (ignore if RPC unavailable)
    await ctx.admin.rpc("refresh_policy_document_search", {
      p_document_id: documentId,
    });

    void created;
  }

  log(ctx.summary, "Finished policies & procedures seed");
}
