import type { MembershipRole } from "@/lib/church/types";
import type {
  PolicyAcknowledgmentStatus,
  PolicyAttachmentType,
  PolicyAudienceScope,
  PolicyDocumentStatus,
  PolicyDocumentType,
} from "@/lib/policies/types";

export const POLICY_DOCUMENT_TYPES: {
  value: PolicyDocumentType;
  label: string;
}[] = [
  { value: "policy", label: "Policy" },
  { value: "procedure", label: "Procedure" },
  {
    value: "standard_operating_procedure",
    label: "Standard Operating Procedure",
  },
  { value: "emergency_plan", label: "Emergency Plan" },
  { value: "checklist", label: "Checklist" },
  { value: "guideline", label: "Guideline" },
  { value: "training_document", label: "Training Document" },
  { value: "reference", label: "Reference" },
  { value: "form", label: "Form" },
  { value: "other", label: "Other" },
];

export const POLICY_DOCUMENT_STATUSES: {
  value: PolicyDocumentStatus;
  label: string;
}[] = [
  { value: "draft", label: "Draft" },
  { value: "under_review", label: "Under review" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "approved", label: "Approved" },
  { value: "published", label: "Published" },
  { value: "retired", label: "Retired" },
  { value: "archived", label: "Archived" },
];

export const POLICY_AUDIENCE_SCOPES: {
  value: PolicyAudienceScope;
  label: string;
}[] = [
  { value: "all_members", label: "All members" },
  { value: "security_team", label: "Security team" },
  { value: "security_leadership", label: "Security leadership" },
  { value: "administrators", label: "Administrators" },
  { value: "custom", label: "Custom assignment" },
];

export const POLICY_MINIMUM_ROLES: {
  value: MembershipRole;
  label: string;
}[] = [
  { value: "viewer", label: "Viewer" },
  { value: "security_member", label: "Security member" },
  { value: "security_leader", label: "Security leader" },
  { value: "administrator", label: "Administrator" },
  { value: "co_owner", label: "Co-owner" },
  { value: "owner", label: "Owner" },
];

export const POLICY_MIGRATION_HINT =
  "Policies & Procedures is not configured yet. Run supabase/migrations/033_policy_management.sql in the Supabase SQL Editor.";

export const DEFAULT_POLICY_PAGE_SIZE = 24;
export const DEFAULT_POLICY_MANAGE_PAGE_SIZE = 25;

export const POLICY_ATTACHMENT_TYPES: {
  value: PolicyAttachmentType;
  label: string;
}[] = [
  { value: "supporting", label: "Supporting" },
  { value: "form", label: "Form" },
  { value: "checklist", label: "Checklist" },
  { value: "image", label: "Image" },
  { value: "reference", label: "Reference" },
  { value: "other", label: "Other" },
];

export const POLICY_ACKNOWLEDGMENT_STATUSES: {
  value: PolicyAcknowledgmentStatus;
  label: string;
}[] = [
  { value: "assigned", label: "Assigned" },
  { value: "viewed", label: "Viewed" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "overdue", label: "Overdue" },
  { value: "waived", label: "Waived" },
];

export function labelForPolicyAttachmentType(value: string): string {
  return (
    POLICY_ATTACHMENT_TYPES.find((item) => item.value === value)?.label ??
    value
  );
}

export function labelForPolicyAcknowledgmentStatus(value: string): string {
  return (
    POLICY_ACKNOWLEDGMENT_STATUSES.find((item) => item.value === value)
      ?.label ?? value
  );
}

export function formatPolicyByteSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isPolicyImageMime(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType?.startsWith("image/"));
}

export function labelForPolicyDocumentType(value: string): string {
  return (
    POLICY_DOCUMENT_TYPES.find((item) => item.value === value)?.label ?? value
  );
}

export function labelForPolicyDocumentStatus(value: string): string {
  return (
    POLICY_DOCUMENT_STATUSES.find((item) => item.value === value)?.label ??
    value
  );
}

export function estimateReadTimeMinutes(wordCount: number | null | undefined) {
  if (!wordCount || wordCount <= 0) return null;
  return Math.max(1, Math.ceil(wordCount / 200));
}

export function policyMigrationHintFromError(message: string): string | null {
  if (
    /policy_documents|policy_versions|policy_categories|PGRST205|42P01|does not exist/i.test(
      message,
    )
  ) {
    return POLICY_MIGRATION_HINT;
  }
  return null;
}
