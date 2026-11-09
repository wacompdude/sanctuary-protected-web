/**
 * Stage 3H-1 — Incident authorization matrix self-check.
 * Run: npx --yes tsx lib/incidents/authorization.selfcheck.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  canChangeIncidentStatus,
  canCreateIncident,
  canDeleteIncidentMedia,
  canUpdateIncident,
} from "@/lib/incidents/authorization";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const allowCreate = {
  allowSecurityMembersCreate: true,
  allowSecurityMembersClose: false,
};
const denyCreate = {
  allowSecurityMembersCreate: false,
  allowSecurityMembersClose: true,
};

assert(
  !canCreateIncident({ role: "viewer", policy: allowCreate }),
  "1 viewer cannot create",
);
assert(
  canCreateIncident({ role: "security_member", policy: allowCreate }),
  "2 security_member create when allowed",
);
assert(
  !canCreateIncident({ role: "security_member", policy: denyCreate }),
  "3 security_member create blocked by flag",
);
assert(
  canCreateIncident({ role: "security_leader", policy: denyCreate }),
  "4 leader can create even if member flag false",
);
assert(
  !canUpdateIncident({ role: "viewer", policy: allowCreate }),
  "5 viewer cannot update",
);
assert(
  canUpdateIncident({ role: "security_member", policy: allowCreate }),
  "6 member can update",
);
assert(
  !canChangeIncidentStatus(
    { role: "security_member", policy: allowCreate },
    "closed",
    "open",
  ),
  "7 member cannot close when flag false",
);
assert(
  canChangeIncidentStatus(
    { role: "security_member", policy: denyCreate },
    "closed",
    "open",
  ),
  "8 member can close when flag true",
);
assert(
  canChangeIncidentStatus(
    { role: "security_leader", policy: allowCreate },
    "resolved",
    "open",
  ),
  "9 leader can close",
);
assert(
  canDeleteIncidentMedia({
    role: "viewer",
    uploadedBy: "u1",
    actorUserId: "u1",
  }),
  "10 uploader can delete own media",
);
assert(
  !canDeleteIncidentMedia({
    role: "security_member",
    uploadedBy: "other",
    actorUserId: "u1",
  }),
  "11 member cannot delete others media",
);
assert(
  canDeleteIncidentMedia({
    role: "security_leader",
    uploadedBy: "other",
    actorUserId: "u1",
  }),
  "12 leader can delete others media",
);

const mig = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/119_incident_media_least_privilege.sql"),
  "utf8",
);
assert(mig.includes("can_create_organization_incident"), "13 migration create helper");
assert(mig.includes("can_update_organization_incident"), "14 migration update helper");
assert(mig.includes("can_delete_incident_media_object"), "15 migration storage delete helper");
assert(mig.includes("incidents_enforce_status_auth"), "16 status trigger");
assert(
  mig.includes("Members can delete incident media"),
  "17 storage delete policy name preserved",
);
assert(
  !mig.includes("is_active_organization_member(organization_id))\n  WITH CHECK (public.is_active_organization_member"),
  "18 update policy not membership-only",
);

const actions = fs.readFileSync(
  path.join(process.cwd(), "app/(app)/incidents/actions.ts"),
  "utf8",
);
assert(actions.includes("canCreateIncident"), "19 actions use create helper");
assert(actions.includes("canChangeIncidentStatus"), "20 actions use status helper");
assert(actions.includes("canDeleteIncidentMedia"), "21 actions use media delete helper");

console.log("incident authorization self-check passed");
