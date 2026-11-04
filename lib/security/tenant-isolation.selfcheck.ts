/**
 * Stage 3A — security-group tenant isolation self-check (no network / no DB).
 * Run: npx --yes tsx lib/security/tenant-isolation.selfcheck.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isSecurityGroupMembershipInOrganization,
  isSecurityGroupPermissionInOrganization,
} from "@/lib/security/tenant-isolation";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const USER = "user-a";

function main() {
  // Test 9 / cross-org membership: Org B group must not authorize Org A evaluation.
  assert(
    !isSecurityGroupMembershipInOrganization({
      userId: USER,
      organizationId: ORG_A,
      membershipOrganizationId: ORG_B,
      groupOrganizationId: ORG_B,
      groupStatus: "active",
      membershipStatus: "active",
    }),
    "1 cross-org membership denied",
  );

  assert(
    isSecurityGroupMembershipInOrganization({
      userId: USER,
      organizationId: ORG_A,
      membershipOrganizationId: ORG_A,
      groupOrganizationId: ORG_A,
      groupStatus: "active",
      membershipStatus: "active",
    }),
    "2 same-org membership allowed",
  );

  assert(
    !isSecurityGroupMembershipInOrganization({
      userId: USER,
      organizationId: ORG_A,
      membershipOrganizationId: ORG_A,
      groupOrganizationId: ORG_B,
      groupStatus: "active",
      membershipStatus: "active",
    }),
    "3 mismatched group org denied",
  );

  assert(
    !isSecurityGroupMembershipInOrganization({
      userId: USER,
      organizationId: ORG_A,
      membershipOrganizationId: ORG_A,
      groupOrganizationId: ORG_A,
      groupStatus: "inactive",
      membershipStatus: "active",
    }),
    "4 inactive group denied",
  );

  assert(
    !isSecurityGroupPermissionInOrganization({
      evaluationOrganizationId: ORG_A,
      groupOrganizationId: ORG_B,
      groupStatus: "active",
      permissionEffect: "grant",
    }),
    "5 cross-org permission grant denied",
  );

  assert(
    isSecurityGroupPermissionInOrganization({
      evaluationOrganizationId: ORG_A,
      groupOrganizationId: ORG_A,
      groupStatus: "active",
      permissionEffect: "grant",
    }),
    "6 same-org permission grant allowed",
  );

  const authz = readFileSync(
    join(process.cwd(), "lib/security/authorization.ts"),
    "utf8",
  );
  assert(
    authz.includes('.eq("organization_id", orgId)'),
    "7 getGroupPermissions filters membership organization_id",
  );
  assert(
    authz.includes('isSecurityGroupMembershipInOrganization'),
    "8 authorization uses membership org helper",
  );
  assert(
    authz.includes('isSecurityGroupPermissionInOrganization'),
    "9 authorization uses permission org helper",
  );
  assert(
    authz.includes('security_groups!inner'),
    "10 authorization joins security_groups for org proof",
  );

  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/117_security_group_tenant_isolation.sql",
    ),
    "utf8",
  );
  assert(
    migration.includes("DROP POLICY IF EXISTS \"security_groups_authenticated\""),
    "11 migration drops broad security_groups SELECT policy",
  );
  assert(
    migration.includes("DROP POLICY IF EXISTS \"security_group_members_admin_insert\""),
    "12 migration drops broad membership INSERT policy",
  );
  assert(
    migration.includes("is_active_organization_member"),
    "13 migration uses org membership helper",
  );
  assert(
    migration.includes("can_manage_organization_security_groups"),
    "14 migration adds manage helper",
  );
  assert(
    migration.includes("REVOKE INSERT ON public.security_audit_logs FROM authenticated"),
    "15 migration revokes authenticated audit INSERT",
  );
  assert(
    !/USING \(auth\.role\(\) = 'authenticated'::text\)/.test(
      migration.replace(/DROP POLICY[\s\S]*?;/g, ""),
    ),
    "16 migration does not recreate authenticated-wide USING policies",
  );

  console.log("security-group tenant isolation self-check passed");
}

main();
