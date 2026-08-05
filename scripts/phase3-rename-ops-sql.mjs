import fs from "fs";

const files = [
  "supabase/migrations/ops_delete_user_by_email.sql",
  "supabase/migrations/ops_diagnose_profile_load.sql",
];

const MAP = [
  ["church_membership_roles", "organization_membership_roles"],
  ["church_entitlement_overrides", "organization_entitlement_overrides"],
  ["church_notification_settings", "organization_notification_settings"],
  ["church_schedule_settings", "organization_schedule_settings"],
  ["church_policy_settings", "organization_policy_settings"],
  ["church_threat_levels", "organization_threat_levels"],
  ["church_subscriptions", "organization_subscriptions"],
  ["church_memberships", "organization_memberships"],
  ["church_invitations", "organization_invitations"],
  ["church_contacts", "organization_contacts"],
  ["church_role_settings", "organization_role_settings"],
  ["training_church_settings", "training_organization_settings"],
  ["churches", "organizations"],
];

for (const file of files) {
  let src = fs.readFileSync(file, "utf8");
  const original = src;
  for (const [oldName, newName] of MAP) {
    src = src.replace(new RegExp(`\\b${oldName}\\b`, "g"), newName);
  }
  if (src !== original) {
    fs.writeFileSync(file, src);
    console.log("Updated", file);
  } else {
    console.log("No change", file);
  }
}
