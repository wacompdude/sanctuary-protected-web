import type {
  PolicyDocumentStatus,
  PolicyVersionStatus,
  PolicyWorkflowAction,
} from "@/lib/policies/types";

const DOCUMENT_TRANSITIONS: Record<
  PolicyDocumentStatus,
  Partial<Record<PolicyWorkflowAction, PolicyDocumentStatus>>
> = {
  draft: {
    submit: "under_review",
  },
  under_review: {
    request_changes: "changes_requested",
    approve: "approved",
  },
  changes_requested: {
    submit: "under_review",
  },
  approved: {
    publish: "published",
    request_changes: "changes_requested",
  },
  published: {
    start_revision: "draft",
    retire: "retired",
    archive: "archived",
  },
  retired: {
    restore: "draft",
    archive: "archived",
  },
  archived: {
    restore: "draft",
  },
};

const VERSION_STATUS_FOR_ACTION: Partial<
  Record<PolicyWorkflowAction, PolicyVersionStatus>
> = {
  submit: "under_review",
  request_changes: "changes_requested",
  approve: "approved",
  publish: "published",
  start_revision: "draft",
};

export function allowedWorkflowActions(
  status: PolicyDocumentStatus,
): PolicyWorkflowAction[] {
  return Object.keys(DOCUMENT_TRANSITIONS[status] ?? {}) as PolicyWorkflowAction[];
}

export function canPerformWorkflowAction(
  status: PolicyDocumentStatus,
  action: PolicyWorkflowAction,
): boolean {
  return allowedWorkflowActions(status).includes(action);
}

export function nextDocumentStatus(
  status: PolicyDocumentStatus,
  action: PolicyWorkflowAction,
): PolicyDocumentStatus | null {
  return DOCUMENT_TRANSITIONS[status]?.[action] ?? null;
}

export function nextVersionStatus(
  action: PolicyWorkflowAction,
): PolicyVersionStatus | null {
  return VERSION_STATUS_FOR_ACTION[action] ?? null;
}

export function isEditableVersionStatus(status: PolicyVersionStatus): boolean {
  return (
    status === "draft" ||
    status === "under_review" ||
    status === "changes_requested" ||
    status === "approved"
  );
}

export function labelForWorkflowAction(action: PolicyWorkflowAction): string {
  switch (action) {
    case "submit":
      return "Submit for review";
    case "request_changes":
      return "Request changes";
    case "approve":
      return "Approve";
    case "publish":
      return "Publish";
    case "retire":
      return "Retire";
    case "archive":
      return "Archive";
    case "restore":
      return "Restore to draft";
    case "start_revision":
      return "Start revision";
    default:
      return action;
  }
}
