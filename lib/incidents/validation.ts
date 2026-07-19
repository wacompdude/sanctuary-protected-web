import { parseChurchDateTimeLocal } from "@/lib/datetime/format";
import {
  INCIDENT_SEVERITY_SET,
  INCIDENT_STATUS_SET,
  INCIDENT_TYPE_SET,
} from "./constants";
import type { ActionState } from "./types";

function isNonEmptyString(value: FormDataEntryValue | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export type CreateIncidentValidationOptions = {
  requireLocation?: boolean;
  requireSeverity?: boolean;
};

export type IncidentUpdateValidationOptions = {
  requireFollowUpNotes?: boolean;
  nextStatus?: string | null;
  closingStatuses?: string[];
};

export type CreateIncidentParseOptions = {
  timeZone?: string | null;
};

export function validateCreateIncidentInput(
  formData: FormData,
  options: CreateIncidentValidationOptions & CreateIncidentParseOptions = {},
): ActionState {
  const requireLocation = options.requireLocation !== false;
  const requireSeverity = options.requireSeverity !== false;
  const fieldErrors: Record<string, string> = {};

  const title = formData.get("title");
  const type = formData.get("type");
  const severity = formData.get("severity");
  const location = formData.get("location");
  const occurredAt = formData.get("occurred_at");
  const description = formData.get("description");

  if (!isNonEmptyString(title)) {
    fieldErrors.title = "Title is required.";
  } else if (title.trim().length > 200) {
    fieldErrors.title = "Title must be 200 characters or fewer.";
  }

  if (!isNonEmptyString(type) || !INCIDENT_TYPE_SET.has(type as never)) {
    fieldErrors.type = "A valid incident type is required.";
  }

  if (requireSeverity) {
    if (
      !isNonEmptyString(severity) ||
      !INCIDENT_SEVERITY_SET.has(severity as never)
    ) {
      fieldErrors.severity = "A valid severity is required.";
    }
  } else if (
    isNonEmptyString(severity) &&
    !INCIDENT_SEVERITY_SET.has(severity as never)
  ) {
    fieldErrors.severity = "A valid severity is required.";
  }

  if (requireLocation) {
    if (!isNonEmptyString(location)) {
      fieldErrors.location = "Location is required.";
    } else if (location.trim().length > 200) {
      fieldErrors.location = "Location must be 200 characters or fewer.";
    }
  } else if (isNonEmptyString(location) && location.trim().length > 200) {
    fieldErrors.location = "Location must be 200 characters or fewer.";
  }

  if (!isNonEmptyString(occurredAt)) {
    fieldErrors.occurred_at = "Occurred date and time is required.";
  } else if (!parseChurchDateTimeLocal(occurredAt, options.timeZone)) {
    fieldErrors.occurred_at = "Occurred date and time is invalid.";
  }

  if (typeof description === "string" && description.trim().length > 5000) {
    fieldErrors.description = "Description must be 5000 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, error: "Please fix the highlighted fields." };
  }

  return {};
}

export function validateIncidentUpdateInput(
  formData: FormData,
  options: IncidentUpdateValidationOptions = {},
): ActionState {
  const fieldErrors: Record<string, string> = {};
  const content = formData.get("content");
  const status = formData.get("status");

  const hasContent = isNonEmptyString(content);
  const hasStatus =
    typeof status === "string" &&
    status.length > 0 &&
    INCIDENT_STATUS_SET.has(status as never);

  if (!hasContent && !hasStatus) {
    return {
      error: "Add a comment or select a new status to post an update.",
    };
  }

  if (hasContent && content.trim().length > 5000) {
    fieldErrors.content = "Comment must be 5000 characters or fewer.";
  }

  if (
    typeof status === "string" &&
    status.length > 0 &&
    !INCIDENT_STATUS_SET.has(status as never)
  ) {
    fieldErrors.status = "Status is invalid.";
  }

  const closingStatuses = options.closingStatuses ?? ["resolved", "closed"];
  const nextStatus = options.nextStatus ?? (hasStatus ? String(status) : null);
  if (
    options.requireFollowUpNotes &&
    nextStatus &&
    closingStatuses.includes(nextStatus) &&
    !hasContent
  ) {
    fieldErrors.content =
      "Follow-up notes are required when resolving or closing an incident.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, error: "Please fix the highlighted fields." };
  }

  return {};
}

export function parseCreateIncidentInput(
  formData: FormData,
  options: CreateIncidentParseOptions = {},
) {
  const severityRaw = formData.get("severity");
  const locationRaw = formData.get("location");
  const occurredAtRaw = formData.get("occurred_at") as string;
  const occurredAt =
    parseChurchDateTimeLocal(occurredAtRaw, options.timeZone) ??
    new Date(occurredAtRaw);
  return {
    title: (formData.get("title") as string).trim(),
    type: formData.get("type") as string,
    severity: isNonEmptyString(severityRaw)
      ? severityRaw
      : "medium",
    location: isNonEmptyString(locationRaw) ? locationRaw.trim() : "Unspecified",
    description: ((formData.get("description") as string) || "").trim(),
    occurred_at: occurredAt.toISOString(),
  };
}

export function parseIncidentUpdateInput(formData: FormData) {
  const content = (formData.get("content") as string | null)?.trim() ?? "";
  const status = (formData.get("status") as string | null)?.trim() ?? "";

  return {
    content,
    status: status.length > 0 ? status : null,
  };
}
