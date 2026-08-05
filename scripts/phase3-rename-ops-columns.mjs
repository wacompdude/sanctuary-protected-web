/**
 * Update ops SQL scripts for organization_id columns after 072.
 * Keeps p_church_id / requested_church_id / v_church_id variable names
 * only where they are PL/pgSQL locals that we choose to rename consistently.
 *
 * For ops scripts we rename columns AND locals to organization_id for clarity,
 * matching what 072 did to function bodies (locals renamed; RPC params kept).
 */
import fs from "fs";

const files = [
  "supabase/migrations/ops_delete_user_by_email.sql",
  "supabase/migrations/ops_diagnose_profile_load.sql",
];

for (const file of files) {
  let src = fs.readFileSync(file, "utf8");
  const original = src;

  // Protect RPC-style names if any appear
  src = src.split("p_church_id").join("__KEEP_P_CHURCH_ID__");
  src = src.split("requested_church_id").join("__KEEP_REQUESTED_CHURCH_ID__");
  src = src.split("user_church_id").join("__KEEP_USER_CHURCH_ID__");
  src = src.split("church_id_from_").join("__KEEP_CHURCH_ID_FROM__");

  // Longer first
  src = src.split("church_membership_id").join("organization_membership_id");
  src = src.split("church_id").join("organization_id");

  src = src.split("__KEEP_P_CHURCH_ID__").join("p_church_id");
  src = src.split("__KEEP_REQUESTED_CHURCH_ID__").join("requested_church_id");
  src = src.split("__KEEP_USER_CHURCH_ID__").join("user_church_id");
  src = src.split("__KEEP_CHURCH_ID_FROM__").join("church_id_from_");

  if (src !== original) {
    fs.writeFileSync(file, src);
    console.log("Updated", file);
  } else {
    console.log("No change", file);
  }
}
