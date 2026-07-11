import type { ActionState } from "@/lib/church/types";

function isNonEmptyString(value: FormDataEntryValue | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateCreateCertificationInput(
  formData: FormData,
): ActionState {
  const fieldErrors: Record<string, string> = {};

  const teamMemberId = formData.get("team_member_id");
  const certificationType = formData.get("certification_type");
  const issuer = formData.get("issuer");
  const issueDate = formData.get("issue_date");
  const expirationDate = formData.get("expiration_date");
  const certificateNumber = formData.get("certificate_number");

  if (!isNonEmptyString(teamMemberId)) {
    fieldErrors.team_member_id = "Team member is required.";
  }

  if (!isNonEmptyString(certificationType)) {
    fieldErrors.certification_type = "Certification type is required.";
  } else if (certificationType.trim().length > 200) {
    fieldErrors.certification_type =
      "Certification type must be 200 characters or fewer.";
  }

  if (!isNonEmptyString(issuer)) {
    fieldErrors.issuer = "Issuer is required.";
  } else if (issuer.trim().length > 200) {
    fieldErrors.issuer = "Issuer must be 200 characters or fewer.";
  }

  if (!isNonEmptyString(issueDate)) {
    fieldErrors.issue_date = "Issue date is required.";
  } else if (Number.isNaN(Date.parse(issueDate))) {
    fieldErrors.issue_date = "Issue date is invalid.";
  }

  if (!isNonEmptyString(expirationDate)) {
    fieldErrors.expiration_date = "Expiration date is required.";
  } else if (Number.isNaN(Date.parse(expirationDate))) {
    fieldErrors.expiration_date = "Expiration date is invalid.";
  }

  if (
    isNonEmptyString(issueDate) &&
    isNonEmptyString(expirationDate) &&
    !Number.isNaN(Date.parse(issueDate)) &&
    !Number.isNaN(Date.parse(expirationDate)) &&
    new Date(expirationDate) < new Date(issueDate)
  ) {
    fieldErrors.expiration_date =
      "Expiration date must be on or after the issue date.";
  }

  if (!isNonEmptyString(certificateNumber)) {
    fieldErrors.certificate_number = "Certificate number is required.";
  } else if (certificateNumber.trim().length > 100) {
    fieldErrors.certificate_number =
      "Certificate number must be 100 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, error: "Please fix the highlighted fields." };
  }

  return {};
}

export function parseCreateCertificationInput(formData: FormData) {
  return {
    team_member_id: (formData.get("team_member_id") as string).trim(),
    certification_type: (formData.get("certification_type") as string).trim(),
    issuer: (formData.get("issuer") as string).trim(),
    issue_date: formData.get("issue_date") as string,
    expiration_date: formData.get("expiration_date") as string,
    certificate_number: (formData.get("certificate_number") as string).trim(),
  };
}

export function validateCreateTeamMemberInput(formData: FormData): ActionState {
  const fieldErrors: Record<string, string> = {};
  const fullName = formData.get("full_name");
  const email = formData.get("email");
  const title = formData.get("title");

  if (!isNonEmptyString(fullName)) {
    fieldErrors.full_name = "Full name is required.";
  } else if (fullName.trim().length > 200) {
    fieldErrors.full_name = "Full name must be 200 characters or fewer.";
  }

  if (typeof email === "string" && email.trim().length > 0) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      fieldErrors.email = "Email is invalid.";
    }
  }

  if (typeof title === "string" && title.trim().length > 200) {
    fieldErrors.title = "Title must be 200 characters or fewer.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, error: "Please fix the highlighted fields." };
  }

  return {};
}

export function parseCreateTeamMemberInput(formData: FormData) {
  const email = ((formData.get("email") as string) || "").trim();
  const title = ((formData.get("title") as string) || "").trim();

  return {
    full_name: (formData.get("full_name") as string).trim(),
    email: email || null,
    title: title || null,
  };
}
