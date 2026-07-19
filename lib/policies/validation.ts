import {
  POLICY_AUDIENCE_SCOPES,
  POLICY_DOCUMENT_TYPES,
  POLICY_MINIMUM_ROLES,
} from "@/lib/policies/constants";
import type {
  PolicyActionState,
  PolicyAudienceScope,
  PolicyDocumentType,
} from "@/lib/policies/types";
import type { MembershipRole } from "@/lib/church/types";

function text(formData: FormData, key: string, max: number): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  return raw.slice(0, max);
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function parseDate(formData: FormData, key: string): string | null {
  const value = text(formData, key, 32);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "__invalid__";
  return value;
}

function checkbox(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

export type PolicyFormInput = {
  title: string;
  document_type: PolicyDocumentType;
  category_id: string | null;
  campus_id: string | null;
  summary: string | null;
  content: string;
  change_summary: string | null;
  audience_scope: PolicyAudienceScope;
  minimum_role: MembershipRole;
  requires_acknowledgment: boolean;
  acknowledgment_due_days: number | null;
  reacknowledge_on_publish: boolean;
  is_emergency_document: boolean;
  is_featured: boolean;
  mobile_available: boolean;
  offline_mobile_allowed: boolean;
  effective_date: string | null;
  review_due_date: string | null;
  tags: string[];
};

export function validatePolicyForm(
  formData: FormData,
): PolicyActionState & { data?: PolicyFormInput } {
  const fieldErrors: Record<string, string> = {};

  const title = text(formData, "title", 200);
  if (!title) {
    fieldErrors.title = "Title is required.";
  }

  const documentTypeRaw = text(formData, "document_type", 64) ?? "";
  if (!POLICY_DOCUMENT_TYPES.some((item) => item.value === documentTypeRaw)) {
    fieldErrors.document_type = "Select a valid document type.";
  }

  const audienceRaw = text(formData, "audience_scope", 64) ?? "all_members";
  if (!POLICY_AUDIENCE_SCOPES.some((item) => item.value === audienceRaw)) {
    fieldErrors.audience_scope = "Select a valid audience.";
  }

  const minimumRoleRaw = text(formData, "minimum_role", 40) ?? "viewer";
  if (!POLICY_MINIMUM_ROLES.some((item) => item.value === minimumRoleRaw)) {
    fieldErrors.minimum_role = "Select a valid minimum role.";
  }

  const content = String(formData.get("content") ?? "");
  if (content.length > 500000) {
    fieldErrors.content = "Content is too long.";
  }

  const categoryRaw = text(formData, "category_id", 64);
  let category_id: string | null = null;
  if (categoryRaw) {
    if (!isValidUuid(categoryRaw)) {
      fieldErrors.category_id = "Invalid category selection.";
    } else {
      category_id = categoryRaw;
    }
  }

  const campusRaw = text(formData, "campus_id", 64);
  let campus_id: string | null = null;
  if (campusRaw) {
    if (!isValidUuid(campusRaw)) {
      fieldErrors.campus_id = "Invalid campus selection.";
    } else {
      campus_id = campusRaw;
    }
  }

  const effective_date = parseDate(formData, "effective_date");
  if (effective_date === "__invalid__") {
    fieldErrors.effective_date = "Enter a valid date.";
  }
  const review_due_date = parseDate(formData, "review_due_date");
  if (review_due_date === "__invalid__") {
    fieldErrors.review_due_date = "Enter a valid date.";
  }

  const requires_acknowledgment = checkbox(formData, "requires_acknowledgment");
  let acknowledgment_due_days: number | null = null;
  const dueRaw = text(formData, "acknowledgment_due_days", 8);
  if (dueRaw) {
    const due = Number(dueRaw);
    if (!Number.isInteger(due) || due < 1 || due > 365) {
      fieldErrors.acknowledgment_due_days =
        "Enter a due period between 1 and 365 days.";
    } else {
      acknowledgment_due_days = due;
    }
  } else if (requires_acknowledgment) {
    acknowledgment_due_days = 14;
  }

  const tagsRaw = text(formData, "tags", 500) ?? "";
  const tags = tagsRaw
    ? Array.from(
        new Set(
          tagsRaw
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 20),
        ),
      )
    : [];

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  return {
    data: {
      title: title!,
      document_type: documentTypeRaw as PolicyDocumentType,
      category_id,
      campus_id,
      summary: text(formData, "summary", 2000),
      content,
      change_summary: text(formData, "change_summary", 4000),
      audience_scope: audienceRaw as PolicyAudienceScope,
      minimum_role: minimumRoleRaw as MembershipRole,
      requires_acknowledgment,
      acknowledgment_due_days,
      reacknowledge_on_publish: checkbox(formData, "reacknowledge_on_publish"),
      is_emergency_document: checkbox(formData, "is_emergency_document"),
      is_featured: checkbox(formData, "is_featured"),
      mobile_available: checkbox(formData, "mobile_available"),
      offline_mobile_allowed: checkbox(formData, "offline_mobile_allowed"),
      effective_date: effective_date === "__invalid__" ? null : effective_date,
      review_due_date:
        review_due_date === "__invalid__" ? null : review_due_date,
      tags,
    },
  };
}

export function validateWorkflowNotes(
  formData: FormData,
  required = false,
): PolicyActionState & { notes?: string | null } {
  const notes = text(formData, "notes", 4000);
  if (required && !notes) {
    return { fieldErrors: { notes: "Notes are required." } };
  }
  return { notes: notes ?? null };
}
