import type { MembershipRole } from "@/lib/church/types";

export type PolicyDocumentType =
  | "policy"
  | "procedure"
  | "standard_operating_procedure"
  | "emergency_plan"
  | "checklist"
  | "guideline"
  | "training_document"
  | "reference"
  | "form"
  | "other";

export type PolicyDocumentStatus =
  | "draft"
  | "under_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "retired"
  | "archived";

export type PolicyVersionStatus =
  | "draft"
  | "under_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "superseded";

export type PolicyContentFormat = "markdown" | "rich_text_json" | "plain_text";

export type PolicyAudienceScope =
  | "all_members"
  | "security_team"
  | "security_leadership"
  | "administrators"
  | "custom";

export type PolicyCategory = {
  id: string;
  church_id: string;
  key: string;
  label: string;
  description: string | null;
  is_system: boolean;
  sort_order: number;
  archived_at: string | null;
};

export type PolicyVersion = {
  id: string;
  church_id: string;
  policy_document_id: string;
  version_number: number;
  version_label: string;
  title_snapshot: string;
  summary_snapshot: string | null;
  content: string;
  content_format: PolicyContentFormat;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
  submitted_for_review_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  superseded_at: string | null;
  status: PolicyVersionStatus;
  word_count: number;
  checksum: string | null;
};

export type PolicyDocument = {
  id: string;
  church_id: string;
  campus_id: string | null;
  category_id: string | null;
  document_type: PolicyDocumentType;
  title: string;
  slug: string;
  summary: string | null;
  status: PolicyDocumentStatus;
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
  requires_acknowledgment: boolean;
  acknowledgment_due_days: number | null;
  reacknowledge_on_publish: boolean;
  is_emergency_document: boolean;
  is_featured: boolean;
  mobile_available: boolean;
  offline_mobile_allowed: boolean;
  audience_scope: PolicyAudienceScope;
  minimum_role: MembershipRole | string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PolicyDocumentListItem = PolicyDocument & {
  category_label: string | null;
  category_key: string | null;
  version_label: string | null;
  version_number: number | null;
  campus_name: string | null;
  read_time_minutes: number | null;
  acknowledgment_status: string | null;
  tags: string[];
};

export type PolicyDocumentDetail = PolicyDocumentListItem & {
  current_version: PolicyVersion | null;
};

export type PolicyLibraryFilters = {
  q?: string;
  documentType?: PolicyDocumentType | "";
  categoryId?: string;
  campusId?: string;
  emergencyOnly?: boolean;
  acknowledgmentRequired?: boolean;
  featuredOnly?: boolean;
  mobileAvailable?: boolean;
  page?: number;
  pageSize?: number;
};

export type PolicyLibraryResult = {
  items: PolicyDocumentListItem[];
  total: number;
  page: number;
  pageSize: number;
  emergency: PolicyDocumentListItem[];
  featured: PolicyDocumentListItem[];
  recentlyUpdated: PolicyDocumentListItem[];
  myPendingAcknowledgments: number;
  tablesAvailable: boolean;
};

export type PolicyActionState = {
  error?: string | null;
  success?: boolean;
  fieldErrors?: Record<string, string>;
};

export type PolicyApprovalDecision =
  | "submitted"
  | "changes_requested"
  | "approved"
  | "published";

export type PolicyApproval = {
  id: string;
  church_id: string;
  policy_document_id: string;
  policy_version_id: string;
  decision: PolicyApprovalDecision;
  notes: string | null;
  actor_user_id: string;
  created_at: string;
};

export type PolicyManageFilters = {
  q?: string;
  status?: PolicyDocumentStatus | "";
  documentType?: PolicyDocumentType | "";
  categoryId?: string;
  campusId?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
};

export type PolicyManageResult = {
  items: PolicyDocumentListItem[];
  total: number;
  page: number;
  pageSize: number;
  tablesAvailable: boolean;
};

export type PolicyWorkflowAction =
  | "submit"
  | "request_changes"
  | "approve"
  | "publish"
  | "retire"
  | "archive"
  | "restore"
  | "start_revision";

export type PolicyAttachmentType =
  | "supporting"
  | "form"
  | "checklist"
  | "image"
  | "reference"
  | "other";

export type PolicyAttachment = {
  id: string;
  church_id: string;
  policy_document_id: string;
  policy_version_id: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  attachment_type: PolicyAttachmentType;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
  archived_at: string | null;
  signed_url?: string | null;
};

export type PolicyAcknowledgmentStatus =
  | "assigned"
  | "viewed"
  | "acknowledged"
  | "overdue"
  | "waived";

export type PolicyAcknowledgment = {
  id: string;
  church_id: string;
  policy_document_id: string;
  policy_version_id: string;
  user_id: string;
  membership_id: string | null;
  acknowledgment_status: PolicyAcknowledgmentStatus;
  assigned_at: string;
  due_at: string | null;
  viewed_at: string | null;
  acknowledged_at: string | null;
  acknowledgment_text: string | null;
  waived_by: string | null;
  waived_at: string | null;
  waiver_reason: string | null;
  created_at: string;
  updated_at: string;
  policy_title?: string | null;
  policy_version_label?: string | null;
  user_display_name?: string | null;
};

export type PolicyAssignmentType =
  | "all_members"
  | "role"
  | "security_team"
  | "campus"
  | "user";

export type PolicyAssignment = {
  id: string;
  church_id: string;
  policy_document_id: string;
  policy_version_id: string | null;
  assignment_type: PolicyAssignmentType;
  role: MembershipRole | string | null;
  campus_id: string | null;
  user_id: string | null;
  due_days: number | null;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  user_display_name?: string | null;
  campus_name?: string | null;
};

export type PolicyAcknowledgmentReport = {
  total: number;
  acknowledged: number;
  pending: number;
  overdue: number;
  waived: number;
  items: PolicyAcknowledgment[];
};
